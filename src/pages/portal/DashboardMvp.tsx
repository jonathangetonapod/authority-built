import { useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  ExternalLink,
  Headphones,
  Loader2,
  MessageSquare,
  Mic2,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Star,
} from 'lucide-react'

import { BookingDetailDialog } from '@/components/portal/BookingDetailDialog'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import { safeExternalUrl } from '@/lib/externalUrl'
import { type PortalExperienceBooking } from '@/services/clientPortal'

const statusPresentation: Record<string, { label: string; className: string }> = {
  conversation_started: { label: 'In conversation', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  in_progress: { label: 'In progress', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  booked: { label: 'Booked', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  recorded: { label: 'Recorded', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  published: { label: 'Live', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
}

const bookingStatus = (status: string) =>
  statusPresentation[status] ?? { label: status.replace(/_/gu, ' '), className: 'bg-muted text-muted-foreground' }

const displayDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const bookingDate = (booking: PortalExperienceBooking) => {
  if (booking.status === 'published') {
    return booking.publish_date || booking.recording_date || booking.scheduled_date
  }
  if (booking.status === 'recorded') {
    return booking.recording_date || booking.scheduled_date || booking.publish_date
  }
  return booking.scheduled_date || booking.recording_date || booking.publish_date
}

const compactNumber = (value: number | null): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

const isUpcoming = (value: string | null): boolean => {
  if (!value) return false
  const date = new Date(`${value}T23:59:59`)
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now()
}

interface JourneyStat {
  label: string
  value: number
  icon: typeof Send
}

export default function PortalDashboardMvp() {
  const { client } = useClientPortal()
  const overviewQuery = usePortalExperience()
  const [detailBooking, setDetailBooking] = useState<PortalExperienceBooking | null>(null)

  const overview = overviewQuery.data ?? null
  const bookings = overview?.bookings ?? []
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled')
  const published = activeBookings.filter((booking) => booking.status === 'published')
  const upcomingRecordings = activeBookings
    .filter((booking) => ['conversation_started', 'in_progress', 'booked'].includes(booking.status))
    .filter((booking) => isUpcoming(booking.recording_date || booking.scheduled_date))
    .sort((a, b) => String(a.recording_date || a.scheduled_date).localeCompare(String(b.recording_date || b.scheduled_date)))
    .slice(0, 4)
  const upcomingReleases = activeBookings
    .filter((booking) => booking.status === 'recorded')
    .sort((a, b) => String(a.publish_date || '9999').localeCompare(String(b.publish_date || '9999')))
    .slice(0, 4)

  const review = overview?.review ?? null
  const outreach = overview?.outreach ?? null
  const pitchProfile = overview?.pitch_profile ?? null
  const mediaKitUrl = overview?.profile.media_kit_url ? safeExternalUrl(overview.profile.media_kit_url) : null

  const journeyStats: JourneyStat[] = outreach
    ? [
      { label: 'Podcasts contacted', value: outreach.podcasts_contacted, icon: Send },
      { label: 'Replies', value: outreach.replies, icon: MessageSquare },
      { label: 'Booked shows', value: activeBookings.filter((booking) => !['conversation_started', 'in_progress'].includes(booking.status)).length, icon: Mic2 },
      { label: 'Published episodes', value: published.length, icon: Radio },
    ]
    : [
      { label: 'Total placements', value: activeBookings.length, icon: Mic2 },
      { label: 'Upcoming / in progress', value: activeBookings.length - published.length, icon: CalendarDays },
      { label: 'Published episodes', value: published.length, icon: Radio },
    ]

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome{client?.name ? `, ${client.name.split(' ')[0]}` : ''}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {overview?.profile.dashboard_tagline || 'Here is where your podcast journey stands today.'}
            </p>
          </div>
          {mediaKitUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={mediaKitUrl} target="_blank" rel="noreferrer">
                <Download className="mr-2 h-4 w-4" />Your media kit
              </a>
            </Button>
          )}
        </div>

        {client?.dashboard_slug && review && review.awaiting_count > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  {review.awaiting_count === 1
                    ? '1 podcast is waiting for your review'
                    : `${review.awaiting_count} podcasts are waiting for your review`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Approve the shows you like and your team starts the outreach.
                  {review.approved_count > 0 ? ` You have approved ${review.approved_count} so far.` : ''}
                </p>
              </div>
              <Button asChild>
                <a href={`/client/${encodeURIComponent(client.dashboard_slug)}`}>
                  Review shortlist
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
        {client?.dashboard_slug && review && review.awaiting_count === 0 && review.total_visible > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Shortlist reviewed — {review.approved_count} approved. New shows appear here first.
            </p>
            <a className="font-medium text-primary hover:underline" href={`/client/${encodeURIComponent(client.dashboard_slug)}`}>
              Open your shortlist
            </a>
          </div>
        )}

        <div className={journeyStats.length === 4 ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4' : 'grid gap-4 sm:grid-cols-3'}>
          {journeyStats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <CardTitle className="text-3xl">{stat.value}</CardTitle>
              </CardHeader>
              <CardContent><stat.icon className="h-5 w-5 text-muted-foreground" /></CardContent>
            </Card>
          ))}
        </div>

        {(upcomingRecordings.length > 0 || upcomingReleases.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Mic2 className="h-4 w-4 text-muted-foreground" />Upcoming recordings</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingRecordings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing scheduled right now.</p>
                ) : (
                  <ul className="divide-y">
                    {upcomingRecordings.map((booking) => (
                      <li key={booking.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="min-w-0 truncate text-sm font-medium">{booking.podcast_name}</span>
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {displayDate(booking.recording_date || booking.scheduled_date) ?? 'Date coming'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Radio className="h-4 w-4 text-muted-foreground" />Upcoming episode releases</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingReleases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Recorded episodes appear here while they await release.</p>
                ) : (
                  <ul className="divide-y">
                    {upcomingReleases.map((booking) => (
                      <li key={booking.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="min-w-0 truncate text-sm font-medium">{booking.podcast_name}</span>
                        <span className="shrink-0 text-sm text-muted-foreground">
                          {displayDate(booking.publish_date) ?? 'Release date coming'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Podcast placements</CardTitle>
            <CardDescription>Every show on your journey, from first conversation to published episode.</CardDescription>
          </CardHeader>
          <CardContent>
            {overviewQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading your placements…
              </div>
            ) : overviewQuery.error ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">
                  We could not load your placements. Your session may have expired.
                </p>
                <Button variant="outline" onClick={() => overviewQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            ) : bookings.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Headphones className="h-9 w-9" />
                <p className="font-medium text-foreground">No placements yet</p>
                <p className="text-sm">Your placements will appear here as soon as your team books them.</p>
              </div>
            ) : (
              <div className="divide-y">
                {bookings.map((booking) => {
                  const status = bookingStatus(booking.status)
                  const podcastUrl = booking.podcast_url ? safeExternalUrl(booking.podcast_url) : null
                  const episodeUrl = booking.episode_url ? safeExternalUrl(booking.episode_url) : null
                  const audience = compactNumber(booking.audience_size)
                  const date = displayDate(bookingDate(booking))
                  return (
                    <div key={booking.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                      {booking.podcast_image_url ? (
                        <img
                          src={booking.podcast_image_url}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-lg border object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                          <Headphones className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {podcastUrl ? (
                            <a href={podcastUrl} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
                              {booking.podcast_name}
                            </a>
                          ) : (
                            <p className="truncate font-medium">{booking.podcast_name}</p>
                          )}
                          <Badge variant="outline" className={`shrink-0 ${status.className}`}>{status.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {[booking.host_name ? `Hosted by ${booking.host_name}` : null, date].filter(Boolean).join(' · ') || 'Details coming soon'}
                        </p>
                        {(audience || booking.itunes_rating) && (
                          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {audience && <span className="inline-flex items-center gap-1"><Headphones className="h-3 w-3" />{audience} listeners</span>}
                            {booking.itunes_rating && (
                              <span className="inline-flex items-center gap-1">
                                <Star className="h-3 w-3 text-amber-500" />{Number(booking.itunes_rating).toFixed(1)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2 self-center">
                        {episodeUrl && (
                          <Button asChild variant="outline" size="sm">
                            <a href={episodeUrl} target="_blank" rel="noreferrer">
                              Listen<ExternalLink className="ml-2 h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDetailBooking(booking)}>
                          Details
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {pitchProfile && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" />Your guest profile</CardTitle>
              <CardDescription>The approved story your team uses when pitching you to hosts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pitchProfile.professional_bio && (
                <p className="text-sm leading-6 text-foreground/90">{pitchProfile.professional_bio}</p>
              )}
              {pitchProfile.key_messages.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key messages</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {pitchProfile.key_messages.map((message) => (
                      <li key={message} className="rounded-full border bg-muted/20 px-3 py-1 text-xs">{message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pitchProfile.talking_points.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Talking points</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                    {pitchProfile.talking_points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <BookingDetailDialog booking={detailBooking} onOpenChange={(open) => { if (!open) setDetailBooking(null) }} />
    </PortalLayout>
  )
}
