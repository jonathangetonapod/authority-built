/**
 * When a host is next due to hear from us.
 *
 * Instantly has no forward-looking field. Every timestamp on a lead points
 * backwards — last contact, last open, last reply — so "when does the next
 * email go out" is arithmetic done here, never a fact read from the provider.
 *
 * That shapes what this is allowed to claim. It reports the earliest the next
 * email could go, not when it will: a daily limit, an account limit, a paused
 * campaign or bounce protection can all hold it, and the provider reports those
 * separately through not_sending_status. Callers must present the result as an
 * estimate, which is why every reason below reads as one.
 */

export interface NextSendInputs {
  /** Provider lead status: 1 active, 2 paused, 3 completed, negatives ended. */
  leadStatus: number | null
  /** Provider campaign status: 1 is the only one that sends. */
  campaignStatus: number | null
  /** When an email last went out. Null means none has. */
  lastContactAt: string | null
  /** Days the campaign may send, indexed as Instantly does: 0 is Sunday. */
  sendDays: number[]
  /** 24h "HH:MM" in the campaign's timezone. */
  windowStart: string
  timezone: string
  /** Days before the first follow-up, which is the shortest possible gap. */
  followUpOneDelayDays: number
}

export type NextSendProjection =
  /** Nothing further will be sent, and the reason is settled. */
  | { kind: 'none'; reason: string }
  /** Held by something an operator can change. */
  | { kind: 'held'; reason: string }
  /** The earliest it could go out. Never a promise that it will. */
  | { kind: 'due'; at: Date; approximate: true }

/** Minutes into the day, from "HH:MM". Falls back to 09:00. */
function windowMinutes(value: string): number {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value)
  if (!match) return 9 * 60
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * The weekday a moment falls on in the campaign's timezone, not the viewer's.
 * A campaign sending in Detroit does not change its schedule because the person
 * reading the page is in Bogota.
 */
function weekdayInZone(date: Date, timezone: string): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
    return index >= 0 ? index : date.getUTCDay()
  } catch {
    return date.getUTCDay()
  }
}

export function projectNextSend(input: NextSendInputs, now: Date = new Date()): NextSendProjection {
  if (input.leadStatus === 3) return { kind: 'none', reason: 'The sequence has finished for this host.' }
  if (input.leadStatus === -1) return { kind: 'none', reason: 'The address bounced, so nothing further will be sent.' }
  if (input.leadStatus === -2) return { kind: 'none', reason: 'The host unsubscribed, so nothing further will be sent.' }
  if (input.leadStatus === -3) return { kind: 'none', reason: 'Instantly skipped this lead, so nothing is queued.' }
  if (input.leadStatus === 2) return { kind: 'held', reason: 'This lead is paused in Instantly.' }
  if (input.campaignStatus !== 1) return { kind: 'held', reason: 'The campaign is not sending, so nothing goes out until it is started.' }
  if (!input.sendDays.length) return { kind: 'held', reason: 'The campaign has no sending days selected.' }

  // Never contacted: the next open window is the first email, and that one is
  // not a guess about which step comes next.
  const earliest = input.lastContactAt
    ? new Date(new Date(input.lastContactAt).getTime() + input.followUpOneDelayDays * 86_400_000)
    : now
  if (Number.isNaN(earliest.getTime())) return { kind: 'held', reason: 'The last send time could not be read.' }

  const from = earliest.getTime() > now.getTime() ? earliest : now
  const days = new Set(input.sendDays)
  // Walk forward to the first day the campaign may send on. Two weeks is past
  // any weekly schedule; beyond that the day set is empty, handled above.
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(from.getTime() + offset * 86_400_000)
    if (!days.has(weekdayInZone(candidate, input.timezone))) continue
    if (offset === 0) return { kind: 'due', at: from, approximate: true }
    // A later day opens at the start of the window rather than at this hour.
    const midnight = new Date(candidate)
    midnight.setUTCHours(0, 0, 0, 0)
    return {
      kind: 'due',
      at: new Date(midnight.getTime() + windowMinutes(input.windowStart) * 60_000),
      approximate: true,
    }
  }
  return { kind: 'held', reason: 'No sending day falls within the next two weeks.' }
}

/** One line for a table cell. Always reads as an estimate. */
export function describeNextSend(projection: NextSendProjection): string {
  if (projection.kind === 'none' || projection.kind === 'held') return projection.reason
  const when = projection.at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `No earlier than ${when}`
}
