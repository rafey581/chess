/**
 * Chess games inside a match, following the FIDE Laws of Chess.
 *
 * - A match is a fixed number of games: 1 (BO1), 3 (BO3) or 5 (BO5). Each game is
 *   scored as in FIDE events: 1 for a win, ½ each for a draw, 0 for a loss. The match
 *   ends as soon as one player has more than half the available points.
 * - Colours for game 1 are decided by lot and then alternate.
 * - A match level after its regulation games (or a single drawn game in BO1) is decided
 *   by one Armageddon game, as FIDE uses for tie-breaks: white has more time, black
 *   draw odds, so a draw counts as a win for black. Every staked match therefore still
 *   has one winner for settlement.
 * - Draws: dead position, stalemate, fivefold repetition and the 75-move rule end a
 *   game automatically; threefold repetition and the fifty-move rule must be claimed by
 *   the player to move; a draw may be agreed after an offer.
 * - A flag fall loses, unless the opponent cannot checkmate by any series of legal
 *   moves, in which case the game is drawn (6.9). Resignation loses the game (5.1.2).
 */
import {
  canStillCheckmate,
  claimableDraw,
  findLegalMove,
  gameResult,
  inCheck,
  initialPosition,
  makeMove,
  positionKey,
  squareName,
  toFen,
  toSan,
  parseFen
} from './engine.js'
import type { ChessMoveInput, ChessPosition, ChessResult, DrawClaim, PromotionPiece } from './engine.js'
import { seededRandom } from '../rng.js'

/** Each player's clock for one regular game, in milliseconds. */
export const CHESS_CLOCK_MS = 5 * 60 * 1000
/** Added to a player's clock after each move they make (Fischer increment). */
export const CHESS_INCREMENT_MS = 3 * 1000
/** Armageddon tie-break clocks: white has more time, black has draw odds. */
export const ARMAGEDDON_WHITE_MS = 5 * 60 * 1000
export const ARMAGEDDON_BLACK_MS = 4 * 60 * 1000
/** Armageddon increment, which only starts with move 61 (as in FIDE World Cup tie-breaks). */
export const ARMAGEDDON_INCREMENT_MS = 2 * 1000
export const ARMAGEDDON_INCREMENT_FROM_MOVE = 61

export type ChessGameEnd =
  | ChessResult
  | DrawClaim
  | 'TIMEOUT'
  | 'DRAW_TIMEOUT_MATERIAL'
  | 'RESIGN'
  | 'DRAW_AGREED'

export interface ChessMoveRecord {
  san: string
  from: string
  to: string
  promotion?: PromotionPiece
  /** Position after the move. */
  fen: string
  bySeat: number
}

export interface ChessGameState {
  position: ChessPosition
  /** The seat playing white this game. */
  whiteSeat: number
  /** Repetition keys of every position reached, the starting one included. */
  history: string[]
  moves: ChessMoveRecord[]
  result: ChessGameEnd
  /** Seat that won the game, or null for a draw / a game still going. */
  winnerSeat: number | null
  /** Remaining clock per seat, in ms, as of the last move. */
  clocksMs: [number, number]
  /** True for the tie-break game: a draw counts as a win for black. */
  armageddon: boolean
  /** Seat whose draw offer is standing, or null. */
  drawOfferBy: number | null
  /** Per seat, how many moves that seat had made when it last offered a draw (-1: never). */
  lastOfferAtMove: [number, number]
}

export interface ChessMatchState {
  matchId: string
  matchType: string
  format: string
  /** Zero-based count of games started before the current one. */
  frameIndex: number
  /** Match points per seat: 1 a win, ½ a draw (the Armageddon game adds 1 to its winner). */
  framesWon: [number, number]
  /** Regulation games finished (the Armageddon game is not counted). */
  gamesPlayed: number
  draws: number
  /** Seat that won the Armageddon tie-break, once played. */
  armageddonWinner: number | null
  currentGame?: ChessGameState
}

/** Regulation games in a match. */
export function gamesInMatch(format: string): number {
  switch (format) {
    case 'BO3':
      return 3
    case 'BO5':
      return 5
    default:
      return 1
  }
}

/** Points that clinch the match: more than half of the regulation games. */
export function framesToWin(format: string): number {
  return Math.floor(gamesInMatch(format) / 2) + 1
}

export function createChessGame(whiteSeat = 0, clockMs = CHESS_CLOCK_MS): ChessGameState {
  const position = initialPosition()
  return {
    position,
    whiteSeat,
    history: [positionKey(position)],
    moves: [],
    result: 'PLAYING',
    winnerSeat: null,
    clocksMs: [clockMs, clockMs],
    armageddon: false,
    drawOfferBy: null,
    lastOfferAtMove: [-1, -1]
  }
}

/** Colours are decided by lot (seeded by the match id, so a rebuilt room agrees). */
export function drawLotForWhite(seed: string): number {
  return seededRandom(seed)() < 0.5 ? 0 : 1
}

export function createChessMatch(matchId: string, matchType: string, format: string): ChessMatchState {
  return {
    matchId,
    matchType,
    format,
    frameIndex: 0,
    framesWon: [0, 0],
    gamesPlayed: 0,
    draws: 0,
    armageddonWinner: null,
    currentGame: createChessGame(drawLotForWhite(`${matchId}:colours`))
  }
}

/** The seat whose turn it is. */
export function turnSeat(game: ChessGameState): number {
  return game.position.turn === 'w' ? game.whiteSeat : 1 - game.whiteSeat
}

export function seatColor(game: ChessGameState, seat: number): 'w' | 'b' {
  return seat === game.whiteSeat ? 'w' : 'b'
}

const movesBy = (game: ChessGameState, seat: number): number => game.moves.filter((m) => m.bySeat === seat).length

/** Increment due to `seat` for the move it is making now. */
export function incrementFor(game: ChessGameState, seat: number): number {
  if (!game.armageddon) return CHESS_INCREMENT_MS
  return movesBy(game, seat) + 1 >= ARMAGEDDON_INCREMENT_FROM_MOVE ? ARMAGEDDON_INCREMENT_MS : 0
}

/** Ends the game; in Armageddon a draw is scored as a win for black. */
function finish(game: ChessGameState, result: ChessGameEnd, winnerSeat: number | null): void {
  game.result = result
  game.winnerSeat = winnerSeat === null && game.armageddon ? 1 - game.whiteSeat : winnerSeat
  game.drawOfferBy = null
}

export interface MoveOutcome {
  ok: boolean
  error?: string
  record?: ChessMoveRecord
  ended?: boolean
}

/**
 * Plays a move for `seat`. Refuses anything out of turn or illegal; otherwise updates
 * the position, notation, repetition history and the mover's clock, and decides
 * whether the game is over. Making a move declines a draw the opponent offered (9.1.2.3).
 */
export function applyChessMove(
  game: ChessGameState,
  seat: number,
  input: ChessMoveInput,
  spentMs = 0,
  incrementMs: number = incrementFor(game, seat)
): MoveOutcome {
  if (game.result !== 'PLAYING') return { ok: false, error: 'game over' }
  if (turnSeat(game) !== seat) return { ok: false, error: 'not your turn' }
  const move = findLegalMove(game.position, input)
  if (!move) return { ok: false, error: 'illegal move' }
  const san = toSan(game.position, move)
  const next = makeMove(game.position, move)
  game.position = next
  game.history.push(positionKey(next))
  const record: ChessMoveRecord = {
    san,
    from: squareName(move.from),
    to: squareName(move.to),
    ...(move.promotion ? { promotion: move.promotion } : {}),
    fen: toFen(next),
    bySeat: seat
  }
  game.moves.push(record)
  if (game.drawOfferBy !== null && game.drawOfferBy !== seat) game.drawOfferBy = null
  const clocks = game.clocksMs
  clocks[seat] = Math.max(0, (clocks[seat] ?? 0) - Math.max(0, spentMs)) + incrementMs
  const result = gameResult(next, game.history)
  if (result !== 'PLAYING') {
    finish(game, result, result === 'CHECKMATE' ? seat : null)
    return { ok: true, record, ended: true }
  }
  return { ok: true, record, ended: false }
}

/**
 * Ends the game because `seat` ran out of time. It is lost, unless the opponent could
 * not checkmate by any series of legal moves, in which case it is drawn (6.9).
 */
export function applyTimeout(game: ChessGameState, seat: number): void {
  if (game.result !== 'PLAYING') return
  game.clocksMs[seat] = 0
  const opponent = 1 - seat
  const opponentColor = seatColor(game, opponent)
  if (canStillCheckmate(game.position.board, opponentColor)) finish(game, 'TIMEOUT', opponent)
  else finish(game, 'DRAW_TIMEOUT_MATERIAL', null)
}

/** `seat` resigns the game (5.1.2). */
export function applyResign(game: ChessGameState, seat: number): boolean {
  if (game.result !== 'PLAYING') return false
  finish(game, 'RESIGN', 1 - seat)
  return true
}

/** The draw the player to move could claim now, if any (9.2, 9.3). */
export function drawClaimFor(game: ChessGameState): DrawClaim | null {
  return game.result === 'PLAYING' ? claimableDraw(game.position, game.history) : null
}

/** The player to move claims a draw. Only a correct claim is accepted. */
export function applyDrawClaim(game: ChessGameState, seat: number): { ok: boolean; error?: string } {
  if (game.result !== 'PLAYING') return { ok: false, error: 'game over' }
  if (turnSeat(game) !== seat) return { ok: false, error: 'only the player to move can claim' }
  const claim = drawClaimFor(game)
  if (!claim) return { ok: false, error: 'no draw to claim' }
  finish(game, claim, null)
  return { ok: true }
}

/**
 * `seat` offers a draw (9.1.2). One standing offer at a time, and a player may not
 * repeat an offer before making another move, so offers cannot be used to pester.
 */
export function offerDraw(game: ChessGameState, seat: number): { ok: boolean; error?: string } {
  if (game.result !== 'PLAYING') return { ok: false, error: 'game over' }
  if (game.drawOfferBy !== null) return { ok: false, error: 'a draw offer is already standing' }
  const made = movesBy(game, seat)
  if (game.lastOfferAtMove[seat] === made) return { ok: false, error: 'make a move before offering again' }
  game.drawOfferBy = seat
  game.lastOfferAtMove[seat] = made
  return { ok: true }
}

/** The opponent accepts or declines a standing draw offer. */
export function respondToDraw(game: ChessGameState, seat: number, accept: boolean): { ok: boolean; error?: string } {
  if (game.result !== 'PLAYING') return { ok: false, error: 'game over' }
  if (game.drawOfferBy === null || game.drawOfferBy === seat) return { ok: false, error: 'no draw offer to answer' }
  if (accept) finish(game, 'DRAW_AGREED', null)
  else game.drawOfferBy = null
  return { ok: true }
}

/**
 * Records a finished game on the match. Returns true when the match is decided.
 */
export function applyGameWinner(match: ChessMatchState, winnerSeat: number | null, armageddon = false): boolean {
  if (armageddon) {
    if (winnerSeat === 0 || winnerSeat === 1) {
      match.armageddonWinner = winnerSeat
      match.framesWon[winnerSeat] += 1
    }
    return matchWinnerIndex(match) !== -1
  }
  match.gamesPlayed += 1
  if (winnerSeat === 0 || winnerSeat === 1) match.framesWon[winnerSeat] += 1
  else {
    match.draws += 1
    match.framesWon[0] += 0.5
    match.framesWon[1] += 0.5
  }
  return matchWinnerIndex(match) !== -1
}

/** The match winner's seat, or -1 while undecided. */
export function matchWinnerIndex(match: ChessMatchState): number {
  if (match.armageddonWinner !== null) return match.armageddonWinner
  const need = gamesInMatch(match.format) / 2
  if (match.framesWon[0] > need) return 0
  if (match.framesWon[1] > need) return 1
  return -1
}

/** Whether the next game is the Armageddon tie-break. */
export function needsArmageddon(match: ChessMatchState): boolean {
  return (
    match.armageddonWinner === null &&
    match.gamesPlayed >= gamesInMatch(match.format) &&
    match.framesWon[0] === match.framesWon[1]
  )
}

/** Starts the next game: colours alternate; a level match goes to Armageddon (colours by lot). */
export function nextGame(match: ChessMatchState): ChessGameState {
  match.frameIndex += 1
  if (needsArmageddon(match)) {
    const white = drawLotForWhite(`${match.matchId}:armageddon`)
    const game = createChessGame(white)
    game.armageddon = true
    game.clocksMs[white] = ARMAGEDDON_WHITE_MS
    game.clocksMs[1 - white] = ARMAGEDDON_BLACK_MS
    match.currentGame = game
    return game
  }
  const prevWhite = match.currentGame?.whiteSeat ?? 1
  match.currentGame = createChessGame(1 - prevWhite)
  return match.currentGame
}

/** What the client is sent: everything needed to draw the board, the clocks and the move list. */
export interface ChessSnapshot {
  fen: string
  whiteSeat: number
  turnSeat: number
  /** SAN of every move so far, white's first. */
  moves: string[]
  lastMove: { from: string; to: string } | null
  inCheck: boolean
  result: ChessGameEnd
  winnerSeat: number | null
  clocksMs: [number, number]
  armageddon: boolean
  drawOfferBy: number | null
  /** A draw the player to move may claim right now. */
  drawClaim: DrawClaim | null
}

export function chessSnapshot(game: ChessGameState): ChessSnapshot {
  const last = game.moves[game.moves.length - 1]
  return {
    fen: toFen(game.position),
    whiteSeat: game.whiteSeat,
    turnSeat: turnSeat(game),
    moves: game.moves.map((m) => m.san),
    lastMove: last ? { from: last.from, to: last.to } : null,
    inCheck: inCheck(game.position),
    result: game.result,
    winnerSeat: game.winnerSeat,
    clocksMs: [game.clocksMs[0], game.clocksMs[1]],
    armageddon: game.armageddon,
    drawOfferBy: game.drawOfferBy,
    drawClaim: drawClaimFor(game)
  }
}

/** Rebuilds a playable position from a snapshot (client side, for legal-move highlighting). */
export function positionFromSnapshot(snapshot: ChessSnapshot): ChessPosition {
  return parseFen(snapshot.fen)
}

/** True for every result that is a draw on the board (before Armageddon scoring). */
export function isDrawResult(result: ChessGameEnd): boolean {
  return result.startsWith('DRAW') || result === 'STALEMATE'
}

/** Human wording of how a game ended. */
export function describeGameEnd(result: ChessGameEnd): string {
  switch (result) {
    case 'CHECKMATE':
      return 'Checkmate'
    case 'STALEMATE':
      return 'Stalemate'
    case 'DRAW_MATERIAL':
      return 'Draw: neither side can checkmate'
    case 'DRAW_FIVEFOLD':
      return 'Draw by fivefold repetition'
    case 'DRAW_SEVENTY_FIVE_MOVE':
      return 'Draw by the 75-move rule'
    case 'DRAW_REPETITION':
      return 'Draw claimed: threefold repetition'
    case 'DRAW_FIFTY_MOVE':
      return 'Draw claimed: fifty-move rule'
    case 'DRAW_AGREED':
      return 'Draw agreed'
    case 'DRAW_TIMEOUT_MATERIAL':
      return 'Flag fell, but the opponent could not checkmate: draw'
    case 'TIMEOUT':
      return 'Lost on time'
    case 'RESIGN':
      return 'Resignation'
    default:
      return ''
  }
}
