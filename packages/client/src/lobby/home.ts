import { HOME_COPY } from './content.js'
import { accentHeadline, el } from './dom.js'
import { ICONS } from './icons.js'
import type { LobbyBridge, PlayMode } from './types.js'

export interface HomeActions {
  openSetup: (mode: PlayMode | null) => void
  openStats: () => void
  openInfo: (section: 'controls' | 'rules') => void
  openTournaments: () => void
  openDeposit: () => void
  openWithdraw: () => void
  openFriends: () => void
  openInvite: () => void
  statsStatusLine: string
}

export function renderHome(bridge: LobbyBridge, actions: HomeActions): HTMLElement {
  void bridge
  const screen = el('div', 'gl-screen')
  screen.dataset.view = 'home'

  const head = el('div', 'gl-home-head')
  head.append(el('div', 'gl-label', HOME_COPY.eyebrow), accentHeadline(HOME_COPY.headline, 2))
  screen.appendChild(head)

  const bento = el('div', 'gl-bento')

  const left = el('div', 'gl-bento__col gl-bento__col--left')
  left.append(
    tile({
      kind: 'tournaments',
      label: 'CHAMPIONSHIP / $ PRIZE POOLS',
      title: 'TOURNAMENTS',
      icon: ICONS.trophy,
      onClick: () => actions.openTournaments()
    }),
    tile({
      kind: 'statistics',
      label: 'RECORD',
      title: 'STATISTICS',
      icon: ICONS.stats,
      status: actions.statsStatusLine,
      onClick: () => actions.openStats()
    }),
    tile({
      kind: 'rules',
      label: 'LEARN',
      title: 'RULES',
      icon: ICONS.rules,
      onClick: () => actions.openInfo('rules')
    }),
    tile({
      kind: 'friends',
      label: 'SOCIAL',
      title: 'FRIENDS',
      icon: ICONS.friends,
      onClick: () => actions.openFriends()
    }),
    tile({
      kind: 'invite',
      label: 'EARN',
      title: 'INVITE',
      icon: ICONS.invite,
      onClick: () => actions.openInvite()
    })
  )

  const hero = el('button', 'gl-hero') as HTMLButtonElement
  hero.type = 'button'
  hero.setAttribute('aria-label', 'Play chess — choose your opponent')
  const heroImg = document.createElement('img')
  heroImg.className = 'gl-hero__img'
  heroImg.src = '/chess-match.jpg'
  heroImg.alt = ''
  heroImg.decoding = 'async'
  const body = el('div', 'gl-hero__body')
  body.appendChild(el('span', 'gl-hero__tag', HOME_COPY.heroTag))
  const foot = el('div', 'gl-hero__foot')
  foot.appendChild(el('h2', 'gl-hero__title', HOME_COPY.heroTitle))
  foot.appendChild(el('p', 'gl-hero__sub', HOME_COPY.heroSubtitle))
  const cta = el('span', 'gl-hero__cta')
  cta.append(document.createTextNode(HOME_COPY.heroCta))
  const arrow = el('span')
  arrow.innerHTML = ICONS.arrow
  cta.appendChild(arrow)
  foot.appendChild(cta)
  body.appendChild(foot)
  hero.append(heroImg, el('div', 'gl-hero__overlay'), el('div', 'gl-hero__cut'), body)
  hero.onclick = () => actions.openSetup(null)

  const right = el('div', 'gl-bento__col gl-bento__col--right')
  right.append(
    tile({
      kind: 'vs-ai',
      label: 'PRACTICE',
      title: 'VS AI',
      icon: ICONS.robot,
      onClick: () => actions.openSetup('ai')
    }),
    tile({
      kind: 'online',
      label: 'MULTIPLAYER',
      title: 'ONLINE',
      icon: ICONS.online,
      onClick: () => actions.openSetup('online')
    }),
    tile({
      kind: 'wallet',
      label: 'WALLET / USDT',
      title: 'DEPOSIT',
      icon: ICONS.deposit,
      onClick: () => actions.openDeposit()
    }),
    tile({
      kind: 'cashout',
      label: 'WALLET / USDT',
      title: 'WITHDRAW',
      icon: ICONS.withdraw,
      onClick: () => actions.openWithdraw()
    })
  )

  bento.append(left, hero, right)
  screen.appendChild(bento)
  return screen
}

function tile(opts: {
  kind: string
  label: string
  title: string
  icon: string
  status?: string
  onClick: () => void
}): HTMLButtonElement {
  const btn = el('button', `gl-tile gl-tile--${opts.kind}`) as HTMLButtonElement
  btn.type = 'button'
  const icon = el('span', 'gl-tile__icon')
  icon.innerHTML = opts.icon
  btn.append(icon, el('span', 'gl-tile__label', opts.label), el('span', 'gl-tile__title', opts.title))
  if (opts.status) btn.appendChild(el('span', 'gl-tile__status', opts.status))
  const arrow = el('span', 'gl-tile__arrow')
  arrow.innerHTML = ICONS.arrow
  btn.appendChild(arrow)
  btn.onclick = opts.onClick
  return btn
}
