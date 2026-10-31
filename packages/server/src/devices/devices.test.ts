import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db/index.js'
import { buildApp } from '../app.js'

/** One account per phone, over HTTP: sign-up and login as the app sends them. */

const TAG = `dev${Date.now() % 1000000}`
let app: FastifyInstance
let n = 0
const usernames: string[] = []

function signup(deviceId?: string) {
  n++
  const username = `d${n}${TAG}`
  usernames.push(username)
  return app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: {
      email: `${username}@test.local`,
      username,
      password: 'Password123!',
      phone: `+1999${String(Date.now()).slice(-5)}${n}`,
      dateOfBirth: '1995-06-15',
      ...(deviceId ? { deviceId } : {})
    }
  })
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: usernames } } })
  await app.close()
})

describe('one account per phone', () => {
  it('lets the first account through and refuses a second on the same phone', async () => {
    const phone = `android:${TAG}aaaa`
    const first = await signup(phone)
    expect(first.statusCode).toBe(200)
    const second = await signup(phone)
    expect(second.statusCode).toBe(409)
    expect(second.json()).toMatchObject({ ok: false, code: 'device_limit' })
    expect((second.json() as { error: string }).error).toMatch(/already has a Chess Stake account/)
    // Nothing was created for the refused sign-up.
    expect(await prisma.user.count({ where: { username: usernames[usernames.length - 1] } })).toBe(0)
  })

  it('allows another phone', async () => {
    const res = await signup(`android:${TAG}bbbb`)
    expect(res.statusCode).toBe(200)
  })

  it('refuses a new account on a phone someone has logged in on', async () => {
    const own = await signup(`android:${TAG}cccc`)
    expect(own.statusCode).toBe(200)
    const username = usernames[usernames.length - 1]!
    // That player logs in on a second phone, which then may not create an account of its own.
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'Password123!', deviceId: `android:${TAG}dddd` } })
    expect(login.statusCode).toBe(200)
    const res = await signup(`android:${TAG}dddd`)
    expect(res.statusCode).toBe(409)
  })

  it('asks an app too old to send a phone id to update', async () => {
    const res = await signup(undefined)
    expect(res.statusCode).toBe(426)
    expect(res.json()).toMatchObject({ code: 'update_required' })
  })

  it('does not let two sign-ups sent at once from one phone both through', async () => {
    const phone = `android:${TAG}eeee`
    const results = await Promise.all([signup(phone), signup(phone), signup(phone)])
    const codes = results.map((r) => r.statusCode).sort()
    expect(codes).toEqual([200, 409, 409])
  })

  it('records the phone of a player who stays signed in, when the app opens', async () => {
    const own = await signup(`android:${TAG}gggg`)
    expect(own.statusCode).toBe(200)
    const token = (own.json() as { data: { token: string } }).data.token
    const status = await app.inject({ method: 'GET', url: `/api/auth/status?deviceId=android:${TAG}hhhh`, headers: { authorization: `Bearer ${token}` } })
    expect(status.statusCode).toBe(200)
    const res = await signup(`android:${TAG}hhhh`)
    expect(res.statusCode).toBe(409)
  })

  it('never blocks a login, whatever the phone', async () => {
    const own = await signup(`android:${TAG}ffff`)
    expect(own.statusCode).toBe(200)
    const username = usernames[usernames.length - 1]!
    // A phone that already holds another account.
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'Password123!', deviceId: `android:${TAG}aaaa` } })
    expect(login.statusCode).toBe(200)
    const noId = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'Password123!' } })
    expect(noId.statusCode).toBe(200)
  })
})
