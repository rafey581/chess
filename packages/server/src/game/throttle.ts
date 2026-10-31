/**
 * Flood and shape checks for incoming chess moves.
 *
 * The room is the authority on legality; this only refuses traffic that is too fast or
 * not shaped like a move at all, before it reaches the rules engine.
 */
import type { ChessMoveInput } from '@snooker/shared'

const SQUARE = /^[a-h][1-8]$/
const PROMOTIONS = new Set(['q', 'r', 'b', 'n'])

interface Bucket {
  tokens: number
  at: number
}

class BucketLimiter {
  private buckets = new Map<string, Bucket>()
  constructor(private capacity: number, private refillPerSec: number) {}

  take(key: string): boolean {
    const now = Date.now()
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now }
    const elapsed = Math.max(0, now - bucket.at) / 1000
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSec)
    bucket.at = now
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket)
      return false
    }
    bucket.tokens -= 1
    this.buckets.set(key, bucket)
    return true
  }
}

type MoveCheck = { ok: true; move: ChessMoveInput } | { ok: false; reason: string }

export class MoveEnforcement {
  private perSocket = new BucketLimiter(20, 10)
  private perUser = new BucketLimiter(40, 20)

  take(socketId: string, userId: string): boolean {
    return this.perSocket.take(socketId) && this.perUser.take(userId)
  }

  validate(input: unknown): MoveCheck {
    if (typeof input !== 'object' || input === null) return { ok: false, reason: 'bad_input' }
    const m = input as { from?: unknown; to?: unknown; promotion?: unknown }
    if (typeof m.from !== 'string' || !SQUARE.test(m.from)) return { ok: false, reason: 'bad_square' }
    if (typeof m.to !== 'string' || !SQUARE.test(m.to)) return { ok: false, reason: 'bad_square' }
    if (m.promotion !== undefined && (typeof m.promotion !== 'string' || !PROMOTIONS.has(m.promotion))) {
      return { ok: false, reason: 'bad_promotion' }
    }
    return {
      ok: true,
      move: { from: m.from, to: m.to, ...(m.promotion ? { promotion: m.promotion as ChessMoveInput['promotion'] } : {}) }
    }
  }
}
