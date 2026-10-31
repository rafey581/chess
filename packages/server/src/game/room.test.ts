import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'socket.io'
import { GameRoom, BOT_MOVE_DELAY_MS, NEXT_GAME_DELAY_MS } from './room.js'
import type { RoomCallbacks, GameUpdateEvent } from './room.js'

function harness() {
  const emitted: Array<{ event: string; payload: any }> = []
  const persisted: GameUpdateEvent[] = []
  const ended: Array<{ winner: number; reason: string }> = []
  const board = {
    to: () => ({ emit: (event: string, payload: unknown) => emitted.push({ event, payload }) })
  } as unknown as Server
  const callbacks: RoomCallbacks = {
    board,
    persist: async (events) => {
      persisted.push(...events)
    },
    onFrameEnd: async () => {},
    onMatchEnd: async (_id, winner, reason) => {
      ended.push({ winner, reason })
    },
    log: () => {}
  }
  return { emitted, persisted, ended, callbacks }
}

function seated(format = 'BO1', type = 'ONE_V_ONE') {
  const h = harness()
  const room = new GameRoom('m1', type, format, type === 'PRACTICE' ? 'EASY' : undefined, h.callbacks)
  room.registerSocket('alice', 0, 's-a')
  if (type !== 'PRACTICE') room.registerSocket('bob', 1, 's-b')
  room.tryStart()
  return { room, ...h }
}

const flush = () => new Promise((r) => setImmediate(r))

describe('chess room', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }))
  afterEach(() => vi.useRealTimers())

  it('starts with seat 0 on white and broadcasts the board', () => {
    const { emitted } = seated()
    const start = emitted.find((e) => e.event === 'match:start')!
    expect(start.payload.snapshot.whiteSeat).toBe(0)
    expect(start.payload.snapshot.turnSeat).toBe(0)
    expect(start.payload.turn.turnDeadlineAt).not.toBeNull()
  })

  it('accepts legal moves in turn and refuses the rest', () => {
    const { room, emitted, persisted } = seated()
    expect(room.handleMove('bob', { from: 'e7', to: 'e5' })).toEqual({ accepted: false, error: 'not_your_turn' })
    expect(room.handleMove('alice', { from: 'e2', to: 'e5' })).toEqual({ accepted: false, error: 'illegal_move' })
    expect(room.handleMove('alice', { from: 'e2', to: 'e4' }).accepted).toBe(true)
    expect(room.handleMove('bob', { from: 'e7', to: 'e5' }).accepted).toBe(true)
    const last = emitted.filter((e) => e.event === 'game:update').pop()!
    expect(last.payload.frame.moves).toEqual(['e4', 'e5'])
    expect(last.payload.frame.lastMove).toEqual({ from: 'e7', to: 'e5' })
    expect(persisted.map((e) => e.type)).toEqual(['MOVE', 'MOVE'])
  })

  it('ends the match on checkmate in a best-of-one', async () => {
    const { room, emitted, ended } = seated('BO1')
    const moves: Array<[string, string, string]> = [
      ['alice', 'f2', 'f3'],
      ['bob', 'e7', 'e5'],
      ['alice', 'g2', 'g4'],
      ['bob', 'd8', 'h4']
    ]
    for (const [who, from, to] of moves) expect(room.handleMove(who, { from, to }).accepted).toBe(true)
    await flush()
    const end = emitted.find((e) => e.event === 'match:end')!
    expect(end.payload.winnerSeat).toBe(1)
    expect(ended).toEqual([{ winner: 1, reason: 'games' }])
  })

  it('starts the next game with colours swapped in a best-of-three', async () => {
    const { room, emitted } = seated('BO3')
    for (const [who, from, to] of [
      ['alice', 'f2', 'f3'],
      ['bob', 'e7', 'e5'],
      ['alice', 'g2', 'g4'],
      ['bob', 'd8', 'h4']
    ] as const) room.handleMove(who, { from, to })
    await flush()
    expect(room.match.framesWon).toEqual([0, 1])
    expect(room.handleMove('alice', { from: 'e2', to: 'e4' }).accepted).toBe(false)
    vi.advanceTimersByTime(NEXT_GAME_DELAY_MS)
    const next = emitted.find((e) => e.event === 'frame:start')!
    expect(next.payload.frameIndex).toBe(2)
    expect(next.payload.snapshot.whiteSeat).toBe(1)
    expect(room.handleMove('bob', { from: 'e2', to: 'e4' }).accepted).toBe(true)
  })

  it('a player whose flag falls loses the game', async () => {
    const { room, emitted } = seated('BO1')
    vi.advanceTimersByTime(5 * 60 * 1000 + 10)
    await flush()
    const end = emitted.find((e) => e.event === 'match:end')!
    expect(end.payload.winnerSeat).toBe(1)
    void room
  })

  it('charges only the side to move, and stops their clock while they are disconnected', () => {
    const { room } = seated('BO1')
    vi.advanceTimersByTime(10_000)
    let clocks = room.turnTiming().clocksMs
    expect(clocks[0]).toBe(5 * 60 * 1000 - 10_000)
    expect(clocks[1]).toBe(5 * 60 * 1000)
    room.unregisterSocket('alice', 's-a')
    vi.advanceTimersByTime(60_000)
    clocks = room.turnTiming().clocksMs
    expect(clocks[0]).toBe(5 * 60 * 1000 - 10_000)
    expect(room.turnTiming().paused).toBe(true)
    room.registerSocket('alice', 0, 's-a2')
    expect(room.turnTiming().paused).toBe(false)
  })

  it('resigning concedes the match to the opponent', () => {
    const { room, emitted, ended } = seated('BO3')
    expect(room.handleConcede('alice')).toBe('bob')
    expect(emitted.find((e) => e.event === 'match:end')!.payload).toMatchObject({ winnerSeat: 1, reason: 'concede' })
    expect(ended[0]).toEqual({ winner: 1, reason: 'concede' })
  })

  it('the practice robot answers the human move', () => {
    const { room, emitted } = seated('BO1', 'PRACTICE')
    expect(room.handleMove('alice', { from: 'e2', to: 'e4' }).accepted).toBe(true)
    expect(room.isBotTurn()).toBe(true)
    expect(room.handleMove('alice', { from: 'd2', to: 'd4' })).toEqual({ accepted: false, error: 'robot_is_thinking' })
    vi.advanceTimersByTime(BOT_MOVE_DELAY_MS)
    const last = emitted.filter((e) => e.event === 'game:update').pop()!
    expect(last.payload.frame.moves).toHaveLength(2)
    expect(last.payload.frame.turnSeat).toBe(0)
  })
})
