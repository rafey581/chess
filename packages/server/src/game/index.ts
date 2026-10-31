import { Server } from 'socket.io'
import type { Server as HttpServer } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/index.js'
import { config } from '../config.js'
import { GameRoom } from './room.js'
import type { GameUpdateEvent } from './room.js'
import { MoveEnforcement } from './throttle.js'
import { noteRejectedShot, recordFraudFlag } from '../fraud/index.js'
import { tokenIsCurrent, verifyToken } from '../auth/guards.js'
import { settleMatch, refundMatch } from '../matches/service.js'
import { notify, setNotificationPusher } from '../notifications/service.js'
import { setAnnouncementBroadcaster } from '../announcements/service.js'
import { setChallengeSenders, expireStaleChallenges } from '../challenges/service.js'
import { isMaintenance, getSettings } from '../settings/index.js'
import { PRACTICE_DAILY_FREE_LIMIT } from '@snooker/shared'
import type { PracticeAiLevel } from '@snooker/shared'
import { isMatchChatPhrase, MATCH_CHAT_COOLDOWN_MS } from '@snooker/shared'
import type { Prisma } from '@prisma/client'
import { touchLastSeen } from '../users/activity.js'

export interface GameServerContext {
  io: Server
  rooms: Map<string, GameRoom>
}

export function createGameServer(app: FastifyInstance, httpServer: HttpServer): GameServerContext {
  const io = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN, credentials: true }
  })
  const rooms = new Map<string, GameRoom>()
  const roomLocks = new Map<string, Promise<void>>()
  const graceTimers = new Map<string, NodeJS.Timeout>()
  const moves = new MoveEnforcement()
  /** Last quick-chat line per user, for the per-line cooldown. */
  const lastChatAt = new Map<string, number>()

  function clearGraceTimer(matchId: string): void {
    const timer = graceTimers.get(matchId)
    if (timer) {
      clearTimeout(timer)
      graceTimers.delete(matchId)
    }
  }

  function startGraceTimer(matchId: string, room: GameRoom): void {
    if (graceTimers.has(matchId) || room.stopped) return
    void getSettings().then((settings) => {
      const graceMs = Math.max(1, Math.round(settings.reconnectGraceSec)) * 1000
      const timer = setTimeout(() => {
        graceTimers.delete(matchId)
        void resolveDisconnected(matchId, room)
      }, graceMs)
      graceTimers.set(matchId, timer)
      // The player still at the table is shown how long the other has to come back
      // before the match is theirs: the deadline itself, so every screen counts to the
      // same moment however late the message arrives.
      room.broadcast('opponent:countdown', {
        seats: room.disconnectedSeats(),
        deadline: Date.now() + graceMs,
        seconds: Math.round(graceMs / 1000)
      })
    })
  }

  async function resolveDisconnected(matchId: string, room: GameRoom): Promise<void> {
    if (room.stopped) return
    const disconnected = room.disconnectedSeats()
    if (disconnected.length === 0) {
      clearGraceTimer(matchId)
      return
    }
    const practice = room.matchType === 'PRACTICE'
    const isBothGone = disconnected.length >= 2
    let winnerSeat: number | null = null
    if (!practice && !isBothGone) {
      winnerSeat = disconnected[0] === 0 ? 1 : 0
    } else if (!practice && isBothGone) {
      const frames = room.match.framesWon ?? [0, 0]
      if (frames[0] !== frames[1]) winnerSeat = frames[0] > frames[1] ? 0 : 1
    }
    app.log.info({ matchId, disconnected, winnerSeat, practice }, 'grace timer resolved disconnected match')
    room.dispose()
    rooms.delete(matchId)
    clearGraceTimer(matchId)
    if (practice) {
      await prisma.match.update({
        where: { id: matchId },
        data: { status: 'MATCH_COMPLETED', finishedAt: new Date(), resultJson: { reason: 'abandon' } }
      })
      return
    }
    if (winnerSeat !== null) {
      const winnerUserId = room.userIdForSeat(winnerSeat)
      if (winnerUserId) {
        room.broadcast('match:end', { winnerSeat, reason: 'abandon' })
        await settleGracefully(winnerUserId)
      }
      return
    }
    await refundGracefully()

    // The match can be deleted out from under the room between the lease being
    // taken and this refund landing (an admin, or a result that was cleaned up
    // while the grace timer was still counting). The room is already closed by
    // then and a deleted match has no money to move, so the right move is to log
    // and move on — letting the rejection escape would take the whole socket
    // server down for no gain.
    async function settleGracefully(winnerUserId: string): Promise<void> {
      try {
        await settleMatch({ matchId, winnerId: winnerUserId, reason: 'abandon' })
      } catch (error) {
        app.log.error({ err: error, matchId }, 'grace timer could not settle abandoned match')
      }
    }
    async function refundGracefully(): Promise<void> {
      try {
        await refundMatch(matchId, 'abandon_double_disconnect')
      } catch (error) {
        app.log.error({ err: error, matchId }, 'grace timer could not refund abandoned match')
      }
    }
  }

  setNotificationPusher((userId, notification) => {
    io.to(`user:${userId}`).emit('notification:new', notification)
  })

  // Announcements go to every connected player at once; the rest see them on next open.
  setAnnouncementBroadcaster((announcement) => {
    io.emit('announcement:new', announcement)
  })

  // Challenge events are transient — a fresh table offer, or the news that one
  // closed — so they are pushed straight at the sockets rather than stored. A
  // broadcast goes to every connected player once (rooms are per user, so a
  // player with two tabs is still told once), optionally skipping the
  // challenger, who already knows.
  const emitToUser = (userId: string, event: string, payload: unknown): void => {
    io.to(`user:${userId}`).emit(event, payload)
  }
  const emitToAll = (event: string, payload: unknown, exceptUserId?: string): void => {
    const seen = new Set<string>()
    for (const socket of io.sockets.sockets.values()) {
      const connectedUserId = socket.data.userId as string | undefined
      if (!connectedUserId || connectedUserId === exceptUserId || seen.has(connectedUserId)) continue
      seen.add(connectedUserId)
      io.to(`user:${connectedUserId}`).emit(event, payload)
    }
  }
  setChallengeSenders({ toUser: emitToUser, toAll: emitToAll })

  // Open challenges are short-lived. This retires the ones past their deadline
  // and tells every client to drop the popup; `unref` keeps the timer from
  // holding the process open on shutdown.
  const challengeSweep = setInterval(() => {
    void expireStaleChallenges().catch((error) => {
      app.log.error({ err: error }, 'challenge expiry sweep failed')
    })
  }, 10_000)
  challengeSweep.unref?.()


  function runExclusive(matchId: string, fn: () => Promise<void>): Promise<void> {
    const prev = roomLocks.get(matchId) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    roomLocks.set(matchId, next)
    return next
  }

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? socket.handshake.query.token as string | undefined
    const payload = token ? verifyToken(token) : null
    if (!payload) {
      next(new Error('unauthorized'))
      return
    }
    const user = await prisma.user.findUnique({ where: { id: payload.id } })
    if (!user || user.status !== 'ACTIVE') {
      next(new Error('forbidden'))
      return
    }
    if (!tokenIsCurrent(payload, user)) {
      next(new Error('unauthorized'))
      return
    }
    if (await isMaintenance()) {
      next(new Error('maintenance'))
      return
    }
    socket.data.userId = user.id
    touchLastSeen(user)
    next()
  })

  const persist = async (events: GameUpdateEvent[]): Promise<void> => {
    if (events.length === 0) return
    await prisma.gameEvent.createMany({ data: events as unknown as Prisma.GameEventCreateManyInput[] })
  }

  const makeCallbacks = (matchId: string) => ({
    board: io,
    persist,
    log: (msg: string) => app.log.debug(msg),
    onFrameEnd: async (id: string, frameWinner: number | null, scores: { player0: number; player1: number }) => {
      app.log.info({ id, frameWinner, scores }, 'frame ended')
      void id
    },
    onMatchEnd: async (id: string, matchWinner: number, reason: string) => {
      app.log.info({ id, matchWinner, reason }, 'match ended')
      const endedRoom = rooms.get(id)
      if (endedRoom) {
        endedRoom.dispose()
        rooms.delete(id)
      }
      clearGraceTimer(id)
      try {
        const match = await prisma.match.findUnique({ where: { id }, include: { players: true, tournament: true } })
        if (!match) return
        const winnerUserId = match.players.find((p) => p.seat === matchWinner)?.userId
        if (!winnerUserId) return
        if (match.matchType === 'PRACTICE') {
          await prisma.match.update({
            where: { id },
            data: { status: 'MATCH_COMPLETED', finishedAt: new Date(), resultJson: { reason, winnerUserId } }
          })
          const human = match.players.find((p) => p.seat === 0)
          if (human) {
            const wallet = await prisma.wallet.findUnique({ where: { userId: human.userId } })
            const available = wallet ? Number(wallet.available) : 0
            let body = 'Your practice against the robot has ended — nice session.'
            if (available <= 0) {
              const dayStart = new Date()
              dayStart.setUTCHours(0, 0, 0, 0)
              const playedToday = await prisma.match.count({
                where: { matchType: 'PRACTICE', createdAt: { gte: dayStart }, players: { some: { userId: human.userId } } }
              })
              const remaining = Math.max(0, PRACTICE_DAILY_FREE_LIMIT - playedToday)
              body = `Practice complete — ${remaining} free practice match${remaining === 1 ? '' : 'es'} left today.`
            }
            await notify(human.userId, 'PRACTICE', 'Practice complete', body)
          }
          return
        }
        await settleMatch({
          matchId: id,
          winnerId: winnerUserId,
          reason,
          tournamentId: match.tournamentId ?? undefined,
          round: match.round ?? undefined
        })
        if (match.tournament) {
          const { advanceTournamentAfterMatch } = await import('../tournaments/service.js')
          await advanceTournamentAfterMatch(id, winnerUserId)
        }
      } catch (error) {
        app.log.error({ err: error, id, matchWinner, reason }, 'onMatchEnd failed')
      }
    }
  })

  function getOrCreateRoom(matchId: string): GameRoom | null {
    const existing = rooms.get(matchId)
    if (existing) return existing
    return null
  }

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string
    socket.join(`user:${userId}`)

    socket.on('match:join', (payload: { matchId: string }) => {
      const { matchId } = payload ?? {}
      if (!matchId) {
        socket.emit('error', { code: 'bad_request' })
        return
      }
      void runExclusive(matchId, async () => {
        const match = await prisma.match.findUnique({
          where: { id: matchId },
          include: { players: true }
        })
        if (!match) {
          socket.emit('error', { code: 'match_not_found' })
          return
        }
        const entry = match.players.find((p) => p.userId === userId)
        if (!entry) {
          socket.emit('error', { code: 'not_in_match' })
          return
        }
        if (['PRIZE_SETTLED', 'REFUNDED', 'MATCH_COMPLETED'].includes(match.status)) {
          const winnerSeat = match.winnerId ? match.players.find((p) => p.userId === match.winnerId)?.seat ?? undefined : undefined
          socket.emit('match:end', {
            winnerSeat,
            reason: (match.resultJson as { reason?: string } | null)?.reason ?? 'settled'
          })
          return
        }
        const callbacks = makeCallbacks(matchId)
        let room = rooms.get(matchId)
        if (!room) {
          let aiLevel: PracticeAiLevel | undefined
          if (match.aiLevel) aiLevel = match.aiLevel as PracticeAiLevel
          room = new GameRoom(matchId, match.matchType, match.format, aiLevel, callbacks)
          rooms.set(matchId, room)
        }
        room.registerSocket(userId, entry.seat, socket.id)
        socket.join(`match:${matchId}`)
        const current = room.snapshot()
        // The turn timing goes out with the join, not just with the frame broadcasts.
        // A client that was away missed those, and the deadline it was last told
        // about has long since passed; without this it would come back to a clock
        // that says expired, or to no clock at all while the room was still counting.
        socket.emit('match:joined', { matchId, seat: entry.seat, snapshot: current, turn: room.turnTiming() })
        const missStart = room.deliveredSeqForUser(userId) + 1
        const untilSeq = room.currentSeq()
        if (missStart <= untilSeq) {
          const rows = await prisma.gameEvent.findMany({
            where: { matchId, seq: { gte: missStart, lte: untilSeq } },
            orderBy: { seq: 'asc' }
          })
          if (rows.length > 0) {
            socket.emit('match:replay', { events: rows as unknown as GameUpdateEvent[] })
          }
        }
        if (room.disconnectedSeats().length === 0) clearGraceTimer(matchId)
        const started = room.tryStart()
        if (started) {
          await prisma.match.update({
            where: { id: matchId },
            data: { status: 'MATCH_STARTED', startedAt: new Date() }
          })
        }
      })
    })

    const signalAbuse = (code: string): void => {
      const signal = noteRejectedShot(userId, code)
      if (signal) void recordFraudFlag(signal, userId)
    }

    // A move from the player whose turn it is. Shape and flood checks happen here; the
    // room is the authority on whether the move is legal and whose turn it is.
    socket.on('move:play', (payload: { matchId: string; move: unknown }) => {
      const { matchId, move } = payload ?? {}
      if (!matchId) {
        socket.emit('error', { code: 'bad_request' })
        return
      }
      if (!moves.take(socket.id, userId)) {
        socket.emit('error', { code: 'rate_limited' })
        signalAbuse('rate_limited')
        return
      }
      const valid = moves.validate(move)
      if (!valid.ok) {
        socket.emit('error', { code: valid.reason })
        signalAbuse(valid.reason)
        return
      }
      const room = getOrCreateRoom(matchId)
      if (!room) {
        socket.emit('error', { code: 'match_not_found' })
        return
      }
      const result = room.handleMove(userId, valid.move)
      if (!result.accepted) socket.emit('error', { code: result.error ?? 'rejected' })
    })

    socket.on('concede', (payload: { matchId: string }) => {
      const { matchId } = payload ?? {}
      if (!matchId) {
        socket.emit('error', { code: 'bad_request' })
        return
      }
      void runExclusive(matchId, async () => {
        const room = getOrCreateRoom(matchId)
        if (!room) {
          socket.emit('error', { code: 'match_not_found' })
          return
        }
        room.handleConcede(userId)
      })
    })

    // In-match quick chat. The client never sends free text: it sends one of the
    // shared phrase ids, and the whitelist refuses anything that is not a known id.
    socket.on('match:chat', (payload: { matchId: string; phraseId: string }) => {
      const { matchId, phraseId } = payload ?? {}
      if (!matchId || typeof phraseId !== 'string' || phraseId.length === 0) {
        socket.emit('error', { code: 'bad_request' })
        return
      }
      if (!isMatchChatPhrase(phraseId)) {
        socket.emit('error', { code: 'bad_phrase' })
        return
      }
      const room = getOrCreateRoom(matchId)
      if (!room) {
        socket.emit('error', { code: 'match_not_found' })
        return
      }
      const seat = room.getSeat(userId)
      if (seat === undefined) {
        socket.emit('error', { code: 'not_in_match' })
        return
      }
      const last = lastChatAt.get(userId) ?? 0
      if (Date.now() - last < MATCH_CHAT_COOLDOWN_MS) {
        socket.emit('error', { code: 'chat_rate_limited' })
        return
      }
      if (lastChatAt.size > 5000) lastChatAt.clear()
      lastChatAt.set(userId, Date.now())
      room.broadcast('match:chat', { seat, phraseId, at: Date.now() })
    })

    socket.on('disconnect', () => {
      for (const [matchId, room] of rooms) {
        if (room.getSeat(userId) === undefined) continue
        const seat = room.getSeat(userId)!
        room.unregisterSocket(userId, socket.id)
        socket.leave(`match:${matchId}`)
        if (room.started && room.isSeatDisconnected(seat)) startGraceTimer(matchId, room)
      }
    })
  })

  return { io, rooms }
}

export async function recoverMatchValidity(): Promise<void> {
  const stale = await prisma.match.findMany({
    where: { status: 'MATCH_STARTED', matchType: { not: 'PRACTICE' } }
  })
  for (const match of stale) {
    await refundMatch(match.id, 'server_recovery_refund')
  }
}