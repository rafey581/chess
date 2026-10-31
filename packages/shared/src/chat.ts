/**
 * In-match quick chat.
 *
 * The player never types a message: every line of chat is one of these fixed
 * phrases, chosen from a menu on the table. The ids are the wire protocol and
 * the only thing the server will accept — a client can send an id, never free
 * text — so this list is shared so the menu the client draws and the whitelist
 * the server enforces cannot drift apart.
 */

export interface MatchChatPhrase {
  id: string
  text: string
}

export const MATCH_CHAT_PHRASES: readonly MatchChatPhrase[] = [
  { id: 'gl', text: 'Good luck!' },
  { id: 'np', text: 'No problem.' },
  { id: 'gg', text: 'GG!' },
  { id: 'wp', text: 'Well played.' },
  { id: 'gs', text: 'Nice move!' },
  { id: 'sv', text: 'Solid defence.' },
  { id: 'pot', text: 'What a sacrifice!' },
  { id: 'brk', text: 'Nice opening.' },
  { id: 'clr', text: 'Brilliant combination!' },
  { id: 'un', text: 'Unlucky.' },
  { id: 'thx', text: 'Thanks!' },
  { id: 'ha', text: 'Haha!' },
  { id: 'bb', text: 'Great comeback.' },
  { id: 'cl', text: 'That was close.' },
  { id: 'ty', text: 'Take your time.' },
  { id: 'hry', text: 'Play a little faster?' }
] as const

export type MatchChatPhraseId = (typeof MATCH_CHAT_PHRASES)[number]['id']

const PHRASE_IDS = new Set<string>(MATCH_CHAT_PHRASES.map((p) => p.id))

export function isMatchChatPhrase(id: string): boolean {
  return PHRASE_IDS.has(id)
}

export function matchChatPhraseText(id: string): string | undefined {
  return MATCH_CHAT_PHRASES.find((p) => p.id === id)?.text
}

/** Chat is a social pulse, not a channel: at most one line per player per window. */
export const MATCH_CHAT_COOLDOWN_MS = 1500

/** How many lines the on-table chat log keeps before dropping the oldest. */
export const MATCH_CHAT_MAX_LOG = 6
