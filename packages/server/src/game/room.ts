import type { Server } from 'socket.io'
import {
  aiAcceptsDraw,
  applyChessMove,
  applyDrawClaim,
  applyGameWinner,
  applyResign,
  applyTimeout,
  drawClaimFor,
  offerDraw,
  respondToDraw,
  seatColor,
  chessSnapshot,
  createChessMatch,
  matchWinnerIndex,
  nextGame,
  turnSeat,
  CHESS_CLOCK_MS
} from '@snooker/shared'
import type { ChessMatchState, ChessMoveInput, ChessSnapshot, PracticeAiLevel } from '@snooker/shared'
import { computeBotMove } from '../bot/bot.js'

export interface GameUpdateEvent {
  matchId: string
  seq: number
  type: string
  data: unknown
}

export interface RoomCallbacks {
  board: Server
  persist: (events: GameUpdateEvent[]) => Promise<void>
  onFrameEnd: (matchId: string, frameWinner: number | null, scores: { player0: number; player1: number }) => Promise<void>
  onMatchEnd: (matchId: string, matchWinner: number, reason: string) => Promise<void>
  log: (msg: string) => void
}

/** How long the robot "thinks" before it moves, so its replies do not land instantly. */
export const BOT_MOVE_DELAY_MS = 700
/** Pause between one game ending and the next starting, so both players see the result. */
export const NEXT_GAME_DELAY_MS = 4000

export interface TurnTimingDto {
  /** When the side to move runs out of time, in server ms; null while the clock is stopped. */
  turnDeadlineAt: number | null
  turnDurationMs: number
  serverNow: number
  paused: boolean
  /** Each seat's remaining time as of `serverNow` (the running side already charged). */
  clocksMs: [number, number]
  turnSeat: number | null
}

/**
 * One chess match in progress: the authority on the position, the clocks and the score.
 *
 * Seats are fixed for the match (seat 0 is the player who opened the table, or the human
 * in practice; seat 1 the opponent or the robot). Colours alternate game by game, starting
 * with seat 0 on white.
 */
export class GameRoom {
  readonly matchId: string
  readonly matchType: string
  readonly aiLevel?: PracticeAiLevel
  match: ChessMatchState
  seatOfUser = new Map<string, number>()
  socketIds = new Map<number, Set<string>>()
  started = false
  stopped = false
  private seq = 0
  private callbacks: RoomCallbacks
  private disconnectedAt = new Map<number, number>()
  private deliveredSeqByUser = new Map<string, number>()
  private botTimer: NodeJS.Timeout | null = null
  private flagTimer: NodeJS.Timeout | null = null
  private nextGameTimer: NodeJS.Timeout | null = null
  /** When the side to move's clock started running, or null while it is stopped. */
  private clockStartedAt: number | null = null
  private readonly clockMs: number
  /** True between a game ending and the next one starting. */
  private betweenGames = false

  constructor(
    matchId: string,
    matchType: string,
    format: string,
    aiLevel?: PracticeAiLevel,
    callbacks?: RoomCallbacks,
    clockMs: number = CHESS_CLOCK_MS
  ) {
    this.matchId = matchId
    this.matchType = matchType
    this.aiLevel = aiLevel
    this.callbacks = callbacks ?? defaultCallbacks()
    this.clockMs = clockMs
    this.match = createChessMatch(matchId, matchType, format)
    this.match.currentGame!.clocksMs = [clockMs, clockMs]
  }

  // ---- seats and sockets -------------------------------------------------------

  registerSocket(userId: string, seat: number, socketId: string): void {
    this.seatOfUser.set(userId, seat)
    const set = this.socketIds.get(seat) ?? new Set<string>()
    set.add(socketId)
    this.socketIds.set(seat, set)
    if (this.disconnectedAt.delete(seat)) {
      this.broadcast('opponent:reconnected', { seat })
    }
  }

  unregisterSocket(userId: string, socketId: string): void {
    const seat = this.seatOfUser.get(userId)
    if (seat === undefined) return
    const set = this.socketIds.get(seat)
    if (!set) return
    set.delete(socketId)
    if (set.size > 0) return
    this.disconnectedAt.set(seat, Date.now())
    this.callbacks.log(`${userId} disconnected from ${this.matchId}`)
    this.broadcast('opponent:disconnected', { seat })
    // The clock keeps running through a disconnection, as in FIDE online events: being
    // connected is the player's responsibility. The grace timer in the socket server
    // still decides the match if they do not come back in time.
  }

  getSeat(userId: string): number | undefined {
    return this.seatOfUser.get(userId)
  }

  isSeatDisconnected(seat: number): boolean {
    return this.disconnectedAt.has(seat)
  }

  connectedSeats(): number[] {
    return [...new Set(this.seatOfUser.values())].filter((s) => !this.disconnectedAt.has(s))
  }

  disconnectedSeats(): number[] {
    return [...new Set(this.seatOfUser.values())].filter((s) => this.disconnectedAt.has(s))
  }

  userIdForSeat(seat: number): string | undefined {
    for (const [userId, s] of this.seatOfUser) if (s === seat) return userId
    return undefined
  }

  allUsers(): string[] {
    return [...this.seatOfUser.keys()]
  }

  currentSeq(): number {
    return this.seq
  }

  deliveredSeqForUser(userId: string): number {
    return this.deliveredSeqByUser.get(userId) ?? 0
  }

  // ---- state ---------------------------------------------------------------------

  /** The board as the clients draw it, with the running clock charged up to now. */
  snapshot(): ChessSnapshot | null {
    const game = this.match.currentGame
    if (!game) return null
    const snap = chessSnapshot(game)
    snap.clocksMs = this.liveClocks()
    return snap
  }

  private liveClocks(): [number, number] {
    const game = this.match.currentGame
    if (!game) return [0, 0]
    const clocks: [number, number] = [game.clocksMs[0], game.clocksMs[1]]
    if (this.clockStartedAt !== null && game.result === 'PLAYING') {
      const seat = turnSeat(game)
      clocks[seat] = Math.max(0, (clocks[seat] ?? 0) - (Date.now() - this.clockStartedAt))
    }
    return clocks
  }

  isBotTurn(): boolean {
    const game = this.match.currentGame
    return !!game && this.matchType === 'PRACTICE' && game.result === 'PLAYING' && turnSeat(game) === 1
  }

  tryStart(): boolean {
    if (this.started) return false
    const ready = this.matchType === 'PRACTICE' || this.seatOfUser.size >= 2
    if (!ready) return false
    this.started = true
    this.startClock()
    this.broadcast('match:start', { snapshot: this.snapshot(), frameIndex: this.match.frameIndex + 1 })
    this.scheduleBotIfNeeded()
    return true
  }

  // ---- clocks --------------------------------------------------------------------

  private startClock(): void {
    this.clearFlagTimer()
    this.clockStartedAt = null
    if (!this.started || this.stopped || this.betweenGames) return
    const game = this.match.currentGame
    if (!game || game.result !== 'PLAYING') return
    const seat = turnSeat(game)
    this.clockStartedAt = Date.now()
    const remaining = Math.max(0, game.clocksMs[seat] ?? 0)
    this.flagTimer = setTimeout(() => {
      this.flagTimer = null
      this.onFlag(seat)
    }, remaining)
  }

  /** Stops the running clock, banking the time used so far against the side to move. */
  private stopClock(): void {
    this.clearFlagTimer()
    const game = this.match.currentGame
    if (game && this.clockStartedAt !== null && game.result === 'PLAYING') {
      const seat = turnSeat(game)
      game.clocksMs[seat] = Math.max(0, (game.clocksMs[seat] ?? 0) - (Date.now() - this.clockStartedAt))
    }
    this.clockStartedAt = null
  }

  private clearFlagTimer(): void {
    if (this.flagTimer) clearTimeout(this.flagTimer)
    this.flagTimer = null
  }

  turnTiming(): TurnTimingDto {
    const game = this.match.currentGame
    const clocks = this.liveClocks()
    const running = this.clockStartedAt !== null && !!game && game.result === 'PLAYING'
    const seat = game && game.result === 'PLAYING' ? turnSeat(game) : null
    const now = Date.now()
    return {
      turnDeadlineAt: running && seat !== null ? now + (clocks[seat] ?? 0) : null,
      turnDurationMs: this.clockMs,
      serverNow: now,
      paused: !running,
      clocksMs: clocks,
      turnSeat: seat
    }
  }

  private broadcastTurnClock(): void {
    this.broadcast('turn:clock', { turn: this.turnTiming() })
  }

  private onFlag(seat: number): void {
    if (this.stopped) return
    const game = this.match.currentGame
    if (!game || game.result !== 'PLAYING' || turnSeat(game) !== seat) return
    this.clockStartedAt = null
    applyTimeout(game, seat)
    this.callbacks.log(`seat ${seat} lost on time in ${this.matchId}`)
    void this.endGame([])
  }

  // ---- moves ---------------------------------------------------------------------

  handleMove(userId: string, input: ChessMoveInput): { accepted: boolean; error?: string } {
    const seat = this.seatOfUser.get(userId)
    if (seat === undefined) return { accepted: false, error: 'not_in_match' }
    if (!this.started) return { accepted: false, error: 'not_started' }
    if (this.isBotTurn()) return { accepted: false, error: 'robot_is_thinking' }
    return this.playMove(seat, input)
  }

  private playMove(seat: number, input: ChessMoveInput): { accepted: boolean; error?: string } {
    const game = this.match.currentGame
    if (!game || this.stopped || this.betweenGames || game.result !== 'PLAYING') return { accepted: false, error: 'game_not_running' }
    if (turnSeat(game) !== seat) return { accepted: false, error: 'not_your_turn' }
    const spent = this.clockStartedAt !== null ? Date.now() - this.clockStartedAt : 0
    if (this.clockStartedAt !== null && spent >= (game.clocksMs[seat] ?? 0)) {
      // The flag fell before the move arrived; the timer just has not fired yet.
      this.clearFlagTimer()
      this.onFlag(seat)
      return { accepted: false, error: 'out_of_time' }
    }
    const outcome = applyChessMove(game, seat, input, spent)
    if (!outcome.ok || !outcome.record) return { accepted: false, error: outcome.error?.replace(/ /g, '_') ?? 'illegal_move' }
    this.clearFlagTimer()
    this.clockStartedAt = null
    const moveEvent = this.event('MOVE', { ...outcome.record })
    if (outcome.ended) {
      void this.endGame([moveEvent])
    } else {
      this.startClock()
      this.commit([moveEvent])
      this.scheduleBotIfNeeded()
    }
    return { accepted: true }
  }

  private commit(events: GameUpdateEvent[]): void {
    this.noteDelivered(events)
    this.broadcast('game:update', { frame: this.snapshot(), events })
    void this.callbacks.persist(events)
  }

  private async endGame(preceding: GameUpdateEvent[]): Promise<void> {
    const game = this.match.currentGame
    if (!game) return
    this.betweenGames = true
    this.clearFlagTimer()
    this.clockStartedAt = null
    const winner = game.winnerSeat
    const gameEnd = this.event('FRAME_END', { winnerSeat: winner, result: game.result, moves: game.moves.length })
    this.commit([...preceding, gameEnd])
    const matchEnded = applyGameWinner(this.match, winner, game.armageddon)
    await this.callbacks.onFrameEnd(this.matchId, winner, {
      player0: this.match.framesWon[0],
      player1: this.match.framesWon[1]
    })
    if (this.stopped) return
    if (matchEnded) {
      const matchWinner = matchWinnerIndex(this.match)
      const end = this.event('MATCH_END', { winnerSeat: matchWinner, reason: 'games' })
      void this.callbacks.persist([end])
      this.broadcast('match:end', { winnerSeat: matchWinner, framesWon: this.match.framesWon, reason: 'games' })
      await this.callbacks.onMatchEnd(this.matchId, matchWinner, 'games')
      return
    }
    this.nextGameTimer = setTimeout(() => {
      this.nextGameTimer = null
      if (this.stopped) return
      const next = nextGame(this.match)
      if (!next.armageddon) next.clocksMs = [this.clockMs, this.clockMs]
      this.betweenGames = false
      this.startClock()
      this.broadcast('frame:start', { frameIndex: this.match.frameIndex + 1, snapshot: this.snapshot() })
      this.scheduleBotIfNeeded()
    }, NEXT_GAME_DELAY_MS)
  }

  // ---- resignation and draws (FIDE 5.1.2, 9.1-9.3) --------------------------------

  private actionSeat(userId: string): { seat: number } | { error: string } {
    const seat = this.seatOfUser.get(userId)
    if (seat === undefined) return { error: 'not_in_match' }
    const game = this.match.currentGame
    if (!this.started || this.stopped || this.betweenGames || !game || game.result !== 'PLAYING') return { error: 'game_not_running' }
    return { seat }
  }

  /** Ends the current game after a resignation, claim or agreed draw. */
  private endByAction(event: GameUpdateEvent): void {
    void this.endGame([event])
  }

  /** `userId` resigns the current game; in a match with more games, play goes on. */
  handleResign(userId: string): { accepted: boolean; error?: string } {
    const who = this.actionSeat(userId)
    if ('error' in who) return { accepted: false, error: who.error }
    const game = this.match.currentGame!
    this.stopClock()
    applyResign(game, who.seat)
    this.endByAction(this.event('RESIGN', { bySeat: who.seat }))
    return { accepted: true }
  }

  handleDrawOffer(userId: string): { accepted: boolean; error?: string } {
    const who = this.actionSeat(userId)
    if ('error' in who) return { accepted: false, error: who.error }
    const game = this.match.currentGame!
    const r = offerDraw(game, who.seat)
    if (!r.ok) return { accepted: false, error: r.error?.replace(/ /g, '_') }
    this.commit([this.event('DRAW_OFFER', { bySeat: who.seat })])
    this.scheduleBotDrawAnswer()
    return { accepted: true }
  }

  handleDrawResponse(userId: string, accept: boolean): { accepted: boolean; error?: string } {
    const who = this.actionSeat(userId)
    if ('error' in who) return { accepted: false, error: who.error }
    return this.answerDraw(who.seat, accept)
  }

  private answerDraw(seat: number, accept: boolean): { accepted: boolean; error?: string } {
    const game = this.match.currentGame!
    if (accept) this.stopClock()
    const r = respondToDraw(game, seat, accept)
    if (!r.ok) {
      if (accept) this.startClock()
      return { accepted: false, error: r.error?.replace(/ /g, '_') }
    }
    const event = this.event(accept ? 'DRAW_ACCEPTED' : 'DRAW_DECLINED', { bySeat: seat })
    if (accept) this.endByAction(event)
    else this.commit([event])
    return { accepted: true }
  }

  handleDrawClaim(userId: string): { accepted: boolean; error?: string } {
    const who = this.actionSeat(userId)
    if ('error' in who) return { accepted: false, error: who.error }
    return this.claimDraw(who.seat)
  }

  private claimDraw(seat: number): { accepted: boolean; error?: string } {
    const game = this.match.currentGame!
    const claim = drawClaimFor(game)
    if (!claim || turnSeat(game) !== seat) return { accepted: false, error: 'no_draw_to_claim' }
    this.stopClock()
    applyDrawClaim(game, seat)
    this.endByAction(this.event('DRAW_CLAIMED', { bySeat: seat, claim }))
    return { accepted: true }
  }

  /** The practice robot answers a draw offer: it takes one only when it is clearly worse. */
  private scheduleBotDrawAnswer(): void {
    const game = this.match.currentGame
    if (this.matchType !== 'PRACTICE' || !game || game.drawOfferBy !== 0) return
    setTimeout(() => {
      const g = this.match.currentGame
      if (this.stopped || g !== game || g.result !== 'PLAYING' || g.drawOfferBy !== 0) return
      this.answerDraw(1, aiAcceptsDraw(g.position, seatColor(g, 1)))
    }, BOT_MOVE_DELAY_MS)
  }

  /**
   * Forfeits the whole match (and the stake) to the opponent. Kept alongside resigning a
   * single game so a player can leave a best-of-3/5 without playing the remaining games.
   */
  handleConcede(userId: string): string | null {
    const seat = this.seatOfUser.get(userId)
    if (seat === undefined || this.stopped) return null
    const winnerSeat = seat === 0 ? 1 : 0
    const winnerUserId = this.userIdForSeat(winnerSeat) ?? null
    if (winnerUserId) {
      this.stopClock()
      const end = this.event('MATCH_END', { winnerSeat, reason: 'concede' })
      void this.callbacks.persist([end])
      this.broadcast('match:end', { winnerSeat, reason: 'concede', framesWon: this.match.framesWon })
      void this.callbacks.onMatchEnd(this.matchId, winnerSeat, 'concede')
    }
    return winnerUserId
  }

  private scheduleBotIfNeeded(): void {
    if (!this.isBotTurn()) return
    if (this.botTimer) clearTimeout(this.botTimer)
    const level = this.aiLevel ?? 'MEDIUM'
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      const game = this.match.currentGame
      if (!game || this.stopped || !this.isBotTurn()) return
      // The robot claims a draw that is available to it when it is clearly worse.
      if (drawClaimFor(game) && aiAcceptsDraw(game.position, seatColor(game, 1))) {
        this.claimDraw(1)
        return
      }
      const move = computeBotMove(game, level, this.matchId)
      if (move) this.playMove(1, move)
    }, BOT_MOVE_DELAY_MS)
  }

  // ---- plumbing ------------------------------------------------------------------

  private noteDelivered(events: GameUpdateEvent[]): void {
    if (events.length === 0) return
    const maxSeq = Math.max(...events.map((e) => e.seq))
    for (const [userId, seat] of this.seatOfUser) {
      const set = this.socketIds.get(seat)
      if (!set || set.size === 0) continue
      const prev = this.deliveredSeqByUser.get(userId) ?? 0
      this.deliveredSeqByUser.set(userId, Math.max(prev, maxSeq))
    }
  }

  private event(type: string, data: unknown): GameUpdateEvent {
    const seq = ++this.seq
    return { matchId: this.matchId, seq, type, data }
  }

  /** Board-carrying broadcasts also carry the clocks, so every screen counts to the same moment. */
  private static readonly TIMED_EVENTS = new Set(['game:update', 'frame:start', 'match:start'])

  broadcast(event: string, payload: unknown): void {
    if (!this.callbacks.board) return
    if (GameRoom.TIMED_EVENTS.has(event) && payload !== null && typeof payload === 'object') {
      this.callbacks.board
        .to(`match:${this.matchId}`)
        .emit(event, { ...(payload as Record<string, unknown>), turn: this.turnTiming(), framesWon: this.match.framesWon })
      return
    }
    this.callbacks.board.to(`match:${this.matchId}`).emit(event, payload)
  }

  dispose(): void {
    if (this.botTimer) clearTimeout(this.botTimer)
    if (this.nextGameTimer) clearTimeout(this.nextGameTimer)
    this.botTimer = null
    this.nextGameTimer = null
    this.clearFlagTimer()
    this.clockStartedAt = null
    this.stopped = true
  }
}

function defaultCallbacks(): RoomCallbacks {
  return {
    board: undefined as unknown as Server,
    persist: async () => {},
    onFrameEnd: async () => {},
    onMatchEnd: async () => {},
    log: () => {}
  }
}
