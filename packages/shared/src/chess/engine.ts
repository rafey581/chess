/**
 * Chess rules engine.
 *
 * Pure and deterministic: the same position and move always produce the same result,
 * so the server (the authority), the bot and the client (for highlighting legal moves)
 * all run this one file and cannot disagree about what is legal.
 *
 * Board: a 64-entry array, index 0 = a1, 7 = h1, 56 = a8, 63 = h8.
 * Pieces: FEN letters, upper case white (`PNBRQK`), lower case black (`pnbrqk`), or null.
 */

export type ChessColor = 'w' | 'b'
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
/** A FEN piece letter: upper case for white, lower case for black. */
export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface ChessPosition {
  board: Array<Piece | null>
  turn: ChessColor
  /** Castling rights in FEN order, a subset of "KQkq", or "" for none. */
  castling: string
  /** Square index a pawn may capture onto en passant, or -1. */
  epSquare: number
  /** Half-moves since the last capture or pawn move (fifty-move rule). */
  halfmove: number
  fullmove: number
}

/** A move as it travels on the wire: algebraic squares, plus the piece to promote to. */
export interface ChessMoveInput {
  from: string
  to: string
  promotion?: PromotionPiece
}

/** A fully resolved legal move. */
export interface ChessMove {
  from: number
  to: number
  piece: Piece
  captured?: Piece
  promotion?: PromotionPiece
  /** 'k' / 'q' for king-side / queen-side castling. */
  castle?: 'k' | 'q'
  enPassant?: boolean
}

/**
 * How a game stands after a move, following the FIDE Laws of Chess.
 *
 * Only the results the Laws apply automatically are produced by `gameResult`:
 * checkmate (5.1.1), stalemate (5.2.1), dead position (5.2.2), fivefold repetition
 * (9.6.1) and the 75-move rule (9.6.2). Threefold repetition and the fifty-move rule
 * (9.2, 9.3) are draws a player must claim; see `claimableDraw`.
 */
export type ChessResult =
  | 'PLAYING'
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'DRAW_MATERIAL'
  | 'DRAW_FIVEFOLD'
  | 'DRAW_SEVENTY_FIVE_MOVE'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const FILES = 'abcdefgh'

export function squareName(index: number): string {
  return `${FILES[index & 7]}${(index >> 3) + 1}`
}

/** Parses "e4" to its index, or returns -1 for anything that is not a square. */
export function squareIndex(name: string): number {
  if (typeof name !== 'string' || name.length !== 2) return -1
  const file = FILES.indexOf(name[0]!)
  const rank = name.charCodeAt(1) - 49
  if (file < 0 || rank < 0 || rank > 7) return -1
  return rank * 8 + file
}

export function colorOf(piece: Piece): ChessColor {
  return piece === piece.toUpperCase() ? 'w' : 'b'
}

export function typeOf(piece: Piece): PieceType {
  return piece.toLowerCase() as PieceType
}

function makePiece(type: PieceType, color: ChessColor): Piece {
  return (color === 'w' ? type.toUpperCase() : type) as Piece
}

const opposite = (c: ChessColor): ChessColor => (c === 'w' ? 'b' : 'w')

export function initialPosition(): ChessPosition {
  return parseFen(START_FEN)
}

export function parseFen(fen: string): ChessPosition {
  const parts = fen.trim().split(/\s+/)
  const rows = (parts[0] ?? '').split('/')
  if (rows.length !== 8) throw new Error('bad FEN')
  const board: Array<Piece | null> = new Array(64).fill(null)
  rows.forEach((row, i) => {
    const rank = 7 - i
    let file = 0
    for (const ch of row) {
      if (/[1-8]/.test(ch)) file += Number(ch)
      else if (/[pnbrqkPNBRQK]/.test(ch)) {
        if (file > 7) throw new Error('bad FEN')
        board[rank * 8 + file] = ch as Piece
        file++
      } else throw new Error('bad FEN')
    }
    if (file !== 8) throw new Error('bad FEN')
  })
  const turn = parts[1] === 'b' ? 'b' : 'w'
  const castling = parts[2] && parts[2] !== '-' ? parts[2] : ''
  const epSquare = parts[3] && parts[3] !== '-' ? squareIndex(parts[3]) : -1
  return {
    board,
    turn,
    castling,
    epSquare,
    halfmove: Number(parts[4] ?? 0) || 0,
    fullmove: Number(parts[5] ?? 1) || 1
  }
}

export function toFen(pos: ChessPosition): string {
  return `${placementFen(pos)} ${pos.turn} ${pos.castling || '-'} ${pos.epSquare >= 0 ? squareName(pos.epSquare) : '-'} ${pos.halfmove} ${pos.fullmove}`
}

function placementFen(pos: ChessPosition): string {
  const rows: string[] = []
  for (let rank = 7; rank >= 0; rank--) {
    let row = ''
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const p = pos.board[rank * 8 + file]
      if (!p) empty++
      else {
        if (empty) row += String(empty)
        empty = 0
        row += p
      }
    }
    if (empty) row += String(empty)
    rows.push(row)
  }
  return rows.join('/')
}

/**
 * The part of a position that decides repetition: pieces, side to move, castling rights
 * and a capturable en-passant square.
 */
export function positionKey(pos: ChessPosition): string {
  const ep = pos.epSquare >= 0 && epCapturePossible(pos) ? squareName(pos.epSquare) : '-'
  return `${placementFen(pos)} ${pos.turn} ${pos.castling || '-'} ${ep}`
}

function epCapturePossible(pos: ChessPosition): boolean {
  return legalMoves(pos).some((m) => m.enPassant)
}

export function clonePosition(pos: ChessPosition): ChessPosition {
  return { ...pos, board: pos.board.slice() }
}

const KNIGHT_STEPS: Array<[number, number]> = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]
]
const KING_STEPS: Array<[number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]
]
const ROOK_DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_DIRS: Array<[number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function at(file: number, rank: number): number {
  return file < 0 || file > 7 || rank < 0 || rank > 7 ? -1 : rank * 8 + file
}

/** Whether `square` is attacked by any piece of colour `by`. */
export function isSquareAttacked(board: Array<Piece | null>, square: number, by: ChessColor): boolean {
  const f = square & 7
  const r = square >> 3
  // Pawns attack diagonally forward, so look one rank "behind" the square from their side.
  const pawnRank = by === 'w' ? r - 1 : r + 1
  const pawn = makePiece('p', by)
  for (const df of [-1, 1]) {
    const s = at(f + df, pawnRank)
    if (s >= 0 && board[s] === pawn) return true
  }
  const knight = makePiece('n', by)
  for (const [df, dr] of KNIGHT_STEPS) {
    const s = at(f + df, r + dr)
    if (s >= 0 && board[s] === knight) return true
  }
  const king = makePiece('k', by)
  for (const [df, dr] of KING_STEPS) {
    const s = at(f + df, r + dr)
    if (s >= 0 && board[s] === king) return true
  }
  const rook = makePiece('r', by)
  const bishop = makePiece('b', by)
  const queen = makePiece('q', by)
  for (const [df, dr] of ROOK_DIRS) {
    for (let i = 1; ; i++) {
      const s = at(f + df * i, r + dr * i)
      if (s < 0) break
      const p = board[s]
      if (p) {
        if (p === rook || p === queen) return true
        break
      }
    }
  }
  for (const [df, dr] of BISHOP_DIRS) {
    for (let i = 1; ; i++) {
      const s = at(f + df * i, r + dr * i)
      if (s < 0) break
      const p = board[s]
      if (p) {
        if (p === bishop || p === queen) return true
        break
      }
    }
  }
  return false
}

export function kingSquare(board: Array<Piece | null>, color: ChessColor): number {
  const king = makePiece('k', color)
  return board.indexOf(king)
}

export function inCheck(pos: ChessPosition, color: ChessColor = pos.turn): boolean {
  const k = kingSquare(pos.board, color)
  return k >= 0 && isSquareAttacked(pos.board, k, opposite(color))
}

/** Moves that follow each piece's movement rules, before checking whether they leave the king in check. */
function pseudoMoves(pos: ChessPosition): ChessMove[] {
  const moves: ChessMove[] = []
  const { board, turn } = pos
  for (let from = 0; from < 64; from++) {
    const piece = board[from]
    if (!piece || colorOf(piece) !== turn) continue
    const f = from & 7
    const r = from >> 3
    const type = typeOf(piece)
    const push = (to: number, extra: Partial<ChessMove> = {}): void => {
      const captured = board[to] ?? undefined
      moves.push({ from, to, piece, ...(captured ? { captured } : {}), ...extra })
    }
    if (type === 'p') {
      const dir = turn === 'w' ? 1 : -1
      const startRank = turn === 'w' ? 1 : 6
      const lastRank = turn === 'w' ? 7 : 0
      const addPawn = (to: number, extra: Partial<ChessMove> = {}): void => {
        if (to >> 3 === lastRank) {
          for (const promo of ['q', 'r', 'b', 'n'] as PromotionPiece[]) push(to, { ...extra, promotion: promo })
        } else push(to, extra)
      }
      const one = at(f, r + dir)
      if (one >= 0 && !board[one]) {
        addPawn(one)
        const two = at(f, r + 2 * dir)
        if (r === startRank && two >= 0 && !board[two]) push(two)
      }
      for (const df of [-1, 1]) {
        const to = at(f + df, r + dir)
        if (to < 0) continue
        const target = board[to]
        if (target && colorOf(target) !== turn) addPawn(to)
        else if (to === pos.epSquare && !target) {
          moves.push({ from, to, piece, captured: makePiece('p', opposite(turn)), enPassant: true })
        }
      }
    } else if (type === 'n' || type === 'k') {
      for (const [df, dr] of type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
        const to = at(f + df, r + dr)
        if (to < 0) continue
        const target = board[to]
        if (!target || colorOf(target) !== turn) push(to)
      }
      if (type === 'k') addCastling(pos, from, moves)
    } else {
      const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const [df, dr] of dirs) {
        for (let i = 1; ; i++) {
          const to = at(f + df * i, r + dr * i)
          if (to < 0) break
          const target = board[to]
          if (!target) push(to)
          else {
            if (colorOf(target) !== turn) push(to)
            break
          }
        }
      }
    }
  }
  return moves
}

function addCastling(pos: ChessPosition, from: number, moves: ChessMove[]): void {
  const { board, turn, castling } = pos
  const home = turn === 'w' ? 4 : 60
  if (from !== home) return
  const enemy = opposite(turn)
  if (isSquareAttacked(board, home, enemy)) return
  const piece = board[from]!
  const rook = makePiece('r', turn)
  const kingSide = turn === 'w' ? 'K' : 'k'
  const queenSide = turn === 'w' ? 'Q' : 'q'
  if (
    castling.includes(kingSide) &&
    board[home + 3] === rook &&
    !board[home + 1] &&
    !board[home + 2] &&
    !isSquareAttacked(board, home + 1, enemy) &&
    !isSquareAttacked(board, home + 2, enemy)
  ) {
    moves.push({ from, to: home + 2, piece, castle: 'k' })
  }
  if (
    castling.includes(queenSide) &&
    board[home - 4] === rook &&
    !board[home - 1] &&
    !board[home - 2] &&
    !board[home - 3] &&
    !isSquareAttacked(board, home - 1, enemy) &&
    !isSquareAttacked(board, home - 2, enemy)
  ) {
    moves.push({ from, to: home - 2, piece, castle: 'q' })
  }
}

/** Plays a move on a copy of the position without checking it is legal. */
export function makeMove(pos: ChessPosition, move: ChessMove): ChessPosition {
  const next = clonePosition(pos)
  const b = next.board
  const color = colorOf(move.piece)
  b[move.from] = null
  b[move.to] = move.promotion ? makePiece(move.promotion, color) : move.piece
  if (move.enPassant) b[move.to + (color === 'w' ? -8 : 8)] = null
  if (move.castle) {
    const home = color === 'w' ? 4 : 60
    if (move.castle === 'k') {
      b[home + 1] = b[home + 3]!
      b[home + 3] = null
    } else {
      b[home - 1] = b[home - 4]!
      b[home - 4] = null
    }
  }
  // Castling rights go when the king moves, or a rook leaves (or is taken on) its corner.
  let rights = next.castling
  const strip = (square: number): void => {
    if (square === 4) rights = rights.replace(/[KQ]/g, '')
    if (square === 60) rights = rights.replace(/[kq]/g, '')
    if (square === 0) rights = rights.replace('Q', '')
    if (square === 7) rights = rights.replace('K', '')
    if (square === 56) rights = rights.replace('q', '')
    if (square === 63) rights = rights.replace('k', '')
  }
  strip(move.from)
  strip(move.to)
  next.castling = rights
  next.epSquare = typeOf(move.piece) === 'p' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : -1
  next.halfmove = typeOf(move.piece) === 'p' || move.captured ? 0 : pos.halfmove + 1
  if (color === 'b') next.fullmove = pos.fullmove + 1
  next.turn = opposite(color)
  return next
}

/** Every legal move for the side to move. */
export function legalMoves(pos: ChessPosition): ChessMove[] {
  return pseudoMoves(pos).filter((m) => {
    const next = makeMove(pos, m)
    const k = kingSquare(next.board, pos.turn)
    return k >= 0 && !isSquareAttacked(next.board, k, next.turn)
  })
}

/** Legal moves of the piece on one square, for highlighting. */
export function legalMovesFrom(pos: ChessPosition, square: string): ChessMove[] {
  const from = squareIndex(square)
  return legalMoves(pos).filter((m) => m.from === from)
}

/** Resolves a wire move to a legal move, or null when it is not legal. Promotion defaults to a queen. */
export function findLegalMove(pos: ChessPosition, input: ChessMoveInput): ChessMove | null {
  const from = squareIndex(input?.from)
  const to = squareIndex(input?.to)
  if (from < 0 || to < 0) return null
  const candidates = legalMoves(pos).filter((m) => m.from === from && m.to === to)
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!
  const promo = input.promotion ?? 'q'
  return candidates.find((m) => m.promotion === promo) ?? null
}

/** Neither side can possibly mate: K v K, K+minor v K, or only same-coloured bishops. */
export function insufficientMaterial(board: Array<Piece | null>): boolean {
  const minors: Array<{ type: PieceType; square: number }> = []
  for (let s = 0; s < 64; s++) {
    const p = board[s]
    if (!p) continue
    const t = typeOf(p)
    if (t === 'k') continue
    if (t === 'p' || t === 'r' || t === 'q') return false
    minors.push({ type: t, square: s })
  }
  if (minors.length <= 1) return true
  if (minors.every((m) => m.type === 'b')) {
    const shade = (s: number): number => ((s & 7) + (s >> 3)) & 1
    const first = shade(minors[0]!.square)
    return minors.every((m) => shade(m.square) === first)
  }
  return false
}

/** Standard algebraic notation for a legal move in `pos` (e.g. "Nf3", "exd5", "O-O", "e8=Q#"). */
export function toSan(pos: ChessPosition, move: ChessMove): string {
  let san: string
  if (move.castle) san = move.castle === 'k' ? 'O-O' : 'O-O-O'
  else {
    const type = typeOf(move.piece)
    const dest = squareName(move.to)
    if (type === 'p') {
      san = move.captured ? `${FILES[move.from & 7]}x${dest}` : dest
      if (move.promotion) san += `=${move.promotion.toUpperCase()}`
    } else {
      const others = legalMoves(pos).filter(
        (m) => m.to === move.to && m.piece === move.piece && m.from !== move.from
      )
      let disambig = ''
      if (others.length > 0) {
        const sameFile = others.some((m) => (m.from & 7) === (move.from & 7))
        const sameRank = others.some((m) => m.from >> 3 === move.from >> 3)
        if (!sameFile) disambig = FILES[move.from & 7]!
        else if (!sameRank) disambig = String((move.from >> 3) + 1)
        else disambig = squareName(move.from)
      }
      san = `${type.toUpperCase()}${disambig}${move.captured ? 'x' : ''}${dest}`
    }
  }
  const next = makeMove(pos, move)
  if (inCheck(next)) san += legalMoves(next).length === 0 ? '#' : '+'
  return san
}

/**
 * The state of the game after the last move: only the endings the Laws apply on their
 * own, with no player having to claim anything. Checkmate takes precedence (9.6).
 */
export function gameResult(pos: ChessPosition, history: readonly string[] = []): ChessResult {
  if (legalMoves(pos).length === 0) return inCheck(pos) ? 'CHECKMATE' : 'STALEMATE'
  if (insufficientMaterial(pos.board)) return 'DRAW_MATERIAL'
  if (pos.halfmove >= 150) return 'DRAW_SEVENTY_FIVE_MOVE'
  const key = positionKey(pos)
  if (history.filter((k) => k === key).length >= 5) return 'DRAW_FIVEFOLD'
  return 'PLAYING'
}

export type DrawClaim = 'DRAW_REPETITION' | 'DRAW_FIFTY_MOVE'

/**
 * A draw the player to move may claim right now (FIDE 9.2, 9.3): the current position
 * has appeared at least three times, or the last fifty moves by each side had no pawn
 * move and no capture. Null when there is nothing to claim.
 */
export function claimableDraw(pos: ChessPosition, history: readonly string[] = []): DrawClaim | null {
  const key = positionKey(pos)
  if (history.filter((k) => k === key).length >= 3) return 'DRAW_REPETITION'
  if (pos.halfmove >= 100) return 'DRAW_FIFTY_MOVE'
  return null
}

/**
 * Whether `color` could still checkmate the other king by any series of legal moves
 * (FIDE 6.9): decides whether a flag fall loses or draws.
 *
 * A lone king never can. A king and a single knight or bishop can only mate with the
 * help of the other side's own pieces blocking its king, so it counts as able to mate
 * unless the other side has nothing but its king (and, for bishops, nothing but
 * bishops on the same colour squares, which is a dead position anyway).
 */
export function canStillCheckmate(board: Array<Piece | null>, color: ChessColor): boolean {
  const own: Array<{ type: PieceType; square: number }> = []
  const other: Array<{ type: PieceType; square: number }> = []
  for (let s = 0; s < 64; s++) {
    const p = board[s]
    if (!p || typeOf(p) === 'k') continue
    ;(colorOf(p) === color ? own : other).push({ type: typeOf(p), square: s })
  }
  if (own.length === 0) return false
  if (own.some((m) => m.type === 'p' || m.type === 'r' || m.type === 'q')) return true
  if (own.length >= 2 && !own.every((m) => m.type === 'b')) return true
  const shade = (sq: number): number => ((sq & 7) + (sq >> 3)) & 1
  if (own.every((m) => m.type === 'b')) {
    const first = shade(own[0]!.square)
    const ownOneShade = own.every((m) => shade(m.square) === first)
    if (!ownOneShade) return true
    // Bishops on one shade can only mate if the other side has something to block with
    // that can stand on the other shade (anything but bishops of that same shade).
    return other.some((m) => m.type !== 'b' || shade(m.square) !== first)
  }
  // A single knight: mate needs a blocker from the other side.
  return other.length > 0
}

export const moveToInput = (m: ChessMove): ChessMoveInput => ({
  from: squareName(m.from),
  to: squareName(m.to),
  ...(m.promotion ? { promotion: m.promotion } : {})
})

/** Material count in pawns, white minus black (1/3/3/5/9). */
export function materialBalance(board: Array<Piece | null>): number {
  const value: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
  let total = 0
  for (const p of board) {
    if (!p) continue
    total += (colorOf(p) === 'w' ? 1 : -1) * value[typeOf(p)]
  }
  return total
}
