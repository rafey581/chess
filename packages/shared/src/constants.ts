/**
 * The product's name, in one place.
 *
 * `index.html` cannot import it, so its `<title>` is typed again there. Everything the
 * app renders — sign-in, the hall, the loading line — reads this constant.
 */
export const APP_TITLE = 'Chess Stake'

export const PRACTICE_AI_LEVELS = ['EASY', 'MEDIUM', 'HARD'] as const
export type PracticeAiLevel = (typeof PRACTICE_AI_LEVELS)[number]

export const MATCH_FORMATS = ['BO1', 'BO3', 'BO5'] as const
export type MatchFormat = (typeof MATCH_FORMATS)[number]
/**
 * The game types a player chooses between when starting a match (practice or online):
 * a single game, or best of 3. BO5 is still accepted by the server and can be offered
 * again by adding it here.
 */
export const SELECTABLE_FORMATS = ['BO1', 'BO3'] as const satisfies readonly MatchFormat[]
export type SelectableFormat = (typeof SELECTABLE_FORMATS)[number]

export const TOURNAMENT_SIZE = 8
/** Balance a new account starts with, in USDT (1 USDT = 1 unit). */
export const START_BALANCE_USDT = 1

/**
 * What an inviter earns when someone who signed up with their code plays their
 * first real match. Paid once per invitee, never at signup.
 */
export const REFERRAL_BONUS_USDT = 1

export const PRACTICE_DAILY_FREE_LIMIT = 3

/**
 * Which public table a stake belongs to.
 *
 * `OPEN` is the ordinary challenge (1 through 100 USDT). `MASTER` is the high-stake
 * Master Match (500 through 5000 USDT). Both still go through the same ledger freeze
 * and the same balance check; neither turns on the crypto rails.
 */
export const STAKE_TABLES = ['OPEN', 'MASTER'] as const
export type StakeTable = (typeof STAKE_TABLES)[number]

/**
 * The stake tables. The game plays in USDT at 1:1 — a `1 USDT` table stakes one USDT
 * per player — so the tier amount *is* the table's money, no conversion.
 */
export const STAKE_TIERS = [
  { id: 'TIER_1', usdt: 1, label: '1 USDT', table: 'OPEN' },
  { id: 'TIER_5', usdt: 5, label: '5 USDT', table: 'OPEN' },
  { id: 'TIER_10', usdt: 10, label: '10 USDT', table: 'OPEN' },
  { id: 'TIER_20', usdt: 20, label: '20 USDT', table: 'OPEN' },
  { id: 'TIER_50', usdt: 50, label: '50 USDT', table: 'OPEN' },
  { id: 'TIER_100', usdt: 100, label: '100 USDT', table: 'OPEN' },
  { id: 'MASTER_500', usdt: 500, label: '500 USDT', table: 'MASTER' },
  { id: 'MASTER_1000', usdt: 1000, label: '1000 USDT', table: 'MASTER' },
  { id: 'MASTER_2000', usdt: 2000, label: '2000 USDT', table: 'MASTER' },
  { id: 'MASTER_3000', usdt: 3000, label: '3000 USDT', table: 'MASTER' },
  { id: 'MASTER_5000', usdt: 5000, label: '5000 USDT', table: 'MASTER' }
] as const
export type StakeTierId = (typeof STAKE_TIERS)[number]['id']
export const STAKE_TIER_IDS = STAKE_TIERS.map((tier) => tier.id) as unknown as readonly [StakeTierId, ...StakeTierId[]]
export type StakeTier = (typeof STAKE_TIERS)[number]

export function stakeTierById(id: string): StakeTier | undefined {
  return STAKE_TIERS.find((tier) => tier.id === id)
}

export function stakesForTable(table: StakeTable): StakeTier[] {
  return STAKE_TIERS.filter((tier) => tier.table === table)
}

/** Match row type written when a tier is accepted. Master stakes are not practice. */
export function matchTypeForStake(tierId: string): 'ONE_V_ONE' | 'MASTER' {
  return stakeTierById(tierId)?.table === 'MASTER' ? 'MASTER' : 'ONE_V_ONE'
}