/**
 * Live conversations going quiet.
 *
 * The relationship book counts conversations that are live, but the count is
 * not the actionable fact — the actionable fact is which of them has gone
 * silent. A host mid-conversation who last heard from us five days ago is a
 * placement dying quietly, and it was invisible: the page sorted by recency,
 * which puts exactly these rows at the bottom.
 */

export interface QuietConversation {
  podcast_id: string
  podcast_name: string | null
  derived_state: string
  last_contacted_at: string | null
}

/**
 * Five days, not the inbox's two. An inbox reply is a person waiting on an
 * answer; a relationship touch is a slower cadence, and flagging every
 * three-day gap would bury the genuinely stalled under the merely unhurried.
 */
const QUIET_AFTER_MS = 5 * 86_400_000

export function quietConversations<T extends QuietConversation>(
  rows: T[],
  now: Date = new Date(),
): T[] {
  return rows
    .filter((row) => {
      if (row.derived_state !== 'in_conversation') return false
      if (!row.last_contacted_at) return false
      const at = new Date(row.last_contacted_at).getTime()
      if (Number.isNaN(at)) return false
      return now.getTime() - at > QUIET_AFTER_MS
    })
    // Longest silence first: the most stalled conversation is the most urgent.
    .sort((left, right) => String(left.last_contacted_at).localeCompare(String(right.last_contacted_at)))
}

/** "quiet 6d" for a chip. Callers only pass rows the filter above admitted. */
export function describeQuiet(lastContactedAt: string | null, now: Date = new Date()): string | null {
  if (!lastContactedAt) return null
  const at = new Date(lastContactedAt).getTime()
  if (Number.isNaN(at)) return null
  const days = Math.floor((now.getTime() - at) / 86_400_000)
  return days >= 1 ? `quiet ${days}d` : null
}
