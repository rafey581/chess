/**
 * Display helpers.
 *
 * Money and dates arrive from the API as strings (Prisma decimals are serialised
 * as strings so no precision is lost) and as ISO timestamps. These are the only
 * places that turn them into something a human reads, so the screens stay thin
 * and the formatting is testable.
 */

/** USDT amount with trailing zeros trimmed: 12.500000 -> "12.5", 10 -> "10". */
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  // Keep up to 6 decimals (a Chess stake is whole USDT; a referral cent is not).
  return n.toFixed(6).replace(/\.?0+$/, '')
}

/** Signed amount for wallet adjustments: 5 -> "+5", -5 -> "-5". */
export function formatSignedAmount(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value ?? '')
  return `${n > 0 ? '+' : ''}${formatAmount(n)}`
}

/** "2026-10-14 09:31" from an ISO string; the dashes and space read faster than a T. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/** "2026-10-14" from an ISO string. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toISOString().slice(0, 10)
}

/** How long ago, in rounded units, for list rows where an exact time is noise. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '-'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return String(iso)
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** First `length` characters of an id, for compact table cells. */
export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return '-'
  return id.length > length ? id.slice(0, length) : id
}

/** Shortens text to `max` characters, adding an ellipsis when it was cut. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text
}

/** JSON for a table cell, capped so one huge blob cannot blow up a row. */
export function jsonSummary(value: unknown, max = 160): string {
  if (value === null || value === undefined) return ''
  let text: string
  try {
    text = JSON.stringify(value)
  } catch {
    text = String(value)
  }
  return truncate(text, max)
}

/** Human label for an enum-ish status ("MATCH_IN_PROGRESS" -> "Match in progress"). */
export function humanize(value: string | null | undefined): string {
  if (!value) return '-'
  const spaced = value.replace(/_/g, ' ').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
