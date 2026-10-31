import { CHESS_CLOCK_MS, CHESS_INCREMENT_MS, MATCH_FORMATS, PRACTICE_AI_LEVELS } from '@snooker/shared'

/** The time control, e.g. "5+3": minutes per player plus seconds added per move. */
const TIME_CONTROL = `${CHESS_CLOCK_MS / 60000}+${CHESS_INCREMENT_MS / 1000}`
import type { MatchFormat, PracticeAiLevel } from '@snooker/shared'
import { DIFFICULTIES } from '../lobbyModel.js'
import { SETUP_COPY } from './content.js'
import { accentHeadline, el } from './dom.js'
import { ICONS } from './icons.js'
import type { LobbyBridge, LobbyStakeTier, PlayMode, SetupState, StakeTableChoice } from './types.js'

export interface SetupActions {
  onBack: () => void
  onChange: (next: SetupState) => void
  onStart: () => void
  starting: boolean
}

export function renderSetup(
  bridge: LobbyBridge,
  state: SetupState,
  actions: SetupActions,
  friends: string[] = []
): HTMLElement {
  const screen = el('div', 'gl-screen')
  screen.dataset.view = 'setup'

  const top = el('div', 'gl-setup-top')
  const back = el('button', 'gl-link-back') as HTMLButtonElement
  back.type = 'button'
  const backIcon = el('span')
  backIcon.innerHTML = ICONS.back
  back.append(backIcon, document.createTextNode(SETUP_COPY.back))
  back.onclick = () => actions.onBack()
  const rightHead = el('div', 'gl-setup-top__right')
  rightHead.append(el('div', 'gl-label', SETUP_COPY.eyebrow), accentHeadline(SETUP_COPY.headline, 2))
  top.append(back, rightHead)
  screen.appendChild(top)

  const grid = el('div', 'gl-setup')
  const left = el('div', 'gl-panel gl-setup__left')

  const head = el('div', 'gl-setup-head')
  head.append(el('div', 'gl-label', SETUP_COPY.step), el('div', 'gl-label', bridge.appTitle))
  left.appendChild(head)
  left.appendChild(el('h2', 'gl-setup-title', SETUP_COPY.titleAi))

  const options = el('div', 'gl-options')
  options.append(
    modeCard('ai', SETUP_COPY.vsAiTitle, SETUP_COPY.vsAiDesc, ICONS.robot, state, actions),
    modeCard('online', SETUP_COPY.onlineTitle, SETUP_COPY.onlineDesc, ICONS.online, state, actions)
  )
  left.appendChild(options)

  if (state.mode === 'ai') {
    left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.difficultyLabel))
    const row = el('div', 'gl-chip-row')
    row.setAttribute('role', 'radiogroup')
    row.setAttribute('aria-label', SETUP_COPY.difficultyLabel)
    for (const level of PRACTICE_AI_LEVELS) {
      const spec = DIFFICULTIES.find((d) => d.level === level)
      const chip = el('button', 'gl-chip', spec?.label.toUpperCase() ?? level) as HTMLButtonElement
      chip.type = 'button'
      chip.setAttribute('role', 'radio')
      chip.setAttribute('aria-pressed', String(state.difficulty === level))
      chip.onclick = () => {
        bridge.setPracticeDifficulty(level)
        actions.onChange({ ...state, difficulty: level })
      }
      row.appendChild(chip)
    }
    left.appendChild(row)
  }

  // Practice is always BO1 on the server. Online supports BO1 / BO3 / BO5.
  const formats: MatchFormat[] = state.mode === 'online' ? [...MATCH_FORMATS] : state.mode === 'ai' ? ['BO1'] : []
  if (formats.length) {
    left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.lengthLabel))
    const row = el('div', 'gl-chip-row')
    for (const format of formats) {
      const meta = SETUP_COPY.formats[format]
      const chip = el('button', 'gl-chip') as HTMLButtonElement
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(state.format === format))
      chip.append(document.createTextNode(meta.label), el('span', 'gl-chip__hint', meta.hint))
      chip.onclick = () => actions.onChange({ ...state, format })
      row.appendChild(chip)
    }
    left.appendChild(row)
  }

  if (state.mode === 'online') {
    // Who the table is offered to: everyone online, or one friend.
    left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.opponentLabel))
    const oppRow = el('div', 'gl-chip-row')
    for (const [value, label, hint] of [
      ['anyone', SETUP_COPY.opponentAnyone, SETUP_COPY.opponentAnyoneHint],
      ['friend', SETUP_COPY.opponentFriend, SETUP_COPY.opponentFriendHint]
    ] as const) {
      const chip = el('button', 'gl-chip') as HTMLButtonElement
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(state.opponent === value))
      chip.append(document.createTextNode(label), el('span', 'gl-chip__hint', hint))
      chip.onclick = () => actions.onChange({ ...state, opponent: value })
      oppRow.appendChild(chip)
    }
    left.appendChild(oppRow)

    if (state.opponent === 'friend') {
      left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.friendPickLabel))
      if (friends.length === 0) {
        left.appendChild(el('div', 'gl-deposit-intro', SETUP_COPY.friendEmpty))
      } else {
        const friendRow = el('div', 'gl-chip-row gl-chip-row--friends')
        for (const friend of friends) {
          const chip = el('button', 'gl-chip', friend) as HTMLButtonElement
          chip.type = 'button'
          chip.setAttribute('aria-pressed', String(state.friendUsername === friend))
          chip.onclick = () => actions.onChange({ ...state, friendUsername: friend })
          friendRow.appendChild(chip)
        }
        left.appendChild(friendRow)
      }
    }

    left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.tableLabel))
    const tableRow = el('div', 'gl-chip-row')
    const table = state.table ?? 'open'
    for (const [value, label, hint] of [
      ['open', SETUP_COPY.tableOpen, SETUP_COPY.tableOpenHint],
      ['master', SETUP_COPY.tableMaster, SETUP_COPY.tableMasterHint]
    ] as const) {
      const chip = el('button', 'gl-chip') as HTMLButtonElement
      chip.type = 'button'
      chip.setAttribute('aria-pressed', String(table === value))
      chip.append(document.createTextNode(label), el('span', 'gl-chip__hint', hint))
      chip.onclick = () => {
        const nextTiers = tiersForTable(bridge.getStakeTiers(), value)
        const keep = nextTiers.some((tier) => tier.id === state.stakeTierId)
        actions.onChange({
          ...state,
          table: value,
          stakeTierId: keep ? state.stakeTierId : (nextTiers[0]?.id ?? null)
        })
      }
      tableRow.appendChild(chip)
    }
    left.appendChild(tableRow)

    const tiers = tiersForTable(bridge.getStakeTiers(), table)
    if (tiers.length) {
      left.appendChild(el('div', 'gl-label gl-row-label', SETUP_COPY.stakeLabel))
      const row = el('div', 'gl-chip-row gl-chip-row--stakes')
      const active = tiers.some((tier) => tier.id === state.stakeTierId) ? state.stakeTierId : tiers[0]!.id
      for (const tier of tiers) {
        const chip = el('button', 'gl-chip', `${tier.label}`) as HTMLButtonElement
        chip.type = 'button'
        chip.setAttribute('aria-pressed', String(tier.id === active))
        chip.onclick = () => actions.onChange({ ...state, stakeTierId: tier.id, table })
        row.appendChild(chip)
      }
      left.appendChild(row)
    }
  }

  // The time control leads the facts; it is the same at every stake.
  const facts = el('div', 'gl-facts')
  for (const fact of [`${TIME_CONTROL} clock`, ...SETUP_COPY.facts]) facts.appendChild(el('span', 'gl-fact', fact))
  left.appendChild(facts)

  const right = el('div', 'gl-panel gl-setup__right')
  const img = document.createElement('img')
  img.className = 'gl-setup__right-img'
  img.src = '/lobby-pic-blurred.jpg'
  img.alt = ''
  img.decoding = 'async'
  const body = el('div', 'gl-setup__right-body')
  const brandRow = el('div', 'gl-setup__brand-row')
  brandRow.append(el('div', 'gl-label', SETUP_COPY.panelBrand), el('span', 'gl-badge', SETUP_COPY.panelBadge))
  const copy = el('div', 'gl-setup__copy')
  copy.append(
    el('h3', 'gl-headline gl-setup__right-title', SETUP_COPY.panelTitle),
    el('p', undefined, SETUP_COPY.panelBody)
  )
  const start = el('button', 'gl-btn gl-btn--primary', SETUP_COPY.start) as HTMLButtonElement
  start.type = 'button'
  const needsFriend = state.mode === 'online' && state.opponent === 'friend' && !state.friendUsername
  start.disabled = !state.mode || actions.starting || needsFriend
  start.onclick = () => actions.onStart()
  const summary = el('div', 'gl-setup__summary', buildSummary(state, bridge))
  const foot = el('div', 'gl-setup__foot')
  foot.append(start, summary)
  body.append(brandRow, copy, foot)
  right.append(img, el('div', 'gl-setup__right-shade'), body)

  grid.append(left, right)
  screen.appendChild(grid)
  return screen
}

function modeCard(
  mode: PlayMode,
  title: string,
  desc: string,
  icon: string,
  state: SetupState,
  actions: SetupActions
): HTMLButtonElement {
  const btn = el('button', 'gl-option') as HTMLButtonElement
  btn.type = 'button'
  btn.setAttribute('aria-pressed', String(state.mode === mode))
  const iconEl = el('span', 'gl-option__icon')
  iconEl.innerHTML = icon
  const mark = el('span', 'gl-option__mark')
  mark.innerHTML = ICONS.check
  btn.append(iconEl, el('span', 'gl-option__title', title), el('span', 'gl-option__desc', desc), mark)
  btn.onclick = () => {
    const next: SetupState = {
      ...state,
      mode,
      format: mode === 'ai' ? 'BO1' : state.format
    }
    actions.onChange(next)
  }
  return btn
}

export function tierTableOf(tier: { id: string; table?: string }): 'OPEN' | 'MASTER' {
  if (tier.table === 'MASTER' || tier.id.startsWith('MASTER_')) return 'MASTER'
  return 'OPEN'
}

export function tiersForTable(tiers: LobbyStakeTier[], table: StakeTableChoice): LobbyStakeTier[] {
  const wanted = table === 'master' ? 'MASTER' : 'OPEN'
  return tiers.filter((tier) => tierTableOf(tier) === wanted)
}

function buildSummary(state: SetupState, bridge: LobbyBridge): string {
  if (!state.mode) return 'SELECT A MODE TO BEGIN'
  if (state.mode === 'ai') {
    return `VS AI / ${state.difficulty} / ${SETUP_COPY.formats.BO1.label} / ${TIME_CONTROL}`
  }
  const fmt = SETUP_COPY.formats[state.format]
  const vs = state.opponent === 'friend' ? (state.friendUsername ?? 'A FRIEND') : 'ANYONE'
  const table = state.table === 'master' ? 'MASTER' : 'OPEN'
  const tier = bridge.getStakeTiers().find((item) => item.id === state.stakeTierId)
  return `ONLINE / ${fmt.label} / ${vs} / ${table}${tier ? ` / ${tier.label}` : ''} / ${TIME_CONTROL}`
}

export function defaultSetupState(
  bridge: LobbyBridge,
  preselect: PlayMode | null
): SetupState {
  return {
    mode: preselect,
    difficulty: bridge.practiceDifficulty,
    format: 'BO1',
    stakeTierId: bridge.getDefaultStakeTierId(),
    table: 'open',
    opponent: 'anyone',
    friendUsername: null
  }
}

export type { PracticeAiLevel }
