/**
 * Google Calendar URL Generator
 *
 * Creates a Google Calendar "Add Event" URL that opens in a new tab
 * with event details pre-filled.
 */

interface CalendarEventDetails {
  title: string
  startTime: Date
  endTime: Date
  description?: string
  location?: string
}

/**
 * Formats a date for Google Calendar URL
 * Format: YYYYMMDDTHHmmssZ (UTC)
 */
function formatDateForGoogleCalendar(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/**
 * Generates a Google Calendar URL for adding an event
 */
export function generateGoogleCalendarUrl(event: CalendarEventDetails): string {
  const baseUrl = 'https://calendar.google.com/calendar/render'

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatDateForGoogleCalendar(event.startTime)}/${formatDateForGoogleCalendar(event.endTime)}`,
  })

  if (event.description) {
    params.append('details', event.description)
  }

  if (event.location) {
    params.append('location', event.location)
  }

  return `${baseUrl}?${params.toString()}`
}

/**
 * Opens Google Calendar in a new tab with pre-filled event details
 */
export function openGoogleCalendar(event: CalendarEventDetails): void {
  const url = generateGoogleCalendarUrl(event)
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Creates calendar event details from a podcast booking
 */
export function createCalendarEventFromBooking(booking: {
  podcast_name: string
  recording_date?: string | null
  scheduled_date?: string | null
  episode_url?: string | null
  podcast_url?: string | null
  host_name?: string | null
  notes?: string | null
}): CalendarEventDetails | null {
  // Use recording_date or fall back to scheduled_date
  const eventDate = booking.recording_date || booking.scheduled_date

  if (!eventDate) {
    return null
  }

  const startTime = new Date(eventDate)

  // Default to 1 hour duration
  const endTime = new Date(startTime)
  endTime.setHours(endTime.getHours() + 1)

  // Build description
  const descriptionParts: string[] = []

  if (booking.host_name) {
    descriptionParts.push(`Host: ${booking.host_name}`)
  }

  if (booking.episode_url) {
    descriptionParts.push(`Episode: ${booking.episode_url}`)
  }

  if (booking.notes) {
    descriptionParts.push(`\nNotes: ${booking.notes}`)
  }

  return {
    title: `Podcast Recording: ${booking.podcast_name}`,
    startTime,
    endTime,
    description: descriptionParts.join('\n'),
    location: booking.podcast_url || undefined,
  }
}
