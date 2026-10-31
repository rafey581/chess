/**
 * End-to-end check against a running server (pnpm e2e).
 *
 * Registers fresh players, then drives real socket clients through:
 *  - a staked best-of-one decided by checkmate, with the wallet settlement checked;
 *  - illegal and out-of-turn moves being refused;
 *  - a practice game where the robot answers a move;
 *  - a resignation, which concedes the match and the stake.
 *
 * Needs the server on BASE with a migrated database.
 */
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

const BASE = process.env.E2E_BASE ?? 'http://localhost:4000'
let failures = 0
let passed = 0

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed++
    console.log(`  PASS ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}`)
  }
}

async function api(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  })
  return res.json().catch(() => null)
}

async function register(tag: string): Promise<{ token: string; username: string }> {
  const u = `${tag}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 24)
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: {
      email: `${u}@e2e.local`,
      username: u,
      password: 'E2e-Strong-pass-1!',
      phone: `555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
      dateOfBirth: '1990-01-01',
      deviceId: `web:e2e${u}`
    }
  })
  const token = r?.data?.token ?? r?.token
  if (!token) throw new Error(`register failed: ${JSON.stringify(r)}`)
  return { token, username: u }
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'] })
    s.once('connect', () => resolve(s))
    s.once('connect_error', reject)
  })
}

function waitFor<T = any>(socket: Socket, event: string, pred: (p: T) => boolean = () => true, timeoutMs = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timeout waiting for ${event}`))
    }, timeoutMs)
    const handler = (payload: T) => {
      if (!pred(payload)) return
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })
}

const wallet = async (token: string) => (await api('/api/wallet', { token }))?.data as { balance: number; locked: number }

async function stakedCheckmate(): Promise<void> {
  console.log('staked best-of-one decided by checkmate')
  const a = await register('ea')
  const b = await register('eb')
  const before = [await wallet(a.token), await wallet(b.token)]
  check('both players start with 1 USDT', before.every((w) => w.balance === 1), before)
  const sa = await connect(a.token)
  const sb = await connect(b.token)
  const matchedA = waitFor<{ matchId: string }>(sa, 'challenge:matched')
  const ch = await api('/api/challenges', { method: 'POST', token: a.token, body: { stakeTier: 'TIER_1', format: 'BO1' } })
  check('challenge opened', ch?.ok === true, ch)
  const acc = await api(`/api/challenges/${ch.data.id}/accept`, { method: 'POST', token: b.token, body: {} })
  check('challenge accepted', acc?.ok === true, acc)
  const matchId: string = acc.data.matchId
  check('opener told about the match', (await matchedA).matchId === matchId)

  const joinedA = waitFor<any>(sa, 'match:joined')
  sa.emit('match:join', { matchId })
  const ja = await joinedA
  const startB = waitFor<any>(sb, 'match:start')
  sb.emit('match:join', { matchId })
  const start = await startB
  check('match starts with white to move', start.snapshot.turnSeat === start.snapshot.whiteSeat)
  const seatA: number = ja.seat
  const white = start.snapshot.whiteSeat === seatA ? sa : sb
  const black = white === sa ? sb : sa

  const err = waitFor<{ code: string }>(black, 'error')
  black.emit('move:play', { matchId, move: { from: 'e7', to: 'e5' } })
  check('out-of-turn move refused', (await err).code === 'not_your_turn')
  const err2 = waitFor<{ code: string }>(white, 'error')
  white.emit('move:play', { matchId, move: { from: 'e2', to: 'e5' } })
  check('illegal move refused', (await err2).code === 'illegal_move')
  const err3 = waitFor<{ code: string }>(white, 'error')
  white.emit('move:play', { matchId, move: { from: 'z9', to: 'e4' } })
  check('malformed square refused', (await err3).code === 'bad_square')

  const play = async (s: Socket, from: string, to: string, n: number) => {
    const upd = waitFor<any>(sa, 'game:update', (p) => p.frame.moves.length === n)
    s.emit('move:play', { matchId, move: { from, to } })
    return upd
  }
  await play(white, 'f2', 'f3', 1)
  await play(black, 'e7', 'e5', 2)
  await play(white, 'g2', 'g4', 3)
  const endP = waitFor<any>(sa, 'match:end')
  const last = await play(black, 'd8', 'h4', 4)
  check('mate recorded in notation', last.frame.moves[3] === 'Qh4#', last.frame.moves)
  check('game result is checkmate', last.frame.result === 'CHECKMATE')
  const end = await endP
  const blackSeat = 1 - start.snapshot.whiteSeat
  check('black wins the match', end.winnerSeat === blackSeat, end)

  let after = [await wallet(a.token), await wallet(b.token)]
  // Settlement runs just after match:end; wait for both stakes to be released.
  for (let i = 0; i < 40 && (after[0].locked > 0 || after[1].locked > 0); i++) {
    await new Promise((r) => setTimeout(r, 250))
    after = [await wallet(a.token), await wallet(b.token)]
  }
  const winnerIsA = blackSeat === seatA
  const winner = winnerIsA ? after[0] : after[1]
  const loser = winnerIsA ? after[1] : after[0]
  check('loser paid the stake', loser.balance === 0 && loser.locked === 0, after)
  check('winner paid the pot less the fee', Math.abs(winner.balance - 1.8) < 1e-9 && winner.locked === 0, after)
  sa.disconnect()
  sb.disconnect()
}

async function practiceRobot(): Promise<void> {
  console.log('practice game: the robot answers')
  const p = await register('ep')
  const s = await connect(p.token)
  const r = await api('/api/practice/start', { method: 'POST', token: p.token, body: { aiLevel: 'MEDIUM' } })
  check('practice started', r?.ok === true, r)
  const matchId: string = r.data.id
  const start = waitFor<any>(s, 'match:start')
  s.emit('match:join', { matchId })
  const st = await start
  check('human plays white in game 1', st.snapshot.whiteSeat === 0)
  const reply = waitFor<any>(s, 'game:update', (u) => u.frame.moves.length === 2, 8000)
  s.emit('move:play', { matchId, move: { from: 'e2', to: 'e4' } })
  const u = await reply
  check('robot replied with a move', typeof u.frame.moves[1] === 'string' && u.frame.turnSeat === 0, u.frame.moves)
  const done = await api('/api/practice/resign', { method: 'POST', token: p.token, body: { matchId } })
  check('practice can be finished', done?.ok === true, done)
  s.disconnect()
}

async function resignation(): Promise<void> {
  console.log('resignation concedes the match')
  const a = await register('ra')
  const b = await register('rb')
  const sa = await connect(a.token)
  const sb = await connect(b.token)
  const ch = await api('/api/challenges', { method: 'POST', token: a.token, body: { stakeTier: 'TIER_1', format: 'BO3' } })
  const acc = await api(`/api/challenges/${ch.data.id}/accept`, { method: 'POST', token: b.token, body: {} })
  const matchId: string = acc.data.matchId
  const joined = waitFor<any>(sa, 'match:joined')
  sa.emit('match:join', { matchId })
  const ja = await joined
  const started = waitFor<any>(sa, 'match:start')
  sb.emit('match:join', { matchId })
  await started
  const end = waitFor<any>(sb, 'match:end')
  sa.emit('concede', { matchId })
  const e = await end
  check('resigning hands the match to the opponent', e.winnerSeat === 1 - ja.seat && e.reason === 'concede', e)
  sa.disconnect()
  sb.disconnect()
}

async function main(): Promise<void> {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)
  if (!health) {
    console.log(`server not reachable at ${BASE}`)
    process.exit(1)
  }
  await stakedCheckmate()
  await practiceRobot()
  await resignation()
  console.log(`\n${passed} passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('e2e crashed:', error)
  process.exit(1)
})
