import { prisma } from '../db/index.js'

export type FraudKind = 'SHOT_FLOOD' | 'SHOT_REPLAY' | 'CLOCK_SKEW' | 'MALFORMED_INPUT'

export interface FraudSignal {
  kind: FraudKind
  confidence: number
  reason: string
}

const WINDOW_MS = 60_000
const DEDUPE_MS = 10 * 60_000

interface Rule {
  kind: FraudKind
  threshold: number
  confidence: number
  reason: string
}

const RULES: Record<string, Rule> = {
  rate_limited: { kind: 'SHOT_FLOOD', threshold: 8, confidence: 90, reason: 'move flood: excessive rate-limited attempts' },
  duplicate_shot: { kind: 'SHOT_REPLAY', threshold: 3, confidence: 80, reason: 'repeated duplicate shot inputs' },
  bad_timestamp: { kind: 'CLOCK_SKEW', threshold: 3, confidence: 40, reason: 'repeated pre-dated timestamps' },
  bad_input: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated malformed shot payloads' },
  bad_aim_angle: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated non-finite aim angle' },
  bad_power: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated out-of-range power' },
  bad_spin: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated malformed spin' },
  bad_cue_pos: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated malformed cue position' },
  bad_square: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated malformed move squares' },
  bad_promotion: { kind: 'MALFORMED_INPUT', threshold: 5, confidence: 35, reason: 'repeated malformed promotion piece' }
}

interface WindowState {
  count: number
  first: number
}

const windows = new Map<string, WindowState>()

export function noteRejectedShot(userId: string, code: string): FraudSignal | null {
  const rule = RULES[code]
  if (!rule) return null
  const now = Date.now()
  const key = `${userId}:${rule.kind}`
  const state = windows.get(key)
  const fresh = state && now - state.first <= WINDOW_MS
  const count = fresh ? state.count + 1 : 1
  if (count < rule.threshold) {
    windows.set(key, { count, first: fresh ? state.first : now })
    return null
  }
  windows.delete(key)
  return { kind: rule.kind, confidence: rule.confidence, reason: rule.reason }
}

export async function recordFraudFlag(signal: FraudSignal, userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user || user.role === 'BOT') return
    const recent = await prisma.fraudFlag.findFirst({
      where: { userId, kind: signal.kind, createdAt: { gte: new Date(Date.now() - DEDUPE_MS) } },
      select: { id: true }
    })
    if (recent) return
    await prisma.fraudFlag.create({
      data: { userId, kind: signal.kind, confidence: signal.confidence, reason: signal.reason }
    })
  } catch {
    void 0
  }
}

export interface FraudFlagRow {
  id: string
  userId: string
  username: string | null
  kind: string
  confidence: number
  reason: string | null
  createdAt: Date
}

export async function listFraudFlags(limit = 200): Promise<FraudFlagRow[]> {
  const [flags, users] = await Promise.all([
    prisma.fraudFlag.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.user.findMany({ select: { id: true, username: true } })
  ])
  const nameById = new Map(users.map((u) => [u.id, u.username]))
  return flags.map((f) => ({
    id: f.id,
    userId: f.userId,
    username: nameById.get(f.userId) ?? null,
    kind: f.kind,
    confidence: f.confidence,
    reason: f.reason,
    createdAt: f.createdAt
  }))
}

export interface LedgerViolation {
  userId: string
  expected: number
  actual: number
  delta: number
}

export interface LedgerInvarianceResult {
  ok: boolean
  checked: number
  violations: LedgerViolation[]
}

function round8(value: number): number {
  return Math.round(value * 1e8) / 1e8
}

export async function checkLedgerInvariance(): Promise<LedgerInvarianceResult> {
  // Both reads come from one snapshot. Read separately, a match or payout committing
  // between them shows up as a false violation (wallet moved, entry not yet seen).
  const [wallets, txns] = await prisma.$transaction(
    [
      prisma.wallet.findMany({ select: { userId: true, available: true, locked: true } }),
      prisma.walletTransaction.findMany({ select: { userId: true, balanceBefore: true, balanceAfter: true, meta: true } })
    ],
    { isolationLevel: 'RepeatableRead' }
  )
  const deltas = new Map<string, number>()
  for (const t of txns) {
    const deltaAvailable = t.balanceAfter.toNumber() - t.balanceBefore.toNumber()
    const meta = (t.meta ?? {}) as { lockedBefore?: number; lockedAfter?: number }
    const lockedBefore = typeof meta.lockedBefore === 'number' ? meta.lockedBefore : 0
    const lockedAfter = typeof meta.lockedAfter === 'number' ? meta.lockedAfter : 0
    const deltaLocked = lockedAfter - lockedBefore
    deltas.set(t.userId, (deltas.get(t.userId) ?? 0) + deltaAvailable + deltaLocked)
  }
  const violations: LedgerViolation[] = []
  for (const wallet of wallets) {
    const expected = deltas.get(wallet.userId) ?? 0
    const actual = wallet.available.toNumber() + wallet.locked.toNumber()
    const diff = round8(actual - expected)
    if (diff !== 0) violations.push({ userId: wallet.userId, expected, actual, delta: diff })
  }
  return { ok: violations.length === 0, checked: wallets.length, violations }
}