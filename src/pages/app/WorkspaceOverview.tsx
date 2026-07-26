import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  Inbox,
  ListChecks,
  Loader2,
  Mailbox,
  Megaphone,
  Mic2,
  Radio,
  Search,
  Send,
  Settings,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
  workspaceModuleHref,
  type WorkspaceModule,
} from '@/lib/workspaceRoutes'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceCampaignOverview } from '@/services/workspaceCampaigns'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastSystemItem,
} from '@/services/clientPodcastSystem'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceOverviewProps {
  platformWorkspaceId?: string
}

const moduleLinks: Array<{ module: WorkspaceModule; name: string; icon: typeof Users }> = [
  { module: 'clients', name: 'Clients', icon: Users },
  { module: 'client-podcast-system', name: 'Command Center', icon: ListChecks },
  { module: 'podcast-finder', name: 'Podcast Finder', icon: Search },
  { module: 'podcast-database', name: 'Podcast Database', icon: Database },
  { module: 'client-campaigns', name: 'Campaigns', icon: Megaphone },
  { module: 'master-inbox', name: 'Master Inbox', icon: Inbox },
  { module: 'mailboxes', name: 'Mailboxes', icon: Mailbox },
  { module: 'onboarding', name: 'Onboarding', icon: ClipboardList },
  { module: 'guest-resources', name: 'Guest Resources', icon: BookOpen },
  { module: 'settings', name: 'Settings', icon: Settings },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function localDate(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function shortDay(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

function relativeTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function StatCard({ icon: Icon, label, value, tone, href }: {
  icon: typeof Users
  label: string
  value: number
  tone: 'alert' | 'work' | 'calm'
  href: string
}) {
  const toneClasses = tone === 'alert' && value > 0
    ? 'border-amber-200 bg-amber-50/70'
    : tone === 'work'
      ? 'border-primary/15 bg-primary/[0.03]'
      : ''
  return (
    <Link to={href} className={`group rounded-2xl border p-4 transition-colors hover:border-primary/40 ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${tone === 'alert' && value > 0 ? 'text-amber-700' : 'text-muted-foreground'}`} />
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Link>
  )
}

const WorkspaceOverview = ({ platformWorkspaceId }: WorkspaceOverviewProps) => {
  const { isPlatformAdmin, user, workspace } = useAuth()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isSelectedWorkspace = platformWorkspaceId !== undefined
  const validSelectedWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'overview'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isSelectedWorkspace && validSelectedWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  const effectiveWorkspace = isSelectedWorkspace
    ? selectedWorkspaceQuery.data?.workspace || null
    : workspace
  const baseHref = isSelectedWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const effectiveWorkspaceId = (effectiveWorkspace?.id || '').toLowerCase()

  const systemQuery = useQuery({
    queryKey: [
      isSelectedWorkspace ? 'platform' : 'tenant',
      user?.id || 'unknown',
      effectiveWorkspaceId,
      'overview-system',
    ],
    queryFn: () => getWorkspaceClientPodcastSystem(effectiveWorkspaceId),
    enabled: UUID_PATTERN.test(effectiveWorkspaceId),
    retry: false,
    staleTime: 30_000,
  })
  const system = systemQuery.data

  // Setup cliffs surfaced before the owner hits them mid-flow. Both queries
  // fail quietly for viewers who lack access to them.
  const integrationQuery = useQuery({
    queryKey: ['overview-setup-instantly', effectiveWorkspaceId],
    queryFn: () => getWorkspaceCampaignOverview(effectiveWorkspaceId),
    enabled: UUID_PATTERN.test(effectiveWorkspaceId),
    retry: false,
    staleTime: 60_000,
  })
  const billingQuery = useQuery({
    queryKey: ['overview-setup-billing', effectiveWorkspaceId],
    queryFn: () => getWorkspaceBillingOverview(effectiveWorkspaceId),
    enabled: UUID_PATTERN.test(effectiveWorkspaceId),
    retry: false,
    staleTime: 60_000,
  })
  const setupItems: Array<{ id: string; title: string; detail: string; href: string; cta: string }> = []
  if (integrationQuery.data && !integrationQuery.data.integration?.connected) {
    setupItems.push({
      id: 'instantly',
      title: 'Connect Instantly',
      detail: 'Outreach sending and the direct-email waterfall both need your Instantly account.',
      href: workspaceModuleHref(baseHref, 'client-campaigns'),
      cta: 'Connect',
    })
  }
  if (billingQuery.data?.enforcement_enabled && billingQuery.data.balance < 5) {
    setupItems.push({
      id: 'credits',
      title: billingQuery.data.balance <= 0 ? 'Out of credits' : `Only ${billingQuery.data.balance} credits left`,
      detail: 'Research runs, email unlocks, and scans stop when the balance hits zero.',
      href: `${baseHref}/settings/billing`,
      cta: 'Top up',
    })
  }

  const today = localDate()
  const weekEnd = localDate(7)

  const nextActions = useMemo(() => {
    const items = system?.items ?? []
    return items
      .filter((item) => !item.terminal && (item.has_conflict || item.next_action))
      .sort((left, right) => Number(right.has_conflict) - Number(left.has_conflict))
      .slice(0, 6)
  }, [system?.items])

  const weekEvents = useMemo(() => {
    const items = system?.items ?? []
    const events: Array<{ id: string; date: string; kind: 'recording' | 'publication'; item: ClientPodcastSystemItem }> = []
    for (const item of items) {
      if (item.booking?.recording_date && item.booking.recording_date >= today && item.booking.recording_date <= weekEnd) {
        events.push({ id: `${item.id}:rec`, date: item.booking.recording_date, kind: 'recording', item })
      }
      if (item.booking?.publish_date && item.booking.publish_date >= today && item.booking.publish_date <= weekEnd) {
        events.push({ id: `${item.id}:pub`, date: item.booking.publish_date, kind: 'publication', item })
      }
    }
    return events.sort((left, right) => left.date.localeCompare(right.date)).slice(0, 6)
  }, [system?.items, today, weekEnd])

  const recentItems = useMemo(() => (
    [...(system?.items ?? [])]
      .filter((item) => item.last_activity_at)
      .sort((left, right) => (right.last_activity_at || '').localeCompare(left.last_activity_at || ''))
      .slice(0, 5)
  ), [system?.items])

  const moduleBadges = useMemo(() => {
    const items = system?.items ?? []
    const clients = system?.clients ?? []
    const activeCampaigns = items.filter((item) => !item.terminal && item.campaign && !['failed'].includes(item.campaign.status)).length
    const replies = items.reduce((sum, item) => sum + (item.campaign?.reply_count ?? 0), 0)
    return {
      clients: clients.length,
      'client-podcast-system': system?.summary.needs_attention ?? 0,
      'client-campaigns': activeCampaigns,
      'master-inbox': replies,
    } as Partial<Record<WorkspaceModule, number>>
  }, [system])

  const platformWorkspace: PlatformWorkspaceConfig | undefined = isSelectedWorkspace
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          effectiveWorkspace?.id,
          effectiveWorkspace?.logo_path,
          effectiveWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  if (isSelectedWorkspace && selectedWorkspaceQuery.isLoading && validSelectedWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </WorkspaceLayout>
    )
  }

  const unavailable = isSelectedWorkspace
    ? !validSelectedWorkspaceId || selectedWorkspaceQuery.error || !effectiveWorkspace
    : !effectiveWorkspace
  if (unavailable) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>
              {selectedWorkspaceQuery.error instanceof Error
                ? selectedWorkspaceQuery.error.message
                : 'This workspace could not be loaded.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  const heading = isPlatformAdmin && !isSelectedWorkspace && effectiveWorkspace.is_default
    ? 'My Workspace'
    : effectiveWorkspace.name
  const summary = system?.summary
  const inMotion = (summary?.stage_counts.outreach ?? 0) + (summary?.stage_counts.conversation ?? 0)
  const commandCenterHref = workspaceModuleHref(baseHref, 'client-podcast-system')

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">{greeting()}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
          </p>
        </div>

        {systemQuery.isLoading ? (
          <Card>
            <CardContent className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />Pulling today's priorities…
            </CardContent>
          </Card>
        ) : system && system.clients.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <h2 className="mt-4 text-xl font-semibold">Add your first client to get started</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Once a client is in the workspace, this page becomes your daily queue: decisions waiting,
                recordings coming up, and outreach that needs a push.
              </p>
              <Button asChild className="mt-5">
                <Link to={workspaceModuleHref(baseHref, 'clients')}>Open Clients<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </CardContent>
          </Card>
        ) : system ? (
          <>
            {setupItems.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-amber-950">Finish setting up</CardTitle>
                  <CardDescription className="text-amber-900/75">These will block the pitch flow if left for later.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {setupItems.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-background px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.detail}</p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-300">
                          <Link to={item.href}>{item.cta}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            <section aria-label="Today at a glance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={AlertCircle} label="Need attention" value={summary?.needs_attention ?? 0} tone="alert" href={commandCenterHref} />
              <StatCard icon={ListChecks} label="Awaiting client review" value={summary?.stage_counts.awaiting_review ?? 0} tone="work" href={commandCenterHref} />
              <StatCard icon={Mic2} label="Recordings & releases this week" value={weekEvents.length} tone="calm" href={commandCenterHref} />
              <StatCard icon={Send} label="In outreach & conversations" value={inMotion} tone="calm" href={workspaceModuleHref(baseHref, 'client-campaigns')} />
            </section>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Next actions</CardTitle>
                <CardDescription>The work most likely to move a placement forward today.</CardDescription>
              </CardHeader>
              <CardContent>
                {nextActions.length === 0 ? (
                  <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed text-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                    <p className="mt-2 text-sm font-medium">All caught up</p>
                    <p className="text-xs text-muted-foreground">No pending decisions or follow-ups right now.</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {nextActions.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={`${commandCenterHref}?client=${encodeURIComponent(item.client.id)}`}
                          className="flex items-center gap-3 py-3 hover:bg-muted/30"
                        >
                          {item.has_conflict
                            ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.client.name} · {item.podcast.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.has_conflict ? 'History conflict — review before acting' : item.next_action}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-4 w-4" />This week</CardTitle>
                  <CardDescription>Confirmed recordings and episode releases.</CardDescription>
                </CardHeader>
                <CardContent>
                  {weekEvents.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Nothing scheduled in the next 7 days.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {weekEvents.map((event) => (
                        <li key={event.id}>
                          <Link to={`${commandCenterHref}?client=${encodeURIComponent(event.item.client.id)}`} className="flex items-center gap-3 rounded-xl border p-3 hover:border-primary/40">
                            <div className={`rounded-lg p-2 ${event.kind === 'recording' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                              {event.kind === 'recording' ? <Mic2 className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{event.item.client.name} · {event.item.podcast.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {event.kind === 'recording' ? 'Recording' : 'Goes live'} · {shortDay(event.date)}
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent activity</CardTitle>
                  <CardDescription>Latest movement across shortlists, campaigns, and bookings.</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                      Activity will appear here as work happens.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {recentItems.map((item) => (
                        <li key={item.id}>
                          <Link
                            to={`${commandCenterHref}?client=${encodeURIComponent(item.client.id)}`}
                            className="flex items-center gap-3 py-2.5 hover:bg-muted/30"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">{item.client.name} · {item.podcast.name}</p>
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(item.last_activity_at)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : systemQuery.error ? (
          <Card>
            <CardContent className="flex min-h-32 items-center justify-center text-sm text-muted-foreground">
              Today's priorities could not be loaded. The modules below still work.
            </CardContent>
          </Card>
        ) : null}

        <section aria-label="Workspace modules">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {moduleLinks.map((item) => {
              const Icon = item.icon
              const badge = moduleBadges[item.module]
              return (
                <Link
                  key={item.module}
                  to={workspaceModuleHref(baseHref, item.module)}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {typeof badge === 'number' && badge > 0 && (
                    <Badge
                      variant="outline"
                      className={item.module === 'client-podcast-system'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'text-muted-foreground'}
                    >
                      {badge}
                    </Badge>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOverview
