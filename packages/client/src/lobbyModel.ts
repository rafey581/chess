import { PRACTICE_AI_LEVELS } from '@snooker/shared'
import type { PracticeAiLevel } from '@snooker/shared'

/**
 * The home screen's shape, as data.
 *
 * The screen itself is drawn in `main.ts`; what lives here is everything about it that is
 * a *decision* rather than a drawing: which cards there are, what each of the five bar
 * icons does, and which difficulties the practice screen offers. Keeping the decisions
 * here means the wiring cannot quietly grow a second meaning — a bar item's destination
 * is read from one record, so "Shop goes nowhere" is a property of the model rather than
 * an omission in a click handler nobody looks at twice.
 *
 * The difficulty list is derived from `PRACTICE_AI_LEVELS`, which is the same tuple the
 * server validates `aiLevel` against, so the selector cannot offer a level the API would
 * reject. The wording next to each level is presentation only.
 */

/** Every screen the home screen can reach. */
export type AppScreen = 'home' | 'practice' | 'multiplayer' | 'tournaments' | 'leaderboard' | 'settings'

/**
 * Where a tap goes.
 *
 * `soon` is a real destination: the entry point is finished and live, and the feature
 * behind it does not exist yet. It is deliberately not `null`, because an absent
 * destination and a not-yet-built one are different things and the UI says so out loud.
 */
export type NavTarget = AppScreen | 'soon'

/**
 * Inline SVG, one style throughout: a 24-unit box, a 1.7 stroke in `currentColor`, round
 * caps and joins, and nothing filled. This is the same hand-drawn-in-SVG approach the
 * header bell and the camera toggle already use, so the bar does not introduce a second
 * icon language. Nothing here is traced from another product's artwork.
 */
function icon(body: string): string {
  return (
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body +
    '</svg>'
  )
}

const ICONS = {
  /** A shopping bag. */
  shop: icon('<path d="M5.6 8h12.8l-1 12.2H6.6L5.6 8Z"/><path d="M9.2 8V6.3a2.8 2.8 0 0 1 5.6 0V8"/>'),
  /** Two people, one behind the other. */
  friends: icon(
    '<circle cx="9.4" cy="8.8" r="3.1"/>' +
      '<path d="M3.8 19.4a5.7 5.7 0 0 1 11.2 0"/>' +
      '<path d="M16.2 6.4a3.1 3.1 0 0 1 0 6"/>' +
      '<path d="M17.6 14.4a5.7 5.7 0 0 1 2.8 4.6"/>'
  ),
  /** Three bars, tallest in the middle. */
  leaderboard: icon('<path d="M4 20.4h16"/><path d="M6.8 18.2V13"/><path d="M12 18.2V6.4"/><path d="M17.2 18.2v-4.6"/>'),
  /** Three sliders — the settings/tune glyph. */
  settings: icon(
    '<path d="M3.8 7.6h6.4"/><path d="M13.6 7.6h6.6"/><circle cx="12.4" cy="7.6" r="2.1"/>' +
      '<path d="M3.8 16.4h3.4"/><path d="M10.6 16.4h9.6"/><circle cx="9.4" cy="16.4" r="2.1"/>'
  ),
  /** An overflow ellipsis. */
  more: icon('<circle cx="5.8" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.2" cy="12" r="1.5"/>')
} as const

/**
 * The three cards' emblems, drawn rather than photographed.
 *
 * One SVG per mode, in a 120-unit box, each with its own gradient ids so nothing collides
 * when all three are on the page at once. They are artwork in the sense that they are
 * pictures - but they are *drawn*, in the same way the bar icons are drawn, rather than
 * loaded: no file to fetch, nothing to letterbox, no second image slot to keep in step, and
 * the halo is a gradient rather than a blur so the card spends one filter on the glass and
 * one on nothing at all.
 */
const EMBLEMS = {
  /** Practice: a sight. Concentric rings, crosshair ticks, one bull. */
  practice:
    '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<linearGradient id="hc-practice-ring" x1="14" y1="10" x2="106" y2="110" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#2f7bff"/><stop offset="1" stop-color="#19c3b2"/></linearGradient>' +
    '<radialGradient id="hc-practice-halo" cx="60" cy="60" r="58" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#2f7bff" stop-opacity=".38"/>' +
    '<stop offset=".55" stop-color="#19c3b2" stop-opacity=".12"/>' +
    '<stop offset="1" stop-color="#19c3b2" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<circle cx="60" cy="60" r="58" fill="url(#hc-practice-halo)"/>' +
    '<circle cx="60" cy="60" r="45" stroke="url(#hc-practice-ring)" stroke-width="2.5" opacity=".55"/>' +
    '<circle cx="60" cy="60" r="32" stroke="url(#hc-practice-ring)" stroke-width="2" opacity=".8"/>' +
    '<circle cx="60" cy="60" r="19" stroke="url(#hc-practice-ring)" stroke-width="3"/>' +
    '<circle cx="60" cy="60" r="5.5" fill="url(#hc-practice-ring)"/>' +
    '<path d="M60 6v13M60 101v13M6 60h13M101 60h13" stroke="url(#hc-practice-ring)" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M24 24l8 8M96 96l-8-8M96 24l-8 8M24 96l8-8" stroke="url(#hc-practice-ring)" stroke-width="2" ' +
    'stroke-linecap="round" opacity=".4"/></svg>',

  /** Multiplayer: a versus. Two cues crossed, a glossy ball in the middle, the letters under it. */
  multiplayer:
    '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<linearGradient id="hc-versus-cue" x1="18" y1="16" x2="102" y2="106" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#ff3b4e"/><stop offset=".5" stop-color="#c01c7a"/><stop offset="1" stop-color="#ff3b4e"/></linearGradient>' +
    '<radialGradient id="hc-versus-ball" cx="42%" cy="32%" r="74%">' +
    '<stop stop-color="#ffffff"/><stop offset=".45" stop-color="#e6ecf4"/><stop offset="1" stop-color="#8b95a4"/></radialGradient>' +
    '<radialGradient id="hc-versus-halo" cx="60" cy="52" r="56" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#ff3b4e" stop-opacity=".34"/>' +
    '<stop offset=".6" stop-color="#c01c7a" stop-opacity=".1"/>' +
    '<stop offset="1" stop-color="#c01c7a" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<circle cx="60" cy="52" r="56" fill="url(#hc-versus-halo)"/>' +
    '<path d="M28 18 92 88" stroke="url(#hc-versus-cue)" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M92 18 28 88" stroke="url(#hc-versus-cue)" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M28 18 92 88" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M92 18 28 88" stroke="#ffffff" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="60" cy="53" r="16" fill="url(#hc-versus-ball)"/>' +
    '<ellipse cx="53.5" cy="46.5" rx="4.5" ry="3.4" fill="#ffffff" opacity=".85"/>' +
    '<text x="60" y="112" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="17" ' +
    'font-weight="800" letter-spacing="2" fill="url(#hc-versus-cue)">VS</text></svg>',

  /** Tournament: the cup, between two laurel arcs, inside the corners of a bracket. */
  tournament:
    '<svg viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<linearGradient id="hc-cup-gold" x1="34" y1="18" x2="88" y2="94" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#ffd98a"/><stop offset=".45" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff6a1a"/></linearGradient>' +
    '<radialGradient id="hc-cup-halo" cx="60" cy="44" r="56" gradientUnits="userSpaceOnUse">' +
    '<stop stop-color="#ffb02e" stop-opacity=".34"/>' +
    '<stop offset=".6" stop-color="#ff6a1a" stop-opacity=".1"/>' +
    '<stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<circle cx="60" cy="44" r="56" fill="url(#hc-cup-halo)"/>' +
    '<path d="M8 20h18M8 20v12M112 20H94M112 20v12M8 100h18M8 100V88M112 100H94M112 100V88" ' +
    'stroke="#ffb02e" stroke-opacity=".38" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M31 34c-9 8-12 22-6 34M89 34c9 8 12 22 6 34" stroke="url(#hc-cup-gold)" stroke-width="2.4" ' +
    'stroke-linecap="round" opacity=".7"/>' +
    '<path d="M27 46l-7-3M27.5 58l-7.5 1M93 46l7-3M92.5 58l7.5 1" stroke="url(#hc-cup-gold)" stroke-width="2" ' +
    'stroke-linecap="round" opacity=".5"/>' +
    '<path d="M42 26h36v14a18 18 0 0 1-36 0V26Z" fill="url(#hc-cup-gold)"/>' +
    '<path d="M42 31h-8a9 9 0 0 0 0 18h1.5M78 31h8a9 9 0 0 1 0 18h-1.5" stroke="url(#hc-cup-gold)" ' +
    'stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M60 58v13" stroke="url(#hc-cup-gold)" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M46 71h28l4 12H42l4-12Z" fill="url(#hc-cup-gold)"/>' +
    '<path d="M36 83h48l3 9H33l3-9Z" fill="url(#hc-cup-gold)"/>' +
    '<ellipse cx="52" cy="36" rx="3.5" ry="5.5" fill="#ffffff" opacity=".38"/></svg>'
} as const

export interface HomeCardSpec {
  id: string
  /** The word on the card, in the order the spec asks for: practice, multiplayer, tournament. */
  label: string
  blurb: string
  target: NavTarget
  /** The category word on the small badge in the top-left corner of the card. */
  badge: string
  /** The card's own drawing: inline SVG, so nothing is fetched and nothing can be missing. */
  emblem: string
  /**
   * Which of `chips` is the card's *state* rather than one of its attributes.
   *
   * "Free play" and "8 players" are claims about right now; "Knockout" is a claim about the
   * format. Printing one of them twice on the same card is the fastest way to make a design
   * look unfinished, so the state chip is the one fact shown on the card face.
   */
  statusIndex: 0 | 1
  /** Two facts about the mode, taken from what the app already knows. Never a price or a prize. */
  chips: readonly string[]
}

export interface HomeBarItem {
  id: string
  label: string
  target: NavTarget
  icon: string
}

/** The three cards, in the order they are drawn. */
export const HOME_CARDS: readonly HomeCardSpec[] = [
  {
    id: 'practice',
    label: 'Practice',
    blurb: 'Warm up against the bot at your level.',
    target: 'practice',
    badge: 'Training',
    emblem: EMBLEMS.practice,
    statusIndex: 1,
    chips: ['Easy / Medium / Hard', 'Free play']
  },
  {
    id: 'multiplayer',
    label: 'Multiplayer',
    blurb: 'Join a table, or open one and wait.',
    target: 'multiplayer',
    badge: 'Online',
    emblem: EMBLEMS.multiplayer,
    statusIndex: 0,
    chips: ['Real players', 'Stake tables']
  },
  {
    id: 'tournament',
    label: 'Tournament',
    blurb: 'Enter the 8-player knockout bracket.',
    target: 'tournaments',
    badge: 'Knockout',
    emblem: EMBLEMS.tournament,
    statusIndex: 0,
    chips: ['8 players', 'Single elim']
  }
]

/**
 * The bottom bar, all five entries.
 *
 * Leaderboard and Settings already have working screens behind them, so they navigate.
 * Shop, Friends and More have no backend at all in this project, so they resolve to
 * `soon` and the UI answers with a toast. Building them anyway is the point: the bar is
 * the finished surface, and the three that wait are finished too — there is simply
 * nothing behind them yet.
 */
export const HOME_BAR: readonly HomeBarItem[] = [
  { id: 'shop', label: 'Shop', target: 'soon', icon: ICONS.shop },
  { id: 'friends', label: 'Friends', target: 'soon', icon: ICONS.friends },
  { id: 'leaderboard', label: 'Leaderboard', target: 'leaderboard', icon: ICONS.leaderboard },
  { id: 'settings', label: 'Settings', target: 'settings', icon: ICONS.settings },
  { id: 'more', label: 'More', target: 'soon', icon: ICONS.more }
]

export interface DifficultySpec {
  level: PracticeAiLevel
  label: string
  blurb: string
}

/**
 * The practice difficulty selector.
 *
 * Derived from the shared tuple rather than written out, so the selector is exactly the
 * set the server's `z.enum(PRACTICE_AI_LEVELS)` accepts. A level invented here would be
 * rejected at the API and the failure would look like a server problem.
 */
export const DIFFICULTIES: readonly DifficultySpec[] = PRACTICE_AI_LEVELS.map((level) => {
  const spec: Record<PracticeAiLevel, { label: string; blurb: string }> = {
    EASY: { label: 'Easy', blurb: 'The robot misses a lot. Good for learning the table.' },
    MEDIUM: { label: 'Medium', blurb: 'A real opponent. Punishes loose pieces.' },
    HARD: { label: 'Hard', blurb: 'It looks three moves ahead. Bring your best game.' }
  }
  return { level, ...spec[level] }
})

/** The level the setup screen opens on: the middle one, which is also the server default. */
export const DEFAULT_DIFFICULTY: PracticeAiLevel = 'MEDIUM'

/**
 * What a tap on a `soon` entry says.
 *
 * One sentence naming the entry, so the toast is about the thing that was tapped rather
 * than a generic "unavailable".
 */
export function comingSoonMessage(label: string): string {
  return `${label} is coming soon.`
}

/** Narrows an untrusted value to a screen this build can actually draw. */
export function isAppScreen(value: unknown): value is AppScreen {
  return value === 'home' || value === 'practice' || value === 'multiplayer' || value === 'tournaments' || value === 'leaderboard' || value === 'settings'
}

/**
 * The screen a bar entry opens.
 *
 * Returns `null` for a `soon` entry, which is how the caller tells "navigate somewhere"
 * apart from "tell the player it is not here yet" without re-deriving the rule.
 */
export function barDestination(id: string): AppScreen | null {
  const item = HOME_BAR.find((entry) => entry.id === id)
  if (!item || item.target === 'soon') return null
  return item.target
}

/** The same question for the three cards, which never come back `soon`. */
export function cardDestination(id: string): AppScreen | null {
  const card = HOME_CARDS.find((entry) => entry.id === id)
  if (!card) return null
  return isAppScreen(card.target) ? card.target : null
}