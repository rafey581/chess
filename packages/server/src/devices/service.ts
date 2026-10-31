import type { Prisma } from '@prisma/client'
import { prisma } from '../db/index.js'
import { config } from '../config.js'

/**
 * One account per phone.
 *
 * The app sends the phone's id (its ANDROID_ID, see packages/client/src/deviceId.ts) when
 * someone signs up or logs in. Every account seen on a phone is remembered, and a new
 * account is refused on a phone that already has MAX_ACCOUNTS_PER_DEVICE of them, so
 * logging in to one account and then trying to sign up another is caught too.
 *
 * It is not proof against a determined cheat (a factory reset gives a new id), but it
 * stops making a second account in a few taps.
 */

/** "android:<hex>", "ios:<uuid>" or "web:<random>". */
export const DEVICE_ID_PATTERN = /^(android|ios|web):[A-Za-z0-9_-]{6,120}$/

export class DeviceLimitError extends Error {
  constructor() {
    super('This phone already has a Chess Stake account. Please log in with that account instead.')
  }
}

export class DeviceIdRequiredError extends Error {
  constructor() {
    super('Please update the app to the latest version to create an account.')
  }
}

/**
 * Checks, inside the sign-up transaction, that one more account may be made on this
 * device. Takes a lock on the device id first, so two sign-ups sent at the same moment
 * from one phone cannot both see room for themselves.
 */
export async function assertDeviceCanSignUp(tx: Prisma.TransactionClient, deviceId: string | undefined): Promise<void> {
  if (!deviceId) {
    if (config.REQUIRE_DEVICE_ID_FOR_SIGNUP) throw new DeviceIdRequiredError()
    return
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'device:' + deviceId}))`
  const accounts = await tx.deviceAccount.count({ where: { deviceId } })
  if (accounts >= config.MAX_ACCOUNTS_PER_DEVICE) throw new DeviceLimitError()
}

/** Records that `userId` was created on this device (inside the sign-up transaction). */
export async function recordSignupDevice(tx: Prisma.TransactionClient, deviceId: string | undefined, userId: string): Promise<void> {
  if (!deviceId) return
  await tx.deviceAccount.create({ data: { deviceId, userId, createdHere: true } })
}

/** Records a login from this device. Best effort: it must never stop a login. */
export async function recordLoginDevice(deviceId: string | undefined, userId: string): Promise<void> {
  if (!deviceId) return
  try {
    await prisma.deviceAccount.upsert({
      where: { deviceId_userId: { deviceId, userId } },
      create: { deviceId, userId },
      update: { lastSeenAt: new Date() }
    })
  } catch (error) {
    console.warn('device not recorded for login:', error instanceof Error ? error.message : error)
  }
}
