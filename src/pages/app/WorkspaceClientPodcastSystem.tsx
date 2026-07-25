import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  ListChecks,
  Loader2,
  Mail,
  Megaphone,
  Mic2,
  Radio,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { safeExternalUrl } from '@/lib/externalUrl'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastLifecycleOutcome,
  type ClientPodcastLifecycleStage,
  type ClientPodcastSystemItem,
} from '@/services/clientPodcastSystem'

interface WorkspaceClientPodcastSystemProps {
  platformWorkspaceId?: string
}

type PageView = 'work-queue' | 'pipeline' | 'calendar' | 'completed'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAGE_SIZE = 50

const stageMeta: Record<ClientPodcastLifecycleStage, {
  label: string
  shortLabel: string
  description: string
  className: string
}> = {
  awaiting_review: {
    label: 'Awaiting client review',
    shortLabel: 'Awaiting review',
    description: 'The client has not made a decision yet.',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  approved: {
    label: 'Client approved',
    shortLabel: 'Approved',
    description: 'Approved and ready for campaign preparation.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  contact_needed: {
    label: 'Contact needed',
    shortLabel: 'Needs contact',
    description: 'The campaign target needs a usable contact.',
    className: 'border-orange-200 bg-orange-50 text-orange-800',
  },
  research_needed: {
    label: 'Research or pitch needed',
    shortLabel: 'Needs research',
    description: 'The contact exists, but the pitch package is not ready.',
    className: 'border-sky-200 bg-sky-50 text-sky-800',
  },
  ready: {
    label: 'Ready to launch',
    shortLabel: 'Ready',
    description: 'The reviewed campaign package is ready to send.',
    className: 'border-violet-200 bg-violet-50 text-violet-800',
  },
  outreach: {
    label: 'In outreach',
    shortLabel: 'Outreach',
    description: 'Outreach has started or is being followed up.',
    className: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  },
  conversation: {
    label: 'Active conversation',
    shortLabel: 'Conversation',
    description: 'A reply or scheduling conversation needs attention.',
    className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
  },
  booked: {
    label: 'Booked',
    shortLabel: 'Booked',
    description: 'The appearance is confirmed and needs delivery prep.',
    className: 'border-green-200 bg-green-50 text-green-800',
  },
  recorded: {
    label: 'Recorded',
    shortLabel: 'Recorded',
    description: 'The interview is recorded and awaiting publication.',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  published: {
    label: 'Published',
    shortLabel: 'Published',
    description: 'The episode is live.',
    className: 'border-purple-200 bg-purple-50 text-purple-800',
  },
}

const outcomeMeta: Record<Exclude<ClientPodcastLifecycleOutcome, null>, { label: string; className: string }> = {
  rejected: { label: 'Client passed', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  cancelled: { label: 'Cancelled', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  archived: { label: 'Archived', className: 'border-slate-200 bg-slate-50 text-slate-700' },
}

const pipelineColumns: Array<{
  id: string
  title: string
  description: string
  stages: ClientPodcastLifecycleStage[]
}> = [
  { id: 'review', title: 'Client review', description: 'Selection and client decision', stages: ['awaiting_review', 'approved'] },
  { id: 'prepare', title: 'Prepare', description: 'Contact, research, and pitch', stages: ['contact_needed', 'research_needed'] },
  { id: 'ready', title: 'Ready', description: 'Reviewed and launchable', stages: ['ready'] },
  { id: 'outreach', title: 'Outreach', description: 'Live sequences and follow-ups', stages: ['outreach'] },
  { id: 'conversation', title: 'Conversation', description: 'Replies and scheduling', stages: ['conversation'] },
  { id: 'delivery', title: 'Delivery', description: 'Booked through publication', stages: ['booked', 'recorded'] },
]

function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formattedDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return 'Not set'
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'UTC',
  }).format(date)
}

function StageBadge({ stage }: { stage: ClientPodcastLifecycleStage }) {
  const meta = stageMeta[stage]
  return <Badge variant="outline" className={meta.className}>{meta.shortLabel}</Badge>
}

function OutcomeBadge({ outcome }: { outcome: ClientPodcastLifecycleOutcome }) {
  if (!outcome) return null
  const meta = outcomeMeta[outcome]
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
}

function contactLabel(item: ClientPodcastSystemItem): string {
  if (item.contact.source === 'direct') return 'Verified direct'
  if (item.contact.source === 'podscan') return 'Free Podscan'
  if (item.contact.source === 'campaign') return 'Campaign contact'
  return 'No email'
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClassName,
}: {
  icon: typeof Clock3
  label: string
  value: number
  detail: string
  iconClassName: string
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${iconClassName}`}><Icon className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  )
}

function PodcastIdentity({ item }: { item: ClientPodcastSystemItem }) {
  const imageUrl = safeExternalUrl(item.podcast.image_url)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-10 w-10 shrink-0 rounded-lg border">
        {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
        <AvatarFallback className="rounded-lg text-xs">{initials(item.podcast.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{item.podcast.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.podcast.host_name || item.podcast.publisher_name || 'Host not identified'}</p>
      </div>
    </div>
  )
}

function OpportunityTable({
  items,
  baseHref,
  onOpen,
}: {
  items: ClientPodcastSystemItem[]
  baseHref: string
  onOpen: (item: ClientPodcastSystemItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <ListChecks className="h-9 w-9 text-muted-foreground/50" />
        <p className="mt-3 font-medium">No podcast opportunities match these filters</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Try another client or stage, or add podcasts through Podcast Finder.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-64">Podcast</TableHead>
            <TableHead className="min-w-44">Client</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead className="min-w-56">Next action</TableHead>
            <TableHead>Last activity</TableHead>
            <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={item.has_conflict ? 'bg-amber-50/40' : undefined}>
              <TableCell><PodcastIdentity item={item} /></TableCell>
              <TableCell>
                <Link to={`${baseHref}/clients/${encodeURIComponent(item.client.id)}`} className="font-medium hover:text-primary hover:underline">{item.client.name}</Link>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">{item.client.status}</p>
              </TableCell>
              <TableCell>
                <div className="flex max-w-44 flex-wrap gap-1.5">
                  <StageBadge stage={item.stage} />
                  <OutcomeBadge outcome={item.outcome} />
                  {item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Check history</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-sm">
                  <Mail className={`h-3.5 w-3.5 ${item.contact.available ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                  <span>{contactLabel(item)}</span>
                </div>
              </TableCell>
              <TableCell><p className="text-sm">{item.next_action || 'No action required'}</p>{item.campaign?.last_error && <p className="mt-1 max-w-64 truncate text-xs text-destructive">{item.campaign.last_error}</p>}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formattedDate(item.last_activity_at)}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="ghost" size="sm" onClick={() => onOpen(item)}>Open<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex flex-col items-center justify-between gap-3 rounded-xl border p-3 sm:flex-row">
      <p className="text-sm text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</Button>
        <Button type="button" variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Next</Button>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0"><span className="text-sm text-muted-foreground">{label}</span><div className="max-w-[65%] text-right text-sm font-medium">{value}</div></div>
}

const WorkspaceClientPodcastSystem = ({ platformWorkspaceId }: WorkspaceClientPodcastSystemProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(selectedWorkspaceId) : MY_WORKSPACE_BASE_HREF
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const initialClientId = UUID_PATTERN.test(requestedClientId) ? requestedClientId : 'all'
  const [view, setView] = useState<PageView>('work-queue')
  const [search, setSearch] = useState('')
  const [clientId, setClientId] = useState(initialClientId)
  const [stage, setStage] = useState<ClientPodcastLifecycleStage | 'all'>('all')
  const [contact, setContact] = useState<'all' | 'available' | 'missing'>('all')
  const [decision, setDecision] = useState<'all' | 'approved' | 'rejected' | 'awaiting'>('all')
  const [attention, setAttention] = useState<'all' | 'attention'>('all')
  const [page, setPage] = useState(1)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const systemQuery = useQuery({
    queryKey: ['workspace-client-podcast-system', user?.id || 'unknown', workspaceId],
    queryFn: () => getWorkspaceClientPodcastSystem(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
    staleTime: 30_000,
  })
  const system = systemQuery.data
  const canManage = Boolean(system?.can_manage || isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin')

  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceName: system?.workspace.name || 'Client workspace',
        logoUrl: null,
        baseHref,
      }
    : undefined

  useEffect(() => {
    setPage(1)
  }, [attention, clientId, contact, decision, search, stage, view])

  useEffect(() => {
    if (!system || clientId === 'all') return
    if (!system.clients.some((client) => client.id === clientId)) setClientId('all')
  }, [clientId, system])

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return (system?.items || []).filter((item) => {
      if (clientId !== 'all' && item.client.id !== clientId) return false
      if (stage !== 'all' && item.stage !== stage) return false
      if (contact === 'available' && !item.contact.available) return false
      if (contact === 'missing' && item.contact.available) return false
      if (decision === 'approved' && item.decision.status !== 'approved') return false
      if (decision === 'rejected' && item.decision.status !== 'rejected') return false
      if (decision === 'awaiting' && item.decision.status !== null) return false
      if (attention === 'attention' && !item.has_conflict && item.campaign?.status !== 'failed' && item.stage !== 'conversation') return false
      if (normalizedSearch) {
        const haystack = [
          item.podcast.name,
          item.podcast.host_name,
          item.podcast.publisher_name,
          item.client.name,
          item.next_action,
          item.contact.email,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(normalizedSearch)) return false
      }
      if (view === 'completed') return item.terminal
      if (view === 'work-queue' || view === 'pipeline') return !item.terminal
      return true
    })
  }, [attention, clientId, contact, decision, search, stage, system?.items, view])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const pagedItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedItem = system?.items.find((item) => item.id === selectedItemId) || null

  const calendarEvents = useMemo(() => filteredItems.flatMap((item) => {
    const events: Array<{ id: string; date: string; type: 'recording' | 'publication'; item: ClientPodcastSystemItem }> = []
    if (item.booking?.recording_date?.startsWith(calendarMonth)) {
      events.push({ id: `${item.id}:recording`, date: item.booking.recording_date, type: 'recording', item })
    }
    if (item.booking?.publish_date?.startsWith(calendarMonth)) {
      events.push({ id: `${item.id}:publication`, date: item.booking.publish_date, type: 'publication', item })
    }
    return events
  }).sort((left, right) => left.date.localeCompare(right.date)), [calendarMonth, filteredItems])

  const chooseClient = (value: string) => {
    setClientId(value)
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('client')
    else next.set('client', value)
    setSearchParams(next, { replace: true })
  }

  const resetFilters = () => {
    setSearch('')
    chooseClient('all')
    setStage('all')
    setContact('all')
    setDecision('all')
    setAttention('all')
  }

  if (!validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-background to-sky-50 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border-violet-200 bg-violet-100 text-violet-900 hover:bg-violet-100"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Private to this workspace</Badge>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Client Podcast System</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">One operational view from client review through outreach, booking, recording, and publication. Every row belongs to a client in {system?.workspace.name || 'this workspace'}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={`${baseHref}/clients`}><Users className="mr-2 h-4 w-4" />Clients</Link></Button>
              <Button asChild><Link to={`${baseHref}/podcast-finder`}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button>
            </div>
          </div>
        </section>

        {systemQuery.isLoading ? (
          <Card><CardContent className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Building the workspace lifecycle…</span></CardContent></Card>
        ) : systemQuery.error || !system ? (
          <Card className="border-destructive/30"><CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertCircle className="h-9 w-9 text-destructive" /><h2 className="mt-4 text-lg font-semibold">Client Podcast System unavailable</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{systemQuery.error instanceof Error ? systemQuery.error.message : 'The workspace lifecycle could not be loaded.'}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void systemQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : system.items.length === 0 ? (
          <Card><CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Mic2 className="h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 text-xl font-semibold">No client podcast opportunities yet</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Add a podcast to a client shortlist through Finder. It will appear here immediately and stay with the client through every real stage.</p><Button asChild className="mt-5"><Link to={`${baseHref}/podcast-finder`}>Open Podcast Finder</Link></Button></CardContent></Card>
        ) : (
          <>
            <section aria-label="Client podcast workflow summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <SummaryCard icon={Clock3} label="Awaiting review" value={system.summary.stage_counts.awaiting_review} detail="Needs a client decision" iconClassName="bg-amber-50 text-amber-700" />
              <SummaryCard icon={Mail} label="Needs preparation" value={system.summary.stage_counts.contact_needed + system.summary.stage_counts.research_needed} detail="Contact, research, or pitch" iconClassName="bg-sky-50 text-sky-700" />
              <SummaryCard icon={Send} label="Ready to launch" value={system.summary.stage_counts.ready} detail="Reviewed campaign packages" iconClassName="bg-violet-50 text-violet-700" />
              <SummaryCard icon={Inbox} label="Needs attention" value={system.summary.needs_attention} detail="Replies, failures, or conflicts" iconClassName="bg-fuchsia-50 text-fuchsia-700" />
              <SummaryCard icon={CalendarDays} label="Upcoming recordings" value={system.summary.upcoming_recordings} detail="Confirmed recording dates" iconClassName="bg-emerald-50 text-emerald-700" />
              <SummaryCard icon={Radio} label="Awaiting publication" value={system.summary.awaiting_publication} detail="Recorded without live episode" iconClassName="bg-blue-50 text-blue-700" />
            </section>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div><CardTitle>Workspace opportunity filters</CardTitle><CardDescription>Focus the system by client, stage, decision, contact readiness, or the next work requiring attention.</CardDescription></div>
                  <Badge variant="outline" className="w-fit">{filteredItems.length.toLocaleString()} in view</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search client podcast opportunities" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search podcast, host, client, or email" className="pl-9" /></div>
                <Select value={clientId} onValueChange={chooseClient}><SelectTrigger aria-label="Filter by client"><SelectValue placeholder="All clients" /></SelectTrigger><SelectContent><SelectItem value="all">All clients</SelectItem>{system.clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name} ({client.podcast_count})</SelectItem>)}</SelectContent></Select>
                <Select value={stage} onValueChange={(value) => setStage(value as ClientPodcastLifecycleStage | 'all')}><SelectTrigger aria-label="Filter by lifecycle stage"><SelectValue placeholder="All stages" /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{Object.entries(stageMeta).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.shortLabel}</SelectItem>)}</SelectContent></Select>
                <Select value={contact} onValueChange={(value) => setContact(value as typeof contact)}><SelectTrigger aria-label="Filter by contact availability"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any contact status</SelectItem><SelectItem value="available">Has an email</SelectItem><SelectItem value="missing">Missing email</SelectItem></SelectContent></Select>
                <Select value={decision} onValueChange={(value) => setDecision(value as typeof decision)}><SelectTrigger aria-label="Filter by client decision"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any client decision</SelectItem><SelectItem value="approved">Client approved</SelectItem><SelectItem value="rejected">Client passed</SelectItem><SelectItem value="awaiting">Awaiting decision</SelectItem></SelectContent></Select>
                <Select value={attention} onValueChange={(value) => setAttention(value as typeof attention)}><SelectTrigger aria-label="Filter by attention"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All operational states</SelectItem><SelectItem value="attention">Needs attention</SelectItem></SelectContent></Select>
                <Button type="button" variant="outline" onClick={resetFilters}>Reset filters</Button>
              </CardContent>
            </Card>

            <Tabs value={view} onValueChange={(value) => setView(value as PageView)}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="h-auto min-w-max justify-start">
                  <TabsTrigger value="work-queue">Work queue</TabsTrigger>
                  <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar</TabsTrigger>
                  <TabsTrigger value="completed">Completed <span className="ml-1 text-muted-foreground">{system.summary.completed}</span></TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="work-queue" className="mt-5 space-y-4">
                <OpportunityTable items={pagedItems} baseHref={baseHref} onOpen={(item) => setSelectedItemId(item.id)} />
                <PaginationControls page={page} totalPages={totalPages} total={filteredItems.length} onPageChange={setPage} />
              </TabsContent>

              <TabsContent value="pipeline" className="mt-5">
                <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
                  {pipelineColumns.map((column) => {
                    const columnItems = filteredItems.filter((item) => column.stages.includes(item.stage))
                    return (
                      <section key={column.id} aria-labelledby={`pipeline-${column.id}`} className="min-w-0 rounded-2xl border bg-muted/15 p-3">
                        <div className="mb-3 flex items-start justify-between gap-2"><div><h2 id={`pipeline-${column.id}`} className="font-semibold">{column.title}</h2><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{column.description}</p></div><Badge variant="secondary">{columnItems.length}</Badge></div>
                        <div className="space-y-2">
                          {columnItems.length === 0 ? <div className="rounded-xl border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">No opportunities</div> : columnItems.slice(0, 12).map((item) => (
                            <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.025]">
                              <PodcastIdentity item={item} />
                              <div className="mt-3 flex flex-wrap gap-1.5"><StageBadge stage={item.stage} />{item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Check history</Badge>}</div>
                              <p className="mt-2 truncate text-xs font-medium text-muted-foreground">{item.client.name}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5">{item.next_action || 'No action required'}</p>
                            </button>
                          ))}
                          {columnItems.length > 12 && <p className="px-2 py-1 text-center text-xs text-muted-foreground">+{columnItems.length - 12} more in Work queue</p>}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </TabsContent>

              <TabsContent value="calendar" className="mt-5">
                <Card>
                  <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle>Recording and publication calendar</CardTitle><CardDescription>Only real recording and publication dates appear here; campaign status dates are not treated as calendar events.</CardDescription></div><Input aria-label="Calendar month" type="month" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} className="w-full sm:w-48" /></CardHeader>
                  <CardContent>
                    {calendarEvents.length === 0 ? <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed text-center"><CalendarDays className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">No milestones this month</p><p className="mt-1 text-sm text-muted-foreground">Recording and publication dates will appear as bookings are connected.</p></div> : <div className="space-y-3">{calendarEvents.map((event) => <button key={event.id} type="button" onClick={() => setSelectedItemId(event.item.id)} className="flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/40 sm:flex-row sm:items-center"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${event.type === 'recording' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>{event.type === 'recording' ? <Mic2 className="h-5 w-5" /> : <Radio className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{event.item.podcast.name}</p><Badge variant="outline">{event.type === 'recording' ? 'Recording' : 'Publication'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{event.item.client.name} · {formattedDate(event.date)}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="completed" className="mt-5 space-y-4">
                <OpportunityTable items={pagedItems} baseHref={baseHref} onOpen={(item) => setSelectedItemId(item.id)} />
                <PaginationControls page={page} totalPages={totalPages} total={filteredItems.length} onPageChange={setPage} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Sheet open={Boolean(selectedItem)} onOpenChange={(open) => { if (!open) setSelectedItemId(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
          {selectedItem && (
            <>
              <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
                <div className="flex flex-wrap gap-2"><StageBadge stage={selectedItem.stage} /><OutcomeBadge outcome={selectedItem.outcome} />{selectedItem.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">History conflict</Badge>}</div>
                <SheetTitle className="text-2xl">{selectedItem.podcast.name}</SheetTitle>
                <SheetDescription>{selectedItem.client.name} · {stageMeta[selectedItem.stage].description}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-5 sm:p-6">
                {selectedItem.has_conflict && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-950">Review this history before taking another action</p><p className="mt-1 text-sm leading-6 text-amber-900/80">The current client decision or archive state conflicts with recorded outreach or campaign activity. History has been preserved instead of silently choosing one source.</p></div></div>}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Next action</p><p className="mt-2 text-sm font-semibold leading-5">{selectedItem.next_action || 'No action required'}</p></CardContent></Card>
                  <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contact</p><p className="mt-2 text-sm font-semibold">{contactLabel(selectedItem)}</p>{canManage && selectedItem.contact.email && <p className="mt-1 truncate text-xs text-muted-foreground">{selectedItem.contact.email}</p>}</CardContent></Card>
                  <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-2 text-sm font-semibold">{compactNumber(selectedItem.podcast.audience_size)}</p><p className="mt-1 text-xs text-muted-foreground">Estimated listeners</p></CardContent></Card>
                </div>

                <section>
                  <h2 className="text-lg font-semibold">Workflow facts</h2>
                  <div className="mt-3 rounded-xl border px-4">
                    <DetailRow label="Client decision" value={selectedItem.decision.status ? <span className="capitalize">{selectedItem.decision.status}</span> : 'Awaiting decision'} />
                    <DetailRow label="Campaign" value={selectedItem.campaign ? <span className="capitalize">{selectedItem.campaign.status.replace(/_/g, ' ')}</span> : 'Not prepared'} />
                    <DetailRow label="Legacy outreach" value={selectedItem.legacy_outreach_at ? formattedDate(selectedItem.legacy_outreach_at) : 'None recorded'} />
                    <DetailRow label="Booking" value={selectedItem.booking ? <span className="capitalize">{selectedItem.booking.status.replace(/_/g, ' ')}</span> : 'Not booked'} />
                    <DetailRow label="Last activity" value={formattedDate(selectedItem.last_activity_at, true)} />
                  </div>
                  {selectedItem.booking?.match === 'podcast_name' && <p className="mt-2 text-xs leading-5 text-amber-700">This legacy booking was matched by client and podcast name because it does not carry a canonical podcast ID.</p>}
                </section>

                <section>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Host-ready research</h2><Badge variant="outline">{selectedItem.analysis.source === 'normalized' ? 'Current analysis' : selectedItem.analysis.source === 'legacy_cache' ? 'Legacy analysis' : 'Not researched'}</Badge></div>
                  {selectedItem.analysis.clean_description ? <p className="mt-3 rounded-xl border bg-muted/15 p-4 text-sm leading-6 text-muted-foreground">{selectedItem.analysis.clean_description}</p> : <div className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No client-specific research is available yet.</div>}
                  {selectedItem.analysis.fit_reasons.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Why the guest fits</h3><ul className="mt-2 space-y-2">{selectedItem.analysis.fit_reasons.map((reason, index) => <li key={`${reason}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>{reason}</span></li>)}</ul></div>}
                  {selectedItem.analysis.pitch_angles.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">{selectedItem.analysis.pitch_angles.map((angle) => <div key={angle.title} className="rounded-xl border p-4"><p className="text-sm font-semibold">{angle.title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{angle.description}</p></div>)}</div>}
                </section>

                {(selectedItem.decision.notes || selectedItem.operator_notes || selectedItem.booking?.notes) && <section><h2 className="text-lg font-semibold">Saved notes</h2><div className="mt-3 space-y-3">{selectedItem.decision.notes && <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client feedback</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedItem.decision.notes}</p></div>}{selectedItem.operator_notes && <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedItem.operator_notes}</p></div>}{selectedItem.booking?.notes && <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booking notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selectedItem.booking.notes}</p></div>}</div></section>}

                {selectedItem.booking && <section><h2 className="text-lg font-semibold">Booking milestones</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Scheduled</p><p className="mt-1 text-sm font-semibold">{formattedDate(selectedItem.booking.scheduled_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Recording</p><p className="mt-1 text-sm font-semibold">{formattedDate(selectedItem.booking.recording_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Publication</p><p className="mt-1 text-sm font-semibold">{formattedDate(selectedItem.booking.publish_date)}</p></div></div></section>}

                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline"><Link to={`${baseHref}/clients/${encodeURIComponent(selectedItem.client.id)}?tab=approval`}><UserRound className="mr-2 h-4 w-4" />Client shortlist</Link></Button>
                  <Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns/${encodeURIComponent(selectedItem.client.id)}`}><Megaphone className="mr-2 h-4 w-4" />Client campaign</Link></Button>
                  <Button asChild variant="outline"><Link to={`${baseHref}/master-inbox?client=${encodeURIComponent(selectedItem.client.id)}`}><Inbox className="mr-2 h-4 w-4" />Master Inbox</Link></Button>
                  {safeExternalUrl(selectedItem.podcast.url) && <Button asChild variant="ghost"><a href={safeExternalUrl(selectedItem.podcast.url) || undefined} target="_blank" rel="noreferrer">Podcast page<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
                  {safeExternalUrl(selectedItem.booking?.episode_url) && <Button asChild><a href={safeExternalUrl(selectedItem.booking?.episode_url) || undefined} target="_blank" rel="noreferrer">Listen to episode<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
                </div>
                {!canManage && <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>You can view this workspace lifecycle. Owners and admins manage client decisions, campaign preparation, and delivery actions.</p></div>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </WorkspaceLayout>
  )
}

export default WorkspaceClientPodcastSystem
