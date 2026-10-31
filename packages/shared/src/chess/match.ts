/**
 * Chess games inside a match.
 *
 * A match keeps the platform's existing best-of formats (BO1 / BO3 / BO5): each chess
 * game takes the place a frame used to, and the first player to win the required
 * number of games wins the match and the stake. A drawn game scores nothing for either
 * player and is replayed with colours swapped, so every staked match still produces a
 * winner for settlement.
 */
import {
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
import type { ChessMoveInput, ChessPosition, ChessResult, PromotionPiece } from './engine.js'

/** Each player's clock for one game, in milliseconds. */
export const CHESS_CLOCK_MS = 5 * 60 * 1000
/** Added to a player's clock after each move they make (Fischer increment). */
export const CHESS_INCREMENT_MS = 3 * 1000

export type ChessGameEnd = ChessResult | 'TIMEOUT' | 'RESIGN'

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
}

export interface ChessMatchState {
  matchId: string
  matchType: string
  format: string
  /** Zero-based count of games started before the current one. */
  frameIndex: number
  framesWon: [number, number]
  draws: number
  currentGame?: ChessGameState
}

export function framesToWin(format: string): number {
  switch (format) {
    case 'BO1':
      return 1
    case 'BO3':
      return 2
    case 'BO5':
      return 3
    default:
      return 1
  }
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
    clocksMs: [clockMs, clockMs]
  }
}

export function createChessMatch(matchId: string, matchType: string, format: string): ChessMatchState {
  return {
    matchId,
    matchType,
    format,
    frameIndex: 0,
    framesWon: [0, 0],
    draws: 0,
    currentGame: createChessGame(0)
  }
}

/** The seat whose turn it is. */
export function turnSeat(game: ChessGameState): number {
  return game.position.turn === 'w' ? game.whiteSeat : 1 - game.whiteSeat
}

export function seatColor(game: ChessGameState, seat: number): 'w' | 'b' {
  return seat === game.whiteSeat ? 'w' : 'b'
}

export interface MoveOutcome {
  ok: boolean
  error?: string
  record?: ChessMoveRecord
  ended?: boolean
}

/**
 * Plays a move for `seat`. Refuses anything out of turn or illegal; otherwise updates
 * the position, notation, repetition history and (if given) the mover's clock, and
 * decides whether the game is over.
 */
export function applyChessMove(
  game: ChessGameState,
  seat: number,
  input: ChessMoveInput,
  spentMs = 0,
  incrementMs = CHESS_INCREMENT_MS
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
  const clocks = game.clocksMs
  clocks[seat] = Math.max(0, (clocks[seat] ?? 0) - Math.max(0, spentMs)) + incrementMs
  const result = gameResult(next, game.history)
  if (result !== 'PLAYING') {
    game.result = result
    game.winnerSeat = result === 'CHECKMATE' ? seat : null
    return { ok: true, record, ended: true }
  }
  return { ok: true, record, ended: false }
}

/** Ends the game because `seat` ran out of time (a draw if the opponent cannot possibly mate). */
export function applyTimeout(game: ChessGameState, seat: number): void {
  if (game.result !== 'PLAYING') return
  game.clocksMs[seat] = 0
  game.result = 'TIMEOUT'
  game.winnerSeat = 1 - seat
}

/**
 * Records a finished game on the match. Returns true when the match is decided.
 * A draw scores nothing; the next game is still started by `nextGame`.
 */
export function applyGameWinner(match: ChessMatchState, winnerSeat: number | null): boolean {
  if (winnerSeat === 0 || winnerSeat === 1) match.framesWon[winnerSeat] += 1
  else match.draws += 1
  return matchWinnerIndex(match) !== -1
}

export function matchWinnerIndex(match: ChessMatchState): number {
  const need = framesToWin(match.format)
  if (match.framesWon[0] >= need) return 0
  if (match.framesWon[1] >= need) return 1
  return -1
}

/** Starts the next game: colours alternate every game. */
export function nextGame(match: ChessMatchState): ChessGameState {
  const prevWhite = match.currentGame?.whiteSeat ?? 1
  match.frameIndex += 1
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
    clocksMs: [game.clocksMs[0], game.clocksMs[1]]
  }
}

/** Rebuilds a playable position from a snapshot (client side, for legal-move highlighting). */
export function positionFromSnapshot(snapshot: ChessSnapshot): ChessPosition {
  return parseFen(snapshot.fen)
}

/** Human wording of how a game ended. */
export function describeGameEnd(result: ChessGameEnd): string {
  switch (result) {
    case 'CHECKMATE':
      return 'Checkmate'
    case 'STALEMATE':
      return 'Stalemate'
    case 'DRAW_FIFTY_MOVE':
      return 'Draw by the fifty-move rule'
    case 'DRAW_REPETITION':
      return 'Draw by threefold repetition'
    case 'DRAW_MATERIAL':
      return 'Draw: insufficient material'
    case 'TIMEOUT':
      return 'Lost on time'
    case 'RESIGN':
      return 'Resignation'
    default:
      return ''
  }
}
