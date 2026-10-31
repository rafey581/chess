import { describe, expect, it } from 'vitest'
import { collectMoves, eventLabel, stepAt, type ReplayEvent } from './replay'

const events: ReplayEvent[] = [
  { seq: 1, type: 'MOVE', data: { san: 'f3', from: 'f2', to: 'f3', bySeat: 0, fen: 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1' } },
  { seq: 2, type: 'MOVE', data: { san: 'e5', from: 'e7', to: 'e5', bySeat: 1, fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2' } },
  { seq: 3, type: 'FRAME_END', data: { winnerSeat: 1, result: 'TIMEOUT' } },
  { seq: 4, type: 'MOVE', data: { san: 'e4', from: 'e2', to: 'e4', bySeat: 1, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' } },
  { seq: 5, type: 'MATCH_END', data: { winnerSeat: 1, reason: 'games' } }
]

describe('collectMoves', () => {
  it('keeps the moves and numbers the games', () => {
    const moves = collectMoves(events)
    expect(moves.map((m) => m.san)).toEqual(['f3', 'e5', 'e4'])
    expect(moves.map((m) => m.game)).toEqual([1, 1, 2])
  })
  it('handles an empty log', () => {
    expect(collectMoves([])).toHaveLength(0)
  })
})

describe('stepAt', () => {
  it('starts from the initial position', () => {
    const step = stepAt(events, 0)
    expect(step.total).toBe(4)
    expect(step.board[4]).toBe('K')
    expect(step.lastMove).toBeNull()
  })
  it('shows the position after a move', () => {
    const step = stepAt(events, 2)
    expect(step.board[36]).toBe('p')
    expect(step.lastMove).toEqual({ from: 'e7', to: 'e5' })
    expect(step.startSeq).toBe(2)
    expect(step.endSeq).toBe(3)
  })
  it('clamps out-of-range steps', () => {
    expect(stepAt(events, 99).index).toBe(3)
    expect(stepAt(events, -5).index).toBe(0)
  })
})

describe('eventLabel', () => {
  it('describes each event type', () => {
    expect(eventLabel(events[0]!)).toBe('seat 0 played f3')
    expect(eventLabel(events[2]!)).toBe('game won by seat 1: lost on time')
    expect(eventLabel(events[4]!)).toBe('match won by seat 1 (games)')
  })
})
