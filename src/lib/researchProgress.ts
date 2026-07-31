/**
 * Whether a research run is still running, or only says it is.
 *
 * The run writes its progress as it advances and writes a terminal status when
 * it finishes or fails. A run that dies without reaching either — an edge
 * function timeout, or a redeploy killing an invocation mid-flight — leaves the
 * record saying "running" forever, and the modal spun on it for two days with
 * nothing on the other end. The backend already knew better: it treats a lock
 * this stale as reclaimable and lets a fresh run take it. Only the screen
 * believed the record.
 */

/**
 * Mirrors RESEARCH_STALE_LOCK_MS in workspace-client-shortlist/index.ts, which
 * is the point at which the backend lets a new run take the lock. The campaign
 * edge contract asserts the two still agree.
 */
export const RESEARCH_LOCK_STALE_AFTER_MS = 3 * 60 * 1000

/**
 * Deliberately later than the lock expiry, and derived from it so the two move
 * together.
 *
 * These two thresholds answer different questions. The backend's decides
 * whether a second run may start, judged on server time against a server
 * timestamp. This one decides whether to keep showing a spinner, judged on the
 * BROWSER's clock against that same server timestamp — so a viewer whose clock
 * runs minutes fast would declare a genuinely live run dead at parity, and the
 * cost of that is telling someone their working run has stopped. The cost in
 * the other direction is a spinner that takes a few more minutes to give up.
 */
export const RESEARCH_UI_STALE_AFTER_MS = RESEARCH_LOCK_STALE_AFTER_MS * 3

export interface ResearchProgressRecord {
  status?: string | null
  updated_at?: string | null
}

/** The statuses that claim work is still happening. */
const ACTIVE_STATUSES = new Set(['queued', 'running'])

/**
 * True when the record claims to be working but has not been written to for
 * longer than a live run ever goes quiet.
 *
 * A record with no timestamp is NOT called stale: it cannot be aged, and
 * guessing would turn an unparseable field into a false "your run stopped".
 */
export function isResearchRunStale(
  progress: ResearchProgressRecord | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!progress || !ACTIVE_STATUSES.has(String(progress.status))) return false
  if (typeof progress.updated_at !== 'string' || progress.updated_at.trim() === '') return false
  const writtenAt = Date.parse(progress.updated_at)
  if (Number.isNaN(writtenAt)) return false
  return nowMs - writtenAt > RESEARCH_UI_STALE_AFTER_MS
}
