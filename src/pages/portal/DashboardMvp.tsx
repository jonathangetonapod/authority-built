import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Switch } from '@/components/ui/switch'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import { safeExternalUrl } from '@/lib/externalUrl'
import { setPortalNotifications, type PortalExperienceBooking } from '@/services/clientPortal'

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

// Live within the window where it is still news: published, and recently.
const RECENTLY_LIVE_DAYS = 14
const isRecentlyLive = (value: string | null): boolean => {
  if (!value) return false
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const age = Date.now() - date.getTime()
  return age >= 0 && age <= RECENTLY_LIVE_DAYS * 24 * 60 * 60 * 1000
}

/*
 * Live first, then the pipeline in the order it resolves, cancelled last. The
 * server returns scheduled_date descending, which buries a published episode
 * whose scheduled date is months old under conversations that started
 * yesterday — the opposite of how a client scans this list.
 */
const STATUS_ORDER: Record<string, number> = {
  published: 0,
  recorded: 1,
  booked: 2,
  in_progress: 3,
  conversation_started: 4,
  cancelled: 5,
}

interface JourneyStat {
  label: string
  value: string
  icon: typeof Send
}

export default function PortalDashboardMvp() {
  const { client } = useClientPortal()
  const overviewQuery = usePortalExperience()
  const queryClient = useQueryClient()
  const [detailBooking, setDetailBooking] = useState<PortalExperienceBooking | null>(null)
  // Optimistic so the switch answers immediately; the refetch is the truth.
  const [emailUpdatesOverride, setEmailUpdatesOverride] = useState<boolean | null>(null)

  const notificationsMutation = useMutation({
    mutationFn: (enabled: boolean) => setPortalNotifications(client!.id, enabled),
    onMutate: (enabled) => setEmailUpdatesOverride(enabled),
    onSuccess: (enabled) => {
      toast.success(enabled ? 'Email updates are on.' : 'Email updates are off.')
      // Drop the optimistic override so the refetched server value becomes the
      // source of truth; leaving it set made the switch keep showing this
      // session's local choice even after the real value changed.
      setEmailUpdatesOverride(null)
      queryClient.invalidateQueries({ queryKey: ['portal-experience', client?.id] })
    },
    onError: (error) => {
      setEmailUpdatesOverride(null)
      toast.error(error instanceof Error ? error.message : 'That setting could not be saved.')
    },
  })

  const overview = overviewQuery.data ?? null
  const bookings = overview?.bookings ?? []
  const sortedBookings = [...bookings].sort((a, b) => {
    const rank = (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
    if (rank !== 0) return rank
    // Newest movement first within a stage; date-less rows sink.
    return String(bookingDate(b) || '0000').localeCompare(String(bookingDate(a) || '0000'))
  })
  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled')
  const published = activeBookings.filter((booking) => booking.status === 'published')
  /*
   * A confirmed booking without a date yet is the most reassuring thing this
   * panel can show, and requiring an upcoming date dropped exactly those rows.
   * Confirmed-but-undated shows sit after the dated ones as "Date coming";
   * unconfirmed conversations still need a real upcoming date to appear.
   */
  const upcomingRecordings = activeBookings
    .filter((booking) => ['conversation_started', 'in_progress', 'booked'].includes(booking.status))
    .filter((booking) => (
      isUpcoming(booking.recording_date || booking.scheduled_date)
      || (booking.status === 'booked' && !booking.recording_date && !booking.scheduled_date)
    ))
    .sort((a, b) => String(a.recording_date || a.scheduled_date || '9999').localeCompare(String(b.recording_date || b.scheduled_date || '9999')))
    .slice(0, 4)
  /*
   * A published row whose date is still ahead is an episode awaiting release,
   * whatever its status field says — entered ahead of air date, it appeared
   * nowhere but the flat list, wearing a "Live" badge beside a future date.
   * It belongs here with the recorded ones until the date arrives.
   */
  const upcomingReleases = activeBookings
    .filter((booking) => (
      booking.status === 'recorded'
      || (booking.status === 'published' && Boolean(booking.publish_date) && !isRecentlyLive(booking.publish_date) && isUpcoming(booking.publish_date))
    ))
    .filter((booking) => !booking.publish_date || isUpcoming(booking.publish_date))
    .sort((a, b) => String(a.publish_date || '9999').localeCompare(String(b.publish_date || '9999')))
    .slice(0, 4)

  // Undefined until the overview loads — the switch must not assert ON for a
  // client whose notifications are actually off during the load window.
  const emailUpdates = emailUpdatesOverride
    ?? (overview ? overview.profile.notifications_enabled !== false : false)

  const review = overview?.review ?? null
  const outreach = overview?.outreach ?? null
  const pitchProfile = overview?.pitch_profile ?? null
  const mediaKitUrl = overview?.profile.media_kit_url ? safeExternalUrl(overview.profile.media_kit_url) : null

  /*
   * The value story, not just the activity story. The counts say how busy the
   * team has been; the combined audience of the shows actually secured says
   * what it was worth, and it is the number a client repeats to other people.
   * Confirmed shows only — a conversation is not yet reach.
   */
  const securedBookings = activeBookings.filter((booking) => !['conversation_started', 'in_progress'].includes(booking.status))
  const combinedAudience = compactNumber(
    securedBookings.reduce((total, booking) => total + (
      typeof booking.audience_size === 'number' && Number.isFinite(booking.audience_size) && booking.audience_size > 0
        ? booking.audience_size
        : 0
    ), 0),
  )

  const latestLive = published
    .filter((booking) => isRecentlyLive(booking.publish_date))
    .sort((a, b) => String(b.publish_date).localeCompare(String(a.publish_date)))[0] ?? null
  const latestLiveEpisodeUrl = latestLive?.episode_url ? safeExternalUrl(latestLive.episode_url) : null

  const journeyStats: JourneyStat[] = [
    ...(outreach
      ? [
        { label: 'Podcasts contacted', value: String(outreach.podcasts_contacted), icon: Send },
        { label: 'Replies', value: String(outreach.replies), icon: MessageSquare },
        { label: 'Shows secured', value: String(securedBookings.length), icon: Mic2 },
        { label: 'Published episodes', value: String(published.length), icon: Radio },
      ]
      : [
        { label: 'Total placements', value: String(activeBookings.length), icon: Mic2 },
        { label: 'Upcoming / in progress', value: String(activeBookings.length - published.length), icon: CalendarDays },
        { label: 'Published episodes', value: String(published.length), icon: Radio },
      ]),
    ...(combinedAudience
      ? [{ label: 'Combined audience', value: combinedAudience, icon: Headphones }]
      : []),
  ]
  const statsGridClass = {
    3: 'grid gap-4 sm:grid-cols-3',
    4: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-5',
  }[journeyStats.length] ?? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'

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

        {/* A failed background refresh over data already on screen. One banner
            saying exactly that, instead of live-looking panels contradicted by
            a session-expired card halfway down the page. */}
        {overviewQuery.isError && overview && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <p>This page could not refresh — you are looking at earlier data. If this keeps happening, sign in again.</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void overviewQuery.refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />Try again
            </Button>
          </div>
        )}

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

        {/* The moment this whole service works toward, while it is still news.
            Quiet on purpose: artwork, the fact, and the two things a client
            actually does with a live episode — listen to it and send it on. */}
        {latestLive && (
          <Card className="border-emerald-200/70 bg-emerald-50/40">
            <CardContent className="flex flex-wrap items-center gap-4 p-5">
              {latestLive.podcast_image_url ? (
                <img src={latestLive.podcast_image_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl border object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border bg-background">
                  <Radio className="h-6 w-6 text-emerald-700" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">New episode live</p>
                <p className="mt-0.5 truncate text-lg font-semibold">{latestLive.podcast_name}</p>
                <p className="text-sm text-muted-foreground">
                  {[latestLive.host_name ? `Hosted by ${latestLive.host_name}` : null, displayDate(latestLive.publish_date)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {latestLiveEpisodeUrl && (
                  <>
                    <Button asChild size="sm">
                      <a href={latestLiveEpisodeUrl} target="_blank" rel="noreferrer">
                        <Headphones className="mr-2 h-4 w-4" />Listen
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        /*
                         * Guarded, because portal links get opened in in-app
                         * browsers that lack the clipboard API even over
                         * https — and the property access throws before any
                         * .then could catch it, leaving the tap with no
                         * feedback at all.
                         */
                        if (!navigator.clipboard?.writeText) {
                          toast.error('Copying is blocked in this browser — open the episode with Listen and share from there.')
                          return
                        }
                        navigator.clipboard.writeText(latestLiveEpisodeUrl).then(
                          () => toast.success('Episode link copied — share it anywhere.'),
                          () => toast.error('The link could not be copied.'),
                        )
                      }}
                    >
                      Copy link
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDetailBooking(latestLive)}>Details</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Only once there is data to summarize. Rendered unconditionally,
            these tiles asserted "0" of everything during loading and kept
            asserting it after a failed fetch — a confidently wrong dashboard
            above an error card that said the numbers could not be loaded. */}
        {overview && (
        <div className={statsGridClass}>
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
        )}

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
                    {/* Edge trimming lives on the li, aimed at the button:
                        first:/last: on the button itself resolved against its
                        own li — where it is always the only child — so every
                        row lost its padding, not just the edges. */}
                    {upcomingRecordings.map((booking) => (
                      <li key={booking.id} className="[&:first-child>button]:pt-0 [&:last-child>button]:pb-0">
                        {/* The job before a recording is prep, and prep lives in
                            the details — a row that only stated the date left
                            the useful part unreachable from here. */}
                        <button
                          type="button"
                          onClick={() => setDetailBooking(booking)}
                          className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-primary"
                        >
                          <span className="min-w-0 truncate text-sm font-medium">{booking.podcast_name}</span>
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {displayDate(booking.recording_date || booking.scheduled_date) ?? 'Date coming'}
                          </span>
                        </button>
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
                      <li key={booking.id} className="[&:first-child>button]:pt-0 [&:last-child>button]:pb-0">
                        <button
                          type="button"
                          onClick={() => setDetailBooking(booking)}
                          className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-primary"
                        >
                          <span className="min-w-0 truncate text-sm font-medium">{booking.podcast_name}</span>
                          <span className="shrink-0 text-sm text-muted-foreground">
                            {displayDate(booking.publish_date) ?? 'Release date coming'}
                          </span>
                        </button>
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
            {/* The error card only when there is nothing better to show: a
                background refresh failing after data loaded used to put "your
                session may have expired" under panels still rendering the
                stale data — the banner above owns that state now. */}
            {overviewQuery.isLoading && !overview ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading your placements…
              </div>
            ) : overviewQuery.error && !overview ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">
                  We couldn’t load your placements right now. Try again in a moment, or sign in again if it keeps happening.
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
                {sortedBookings.map((booking) => {
                  // "Live" next to a future date contradicts itself; until the
                  // date arrives the honest label is that it is coming.
                  const goesLiveSoon = booking.status === 'published'
                    && Boolean(booking.publish_date)
                    && !isRecentlyLive(booking.publish_date)
                    && isUpcoming(booking.publish_date)
                  const status = goesLiveSoon
                    ? { label: 'Goes live soon', className: 'bg-violet-50 text-violet-700 border-violet-200' }
                    : bookingStatus(booking.status)
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
                    {pitchProfile.key_messages.map((message, index) => (
                      <li key={`${index}-${message.slice(0, 40)}`} className="rounded-full border bg-muted/20 px-3 py-1 text-xs">{message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pitchProfile.talking_points.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Talking points</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                    {pitchProfile.talking_points.map((point, index) => <li key={`${index}-${point.slice(0, 40)}`}>{point}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <p className="text-sm font-medium">Email updates</p>
              <p className="text-sm text-muted-foreground">
                We email you when new shows are ready to review, a recording is booked, and an episode goes live.
              </p>
            </div>
            <Switch
              checked={emailUpdates}
              disabled={notificationsMutation.isPending || !client?.id || !overview}
              onCheckedChange={(next) => notificationsMutation.mutate(next)}
              aria-label="Email updates"
            />
          </CardContent>
        </Card>
      </div>
      {/* onRemoved, as the Calendar page already does: without the refetch a
          removed event stayed on screen for the staleTime window, reopenable
          and offering a second "successful" delete of a row already gone. */}
      <BookingDetailDialog
        booking={detailBooking}
        onOpenChange={(open) => { if (!open) setDetailBooking(null) }}
        onRemoved={() => void overviewQuery.refetch()}
      />
    </PortalLayout>
  )
}
