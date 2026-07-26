import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Mic2, Radio, RefreshCw } from 'lucide-react'

import { BookingDetailDialog } from '@/components/portal/BookingDetailDialog'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function PortalCalendar() {
  const overviewQuery = usePortalExperience()
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

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="mt-1 text-muted-foreground">Your recordings and episode release dates in one place.</p>
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
          <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg">{monthTitle(year, month)}</CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => shiftMonth(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  {Object.entries(eventKindMeta).map(([kind, meta]) => (
                    <span key={kind} className="inline-flex items-center gap-1.5">
                      <meta.icon className={`h-3.5 w-3.5 ${kind === 'recording' ? 'text-violet-600' : 'text-emerald-600'}`} />
                      {meta.label}
                    </span>
                  ))}
                  <span className="ml-auto text-[11px]">Dashed border = date not confirmed yet</span>
                </div>
                <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-center text-xs">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="bg-muted/40 py-2 font-semibold text-muted-foreground">{day}</div>
                  ))}
                  {cells.map((day, index) => {
                    if (day === null) return <div key={`blank-${index}`} className="min-h-20 bg-background" />
                    const dayIso = `${monthPrefix}-${String(day).padStart(2, '0')}`
                    const dayEvents = eventsByDay.get(dayIso) ?? []
                    const isToday = dayIso === todayIso
                    return (
                      <div key={dayIso} className="min-h-20 bg-background p-1 text-left align-top">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground'}`}>
                          {day}
                        </span>
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvents.slice(0, 2).map((event) => {
                            const meta = eventKindMeta[event.kind]
                            return (
                              <button
                                key={event.key}
                                type="button"
                                onClick={() => setSelectedBooking(event.booking)}
                                title={`${meta.label}${event.planned ? ' (planned)' : ''} · ${event.booking.podcast_name}`}
                                className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium leading-4 ${meta.chipClass} ${event.planned ? 'border-dashed' : ''}`}
                              >
                                {event.booking.podcast_name}
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
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Next up</CardTitle>
                <CardDescription>Your upcoming recordings and releases.</CardDescription>
              </CardHeader>
              <CardContent>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing scheduled yet — new dates appear here as your team books them.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {upcoming.map((event) => {
                      const meta = eventKindMeta[event.kind]
                      return (
                        <li key={event.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(event.booking)}
                            className="flex w-full items-start gap-3 py-3 text-left first:pt-0 last:pb-0 hover:bg-muted/20"
                          >
                            <meta.icon className={`mt-0.5 h-4 w-4 shrink-0 ${event.kind === 'recording' ? 'text-violet-600' : 'text-emerald-600'}`} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{event.booking.podcast_name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {meta.label}{event.planned ? ' (planned)' : ''} · {displayDate(event.date)}
                              </span>
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
        )}
      </div>
      <BookingDetailDialog booking={selectedBooking} onOpenChange={(open) => { if (!open) setSelectedBooking(null) }} />
    </PortalLayout>
  )
}
