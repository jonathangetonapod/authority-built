// Links that let a client put a placement into their own calendar.
//
// Placement dates in this product are days, not moments: a recording date
// carries no clock value, so everything exported here is an all-day event.
// Google reads the end of an all-day range as exclusive, so the end has to be
// the following day — passing the same day twice produces a zero-length event
// that some calendars drop without reporting anything.

const DAY = /^\d{4}-\d{2}-\d{2}$/u

const compact = (day: string) => day.replace(/-/gu, '')

const nextDay = (day: string): string => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export interface CalendarEventInput {
  title: string
  /** Calendar day in YYYY-MM-DD. */
  day: string
  details?: string | null
  location?: string | null
}

/**
 * A Google Calendar pre-filled event URL, or null when the input cannot make a
 * valid event. Returning null rather than a broken link keeps the caller from
 * rendering a button that lands the client on an error page.
 */
export function googleCalendarUrl(input: CalendarEventInput): string | null {
  const title = input.title?.trim()
  if (!title || !DAY.test(input.day ?? '')) return null
  const date = new Date(`${input.day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${compact(input.day)}/${compact(nextDay(input.day))}`,
  })
  const details = input.details?.trim()
  if (details) params.set('details', details)
  const location = input.location?.trim()
  if (location) params.set('location', location)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
