/**
 * The practice robot's chess player: alpha-beta search over material and
 * piece-square tables. The difficulty decides how deep it looks and how often it
 * deliberately picks a weaker move.
 */
import { colorOf, gameResult, inCheck, legalMoves, makeMove, moveToInput, positionKey, typeOf } from './engine.js'
import type { ChessMove, ChessMoveInput, ChessPosition, Piece, PieceType } from './engine.js'

export type ChessAiLevel = 'EASY' | 'MEDIUM' | 'HARD'

const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

// Piece-square tables from white's point of view, rank 8 first (index 0 = a8).
const PST: Record<PieceType, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20
  ]
}

function pstIndex(square: number, white: boolean): number {
  const file = square & 7
  const rank = square >> 3
  return white ? (7 - rank) * 8 + file : rank * 8 + file
}

/** Static evaluation in centipawns from the side to move's point of view. */
export function evaluatePosition(pos: ChessPosition): number {
  let score = 0
  for (let s = 0; s < 64; s++) {
    const p = pos.board[s] as Piece | null
    if (!p) continue
    const white = colorOf(p) === 'w'
    const t = typeOf(p)
    const v = VALUE[t] + PST[t][pstIndex(s, white)]!
    score += white ? v : -v
  }
  return pos.turn === 'w' ? score : -score
}

const MATE = 100_000

function orderMoves(moves: ChessMove[]): ChessMove[] {
  const score = (m: ChessMove): number =>
    (m.captured ? 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] : 0) + (m.promotion ? 800 : 0)
  return moves.slice().sort((a, b) => score(b) - score(a))
}

/** Thrown out of the search when the time budget runs out. */
class OutOfTime extends Error {}

interface SearchClock {
  deadline: number
  nodes: number
}

function tick(clock: SearchClock): void {
  // Checking the time on every node is wasteful; every 512 is plenty fine-grained.
  if ((++clock.nodes & 511) === 0 && Date.now() > clock.deadline) throw new OutOfTime()
}

function quiesce(pos: ChessPosition, alpha: number, beta: number, depth: number, clock: SearchClock): number {
  tick(clock)
  const stand = evaluatePosition(pos)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  if (depth <= 0) return alpha
  for (const m of orderMoves(legalMoves(pos).filter((x) => x.captured || x.promotion))) {
    const score = -quiesce(makeMove(pos, m), -beta, -alpha, depth - 1, clock)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function search(
  pos: ChessPosition,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  history: string[],
  clock: SearchClock
): number {
  tick(clock)
  const moves = legalMoves(pos)
  if (moves.length === 0) return inCheck(pos) ? -MATE + ply : 0
  if (pos.halfmove >= 100) return 0
  if (ply > 0 && history.includes(positionKey(pos))) return 0
  if (depth <= 0) return quiesce(pos, alpha, beta, 3, clock)
  for (const m of orderMoves(moves)) {
    const score = -search(makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1, history, clock)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

const DEPTH: Record<ChessAiLevel, number> = { EASY: 1, MEDIUM: 2, HARD: 3 }
/** Chance of playing a random legal move instead of the best one. */
const BLUNDER: Record<ChessAiLevel, number> = { EASY: 0.3, MEDIUM: 0.08, HARD: 0 }

/** How long the robot may think per move. The search runs on the server's event loop, so it is kept short. */
export const AI_TIME_BUDGET_MS = 350

/**
 * Chooses the robot's move. `rand` is injectable so tests (and replays) are
 * deterministic. Returns null only when there is no legal move.
 *
 * Searches one ply deeper at a time up to the level's depth, keeping the result of the
 * deepest search that finished inside the time budget, so a busy position costs at most
 * the budget rather than however long the full-depth search would take.
 */
export function chooseAiMove(
  pos: ChessPosition,
  level: ChessAiLevel = 'MEDIUM',
  rand: () => number = Math.random,
  history: string[] = [],
  budgetMs: number = AI_TIME_BUDGET_MS
): ChessMoveInput | null {
  const moves = legalMoves(pos)
  if (moves.length === 0) return null
  if (rand() < BLUNDER[level]) return moveToInput(moves[Math.floor(rand() * moves.length)]!)
  const ordered = orderMoves(moves)
  const clock: SearchClock = { deadline: Date.now() + budgetMs, nodes: 0 }
  let chosen: ChessMove[] = [ordered[0]!]
  for (let depth = 1; depth <= DEPTH[level]; depth++) {
    let best: ChessMove[] = []
    let bestScore = -Infinity
    try {
      for (const m of ordered) {
        const next = makeMove(pos, m)
        // A move that ends the game is judged by the result, not the search.
        const result = gameResult(next, [...history, positionKey(next)])
        let score: number
        if (result === 'CHECKMATE') score = MATE
        else if (result !== 'PLAYING') score = 0
        else score = -search(next, depth - 1, -Infinity, Infinity, 1, history, clock)
        if (score > bestScore + 5) {
          bestScore = score
          best = [m]
        } else if (score >= bestScore - 5) best.push(m)
      }
    } catch (error) {
      if (error instanceof OutOfTime) break
      throw error
    }
    chosen = best
    if (bestScore >= MATE - 100) break
  }
  return moveToInput(chosen[Math.floor(rand() * chosen.length)]!)
}
