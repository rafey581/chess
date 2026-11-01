import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../db/index.js'
import { createTournament, joinTournament, advanceTournamentAfterMatch } from './service.js'

const TAG = `adv${Date.now().toString(36)}`
const userIds: string[] = []

async function user(i: number): Promise<string> {
  const u = await prisma.user.create({
    data: { email: `${TAG}${i}@test.local`, username: `${TAG}${i}`.slice(0, 24), passwordHash: 'x', wallet: { create: {} } }
  })
  userIds.push(u.id)
  return u.id
}

afterAll(async () => {
  await prisma.$disconnect()
})

describe('tournament bracket advance', () => {
  it('keeps every result when matches finish at the same moment', async () => {
    const t = await createTournament(`${TAG} cup`)
    const ids = await Promise.all(Array.from({ length: 8 }, (_, i) => user(i)))
    for (const id of ids) await joinTournament(t.id, id)
    const winnerOf = async (round: number) => {
      const matches = await prisma.match.findMany({ where: { tournamentId: t.id, round }, include: { players: true } })
      return matches.map((m) => ({ id: m.id, winner: m.players.find((p) => p.seat === 0)!.userId }))
    }
    // All four quarter-finals report together, then both semi-finals together.
    await Promise.all((await winnerOf(1)).map((m) => advanceTournamentAfterMatch(m.id, m.winner)))
    const semis = await winnerOf(2)
    expect(semis).toHaveLength(2)
    await Promise.all(semis.map((m) => advanceTournamentAfterMatch(m.id, m.winner)))
    const final = await winnerOf(3)
    expect(final).toHaveLength(1)
    await advanceTournamentAfterMatch(final[0]!.id, final[0]!.winner)
    const done = await prisma.tournament.findUnique({ where: { id: t.id } })
    expect(done?.status).toBe('COMPLETED')
    expect(done?.championId).toBe(final[0]!.winner)
  })
})
