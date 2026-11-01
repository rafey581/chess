import './styles.css'
import { api, clearStoredToken, connectSocket, disconnectSocket, FAST_TIMEOUT_MS, getSocket, makeToast, readStoredToken, storeToken } from './game/network.js'
import { openSupportChat, refreshSupportChat } from './support.js'
import type { ChessSnapshot, ChessMoveInput } from '@snooker/shared'
import { APP_TITLE, describeGameEnd, isDrawResult, MATCH_CHAT_MAX_LOG, MATCH_CHAT_PHRASES, matchChatPhraseText, STAKE_TIERS, xpForMatch } from '@snooker/shared'
import type { MatchFormat, PracticeAiLevel } from '@snooker/shared'
import { createAvatarBadge } from './game/avatar.js'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  HOME_BAR,
  HOME_CARDS,
  barDestination,
  cardDestination,
  comingSoonMessage
} from './lobbyModel.js'
import type { AppScreen } from './lobbyModel.js'
import {
  USE_NEW_LOBBY,
  USE_LOADING_SCREEN,
  mountGamingLobby,
  showMatchLoading,
  ensureLobbyBgReady
} from './lobby/index.js'
import type { LobbyBridge, LobbySession, LoadPhase } from './lobby/index.js'
import type { Socket } from 'socket.io-client'
import { playMatchEnd, setSoundMuted, isSoundMuted, unlockAudio } from './game/audio.js'
import { armMusic } from './game/music.js'
import { isUnreachable, type SessionUser } from './session.js'
import { releaseLandscape, requestLandscape } from './game/hudMenu.js'
import { fillBalance } from './lobby/casino.js'
import { xpBar } from './lobby/progress.js'
import type { LobbyProgress } from './lobby/types.js'
import { renderAuthScreen, setAuthOfflineNotice } from './auth.js'
import { getDeviceId } from './deviceId.js'
import { askForDateOfBirthIfMissing } from './dobPrompt.js'
import { receiveAnnouncement, resetAnnouncements, setAnnouncements, showNextAnnouncement, type Announcement } from './announcements.js'
import './tournaments.css'
import { createChessView, formatPoints, type ChessClockTiming, type ChessView } from './chess/chessView.js'

const app = document.querySelector<HTMLDivElement>('#app')!
const toast = makeToast(document.body)

/** Lobby cash HUD: balance in real USDT, no coin/gem metaphor. */
function formatCash(amount: number | string): string {
  const n = typeof amount === 'number' ? amount : Number(amount)
  const value = Math.max(0, Number.isFinite(n) ? n : 0)
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return `${text} USDT`
}

let token = readStoredToken()
/**
 * True while a saved sign-in is being checked at start-up. The screen shows a neutral
 * loading card meanwhile: drawing the sign-in form first and swapping it for the lobby a
 * moment later read as being logged out and back in again.
 */
let checkingSession = token !== ''
let currentUser: SessionUser | null = null
let wallet = { balance: 0, locked: 0 }
let tiers: TierData[] = []
let activeTierId: string | null = null

interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string | null
  read: boolean
  createdAt: string
}

let notifications: NotificationItem[] = []
let panelOpen = false
let bellEl: HTMLElement | null = null
let badgeEl: HTMLElement | null = null
let panelEl: HTMLElement | null = null

/**
 * A live invitation to play, pushed by the server. `stakeLabel` is server-side so
 * the popup and the lobby agree on how a tier is written.
 */
interface ChallengeDto {
  id: string
  challengerId: string
  challengerUsername: string
  kind: 'PUBLIC' | 'FRIEND'
  targetUserId: string | null
  targetUsername: string | null
  stakeTier: string
  stakePerPlayer: number
  stakeLabel: string
  /** OPEN or MASTER. Older servers omit it; the tier id is the fallback. */
  table?: 'OPEN' | 'MASTER'
  format: string
  expiresAt: string
  /** True for an invite born from the rematch button, so the popup can say so. */
  rematch?: boolean
}

/** Invitations other players have sent me and I have not answered. */
let incomingChallenges: ChallengeDto[] = []
/** The table I opened and am waiting on someone to accept (null when I am not waiting). */
let pendingChallenge: ChallengeDto | null = null
let challengeLayerEl: HTMLElement | null = null
let challengeBusy = false

/**
 * In-match quick chat. The menu and the log are drawn inside the HUD by
 * `renderGame`; these references are what the socket listener and the toolbar
 * share so every phrase falls into the same box.
 */
let chatMenuEl: HTMLElement | null = null
let chatLogEl: HTMLElement | null = null

let activeMatchId: string | null = null
/**
 * Which of the screens behind a card or a bar icon is on.
 *
 * A screen rather than a URL: the app is one page and every one of these is a re-render,
 * so the id only has to survive long enough to choose the branch in `render`. A match or
 * a tournament still wins over it, because those are states rather than screens — you
 * leave whichever screen you were on to go and play, and you come back to it.
 */
let activeScreen: AppScreen = 'home'
/** The difficulty the setup screen opens on, kept so a trip to the lobby does not reset it. */
let practiceDifficulty: PracticeAiLevel = DEFAULT_DIFFICULTY

let mySeat: number | undefined
/** The latest board the server sent for the match on screen. */
let chessSnap: ChessSnapshot | null = null
let chessView: ChessView | null = null
let players: Array<{ id: string; userId: string; seat: number; user: { id: string; username: string } }> = []
let matchFormat = 'BO3'
let framesWon: [number, number] = [0, 0]
let frameIndex = 1
let connected = true
let activeMatchIsPractice = false
let activeTournamentId: string | null = null
let tournamentTimer: number | undefined
let lobbySession: LobbySession | null = null
let lastKnownTotalXp: number | null = null
let maintenanceMode = false
let maintenanceEl: HTMLElement | null = null
let opponentGone = false
let netOverlayEl: HTMLElement | null = null
const END_TROPHY_SVG =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 10h24v14a12 12 0 0 1-24 0z" fill="currentColor" fill-opacity="0.18"/>' +
  '<path d="M20 14h-8v4a8 8 0 0 0 8 8M44 14h8v4a8 8 0 0 1-8 8"/>' +
  '<path d="M32 36v10M22 54h20M26 46h12v8H26z"/></svg>'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * The gold corner brackets around the identity badge.
 *
 * Four angles and nothing else. The frame they belong to is drawn by the corners rather
 * than by a ring, because a ring reads as an outline of whatever it happens to be
 * holding, whereas four corners read as a mount: the eye joins them across the middle and
 * the portrait is left with a lip to sit behind. The stroke is one gradient in the page's
 * gold, run diagonally, so the bracket nearest the brand is the brightest and the one
 * opposite it is the deepest — the frame is lit rather than filled.
 */
function profileBadgeFrameSvg(): string {
  return (
    '<svg class="profile-badge-frame" viewBox="0 0 34 34" width="34" height="34" fill="none" aria-hidden="true">' +
    '<defs>' +
    '<linearGradient id="profile-badge-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="34" y2="34">' +
    '<stop offset="0" stop-color="#ffe6b0"/>' +
    '<stop offset="0.45" stop-color="#ffb02e"/>' +
    '<stop offset="1" stop-color="#b87613"/>' +
    '</linearGradient>' +
    '</defs>' +
    '<path d="M2.5 10.5V5.5A3 3 0 0 1 5.5 2.5h5M23.5 2.5h5a3 3 0 0 1 3 3v5M31.5 23.5v5a3 3 0 0 1-3 3h-5M10.5 31.5h-5a3 3 0 0 1-3-3v-5" ' +
    'stroke="url(#profile-badge-gold)" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>'
  )
}

/**
 * Lobby Header HUD: brand + single $ cash balance + slim profile menu.
 * Match screens keep their own overlay; this bar is for lobby / setup only.
 */
function header(_options: { home?: boolean } = {}): HTMLElement {
  const head = el('header', 'lobby-header')

  const brand = el('a', 'brand') as HTMLAnchorElement
  brand.href = '#'
  // The header is a logo, not a route. Handing it a real href and letting the click
  // through would drop the player out of a match with a page reload.
  brand.onclick = (e) => e.preventDefault()
  const logoIcon = el('span', 'brand-logo')
  logoIcon.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#c9a84c"/><circle cx="12" cy="12" r="7" fill="#0a0a0f"/><circle cx="9.5" cy="9.5" r="2.5" fill="#e8c872"/></svg>'
  brand.append(logoIcon, el('span', 'brand-name', APP_TITLE))
  head.appendChild(brand)

  const right = el('div', 'row header-actions')
  if (currentUser) {
    // Single cash counter — the balance is real USDT, no coin/gem metaphor.
    const walletChip = el('div', 'wallet-chip cash-hud')
    walletChip.id = 'wallet-chip'
    walletChip.title = 'Account balance'
    walletChip.appendChild(el('span', 'wallet-amount', formatCash(wallet.balance)))
    right.appendChild(walletChip)

    const supportBtn = el('button', 'icon-btn support-btn') as HTMLButtonElement
    supportBtn.type = 'button'
    supportBtn.title = 'Customer Support'
    supportBtn.textContent = '💬'
    supportBtn.onclick = () => openSupportChat()
    right.appendChild(supportBtn)

    right.appendChild(renderBell())

    // The player's face and name. It opens nothing: there are no account actions to offer.
    const menuWrap = el('div', 'profile-menu')
    const chip = el('div', 'user-chip user-chip-btn')
    chip.title = currentUser.username
    const badge = el('span', 'profile-badge')
    badge.innerHTML = profileBadgeFrameSvg()
    badge.appendChild(createAvatarBadge({ name: currentUser.username, isBot: false }))
    const conn = el('span', connected ? 'chip-ok' : 'chip-bad', connected ? 'online' : 'reconnecting…')
    conn.id = 'conn-chip'
    conn.setAttribute('role', 'status')
    badge.appendChild(conn)
    chip.appendChild(badge)
    const name = el('span', 'user-name')
    name.appendChild(el('strong', undefined, currentUser.username))
    chip.appendChild(name)

    // No log-out menu: one account per phone, and the phone stays signed in to it.
    menuWrap.append(chip)
    right.appendChild(menuWrap)
  }
  head.appendChild(right)
  return head
}

function bellSvg(): string {
  return '<svg class="bell-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5A3 3 0 0 0 5 4.5v1.1c0 .6-.2 1.2-.6 1.6l-.8.9a1.3 1.3 0 0 0 .9 2.2h7a1.3 1.3 0 0 0 .9-2.2l-.8-.9c-.4-.4-.6-1-.6-1.6V4.5A3 3 0 0 0 8 1.5Z"/><path d="M6.5 12a1.5 1.5 0 0 0 3 0h-3Z"/></svg>'
}

function renderBell(): HTMLElement {
  const wrap = el('div', 'bell-wrap')
  const bell = el('button', 'bell')
  bell.innerHTML = bellSvg()
  const badge = el('span', 'bell-badge', '')
  badge.id = 'bell-badge'
  badgeEl = badge
  bell.appendChild(badge)
  bell.onclick = (e) => {
    e.stopPropagation()
    panelOpen = !panelOpen
    if (panelOpen) refreshNotificationPanel()
    panelEl?.classList.toggle('open', panelOpen)
  }
  const panel = el('div', 'notif-panel')
  panel.id = 'notif-panel'
  panel.onclick = (e) => e.stopPropagation()
  panelEl = panel
  bellEl = wrap
  wrap.append(bell, panel)
  refreshBell()
  return wrap
}

function refreshBell(): void {
  if (!bellEl || !badgeEl) return
  const unread = notifications.filter((n) => !n.read).length
  badgeEl.textContent = unread > 0 ? String(unread) : ''
  badgeEl.hidden = unread === 0
  if (panelOpen) refreshNotificationPanel()
}

function refreshNotificationPanel(): void {
  if (!panelEl) return
  panelEl.innerHTML = ''
  const head = el('div', 'notif-head')
  head.appendChild(el('span', 'notif-title', 'Notifications'))
  const unread = notifications.filter((n) => !n.read).length
  head.appendChild(el('span', 'muted', unread > 0 ? `${unread} unread` : 'all caught up'))
  panelEl.appendChild(head)
  if (unread > 0) {
    const markAll = el('button', 'ghost', 'Mark all read')
    markAll.onclick = () => void markAllRead()
    panelEl.appendChild(markAll)
  }
  if (notifications.length === 0) {
    panelEl.appendChild(el('div', 'muted notif-empty', 'No notifications yet.'))
    return
  }
  const list = el('div', 'notif-list')
  for (const n of notifications.slice(0, 30)) {
    const item = el('button', n.read ? 'notif-item' : 'notif-item unread')
    item.onclick = () => void markOneRead(n.id)
    const title = el('div', 'notif-item-title', n.title)
    if (n.kind) title.classList.add(`kind-${n.kind.toLowerCase()}`)
    item.appendChild(title)
    if (n.body && n.body !== n.title) item.appendChild(el('div', 'muted notif-body', n.body))
    item.appendChild(el('div', 'muted notif-time', timeAgo(n.createdAt)))
    list.appendChild(item)
  }
  panelEl.appendChild(list)
}

/** Staff announcements on show; any not yet seen are shown once the lobby is up. */
async function fetchAnnouncements(): Promise<void> {
  const userId = currentUser?.id
  if (!userId) return
  try {
    setAnnouncements(userId, await api<Announcement[]>('/announcements'))
    if (!activeMatchId) showNextAnnouncement()
  } catch {
    // Not worth troubling the player about: they will be fetched on the next open.
  }
}

async function fetchNotifications(): Promise<void> {
  try {
    const data = await api<{ items: NotificationItem[]; unread: number }>('/notifications')
    notifications = data.items
    refreshBell()
  } catch {
    notifications = []
  }
}

async function markOneRead(id: string): Promise<void> {
  try {
    await api<{ updated: number }>('/notifications/read', { method: 'POST', body: { ids: [id] } })
    const target = notifications.find((n) => n.id === id)
    if (target) target.read = true
    refreshBell()
  } catch (error) {
    toast((error as Error).message, 'error')
  }
}

async function markAllRead(): Promise<void> {
  const unread = notifications.filter((n) => !n.read)
  if (unread.length === 0) return
  try {
    await api<{ updated: number }>('/notifications/read', { method: 'POST', body: { ids: unread.map((n) => n.id) } })
    for (const n of notifications) n.read = true
    refreshBell()
  } catch (error) {
    toast((error as Error).message, 'error')
  }
}

document.addEventListener('click', () => {
  if (panelOpen) {
    panelOpen = false
    panelEl?.classList.remove('open')
  }
})

function card(title?: string): HTMLElement {
  const c = el('div', 'card')
  if (title) c.appendChild(el('h3', undefined, title))
  return c
}

interface TierData {
  id: string
  usdt: number
  label: string
}

interface LobbyMatch {
  id: string
  stakeTier: string | null
  stakePerPlayer: string
  format: string
  createdAt: string
  players: Array<{
    userId: string
    user: { id: string; username: string }
  }>
}

interface MyProfile {
  user: {
    id: string
    username: string
    createdAt: string
    profile: { countryCode: string | null; avatarUrl: string | null; bio: string | null } | null
    wallet: { available: number }
  }
  stats: { matches: number; wins: number; losses: number; winRate: number; highestBreak: number }
}

interface LeaderboardRow {
  rank: number
  userId: string
  username: string
  matches: number
  wins: number
  losses: number
  winRate: number
  highestBreak: number
}

interface LeaderboardData {
  rows: LeaderboardRow[]
  me: LeaderboardRow | null
}

interface HistoryMatch {
  id: string
  format: string
  finishedAt: string | null
  winnerId: string | null
  stakePerPlayer: string
  players: Array<{ userId: string; user: { id: string; username: string } }>
}

interface OpenTournament {
  id: string
  name: string
  status: string
  size: number
  entryFee?: number | string
  createdAt: string
  _count: { players: number }
}

interface TournamentPlayer {
  id: string
  userId: string
  seed: number
  status: string | null
  user: { id: string; username: string }
}

interface TournamentMatch {
  id: string
  round: number | null
  status: string
  players: Array<{ id: string; userId: string; seat: number; user: { id: string; username: string } }>
}

interface BracketSlotData {
  seeds: number[]
  matchId?: string | null
  winnerSeed?: number | null
}

interface TournamentData {
  id: string
  name: string
  status: string
  entryFee: number | string
  size: number
  format: string
  championId: string | null
  runnerUpId: string | null
  finishedAt: string | null
  resultsJson: { rounds: Array<{ slots: BracketSlotData[] }> } | null
  players: TournamentPlayer[]
  matches: TournamentMatch[]
}

interface HistoryTournament {
  id: string
  name: string
  finishedAt: string | null
  _count: { players: number }
  players?: Array<{ user: { username: string } }>
}

async function refreshWallet(): Promise<void> {
  try {
    wallet = await api<{ balance: number; locked: number }>('/wallet')
  } catch {
    wallet = { balance: 0, locked: 0 }
  }
  // Patch the chip in place rather than waiting for the next render. During a match
  // the balance moves as stakes lock and settle, and the header is not re-rendered
  // for every state update, so without this the number on screen goes stale.
  const amount = document.querySelector<HTMLElement>('#wallet-chip .wallet-amount')
  if (amount) amount.textContent = formatCash(wallet.balance)
  // The lobby's own balance readouts: under the name on a phone, the wallet pill on a desktop.
  for (const node of document.querySelectorAll<HTMLElement>('.cx-profile__balance, .cx-wallet__value')) {
    fillBalance(node, formatCash(wallet.balance))
  }
  for (const node of document.querySelectorAll<HTMLElement>('.gl-profile__wallet')) {
    node.textContent = formatCash(wallet.balance)
  }
}

async function loadTiers(): Promise<void> {
  try {
    tiers = await api<TierData[]>('/matches/tiers')
  } catch {
    tiers = STAKE_TIERS.map((t) => ({ id: t.id, usdt: t.usdt, label: t.label }))
  }
  if (!tiers.length) return
  if (!activeTierId || !tiers.some((t) => t.id === activeTierId)) {
    activeTierId = tiers[0]!.id
  }
}

function leaveGameState(): void {
  activeMatchId = null
  chessSnap = null
  mySeat = undefined
  framesWon = [0, 0]
  frameIndex = 1
  players = []
  activeMatchIsPractice = false
  opponentGone = false
  stopOpponentCountdown()
  // The chat chrome belongs to the match being torn down; dropping the references
  // keeps a stray incoming line from appending to a detached element.
  chatMenuEl = null
  chatLogEl = null
  chessView?.destroy()
  chessView = null
  drawBarEl = null
}

function opponentName(): string {
  if (activeMatchIsPractice) return 'Robot'
  const opp = players.find((p) => p.seat === 1 - (mySeat ?? 0))
  return opp?.user.username ?? 'Opponent'
}

function seatName(seat: number | undefined | null): string {
  if (seat === undefined || seat === null) return 'A player'
  return seat === mySeat ? 'You' : opponentName()
}

/**
 * Quick chat: the client sends a phrase id, the server relays it to the room, and
 * every client renders the shared text for that id. Nothing the user types ever
 * exists, so there is no free-text input to police on either side.
 */
function sendChatPhrase(phraseId: string): void {
  if (!activeMatchId || activeMatchIsPractice) return
  getSocket().emit('match:chat', { matchId: activeMatchId, phraseId })
}

function appendMatchChat(sender: string, text: string): void {
  const target = chatLogEl
  if (!target) return
  target.hidden = false
  const msg = el('div', 'match-chat-msg')
  msg.append(el('span', 'match-chat-msg__who', sender), el('span', 'match-chat-msg__text', text))
  target.appendChild(msg)
  while (target.children.length > MATCH_CHAT_MAX_LOG) target.removeChild(target.firstChild!)
}

function updateConnChip(): void {
  const chip = document.getElementById('conn-chip')
  if (!chip) return
  chip.textContent = connected ? 'online' : 'reconnecting…'
  chip.className = connected ? 'chip-ok' : 'chip-bad'
}

/** Pushes names, seat and game score to the board's player cards. */
function updateHud(): void {
  if (!chessView) return
  chessView.setSeat(mySeat)
  chessView.setPlayers(
    { name: currentUser?.username ?? 'You' },
    { name: opponentName(), isBot: activeMatchIsPractice, avatarUrl: activeMatchIsPractice ? '/bot.png' : null }
  )
  chessView.setMeta({ framesWon, frameIndex, format: matchFormat, practice: activeMatchIsPractice, armageddon: chessSnap?.armageddon })
}

/**
 * When the opponent's connection drops, the room gives them a short time to come back
 * before the match is awarded to the player still here. The banner counts it down, so
 * nobody is left wondering whether the game is stuck.
 */
let opponentReturnBy: number | null = null
let opponentCountdownTimer: number | null = null

function stopOpponentCountdown(): void {
  opponentReturnBy = null
  if (opponentCountdownTimer !== null) window.clearInterval(opponentCountdownTimer)
  opponentCountdownTimer = null
}

function startOpponentCountdown(seconds: number): void {
  stopOpponentCountdown()
  opponentReturnBy = Date.now() + Math.max(1, seconds) * 1000
  opponentCountdownTimer = window.setInterval(updateOpponentGone, 250)
  updateOpponentGone()
}

function updateOpponentGone(): void {
  const holder = document.getElementById('opp-holder')
  holder?.replaceChildren()
  if (!opponentGone || activeMatchIsPractice) return
  if (opponentReturnBy !== null) {
    const left = Math.max(0, Math.ceil((opponentReturnBy - Date.now()) / 1000))
    const banner = el('div', 'opp-gone opp-gone--countdown')
    banner.setAttribute('role', 'status')
    banner.append(
      el('span', 'opp-gone__title', 'Opponent left the match'),
      el('span', 'opp-gone__count', String(left)),
      el('span', 'opp-gone__note', left > 0 ? 'seconds to come back, or you win' : 'Awarding the match to you...')
    )
    holder?.appendChild(banner)
  } else {
    holder?.appendChild(el('div', 'opp-gone', 'Opponent disconnected — waiting for them to return'))
  }
}

async function loadMatchMeta(matchId: string): Promise<void> {
  try {
    const data = await api<{
      format?: string
      stakePerPlayer?: number | string
      platformFeePct?: number | string
      players?: Array<{ id: string; userId: string; seat: number; user: { id: string; username: string } }>
    }>(`/matches/${matchId}`)
    matchFormat = data.format ?? matchFormat
    players = data.players ?? []
    // The match row carries the stake and the fee the prize was settled from, so the
    // top bar can show what the table is worth from the first frame. Prisma hands
    // decimals back as strings, hence the Number on both. A zero stake is a practice
    // match, which is what gates the prize on and off without a second flag.
    updateHud()
  } catch {
    void 0
  }
}

/** The colours the win screen's confetti is cut from: gold, the table's green, red and white. */
const END_CONFETTI_COLOURS = ['#f3c75a', '#ffe08a', '#2fbf5b', '#e8344e', '#ffffff', '#5fa8ff']
/** How many pieces of confetti, and how many of them are coins. */
const END_CONFETTI_PIECES = 26
const END_CONFETTI_COINS = 8

/** Confetti and gold coins falling through the win screen, each with its own path and pace. */
function endConfetti(): HTMLElement {
  const layer = el('div', 'end-confetti')
  layer.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < END_CONFETTI_PIECES; i++) {
    const piece = document.createElement('i')
    if (i < END_CONFETTI_COINS) piece.className = 'is-coin'
    else piece.style.background = END_CONFETTI_COLOURS[i % END_CONFETTI_COLOURS.length]!
    piece.style.left = `${(Math.random() * 96 + 2).toFixed(1)}%`
    piece.style.setProperty('--delay', `${(Math.random() * 2.4).toFixed(2)}s`)
    piece.style.setProperty('--dur', `${(2.2 + Math.random() * 1.6).toFixed(2)}s`)
    piece.style.setProperty('--drift', `${Math.round((Math.random() - 0.5) * 120)}px`)
    piece.style.setProperty('--spin', `${Math.round(360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1)}deg`)
    layer.appendChild(piece)
  }
  return layer
}

/** Counts a number up from nought to `to` on screen, easing out, after the card has landed. */
function countUp(node: HTMLElement, to: number, delayMs = 550, durationMs = 900): void {
  const target = Math.max(0, Math.round(to))
  let reduce = false
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // No media queries: count anyway.
  }
  if (reduce || target === 0) {
    node.textContent = String(target)
    return
  }
  const start = performance.now() + delayMs
  const tick = (now: number): void => {
    if (!node.isConnected && now > start) return
    const t = Math.min(1, Math.max(0, (now - start) / durationMs))
    const eased = 1 - Math.pow(1 - t, 3)
    node.textContent = String(Math.round(target * eased))
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function showOverlay(box: HTMLElement): void {
  removeOverlay()
  const overlay = el('div', 'overlay')
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

function removeOverlay(): void {
  document.body.querySelector('.overlay')?.remove()
}

/**
 * The challenge layer.
 *
 * A pending invitation (somebody else's table) and a waiting table (mine) are
 * global states, not screens, so this layer is appended to the body and floats
 * above whatever the app is showing. Only one card is ever up: my own waiting
 * table takes precedence over an invitation I have not answered, because I cannot
 * accept someone else's table while mine is already on the board.
 */
function renderChallengeLayer(): void {
  if (!challengeLayerEl) {
    challengeLayerEl = el('div', 'challenge-layer')
    challengeLayerEl.id = 'challenge-layer'
    document.body.appendChild(challengeLayerEl)
  }
  challengeLayerEl.replaceChildren()
  // Mid-match the table owns the screen; invitations wait until we are back.
  if (activeMatchId) {
    challengeLayerEl.classList.remove('open')
    return
  }
  if (pendingChallenge) {
    challengeLayerEl.appendChild(findingOverlay(pendingChallenge))
    challengeLayerEl.classList.add('open')
    return
  }
  const next = incomingChallenges[0]
  if (!next) {
    challengeLayerEl.classList.remove('open')
    return
  }
  challengeLayerEl.appendChild(challengePopup(next))
  challengeLayerEl.classList.add('open')
}

function challengeMeta(challenge: ChallengeDto): string {
  const master = challenge.table === 'MASTER' || challenge.stakeTier.startsWith('MASTER_')
  return `${master ? 'Master · ' : ''}${challenge.stakeLabel} · ${challenge.format}`
}

function findingOverlay(challenge: ChallengeDto): HTMLElement {
  const overlay = el('div', 'challenge-overlay')
  const card = el('div', 'challenge-card')
  card.appendChild(el('div', 'challenge-card__eyebrow', 'FINDING AN OPPONENT'))
  card.appendChild(
    el(
      'div',
      'challenge-card__title',
      challenge.kind === 'FRIEND' && challenge.targetUsername
        ? `Invited ${challenge.targetUsername}`
        : 'Waiting for a player to join'
    )
  )
  card.appendChild(el('div', 'challenge-card__meta', challengeMeta(challenge)))
  card.appendChild(el('div', 'challenge-card__spinner'))
  card.appendChild(
    el(
      'p',
      'challenge-card__note',
      challenge.kind === 'FRIEND'
        ? 'Your friend has been invited. This table expires shortly.'
        : 'Everyone online can see this table. It expires shortly.'
    )
  )
  const cancel = el('button', 'challenge-btn challenge-btn--ghost', 'Cancel') as HTMLButtonElement
  cancel.type = 'button'
  cancel.disabled = challengeBusy
  cancel.onclick = () => void cancelPendingChallenge()
  card.appendChild(cancel)
  overlay.appendChild(card)
  return overlay
}

function challengePopup(challenge: ChallengeDto): HTMLElement {
  const overlay = el('div', 'challenge-overlay')
  const card = el('div', 'challenge-card')
  const isRematch = challenge.rematch === true
  card.appendChild(
    el(
      'div',
      'challenge-card__eyebrow',
      isRematch ? 'REMATCH' : challenge.table === 'MASTER' ? 'MASTER MATCH' : challenge.kind === 'FRIEND' ? 'FRIEND INVITE' : 'OPEN TABLE'
    )
  )
  card.appendChild(
    el('div', 'challenge-card__title', isRematch ? `${challenge.challengerUsername} wants a rematch` : `${challenge.challengerUsername} wants to play`)
  )
  card.appendChild(el('div', 'challenge-card__meta', challengeMeta(challenge)))
  card.appendChild(
    el('p', 'challenge-card__note', `Both players stake ${challenge.stakeLabel}; the winner takes the pool.`)
  )
  const row = el('div', 'challenge-card__row')
  const decline = el(
    'button',
    'challenge-btn challenge-btn--ghost',
    challenge.kind === 'FRIEND' ? 'Decline' : 'Not now'
  ) as HTMLButtonElement
  decline.type = 'button'
  decline.disabled = challengeBusy
  decline.onclick = () => void declineChallenge(challenge)
  const accept = el('button', 'challenge-btn challenge-btn--primary', 'Accept') as HTMLButtonElement
  accept.type = 'button'
  accept.disabled = challengeBusy
  accept.onclick = () => {
    requestLandscape()
    void acceptChallenge(challenge)
  }
  row.append(decline, accept)
  card.appendChild(row)
  overlay.appendChild(card)
  return overlay
}

function removeIncomingChallenge(id: string): void {
  incomingChallenges = incomingChallenges.filter((challenge) => challenge.id !== id)
}

function upsertIncomingChallenge(challenge: ChallengeDto): void {
  if (incomingChallenges.some((existing) => existing.id === challenge.id)) return
  incomingChallenges = [...incomingChallenges, challenge]
}

async function fetchIncomingChallenges(): Promise<void> {
  if (!currentUser) return
  try {
    const data = await api<ChallengeDto[]>('/challenges/incoming')
    incomingChallenges = data
    renderChallengeLayer()
  } catch {
    // Best-effort: a missed refresh only means a popup waits for the next event.
  }
}

async function acceptChallenge(challenge: ChallengeDto): Promise<void> {
  if (challengeBusy) return
  challengeBusy = true
  renderChallengeLayer()
  try {
    const data = await api<{ matchId: string }>(`/challenges/${challenge.id}/accept`, { method: 'POST', body: {} })
    removeIncomingChallenge(challenge.id)
    enterMatch(data.matchId, false)
  } catch (error) {
    toast((error as Error).message, 'error')
    removeIncomingChallenge(challenge.id)
  } finally {
    challengeBusy = false
    renderChallengeLayer()
  }
}

async function declineChallenge(challenge: ChallengeDto): Promise<void> {
  if (challengeBusy) return
  // A public table is dismissed locally: one player's "not now" must not close it
  // for everybody else. Only a friend invite is declined on the server.
  if (challenge.kind !== 'FRIEND') {
    removeIncomingChallenge(challenge.id)
    renderChallengeLayer()
    return
  }
  challengeBusy = true
  renderChallengeLayer()
  try {
    await api(`/challenges/${challenge.id}/decline`, { method: 'POST', body: {} })
  } catch (error) {
    toast((error as Error).message, 'error')
  } finally {
    challengeBusy = false
    removeIncomingChallenge(challenge.id)
    renderChallengeLayer()
  }
}

async function cancelPendingChallenge(): Promise<void> {
  const challenge = pendingChallenge
  if (!challenge || challengeBusy) return
  challengeBusy = true
  renderChallengeLayer()
  try {
    await api(`/challenges/${challenge.id}/cancel`, { method: 'POST', body: {} })
  } catch (error) {
    toast((error as Error).message, 'error')
  } finally {
    challengeBusy = false
    pendingChallenge = null
    renderChallengeLayer()
  }
}

function confirmAction(title: string, message: string, okLabel: string, onOk: () => void): void {
  const box = card(title)
  box.appendChild(el('div', undefined, message))
  const row = el('div', 'row')
  const okBtn = el('button', 'danger', okLabel)
  okBtn.onclick = () => {
    removeOverlay()
    onOk()
  }
  const cancelBtn = el('button', 'ghost', 'Cancel')
  cancelBtn.onclick = () => removeOverlay()
  row.append(cancelBtn, okBtn)
  box.appendChild(row)
  showOverlay(box)
}

/**
 * Resigning loses the current game (FIDE 5.1.2). In a best-of-3 or best-of-5 the player
 * may instead forfeit the whole match, which hands the opponent the match and the stake
 * without playing the remaining games.
 */
function askConcede(): void {
  if (!activeMatchId) return
  const matchId = activeMatchId
  const single = matchFormat === 'BO1' || chessSnap?.armageddon
  const box = card(single ? 'Resign?' : 'Resign or forfeit?')
  box.appendChild(
    el(
      'div',
      undefined,
      single
        ? 'You lose this game, the match and your stake.'
        : 'Resigning loses this game and the match carries on. Forfeiting hands your opponent the whole match and your stake.'
    )
  )
  const row = el('div', 'row')
  const cancelBtn = el('button', 'ghost', 'Cancel')
  cancelBtn.onclick = () => removeOverlay()
  const resignBtn = el('button', 'danger', single ? 'Resign' : 'Resign game')
  resignBtn.onclick = () => {
    removeOverlay()
    getSocket().emit('game:resign', { matchId })
  }
  row.append(cancelBtn, resignBtn)
  if (!single) {
    const forfeitBtn = el('button', 'danger', 'Forfeit match')
    forfeitBtn.onclick = () => {
      removeOverlay()
      getSocket().emit('concede', { matchId })
    }
    row.appendChild(forfeitBtn)
  }
  box.appendChild(row)
  showOverlay(box)
}

/** Draw offer / answer / claim, shown over the board when there is something to act on. */
let drawBarEl: HTMLElement | null = null
function syncDrawUi(): void {
  const holder = drawBarEl
  if (!holder) return
  holder.replaceChildren()
  const snap = chessSnap
  if (!snap || snap.result !== 'PLAYING' || mySeat === undefined || !activeMatchId) {
    holder.hidden = true
    return
  }
  const matchId = activeMatchId
  const button = (label: string, cls: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, label) as HTMLButtonElement
    b.type = 'button'
    b.onclick = onClick
    return b
  }
  if (snap.drawOfferBy !== null && snap.drawOfferBy !== mySeat) {
    holder.append(
      el('span', 'draw-bar__text', `${opponentName()} offers a draw${snap.armageddon ? ' (a draw means black wins)' : ''}`),
      button('Accept', 'draw-bar__btn is-yes', () => getSocket().emit('draw:respond', { matchId, accept: true })),
      button('Decline', 'draw-bar__btn', () => getSocket().emit('draw:respond', { matchId, accept: false }))
    )
  } else if (snap.drawOfferBy === mySeat) {
    holder.append(el('span', 'draw-bar__text', 'Draw offered \u2014 waiting for your opponent'))
  } else if (snap.drawClaim && snap.turnSeat === mySeat) {
    const why = snap.drawClaim === 'DRAW_REPETITION' ? 'threefold repetition' : 'fifty-move rule'
    holder.append(
      el('span', 'draw-bar__text', `You may claim a draw (${why})`),
      button('Claim draw', 'draw-bar__btn is-yes', () => getSocket().emit('draw:claim', { matchId }))
    )
  }
  holder.hidden = holder.childElementCount === 0
}

async function finishPractice(): Promise<void> {
  if (!activeMatchId) return
  try {
    await api('/practice/resign', { method: 'POST', body: { matchId: activeMatchId } })
    toast('Practice ended')
    leaveGameState()
    // The session is over: back to the home screen rather than to a setup screen
    // offering to start another one the player did not ask for.
    activeScreen = 'home'
    render()
  } catch (error) {
    toast((error as Error).message, 'error')
  }
}

function leaveToLobby(): void {
  leaveGameState()
  clearTournamentTimer()
  removeOverlay()
  // Home is where every exit from a match lands, whichever screen the match was
  // entered from. A tournament match keeps activeTournamentId set, so render still
  // prefers the bracket over the home screen for that one case.
  activeScreen = 'home'
  render()
  // Invitations that arrived mid-match were withheld; collect the live ones now.
  void fetchIncomingChallenges()
}

function clearTournamentTimer(): void {
  if (tournamentTimer !== undefined) {
    clearTimeout(tournamentTimer)
    tournamentTimer = undefined
  }
}

function scheduleTournamentRefresh(): void {
  clearTournamentTimer()
  tournamentTimer = window.setTimeout(() => {
    tournamentTimer = undefined
    if (activeTournamentId && !activeMatchId) void renderTournament()
  }, 2500)
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'recruiting',
    OPEN: 'recruiting',
    FULL: 'starting',
    IN_PROGRESS: 'in progress',
    COMPLETED: 'finished'
  }
  return map[status] ?? status.toLowerCase()
}

async function renderTournament(): Promise<void> {
  clearTournamentTimer()
  app.innerHTML = ''
  app.appendChild(header())
  const wrap = el('div')
  app.appendChild(wrap)
  if (!activeTournamentId) {
    activeScreen = 'home'
    render()
    return
  }
  let data: TournamentData
  try {
    data = await api<TournamentData>(`/tournaments/${activeTournamentId}`)
  } catch (error) {
    wrap.appendChild(el('div', 'muted', (error as Error).message))
    const back = el('button', undefined, 'Back to home')
    back.onclick = () => {
      activeTournamentId = null
      activeScreen = 'home'
      render()
    }
    wrap.appendChild(back)
    return
  }
  if (activeTournamentId !== data.id) return

  const box = el('div', 'card')
  const top = el('div', 'row t-top')
  const title = el('div')
  title.appendChild(el('h3', undefined, data.name))
  title.appendChild(el('div', 'meta-line', `${data.players.length}/${data.size} players · ${statusLabel(data.status)} · BO${data.format.replace('BO', '')}`))
  top.appendChild(title)
  const actions = el('div', 'row')
  const refreshBtn = el('button', 'ghost', 'Refresh')
  refreshBtn.onclick = () => void renderTournament()
  actions.appendChild(refreshBtn)
  const backBtn = el('button', 'ghost', 'Back to home')
  backBtn.onclick = () => {
    activeTournamentId = null
    activeScreen = 'home'
    render()
  }
  actions.appendChild(backBtn)
  top.appendChild(actions)
  box.appendChild(top)

  if (data.status === 'OPEN' || data.status === 'DRAFT' || data.status === 'FULL') {
    if (data.players.length >= data.size) {
      box.appendChild(el('div', 'muted', 'Everyone has joined — matches are starting.'))
    } else {
      box.appendChild(el('div', 'muted', `Waiting for ${data.size - data.players.length} more player${data.size - data.players.length === 1 ? '' : 's'} — bracket fills from the top seed down.`))
    }
  }

  if (data.status === 'COMPLETED' && data.championId) {
    const champion = data.players.find((p) => p.userId === data.championId)
    const runnerUp = data.players.find((p) => p.userId === data.runnerUpId)
    const banner = el('div', 'champion-banner')
    banner.appendChild(el('div', 'crown', 'CHAMPION'))
    banner.appendChild(el('div', 'champ-name', champion?.user.username ?? '?'))
    banner.appendChild(el('div', 'meta-line', runnerUp ? `runner-up: ${runnerUp.user.username}` : 'runner-up: —'))
    const mine = data.players.find((p) => p.userId === currentUser?.id)
    banner.appendChild(el('div', 'meta-line', mine?.status === 'CHAMPION' ? 'This is you — take a bow.' : 'Free tournament · all 8 players started even'))
    box.appendChild(banner)
  }

  const labels = ['Quarter-finals', 'Semi-finals', 'Final']
  const rounds = data.resultsJson?.rounds ?? []
  if (rounds.length) {
    const bracket = el('div', 'bracket')
    for (let r = 0; r < rounds.length; r++) {
      const col = el('div', `bracket-round r${r}`)
      col.appendChild(el('div', 'round-label', labels[r] ?? `Round ${r + 1}`))
      for (const slot of rounds[r]!.slots) {
        col.appendChild(bracketNode(slot, data))
      }
      bracket.appendChild(col)
    }
    box.appendChild(bracket)
  }

  const listBox = el('div', 'players-list')
  listBox.appendChild(el('div', 'subhead', 'Players'))
  for (const p of data.players) {
    const rowEl = el('div', 'table-row')
    rowEl.appendChild(el('span', 'badge', `#${p.seed}`))
    const nm = el('div', p.status === 'CHAMPION' ? 'champ-name-sm' : undefined, `${p.user.username}${p.userId === currentUser?.id ? ' (you)' : ''}`)
    rowEl.appendChild(nm)
    rowEl.appendChild(el('span', 'badge', p.status ?? 'ALIVE'))
    listBox.appendChild(rowEl)
  }
  box.appendChild(listBox)

  wrap.appendChild(box)

  if (data.status !== 'COMPLETED') scheduleTournamentRefresh()
}

function bracketNode(slot: BracketSlotData, data: TournamentData): HTMLElement {
  const node = el('div', 'bracket-node')
  const match = slot.matchId ? data.matches.find((m) => m.id === slot.matchId) : undefined
  const winnerSeed = slot.winnerSeed ?? undefined
  const includesMe = match?.players.some((p) => p.userId === currentUser?.id) === true
  const nameFor = (index: number): string => {
    const seed = slot.seeds.length > index ? slot.seeds[index] : undefined
    if (seed !== undefined) {
      const p = data.players.find((pl) => pl.seed === seed)
      return p?.user.username ?? 'TBD'
    }
    const seat = match?.players.find((pl) => pl.seat === index)
    return seat?.user.username ?? 'TBD'
  }
  for (let i = 0; i < 2; i++) {
    const line = el('div', 'b-node-row')
    const seed = slot.seeds.length > i ? slot.seeds[i] : undefined
    const nameEl = el('span', undefined, nameFor(i))
    if (seed !== undefined && seed === winnerSeed) nameEl.classList.add('winner')
    if (seed !== undefined && winnerSeed !== undefined && seed !== winnerSeed) nameEl.classList.add('loser')
    line.appendChild(nameEl)
    const seat = match?.players.find((pl) => pl.seat === i)
    if (seat && seat.userId === currentUser?.id) line.appendChild(el('span', 'you-dot', 'you'))
    node.appendChild(line)
  }
  if (match) {
    const playable = match.status === 'WAITING_FOR_PLAYER' || match.status === 'MATCH_STARTED' || match.status === 'MATCH_IN_PROGRESS'
    if (playable && includesMe && !activeMatchId) {
      const play = el('button', 'ghost mini', match.status === 'WAITING_FOR_PLAYER' ? 'Play' : 'Resume')
      play.onclick = () => enterMatch(match.id, false)
      node.appendChild(play)
    }
  }
  node.title = match ? `${match.status} · round ${match.round ?? '?'}` : ''
  return node
}

async function fetchMatchOutcome(matchId: string): Promise<{
  status: string
  format: string
  stakeTier: string
  resultJson: { prize?: number } | null
  players: Array<{ id: string; userId: string; seat: number; user: { id: string; username: string } }>
} | null> {
  for (let i = 0; i < 12; i++) {
    try {
      const data = await api<{
        status: string
        format: string
        stakeTier: string
        resultJson: { prize?: number } | null
        players?: Array<{ id: string; userId: string; seat: number; user: { id: string; username: string } }>
      }>(`/matches/${matchId}`)
      if (data && data.status) {
        return { status: data.status, format: data.format, stakeTier: data.stakeTier, resultJson: data.resultJson, players: data.players ?? [] }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

async function sendRematch(targetUsername: string, format: string, stakeTier: string): Promise<void> {
  // Drop the result card: the rematch invitation takes its place while it is open.
  removeOverlay()
  try {
    const challenge = await api<ChallengeDto>('/challenges', {
      method: 'POST',
      body: { stakeTier, format, targetUsername, rematch: true }
    })
    pendingChallenge = challenge
    renderChallengeLayer()
    toast(`Rematch invite sent to ${targetUsername}`)
  } catch (error) {
    toast((error as Error).message, 'error')
  }
}

async function finishMatch(winnerSeat: number, reason?: string): Promise<void> {
  const matchId = activeMatchId
  const meta = activeMatchId ? await fetchMatchOutcome(activeMatchId) : null
  // Let the final position (and the game-over banner) be seen for a moment first.
  if (reason !== 'concede' && reason !== 'abandon') await new Promise((resolve) => setTimeout(resolve, 1500))
  // The player may have left while all that was going on.
  if (activeMatchId !== matchId) return

  const iWon = mySeat !== undefined && winnerSeat === mySeat
  const watching = mySeat === undefined
  const myName = currentUser?.username ?? 'You'
  const theirName = activeMatchIsPractice
    ? 'Robot'
    : (meta?.players.find((p) => p.seat !== mySeat)?.user.username ?? opponentName())
  const winnerName = activeMatchIsPractice
    ? iWon
      ? myName
      : 'Robot'
    : (meta?.players.find((p) => p.seat === winnerSeat)?.user.username ?? `Seat ${winnerSeat}`)

  const box = el('div', `card end-screen ${watching ? 'is-neutral' : iWon ? 'is-win' : 'is-loss'}`)
  // Light turning slowly behind the trophy, and for a win, confetti and coins falling.
  const rays = el('div', 'end-rays')
  rays.setAttribute('aria-hidden', 'true')
  box.appendChild(rays)
  if (iWon && !watching) box.appendChild(endConfetti())
  const emblem = el('div', 'end-emblem')
  emblem.setAttribute('aria-hidden', 'true')
  emblem.innerHTML = END_TROPHY_SVG
  box.appendChild(emblem)
  box.appendChild(el('div', 'end-title', watching ? 'MATCH OVER' : iWon ? 'YOU WIN' : 'YOU LOSE'))
  box.appendChild(
    el(
      'div',
      'end-sub',
      reason === 'concede'
        ? `${winnerName} wins by resignation`
        : reason === 'abandon'
          ? `${winnerName} wins: the opponent left the match`
          : `${winnerName} wins the match`
    )
  )

  // The games score, mine on the left.
  if (!watching && !activeMatchIsPractice) {
    const mine = framesWon[mySeat ?? 0] ?? 0
    const theirs = framesWon[1 - (mySeat ?? 0)] ?? 0
    const board = el('div', 'end-score')
    const side = (name: string, points: number, won: boolean): HTMLElement => {
      const cell = el('div', `end-side${won ? ' is-winner' : ''}`)
      cell.appendChild(el('span', 'end-side-name', name))
      const value = el('span', 'end-side-points', '0')
      cell.appendChild(value)
      // Half points (a drawn game) are written as they are; whole numbers count up.
      if (Number.isInteger(points)) countUp(value, points)
      else value.textContent = formatPoints(points)
      return cell
    }
    board.appendChild(side(myName, mine, iWon))
    board.appendChild(el('span', 'end-score-dash', '–'))
    board.appendChild(side(theirName, theirs, !iWon))
    box.appendChild(board)
    box.appendChild(el('div', 'end-margin', 'Match points \u00b7 1 a win, \u00bd a draw' + (chessSnap?.armageddon ? ' \u00b7 decided by Armageddon' : '')))
  }
  const finalResult = chessSnap?.result
  if (finalResult && finalResult !== 'PLAYING' && reason !== 'concede' && reason !== 'abandon') {
    box.appendChild(el('div', 'muted', `Final game: ${describeGameEnd(finalResult)}`))
  }

  if (activeMatchIsPractice) {
    box.appendChild(el('div', 'muted', 'Practice session \u2014 free play'))
  } else {
    
    const prize = meta?.resultJson?.prize
    if (typeof prize === 'number' && prize > 0) {
      box.appendChild(el('div', 'end-prize', `Winner receives ${formatCash(prize)}`))
    } else {
      box.appendChild(el('div', 'muted', 'Settlement pending\u2026'))
    }
  }

  const actions = el('div', 'end-actions')
  // A settled one-vs-one (never practice, never a tournament leg) can be played
  // straight back: the button opens a targeted invite to the same opponent at the
  // same stake and format, which they accept like any other table.
  if (!activeMatchIsPractice && !activeTournamentId) {
    const opponent = meta?.players.find((p) => p.seat !== mySeat)?.user.username ?? null
    const format = meta?.format
    const stakeTier = meta?.stakeTier
    if (opponent && format && stakeTier) {
      const rematchBtn = el('button', 'ghost', 'Rematch') as HTMLButtonElement
      rematchBtn.type = 'button'
      rematchBtn.onclick = () => void sendRematch(opponent, format, stakeTier)
      actions.appendChild(rematchBtn)
    }
  }
  if (!watching) box.appendChild(endScreenXp(xpForMatch({ won: iWon, practice: activeMatchIsPractice, reason })))

  const backBtn = el('button', undefined, activeTournamentId ? 'Back to tournament' : 'Back to home')
  backBtn.onclick = () => leaveToLobby()
  actions.appendChild(backBtn)
  box.appendChild(actions)
  showOverlay(box)
}

async function fetchProgress(): Promise<LobbyProgress | null> {
  try {
    const progress = await api<LobbyProgress>('/progress/me')
    lastKnownTotalXp = progress.totalXp
    return progress
  } catch {
    return null
  }
}

/**
 * "+50 XP" and the level bar on the result card. The gain is the shared rule applied
 * to what the client saw; the bar is the server's, read once the settlement has landed
 * (it can trail the match:end message by a moment, so the read is retried briefly).
 */
function endScreenXp(gain: number): HTMLElement {
  const wrap = el('div', 'end-xp')
  const row = el('div', 'end-xp__row')
  const level = el('span', undefined, '')
  row.append(el('span', 'end-xp__gain', `+${gain} XP`), level)
  const bar = xpBar(0)
  wrap.append(row, bar)
  const before = lastKnownTotalXp
  void (async () => {
    let progress: LobbyProgress | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      progress = await fetchProgress()
      if (!progress || before === null || gain === 0 || progress.totalXp >= before + gain) break
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    if (!progress || !wrap.isConnected) return
    level.textContent = `Level ${progress.level} · ${progress.rank.name}`
    level.style.color = progress.rank.color
    bar.replaceWith(xpBar(progress.percent))
  })()
  return wrap
}

/**
 * Draws whichever screen the player is on.
 *
 * A match and a tournament bracket are states rather than screens, so they are checked
 * first: you leave a screen to go and play and you come back to it. The full-height
 * shells are decided from the same list, because a screen that is one viewport tall has
 * to be told so before its first child is measured, not after.
 */
function render(): void {
  // The lobby owns document-level listeners, so it is torn down before the page is cleared.
  lobbySession?.destroy()
  lobbySession = null
  app.innerHTML = ''
  document.body.classList.remove('game-mode', 'home-mode', 'practice-mode', 'tour-mode')
  // Out of a match the phone may be held upright again: the lobby is laid out for it.
  if (!activeMatchId) releaseLandscape()
  // The tournaments list and a tournament's bracket are dressed as the tournament hall.
  // A class on the page and nothing else: the screens and what they do are unchanged.
  if (!activeMatchId && (activeTournamentId || activeScreen === 'tournaments')) document.body.classList.add('tour-mode')

  const shell = activeMatchId ? 'app-game' : activeScreen === 'home' ? 'app-home' : activeScreen === 'practice' ? 'app-practice' : null
  app.className = shell ? `app-root ${shell}` : 'app-root'
  if (shell === 'app-home') document.body.classList.add('home-mode')
  if (shell === 'app-practice') document.body.classList.add('practice-mode')

  if (!currentUser && checkingSession) {
    app.className = 'app-root'
    document.body.classList.remove('home-mode', 'practice-mode')
    app.appendChild(bootScreen())
  } else if (!currentUser) {
    // The auth screen centres itself on the viewport, so the transition is applied to
    // the card rather than to a wrapper — the wrapper would be a full-height block
    // and the animation would be invisible behind the card's own entrance.
    // The auth screen brings its own wordmark, so the header bar is left off it.
    app.className = 'app-root'
    document.body.classList.remove('home-mode', 'practice-mode')
    renderAuthScreen(app, app, toast)
  } else if (activeMatchId) {
    // No page transition here: the game fits itself to the space the header and HUD
    // leave (applyCanvasSize), and a transformed ancestor would make that measurement
    // wrong for the duration of the animation.
    renderGame()
  } else if (activeTournamentId) {
    app.appendChild(header())
    void renderTournament()
  } else if (USE_NEW_LOBBY && activeScreen !== 'tournaments') {
    // New gaming lobby UI (presentation only). Flip USE_NEW_LOBBY in lobby/flag.ts to restore the old lobby.
    // `tournaments` is the exception: its tile hands back to the existing screen below,
    // which is the same one the old lobby's Tournament card has always opened.
    app.className = 'app-root app-home'
    lobbySession = mountGamingLobby(app, createLobbyBridge())
  } else if (activeScreen === 'home') {
    app.appendChild(header({ home: true }))
    renderHome()
  } else if (activeScreen === 'practice') {
    app.appendChild(header())
    renderPracticeSetup()
  } else {
    app.appendChild(header())
    void renderScreen(activeScreen)
  }

  // The challenge layer floats above whichever screen was just built (or hides
  // itself during a match), so it is rebuilt last, against the fresh state.
  renderChallengeLayer()
  // Back in the lobby: anything announced during the match is shown now.
  if (currentUser && !activeMatchId) showNextAnnouncement()
}

/** The loading card shown while a saved sign-in is checked at start-up. */
function bootScreen(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'boot-screen'
  wrap.setAttribute('role', 'status')
  wrap.setAttribute('aria-live', 'polite')
  const title = document.createElement('div')
  title.className = 'boot-screen__title'
  title.textContent = APP_TITLE
  const spinner = document.createElement('div')
  spinner.className = 'challenge-card__spinner'
  const note = document.createElement('div')
  note.className = 'boot-screen__note'
  note.textContent = 'Signing you in...'
  wrap.append(title, spinner, note)
  return wrap
}

/**
 * Ends the player's session everywhere: the stored token, the server's cookie (or the
 * next load would sign straight back in from it), the socket, and every piece of
 * in-memory state that belonged to the signed-in player. The cookie is cleared before
 * the auth screen is drawn, so a fast reload cannot race it.
 */
async function signOut(): Promise<void> {
  resetAnnouncements()
  token = ''
  clearStoredToken()
  disconnectSocket()
  currentUser = null
  activeMatchId = null
  activeTournamentId = null
  activeScreen = 'home'
  pendingChallenge = null
  incomingChallenges = []
  clearTournamentTimer()
  leaveGameState()
  await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined)
  render()
}

/**
 * Read-only bridge from the new lobby views into existing main.ts handlers and state.
 * Does not change match start, audio, wallet, or API contracts — only exposes them.
 */
function createLobbyBridge(): LobbyBridge {
  const logoSvg =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#c9a84c"/><circle cx="12" cy="12" r="7" fill="#0a0a0f"/><circle cx="9.5" cy="9.5" r="2.5" fill="#e8c872"/></svg>'
  return {
    appTitle: APP_TITLE,
    username: currentUser?.username ?? 'Player',
    userId: currentUser?.id ?? '',
    // Read live: the lobby is built before the wallet request comes back, and a copy
    // taken here would show the balance from before it did.
    get walletBalance() {
      return wallet.balance
    },
    logoSvg,
    formatCash,
    createAvatar: (name) => createAvatarBadge({ name, isBot: false }),
    getSoundMuted: () => isSoundMuted(),
    setSoundMuted: (muted) => setSoundMuted(muted),
    practiceDifficulty,
    setPracticeDifficulty: (level) => {
      practiceDifficulty = level
    },
    getStakeTiers: () => tiers.map((t) => ({ id: t.id, label: t.label, usdt: t.usdt })),
    getDefaultStakeTierId: () => activeTierId ?? tiers[0]?.id ?? null,
    refreshWallet: async () => {
      await Promise.all([refreshWallet(), loadTiers()])
    },
    fetchProfileStats: async () => {
      try {
        const profile = await api<MyProfile>('/me')
        return profile.stats
      } catch {
        return null
      }
    },
    fetchMatchHistory: async () => {
      try {
        return await api<HistoryMatch[]>('/matches/history')
      } catch {
        return []
      }
    },
    fetchProgress,
    startPractice: async (aiLevel, format = 'BO1') => {
      practiceDifficulty = aiLevel
      if (!USE_LOADING_SCREEN) {
        const data = await api<{ id: string }>('/practice/start', { method: 'POST', body: { aiLevel, format } })
            enterMatch(data.id, true)
        return
      }
      await startPracticeWithLoadingScreen(aiLevel, format)
    },
    startOnlineChallenge: async (opts) => {
      // Opening a table is now a challenge: the server broadcasts it to every
      // connected player (or just the friend named), and the challenger waits on
      // the lobby's "finding an opponent" overlay. The match itself is only
      // created — and both stakes only frozen — when somebody accepts.
      const challenge = await api<ChallengeDto>('/challenges', {
        method: 'POST',
        body: {
          stakeTier: opts.stakeTier,
          format: opts.format as MatchFormat,
          targetUsername: opts.targetUsername
        }
      })
      pendingChallenge = challenge
      renderChallengeLayer()
    },
    toast: (message, kind) => toast(message, kind),
    onProfileActivate: () => {
      /* Settings tab is opened by the lobby shell; no separate profile route exists. */
    },
    openTournaments: () => {
      activeScreen = 'tournaments'
      render()
    },
    openSupport: () => openSupportChat(),
    signOut: () => void signOut()
  }
}

/**
 * The home screen.
 *
 * Deliberately synchronous and deliberately empty of requests. Every element here is
 * built from state the app already holds, so the screen is painted complete on the first
 * frame and nothing reflows when something arrives: no skeletons, no reserved heights
 * guessing at content, and no request that can fail halfway and leave a hole. The wallet
 * the tables screen will want is fetched in the background, after the screen is up.
 */
function renderHome(): void {
  void refreshWallet()

  const page = el('div', 'home-page page-enter')

  const title = el('div', 'home-title')
  title.appendChild(el('h1', 'home-wordmark', APP_TITLE))
  title.appendChild(el('div', 'home-tagline', 'Play online snooker'))
  page.appendChild(title)

  const cards = el('div', 'home-cards')
  for (const spec of HOME_CARDS) {
    // Hit box stays fixed; the face lifts. Card chrome is trimmed to emblem + title +
    // one line + one fact + CTA so the home screen reads as a game lobby, not a dashboard.
    const card = el('button', `home-card home-card--${spec.id}`) as HTMLButtonElement
    card.type = 'button'

    const face = el('span', 'home-card-face')
    face.appendChild(el('span', 'home-card-skin'))
    face.appendChild(el('span', 'home-card-grain'))
    face.appendChild(el('span', 'home-card-shine'))
    face.appendChild(el('span', 'home-card-sweep'))
    face.appendChild(el('span', 'home-card-spark'))

    const emblem = el('span', 'home-card-emblem')
    emblem.innerHTML = spec.emblem
    emblem.insertBefore(el('span', 'home-card-emblem-aura'), emblem.firstChild)
    face.appendChild(emblem)

    face.appendChild(el('span', 'home-card-title', spec.label))
    face.appendChild(el('span', 'home-card-desc', spec.blurb))

    const chips = el('span', 'home-card-chips')
    chips.appendChild(el('span', 'home-chip', spec.chips[spec.statusIndex] ?? ''))
    face.appendChild(chips)

    const cta = el('span', 'home-card-cta')
    cta.appendChild(el('span', 'home-card-cta-label', 'Play'))
    face.appendChild(cta)

    card.appendChild(face)
    card.onclick = () => {
      const target = cardDestination(spec.id)
      if (!target) return
      activeScreen = target
      render()
    }
    cards.appendChild(card)
  }
  page.appendChild(cards)
  page.appendChild(homeBar())
  app.appendChild(page)
}

/**
 * The bottom bar: five entries, all of them finished.
 *
 * Leaderboard and Settings go where they have always gone. Shop, Friends and More have
 * no backend in this project, so they answer with a toast naming themselves rather than
 * navigating or asking the server for anything — the entry points are real, the features
 * behind them are not, and the bar does not pretend otherwise.
 */
function homeBar(): HTMLElement {
  const bar = el('nav', 'home-bar glass glass-edge')
  bar.setAttribute('aria-label', 'More screens')
  for (const item of HOME_BAR) {
    const destination = barDestination(item.id)
    const locked = destination === null
    const active = destination !== null && destination === activeScreen
    const btn = el(
      'button',
      `home-bar-item${locked ? ' home-bar-item--locked' : ''}${active ? ' home-bar-item--active' : ''}`
    ) as HTMLButtonElement
    btn.type = 'button'
    if (locked) btn.setAttribute('aria-disabled', 'true')
    if (active) btn.setAttribute('aria-current', 'page')
    const icon = el('span', 'home-bar-icon')
    icon.innerHTML = item.icon
    btn.append(icon, el('span', undefined, item.label))
    btn.onclick = () => {
      if (!destination) {
        toast(comingSoonMessage(item.label))
        return
      }
      activeScreen = destination
      render()
    }
    bar.appendChild(btn)
  }
  return bar
}

/**
 * The screens a card or a bar icon opens.
 *
 * All four were already in the app; what is new is that they each have a screen of their
 * own with a way back, rather than sharing one long scrolling lobby with everything else
 * on it. The builders below are the existing ones, unchanged — the flows they drive are
 * the flows that shipped.
 */
async function renderScreen(screen: AppScreen): Promise<void> {
  const wrap = el('div', 'screen-page page-enter')
  app.appendChild(wrap)
  switch (screen) {
    case 'multiplayer':
      await renderTablesScreen(wrap)
      return
    case 'tournaments':
      await renderTournamentsScreen(wrap)
      return
    case 'leaderboard':
      await renderLeaderboardScreen(wrap)
      return
    case 'settings':
      renderSettingsScreen(wrap)
      return
    default:
      activeScreen = 'home'
      render()
  }
}

/** The title and the way home, shared by every screen below. */
function screenHead(title: string, note?: string): HTMLElement {
  const head = el('div', 'screen-head')
  const titles = el('div')
  titles.appendChild(el('h2', 'screen-title', title))
  if (note) titles.appendChild(el('div', 'muted', note))
  head.appendChild(titles)
  const back = el('button', 'ghost', 'Back to home') as HTMLButtonElement
  back.type = 'button'
  back.onclick = () => {
    activeScreen = 'home'
    render()
  }
  head.appendChild(back)
  return head
}

/**
 * One-to-one tables: the create-a-match card, the tiered list of tables waiting for a
 * second player, and the player's own match history. All of it exactly as it was; the
 * balance now sits with the tier chips, which is the only decision on this screen that
 * belongs to credits.
 */
async function renderTablesScreen(wrap: HTMLElement): Promise<void> {
  wrap.appendChild(screenHead('Multiplayer', 'Join a table by price, or open one and wait for an opponent.'))
  await Promise.all([refreshWallet(), loadTiers()])
  if (!wrap.isConnected) return
  wrap.appendChild(createMatchCard())

  // Tables that are open for a seat. The server only reports matches still waiting
  // for a second player, so this is a "join a waiting table" list rather than a
  // spectator feed — calling it anything else would overstate what is being shown.
  const openSection = el('div', 'lobby-section')
  openSection.appendChild(el('h3', 'lobby-section-title', 'Open Tables'))
  openSection.appendChild(await openTablesStrip())
  if (!wrap.isConnected) return
  wrap.appendChild(openSection)

  wrap.appendChild(await matchHistoryCard())
}

/** The tournament banner and the create/join card: the existing flow, given its own screen. */
async function renderTournamentsScreen(wrap: HTMLElement): Promise<void> {
  wrap.appendChild(screenHead('Tournaments', '8-player single-elimination brackets, seeded by join order.'))
  // Driven by the tournaments that are actually open for a seat, so the headline and
  // the button always agree with each other.
  wrap.appendChild(await featuredTournamentHero())
  if (!wrap.isConnected) return
  wrap.appendChild(createTournamentCard())
}

/** The leaderboard, which has had working logic since the profile phase. */
async function renderLeaderboardScreen(wrap: HTMLElement): Promise<void> {
  wrap.appendChild(screenHead('Leaderboard', 'Ranked on real matches only — practice never counts.'))
  wrap.appendChild(await profileStatsCard())
}

/**
 * Settings.
 *
 * Only what already works: the account as `/api/me` reports it, and the sound toggle,
 * which is the same `audio.ts` mute the in-game button sets. Nothing here is stored
 * anywhere new and nothing here is a placeholder for a feature — if a setting is added
 * later it arrives here with its own logic rather than as a row that does nothing.
 */
function renderSettingsScreen(wrap: HTMLElement): void {
  wrap.appendChild(screenHead('Settings'))

  const account = card('Account')
  const rows = el('div')
  rows.appendChild(el('div', 'muted', 'Loading...'))
  account.appendChild(rows)
  void api<MyProfile>('/me')
    .then((profile) => {
      if (!rows.isConnected) return
      rows.innerHTML = ''
      const name = el('div', 'table-row')
      name.appendChild(el('div', undefined, profile.user.username))
      name.appendChild(el('span', 'badge', currentUser?.role ?? 'PLAYER'))
      rows.appendChild(name)
      const joined = el('div', 'table-row')
      joined.appendChild(el('div', undefined, 'Member since'))
      joined.appendChild(el('div', 'meta', new Date(profile.user.createdAt).toLocaleDateString()))
      rows.appendChild(joined)
      const credits = el('div', 'table-row')
      credits.appendChild(el('div', undefined, 'Balance'))
      credits.appendChild(el('div', 'meta', formatCash(profile.user.wallet.available)))
      rows.appendChild(credits)
    })
    .catch((error: Error) => {
      if (!rows.isConnected) return
      rows.innerHTML = ''
      rows.appendChild(el('div', 'muted', error.message))
    })
  wrap.appendChild(account)

  const sound = card('Sound')
  const row = el('div', 'row')
  const toggle = el('button', 'ghost', isSoundMuted() ? 'Sound: off' : 'Sound: on') as HTMLButtonElement
  toggle.type = 'button'
  toggle.onclick = () => {
    const next = !isSoundMuted()
    setSoundMuted(next)
    toggle.textContent = next ? 'Sound: off' : 'Sound: on'
  }
  row.appendChild(el('span', 'muted', 'Table sounds'))
  row.appendChild(toggle)
  sound.appendChild(row)
  wrap.appendChild(sound)
}

/**
 * The pre-practice setup screen.
 *
 * Reached from the PRACTICE card and doing one job: choose the level, then start the
 * match through the same `POST /practice/start` the old lobby card used, with the same
 * `enterMatch` behind it. Nothing about how a practice match is created, played or
 * settled is touched here - this is a screen in front of an unchanged flow.
 *
 * The setup screen replaces a dropdown that lived inside the lobby grid. A `<select>` is
 * the right control when the level is one field among five and the wrong one when it is
 * the only decision the player came here to make: it hides two of the three options and
 * says nothing about what they mean. Three panes on a glass panel say both, and the
 * description under them is reserved space, so choosing a level never moves the button.
 */
function renderPracticeSetup(): void {
  const page = el('div', 'practice-page page-enter')
  const panel = el('div', 'practice-panel glass glass-edge')

  const back = el('button', 'ghost practice-back', 'Back to home') as HTMLButtonElement
  back.type = 'button'
  back.onclick = () => {
    activeScreen = 'home'
    render()
  }
  panel.appendChild(back)

  const heading = el('div', 'practice-heading')
  heading.appendChild(el('h2', undefined, 'Practice match'))
  panel.appendChild(heading)

  // The matchup, in the two avatars that will actually be at the table: the player's own,
  // drawn by the shared component from their name, and the robot.
  const playerName = currentUser?.username ?? 'You'
  const matchup = el('div', 'practice-matchup')
  const you = el('div', 'practice-side')
  you.appendChild(createAvatarBadge({ name: playerName, isBot: false }))
  you.appendChild(el('div', 'practice-side-name', playerName))
  const bot = el('div', 'practice-side')
  bot.appendChild(createAvatarBadge({ name: 'Robot', isBot: true }))
  bot.appendChild(el('div', 'practice-side-name', 'Robot'))
  matchup.append(you, el('div', 'practice-vs', 'vs'), bot)
  panel.appendChild(matchup)

  panel.appendChild(el('div', 'practice-group-label', 'Robot level'))
  const blurb = el('div', 'difficulty-blurb')
  const group = el('div', 'difficulty-group')
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', 'Robot level')

  // One paint function for the selection, so the three buttons and the description under
  // them cannot disagree: it is called once on entry and again on every click.
  const buttons: HTMLButtonElement[] = []
  const paint = (): void => {
    for (const btn of buttons) btn.setAttribute('aria-checked', String(btn.dataset.level === practiceDifficulty))
    const chosen = DIFFICULTIES.find((d) => d.level === practiceDifficulty)
    blurb.textContent = chosen?.blurb ?? ''
  }
  for (const spec of DIFFICULTIES) {
    const btn = el('button', 'difficulty', spec.label) as HTMLButtonElement
    btn.type = 'button'
    btn.dataset.level = spec.level
    btn.setAttribute('role', 'radio')
    btn.onclick = () => {
      practiceDifficulty = spec.level
      paint()
    }
    buttons.push(btn)
    group.appendChild(btn)
  }
  panel.appendChild(group)
  paint()
  panel.appendChild(blurb)

  const actions = el('div', 'practice-actions')
  const play = el('button', 'practice-play', 'Play') as HTMLButtonElement
  play.type = 'button'
  play.onclick = () => {
    // Disabled on the way out so a second click cannot start a second practice match; the
    // failure path puts it back, because nothing has happened yet in that case.
    play.disabled = true
    void api<{ id: string }>('/practice/start', { method: 'POST', body: { aiLevel: practiceDifficulty } })
      .then((data) => enterMatch(data.id, true))
      .catch((error: Error) => {
        play.disabled = false
        toast(error.message, 'error')
      })
  }
  actions.appendChild(play)
  actions.appendChild(el('div', 'practice-note', 'Practice is free and does not count toward your record.'))
  panel.appendChild(actions)

  page.appendChild(panel)
  app.appendChild(page)
}

/**
 * The banner at the top of the lobby.
 *
 * The first cut of this screen hard-coded a headline, a prize pool and a player
 * count, and left the button inert. Every one of those numbers would have been a
 * lie the moment the data changed, so the banner is now built from the tournaments
 * that are genuinely open, and the button joins the tournament it is describing.
 * With nothing open it says so and offers the one action that still works.
 */
async function featuredTournamentHero(): Promise<HTMLElement> {
  const hero = el('div', 'lobby-hero')
  const content = el('div', 'lobby-hero-content')
  const action = el('div', 'lobby-hero-action')

  let open: OpenTournament[] = []
  let mine: OpenTournament[] = []
  try {
    ;[open, mine] = await Promise.all([
      api<OpenTournament[]>('/tournaments/open'),
      api<OpenTournament[]>('/tournaments/mine')
    ])
  } catch {
    // A failed lookup must not take the lobby down with it; the card grid below
    // is still worth showing, so the banner degrades to its empty state.
    open = []
    mine = []
  }

  // The fullest open bracket is the one worth featuring, but a tournament the player
  // has already entered is worth more than a slightly busier one they cannot join.
  const featured = mine[0] ?? [...open].sort((a, b) => (b._count?.players ?? 0) - (a._count?.players ?? 0))[0]

  if (featured) {
    const inIt = mine.some((t) => t.id === featured.id)
    content.appendChild(el('h2', undefined, featured.name))
    const fee = Number(featured.entryFee ?? 0)
    content.appendChild(
      el(
        'p',
        undefined,
        `${featured._count?.players ?? 0}/${featured.size} players signed up · ` +
          `${fee > 0 ? `${formatCash(fee)} entry` : 'free entry'} · ${statusLabel(featured.status)}`
      )
    )

    if (inIt) {
      const viewBtn = el('button', undefined, 'VIEW BRACKET') as HTMLButtonElement
      viewBtn.type = 'button'
      viewBtn.onclick = () => {
        activeTournamentId = featured.id
        render()
      }
      action.appendChild(viewBtn)
    } else {
      const joinBtn = el('button', undefined, 'JOIN NOW') as HTMLButtonElement
      joinBtn.type = 'button'
      joinBtn.onclick = () => {
        // Disable before the request so a double click cannot burn two entries.
        joinBtn.disabled = true
        joinBtn.textContent = 'JOINING…'
        void api<{ joined: boolean }>('/tournaments/join', {
          method: 'POST',
          body: { tournamentId: featured.id }
        })
          .then(() => {
            activeTournamentId = featured.id
            render()
          })
          .catch((error) => {
            joinBtn.disabled = false
            joinBtn.textContent = 'JOIN NOW'
            toast(error.message, 'error')
          })
      }
      action.appendChild(joinBtn)
    }
  } else {
    content.appendChild(el('h2', undefined, 'No tournament open yet'))
    content.appendChild(el('p', undefined, 'Be the first to put a bracket on the board — 8 players, seeded by join order.'))
    const createBtn = el('button', undefined, 'CREATE ONE') as HTMLButtonElement
    createBtn.type = 'button'
    createBtn.onclick = () => {
      createBtn.disabled = true
      void startTournament()
    }
    action.appendChild(createBtn)
  }

  hero.append(content, action)
  return hero
}

/**
 * The tables waiting for a second player.
 *
 * Rendered as a horizontal strip to match the venue look. Each card is joined from
 * here directly, so the strip is a real route into a match and not a status board.
 */
async function openTablesStrip(): Promise<HTMLElement> {
  const strip = el('div', 'live-tables')
  // A skeleton rather than a line of text: the strip is a horizontal row of cards,
  // so the placeholder has the same shape as the thing it stands in for, and the
  // layout does not jump when the real cards replace it.
  for (const variant of ['skeleton-line', 'skeleton-line short', 'skeleton-line tiny']) {
    strip.appendChild(el('div', `skeleton ${variant}`))
  }

  let open: LobbyMatch[] = []
  try {
    open = await api<LobbyMatch[]>('/matches/lobby')
  } catch (error) {
    strip.replaceChildren(el('div', 'muted', (error as Error).message))
    return strip
  }
  strip.replaceChildren()

  if (!open.length) {
    strip.appendChild(el('div', 'muted', 'No tables waiting for an opponent. Start one above to be matched.'))
    return strip
  }

  // A player should not be invited to take a seat at their own table, and their own
  // table is the first thing they would otherwise see in the strip.
  const joinable = open.filter((m) => m.players[0]?.userId !== currentUser?.id)
  const mine = open.filter((m) => m.players[0]?.userId === currentUser?.id)

  for (const match of joinable) {
    strip.appendChild(openTableCard(match, false))
  }
  for (const match of mine) {
    strip.appendChild(openTableCard(match, true))
  }
  return strip
}

function openTableCard(match: LobbyMatch, isMine: boolean): HTMLElement {
  const c = el('div', 'live-table-card')
  const host = match.players[0]?.user.username ?? 'Unknown'
  c.appendChild(el('div', 'table-name', isMine ? 'Your table' : `${host} · ${match.format}`))
  c.appendChild(el('div', 'table-players', isMine ? 'Waiting for an opponent' : 'Open seat'))
  c.appendChild(el('div', 'table-score', formatCash(match.stakePerPlayer)))

  if (isMine) {
    const badge = el('span', 'badge', 'waiting')
    c.appendChild(badge)
  } else {
    const joinBtn = el('button', 'ghost', 'Take seat') as HTMLButtonElement
    joinBtn.type = 'button'
    joinBtn.onclick = () => {
      joinBtn.disabled = true
      void api('/matches/join', { method: 'POST', body: { matchId: match.id } })
        .then(() => enterMatch(match.id, false))
        .catch((error) => {
          joinBtn.disabled = false
          toast(error.message, 'error')
        })
    }
    c.appendChild(joinBtn)
  }
  return c
}

function createMatchCard(): HTMLElement {
  const c = el('div', 'lobby-card')
  const icon = el('div', 'lobby-card-icon', 'ðŸŽ¯')
  c.appendChild(icon)
  c.appendChild(el('h3', undefined, 'Quick Match'))
  c.appendChild(el('p', undefined, 'Jump into a 1v1 match'))
  const tierPicker = el('div', 'tier-picker')
  if (!tiers.length) {
    c.appendChild(el('div', 'muted', 'Tier list unavailable. Try refreshing.'))
    return c
  }
  let createTier = activeTierId ?? tiers[0]!.id

  // The balance, immediately above the tiers it pays for. This is the only place in the
  // new home flow where the number is worth showing: the home screen leads with who you
  // are, and this screen is where USDT is about to be committed to a table.
  const balance = el('div', 'stake-wallet')
  balance.appendChild(el('span', undefined, 'Balance'))
  balance.appendChild(el('strong', undefined, formatCash(wallet.balance)))
  c.appendChild(balance)

  for (const tier of tiers) {
    const chip = el('button', 'tier-chip', `${tier.label}`)
    chip.dataset.tier = tier.id
    if (tier.id === createTier) chip.classList.add('active')
    chip.onclick = () => {
      createTier = tier.id
      for (const btn of tierPicker.querySelectorAll<HTMLButtonElement>('.tier-chip')) {
        btn.classList.toggle('active', btn.dataset.tier === tier.id)
      }
    }
    tierPicker.appendChild(chip)
  }
  const formatSelect = el('select') as HTMLSelectElement
  for (const f of ['BO1', 'BO3', 'BO5']) {
    const option = el('option') as HTMLOptionElement
    option.value = f
    option.textContent = f
    formatSelect.appendChild(option)
  }
  const createBtn = el('button', undefined, 'Create Match')
  createBtn.onclick = () =>
    void api<{ id: string }>('/matches', {
      method: 'POST',
      body: { stakeTier: createTier, format: formatSelect.value }
    })
      .then((data) => enterMatch(data.id, false))
      .catch((error) => toast(error.message, 'error'))
  const row = el('div', 'row')
  const formatLabel = el('label', undefined, 'Format')
  formatLabel.appendChild(formatSelect)
  row.append(formatLabel, createBtn)
  c.appendChild(tierPicker)
  c.appendChild(row)
  return c
}

/**
 * Creates a tournament, takes the first seat in it and opens the bracket.
 *
 * Shared by the tournament card and the lobby banner's empty state, so the two
 * cannot drift apart — and so the banner does not have to build a whole card (and
 * the tournament list request behind it) just to click one button on it.
 */
function startTournament(): Promise<void> {
  return api<{ id: string }>('/tournaments', { method: 'POST', body: {} })
    .then((data) =>
      api<{ joined: boolean }>('/tournaments/join', { method: 'POST', body: { tournamentId: data.id } }).then(() => data)
    )
    .then((data) => {
      activeTournamentId = data.id
      render()
    })
    .catch((error) => {
      toast(error.message, 'error')
    })
}

function createTournamentCard(): HTMLElement {
  const c = card('8-Player Tournament — free')
  c.appendChild(el('div', 'muted', 'Single-elimination, best-of-3 frames. 8 players, seeded by join order. Winner takes the crown.'))
  const createBtn = el('button', undefined, 'Create Tournament') as HTMLButtonElement
  createBtn.type = 'button'
  createBtn.onclick = () => {
    createBtn.disabled = true
    void startTournament()
  }
  c.appendChild(el('div', 'row')).appendChild(createBtn)
  void loadTournamentLists(c)
  return c
}

async function loadTournamentLists(c: HTMLElement): Promise<void> {
  const loading = el('div', 'muted', 'Loading tournaments…')
  c.appendChild(loading)
  let open: OpenTournament[] = []
  let mine: OpenTournament[] = []
  let history: HistoryTournament[] = []
  try {
    ;[open, mine, history] = await Promise.all([
      api<OpenTournament[]>('/tournaments/open'),
      api<OpenTournament[]>('/tournaments/mine'),
      api<HistoryTournament[]>('/tournaments/history')
    ])
  } catch (error) {
    loading.textContent = (error as Error).message
    return
  }
  loading.remove()

  const openHead = el('div', 'subhead', 'Open tournaments')
  c.appendChild(openHead)
  if (!open.length) {
    c.appendChild(el('div', 'muted', 'None. Create one above — first to join takes seed 1.'))
  } else {
    for (const t of open) {
      const inMine = mine.some((m) => m.id === t.id)
      const count = t._count?.players ?? 0
      const rowEl = el('div', 'table-row')
      const info = el('div')
      info.appendChild(el('div', undefined, t.name))
      info.appendChild(el('div', 'meta', `${count}/${t.size ?? 8} players · ${statusLabel(t.status)} · ${timeAgo(t.createdAt)}`))
      rowEl.appendChild(info)
      if (inMine) {
        rowEl.appendChild(el('span', 'badge', 'joined'))
      } else {
        const joinBtn = el('button', undefined, 'Join')
        joinBtn.onclick = () =>
          void api<{ joined: boolean }>('/tournaments/join', { method: 'POST', body: { tournamentId: t.id } })
            .then(() => {
              activeTournamentId = t.id
              render()
            })
            .catch((error) => toast(error.message, 'error'))
        rowEl.appendChild(joinBtn)
      }
      c.appendChild(rowEl)
    }
  }

  const ongoing = mine.filter((m) => m.status === 'IN_PROGRESS' || m.status === 'FULL')
  if (ongoing.length) {
    c.appendChild(el('div', 'subhead', 'Your tournaments'))
    for (const t of ongoing) {
      const rowEl = el('div', 'table-row')
      const info = el('div')
      info.appendChild(el('div', undefined, t.name))
      info.appendChild(el('div', 'meta', `${t._count?.players ?? 8}/${t.size ?? 8} players · ${statusLabel(t.status)}`))
      rowEl.appendChild(info)
      const viewBtn = el('button', 'ghost', 'Bracket')
      viewBtn.onclick = () => {
        activeTournamentId = t.id
        render()
      }
      rowEl.appendChild(viewBtn)
      c.appendChild(rowEl)
    }
  }

  if (history.length) {
    c.appendChild(el('div', 'subhead', 'Past tournaments'))
    for (const t of history.slice(0, 5)) {
      const champion = t.players?.[0]?.user?.username
      const rowEl = el('div', 'table-row')
      const info = el('div')
      info.appendChild(el('div', undefined, `${t.name} — winner: ${champion ?? '?'}`))
      info.appendChild(el('div', 'meta', `${t._count?.players ?? 8} players · ${t.finishedAt ? new Date(t.finishedAt).toLocaleDateString() : ''}`))
      rowEl.appendChild(info)
      const viewBtn = el('button', 'ghost', 'Bracket')
      viewBtn.onclick = () => {
        activeTournamentId = t.id
        render()
      }
      rowEl.appendChild(viewBtn)
      c.appendChild(rowEl)
    }
  }
}

async function tablesCard(): Promise<HTMLElement> {
  const c = card('Tables — pick your price')
  const actions = el('div', 'row')
  const refreshBtn = el('button', 'ghost', 'Refresh tables')
  refreshBtn.onclick = () => void renderScreen('multiplayer')
  actions.appendChild(refreshBtn)
  c.appendChild(actions)
  try {
    const open = await api<LobbyMatch[]>('/matches/lobby')
    if (!tiers.length) {
      c.appendChild(el('div', 'muted', 'Tier list unavailable.'))
      return c
    }
    const counts = new Map<string, number>()
    for (const tier of tiers) {
      counts.set(tier.id, open.filter((m) => m.stakeTier === tier.id).length)
    }
    if (!activeTierId || !tiers.some((t) => t.id === activeTierId)) activeTierId = tiers[0]!.id

    const tabRow = el('div', 'row tabs')
    for (const tier of tiers) {
      const count = counts.get(tier.id) ?? 0
      const tab = el('button', 'tab', `${tier.label}${count ? ` · ${count}` : ''}`)
      tab.dataset.tier = tier.id
      if (tier.id === activeTierId) tab.classList.add('active')
      tab.onclick = () => {
        activeTierId = tier.id
        for (const btn of tabRow.querySelectorAll<HTMLButtonElement>('.tab')) {
          btn.classList.toggle('active', btn.dataset.tier === tier.id)
        }
        for (const section of c.querySelectorAll<HTMLElement>('.tier-section')) {
          section.classList.toggle('hidden', section.dataset.tier !== tier.id)
        }
      }
      tabRow.appendChild(tab)
    }
    c.appendChild(tabRow)

    for (const tier of tiers) {
      const matches = open.filter((m) => m.stakeTier === tier.id)
      const section = el('div', 'tier-section')
      section.dataset.tier = tier.id
      if (tier.id !== activeTierId) section.classList.add('hidden')
      section.appendChild(el('div', 'muted', `${formatCash(tier.usdt)} stake per player`))
      if (!matches.length) {
        section.appendChild(el('div', 'muted', 'No tables waiting at this price. Create one above.'))
      } else {
        for (const match of matches) {
          const wait = el('div', 'table-row')
          const host = match.players[0]
          const mine = host !== undefined && host.userId === currentUser?.id
          const info = el('div')
          info.appendChild(el('div', undefined, `${mine ? 'You' : host?.user.username ?? '?'} · ${match.format}`))
          info.appendChild(el('div', 'meta', `${formatCash(match.stakePerPlayer)} · waiting 1/2 · ${timeAgo(match.createdAt)}`))
          wait.appendChild(info)
          if (mine) {
            wait.appendChild(el('span', 'badge', 'waiting for opponent'))
          } else {
            const joinBtn = el('button', undefined, 'Join')
            joinBtn.onclick = () =>
              void api('/matches/join', { method: 'POST', body: { matchId: match.id } })
                .then(() => enterMatch(match.id, false))
                .catch((error) => toast(error.message, 'error'))
            wait.appendChild(joinBtn)
          }
          section.appendChild(wait)
        }
      }
      c.appendChild(section)
    }
  } catch (error) {
    c.appendChild(el('div', 'muted', (error as Error).message))
  }
  return c
}

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

async function matchHistoryCard(): Promise<HTMLElement> {
  const c = card('History')
  try {
    const history = await api<HistoryMatch[]>('/matches/history')
    if (!history.length) {
      c.appendChild(el('div', 'muted', 'No matches played yet.'))
      return c
    }
    const table = el('table')
    const thead = el('tr')
    for (const thText of ['Match', 'Format', 'Result', 'Opponent', 'When']) thead.appendChild(el('th', undefined, thText))
    table.appendChild(thead)
    for (const match of history) {
      const tr = el('tr')
      tr.appendChild(el('td', undefined, match.id.slice(0, 8)))
      tr.appendChild(el('td', undefined, match.format))
      const mine = match.winnerId !== null && match.winnerId === currentUser?.id
      const badge = el('span', mine ? 'badge' : 'badge foul', mine ? 'W' : 'L')
      tr.appendChild(el('td')).appendChild(badge)
      const opp = match.players.find((p) => p.userId !== currentUser?.id)?.user.username ?? '?'
      tr.appendChild(el('td', undefined, opp))
      tr.appendChild(el('td', undefined, match.finishedAt ? new Date(match.finishedAt).toLocaleString() : 'ongoing'))
      table.appendChild(tr)
    }
    c.appendChild(table)
  } catch {
    c.appendChild(el('div', 'muted', 'No matches played yet.'))
  }
  return c
}

async function profileStatsCard(): Promise<HTMLElement> {
  const c = card('Profile & leaderboard')
  const body = el('div')
  c.appendChild(body)

  try {
    const profile = await api<MyProfile>('/me')
    const s = profile.stats
    const tiles = el('div', 'stat-tiles')
    const items: Array<[string, string]> = [
      ['Matches', `${s.matches}`],
      ['Wins', `${s.wins}`],
      ['Losses', `${s.losses}`],
      ['Win rate', `${s.winRate}%`],
      ['Highest break', `${s.highestBreak}`]
    ]
    for (const [label, value] of items) {
      const tile = el('div', 'stat-tile')
      tile.appendChild(el('div', 'stat-value', value))
      tile.appendChild(el('div', 'stat-label', label))
      tiles.appendChild(tile)
    }
    body.appendChild(tiles)
  } catch {
    body.appendChild(el('div', 'muted', 'Stats unavailable.'))
  }

  const periodRow = el('div', 'row')
  periodRow.appendChild(el('span', 'muted', 'Leaderboard:'))
  const periodSelect = el('select') as HTMLSelectElement
  for (const [value, label] of [
    ['all', 'All time'],
    ['month', 'Last 30 days'],
    ['week', 'Last 7 days']
  ] as const) {
    const option = el('option') as HTMLOptionElement
    option.value = value
    option.textContent = label
    periodSelect.appendChild(option)
  }
  periodRow.appendChild(periodSelect)
  body.appendChild(periodRow)

  const boardBox = el('div')
  body.appendChild(boardBox)

  const renderBoard = (period: string): void => {
    boardBox.innerHTML = ''
    boardBox.appendChild(el('div', 'muted', 'Loading leaderboard…'))
    void api<LeaderboardData>(`/leaderboard?period=${period}`)
      .then((data) => {
        boardBox.innerHTML = ''
        if (!data.rows.length) {
          boardBox.appendChild(el('div', 'muted', 'No ranked matches yet — play a real match to get on the board.'))
          return
        }
        const table = el('table')
        const thead = el('tr')
        for (const thText of ['#', 'Player', 'W-L', 'Win rate', 'High break']) thead.appendChild(el('th', undefined, thText))
        table.appendChild(thead)
        for (const row of data.rows) {
          const tr = el('tr')
          const isMe = row.userId === currentUser?.id
          if (isMe) tr.classList.add('you-row')
          tr.appendChild(el('td', undefined, `${row.rank}`))
          const nameTd = el('td')
          nameTd.appendChild(el('span', undefined, row.username))
          if (isMe) nameTd.appendChild(el('span', 'you-dot', '  you'))
          tr.appendChild(nameTd)
          tr.appendChild(el('td', undefined, `${row.wins}-${row.losses}`))
          tr.appendChild(el('td', undefined, `${row.winRate}%`))
          tr.appendChild(el('td', undefined, `${row.highestBreak}`))
          table.appendChild(tr)
        }
        if (data.me && !data.rows.some((r) => r.userId === data.me!.userId)) {
          const tr = el('tr', 'you-row')
          tr.appendChild(el('td', undefined, `${data.me.rank}`))
          const nameTd = el('td')
          nameTd.appendChild(el('span', undefined, data.me.username))
          nameTd.appendChild(el('span', 'you-dot', '  you'))
          tr.appendChild(nameTd)
          tr.appendChild(el('td', undefined, `${data.me.wins}-${data.me.losses}`))
          tr.appendChild(el('td', undefined, `${data.me.winRate}%`))
          tr.appendChild(el('td', undefined, `${data.me.highestBreak}`))
          table.appendChild(tr)
        }
        boardBox.appendChild(table)
      })
      .catch((error) => {
        boardBox.innerHTML = ''
        boardBox.appendChild(el('div', 'muted', (error as Error).message))
      })
  }

  periodSelect.onchange = () => renderBoard(periodSelect.value)
  renderBoard('all')
  return c
}

/**
 * VS AI start path with the match loading overlay: real phase progress, GPU warm-up,
 * then handover. An online challenge resolves later (when someone accepts), so it
 * does not share this screen — it enters the match directly from the challenge
 * layer once the table is taken.
 */
async function startPracticeWithLoadingScreen(aiLevel: PracticeAiLevel, format: MatchFormat = 'BO1'): Promise<void> {
  const loading = showMatchLoading({ modeLabel: 'VS AI' })
  const perf = new URLSearchParams(location.search).has('perf')
  const phaseMs: Partial<Record<LoadPhase | 'total', number>> = {}
  const runPhase = async (phase: LoadPhase, work: () => Promise<void> | void): Promise<void> => {
    const t0 = performance.now()
    loading.report(phase, 0)
    try {
      await work()
    } catch (err) {
      console.warn(`[match-loading] phase ${phase} failed; continuing`, err)
    }
    loading.report(phase, 1)
    phaseMs[phase] = performance.now() - t0
  }

  const tAll = performance.now()
  try {
    await runPhase('fonts', async () => {
      await Promise.all([document.fonts.ready.catch(() => undefined), ensureLobbyBgReady()])
    })

    // Network must succeed: without a match id there is nothing to warm. Do not swallow.
    loading.report('network', 0)
    const tNet = performance.now()
    let matchId: string
    try {
      const data = await api<{ id: string }>('/practice/start', { method: 'POST', body: { aiLevel, format } })
      matchId = data.id
      loading.report('network', 1)
      phaseMs.network = performance.now() - tNet
    } catch (err) {
      await loading.finish().catch(() => undefined)
      throw err
    }

    await runPhase('scene', async () => {
      enterMatch(matchId, true)
    })
    for (const p of ['audio', 'textures', 'shaders', 'bakes', 'warmup'] as const) loading.report(p, 1)

    if (perf) {
      phaseMs.total = performance.now() - tAll
      console.info('[perf] match loading phases (ms)', phaseMs)
    }

    await loading.finish()
  } catch (err) {
    console.warn('[match-loading] aborting overlay after error', err)
    await loading.finish().catch(() => undefined)
    throw err
  }
}

function enterMatch(matchId: string, isPractice = false): void {
  activeMatchId = matchId
  activeMatchIsPractice = isPractice
  clearTournamentTimer()
  mySeat = undefined
  chessSnap = null
  framesWon = [0, 0]
  frameIndex = 1
  players = []
  opponentGone = false
  render()
  getSocket().emit('match:join', { matchId })
  void loadMatchMeta(matchId)
}

function updateNetOverlay(): void {
  if (!netOverlayEl) return
  const show = activeMatchId !== null && (!connected || !navigator.onLine)
  netOverlayEl.style.display = show ? 'flex' : 'none'
  const text = netOverlayEl.querySelector('p')
  if (text) {
    text.textContent = !navigator.onLine ? 'You are offline — reconnecting…' : 'Connection lost — reconnecting…'
  }
}

function renderGame(): void {
  app.innerHTML = ''
  app.className = 'app-root app-game'
  document.body.classList.add('game-mode')

  chessView?.destroy()
  const view = createChessView({
    onMove: (move: ChessMoveInput) => {
      if (!activeMatchId) return
      getSocket().emit('move:play', { matchId: activeMatchId, move })
    }
  })
  chessView = view

  const overlay = el('div', 'net-overlay')
  overlay.appendChild(el('p', undefined, 'Connection lost — reconnecting…'))
  view.overlayRoot.appendChild(overlay)
  netOverlayEl = overlay
  const oppHolder = el('div')
  oppHolder.id = 'opp-holder'
  view.overlayRoot.appendChild(oppHolder)
  const drawBar = el('div', 'draw-bar')
  drawBar.setAttribute('role', 'status')
  drawBar.hidden = true
  view.overlayRoot.appendChild(drawBar)
  drawBarEl = drawBar

  const tool = (mount: HTMLElement, label: string, mark: string) => {
    const btn = el('button', 'hud-tool hud-glass') as HTMLButtonElement
    btn.type = 'button'
    btn.title = label
    btn.setAttribute('aria-label', label)
    btn.innerHTML = mark
    mount.appendChild(btn)
    return btn
  }
  const stroke = (body: string) =>
    `<svg class="hud-tool-icon" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  const leaveMark = stroke(
    '<path d="M12.5 3.5H7a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h5.5"/><path d="M9.5 10h7m0 0L14 7.5M16.5 10 14 12.5"/>'
  )
  const soundOnMark = stroke(
    '<path d="M4 8.5v3h2.6L10 14.6V5.4L6.6 8.5H4z"/><path d="M12.4 8a3.4 3.4 0 0 1 0 4M14.7 5.8a6.5 6.5 0 0 1 0 8.4"/>'
  )
  const soundOffMark = stroke(
    '<path d="M4 8.5v3h2.6L10 14.6V5.4L6.6 8.5H4z"/><path d="M12.6 8.4l4.2 3.2m0-3.2-4.2 3.2"/>'
  )
  const flagMark = stroke('<path d="M5.5 16.5v-13"/><path d="M5.5 4.5h8.5l-1.6 3.1 1.6 3.1h-8.5z"/>')
  const chatMark = stroke(
    '<path d="M4 4.5h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9.5L5.5 15v-2.5H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/><path d="M7.5 8h5M7.5 10.5h3"/>'
  )
  const expandMark = stroke(
    '<path d="M3.5 7.6V3.5h4.1M16.5 7.6V3.5h-4.1M3.5 12.4v4.1h4.1M16.5 12.4v4.1h-4.1"/>'
  )

  const leaveBtn = tool(view.toolsRoot, 'Leave', leaveMark)
  leaveBtn.onclick = () => leaveToLobby()

  const sessionMount = view.sessionToolsRoot
  const soundBtn = tool(sessionMount, isSoundMuted() ? 'Sound: off' : 'Sound: on', isSoundMuted() ? soundOffMark : soundOnMark)
  soundBtn.setAttribute('aria-pressed', String(isSoundMuted()))
  soundBtn.onclick = () => {
    const next = !isSoundMuted()
    setSoundMuted(next)
    soundBtn.innerHTML = next ? soundOffMark : soundOnMark
    const label = next ? 'Sound: off' : 'Sound: on'
    soundBtn.title = label
    soundBtn.setAttribute('aria-label', label)
    soundBtn.setAttribute('aria-pressed', String(next))
  }

  const drawMark = stroke('<text x="10" y="14.2" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none">\u00bd</text>')
  const drawBtn = tool(sessionMount, 'Offer a draw', drawMark)
  drawBtn.onclick = () => {
    if (activeMatchId) getSocket().emit('draw:offer', { matchId: activeMatchId })
  }
  const concedeBtn = tool(sessionMount, activeMatchIsPractice ? 'Finish' : 'Resign', flagMark)
  concedeBtn.onclick = () => {
    if (activeMatchIsPractice) void finishPractice()
    else askConcede()
  }

  if (!activeMatchIsPractice) {
    const chatBtn = tool(sessionMount, 'Chat', chatMark)
    chatBtn.setAttribute('aria-expanded', 'false')
    const chatMenu = el('div', 'hud-pop hud-glass hud-chat')
    chatMenu.id = 'match-chat-menu'
    chatMenu.setAttribute('role', 'group')
    chatMenu.hidden = true
    chatBtn.setAttribute('aria-controls', chatMenu.id)
    chatBtn.onclick = () => {
      chatMenu.hidden = !chatMenu.hidden
      chatBtn.setAttribute('aria-expanded', String(!chatMenu.hidden))
    }
    const grid = el('div', 'hud-chat-grid')
    for (const phrase of MATCH_CHAT_PHRASES) {
      const phraseBtn = el('button', 'hud-chat-phrase', phrase.text) as HTMLButtonElement
      phraseBtn.type = 'button'
      phraseBtn.onclick = () => {
        sendChatPhrase(phrase.id)
        chatMenu.hidden = true
        chatBtn.setAttribute('aria-expanded', 'false')
      }
      grid.appendChild(phraseBtn)
    }
    chatMenu.appendChild(grid)
    sessionMount.append(chatMenu)
    chatMenuEl = chatMenu
  }

  const fullBtn = tool(sessionMount, 'Fullscreen', expandMark)
  fullBtn.onclick = () => {
    const leaving = document.fullscreenElement !== null
    const change = leaving ? document.exitFullscreen() : document.documentElement.requestFullscreen()
    change
      .then(() => {
        const label = leaving ? 'Fullscreen' : 'Leave fullscreen'
        fullBtn.title = label
        fullBtn.setAttribute('aria-label', label)
      })
      .catch(() => {})
  }

  app.appendChild(view.root)
  if (!activeMatchIsPractice) {
    const chatLog = el('div', 'hud-glass match-chat-log')
    chatLog.id = 'match-chat-log'
    chatLog.setAttribute('aria-live', 'polite')
    chatLog.hidden = true
    view.root.appendChild(chatLog)
    chatLogEl = chatLog
  }
  updateNetOverlay()
  updateHud()
  updateOpponentGone()
  if (chessSnap) view.update(chessSnap)
}

interface GameUpdatePayload {
  frame: ChessSnapshot
  events?: Array<{ type: string; data: unknown }>
  turn?: ChessClockTiming
  /** Match points per seat (1 a win, ½ a draw), sent with every board. */
  framesWon?: [number, number]
}

let lastTimingStamp = -1
function applyTurnTiming(turn: ChessClockTiming | null | undefined): void {
  if (turn && turn.serverNow < lastTimingStamp) return
  if (turn) lastTimingStamp = turn.serverNow
  chessView?.setTiming(turn ?? null)
}

/** Applies a board from the server and reads out a finished game. */
function applyGameUpdate(data: GameUpdatePayload): void {
  const before = chessSnap
  chessSnap = data.frame
  if (data.framesWon) framesWon = [data.framesWon[0], data.framesWon[1]]
  applyTurnTiming(data.turn)
  chessView?.update(chessSnap)
  if (data.frame.drawOfferBy !== null && data.frame.drawOfferBy !== mySeat && before?.drawOfferBy !== data.frame.drawOfferBy) {
    toast(`${opponentName()} offers a draw`)
  }
  for (const ev of data.events ?? []) {
    if (ev.type === 'DRAW_DECLINED' && (ev.data as { bySeat?: number }).bySeat !== mySeat) toast('Your draw offer was declined')
    if (ev.type !== 'FRAME_END') continue
    const d = ev.data as { winnerSeat: number | null; result: ChessSnapshot['result'] }
    const how = describeGameEnd(d.result)
    const drawn = isDrawResult(d.result)
    const winner = d.winnerSeat === null || d.winnerSeat === undefined ? null : d.winnerSeat
    const text =
      winner === null
        ? `${how} \u2014 \u00bd\u2013\u00bd`
        : drawn && data.frame.armageddon
          ? `${how} \u2014 black wins the Armageddon: ${seatName(winner)} ${winner === mySeat ? 'win' : 'wins'}`
          : d.result === 'TIMEOUT'
            ? `${seatName(1 - winner)} lost on time`
            : d.result === 'RESIGN'
              ? `${seatName(1 - winner)} resigned`
              : `${how} \u2014 ${seatName(winner)} ${winner === mySeat ? 'win' : 'wins'}`
    chessView?.announce(`${text}  \u00b7  ${formatPoints(framesWon[mySeat ?? 0] ?? 0)}\u2013${formatPoints(framesWon[1 - (mySeat ?? 0)] ?? 0)}`)
  }
  updateHud()
  syncDrawUi()
}

function handleSocketEvents(socket: Socket): void {
  socket.on('connect', () => {
    connected = true
    updateConnChip()
    updateNetOverlay()
    if (activeMatchId) socket.emit('match:join', { matchId: activeMatchId })
    // A reconnect may have missed a challenge push; reconcile from the server.
    void fetchIncomingChallenges()
  })
  socket.on('disconnect', () => {
    connected = false
    updateConnChip()
    updateNetOverlay()
  })

  // Live invitations. My own table never echoes back to me; a table that arrives
  // mid-match is withheld (the layer stays down until the match is over).
  socket.on('challenge:new', (challenge: ChallengeDto) => {
    if (!currentUser || challenge.challengerId === currentUser.id) return
    if (activeMatchId) return
    upsertIncomingChallenge(challenge)
    renderChallengeLayer()
  })
  socket.on('challenge:closed', (payload: { challengeId: string; reason?: string }) => {
    const wasPending = pendingChallenge?.id === payload.challengeId
    removeIncomingChallenge(payload.challengeId)
    if (wasPending) {
      const wasRematch = pendingChallenge?.rematch === true
      pendingChallenge = null
      if (payload.reason === 'declined') {
        toast(wasRematch ? 'Your opponent declined the rematch' : 'Your friend declined the invite', 'error')
      } else if (payload.reason === 'expired') toast('Your table expired — nobody joined')
    }
    renderChallengeLayer()
  })
  socket.on('challenge:matched', (payload: { challengeId: string; matchId: string; opponentUsername: string }) => {
    // I opened this table and somebody took it: close the wait and sit down.
    if (pendingChallenge?.id === payload.challengeId) pendingChallenge = null
    removeIncomingChallenge(payload.challengeId)
    renderChallengeLayer()
    enterMatch(payload.matchId, false)
  })

  socket.on('match:joined', (data: { matchId: string; seat: number; snapshot: ChessSnapshot | null; turn?: ChessClockTiming }) => {
    mySeat = data.seat
    updateHud()
    if (data.snapshot) applyGameUpdate({ frame: data.snapshot, turn: data.turn })
    else applyTurnTiming(data.turn)
  })
  socket.on('match:start', (data: { snapshot: ChessSnapshot; frameIndex: number; turn?: ChessClockTiming; framesWon?: [number, number] }) => {
    frameIndex = data.frameIndex
    chessView?.announce(null)
    applyGameUpdate({ frame: data.snapshot, turn: data.turn, framesWon: data.framesWon })
    toast(`Colours drawn by lot \u2014 you play ${data.snapshot.whiteSeat === mySeat ? 'white' : 'black'}`)
  })
  socket.on('frame:start', (data: { frameIndex: number; snapshot: ChessSnapshot; turn?: ChessClockTiming; framesWon?: [number, number] }) => {
    frameIndex = data.frameIndex
    chessView?.announce(null)
    applyGameUpdate({ frame: data.snapshot, turn: data.turn, framesWon: data.framesWon })
    const colour = data.snapshot.whiteSeat === mySeat ? 'white' : 'black'
    toast(
      data.snapshot.armageddon
        ? `Armageddon tie-break \u2014 you play ${colour}. White has 5:00, black 4:00; a draw means black wins.`
        : `Game ${data.frameIndex} \u2014 you play ${colour}`
    )
  })
  socket.on('game:update', (data: GameUpdatePayload) => applyGameUpdate(data))
  socket.on('turn:clock', (data: { turn?: ChessClockTiming }) => applyTurnTiming(data.turn ?? null))
  socket.on('match:end', (data: { winnerSeat: number; reason?: string; framesWon?: [number, number] }) => {
    stopOpponentCountdown()
    opponentGone = false
    updateOpponentGone()
    if (data.framesWon) framesWon = data.framesWon
    chessView?.setInteractive(false)
    applyTurnTiming(null)
    playMatchEnd()
    updateHud()
    void finishMatch(data.winnerSeat, data.reason)
  })
  socket.on('opponent:disconnected', (data: { seat: number }) => {
    if (data.seat === mySeat) return
    opponentGone = true
    updateOpponentGone()
    toast('Opponent disconnected — waiting for reconnect')
  })
  socket.on('opponent:countdown', (data: { seats?: number[]; seconds?: number }) => {
    if (mySeat === undefined || (data.seats ?? []).includes(mySeat) || activeMatchIsPractice) return
    opponentGone = true
    startOpponentCountdown(Number(data.seconds) || 30)
  })
  socket.on('opponent:reconnected', (data: { seat: number }) => {
    if (data.seat === mySeat) return
    opponentGone = false
    stopOpponentCountdown()
    updateOpponentGone()
    toast('Opponent reconnected')
  })
  socket.on('match:chat', (data: { seat: number; phraseId: string }) => {
    const text = matchChatPhraseText(data.phraseId)
    if (!text) return
    const sender =
      data.seat === mySeat ? 'You' : (players.find((p) => p.seat === data.seat)?.user.username ?? opponentName())
    appendMatchChat(sender, text)
  })
  socket.on('match:replay', () => {
    // The snapshot sent with the join already shows the current board and clocks.
  })
  socket.on('error', (data: { code?: string }) => {
    // A refused move is taken back off the board, which returns to the server's position.
    chessView?.revert()
    toast(`Server: ${(data.code ?? 'unknown error').replace(/_/g, ' ')}`, 'error')
  })
  socket.on('announcement:new', (a: Announcement) => {
    receiveAnnouncement(a)
    // Never over a match: a line in the corner now, the card back in the lobby.
    if (activeMatchId) toast(`Announcement: ${a.title}`)
    else showNextAnnouncement()
  })
  socket.on('notification:new', (n: NotificationItem) => {
    notifications.unshift(n)
    if (panelOpen) panelEl?.classList.remove('open')
    toast(`${n.title}${n.body && n.body !== n.title ? ' — ' + n.body : ''}`)
    refreshBell()
    if (n.kind === 'LEVEL_UP' || n.kind === 'RANK_UP' || n.kind === 'BADGE_EARNED') void lobbySession?.refreshProgress()
    if (n.kind === 'SUPPORT_REPLY') refreshSupportChat()
  })
}

function reportFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const chip = document.getElementById('err-chip')
  if (!chip) return
  chip.textContent = message.length > 140 ? message.slice(0, 140) : message
  const prev = Number(chip.dataset.timer)
  if (prev) window.clearTimeout(prev)
  chip.dataset.timer = String(
    window.setTimeout(() => {
      chip.textContent = ''
      delete chip.dataset.timer
    }, 8000)
  )
}

async function refreshMaintenance(): Promise<void> {
  try {
    const data = await api<{ maintenanceMode: boolean }>('/settings/public')
    if (maintenanceMode !== data.maintenanceMode) {
      maintenanceMode = data.maintenanceMode
      renderMaintenance()
    }
  } catch {
    void 0
  }
}

function renderMaintenance(): void {
  maintenanceEl?.remove()
  maintenanceEl = null
  if (!maintenanceMode) return
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN'
  const el = document.createElement('div')
  el.className = isAdmin ? 'maintenance-banner' : 'maintenance-overlay'
  const p = document.createElement('p')
  p.textContent = isAdmin
    ? 'Maintenance mode is ON - players are blocked. Turn it off in the admin app (Settings).'
    : 'The platform is briefly under maintenance. Please check back soon.'
  el.appendChild(p)
  document.body.appendChild(el)
  maintenanceEl = el
}

async function init(): Promise<void> {
  document.title = APP_TITLE
  // Start the table model download now, in parallel with the auth/lobby boot. The
  // online path has no loading screen to await it in, so `tableModelIfReady()` has
  // to be able to answer by the time a scene is built; a cached, warmed download is
  // what makes that true.
  const chip = document.createElement('div')
  chip.id = 'err-chip'
  chip.className = 'err-chip'
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  document.body.appendChild(chip)
  window.addEventListener('error', (event) => reportFatalError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportFatalError(event.reason))
  const online = (): void => {
    updateNetOverlay()
    updateConnChip()
  }
  window.addEventListener('online', online)
  window.addEventListener('offline', online)
  const unlock = (): void => {
    unlockAudio()
    armMusic()
    document.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  document.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  let booted = false
  const finishBoot = (): void => {
    if (!booted) {
      booted = true
      void refreshMaintenance()
      window.setInterval(refreshMaintenance, 10000)
    }
    render()
  }

  // Paint sign-in before any network call. A phone cannot reach 10.0.2.2, and a
  // fetch with no timeout used to sit on the empty gradient forever.
  finishBoot()

  const startSession = (user: SessionUser, sessionToken: string): void => {
    token = sessionToken
    storeToken(sessionToken)
    currentUser = user
    handleSocketEvents(connectSocket(sessionToken))
    void fetchNotifications()
    void fetchIncomingChallenges()
    void fetchAnnouncements()
    void askForDateOfBirthIfMissing(() => activeMatchId !== null, (message, kind) => toast(message, kind))
  }
  // A stored token is checked before anything uses it; a stale one is dropped and a
  // still-valid session cookie is exchanged for a fresh one. When the server cannot be
  // reached at all, the stored token is kept (a network blip must not sign anyone
  // out) and the sign-in card says the server is offline.
  let unreachable = false
  if (token) {
    try {
      const deviceId = await getDeviceId()
      const data = await api<{ authenticated: boolean; user?: SessionUser }>(`/auth/status?deviceId=${encodeURIComponent(deviceId)}`, {
        timeoutMs: FAST_TIMEOUT_MS
      })
      if (data.authenticated && data.user) startSession(data.user, token)
      else throw new Error('stale session')
    } catch (error) {
      if (isUnreachable(error)) unreachable = true
      else {
        token = ''
        clearStoredToken()
      }
    }
  }
  if (!currentUser && !unreachable) {
    try {
      const data = await api<{ user: SessionUser; token: string }>('/auth/session', { timeoutMs: FAST_TIMEOUT_MS })
      startSession(data.user, data.token)
    } catch (error) {
      // No session at all is the ordinary case; only an unreachable server is news.
      if (isUnreachable(error)) unreachable = true
    }
  }
  if (!currentUser && unreachable) setAuthOfflineNotice(true)
  checkingSession = false
  finishBoot()
}

// Debug only: opened with ?tabledebug, the page reports how its drawn table compares
// with the server's (see Scene3D.debugTableCheck). Nothing is exposed otherwise.
void init()
