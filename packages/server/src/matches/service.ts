import { prisma } from '../db/index.js'
import { ledger, runInTransaction, round } from '../wallet/service.js'
import type { Tx } from '../wallet/service.js'
import { getSettings } from '../settings/index.js'
import { framesToWin, STAKE_TIERS, PRACTICE_DAILY_FREE_LIMIT, matchTypeForStake } from '@snooker/shared'
import type { StakeTierId } from '@snooker/shared'
import { notify } from '../notifications/service.js'
import { config } from '../config.js'
import { rewardReferralForFirstMatch } from '../referrals/service.js'
import type { ReferralReward } from '../referrals/service.js'
import { applyMatchProgress, notifyProgress } from '../progress/service.js'
import type { ProgressOutcome } from '../progress/service.js'

export const PLATFORM_USER_EMAIL = 'platform@snooker.internal'
export const BOT_USER_EMAIL = 'bot@snooker.internal'

export class MatchError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export async function validateStake(stake: number): Promise<void> {
  const settings = await getSettings()
  if (!Number.isFinite(stake) || stake <= 0) throw new MatchError('invalid stake')
  if (stake < settings.minStake) throw new MatchError(`minimum stake is ${settings.minStake}`)
  if (stake > settings.maxStake) throw new MatchError(`maximum stake is ${settings.maxStake}`)
}

export async function resolveStakeTier(tierId: StakeTierId): Promise<{ id: string; usdt: number; label: string }> {
  const tier = STAKE_TIERS.find((t) => t.id === tierId)
  if (!tier) throw new MatchError('unknown stake tier')
  await validateStake(tier.usdt)
  return tier
}

export async function assertViableFormat(format: string): Promise<void> {
  const settings = await getSettings()
  if (!settings.matchFormats.includes(format)) {
    throw new MatchError(`format ${format} is not enabled (allowed: ${settings.matchFormats.join(', ')})`)
  }
}

export async function assertNotBot(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role === 'BOT') throw new MatchError('bot accounts cannot play real tables')
}

export async function getPlatformUserId(): Promise<string> {
  return ensureInternalUser(PLATFORM_USER_EMAIL, 'Platform', 'ADMIN')
}

export async function getBotUserId(): Promise<string> {
  return ensureInternalUser(BOT_USER_EMAIL, 'Robot', 'BOT')
}

async function ensureInternalUser(email: string, username: string, role: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } })
    if (existing) return existing.id
    const created = await tx.user.create({
      data: {
        email,
        username,
        passwordHash: '!',
        role,
        status: role === 'BOT' ? 'BOT' : 'ACTIVE',
        wallet: { create: { available: 0 } }
      }
    })
    return created.id
  })
}

export async function createOneVsOneMatch(ownerId: string, stakeTier: StakeTierId, format: string): Promise<{ id: string; status: string }> {
  await assertNotBot(ownerId)
  await assertViableFormat(format)
  const tier = await resolveStakeTier(stakeTier)
  const settings = await getSettings()
  return runInTransaction(async (tx) => {
    const match = await tx.match.create({
      data: {
        matchType: matchTypeForStake(tier.id),
        stakeTier: tier.id,
        stakePerPlayer: tier.usdt,
        format,
        status: 'WAITING_FOR_PLAYER',
        platformFeePct: settings.commissionPct
      }
    })
    await tx.matchPlayer.create({ data: { matchId: match.id, userId: ownerId, seat: 0 } })
    await ledger.freezeForMatch(tx, {
      userId: ownerId,
      amount: tier.usdt,
      type: 'MATCH_ENTRY',
      refId: match.id,
      meta: { stage: 'create', stakeTier: tier.id }
    })
    return { id: match.id, status: match.status }
  })
}

export async function joinOneVsOneMatch(matchId: string, playerId: string): Promise<{ id: string; status: string }> {
  await assertNotBot(playerId)
  const { id, status, ownerId } = await runInTransaction(
    async (tx): Promise<{ id: string; status: string; ownerId: string | undefined }> => {
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { players: true } })
      if (!match) throw new MatchError('match not found')
      if (match.status !== 'WAITING_FOR_PLAYER') throw new MatchError('match is not open')
      if (match.players.length >= 2) throw new MatchError('match is full')
      if (match.players.some((p) => p.userId === playerId)) throw new MatchError('already in match')
      const stake = Number(match.stakePerPlayer)
      await ledger.freezeForMatch(tx, {
        userId: playerId,
        amount: stake,
        type: 'MATCH_ENTRY',
        refId: matchId,
        meta: { stage: 'join' }
      })
      await tx.matchPlayer.create({ data: { matchId, userId: playerId, seat: 1 } })
      const updated = await tx.match.update({
        where: { id: matchId },
        data: { status: 'MATCH_STARTED', startedAt: new Date() }
      })
      return { id: updated.id, status: updated.status, ownerId: match.players.find((p) => p.seat === 0)?.userId }
    }
  )
  if (ownerId && ownerId !== playerId) {
    const joiner = await prisma.user.findUnique({ where: { id: playerId }, select: { username: true } })
    void notify(ownerId, 'MATCH_INVITE', `${joiner?.username ?? 'A player'} joined your match`, 'The table is full — your match is starting.')
  }
  return { id, status }
}

export async function refundMatch(matchId: string, reason: string): Promise<void> {
  await runInTransaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { players: true } })
    if (!match) throw new MatchError('match not found')
    if (match.status === 'REFUNDED' || match.status === 'PRIZE_SETTLED') return
    const stake = Number(match.stakePerPlayer)
    for (const player of match.players) {
      await ledger.unfreezeFromMatch(tx, {
        userId: player.userId,
        amount: stake,
        type: 'MATCH_REFUND',
        refId: matchId,
        meta: { reason }
      })
    }
    await tx.match.update({ where: { id: matchId }, data: { status: 'REFUNDED', finishedAt: new Date() } })
  })
}

export interface Settlement {
  matchId: string
  winnerId: string
  reason: string
  tournamentId?: string
  round?: number
}

export async function settleMatch(settlement: Settlement): Promise<void> {
  const outcome = await runInTransaction(
    async (tx): Promise<{
      winnerId: string
      loserId: string
      stake: number
      prize: number
      reason: string
      referralRewards: ReferralReward[]
      progress: Array<ProgressOutcome | null>
    } | null> => {
      const match = await tx.match.findUnique({ where: { id: settlement.matchId }, include: { players: true } })
      if (!match) throw new MatchError('match not found')
      if (match.status === 'PRIZE_SETTLED' || match.status === 'REFUNDED') return null
      const winner = match.players.find((p) => p.userId === settlement.winnerId)
      const loser = match.players.find((p) => p.userId !== settlement.winnerId)
      if (!winner || !loser) throw new MatchError('players missing')
      if (!['MATCH_STARTED', 'MATCH_IN_PROGRESS'].includes(match.status)) throw new MatchError('match not playable')

      const stake = Number(match.stakePerPlayer)
      const pool = round(stake * 2)
      const fee = round(pool * Number(match.platformFeePct))
      const prize = round(pool - fee)
      const resultJson = {
        reason: settlement.reason,
        framesToWin: framesToWin(match.format),
        pool,
        fee,
        prize,
        tournamentId: settlement.tournamentId,
        round: settlement.round
      }

      if (stake > 0) {
        const meta = { pool, fee, reason: settlement.reason, stage: 'settle' }
        await ledger.consumeLocked(tx, { userId: winner.userId, amount: stake, type: 'MATCH_ENTRY', refId: match.id, meta: { ...meta, side: 'winner' } })
        await ledger.consumeLocked(tx, { userId: loser.userId, amount: stake, type: 'MATCH_ENTRY', refId: match.id, meta: { ...meta, side: 'loser' } })
        await ledger.creditAvailable(tx, {
          userId: winner.userId,
          amount: prize,
          type: 'PRIZE',
          refId: match.id,
          counterpartyId: loser.userId,
          meta
        })
        const platformId = await resolvePlatformId(tx)
        if (fee > 0) {
          await ledger.creditAvailable(tx, {
            userId: platformId,
            amount: fee,
            type: 'PLATFORM_FEE',
            refId: match.id,
            meta
          })
        }
      }

      await tx.match.update({
        where: { id: match.id },
        data: { status: 'PRIZE_SETTLED', winnerId: winner.userId, finishedAt: new Date(), resultJson }
      })
      await tx.matchPlayer.updateMany({ where: { matchId: match.id, userId: winner.userId }, data: { result: 'WIN' } })
      await tx.matchPlayer.updateMany({ where: { matchId: match.id, userId: loser.userId }, data: { result: 'LOSS' } })

      // Invitations: finishing a first real match is what pays the inviter. Both
      // players are checked; each can be an invitee of a different inviter. A
      // practice match only counts if the operator has opted in.
      const referralRewards: ReferralReward[] = []
      const countsForReferral = match.matchType !== 'PRACTICE' || config.REFERRAL_COUNT_PRACTICE
      if (countsForReferral) {
        for (const playerId of [winner.userId, loser.userId]) {
          const reward = await rewardReferralForFirstMatch(tx, playerId)
          if (reward) referralRewards.push(reward)
        }
      }

      // Levels, ranks and badges: written with the result so they award exactly once.
      const practice = match.matchType === 'PRACTICE'
      const progress = [
        await applyMatchProgress(tx, { userId: winner.userId, won: true, practice, reason: settlement.reason, aiLevel: match.aiLevel }),
        await applyMatchProgress(tx, { userId: loser.userId, won: false, practice, reason: settlement.reason, aiLevel: match.aiLevel })
      ]
      return { winnerId: winner.userId, loserId: loser.userId, stake, prize, reason: settlement.reason, referralRewards, progress }
    }
  )
  if (outcome) {
    const users = await prisma.user.findMany({ where: { id: { in: [outcome.winnerId, outcome.loserId] } }, select: { id: true, username: true } })
    const winnerName = users.find((u) => u.id === outcome.winnerId)?.username ?? 'Opponent'
    const loserName = users.find((u) => u.id === outcome.loserId)?.username ?? 'Opponent'
    const how =
      outcome.reason === 'games' || outcome.reason === 'frames'
        ? 'match decided on games won'
        : outcome.reason === 'abandon'
          ? 'opponent abandoned the match'
          : outcome.reason === 'concede'
            ? 'opponent conceded'
            : 'match resolved'
    if (outcome.stake > 0) {
      void notify(outcome.winnerId, 'MATCH_RESULT', `You won ${outcome.prize} USDT`, `vs ${loserName} — ${how}`)
      void notify(outcome.loserId, 'MATCH_RESULT', 'You lost the match', `vs ${winnerName} — ${outcome.stake} USDT settled`)
    } else {
      void notify(outcome.winnerId, 'MATCH_RESULT', 'You won the match', `vs ${loserName} — ${how}`)
      void notify(outcome.loserId, 'MATCH_RESULT', 'You lost the match', `vs ${winnerName} — ${how}`)
    }
    for (const progress of outcome.progress) notifyProgress(progress)
    for (const reward of outcome.referralRewards) {
      void notify(
        reward.referrerId,
        'REFERRAL_BONUS',
        `You earned ${reward.amount} USDT`,
        `${reward.inviteeUsername} played their first match — your invite reward was credited.`
      )
    }
  }
}

async function resolvePlatformId(tx: Tx): Promise<string> {
  const platform = await tx.user.findUnique({ where: { email: PLATFORM_USER_EMAIL } })
  if (platform) return platform.id
  const created = await tx.user.create({
    data: {
      email: PLATFORM_USER_EMAIL,
      username: 'platform',
      passwordHash: '!',
      role: 'ADMIN',
      wallet: { create: { available: 0 } }
    }
  })
  return created.id
}

export async function createPracticeMatch(playerId: string, aiLevel: string, format: string): Promise<{ id: string; status: string }> {
  await assertNotBot(playerId)
  await assertViableFormat(format)
  const wallet = await prisma.wallet.findUnique({ where: { userId: playerId } })
  const available = wallet ? Number(wallet.available) : 0
  if (available <= 0) {
    const dayStart = new Date()
    dayStart.setUTCHours(0, 0, 0, 0)
    const playedToday = await prisma.match.count({
      where: {
        matchType: 'PRACTICE',
        createdAt: { gte: dayStart },
        players: { some: { userId: playerId } }
      }
    })
    if (playedToday >= PRACTICE_DAILY_FREE_LIMIT) {
      throw new MatchError(`free practice limit reached: ${PRACTICE_DAILY_FREE_LIMIT} matches/day while balance is 0`)
    }
  }
  const botUserId = await getBotUserId()
  const match = await prisma.match.create({
    data: {
      matchType: 'PRACTICE',
      stakePerPlayer: 0,
      format,
      status: 'MATCH_STARTED',
      aiLevel,
      platformFeePct: 0,
      startedAt: new Date(),
      players: {
        create: [
          { userId: playerId, seat: 0 },
          { userId: botUserId, seat: 1 }
        ]
      }
    }
  })
  return { id: match.id, status: match.status }
}