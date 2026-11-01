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
  const humanWhite = st.snapshot.whiteSeat === 0
  check('colours drawn by lot (game 1 white seat is 0 or 1)', st.snapshot.whiteSeat === 0 || st.snapshot.whiteSeat === 1)
  if (!humanWhite) await waitFor<any>(s, 'game:update', (u) => u.frame.moves.length === 1, 8000)
  const target = humanWhite ? 2 : 3
  const reply = waitFor<any>(s, 'game:update', (u) => u.frame.moves.length === target, 8000)
  s.emit('move:play', { matchId, move: humanWhite ? { from: 'e2', to: 'e4' } : { from: 'e7', to: 'e5' } })
  const u = await reply
  check('robot replied with a move', typeof u.frame.moves[target - 1] === 'string' && u.frame.turnSeat === 0, u.frame.moves)
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

async function drawAndArmageddon(): Promise<void> {
  console.log('agreed draw in a single game goes to Armageddon; resigning it decides the match')
  const a = await register('da')
  const b = await register('db')
  const sa = await connect(a.token)
  const sb = await connect(b.token)
  const ch = await api('/api/challenges', { method: 'POST', token: a.token, body: { stakeTier: 'TIER_1', format: 'BO1' } })
  const acc = await api(`/api/challenges/${ch.data.id}/accept`, { method: 'POST', token: b.token, body: {} })
  const matchId: string = acc.data.matchId
  const joined = waitFor<any>(sa, 'match:joined')
  sa.emit('match:join', { matchId })
  const ja = await joined
  const started = waitFor<any>(sa, 'match:start')
  sb.emit('match:join', { matchId })
  await started
  const offered = waitFor<any>(sb, 'game:update', (u) => u.frame.drawOfferBy === ja.seat)
  sa.emit('draw:offer', { matchId })
  await offered
  check('draw offer reaches the opponent', true)
  const arm = waitFor<any>(sa, 'frame:start', () => true, 10000)
  sb.emit('draw:respond', { matchId, accept: true })
  const f = await arm
  check('agreed draw scores half a point each', f.framesWon[0] === 0.5 && f.framesWon[1] === 0.5, f.framesWon)
  check('Armageddon game follows', f.snapshot.armageddon === true)
  const w = f.snapshot.whiteSeat
  check('Armageddon clocks 5:00 vs 4:00', f.snapshot.clocksMs[w] === 300000 && f.snapshot.clocksMs[1 - w] === 240000, f.snapshot.clocksMs)
  const end = waitFor<any>(sb, 'match:end')
  sa.emit('game:resign', { matchId })
  const e = await end
  check('resigning the Armageddon game hands over the match', e.winnerSeat === 1 - ja.seat, e)
  sa.disconnect()
  sb.disconnect()
}

async function practiceBestOfThree(): Promise<void> {
  console.log('practice with the best-of-3 game type')
  const p = await register('p3')
  const r = await api('/api/practice/start', { method: 'POST', token: p.token, body: { aiLevel: 'EASY', format: 'BO3' } })
  check('best-of-3 practice started', r?.ok === true, r)
  const m = await api(`/api/matches/${r.data.id}`, { token: p.token })
  check('practice match stored as BO3', m?.data?.format === 'BO3', m?.data?.format)
  const bad = await api('/api/practice/start', { method: 'POST', token: p.token, body: { aiLevel: 'EASY', format: 'BO7' } })
  check('unknown game type refused', bad?.ok === false)
  await api('/api/practice/resign', { method: 'POST', token: p.token, body: { matchId: r.data.id } })
}

async function tournament(): Promise<void> {
  console.log('8-player knockout tournament to a champion')
  const players = await Promise.all(Array.from({ length: 8 }, (_, i) => register(`t${i}`)))
  const sockets = await Promise.all(players.map((pl) => connect(pl.token)))
  const created = await api('/api/tournaments', { method: 'POST', token: players[0]!.token, body: { name: 'E2E Cup' } })
  check('tournament created', created?.ok === true, created)
  const tid: string = created.data.id
  for (const pl of players) {
    const j = await api('/api/tournaments/join', { method: 'POST', token: pl.token, body: { tournamentId: tid } })
    if (!j?.ok) check(`join ${pl.username}`, false, j)
  }
  const extra = await register('tx')
  const late = await api('/api/tournaments/join', { method: 'POST', token: extra.token, body: { tournamentId: tid } })
  check('a ninth player is refused', late?.ok === false, late)
  let t = (await api(`/api/tournaments/${tid}`, { token: players[0]!.token })).data
  check('full tournament starts', t.status === 'IN_PROGRESS', t.status)
  const byUser = new Map(players.map((pl, i) => [pl.username, i]))

  const playMatch = async (match: any, gameByGame: boolean): Promise<void> => {
    const [p0, p1] = [match.players.find((x: any) => x.seat === 0), match.players.find((x: any) => x.seat === 1)]
    const s0 = sockets[byUser.get(p0.user.username)!]!
    const s1 = sockets[byUser.get(p1.user.username)!]!
    const started = waitFor<any>(s0, 'match:start')
    s0.emit('match:join', { matchId: match.id })
    await waitFor<any>(s0, 'match:joined')
    s1.emit('match:join', { matchId: match.id })
    const st = await started
    check(`match ${match.id.slice(-4)} is best of 3`, match.format === 'BO3', match.format)
    const end = waitFor<any>(s0, 'match:end', () => true, 20000)
    if (gameByGame) {
      // Seat 1 resigns game 1, then game 2 after the next game starts: 2-0 to seat 0.
      const next = waitFor<any>(s0, 'frame:start', () => true, 10000)
      s1.emit('game:resign', { matchId: match.id })
      const f = await next
      check('tournament game 2 starts after a resignation, colours swapped', f.snapshot.whiteSeat !== st.snapshot.whiteSeat && f.framesWon[0] === 1, f.framesWon)
      s1.emit('game:resign', { matchId: match.id })
    } else {
      s1.emit('concede', { matchId: match.id })
    }
    const e = await end
    if (e.winnerSeat !== 0) check('seat 0 wins', false, e)
  }

  for (let round = 1; round <= 3; round++) {
    t = (await api(`/api/tournaments/${tid}`, { token: players[0]!.token })).data
    const open = t.matches.filter((m: any) => m.round === round)
    check(`round ${round} has ${8 >> round} match(es)`, open.length === 8 >> round, open.length)
    for (let i = 0; i < open.length; i++) await playMatch(open[i], round === 1 && i === 0)
    // Settlement and bracket advance run just after match:end.
    for (let k = 0; k < 40; k++) {
      t = (await api(`/api/tournaments/${tid}`, { token: players[0]!.token })).data
      const done = round === 3 ? t.status === 'COMPLETED' : t.matches.filter((m: any) => m.round === round + 1).length === 8 >> (round + 1)
      if (done) break
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  check('tournament completed with a champion', t.status === 'COMPLETED' && !!t.championId, { status: t.status, champion: t.championId })
  check('runner-up recorded', !!t.runnerUpId)
  const finalMatch = t.matches.find((m: any) => m.round === 3)
  const finalWinner = finalMatch?.players.find((x: any) => x.seat === 0)?.userId
  check('champion is the final winner', t.championId === finalWinner)
  sockets.forEach((s) => s.disconnect())
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
  await drawAndArmageddon()
  await practiceBestOfThree()
  await tournament()
  console.log(`\n${passed} passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('e2e crashed:', error)
  process.exit(1)
})
