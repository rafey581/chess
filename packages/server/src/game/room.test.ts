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
  // Colours are drawn by lot; name the players by colour so the tests read naturally.
  const whiteSeat = room.match.currentGame!.whiteSeat
  const seatUser = (seat: number) => (seat === 0 ? 'alice' : 'bob')
  return { room, ...h, white: seatUser(whiteSeat), black: seatUser(1 - whiteSeat), whiteSeat }
}

const flush = () => new Promise((r) => setImmediate(r))

describe('chess room', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }))
  afterEach(() => vi.useRealTimers())

  it('starts with white to move and broadcasts the board and score', () => {
    const { emitted, whiteSeat } = seated()
    const start = emitted.find((e) => e.event === 'match:start')!
    expect(start.payload.snapshot.whiteSeat).toBe(whiteSeat)
    expect(start.payload.snapshot.turnSeat).toBe(whiteSeat)
    expect(start.payload.turn.turnDeadlineAt).not.toBeNull()
    expect(start.payload.framesWon).toEqual([0, 0])
  })

  it('accepts legal moves in turn and refuses the rest', () => {
    const { room, emitted, persisted, white, black } = seated()
    expect(room.handleMove(black, { from: 'e7', to: 'e5' })).toEqual({ accepted: false, error: 'not_your_turn' })
    expect(room.handleMove(white, { from: 'e2', to: 'e5' })).toEqual({ accepted: false, error: 'illegal_move' })
    expect(room.handleMove(white, { from: 'e2', to: 'e4' }).accepted).toBe(true)
    expect(room.handleMove(black, { from: 'e7', to: 'e5' }).accepted).toBe(true)
    const last = emitted.filter((e) => e.event === 'game:update').pop()!
    expect(last.payload.frame.moves).toEqual(['e4', 'e5'])
    expect(last.payload.frame.lastMove).toEqual({ from: 'e7', to: 'e5' })
    expect(persisted.map((e) => e.type)).toEqual(['MOVE', 'MOVE'])
  })

  it('ends the match on checkmate in a best-of-one', async () => {
    const { room, emitted, ended, white, black, whiteSeat } = seated('BO1')
    const moves: Array<[string, string, string]> = [
      [white, 'f2', 'f3'],
      [black, 'e7', 'e5'],
      [white, 'g2', 'g4'],
      [black, 'd8', 'h4']
    ]
    for (const [who, from, to] of moves) expect(room.handleMove(who, { from, to }).accepted).toBe(true)
    await flush()
    const end = emitted.find((e) => e.event === 'match:end')!
    expect(end.payload.winnerSeat).toBe(1 - whiteSeat)
    expect(ended).toEqual([{ winner: 1 - whiteSeat, reason: 'games' }])
  })

  it('starts the next game with colours swapped in a best-of-three', async () => {
    const { room, emitted, white, black, whiteSeat } = seated('BO3')
    for (const [who, from, to] of [
      [white, 'f2', 'f3'],
      [black, 'e7', 'e5'],
      [white, 'g2', 'g4'],
      [black, 'd8', 'h4']
    ] as const) room.handleMove(who, { from, to })
    await flush()
    const expected: [number, number] = [0, 0]
    expected[1 - whiteSeat] = 1
    expect(room.match.framesWon).toEqual(expected)
    expect(room.handleMove(white, { from: 'e2', to: 'e4' }).accepted).toBe(false)
    vi.advanceTimersByTime(NEXT_GAME_DELAY_MS)
    const next = emitted.find((e) => e.event === 'frame:start')!
    expect(next.payload.frameIndex).toBe(2)
    expect(next.payload.snapshot.whiteSeat).toBe(1 - whiteSeat)
    expect(room.handleMove(black, { from: 'e2', to: 'e4' }).accepted).toBe(true)
  })

  it('a player whose flag falls loses the game', async () => {
    const { room, emitted, whiteSeat } = seated('BO1')
    vi.advanceTimersByTime(5 * 60 * 1000 + 10)
    await flush()
    const end = emitted.find((e) => e.event === 'match:end')!
    expect(end.payload.winnerSeat).toBe(1 - whiteSeat)
    void room
  })

  it('charges only the side to move, and keeps their clock running through a disconnection', () => {
    const { room, white, whiteSeat } = seated('BO1')
    vi.advanceTimersByTime(10_000)
    let clocks = room.turnTiming().clocksMs
    expect(clocks[whiteSeat]).toBe(5 * 60 * 1000 - 10_000)
    expect(clocks[1 - whiteSeat]).toBe(5 * 60 * 1000)
    room.unregisterSocket(white, white === 'alice' ? 's-a' : 's-b')
    vi.advanceTimersByTime(60_000)
    clocks = room.turnTiming().clocksMs
    expect(clocks[whiteSeat]).toBe(5 * 60 * 1000 - 70_000)
    expect(room.turnTiming().paused).toBe(false)
  })

  it('resigning a game in a best-of-three loses that game, and the match goes on', async () => {
    const { room, emitted, white, whiteSeat } = seated('BO3')
    expect(room.handleResign(white).accepted).toBe(true)
    await flush()
    const expected: [number, number] = [0, 0]
    expected[1 - whiteSeat] = 1
    expect(room.match.framesWon).toEqual(expected)
    expect(emitted.find((e) => e.event === 'match:end')).toBeUndefined()
    vi.advanceTimersByTime(NEXT_GAME_DELAY_MS)
    expect(emitted.find((e) => e.event === 'frame:start')).toBeDefined()
  })

  it('an agreed draw in a best-of-one leads to an Armageddon game', async () => {
    const { room, emitted, white, black } = seated('BO1')
    expect(room.handleDrawOffer(white).accepted).toBe(true)
    expect(room.handleDrawOffer(white).accepted).toBe(false)
    expect(room.handleDrawResponse(white, true).accepted).toBe(false)
    expect(room.handleDrawResponse(black, true).accepted).toBe(true)
    await flush()
    expect(room.match.framesWon).toEqual([0.5, 0.5])
    expect(emitted.find((e) => e.event === 'match:end')).toBeUndefined()
    vi.advanceTimersByTime(NEXT_GAME_DELAY_MS)
    const arm = emitted.find((e) => e.event === 'frame:start')!
    expect(arm.payload.snapshot.armageddon).toBe(true)
    const w = arm.payload.snapshot.whiteSeat
    expect(arm.payload.snapshot.clocksMs[w]).toBe(5 * 60 * 1000)
    expect(arm.payload.snapshot.clocksMs[1 - w]).toBe(4 * 60 * 1000)
  })

  it('threefold repetition is only drawn when the player to move claims it', async () => {
    const { room, emitted, white, black } = seated('BO3')
    const shuffle: Array<[string, string, string]> = [
      [white, 'g1', 'f3'], [black, 'g8', 'f6'], [white, 'f3', 'g1'], [black, 'f6', 'g8']
    ]
    for (let r = 0; r < 2; r++) for (const [who, from, to] of shuffle) expect(room.handleMove(who, { from, to }).accepted).toBe(true)
    const snap = room.snapshot()!
    expect(snap.result).toBe('PLAYING')
    expect(snap.drawClaim).toBe('DRAW_REPETITION')
    expect(room.handleDrawClaim(black).accepted).toBe(false)
    expect(room.handleDrawClaim(white).accepted).toBe(true)
    await flush()
    expect(room.match.framesWon).toEqual([0.5, 0.5])
    void emitted
  })

  it('forfeiting concedes the whole match to the opponent', () => {
    const { room, emitted, ended } = seated('BO3')
    expect(room.handleConcede('alice')).toBe('bob')
    expect(emitted.find((e) => e.event === 'match:end')!.payload).toMatchObject({ winnerSeat: 1, reason: 'concede' })
    expect(ended[0]).toEqual({ winner: 1, reason: 'concede' })
  })

  it('the practice robot answers the human move', () => {
    const { room, emitted, whiteSeat } = seated('BO1', 'PRACTICE')
    if (whiteSeat === 1) {
      vi.advanceTimersByTime(BOT_MOVE_DELAY_MS)
      expect(emitted.filter((e) => e.event === 'game:update').pop()!.payload.frame.moves).toHaveLength(1)
    }
    const myMove = whiteSeat === 0 ? { from: 'e2', to: 'e4' } : { from: 'e7', to: 'e5' }
    const altMove = whiteSeat === 0 ? { from: 'd2', to: 'd4' } : { from: 'd7', to: 'd5' }
    expect(room.handleMove('alice', myMove).accepted).toBe(true)
    expect(room.isBotTurn()).toBe(true)
    expect(room.handleMove('alice', altMove)).toEqual({ accepted: false, error: 'robot_is_thinking' })
    vi.advanceTimersByTime(BOT_MOVE_DELAY_MS)
    const last = emitted.filter((e) => e.event === 'game:update').pop()!
    expect(last.payload.frame.moves).toHaveLength(whiteSeat === 0 ? 2 : 3)
    expect(last.payload.frame.turnSeat).toBe(0)
  })
})
