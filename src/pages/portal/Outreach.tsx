import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CheckCircle2, Headphones, Loader2, Mail, MessageSquare, RefreshCw, Send } from 'lucide-react'

import { PortalLayout } from '@/components/portal/PortalLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import type { PortalOutreachTarget } from '@/services/clientPortal'

// Chart hues validated with the dataviz palette checker (light surface).
const MESSAGES_COLOR = '#4F46E5'
const EPISODES_COLOR = '#059669'

const stageMeta: Record<PortalOutreachTarget['stage'], { label: string; className: string }> = {
  preparing: { label: 'Preparing outreach', className: 'bg-muted text-muted-foreground' },
  contacted: { label: 'Message sent', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  replied: { label: 'Host replied', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  completed: { label: 'Conversation done', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
}

const displayDate = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface MonthBucket {
  key: string
  label: string
  count: number
}

const lastMonths = (count: number): MonthBucket[] => {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    }
  })
}

const bucketByMonth = (dates: Array<string | null>, months: number): MonthBucket[] => {
  const buckets = lastMonths(months)
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const value of dates) {
    if (!value) continue
    // Bucket in the viewer's local calendar — the bucket keys are local
    // months, so slicing the UTC ISO string would misplace boundary events.
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) continue
    const bucket = byKey.get(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
    if (bucket) bucket.count += 1
  }
  return buckets
}

interface PipelineRow {
  label: string
  count: number
}

export default function PortalOutreach() {
  const overviewQuery = usePortalExperience()
  const [showAllTargets, setShowAllTargets] = useState(false)

  const overview = overviewQuery.data ?? null
  const targets = useMemo(() => overview?.outreach_targets ?? [], [overview])
  const summary = overview?.outreach ?? null
  const bookings = useMemo(
    () => (overview?.bookings ?? []).filter((booking) => booking.status !== 'cancelled'),
    [overview],
  )

  const messagesByMonth = useMemo(
    () => bucketByMonth(targets.map((target) => target.first_message_at), 6),
    [targets],
  )
  const episodesByMonth = useMemo(
    () => bucketByMonth(
      bookings.filter((booking) => booking.status === 'published').map((booking) => booking.publish_date),
      6,
    ),
    [bookings],
  )
  const hasMessageData = messagesByMonth.some((bucket) => bucket.count > 0)
  const hasEpisodeData = episodesByMonth.some((bucket) => bucket.count > 0)

  const pipeline: PipelineRow[] = useMemo(() => {
    const stageCount = (stage: PortalOutreachTarget['stage']) => targets.filter((target) => target.stage === stage).length
    const bookingCount = (statuses: string[]) => bookings.filter((booking) => statuses.includes(booking.status)).length
    return [
      { label: 'Preparing outreach', count: stageCount('preparing') },
      { label: 'Message sent', count: stageCount('contacted') },
      { label: 'Host replied', count: stageCount('replied') + stageCount('completed') },
      { label: 'In conversation', count: bookingCount(['conversation_started', 'in_progress']) },
      { label: 'Booked', count: bookingCount(['booked']) },
      { label: 'Recorded', count: bookingCount(['recorded']) },
      { label: 'Published', count: bookingCount(['published']) },
    ]
  }, [targets, bookings])
  const pipelineMax = Math.max(1, ...pipeline.map((row) => row.count))
  const pipelineHasData = pipeline.some((row) => row.count > 0)

  const visibleTargets = showAllTargets ? targets : targets.slice(0, 8)

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Outreach & insights</h1>
          <p className="mt-1 text-muted-foreground">
            Every show your team has messaged for you, and how the conversations are going.
          </p>
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading your outreach…
          </div>
        ) : overviewQuery.error ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive">We couldn’t load your outreach right now. Try again in a moment, or sign in again if it keeps happening.</p>
            <Button variant="outline" onClick={() => overviewQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Podcasts contacted', value: summary.podcasts_contacted, icon: Send },
                  { label: 'Emails sent', value: summary.emails_sent, icon: Mail },
                  { label: 'Replies', value: summary.replies, icon: MessageSquare },
                  { label: 'Meetings booked', value: summary.meetings_booked, icon: CheckCircle2 },
                ].map((stat) => (
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

            <Card>
              <CardHeader>
                <CardTitle>Where everything stands</CardTitle>
                <CardDescription>Your placement pipeline right now, from first message to published episode.</CardDescription>
              </CardHeader>
              <CardContent>
                {!pipelineHasData ? (
                  <p className="text-sm text-muted-foreground">
                    Your pipeline fills in as soon as your team starts outreach for approved shows.
                  </p>
                ) : (
                  <ul className="space-y-2.5" aria-label="Placement pipeline">
                    {pipeline.map((row) => (
                      <li key={row.label} className="grid grid-cols-[9.5rem,1fr,2rem] items-center gap-3">
                        <span className="text-sm text-muted-foreground">{row.label}</span>
                        <span className="h-4 overflow-hidden rounded-sm bg-muted/40">
                          <span
                            className="block h-full rounded-sm bg-primary/80"
                            style={{ width: `${(row.count / pipelineMax) * 100}%` }}
                          />
                        </span>
                        <span className="text-right text-sm font-semibold tabular-nums">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Messages sent by month</CardTitle>
                  <CardDescription>First outreach messages that went out for you.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!hasMessageData ? (
                    <p className="text-sm text-muted-foreground">No messages sent in the last six months.</p>
                  ) : (
                    <div className="h-44" role="img" aria-label="Bar chart of outreach messages sent per month">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={messagesByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} formatter={(value: number) => [value, 'Messages']} />
                          <Bar dataKey="count" fill={MESSAGES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Episodes live by month</CardTitle>
                  <CardDescription>Your appearances that went live.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!hasEpisodeData ? (
                    <p className="text-sm text-muted-foreground">No episodes published in the last six months.</p>
                  ) : (
                    <div className="h-44" role="img" aria-label="Bar chart of published episodes per month">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={episodesByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }} formatter={(value: number) => [value, 'Episodes']} />
                          <Bar dataKey="count" fill={EPISODES_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Outreach activity</CardTitle>
                <CardDescription>Show by show — when the message went out and what happened next.</CardDescription>
              </CardHeader>
              <CardContent>
                {targets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Outreach activity appears here once your team starts contacting the shows you approved.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y">
                      {visibleTargets.map((target) => {
                        const meta = stageMeta[target.stage]
                        const sent = displayDate(target.first_message_at)
                        const activity = displayDate(target.last_activity_at)
                        return (
                          <li key={target.id} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                            {target.podcast_image_url ? (
                              <img src={target.podcast_image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                                <Headphones className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate font-medium">{target.podcast_name}</p>
                                <Badge variant="outline" className={`shrink-0 ${meta.className}`}>{meta.label}</Badge>
                              </div>
                              <p className="mt-0.5 text-sm text-muted-foreground">
                                {sent ? `First message sent ${sent}` : 'Your personalized pitch is being prepared'}
                                {activity && activity !== sent ? ` · Latest activity ${activity}` : ''}
                              </p>
                            </div>
                            {(target.opens > 0 || target.replies > 0) && (
                              <p className="shrink-0 self-center text-xs text-muted-foreground">
                                {target.opens > 0 ? `${target.opens} open${target.opens === 1 ? '' : 's'}` : ''}
                                {target.opens > 0 && target.replies > 0 ? ' · ' : ''}
                                {target.replies > 0 ? `${target.replies} repl${target.replies === 1 ? 'y' : 'ies'}` : ''}
                              </p>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                    {targets.length > visibleTargets.length && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAllTargets(true)}>
                        Show all {targets.length}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PortalLayout>
  )
}
