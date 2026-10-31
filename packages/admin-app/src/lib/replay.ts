/**
 * Rebuilds a chess match from its recorded events for the admin replay.
 *
 * Every MOVE event carries the position after it (FEN), so a step is simply "the
 * position after move N" - nothing has to be re-simulated, and the replay shows
 * exactly what the server accepted.
 */
import { parseFen, START_FEN } from '@snooker/shared'
import type { Piece } from '@snooker/shared'

export interface ReplayEvent {
  seq: number
  type: string
  data: unknown
}

export interface MovePlayed {
  seq: number
  /** 1-based game number within the match. */
  game: number
  san: string
  from: string
  to: string
  fen: string
  bySeat: number
}

export interface ReplayStep {
  index: number
  total: number
  game: number
  board: Array<Piece | null>
  lastMove: { from: string; to: string } | null
  move: MovePlayed | null
  startSeq: number
  endSeq: number
}

/** Every recorded move, numbered by the game it belongs to. */
export function collectMoves(events: ReplayEvent[]): MovePlayed[] {
  const moves: MovePlayed[] = []
  let game = 1
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const d = (event.data ?? {}) as Partial<MovePlayed>
    if (event.type === 'MOVE' && typeof d.fen === 'string' && typeof d.san === 'string') {
      moves.push({ seq: event.seq, game, san: d.san, from: d.from ?? '', to: d.to ?? '', fen: d.fen, bySeat: Number(d.bySeat ?? 0) })
    } else if (event.type === 'FRAME_END') {
      game += 1
    }
  }
  return moves
}

/**
 * The board at step `step`: step 0 is the starting position of game 1, step N the
 * position after the N-th recorded move.
 */
export function stepAt(events: ReplayEvent[], step: number): ReplayStep {
  const moves = collectMoves(events)
  const total = moves.length + 1
  const index = Math.min(Math.max(0, step), total - 1)
  const move = index > 0 ? moves[index - 1]! : null
  const next = moves[index]
  return {
    index,
    total,
    game: move?.game ?? 1,
    board: parseFen(move?.fen ?? START_FEN).board,
    lastMove: move ? { from: move.from, to: move.to } : null,
    move,
    startSeq: move?.seq ?? 0,
    endSeq: next ? next.seq - 1 : Number.MAX_SAFE_INTEGER
  }
}

const RESULT_TEXT: Record<string, string> = {
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
  DRAW_FIFTY_MOVE: 'draw (fifty-move rule)',
  DRAW_REPETITION: 'draw (repetition)',
  DRAW_MATERIAL: 'draw (insufficient material)',
  TIMEOUT: 'lost on time',
  RESIGN: 'resignation'
}

/** One line of the event log, readable on its own. */
export function eventLabel(event: ReplayEvent): string {
  const d = (event.data ?? {}) as Record<string, unknown>
  const seat = (v: unknown) => (typeof v === 'number' ? `seat ${v}` : 'nobody')
  switch (event.type) {
    case 'MOVE':
      return `${seat(d.bySeat)} played ${String(d.san ?? '?')}`
    case 'FRAME_END': {
      const how = RESULT_TEXT[String(d.result)] ?? String(d.result ?? 'game over')
      return d.winnerSeat === null || d.winnerSeat === undefined ? `game drawn: ${how}` : `game won by ${seat(d.winnerSeat)}: ${how}`
    }
    case 'MATCH_END':
      return `match won by ${seat(d.winnerSeat)} (${String(d.reason ?? '')})`
    default:
      return event.type.toLowerCase().replace(/_/g, ' ')
  }
}
