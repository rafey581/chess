/**
 * Player progression: XP, levels, ranks and badges.
 *
 * Pure and deterministic so the server (which awards XP inside the settlement
 * transaction) and the client (which draws the rank emblem and the XP bar) agree
 * on every number. The server stores only the player's *total* XP; the level is
 * derived from it here, and also stored on the account so leaderboards can sort
 * without recomputing.
 */

/** XP for a finished staked/friendly online match. */
export const XP_ONLINE_WIN = 50
export const XP_ONLINE_LOSS = 20
/** Practice against the robot pays less, so grinding the AI is not the fast road up. */
export const XP_PRACTICE_WIN = 15
export const XP_PRACTICE_LOSS = 5
/** Extra XP on top of the final win for taking a tournament. */
export const XP_TOURNAMENT_CHAMPION = 150

export const MAX_LEVEL = 100

/** XP needed to go from `level` to `level + 1`: 100, 125, 150, ... */
export function xpToNextLevel(level: number): number {
  return 100 + 25 * (Math.max(1, Math.floor(level)) - 1)
}

/** Total XP at which `level` is reached (level 1 starts at 0). */
export function totalXpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)))
  const steps = l - 1
  return 100 * steps + (25 * steps * (steps - 1)) / 2
}

export function levelForTotalXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp))
  let level = 1
  while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level += 1
  return level
}

export interface MatchXpInput {
  won: boolean
  practice: boolean
  /** The settlement reason; a player who walked away earns nothing for the loss. */
  reason?: string
}

export function xpForMatch(input: MatchXpInput): number {
  if (!input.won && input.reason === 'abandon') return 0
  if (input.practice) return input.won ? XP_PRACTICE_WIN : XP_PRACTICE_LOSS
  return input.won ? XP_ONLINE_WIN : XP_ONLINE_LOSS
}

// ------------------------------------------------------------------ ranks

export const RANK_IDS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'MASTER', 'GRANDMASTER'] as const
export type RankId = (typeof RANK_IDS)[number]

export interface RankDef {
  id: RankId
  name: string
  /** First level of the rank. */
  minLevel: number
  /** Emblem colour (CSS colour). */
  color: string
}

export const RANKS: readonly RankDef[] = [
  { id: 'BRONZE', name: 'Bronze', minLevel: 1, color: '#c07a45' },
  { id: 'SILVER', name: 'Silver', minLevel: 5, color: '#b9c3cc' },
  { id: 'GOLD', name: 'Gold', minLevel: 10, color: '#f2c14e' },
  { id: 'PLATINUM', name: 'Platinum', minLevel: 15, color: '#5fd3c6' },
  { id: 'DIAMOND', name: 'Diamond', minLevel: 20, color: '#6cb6ff' },
  { id: 'MASTER', name: 'Master', minLevel: 30, color: '#b07cff' },
  { id: 'GRANDMASTER', name: 'Grandmaster', minLevel: 40, color: '#ff5d73' }
]

export function rankForLevel(level: number): RankDef {
  let rank = RANKS[0]!
  for (const r of RANKS) if (level >= r.minLevel) rank = r
  return rank
}

/** The rank after `rank`, or null at the top. */
export function nextRank(rank: RankDef): RankDef | null {
  const i = RANKS.findIndex((r) => r.id === rank.id)
  return RANKS[i + 1] ?? null
}

export interface ProgressSummary {
  level: number
  totalXp: number
  /** XP earned inside the current level. */
  levelXp: number
  /** XP the current level needs in all (0 at the level cap). */
  levelXpNeeded: number
  /** 0..100 through the current level. */
  percent: number
  rank: RankDef
  nextRank: RankDef | null
}

export function summarizeProgress(totalXp: number): ProgressSummary {
  const level = levelForTotalXp(totalXp)
  const start = totalXpForLevel(level)
  const capped = level >= MAX_LEVEL
  const levelXpNeeded = capped ? 0 : xpToNextLevel(level)
  const levelXp = Math.max(0, Math.floor(totalXp) - start)
  const rank = rankForLevel(level)
  return {
    level,
    totalXp: Math.max(0, Math.floor(totalXp)),
    levelXp: capped ? levelXp : Math.min(levelXp, levelXpNeeded),
    levelXpNeeded,
    percent: capped ? 100 : Math.min(100, Math.floor((levelXp / levelXpNeeded) * 100)),
    rank,
    nextRank: nextRank(rank)
  }
}

// ------------------------------------------------------------------ badges

export type BadgeRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export interface BadgeDef {
  code: string
  name: string
  description: string
  /** Icon key the client maps to a picture. */
  icon: string
  rarity: BadgeRarity
}

/** What the badge checks look at, taken after the match that was just settled. */
export interface BadgeStats {
  onlineWins: number
  onlineMatches: number
  /** Consecutive online wins, including the match just played. */
  winStreak: number
  level: number
  tournamentTitles: number
  /** The robot level just beaten in practice, if the match was a practice win. */
  beatAiLevel?: string
}

interface BadgeRule extends BadgeDef {
  earned: (s: BadgeStats) => boolean
}

const BADGE_RULES: readonly BadgeRule[] = [
  { code: 'FIRST_WIN', name: 'First Victory', description: 'Win your first online match.', icon: 'star', rarity: 'COMMON', earned: (s) => s.onlineWins >= 1 },
  { code: 'WINS_10', name: 'Contender', description: 'Win 10 online matches.', icon: 'medal', rarity: 'COMMON', earned: (s) => s.onlineWins >= 10 },
  { code: 'WINS_50', name: 'Veteran', description: 'Win 50 online matches.', icon: 'medal', rarity: 'RARE', earned: (s) => s.onlineWins >= 50 },
  { code: 'WINS_100', name: 'Centurion', description: 'Win 100 online matches.', icon: 'medal', rarity: 'EPIC', earned: (s) => s.onlineWins >= 100 },
  { code: 'MATCHES_25', name: 'Regular', description: 'Finish 25 online matches.', icon: 'pawn', rarity: 'COMMON', earned: (s) => s.onlineMatches >= 25 },
  { code: 'STREAK_3', name: 'Hat-Trick', description: 'Win 3 online matches in a row.', icon: 'flame', rarity: 'COMMON', earned: (s) => s.winStreak >= 3 },
  { code: 'STREAK_5', name: 'On Fire', description: 'Win 5 online matches in a row.', icon: 'flame', rarity: 'RARE', earned: (s) => s.winStreak >= 5 },
  { code: 'STREAK_10', name: 'Unstoppable', description: 'Win 10 online matches in a row.', icon: 'flame', rarity: 'EPIC', earned: (s) => s.winStreak >= 10 },
  { code: 'AI_HARD', name: 'Machine Breaker', description: 'Beat the HARD robot in practice.', icon: 'robot', rarity: 'RARE', earned: (s) => s.beatAiLevel === 'HARD' },
  { code: 'LEVEL_10', name: 'Rising Star', description: 'Reach level 10.', icon: 'level', rarity: 'RARE', earned: (s) => s.level >= 10 },
  { code: 'LEVEL_25', name: 'Seasoned Pro', description: 'Reach level 25.', icon: 'level', rarity: 'EPIC', earned: (s) => s.level >= 25 },
  { code: 'LEVEL_50', name: 'Living Legend', description: 'Reach level 50.', icon: 'level', rarity: 'LEGENDARY', earned: (s) => s.level >= 50 },
  { code: 'TOURNAMENT_CHAMPION', name: 'Champion', description: 'Win a tournament.', icon: 'trophy', rarity: 'LEGENDARY', earned: (s) => s.tournamentTitles >= 1 }
]

export const BADGES: readonly BadgeDef[] = BADGE_RULES.map(({ earned: _earned, ...def }) => def)

/** Codes of every badge whose condition `stats` meets (earned before or not). */
export function badgesEarned(stats: BadgeStats): string[] {
  return BADGE_RULES.filter((rule) => rule.earned(stats)).map((rule) => rule.code)
}
