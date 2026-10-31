import { APP_TITLE } from '@snooker/shared'
import './casino.css'
import { el } from './dom.js'
import { ICONS } from './icons.js'
import { fillLevelChip } from './progress.js'
import type { LobbyBridge, LobbyHistoryMatch, LobbyProgress, LobbyView } from './types.js'

/**
 * The desktop lobby: a sidebar, a top bar, and the home page laid out like a games hall.
 *
 * Presentation only. Every button here calls a function it is handed; nothing in this
 * file starts a match, moves money or talks to the server. Destinations that do not exist
 * yet (the leaderboard, private rooms) say so when pressed rather than pretending.
 *
 * The same lobby on every screen. On a desktop the sidebar stands beside the page; on a
 * phone (casino.css, the phone section) it becomes a drawer behind a menu button, the
 * top bar shrinks to the brand, the bell, the avatar and the balance, and a tab bar along
 * the bottom carries the five places a thumb goes most.
 */

/** Where the sidebar and the top bar can send the player. */
export type CasinoDestination =
  | 'home'
  | 'play'
  | 'tournaments'
  | 'games'
  | 'wallet'
  | 'leaderboard'
  | 'friends'
  | 'invite'
  | 'settings'
  | 'rules'
  | 'support'

export interface CasinoShellHandlers {
  go: (where: CasinoDestination) => void
  onSoundToggle: () => void
  onFullscreen: () => void
  onProfile: () => void
}

export interface CasinoHomeActions {
  playNow: () => void
  quickPlay: () => void
  practice: () => void
  createRoom: () => void
  tournaments: () => void
  /** High-stake Master Match: 500 to 5000 USDT on the virtual ledger. */
  masterMatch: () => void
  /** The player's own games and record. */
  openGames: () => void
  history: LobbyHistoryMatch[]
  userId: string
}

/**
 * Whether the casino lobby is the one to show in this window.
 *
 * Every window now: the phone gets the same hall, laid out for a thumb by casino.css, so
 * the pictures, the cards and the wallet are the same on both. The compact lobby is kept
 * in the code (shell.ts) and comes back only where this answers false.
 */
export function wantsCasinoLobby(): boolean {
  return true
}

const ICON = {
  home: svg('<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>'),
  games: svg('<rect x="3" y="8" width="18" height="10" rx="5"/><path d="M8 11v4M6 13h4"/><circle cx="15.5" cy="12" r="1"/><circle cx="17.5" cy="14" r="1"/>'),
  leaderboard: svg('<path d="M4 20V12h4v8"/><path d="M10 20V7h4v13"/><path d="M16 20v-6h4v6"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  bolt: svg('<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>'),
  shield: svg('<path d="M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
  coin: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 9h7M12 9v8"/><path d="M8.5 12.2c1.2.6 5.8.6 7 0"/>'),
  room: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 18v2M16 18v2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/>'),
  crown: svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" fill-opacity="0.25"/>'),
  x: svg('<path d="M5 5l14 14M19 5 5 19"/>'),
  chevronLeft: svg('<path d="m15 5-7 7 7 7"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  discord: svg('<path d="M8 8c2.6-1 5.4-1 8 0l1 1c1.2 2 1.8 4.2 1.8 6.5-1.3 1-2.7 1.6-4.1 2l-.8-1.3M8 8l-1 1c-1.2 2-1.8 4.2-1.8 6.5 1.3 1 2.7 1.6 4.1 2l.8-1.3"/><circle cx="9.8" cy="13" r="1"/><circle cx="14.2" cy="13" r="1"/>'),
  telegram: svg('<path d="M21 4 3 11l6 2 2 6 3-4 4 3z"/><path d="m9 13 8-6"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>'),
  youtube: svg('<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>')
}

function svg(body: string): string {
  return (
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  )
}

/** The wordmark: the name in white, the last word in gold, a small crown over it. */
function wordmark(title: string, big = false): HTMLElement {
  const mark = el('span', big ? 'cx-wordmark cx-wordmark--big' : 'cx-wordmark')
  const crown = el('span', 'cx-wordmark__crown')
  crown.innerHTML = ICON.crown
  const space = title.lastIndexOf(' ')
  const cut = space > 0 ? space + 1 : title.toUpperCase().lastIndexOf('X')
  const word = el('span', 'cx-wordmark__word')
  if (cut > 0) {
    word.append(document.createTextNode(title.slice(0, cut)), el('span', 'cx-wordmark__x', title.slice(cut)))
  } else {
    word.textContent = title
  }
  mark.append(crown, word)
  return mark
}

/**
 * Coins drifting down behind everything: gold ones and green ones marked with the dollar
 * sign of the table's currency. Pure decoration, under the page and never in the way of a
 * click. Each is one element on a transform animation, so the browser moves finished
 * pictures and never redraws the page for them.
 */
function coinRain(): HTMLElement {
  const layer = el('div', 'cx-coins')
  layer.setAttribute('aria-hidden', 'true')
  const count = 16
  for (let i = 0; i < count; i++) {
    const coin = el('span', i % 3 === 0 ? 'cx-coin cx-coin--green' : 'cx-coin')
    coin.textContent = i % 3 === 0 ? '₮' : '$'
    // Spread across the width, staggered in time, of a few sizes and speeds, so the fall
    // never lines up into rows.
    const left = ((i * 37) % 100) + (i % 2 ? 2.5 : 0)
    coin.style.setProperty('--x', `${left}%`)
    coin.style.setProperty('--size', `${18 + ((i * 7) % 22)}px`)
    coin.style.setProperty('--dur', `${11 + ((i * 5) % 9)}s`)
    coin.style.setProperty('--delay', `${-((i * 1.7) % 14)}s`)
    coin.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (20 + ((i * 11) % 40))}px`)
    layer.appendChild(coin)
  }
  return layer
}

const NAV: Array<{ id: CasinoDestination; label: string; icon: string }> = [
  { id: 'home', label: 'Home', icon: ICON.home },
  { id: 'play', label: 'Play Now', icon: ICON.play },
  { id: 'tournaments', label: 'Tournaments', icon: ICONS.trophy },
  { id: 'games', label: 'My Games', icon: ICON.games },
  { id: 'wallet', label: 'Wallet', icon: ICONS.deposit },
  { id: 'leaderboard', label: 'Leaderboard', icon: ICON.leaderboard },
  { id: 'friends', label: 'Friends', icon: ICONS.friends },
  { id: 'invite', label: 'Invite & Earn', icon: ICONS.invite },
  { id: 'rules', label: 'Rules', icon: ICONS.rules },
  { id: 'support', label: 'Support', icon: ICON.chat },
  { id: 'settings', label: 'Settings', icon: ICONS.gear }
]

/** Where the player's choice of an open or closed sidebar is kept, per browser. */
const SIDE_COLLAPSED_KEY = 'snookerx.sideCollapsed'

/**
 * Whether the sidebar starts closed. The player's own choice when they have made one;
 * otherwise open on a desktop, and on a phone open on the home page and closed on the
 * other screens, which need the width for their forms.
 */
function sideStartsCollapsed(view: LobbyView): boolean {
  try {
    const saved = window.localStorage.getItem(SIDE_COLLAPSED_KEY)
    if (saved === '1') return true
    if (saved === '0') return false
  } catch {
    // Storage refused: fall back to the default below.
  }
  try {
    return view !== 'home' && window.matchMedia('(max-width: 1023px)').matches
  } catch {
    return false
  }
}

function rememberSideCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDE_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Not remembered; the sidebar still opens and closes for this visit.
  }
}

/**
 * Writes a balance as its number and a smaller currency after it ("12.50" then "USDT"),
 * so the amount is what the eye reads first. The text comes formatted ("12.50 USDT");
 * anything without a currency on the end is written as it is.
 */
export function fillBalance(node: HTMLElement, formatted: string): void {
  const match = /^(.*?)\s*([A-Za-z]{2,5})$/.exec(formatted.trim())
  if (!match) {
    node.textContent = formatted
    return
  }
  node.replaceChildren(el('span', 'cx-balance__num', match[1]!), el('span', 'cx-balance__unit', match[2]!))
}

function activeDestination(view: LobbyView): CasinoDestination {
  if (view === 'setup') return 'play'
  if (view === 'statistics') return 'games'
  if (view === 'deposit' || view === 'withdraw') return 'wallet'
  if (view === 'friends') return 'friends'
  if (view === 'invite') return 'invite'
  if (view === 'info') return 'rules'
  if (view === 'settings') return 'settings'
  return 'home'
}

/** The frame every desktop lobby screen sits in: sidebar, top bar, and the page between. */
export function createCasinoShell(
  bridge: LobbyBridge,
  view: LobbyView,
  handlers: CasinoShellHandlers,
  progress: LobbyProgress | null = null
): { root: HTMLElement; main: HTMLElement } {
  const root = el('div', 'gl-root cx-root')
  if (view === 'home') root.classList.add('is-landing')
  root.appendChild(el('div', 'cx-backdrop'))
  root.appendChild(coinRain())

  const title = bridge.appTitle || APP_TITLE

  // ---------------------------------------------------------------- the sidebar
  const side = el('aside', 'cx-side')
  // The arrow at the top of the sidebar closes it to a strip of icons and opens it again.
  const sideToggle = el('button', 'cx-side__toggle') as HTMLButtonElement
  sideToggle.type = 'button'
  sideToggle.innerHTML = ICON.chevronLeft
  side.appendChild(sideToggle)
  const brand = el('div', 'cx-side__brand')
  brand.append(wordmark(title), el('span', 'cx-side__tag', 'SKILL · PLAY · EARN'))
  side.appendChild(brand)

  const nav = el('nav', 'cx-nav')
  nav.setAttribute('aria-label', 'Lobby')
  const current = activeDestination(view)
  for (const item of NAV) {
    const btn = el('button', `cx-nav__item${item.id === current ? ' is-active' : ''}`) as HTMLButtonElement
    btn.type = 'button'
    if (item.id === current) btn.setAttribute('aria-current', 'page')
    const icon = el('span', 'cx-nav__icon')
    icon.innerHTML = item.icon
    btn.append(icon, el('span', 'cx-nav__label', item.label))
    btn.onclick = () => handlers.go(item.id)
    nav.appendChild(btn)
  }
  side.appendChild(nav)

  const promo = el('button', 'cx-promo') as HTMLButtonElement
  promo.type = 'button'
  const promoTitle = el('span', 'cx-promo__title')
  promoTitle.append(el('span', undefined, 'REAL SKILL'), el('span', undefined, 'REAL PLAYERS'), el('span', 'is-gold', 'REAL REWARDS'))
  const promoCta = el('span', 'cx-promo__cta')
  promoCta.append(document.createTextNode('Join Now '))
  const promoArrow = el('span')
  promoArrow.innerHTML = ICONS.arrow
  promoCta.appendChild(promoArrow)
  promo.append(promoTitle, el('span', 'cx-promo__sub', 'Compete. Win. Grow.'), promoCta)
  promo.onclick = () => handlers.go('play')
  side.appendChild(promo)

  const trust = el('div', 'cx-trust')
  for (const [icon, head, sub] of [
    [ICON.shield, 'Secure & Fair Play', 'Every shot decided on the server'],
    [ICON.coin, 'USDT Payments', 'Fast & easy'],
    [ICON.globe, 'Global Community', 'Play with players worldwide']
  ] as const) {
    const row = el('div', 'cx-trust__row')
    const i = el('span', 'cx-trust__icon')
    i.innerHTML = icon
    const text = el('span', 'cx-trust__text')
    text.append(el('strong', undefined, head), el('span', undefined, sub))
    row.append(i, text)
    trust.appendChild(row)
  }
  side.appendChild(trust)

  // A sound switch in the drawer, for the phone, whose top bar has no room for one.
  const muted = bridge.getSoundMuted()
  const sideSound = el('button', 'cx-side__sound') as HTMLButtonElement
  sideSound.type = 'button'
  const sideSoundIcon = el('span', 'cx-nav__icon')
  sideSoundIcon.innerHTML = muted ? ICONS.speakerOff : ICONS.speaker
  sideSound.append(sideSoundIcon, el('span', 'cx-nav__label', muted ? 'Sound off' : 'Sound on'))
  sideSound.onclick = handlers.onSoundToggle
  side.appendChild(sideSound)

  // ---------------------------------------------------------------- the top bar
  const top = el('header', 'cx-top')
  // The phone's half of the bar: the drawer's button and the brand. Hidden on a desktop,
  // where the sidebar is always open and carries the brand itself.
  const menu = el('button', 'cx-top__menu') as HTMLButtonElement
  menu.type = 'button'
  menu.setAttribute('aria-label', 'Open menu')
  menu.setAttribute('aria-expanded', 'false')
  menu.innerHTML = ICON.menu
  const topBrand = el('div', 'cx-top__brand')
  topBrand.appendChild(wordmark(title))
  const tools = el('div', 'cx-top__tools')
  const iconBtn = (svgMarkup: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'cx-icon-btn') as HTMLButtonElement
    b.type = 'button'
    b.title = label
    b.setAttribute('aria-label', label)
    b.innerHTML = svgMarkup
    b.onclick = onClick
    return b
  }
  tools.append(
    iconBtn(muted ? ICONS.speakerOff : ICONS.speaker, muted ? 'Unmute table sounds' : 'Mute table sounds', handlers.onSoundToggle),
    iconBtn(document.fullscreenElement ? ICONS.fullscreenExit : ICONS.fullscreen, 'Fullscreen', handlers.onFullscreen)
  )

  const profile = el('button', 'cx-profile') as HTMLButtonElement
  profile.type = 'button'
  profile.setAttribute('aria-label', `Profile ${bridge.username}`)
  const avatar = el('span', 'cx-profile__avatar')
  avatar.appendChild(bridge.createAvatar(bridge.username))
  const who = el('span', 'cx-profile__meta')
  // On a phone the balance sits under the name, in place of the separate wallet pill.
  const balanceLine = el('span', 'cx-profile__balance')
  fillBalance(balanceLine, bridge.formatCash(bridge.walletBalance))
  const levelChip = el('span', 'cx-profile__level')
  fillLevelChip(levelChip, progress)
  who.append(el('span', 'cx-profile__name', bridge.username), levelChip, balanceLine)
  profile.append(avatar, who)
  profile.onclick = handlers.onProfile

  const wallet = el('div', 'cx-wallet')
  const coin = el('span', 'cx-wallet__coin', '₮')
  coin.setAttribute('aria-hidden', 'true')
  const amount = el('span', 'cx-wallet__amount')
  const walletValue = el('span', 'cx-wallet__value')
  fillBalance(walletValue, bridge.formatCash(bridge.walletBalance))
  amount.append(el('span', 'cx-wallet__label', 'Balance'), walletValue)
  const add = el('button', 'cx-wallet__add') as HTMLButtonElement
  add.type = 'button'
  add.title = 'Deposit'
  add.setAttribute('aria-label', 'Deposit USDT')
  add.innerHTML = ICON.plus
  add.onclick = () => handlers.go('wallet')
  wallet.append(coin, amount, add)

  const bell = el('button', 'cx-icon-btn cx-top__bell') as HTMLButtonElement
  bell.type = 'button'
  bell.title = 'Challenges and friends'
  bell.setAttribute('aria-label', 'Challenges and friends')
  bell.innerHTML = ICON.bell
  bell.onclick = () => handlers.go('friends')

  top.append(menu, topBrand, tools, bell, profile, wallet)

  // ---------------------------------------------------------------- the page
  const main = el('main', 'cx-main')
  main.id = 'gl-main'
  const page = el('div', 'cx-page')
  page.append(top, main, footer(title))

  const frame = el('div', 'cx-frame')
  // The drawer's dim backdrop on a phone: a tap on it closes the drawer.
  const scrim = el('div', 'cx-scrim')
  frame.append(side, scrim, page)
  root.appendChild(frame)

  const setCollapsed = (collapsed: boolean): void => {
    root.classList.toggle('is-side-collapsed', collapsed)
    sideToggle.setAttribute('aria-expanded', String(!collapsed))
    sideToggle.setAttribute('aria-label', collapsed ? 'Open the menu' : 'Close the menu')
    sideToggle.title = collapsed ? 'Open the menu' : 'Close the menu'
  }
  setCollapsed(sideStartsCollapsed(view))
  sideToggle.onclick = () => {
    const collapsed = !root.classList.contains('is-side-collapsed')
    setCollapsed(collapsed)
    rememberSideCollapsed(collapsed)
  }

  const setDrawer = (open: boolean): void => {
    root.classList.toggle('is-drawer-open', open)
    menu.setAttribute('aria-expanded', String(open))
  }
  menu.onclick = () => setDrawer(!root.classList.contains('is-drawer-open'))
  scrim.onclick = () => setDrawer(false)

  // ---------------------------------------------------------------- the phone's tab bar
  const tabbar = el('nav', 'cx-tabbar')
  tabbar.setAttribute('aria-label', 'Main')
  const tabs: Array<{ id: CasinoDestination | 'profile'; label: string; icon: string }> = [
    { id: 'home', label: 'Home', icon: ICON.home },
    { id: 'play', label: 'Play Now', icon: ICON.play },
    { id: 'tournaments', label: 'Tournaments', icon: ICONS.trophy },
    { id: 'wallet', label: 'Wallet', icon: ICONS.deposit },
    { id: 'profile', label: 'Profile', icon: ICON.user }
  ]
  for (const tab of tabs) {
    const active = tab.id === 'profile' ? current === 'settings' : tab.id === current
    const btn = el('button', `cx-tabbar__item${active ? ' is-active' : ''}`) as HTMLButtonElement
    btn.type = 'button'
    if (active) btn.setAttribute('aria-current', 'page')
    const icon = el('span', 'cx-tabbar__icon')
    icon.innerHTML = tab.icon
    btn.append(icon, el('span', 'cx-tabbar__label', tab.label))
    btn.onclick = tab.id === 'profile' ? handlers.onProfile : () => handlers.go(tab.id as CasinoDestination)
    tabbar.appendChild(btn)
  }
  root.appendChild(tabbar)
  return { root, main }
}

function footer(title: string): HTMLElement {
  const foot = el('footer', 'cx-footer')
  // The phone's closing strip: the promise of the hall in one line. The desktop keeps its
  // links row instead (casino.css hides one or the other).
  const promo = el('div', 'cx-footer__promo')
  const lead = el('span', 'cx-footer__lead')
  lead.append(el('span', undefined, 'More Games'), el('strong', undefined, 'Bigger Rewards'))
  promo.appendChild(lead)
  for (const [icon, head, sub] of [
    [ICONS.trophy, 'Compete', 'in Tournaments'],
    [ICON.coin, 'Earn', 'USDT Rewards'],
    [ICON.leaderboard, 'Climb', 'Leaderboards']
  ] as const) {
    const item = el('span', 'cx-footer__perk')
    const i = el('span', 'cx-footer__perk-icon')
    i.innerHTML = icon
    const text = el('span', 'cx-footer__perk-text')
    text.append(el('strong', undefined, head), el('span', undefined, sub))
    item.append(i, text)
    promo.appendChild(item)
  }
  const pays = el('span', 'cx-footer__pays')
  pays.append(el('span', undefined, 'Skill'), el('strong', undefined, 'Pays!'))
  promo.appendChild(pays)
  foot.appendChild(promo)
  foot.appendChild(wordmark(title))
  const links = el('nav', 'cx-footer__links')
  for (const label of ['About', 'Terms', 'Privacy', 'Contact']) links.appendChild(el('span', 'cx-footer__link', label))
  const social = el('div', 'cx-footer__social')
  for (const icon of [ICON.x, ICON.discord, ICON.telegram, ICON.youtube]) {
    const s = el('span', 'cx-footer__icon')
    s.innerHTML = icon
    social.appendChild(s)
  }
  foot.append(links, social)
  return foot
}

/** Four tournaments to show the shape of the page. Not live: the real list is behind the Tournaments screen. */
const FEATURED = [
  { name: 'Daily Blitz', badge: 'Live', tone: 'red', entry: 10, prize: 100, starts: 'Starts in 2h 15m' },
  { name: 'Weekend Cup', badge: 'Popular', tone: 'blue', entry: 25, prize: 250, starts: 'Starts in 1d 6h' },
  { name: 'Pro League', badge: 'High Stakes', tone: 'gold', entry: 50, prize: 500, starts: 'Starts in 3d 2h' },
  { name: 'Champions Series', badge: 'Elite', tone: 'purple', entry: 100, prize: 1000, starts: 'Starts in 5d 4h' }
] as const

/** The home page of the desktop lobby. */
export function renderCasinoHome(bridge: LobbyBridge, actions: CasinoHomeActions): HTMLElement {
  const screen = el('div', 'gl-screen cx-home')
  screen.dataset.view = 'home'
  const title = bridge.appTitle || APP_TITLE

  const grid = el('div', 'cx-home__grid')
  const col = el('div', 'cx-home__col')

  // ---------------------------------------------------------------- the hero
  const hero = el('section', 'cx-hero')
  const img = document.createElement('img')
  img.className = 'cx-hero__img'
  img.src = '/lobby/hero.webp'
  img.alt = ''
  img.decoding = 'async'
  const body = el('div', 'cx-hero__body')
  const ribbon = el('span', 'cx-hero__ribbon')
  ribbon.append(el('span', undefined, "IT'S NOT JUST A GAME…"), el('strong', undefined, "IT'S A SKILL!"))
  const tagline = el('p', 'cx-hero__tagline', 'Play · Compete · Earn')
  const cta = el('button', 'cx-btn cx-btn--play cx-hero__cta') as HTMLButtonElement
  cta.type = 'button'
  const ctaIcon = el('span', 'cx-btn__icon')
  ctaIcon.innerHTML = ICON.play
  cta.append(ctaIcon, document.createTextNode('PLAY NOW'))
  cta.onclick = actions.playNow
  body.append(ribbon, wordmark(title, true), tagline, cta)
  const heroSide = el('div', 'cx-hero__side')
  heroSide.setAttribute('aria-hidden', 'true')
  heroSide.append(el('span', undefined, 'Real'), el('span', undefined, 'Players'), el('span', undefined, 'Real'), el('strong', undefined, 'Rewards'))
  hero.append(img, el('div', 'cx-hero__shade'), body, heroSide)
  col.appendChild(hero)

  // ---------------------------------------------------------------- the strip of promises
  const strip = el('div', 'cx-strip')
  for (const [icon, head, sub] of [
    [ICON.bolt, 'Instant Play', 'One tap to the table'],
    [ICON.shield, 'Fair Play', 'Server-checked shots'],
    [ICON.globe, 'Global Players', 'Worldwide community'],
    [ICONS.trophy, 'Real Rewards', 'Play & earn USDT']
  ] as const) {
    const item = el('div', 'cx-strip__item')
    const i = el('span', 'cx-strip__icon')
    i.innerHTML = icon
    const text = el('span', 'cx-strip__text')
    text.append(el('strong', undefined, head), el('span', undefined, sub))
    item.append(i, text)
    strip.appendChild(item)
  }
  col.appendChild(strip)

  // ---------------------------------------------------------------- the four ways to play
  const modes = el('div', 'cx-modes')
  const mode = (opts: {
    tone: string
    title: string
    text: string
    image: string
    /** Which part of the picture the card's strip shows: the subject, not the middle. */
    focus: string
    button: string
    onClick: () => void
  }): HTMLElement => {
    const card = el('article', `cx-mode cx-mode--${opts.tone}`)
    const pic = el('div', 'cx-mode__pic')
    pic.style.backgroundImage = `url("${opts.image}")`
    pic.style.backgroundPosition = opts.focus
    const info = el('div', 'cx-mode__info')
    info.append(el('h3', 'cx-mode__title', opts.title), el('p', 'cx-mode__text', opts.text))
    const btn = el('button', 'cx-btn cx-mode__btn') as HTMLButtonElement
    btn.type = 'button'
    btn.append(document.createTextNode(`${opts.button} `))
    const arrow = el('span')
    arrow.innerHTML = ICONS.arrow
    btn.appendChild(arrow)
    btn.onclick = opts.onClick
    info.appendChild(btn)
    card.append(pic, info)
    return card
  }
  modes.append(
    mode({ tone: 'green', title: 'Quick Play', text: 'Jump in and play with players worldwide.', image: '/lobby/quick-play.webp', focus: '62% 58%', button: 'Play Now', onClick: actions.quickPlay }),
    mode({ tone: 'purple', title: 'Tournaments', text: 'Compete in tournaments and win big.', image: '/lobby/tournaments.webp', focus: '78% 38%', button: 'Join Now', onClick: actions.tournaments }),
    mode({ tone: 'blue', title: 'Create Room', text: 'Host your own game and invite friends.', image: '/lobby/create-room.webp', focus: '45% 62%', button: 'Create', onClick: actions.createRoom }),
    mode({ tone: 'gold', title: 'Practice Mode', text: 'Improve your skills against the computer.', image: '/lobby/practice.webp', focus: '60% 70%', button: 'Practice', onClick: actions.practice })
  )
  col.appendChild(modes)

  const master = el('section', 'cx-master')
  const masterCopy = el('div', 'cx-master__copy')
  masterCopy.append(
    el('span', 'cx-master__kicker', 'MASTER MATCH'),
    el('h3', 'cx-master__title', 'High-stake tables'),
    el('p', 'cx-master__text', '500, 1000, 2000, 3000 or 5000 USDT. Same table, same virtual ledger. Crypto stays off.')
  )
  const masterBtn = el('button', 'cx-btn cx-btn--gold cx-master__cta') as HTMLButtonElement
  masterBtn.type = 'button'
  masterBtn.textContent = 'Enter Master Match'
  masterBtn.onclick = actions.masterMatch
  master.append(masterCopy, masterBtn)
  col.appendChild(master)

  // ---------------------------------------------------------------- featured tournaments
  const featured = el('section', 'cx-panel cx-featured')
  const fhead = el('div', 'cx-panel__head')
  const ftitle = el('h3', 'cx-panel__title')
  const ficon = el('span', 'cx-panel__icon')
  ficon.innerHTML = ICONS.trophy
  ftitle.append(ficon, document.createTextNode('Featured Tournaments'))
  const viewAll = el('button', 'cx-link') as HTMLButtonElement
  viewAll.type = 'button'
  viewAll.textContent = 'View All'
  viewAll.onclick = actions.tournaments
  fhead.append(ftitle, viewAll)
  featured.appendChild(fhead)
  const row = el('div', 'cx-featured__row')
  for (const t of FEATURED) {
    const card = el('article', `cx-tour cx-tour--${t.tone}`)
    const badge = el('span', 'cx-tour__badge', t.badge)
    const emblem = el('span', 'cx-tour__emblem')
    emblem.innerHTML = ICONS.trophy
    const facts = el('div', 'cx-tour__facts')
    facts.append(
      el('span', 'cx-tour__name', t.name),
      el('span', 'cx-tour__line', `Entry ${t.entry} USDT`),
      el('span', 'cx-tour__prize', `Prize ${t.prize} USDT`),
      el('span', 'cx-tour__time', t.starts)
    )
    const join = el('button', 'cx-btn cx-btn--play cx-tour__join', 'Join') as HTMLButtonElement
    join.type = 'button'
    join.onclick = actions.tournaments
    card.append(badge, emblem, facts, join)
    row.appendChild(card)
  }
  featured.appendChild(row)
  col.appendChild(featured)
  grid.appendChild(col)

  // ---------------------------------------------------------------- recent matches
  const aside = el('aside', 'cx-home__aside')
  const recent = el('section', 'cx-panel cx-recent')
  const rhead = el('div', 'cx-panel__head')
  const rtitle = el('h3', 'cx-panel__title')
  rtitle.append(el('span', 'cx-dot'), document.createTextNode('Recent Matches'))
  const recentAll = el('button', 'cx-link') as HTMLButtonElement
  recentAll.type = 'button'
  recentAll.textContent = 'View All'
  recentAll.onclick = actions.history.length ? actions.openGames : actions.playNow
  rhead.append(rtitle, recentAll)
  recent.appendChild(rhead)
  const list = el('div', 'cx-recent__list')
  const done = actions.history.filter((m) => m.finishedAt).slice(0, 7)
  if (!done.length) {
    list.appendChild(el('p', 'cx-recent__empty', 'No matches yet. Your results will show here.'))
  }
  for (const match of done) {
    const item = el('div', 'cx-recent__item')
    const names = match.players.map((p) => p.user.username)
    const avatar = el('span', 'cx-recent__avatar')
    avatar.appendChild(bridge.createAvatar(names.find((n) => n !== bridge.username) ?? names[0] ?? '?'))
    const text = el('span', 'cx-recent__text')
    text.append(
      el('strong', undefined, names.length >= 2 ? `${names[0]} vs ${names[1]}` : (names[0] ?? 'Practice')),
      el('span', undefined, match.format)
    )
    const won = match.winnerId === actions.userId
    const result = el('span', `cx-result ${won ? 'is-won' : 'is-lost'}`, won ? 'Won' : 'Lost')
    item.append(avatar, text, result)
    list.appendChild(item)
  }
  recent.appendChild(list)
  aside.appendChild(recent)

  const card = el('section', 'cx-panel cx-practice-card')
  card.append(el('h3', 'cx-panel__title', 'Warm up first?'), el('p', 'cx-recent__empty', 'A game against the computer costs nothing and sharpens your tactics.'))
  const warm = el('button', 'cx-btn cx-btn--gold', 'Practice vs AI') as HTMLButtonElement
  warm.type = 'button'
  warm.onclick = actions.practice
  card.appendChild(warm)
  aside.appendChild(card)

  // Shown on a phone in the place of the warm-up card, which the mode cards already cover.
  const anywhere = el('section', 'cx-panel cx-anywhere')
  const anyIcon = el('span', 'cx-anywhere__icon')
  anyIcon.innerHTML = ICON.phone
  const anyText = el('div', 'cx-anywhere__text')
  const anyTitle = el('h3', 'cx-panel__title cx-anywhere__title')
  anyTitle.append(el('span', 'is-gold', 'Play'), el('span', undefined, 'Anytime'), el('span', undefined, 'Anywhere'))
  anyText.append(anyTitle, el('p', 'cx-recent__empty', 'Phone, tablet or web. Your wallet and your record go with you.'))
  const anyBtn = el('button', 'cx-btn cx-btn--play', 'Play Now') as HTMLButtonElement
  anyBtn.type = 'button'
  anyBtn.onclick = actions.playNow
  anywhere.append(anyIcon, anyText, anyBtn)
  aside.appendChild(anywhere)

  grid.appendChild(aside)
  screen.appendChild(grid)
  return screen
}
