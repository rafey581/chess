import { prisma } from '../db/index.js'
import type { Prisma, PrismaClient } from '@prisma/client'
import { MatchError, assertNotBot } from '../matches/service.js'
import { TOURNAMENT_SIZE } from '@snooker/shared'
import { notify } from '../notifications/service.js'
import { applyTournamentChampion, notifyProgress } from '../progress/service.js'

export interface BracketSlot {
  seeds: number[]
  matchId?: string
  winnerSeed?: number
}

export interface BracketRound {
  slots: BracketSlot[]
}

export interface Bracket {
  rounds: BracketRound[]
}

type Tx = Prisma.TransactionClient

const PAIRINGS = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7]
]

export async function createTournament(name: string): Promise<{ id: string; status: string }> {
  const tournament = await prisma.tournament.create({
    data: { name, size: TOURNAMENT_SIZE, status: 'OPEN' }
  })
  return { id: tournament.id, status: tournament.status }
}

export async function joinTournament(tournamentId: string, userId: string): Promise<{ joined: boolean; players: number; size: number }> {
  await assertNotBot(userId)
  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { players: true } })
    if (!tournament) throw new MatchError('tournament not found')
    if (tournament.status !== 'OPEN' && tournament.status !== 'DRAFT') throw new MatchError('tournament not open')
    if (tournament.players.some((p) => p.userId === userId)) throw new MatchError('already joined')
    if (tournament.players.length >= tournament.size) throw new MatchError('tournament is full')

    const seed = tournament.players.length + 1
    await tx.tournamentPlayer.create({ data: { tournamentId, userId, seed, status: 'ALIVE' } })
    const count = await tx.tournamentPlayer.count({ where: { tournamentId } })
    if (count >= tournament.size) {
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: 'FULL' } })
      await createInitialRound(tx, tournamentId)
      await tx.tournament.update({ where: { id: tournamentId }, data: { startedAt: new Date(), status: 'IN_PROGRESS' } })
    }
    return { joined: true, players: count, size: tournament.size }
  })
}

async function createInitialRound(tx: Tx, tournamentId: string): Promise<void> {
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { players: true } })
  if (!tournament) throw new MatchError('tournament not found')
  const slots: BracketSlot[] = []
  for (const pair of PAIRINGS) {
    const created = await createTournamentMatch(tx, tournamentId, 1, pair, tournament.format)
    slots.push({ seeds: pair, matchId: created.id })
  }
  const rounds: BracketRound[] = [{ slots }]
  rounds.push({ slots: [{ seeds: [] }, { seeds: [] }] })
  rounds.push({ slots: [{ seeds: [] }] })
  await tx.tournament.update({ where: { id: tournamentId }, data: { resultsJson: { rounds } as unknown as Prisma.InputJsonValue } })
}

export async function createTournamentMatch(
  tx: Tx,
  tournamentId: string,
  round: number,
  seedPair: number[],
  format: string
): Promise<{ id: string }> {
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { players: true } })
  if (!tournament) throw new MatchError('tournament not found')
  const a = tournament.players.find((p) => p.seed === seedPair[0])
  const b = tournament.players.find((p) => p.seed === seedPair[1])
  if (!a || !b) throw new MatchError('seeds missing')
  const match = await tx.match.create({
    data: {
      matchType: 'TOURNAMENT',
      tournamentId,
      round,
      format,
      stakePerPlayer: Number(tournament.entryFee),
      platformFeePct: 0,
      status: 'WAITING_FOR_PLAYER',
      resultJson: { seeds: seedPair },
      players: {
        create: [
          { userId: a.userId, seat: 0 },
          { userId: b.userId, seat: 1 }
        ]
      }
    }
  })
  return { id: match.id }
}

/**
 * Bracket updates for one tournament run one at a time.
 *
 * Each update reads the bracket, records a result and writes the bracket back. Two
 * matches finishing a few milliseconds apart used to interleave those steps, so the
 * second write overwrote the first result and the next round (eventually the final)
 * was never created. The server runs as a single process, so a per-tournament queue
 * is enough to make the read-modify-write safe.
 */
const advanceQueues = new Map<string, Promise<void>>()

export async function advanceTournamentAfterMatch(matchId: string, winnerUserId: string): Promise<void> {
  const owner = await prisma.match.findUnique({ where: { id: matchId }, select: { tournamentId: true } })
  const tournamentId = owner?.tournamentId
  if (!tournamentId) return
  const previous = advanceQueues.get(tournamentId) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() => advanceTournamentNow(matchId, winnerUserId))
  advanceQueues.set(tournamentId, run)
  try {
    await run
  } finally {
    if (advanceQueues.get(tournamentId) === run) advanceQueues.delete(tournamentId)
  }
}

async function advanceTournamentNow(matchId: string, winnerUserId: string): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { players: true } } }
  })
  if (!match?.tournament) return
  const tournament = match.tournament
  if (tournament.status === 'COMPLETED') return

  const bracket = (tournament.resultsJson ?? { rounds: [] }) as unknown as Bracket
  if (!Array.isArray(bracket.rounds)) return

  const winner = tournament.players.find((p) => p.userId === winnerUserId)
  if (!winner) return

  let found = false
  for (const round of bracket.rounds) {
    for (const slot of round.slots) {
      if (slot.matchId === matchId) {
        slot.winnerSeed = winner.seed
        found = true
        break
      }
    }
    if (found) break
  }
  if (!found) return

  const championSeed = bracket.rounds.at(-1)?.slots.find((s) => s.winnerSeed !== undefined)?.winnerSeed

  await commitTournamentResults(tournament, bracket)
  await markEliminated(tournament, bracket, championSeed)

  if (championSeed !== undefined) {
    const championPlayer = tournament.players.find((p) => p.seed === championSeed)
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        championId: championPlayer?.userId,
        runnerUpId: findRunnerUpSeed(bracket, championSeed) !== undefined
          ? tournament.players.find((p) => p.seed === findRunnerUpSeed(bracket, championSeed))?.userId
          : null,
        finishedAt: new Date(),
        status: 'COMPLETED'
      }
    })
    if (championPlayer?.userId) {
      void notify(
        championPlayer.userId,
        'TOURNAMENT_RESULT',
        'You are the champion!',
        `${tournament.name} complete — ${tournament.players.length} players, you took the crown.`
      )
      try {
        notifyProgress(await applyTournamentChampion(championPlayer.userId))
      } catch {
        // The title is already recorded; a missed XP bonus must not undo the bracket.
      }
    }
  }
}

function findRunnerUpSeed(bracket: Bracket, championSeed: number): number | undefined {
  const finalSlot = bracket.rounds.at(-1)?.slots.find((s) => s.winnerSeed !== undefined)
  if (!finalSlot) return undefined
  const runnerUp = finalSlot.seeds.find((s) => s !== championSeed)
  if (runnerUp !== undefined) return runnerUp
  for (let r = bracket.rounds.length - 1; r >= 0; r--) {
    for (const slot of bracket.rounds[r]!.slots) {
      if (slot.winnerSeed === undefined) continue
      const seed = slot.seeds.find((s) => s !== slot.winnerSeed)
      if (seed !== undefined && seed !== championSeed) return seed
    }
  }
  return undefined
}

async function commitTournamentResults(tournament: { id: string; format: string; resultsJson: unknown }, bracket: Bracket): Promise<void> {
  const rounds = [...bracket.rounds]
  for (let r = 1; r < rounds.length; r++) {
    const prev = rounds[r - 1]!.slots
    for (let i = 0; i < rounds[r]!.slots.length; i++) {
      const childA = prev[2 * i]
      const childB = prev[2 * i + 1]
      if (!childA || !childB) continue
      const aWin = childA.winnerSeed
      const bWin = childB.winnerSeed
      if (aWin === undefined || bWin === undefined) continue
      const slot = rounds[r]!.slots[i]!
      if (slot.matchId) continue
      const pair = [aWin, bWin]
      const created = await createTournamentMatchDirect(tournament.id, r + 1, pair, tournament.format)
      slot.seeds = pair
      slot.matchId = created.id
    }
  }
  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { resultsJson: { rounds } as unknown as Prisma.InputJsonValue }
  })
}

async function createTournamentMatchDirect(
  tournamentId: string,
  round: number,
  seedPair: number[],
  format: string
): Promise<{ id: string }> {
  return prisma.$transaction((tx) => createTournamentMatch(tx, tournamentId, round, seedPair, format))
}

async function markEliminated(tournament: { id: string }, bracket: Bracket, championSeed?: number): Promise<void> {
  const eliminatedSeeds = new Set<number>()
  for (const round of bracket.rounds) {
    for (const slot of round.slots) {
      if (slot.winnerSeed === undefined) continue
      for (const seed of slot.seeds) {
        if (seed !== slot.winnerSeed) eliminatedSeeds.add(seed)
      }
    }
  }
  const players = await prisma.tournamentPlayer.findMany({ where: { tournamentId: tournament.id } })
  for (const player of players) {
    let next: string
    if (player.seed === championSeed) {
      next = 'CHAMPION'
    } else if (eliminatedSeeds.has(player.seed)) {
      next = 'ELIMINATED'
    } else {
      next = 'ALIVE'
    }
    if (player.status !== next) {
      await prisma.tournamentPlayer.update({ where: { id: player.id }, data: { status: next } })
    }
  }
}