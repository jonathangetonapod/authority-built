import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Mic, Radio, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { googleCalendarUrl } from '@/lib/calendarLinks'
import { decodeHtmlEntities } from '@/lib/htmlEntities'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

/**
 * Everything dated that is happening with every client, on one calendar.
 *
 * The per-client views answer "what is going on with this one". Nobody could
 * answer "what is happening this week" without opening each client in turn,
 * which is the question an agency actually runs its week on.
 *
 * Built entirely from the payload the page already loads — a recording, a
 * release, and the day outreach went out are all carried on the same items —
 * so this adds a view, not a round trip.
 */

export type ActivityKind = 'recording' | 'release' | 'outreach'

export interface CalendarActivity {
  id: string
  kind: ActivityKind
  /** Calendar day, YYYY-MM-DD. */
  day: string
  clientName: string
  clientId: string
  podcastName: string
  podcastUrl: string | null
  hostName: string | null
  cancelled: boolean
}

const KIND_VIEW: Record<ActivityKind, { label: string; className: string; dot: string; Icon: typeof Mic }> = {
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
      clientName: item.client.name,
      clientId: item.client.id,
      podcastName: decodeHtmlEntities(item.podcast.name || 'Untitled show'),
      podcastUrl: item.podcast.url,
      hostName: item.booking?.host_name ?? item.podcast.host_name ?? null,
      // A cancelled placement keeps its dates in the record. Showing them
      // unmarked would put a recording on the calendar that is not happening.
      cancelled: item.booking?.status === 'cancelled',
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

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function calendarEventFor(activity: CalendarActivity): string | null {
  const view = KIND_VIEW[activity.kind]
  return googleCalendarUrl({
    title: `${view.label}: ${activity.podcastName} — ${activity.clientName}`,
    day: activity.day,
    details: [
      `Client: ${activity.clientName}`,
      activity.hostName ? `Host: ${activity.hostName}` : '',
      activity.podcastUrl ? `Show: ${activity.podcastUrl}` : '',
    ].filter(Boolean).join('\n'),
    location: activity.podcastUrl ?? undefined,
  })
}

interface ClientActivityCalendarProps {
  items: ClientPodcastSystemItem[]
}

export const ClientActivityCalendar = ({ items }: ClientActivityCalendarProps) => {
  const activities = useMemo(() => activitiesFromItems(items), [items])
  const [monthOffset, setMonthOffset] = useState(0)
  const [clientFilter, setClientFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState<'all' | ActivityKind>('all')

  const clientOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const activity of activities) byId.set(activity.clientId, activity.clientName)
    return [...byId.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [activities])

  const visible = useMemo(() => activities.filter((activity) => (
    (clientFilter === 'all' || activity.clientId === clientFilter)
    && (kindFilter === 'all' || activity.kind === kindFilter)
  )), [activities, clientFilter, kindFilter])

  // The grid anchor. Built in UTC throughout so a calendar day never shifts
  // under a viewer in a different timezone than the one that wrote the date.
  const anchor = useMemo(() => {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1))
  }, [monthOffset])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>()
    for (const activity of visible) {
      const existing = map.get(activity.day) ?? []
      existing.push(activity)
      map.set(activity.day, existing)
    }
    return map
  }, [visible])

  // Whole weeks, so a recording on the 1st sits inside its week rather than
  // beside a run of blanks.
  const cells = useMemo(() => {
    const start = new Date(anchor)
    start.setUTCDate(start.getUTCDate() - start.getUTCDay())
    return Array.from({ length: 42 }, (_value, index) => {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      return date
    })
  }, [anchor])

  const today = todayKey()
  const upcoming = useMemo(() => visible
    .filter((activity) => activity.day >= today && !activity.cancelled)
    .sort((left, right) => left.day.localeCompare(right.day))
    .slice(0, 8), [visible, today])

  const monthKey = anchor.toISOString().slice(0, 7)
  const monthCount = visible.filter((activity) => activity.day.startsWith(monthKey)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />Everything scheduled
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Recordings, release dates, and the day outreach went out — across every client in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger aria-label="Filter by client" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clientOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(value) => setKindFilter(value as 'all' | ActivityKind)}>
            <SelectTrigger aria-label="Filter by activity" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="recording">Recordings</SelectItem>
              <SelectItem value="release">Releases</SelectItem>
              <SelectItem value="outreach">Outreach</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">{MONTH_LABEL.format(anchor)}</CardTitle>
              <CardDescription>
                {monthCount === 0 ? 'Nothing scheduled this month' : `${monthCount} ${monthCount === 1 ? 'entry' : 'entries'}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonthOffset(monthOffset - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setMonthOffset(0)}>Today</Button>
              <Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={() => setMonthOffset(monthOffset + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div role="grid" aria-label="Client activity calendar" className="overflow-hidden rounded-xl border">
              <div role="row" className="grid grid-cols-7 border-b bg-muted/30">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} role="columnheader" className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((date) => {
                  const key = date.toISOString().slice(0, 10)
                  const inMonth = key.startsWith(monthKey)
                  const dayActivities = byDay.get(key) ?? []
                  const isToday = key === today
                  const isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
                  return (
                    <div
                      key={key}
                      role="gridcell"
                      aria-label={`${DAY_LABEL.format(date)}${dayActivities.length ? `, ${dayActivities.length} scheduled` : ''}`}
                      className={[
                        'min-h-24 border-b border-r p-1.5 last:border-r-0',
                        inMonth ? '' : 'bg-muted/20 text-muted-foreground/60',
                        isWeekend && inMonth ? 'bg-muted/10' : '',
                        isToday ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      <span className={isToday ? 'text-xs font-bold text-primary' : 'text-xs font-medium'}>
                        {date.getUTCDate()}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayActivities.slice(0, 3).map((activity) => {
                          const view = KIND_VIEW[activity.kind]
                          return (
                            <div
                              key={activity.id}
                              title={`${view.label} · ${activity.podcastName} · ${activity.clientName}`}
                              className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] leading-3 ${view.className} ${activity.cancelled ? 'opacity-50 line-through' : ''}`}
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${view.dot}`} />
                              <span className="truncate">{activity.clientName}</span>
                            </div>
                          )
                        })}
                        {dayActivities.length > 3 && (
                          <p className="px-1 text-[10px] text-muted-foreground">+{dayActivities.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {(Object.keys(KIND_VIEW) as ActivityKind[]).map((kind) => (
                <span key={kind} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${KIND_VIEW[kind].dot}`} />{KIND_VIEW[kind].label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next up</CardTitle>
            <CardDescription>The soonest commitments, with a way into your own calendar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="text-sm font-medium">Nothing scheduled ahead</p>
                <p className="mx-auto mt-1 max-w-56 text-xs leading-5 text-muted-foreground">
                  Recording and release dates appear here as placements are confirmed.
                </p>
              </div>
            ) : upcoming.map((activity) => {
              const view = KIND_VIEW[activity.kind]
              const calendarUrl = calendarEventFor(activity)
              return (
                <div key={activity.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{activity.podcastName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{activity.clientName}</p>
                    </div>
                    <Badge variant="outline" className={view.className}>
                      <view.Icon className="mr-1 h-3 w-3" />{view.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {DAY_LABEL.format(new Date(`${activity.day}T00:00:00Z`))}
                  </p>
                  {calendarUrl && (
                    <a
                      href={calendarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <CalendarDays className="h-3.5 w-3.5" />Add to Google Calendar
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
