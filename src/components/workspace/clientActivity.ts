import { Mic, Radio, Send } from 'lucide-react'
import type { CalendarEventInput } from '@/lib/calendarLinks'
import { decodeHtmlEntities } from '@/lib/htmlEntities'
import type { WorkspaceClientBooking } from '@/services/clients'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

/**
 * The dated things on the client calendar, and how to describe one.
 *
 * Kept beside the calendar rather than inside it so the grid and the detail
 * dialog read the same activity from the same place — two copies of "what a
 * recording is" would drift the moment one of them gained a field.
 */

export type ActivityKind = 'recording' | 'release' | 'outreach'

export interface CalendarActivity {
  id: string
  /** The placement this day belongs to, for opening the full record. */
  itemId: string
  kind: ActivityKind
  /** Calendar day, YYYY-MM-DD. */
  day: string
  clientName: string
  clientId: string
  podcastName: string
  podcastUrl: string | null
  podcastImage: string | null
  hostName: string | null
  cancelled: boolean
  /** Where the placement has reached, so a date reads in context. */
  stage: string
  bookingStatus: string | null
  episodeUrl: string | null
  notes: string | null
  nextAction: string | null
  audienceSize: number | null
  campaign: { status: string; openCount: number; replyCount: number } | null
}

export const KIND_VIEW: Record<ActivityKind, { label: string; className: string; dot: string; Icon: typeof Mic }> = {
  recording: {
    label: 'Recording',
    className: 'border-sky-200 bg-sky-50 text-sky-900',
    dot: 'bg-sky-500',
    Icon: Mic,
  },
  release: {
    label: 'Goes live',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-500',
    Icon: Radio,
  },
  outreach: {
    label: 'Outreach sent',
    className: 'border-violet-200 bg-violet-50 text-violet-900',
    dot: 'bg-violet-500',
    Icon: Send,
  },
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/u

/** A date-only key from either a date column or a timestamp. */
function dayKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const candidate = value.slice(0, 10)
  return DAY_KEY.test(candidate) ? candidate : null
}

export function activitiesFromItems(items: ClientPodcastSystemItem[]): CalendarActivity[] {
  return items.flatMap((item) => {
    const base = {
      itemId: item.id,
      clientName: item.client.name,
      clientId: item.client.id,
      podcastName: decodeHtmlEntities(item.podcast.name || 'Untitled show'),
      podcastUrl: item.podcast.url,
      podcastImage: item.podcast.image_url,
      hostName: item.booking?.host_name ?? item.podcast.host_name ?? null,
      // A cancelled placement keeps its dates in the record. Showing them
      // unmarked would put a recording on the calendar that is not happening.
      cancelled: item.booking?.status === 'cancelled',
      stage: item.stage,
      bookingStatus: item.booking?.status ?? null,
      episodeUrl: item.booking?.episode_url ?? null,
      notes: item.booking?.notes ?? null,
      nextAction: item.next_action,
      audienceSize: item.podcast.audience_size,
      campaign: item.campaign
        ? {
          status: item.campaign.status,
          openCount: item.campaign.open_count,
          replyCount: item.campaign.reply_count,
        }
        : null,
    }
    const entries: CalendarActivity[] = []
    // Recording day: the scheduled date is the fallback, since an early-stage
    // booking often has only that.
    const recording = dayKey(item.booking?.recording_date) ?? dayKey(item.booking?.scheduled_date)
    if (recording) entries.push({ ...base, id: `${item.id}:recording`, kind: 'recording', day: recording })
    const release = dayKey(item.booking?.publish_date)
    if (release) entries.push({ ...base, id: `${item.id}:release`, kind: 'release', day: release })
    // When outreach actually reached the host, from either the campaign or the
    // pre-campaign admin tool.
    const outreach = dayKey(item.campaign?.launched_at) ?? dayKey(item.legacy_outreach_at)
    if (outreach) {
      entries.push({ ...base, id: `${item.id}:outreach`, kind: 'outreach', day: outreach, cancelled: false })
    }
    return entries
  })
}

/**
 * The same calendar, built from a single client's bookings.
 *
 * The client page already holds these; going back for the workspace-wide
 * payload to draw one client's dates would be a round trip for data it has.
 * Outreach is absent here by nature — a booking is what happened after it.
 */
export function activitiesFromBookings(
  bookings: WorkspaceClientBooking[],
  client: { id: string; name: string },
): CalendarActivity[] {
  return bookings.flatMap((booking) => {
    const base = {
      itemId: booking.id,
      clientName: client.name,
      clientId: client.id,
      podcastName: decodeHtmlEntities(booking.podcast_name || 'Untitled show'),
      podcastUrl: booking.podcast_url,
      podcastImage: null,
      hostName: booking.host_name,
      cancelled: booking.status === 'cancelled',
      stage: booking.status,
      bookingStatus: booking.status,
      episodeUrl: booking.episode_url,
      notes: booking.notes,
      nextAction: null,
      audienceSize: null,
      campaign: null,
    }
    const entries: CalendarActivity[] = []
    const recording = dayKey(booking.recording_date) ?? dayKey(booking.scheduled_date)
    if (recording) entries.push({ ...base, id: `${booking.id}:recording`, kind: 'recording', day: recording })
    const release = dayKey(booking.publish_date)
    if (release) entries.push({ ...base, id: `${booking.id}:release`, kind: 'release', day: release })
    return entries
  })
}

export const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const DAY_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
export const FULL_DATE_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** A day key rendered as a date, in UTC so it never shifts under a viewer. */
export const formatDay = (day: string, formatter: Intl.DateTimeFormat = FULL_DATE_LABEL): string =>
  formatter.format(new Date(`${day}T00:00:00Z`))

/**
 * The event as it should land in somebody's own calendar. Kept in one place so
 * the Google link and the downloaded file describe the same thing.
 */
export function activityCalendarEvent(activity: CalendarActivity): CalendarEventInput {
  const view = KIND_VIEW[activity.kind]
  return {
    title: `${view.label}: ${activity.podcastName} — ${activity.clientName}`,
    day: activity.day,
    details: [
      `Client: ${activity.clientName}`,
      activity.hostName ? `Host: ${activity.hostName}` : '',
      activity.podcastUrl ? `Show: ${activity.podcastUrl}` : '',
    ].filter(Boolean).join('\n'),
    location: activity.podcastUrl ?? undefined,
    uid: activity.id,
  }
}
