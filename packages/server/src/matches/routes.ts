import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db/index.js'
import { createOneVsOneMatch, joinOneVsOneMatch, MatchError, createPracticeMatch, settleMatch } from './service.js'
import { STAKE_TIERS, STAKE_TIER_IDS, PRACTICE_AI_LEVELS, SELECTABLE_FORMATS } from '@snooker/shared'

const createMatchSchema = z.object({
  stakeTier: z.enum(STAKE_TIER_IDS),
  format: z.enum(['BO1', 'BO3', 'BO5']).default('BO3')
})

const practiceSchema = z.object({
  aiLevel: z.enum(PRACTICE_AI_LEVELS).default('MEDIUM'),
  // Single game or best of 3, chosen by the player.
  format: z.enum(SELECTABLE_FORMATS).default('BO1')
})

const joinMatchSchema = z.object({
  matchId: z.string()
})

const concedeSchema = z.object({
  matchId: z.string()
})

export async function registerMatchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/matches/tiers', async (_request, reply) => {
    return reply.send({ ok: true, data: STAKE_TIERS })
  })

  app.post('/api/matches', async (request, reply) => {
    const parsed = createMatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid input' })
    try {
      const match = await createOneVsOneMatch(request.authUser!.id, parsed.data.stakeTier, parsed.data.format)
      return reply.send({ ok: true, data: match })
    } catch (error) {
      if (error instanceof MatchError) return reply.code(400).send({ ok: false, error: error.message })
      throw error
    }
  })

  app.get('/api/matches/lobby', async (_request, reply) => {
    const open = await prisma.match.findMany({
      where: { status: 'WAITING_FOR_PLAYER', matchType: { in: ['ONE_V_ONE', 'MASTER'] } },
      include: { players: { include: { user: { select: { id: true, username: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    })
    return reply.send({ ok: true, data: open })
  })

  app.post('/api/matches/join', async (request, reply) => {
    const parsed = joinMatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid input' })
    try {
      const match = await joinOneVsOneMatch(parsed.data.matchId, request.authUser!.id)
      return reply.send({ ok: true, data: match })
    } catch (error) {
      if (error instanceof MatchError) return reply.code(400).send({ ok: false, error: error.message })
      throw error
    }
  })

  app.post('/api/matches/concede', async (request, reply) => {
    const parsed = concedeSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid input' })
    const match = await prisma.match.findUnique({
      where: { id: parsed.data.matchId },
      include: { players: true }
    })
    if (!match) return reply.code(404).send({ ok: false, error: 'match not found' })
    const conceder = match.players.find((p) => p.userId === request.authUser!.id)
    if (!conceder) return reply.code(403).send({ ok: false, error: 'not in match' })
    const winner = match.players.find((p) => p.seat !== conceder.seat)
    if (!winner) return reply.code(400).send({ ok: false, error: 'no opponent' })
    await settleMatch({ matchId: match.id, winnerId: winner.userId, reason: 'opponent_conceded' })
    return reply.send({ ok: true, data: { winnerId: winner.userId } })
  })

  app.get('/api/matches/:id', async (request, reply) => {
    const match = await prisma.match.findUnique({
      where: { id: (request.params as { id: string }).id },
      include: { players: { include: { user: { select: { id: true, username: true } } } } }
    })
    if (!match) return reply.code(404).send({ ok: false, error: 'match not found' })
    return reply.send({ ok: true, data: match })
  })

  app.get('/api/matches/history', async (request, reply) => {
    const url = new URL(request.url, 'http://localhost')
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const matches = await prisma.match.findMany({
      where: {
        matchType: { not: 'PRACTICE' },
        status: { in: ['PRIZE_SETTLED', 'MATCH_COMPLETED', 'RESULT_VERIFIED', 'REFUNDED'] },
        players: { some: { userId: request.authUser!.id } }
      },
      include: { players: { include: { user: { select: { id: true, username: true } } } } },
      orderBy: { finishedAt: 'desc' },
      take: limit
    })
    return reply.send({ ok: true, data: matches })
  })

  app.post('/api/practice/start', async (request, reply) => {
    const parsed = practiceSchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid input' })
    try {
      const match = await createPracticeMatch(request.authUser!.id, parsed.data.aiLevel, parsed.data.format)
      return reply.send({ ok: true, data: match })
    } catch (error) {
      if (error instanceof MatchError) return reply.code(400).send({ ok: false, error: error.message })
      throw error
    }
  })

  app.post('/api/practice/resign', async (request, reply) => {
    const parsed = concedeSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid input' })
    await prisma.match.update({
      where: { id: parsed.data.matchId },
      data: { status: 'MATCH_COMPLETED', finishedAt: new Date() }
    })
    return reply.send({ ok: true })
  })

  app.get('/api/practice/history', async (request, reply) => {
    const matches = await prisma.match.findMany({
      where: { matchType: 'PRACTICE', players: { some: { userId: request.authUser!.id } } },
      orderBy: { finishedAt: 'desc' },
      take: 50
    })
    return reply.send({ ok: true, data: matches })
  })
}