/**
 * How old the campaign totals on screen actually are.
 *
 * Instantly analytics arrive only when somebody presses "Refresh totals", so
 * "Emails sent: 1,240" reads as equally authoritative whether it synced a
 * minute or a fortnight ago. That is the whole problem this answers.
 *
 * The reported age is the OLDEST sync among the campaigns feeding the totals,
 * not the newest. A workspace where nine campaigns synced a minute ago and one
 * synced last week has week-old totals, and saying "a minute ago" would be a
 * more confident lie than saying nothing.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Past this, the numbers are old enough that an operator should be told. */
const STALE_AFTER_MS = 24 * HOUR_MS

export interface SyncFreshness {
  label: string
  stale: boolean
}

function relativeAge(elapsedMs: number): string {
  if (elapsedMs < 2 * MINUTE_MS) return 'just now'
  if (elapsedMs < HOUR_MS) {
    const minutes = Math.floor(elapsedMs / MINUTE_MS)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }
  if (elapsedMs < DAY_MS) {
    const hours = Math.floor(elapsedMs / HOUR_MS)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(elapsedMs / DAY_MS)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * `null` when there is nothing to describe — no campaigns, so no totals whose
 * age could mislead anyone.
 */
export function describeSyncFreshness(
  timestamps: Array<string | null | undefined>,
  now: number,
): SyncFreshness | null {
  if (timestamps.length === 0) return null

  // A campaign that has never synced contributes nothing to the totals but is
  // still counted in them, so it is named rather than skipped.
  const neverSynced = timestamps.filter((value) => !value).length
  if (neverSynced === timestamps.length) {
    return { label: 'Totals have never been synced from Instantly', stale: true }
  }
  if (neverSynced > 0) {
    return {
      label: `${neverSynced} campaign${neverSynced === 1 ? ' has' : 's have'} never synced from Instantly`,
      stale: true,
    }
  }

  const oldest = timestamps.reduce((lowest, value) => {
    const parsed = Date.parse(String(value))
    if (!Number.isFinite(parsed)) return lowest
    return lowest === null || parsed < lowest ? parsed : lowest
  }, null as number | null)
  // Unparseable timestamps are not evidence of freshness.
  if (oldest === null) return { label: 'Totals have never been synced from Instantly', stale: true }

  // A clock skewed into the future should not read as an age.
  const elapsed = Math.max(0, now - oldest)
  return { label: `Totals synced ${relativeAge(elapsed)}`, stale: elapsed > STALE_AFTER_MS }
}
