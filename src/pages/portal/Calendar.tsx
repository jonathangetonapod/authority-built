import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Mic2, Plus, Radio, RefreshCw } from 'lucide-react'

import { AddCalendarEventDialog } from '@/components/portal/AddCalendarEventDialog'
import { BookingDetailDialog } from '@/components/portal/BookingDetailDialog'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { cn } from '@/lib/utils'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import type { PortalExperienceBooking } from '@/services/clientPortal'

interface CalendarEvent {
  key: string
  kind: 'recording' | 'release'
  date: string
  // A date entered while the booking is still a conversation is a target,
  // not a commitment — the client should be able to tell the difference.
  planned: boolean
  booking: PortalExperienceBooking
}

const eventKindMeta = {
  recording: { label: 'Recording', icon: Mic2, chipClass: 'bg-violet-50 text-violet-700 border-violet-200' },
  release: { label: 'Episode live', icon: Radio, chipClass: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
} as const

const isoDay = (value: string | null): string | null => {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}/u.test(value) ? value.slice(0, 10) : null
}

const buildEvents = (bookings: PortalExperienceBooking[]): CalendarEvent[] => {
  const events: CalendarEvent[] = []
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue
    const planned = ['conversation_started', 'in_progress'].includes(booking.status)
    const recordingDay = isoDay(booking.recording_date || booking.scheduled_date)
    if (recordingDay) {
      events.push({ key: `${booking.id}:recording`, kind: 'recording', date: recordingDay, planned, booking })
    }
    const releaseDay = isoDay(booking.publish_date)
    if (releaseDay) {
      events.push({ key: `${booking.id}:release`, kind: 'release', date: releaseDay, planned, booking })
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

const monthTitle = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const displayDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// "In 3 days" answers the question a client actually has when they open this
// page. The exact date is still shown beside it — this only saves them the
// arithmetic.
const relativeDay = (value: string, todayIso: string): string => {
  const days = Math.round(
    (Date.parse(`${value}T00:00:00`) - Date.parse(`${todayIso}T00:00:00`)) / 86_400_000,
  )
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  if (days < 14) return 'Next week'
  if (days < 60) return `In ${Math.round(days / 7)} weeks`
  return `In ${Math.round(days / 30)} months`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PortalCalendar() {
  const { client } = useClientPortal()
  const overviewQuery = usePortalExperience()
  const [addOpen, setAddOpen] = useState(false)
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedBooking, setSelectedBooking] = useState<PortalExperienceBooking | null>(null)

  const events = useMemo(() => buildEvents(overviewQuery.data?.bookings ?? []), [overviewQuery.data])
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      map.set(event.date, [...(map.get(event.date) ?? []), event])
    }
    return map
  }, [events])
  const upcoming = useMemo(
    () => events.filter((event) => event.date >= todayIso).slice(0, 6),
    [events, todayIso],
  )

  // Whole weeks, with the neighbouring month's days filled in rather than left
  // blank: a recording on the 1st reads as part of the week it falls in, and
  // the grid keeps one shape instead of growing a ragged edge each month.
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: Array<{ iso: string; day: number; inMonth: boolean }> = []
    for (let offset = firstWeekday; offset > 0; offset -= 1) {
      const date = new Date(year, month, 1 - offset)
      days.push({ iso: toIso(date), day: date.getDate(), inMonth: false })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push({ iso: toIso(new Date(year, month, day)), day, inMonth: true })
    }
    for (let day = 1; days.length % 7 !== 0; day += 1) {
      const date = new Date(year, month + 1, day)
      days.push({ iso: toIso(date), day: date.getDate(), inMonth: false })
    }
    return days
  }, [year, month])

  const summary = useMemo(() => {
    const ahead = events.filter((event) => event.date >= todayIso)
    return {
      nextRecording: ahead.find((event) => event.kind === 'recording') ?? null,
      recordings: ahead.filter((event) => event.kind === 'recording').length,
      releases: ahead.filter((event) => event.kind === 'release').length,
    }
  }, [events, todayIso])

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }
  const goToToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }
  const viewingCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
            <p className="mt-1 text-muted-foreground">Your recordings and episode release dates in one place.</p>
          </div>
          {client?.id && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Add event
            </Button>
          )}
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your calendar…
          </div>
        ) : overviewQuery.error ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive">We could not load your calendar. Your session may have expired.</p>
            <Button variant="outline" onClick={() => overviewQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next recording</p>
              <p className="mt-1 truncate text-lg font-semibold">
                {summary.nextRecording ? displayDate(summary.nextRecording.date) : 'Not scheduled'}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {summary.nextRecording ? summary.nextRecording.booking.podcast_name : 'Your team will add dates as they book them.'}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recordings ahead</p>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <Mic2 className="h-4 w-4 text-violet-600" />{summary.recordings}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Booked and planned dates.</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Episodes going live</p>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
                <Radio className="h-4 w-4 text-emerald-600" />{summary.releases}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">Release dates still to come.</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b bg-muted/20 py-4">
                <CardTitle className="text-lg">{monthTitle(year, month)}</CardTitle>
                <div className="flex items-center gap-1">
                  {!viewingCurrentMonth && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goToToday}>Today</Button>
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => shiftMonth(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-7 border-b text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="py-2.5">{day.slice(0, 3)}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {cells.map((cell, index) => {
                    const dayEvents = eventsByDay.get(cell.iso) ?? []
                    const isToday = cell.iso === todayIso
                    const isWeekend = index % 7 === 0 || index % 7 === 6
                    return (
                      <div
                        key={cell.iso}
                        className={cn(
                          'min-h-24 border-b border-r p-1.5 text-left align-top last:border-r-0',
                          (index + 1) % 7 === 0 && 'border-r-0',
                          index >= cells.length - 7 && 'border-b-0',
                          !cell.inMonth && 'bg-muted/25',
                          cell.inMonth && isWeekend && 'bg-muted/10',
                          isToday && 'bg-primary/5',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                            isToday && 'bg-primary font-semibold text-primary-foreground',
                            !isToday && cell.inMonth && 'font-medium text-foreground',
                            !isToday && !cell.inMonth && 'text-muted-foreground/60',
                          )}
                        >
                          {cell.day}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 2).map((event) => {
                            const meta = eventKindMeta[event.kind]
                            return (
                              <button
                                key={event.key}
                                type="button"
                                onClick={() => setSelectedBooking(event.booking)}
                                title={`${meta.label}${event.planned ? ' (planned)' : ''} · ${event.booking.podcast_name}`}
                                className={cn(
                                  'flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] font-medium leading-4 transition-shadow hover:shadow-sm',
                                  meta.chipClass,
                                  event.planned && 'border-dashed',
                                  !cell.inMonth && 'opacity-60',
                                )}
                              >
                                <meta.icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{event.booking.podcast_name}</span>
                              </button>
                            )
                          })}
                          {dayEvents.length > 2 && (
                            <p className="px-1 text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                  {Object.entries(eventKindMeta).map(([kind, meta]) => (
                    <span key={kind} className="inline-flex items-center gap-1.5">
                      <meta.icon className={`h-3.5 w-3.5 ${kind === 'recording' ? 'text-violet-600' : 'text-emerald-600'}`} />
                      {meta.label}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[11px]">
                    <span className="h-3 w-3 rounded border border-dashed border-muted-foreground/60" aria-hidden="true" />
                    Date not confirmed yet
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Next up</CardTitle>
                <CardDescription>Your upcoming recordings and releases.</CardDescription>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center">
                    <CalendarDays className="h-6 w-6 text-muted-foreground/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium">Nothing scheduled yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      New dates appear here as your team books them.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {upcoming.map((event) => {
                      const meta = eventKindMeta[event.kind]
                      const eventDate = new Date(`${event.date}T00:00:00`)
                      return (
                        <li key={event.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(event.booking)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
                          >
                            {/* The date block gives the list a scannable left
                                edge, so a client can find a week without
                                reading every row. */}
                            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/30 leading-none">
                              <span className="text-[10px] font-medium uppercase text-muted-foreground">
                                {eventDate.toLocaleDateString(undefined, { month: 'short' })}
                              </span>
                              <span className="mt-0.5 text-sm font-semibold">{eventDate.getDate()}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{event.booking.podcast_name}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <meta.icon className={`h-3 w-3 shrink-0 ${event.kind === 'recording' ? 'text-violet-600' : 'text-emerald-600'}`} aria-hidden="true" />
                                <span className="truncate">
                                  {meta.label}{event.planned ? ' (planned)' : ''} · {displayDate(event.date)}
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                              {relativeDay(event.date, todayIso)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          </>
        )}
      </div>
      <BookingDetailDialog
        booking={selectedBooking}
        onOpenChange={(open) => { if (!open) setSelectedBooking(null) }}
        onRemoved={() => void overviewQuery.refetch()}
      />
      {client?.id && (
        <AddCalendarEventDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          clientId={client.id}
          onAdded={() => void overviewQuery.refetch()}
        />
      )}
    </PortalLayout>
  )
}
