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
  /**
   * Stable identifier for the event. Re-importing the same file then updates
   * the event already in the calendar instead of adding a second copy of it.
   */
  uid?: string | null
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

// Everything below builds an .ics file, which is what Apple Calendar, Outlook,
// and Fastmail take. Google is one link; every other calendar is a download.

/** RFC 5545 escaping. An unescaped comma silently truncates a summary. */
const escapeIcsText = (value: string): string => value
  .replace(/\\/gu, '\\\\')
  .replace(/;/gu, '\\;')
  .replace(/,/gu, '\\,')
  .replace(/\r?\n/gu, '\\n')

/**
 * Content lines are limited to 75 octets, not characters — a show name with an
 * accent or an emoji in it spends more than one octet per character, so folding
 * on character count would produce a file some clients reject.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line
  const lines: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines are prefixed with a space, which costs an octet.
    const limit = lines.length === 0 ? 75 : 74
    if (octets + size > limit) {
      lines.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  if (current) lines.push(current)
  return lines.join('\r\n ')
}

const icsStamp = (value: Date): string => `${value.toISOString().slice(0, 19).replace(/[-:]/gu, '')}Z`

/**
 * A single-event calendar file, or null when the input cannot make a valid
 * event — the same contract as googleCalendarUrl, so a caller can offer both
 * or neither rather than a download that produces a file no calendar opens.
 */
export function icsCalendarFile(input: CalendarEventInput, now: Date = new Date()): string | null {
  const title = input.title?.trim()
  if (!title || !DAY.test(input.day ?? '')) return null

  const uid = input.uid?.trim() || `${compact(input.day)}-${escapeIcsText(title).slice(0, 40)}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Get On A Pod//Client Activity Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid.replace(/\s+/gu, '-')}@getonapod.com`,
    `DTSTAMP:${icsStamp(now)}`,
    // All-day, and the end is exclusive here too.
    `DTSTART;VALUE=DATE:${compact(input.day)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(input.day))}`,
    `SUMMARY:${escapeIcsText(title)}`,
    ...(input.details?.trim() ? [`DESCRIPTION:${escapeIcsText(input.details.trim())}`] : []),
    ...(input.location?.trim() ? [`LOCATION:${escapeIcsText(input.location.trim())}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

/**
 * A download href for that file. A data URL rather than an object URL so the
 * link is a plain anchor with nothing to revoke — an object URL leaked on every
 * render would hold the file in memory for the life of the tab.
 */
export function icsDownloadHref(input: CalendarEventInput, now?: Date): string | null {
  const file = icsCalendarFile(input, now)
  return file ? `data:text/calendar;charset=utf-8,${encodeURIComponent(file)}` : null
}

/** A filename the operator can recognise in their downloads folder. */
export function icsFileName(title: string, day: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 60)
  return `${slug || 'event'}-${day}.ics`
}
