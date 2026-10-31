import { RANKS, type BadgeDef, type RankDef } from '@snooker/shared'
import './progress.css'
import { el } from './dom.js'
import type { LobbyProgress } from './types.js'

/**
 * Levels, ranks and badges in the lobby: the rank emblem, the chip under the
 * player's name, and the progress panel on My Games. Presentation only; the
 * numbers come from GET /api/progress/me.
 */

/** A shield in the rank's colour with one chevron per step up the ladder (Bronze none). */
export function rankEmblem(rank: RankDef, size = 48): HTMLElement {
  const tier = Math.max(0, RANKS.findIndex((r) => r.id === rank.id))
  const chevrons: string[] = []
  const shown = Math.min(tier, 3)
  for (let i = 0; i < shown; i++) {
    const y = 15 + i * 5
    chevrons.push(`<path d="M8 ${y}l4 3 4-3" stroke="#0b1020" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  // The three highest ranks wear a star above the chevrons.
  const star = tier >= 4 ? '<path d="M12 5.2l1.2 2.5 2.7.3-2 1.9.6 2.7L12 11.2l-2.5 1.4.6-2.7-2-1.9 2.7-.3z" fill="#0b1020"/>' : ''
  const node = el('span', 'pg-emblem')
  node.style.setProperty('--rank', rank.color)
  node.innerHTML =
    `<svg viewBox="0 0 24 30" width="${size}" height="${Math.round(size * 1.25)}" aria-hidden="true">` +
    `<path d="M12 1.5 21.5 5v9.5c0 6.5-4.3 11.6-9.5 14-5.2-2.4-9.5-7.5-9.5-14V5z" fill="${rank.color}" stroke="rgba(255,255,255,.55)" stroke-width="1"/>` +
    `<path d="M12 4 19 6.7v7.8c0 5-3.1 9-7 11-3.9-2-7-6-7-11V6.7z" fill="rgba(255,255,255,.18)"/>` +
    star +
    chevrons.join('') +
    `</svg>`
  node.setAttribute('role', 'img')
  node.setAttribute('aria-label', `${rank.name} rank`)
  return node
}

/** "Lv 7 · Silver" under the player's name in the top bar. */
export function fillLevelChip(node: HTMLElement, progress: Pick<LobbyProgress, 'level' | 'rank'> | null): void {
  if (!progress) {
    node.textContent = 'Player'
    node.style.removeProperty('color')
    return
  }
  node.textContent = `Lv ${progress.level} · ${progress.rank.name}`
  node.style.color = progress.rank.color
  node.title = `Level ${progress.level} — ${progress.rank.name} rank`
}

export function xpBar(percent: number): HTMLElement {
  const bar = el('div', 'pg-bar')
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuemin', '0')
  bar.setAttribute('aria-valuemax', '100')
  bar.setAttribute('aria-valuenow', String(percent))
  const fill = el('span', 'pg-bar__fill')
  fill.style.width = `${Math.max(0, Math.min(100, percent))}%`
  bar.appendChild(fill)
  return bar
}

const BADGE_ICONS: Record<string, string> = {
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  medal: '<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 3.5 12 9l3.5-5.5"/><path d="M12 12v5"/>',
  pawn: '<circle cx="12" cy="7" r="2.8"/><path d="M9.5 10.5h5l-1 5h-3z"/><path d="M7 20h10l-1.5-4.5h-7z"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.8 1.8 1.6 2.4 3.4 2.4 4.9 1-1 1.6-2.4 1.6-4 2.6 2 5.4 4.8 5.4 8 0 3.5-2.6 6.1-6.5 6.1z"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="9.5" cy="13" r="1.2"/><circle cx="14.5" cy="13" r="1.2"/>',
  level: '<path d="M5 19 12 5l7 14"/><path d="M8.5 13h7"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7"/>'
}

function badgeTile(badge: BadgeDef & { earnedAt: string | null }): HTMLElement {
  const earned = badge.earnedAt !== null
  const tile = el('div', `pg-badge pg-badge--${badge.rarity.toLowerCase()}${earned ? ' is-earned' : ''}`)
  const icon = el('span', 'pg-badge__icon')
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BADGE_ICONS[badge.icon] ?? BADGE_ICONS.star}</svg>`
  const text = el('span', 'pg-badge__text')
  text.append(el('strong', undefined, badge.name), el('span', undefined, badge.description))
  tile.append(icon, text)
  tile.title = earned ? `${badge.name} — earned ${new Date(badge.earnedAt!).toLocaleDateString()}` : `${badge.name} — locked`
  tile.setAttribute('aria-label', `${badge.name}: ${badge.description} ${earned ? '(earned)' : '(locked)'}`)
  return tile
}

/** The rank, level, XP bar, streak and badge collection. */
export function renderProgressPanel(progress: LobbyProgress | null): HTMLElement {
  const panel = el('section', 'gl-panel pg-panel')
  if (!progress) {
    panel.appendChild(el('p', 'pg-empty', 'Your level and badges will show here once you are signed in.'))
    return panel
  }

  const head = el('div', 'pg-head')
  head.appendChild(rankEmblem(progress.rank, 56))
  const who = el('div', 'pg-head__text')
  const rankName = el('span', 'pg-rank', progress.rank.name)
  rankName.style.color = progress.rank.color
  who.append(rankName, el('span', 'pg-level', `Level ${progress.level}`))
  head.appendChild(who)
  const streak = el('div', 'pg-streak')
  streak.append(el('strong', undefined, String(progress.winStreak)), el('span', undefined, 'win streak'))
  streak.title = `Best streak: ${progress.bestWinStreak}`
  head.appendChild(streak)
  panel.appendChild(head)

  panel.appendChild(xpBar(progress.percent))
  const capped = progress.levelXpNeeded === 0
  const next = progress.nextRank
  const caption = el('div', 'pg-caption')
  caption.append(
    el('span', undefined, capped ? `${progress.totalXp} XP · max level` : `${progress.levelXp} / ${progress.levelXpNeeded} XP to level ${progress.level + 1}`),
    el('span', undefined, next ? `${next.name} at level ${next.minLevel}` : 'Top rank reached')
  )
  panel.appendChild(caption)

  const earned = progress.badges.filter((b) => b.earnedAt).length
  panel.appendChild(el('h3', 'pg-badges-title', `Badges ${earned}/${progress.badges.length}`))
  const grid = el('div', 'pg-badges gl-scroll')
  // Earned first, newest first; then the locked ones in catalogue order.
  const sorted = [...progress.badges].sort((a, b) => {
    if (a.earnedAt && b.earnedAt) return b.earnedAt.localeCompare(a.earnedAt)
    if (a.earnedAt) return -1
    if (b.earnedAt) return 1
    return 0
  })
  for (const badge of sorted) grid.appendChild(badgeTile(badge))
  panel.appendChild(grid)
  return panel
}
