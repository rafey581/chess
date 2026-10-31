import { STATS_COPY } from './content.js'
import { accentHeadline, el } from './dom.js'
import { brandText } from './shell.js'
import { renderProgressPanel } from './progress.js'
import type { LobbyBridge, LobbyHistoryMatch, LobbyProfileStats, LobbyProgress, StatsMode } from './types.js'

const RECORD_KEYS = [
  ['Completed', 'matches'],
  ['Wins', 'wins'],
  ['Losses', 'losses'],
  ['Win rate', 'winRate']
] as const

export interface StatsActions {
  onBack: () => void
  onMode: (mode: StatsMode) => void
}

export function renderStatistics(
  bridge: LobbyBridge,
  mode: StatsMode,
  profile: LobbyProfileStats | null,
  history: LobbyHistoryMatch[],
  actions: StatsActions,
  progress: LobbyProgress | null = null
): HTMLElement {
  const screen = el('div', 'gl-screen')
  screen.dataset.view = 'statistics'

  const brandRow = el('div', 'gl-setup-head gl-stats-brand')
  const brand = el('div', 'gl-brand')
  const mark = el('span', 'gl-brand__mark')
  mark.innerHTML = bridge.logoSvg
  brand.append(mark, brandText(bridge.appTitle, STATS_COPY.pageName))
  brandRow.appendChild(brand)
  screen.appendChild(brandRow)

  const head = el('div', 'gl-stats-head')
  const left = el('div')
  left.append(el('div', 'gl-label', STATS_COPY.eyebrow), accentHeadline(STATS_COPY.title, 1))
  const wins = profile?.wins ?? 0
  const losses = profile?.losses ?? 0
  const score = el('div', 'gl-scoreline')
  score.append(
    document.createTextNode('YOU '),
    el('span', undefined, String(wins)),
    document.createTextNode(' — '),
    el('span', undefined, String(losses)),
    document.createTextNode(mode === 'ai' ? ' AI' : ' ONLINE')
  )
  head.append(left, score)
  screen.appendChild(head)
  screen.appendChild(renderProgressPanel(progress))

  const sw = el('div', 'gl-switch')
  sw.setAttribute('role', 'tablist')
  for (const [id, label] of [
    ['ai', 'VS AI'],
    ['online', 'ONLINE']
  ] as const) {
    const btn = el('button', 'gl-chip', label) as HTMLButtonElement
    btn.type = 'button'
    btn.setAttribute('aria-pressed', String(mode === id))
    btn.onclick = () => actions.onMode(id)
    sw.appendChild(btn)
  }
  screen.appendChild(sw)

  // Practice matches are excluded from history/leaderboard in the existing app.
  // VS AI tab therefore shows zeros / empty until a dedicated practice stats source exists.
  const showData = mode === 'online' ? profile : { matches: 0, wins: 0, losses: 0, winRate: 0, highestBreak: 0 }
  const showHistory = mode === 'online' ? history : []

  const grid = el('div', 'gl-stats-grid')
  grid.append(
    recordPanel(STATS_COPY.yourPanel, showData),
    recentPanel(showHistory, bridge.userId),
    recordPanel(STATS_COPY.oppPanel, null)
  )
  screen.appendChild(grid)

  const back = el('button', 'gl-btn gl-btn--primary gl-stats-return', STATS_COPY.returnLobby) as HTMLButtonElement
  back.type = 'button'
  back.onclick = () => actions.onBack()
  screen.appendChild(back)
  return screen
}

function recordPanel(title: string, stats: LobbyProfileStats | null): HTMLElement {
  const panel = el('div', 'gl-panel gl-stats-panel')
  panel.appendChild(el('h3', undefined, title))
  const rows = el('div', 'gl-stat-rows gl-scroll')
  for (const [label, key] of RECORD_KEYS) {
    const row = el('div', 'gl-stat-row')
    let value = '—'
    if (stats && key) {
      const raw = stats[key]
      value = key === 'winRate' ? `${raw}%` : String(raw)
    } else if (!stats) {
      value = '—'
    } else if (!key) {
      value = '—'
    }
    row.append(el('span', undefined, label), el('span', undefined, value))
    rows.appendChild(row)
  }
  panel.appendChild(rows)
  return panel
}

function recentPanel(history: LobbyHistoryMatch[], userId: string): HTMLElement {
  const panel = el('div', 'gl-panel gl-stats-panel')
  panel.appendChild(el('h3', undefined, STATS_COPY.recentPanel))
  const box = el('div', 'gl-recent gl-scroll')
  if (!history.length) {
    box.appendChild(el('div', 'gl-empty', STATS_COPY.emptyRecent))
  } else {
    for (const match of history.slice(0, 12)) {
      const item = el('div', 'gl-recent-item')
      const opp = match.players.find((p) => p.userId !== userId)?.user.username ?? '?'
      const won = match.winnerId === userId
      item.append(
        el('span', undefined, `${won ? 'Win' : 'Loss'} · ${opp}`),
        el('span', undefined, match.format)
      )
      box.appendChild(item)
    }
  }
  panel.appendChild(box)
  return panel
}
