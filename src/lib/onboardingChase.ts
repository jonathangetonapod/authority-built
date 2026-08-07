import type { OnboardingWorkflowStatus } from '@/lib/onboardingActivity'

/**
 * Nothing chases a client who goes quiet — no reminder function is deployed and
 * none is scheduled. So the platform's job here is to stop losing track: say
 * which onboardings have gone cold and why, and leave the chasing to a person.
 */

/** Sent, never opened, for this long. */
export const UNOPENED_CHASE_DAYS = 3
/** Opened or started, never finished, for this long. */
export const UNFINISHED_CHASE_DAYS = 7
/** A live onboarding whose link dies within this window. */
export const EXPIRING_SOON_DAYS = 3

const DAY_MS = 86_400_000

export interface OnboardingChaseInput {
  status: OnboardingWorkflowStatus
  invited_at: string
  viewed_at: string | null
  started_at: string | null
  submitted_at: string | null
  /** Set when a reviewer sent answers back. The ball is with the client again. */
  changes_requested_at: string | null
  capability_expires_at: string
  archived_at: string | null
  /**
   * Outcome of the last invitation/change-request email, when known. The list
   * used to say "Sent" from invited_at — a timestamp stamped whether or not
   * the email left — so a failed send chased as "never opened".
   */
  delivery?: { status: string; last_error: string | null } | null
}

export interface OnboardingChaseState {
  /** Whole days since the invitation, or null when the date is unusable. */
  ageDays: number | null
  /** Whole days until the link dies. Negative once it has. */
  expiresInDays: number | null
  needsChasing: boolean
  /** Why it is cold, in the words an operator would use. Null when it is not. */
  reason: string | null
}

function wholeDaysBetween(from: string, to: number): number | null {
  const parsed = Date.parse(from)
  if (!Number.isFinite(parsed)) return null
  // Rounded, not floored: a spring-forward makes ten calendar days measure
  // 10x24h minus an hour, and floor turned that into "9 days ago" — with
  // every chase threshold firing a day late.
  return Math.round((to - parsed) / DAY_MS)
}

function dayLabel(days: number): string {
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

export function onboardingChaseState(
  instance: OnboardingChaseInput,
  now: number,
): OnboardingChaseState {
  const ageDays = wholeDaysBetween(instance.invited_at, now)
  const expiryParsed = Date.parse(instance.capability_expires_at)
  const expiresInDays = Number.isFinite(expiryParsed)
    ? Math.floor((expiryParsed - now) / DAY_MS)
    : null

  // Finished, archived, or already dead. Chasing is over either way, and a
  // submitted form is the reviewer's move rather than the client's.
  const settled = instance.archived_at !== null
    || ['submitted', 'approved', 'expired', 'revoked'].includes(instance.status)
  if (settled || ageDays === null) {
    return { ageDays, expiresInDays, needsChasing: false, reason: null }
  }

  // A dead link outranks everything. Telling somebody to nudge their client is
  // wrong when the client cannot open the form at all — the operator has to
  // extend or rotate it first.
  if (expiresInDays !== null && expiresInDays < 0) {
    return { ageDays, expiresInDays, needsChasing: true, reason: 'The link has expired' }
  }

  // When changes were requested, the wait restarts from that moment. The
  // database does not clear submitted_at when it sends answers back, so keying
  // off submitted_at alone would mark a client who never responds as finished
  // forever — exactly the silence this is supposed to catch.
  const requestedAt = instance.changes_requested_at
  const awaitingChanges = instance.status === 'changes_requested' && requestedAt !== null
  const waitingDays = awaitingChanges ? wholeDaysBetween(requestedAt, now) : ageDays
  const responded = awaitingChanges
    ? Boolean(instance.submitted_at) && Date.parse(instance.submitted_at as string) > Date.parse(requestedAt)
    : Boolean(instance.submitted_at)

  if (awaitingChanges) {
    if (!responded && waitingDays !== null && waitingDays >= UNFINISHED_CHASE_DAYS) {
      return {
        ageDays,
        expiresInDays,
        needsChasing: true,
        reason: `Changes requested ${dayLabel(waitingDays)} ago with no reply`,
      }
    }
  } else {
    // An email that never left outranks a client who never clicked. Without
    // this, a failed or skipped send waited out the unopened window and then
    // blamed the client for ignoring an invitation nobody received.
    if (!instance.viewed_at && instance.delivery
      && (instance.delivery.status === 'failed' || instance.delivery.status === 'skipped')) {
      return {
        ageDays,
        expiresInDays,
        needsChasing: true,
        reason: instance.delivery.status === 'failed'
          ? 'The invitation email failed to send — share the link yourself'
          : 'The invitation email was never sent — share the link yourself',
      }
    }

    if (!instance.viewed_at && ageDays >= UNOPENED_CHASE_DAYS) {
      return {
        ageDays,
        expiresInDays,
        needsChasing: true,
        reason: `Sent ${dayLabel(ageDays)} ago and never opened`,
      }
    }

    if (!responded && ageDays >= UNFINISHED_CHASE_DAYS) {
      return {
        ageDays,
        expiresInDays,
        needsChasing: true,
        reason: instance.started_at
          ? `Started ${dayLabel(ageDays)} ago and not finished`
          : `Opened ${dayLabel(ageDays)} ago and not started`,
      }
    }
  }

  // Worth saying even on a young invitation: once the link dies, the client
  // gets an error rather than a form, and nobody is told.
  if (expiresInDays !== null && expiresInDays <= EXPIRING_SOON_DAYS) {
    return {
      ageDays,
      expiresInDays,
      needsChasing: true,
      reason: expiresInDays <= 0
        ? 'The link expires today'
        : `The link expires in ${dayLabel(expiresInDays)}`,
    }
  }

  return { ageDays, expiresInDays, needsChasing: false, reason: null }
}
