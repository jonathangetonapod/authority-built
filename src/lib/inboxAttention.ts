/**
 * Which conversation needs the operator first.
 *
 * The inbox sorted newest-first regardless of state, which is backwards for
 * reply handling: a fresh reply can wait an hour, but a host who answered three
 * days ago and heard nothing is the most urgent thing in the app — silence
 * after a warm reply is how a booking dies. So the queue leads with the
 * longest-waiting unanswered thread, and recency only orders what is already
 * handled.
 */

export type InboxAttentionStatus =
  | 'needs_reply'
  | 'review'
  | 'replied'
  | 'booked'
  | 'archived'

interface AttentionThread {
  received_at: string | null
}

/** Lower ranks sort first. Unanswered work outranks finished work. */
const STATUS_RANK: Record<InboxAttentionStatus, number> = {
  needs_reply: 0,
  review: 1,
  replied: 2,
  booked: 2,
  archived: 3,
}

/**
 * Waiting states surface oldest first — the queue is "who has waited longest".
 * Handled states surface newest first — there, recency is the only question.
 */
const WAITING: ReadonlySet<InboxAttentionStatus> = new Set(['needs_reply', 'review'])

export function sortThreadsForAttention<T extends AttentionThread>(
  threads: T[],
  statusOf: (thread: T) => InboxAttentionStatus,
): T[] {
  return [...threads].sort((left, right) => {
    const leftStatus = statusOf(left)
    const rightStatus = statusOf(right)
    const byRank = STATUS_RANK[leftStatus] - STATUS_RANK[rightStatus]
    if (byRank !== 0) return byRank
    const leftAt = left.received_at ?? ''
    const rightAt = right.received_at ?? ''
    return WAITING.has(leftStatus)
      ? leftAt.localeCompare(rightAt)
      : rightAt.localeCompare(leftAt)
  })
}

/**
 * How long a host has been waiting on us, as a phrase for a chip.
 *
 * Null when there is nothing to say: a handled thread has no wait, and a
 * missing timestamp must not render as "waiting 20,000d".
 */
export function describeWait(receivedAt: string | null, now: Date = new Date()): string | null {
  if (!receivedAt) return null
  const received = new Date(receivedAt).getTime()
  if (Number.isNaN(received)) return null
  const elapsedMs = now.getTime() - received
  if (elapsedMs < 0) return null
  const hours = Math.floor(elapsedMs / 3_600_000)
  if (hours < 1) return 'waiting <1h'
  if (hours < 24) return `waiting ${hours}h`
  return `waiting ${Math.floor(hours / 24)}d`
}

/**
 * A wait long enough to colour. Two days of silence after a reply is where a
 * warm conversation starts going cold.
 */
export function waitIsOverdue(receivedAt: string | null, now: Date = new Date()): boolean {
  if (!receivedAt) return false
  const received = new Date(receivedAt).getTime()
  if (Number.isNaN(received)) return false
  return now.getTime() - received > 2 * 86_400_000
}
