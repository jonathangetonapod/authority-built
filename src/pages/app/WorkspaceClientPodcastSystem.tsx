import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CalendarPlus,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Inbox,
  LayoutDashboard,
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
import { ClientActivityCalendar } from '@/components/workspace/ClientActivityCalendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientBookingDialog } from '@/components/workspace/ClientBookingDialog'
import { safeExternalUrl } from '@/lib/externalUrl'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastLifecycleOutcome,
  type ClientPodcastLifecycleStage,
  type ClientPodcastSystemClient,
  type ClientPodcastSystemItem,
} from '@/services/clientPodcastSystem'

interface WorkspaceClientPodcastSystemProps {
  platformWorkspaceId?: string
}

interface ClientRollup {
  client: ClientPodcastSystemClient
  items: ClientPodcastSystemItem[]
  awaitingReview: number
  preparation: number
  activeOutreach: number
  conversations: number
  placements: number
  published: number
  upcomingRecordings: number
  needsAttentionItems: ClientPodcastSystemItem[]
  needsAttention: boolean
  nextAction: {
    label: string
    detail: string
    tone: 'urgent' | 'work' | 'clear'
    itemId: string | null
  }
  lastActivityAt: string | null
}

type ClientStatusFilter = 'active' | 'paused' | 'churned' | 'all'
type PodcastScope = 'active' | 'completed' | 'all'
type ClientView = 'overview' | 'podcasts' | 'placements'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAGE_SIZE = 50

const stageMeta: Record<ClientPodcastLifecycleStage, { label: string; shortLabel: string; className: string }> = {
  awaiting_review: { label: 'Awaiting client review', shortLabel: 'Awaiting review', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { label: 'Client approved', shortLabel: 'Approved', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  contact_needed: { label: 'Contact needed', shortLabel: 'Needs contact', className: 'border-orange-200 bg-orange-50 text-orange-800' },
  research_needed: { label: 'Research or pitch needed', shortLabel: 'Needs research', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  ready: { label: 'Ready to launch', shortLabel: 'Ready', className: 'border-violet-200 bg-violet-50 text-violet-800' },
  outreach: { label: 'In outreach', shortLabel: 'Outreach', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  conversation: { label: 'Active conversation', shortLabel: 'Conversation', className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' },
  booked: { label: 'Booked', shortLabel: 'Booked', className: 'border-green-200 bg-green-50 text-green-800' },
  recorded: { label: 'Recorded', shortLabel: 'Recorded', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  published: { label: 'Published', shortLabel: 'Published', className: 'border-purple-200 bg-purple-50 text-purple-800' },
}

const outcomeMeta: Record<Exclude<ClientPodcastLifecycleOutcome, null>, { label: string; className: string }> = {
  rejected: { label: 'Client passed', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  cancelled: { label: 'Cancelled', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  archived: { label: 'Archived', className: 'border-slate-200 bg-slate-50 text-slate-700' },
}

function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
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

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function statusClassName(status: string): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'paused') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function onboardingLabel(client: ClientPodcastSystemClient): string {
  if (!client.onboarding) return 'Not started'
  if (client.onboarding.status === 'changes_requested') return 'Changes requested'
  if (client.onboarding.status === 'in_progress') return 'In progress'
  return client.onboarding.status.charAt(0).toUpperCase() + client.onboarding.status.slice(1)
}

function contactLabel(item: ClientPodcastSystemItem): string {
  if (item.contact.source === 'direct') return 'Verified direct'
  if (item.contact.source === 'podscan') return 'Free Podscan'
  if (item.contact.source === 'campaign') return 'Campaign contact'
  return 'No email'
}

/**
 * Master Inbox, opened on the thread that belongs to this host where one is
 * known. The client-scoped link was the only route, which meant landing in a
 * hundred conversations and searching for the show already on screen.
 */
function inboxHref(baseHref: string, item: ClientPodcastSystemItem): string {
  const params = new URLSearchParams({ client: item.client.id })
  if (item.conversation?.thread_key) params.set('thread', item.conversation.thread_key)
  return `${baseHref}/master-inbox?${params.toString()}`
}

function ConversationBadge({ item }: { item: ClientPodcastSystemItem }) {
  if (!item.conversation?.replied) return null
  return (
    <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800">
      <Inbox className="mr-1 h-3 w-3" />
      {/* A reply can be known from a campaign sync before the inbox has read
          the thread, and only one of those can be opened. */}
      {item.conversation.thread_key ? 'Host replied' : 'Reply not read in yet'}
    </Badge>
  )
}

function ClientPositioning({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text?.trim()) {
    return <p className="mt-1 text-sm text-muted-foreground">Host-ready positioning has not been added yet.</p>
  }
  // Only long text is worth collapsing; a one-line positioning statement with
  // a "Show more" under it reads as broken.
  const longEnoughToCollapse = text.length > 320
  return (
    <div className="mt-1">
      <p className={`max-w-3xl whitespace-pre-line text-sm text-muted-foreground ${expanded || !longEnoughToCollapse ? '' : 'line-clamp-3'}`}>
        {text}
      </p>
      {longEnoughToCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
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

function ClientAvatar({ client, size = 'md' }: { client: ClientPodcastSystemClient; size?: 'md' | 'lg' }) {
  const imageUrl = safeExternalUrl(client.photo_url)
  return (
    <Avatar className={`${size === 'lg' ? 'h-16 w-16 text-lg' : 'h-11 w-11'} shrink-0 border bg-background`}>
      {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
      <AvatarFallback>{initials(client.name)}</AvatarFallback>
    </Avatar>
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

function buildClientRollup(
  client: ClientPodcastSystemClient,
  allItems: ClientPodcastSystemItem[],
  today: string,
): ClientRollup {
  const items = allItems.filter((item) => item.client.id === client.id)
  const conflicts = items.filter((item) => item.has_conflict || item.campaign?.status === 'failed')
  const conversations = items.filter((item) => !item.terminal && item.stage === 'conversation')
  const unpreparedBooking = items.find((item) => (
    !item.terminal
    && item.stage === 'booked'
    && item.booking
    && !item.booking.prep_sent
  ))
  const awaitingReview = items.filter((item) => !item.terminal && item.stage === 'awaiting_review')
  const contactNeeded = items.filter((item) => !item.terminal && item.stage === 'contact_needed')
  const researchNeeded = items.filter((item) => !item.terminal && item.stage === 'research_needed')
  const ready = items.filter((item) => !item.terminal && item.stage === 'ready')
  const recorded = items.filter((item) => !item.terminal && item.stage === 'recorded')
  const onboardingNeedsWork = client.onboarding && ['invited', 'in_progress', 'submitted', 'changes_requested'].includes(client.onboarding.status)

  let nextAction: ClientRollup['nextAction']
  if (client.status !== 'active') {
    nextAction = {
      label: client.status === 'paused' ? 'Client work is paused' : 'Client is no longer active',
      detail: 'No new operational work is being prioritized.',
      tone: 'clear',
      itemId: null,
    }
  } else if (conflicts[0]) {
    nextAction = {
      label: 'Resolve an outreach history issue',
      detail: `${conflicts.length} podcast ${conflicts.length === 1 ? 'record needs' : 'records need'} review before more activity.`,
      tone: 'urgent',
      itemId: conflicts[0].id,
    }
  } else if (conversations[0]) {
    nextAction = {
      label: 'Respond to a podcast host',
      detail: `${conversations.length} active ${conversations.length === 1 ? 'conversation needs' : 'conversations need'} attention.`,
      tone: 'urgent',
      itemId: conversations[0].id,
    }
  } else if (unpreparedBooking) {
    nextAction = {
      label: 'Prepare the client for a recording',
      detail: `${unpreparedBooking.podcast.name} is booked and preparation is not marked complete.`,
      tone: 'urgent',
      itemId: unpreparedBooking.id,
    }
  } else if (client.onboarding?.status === 'submitted') {
    nextAction = {
      label: 'Review submitted onboarding',
      detail: 'The client has submitted their information for workspace review.',
      tone: 'work',
      itemId: null,
    }
  } else if (!client.profile.ready) {
    nextAction = {
      label: 'Complete the guest profile',
      detail: `${client.profile.completed_fields} of ${client.profile.total_fields} host-ready context sections are complete.`,
      tone: 'work',
      itemId: null,
    }
  } else if (onboardingNeedsWork) {
    nextAction = {
      label: 'Move onboarding forward',
      detail: `The current onboarding status is ${onboardingLabel(client).toLowerCase()}.`,
      tone: 'work',
      itemId: null,
    }
  } else if (awaitingReview[0]) {
    nextAction = {
      label: 'Get client podcast decisions',
      detail: `${awaitingReview.length} ${awaitingReview.length === 1 ? 'podcast is' : 'podcasts are'} awaiting review.`,
      tone: 'work',
      itemId: awaitingReview[0].id,
    }
  } else if (contactNeeded[0]) {
    nextAction = {
      label: 'Find a host email',
      detail: `${contactNeeded.length} approved ${contactNeeded.length === 1 ? 'podcast needs' : 'podcasts need'} a usable contact.`,
      tone: 'work',
      itemId: contactNeeded[0].id,
    }
  } else if (researchNeeded[0]) {
    nextAction = {
      label: 'Finish a host-ready pitch',
      detail: `${researchNeeded.length} ${researchNeeded.length === 1 ? 'opportunity needs' : 'opportunities need'} research or pitch review.`,
      tone: 'work',
      itemId: researchNeeded[0].id,
    }
  } else if (ready[0]) {
    nextAction = {
      label: 'Launch reviewed outreach',
      detail: `${ready.length} ${ready.length === 1 ? 'pitch is' : 'pitches are'} ready to launch.`,
      tone: 'work',
      itemId: ready[0].id,
    }
  } else if (recorded[0]) {
    nextAction = {
      label: 'Confirm publication details',
      detail: `${recorded.length} recorded ${recorded.length === 1 ? 'appearance is' : 'appearances are'} awaiting publication.`,
      tone: 'work',
      itemId: recorded[0].id,
    }
  } else if (items.length === 0) {
    nextAction = {
      label: 'Add the first podcasts',
      detail: 'Start building a focused shortlist for this client.',
      tone: 'work',
      itemId: null,
    }
  } else {
    nextAction = {
      label: 'No urgent action',
      detail: 'The current client workflow has no blocked or time-sensitive work.',
      tone: 'clear',
      itemId: null,
    }
  }

  const needsAttentionItems = items.filter((item) => (
    !item.terminal
    && (
      item.has_conflict
      || item.campaign?.status === 'failed'
      || ['awaiting_review', 'contact_needed', 'research_needed', 'ready', 'conversation', 'recorded'].includes(item.stage)
      || (item.stage === 'booked' && !item.booking?.prep_sent)
    )
  ))

  return {
    client,
    items,
    awaitingReview: awaitingReview.length,
    preparation: items.filter((item) => !item.terminal && ['approved', 'contact_needed', 'research_needed', 'ready'].includes(item.stage)).length,
    activeOutreach: items.filter((item) => !item.terminal && item.stage === 'outreach').length,
    conversations: conversations.length,
    placements: items.filter((item) => item.booking && item.booking.status !== 'cancelled').length,
    published: items.filter((item) => item.stage === 'published').length,
    upcomingRecordings: items.filter((item) => (
      !item.terminal
      && Boolean(item.booking?.recording_date)
      && item.booking!.recording_date! >= today
    )).length,
    needsAttentionItems,
    needsAttention: client.status === 'active' && nextAction.tone !== 'clear',
    nextAction,
    lastActivityAt: [client.last_activity_at, ...items.map((item) => item.last_activity_at)]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null,
  }
}

function PortfolioMetric({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: typeof Activity
  label: string
  value: number
  detail: string
  className: string
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${className}`}><Icon className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/70 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}

function ProfileProgress({ client }: { client: ClientPodcastSystemClient }) {
  const percent = client.profile.total_fields > 0
    ? Math.round((client.profile.completed_fields / client.profile.total_fields) * 100)
    : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">Guest profile</span>
        <span className="text-muted-foreground">{client.profile.completed_fields}/{client.profile.total_fields}</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${client.name} guest profile completion`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full rounded-full ${client.profile.ready ? 'bg-emerald-500' : 'bg-violet-500'}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function AllClientsView({
  rollups,
  items,
  baseHref,
  onChooseClient,
  onOpenItem,
}: {
  rollups: ClientRollup[]
  items: ClientPodcastSystemItem[]
  baseHref: string
  onChooseClient: (clientId: string) => void
  onOpenItem: (itemId: string) => void
}) {
  const [portfolioView, setPortfolioView] = useState<'clients' | 'calendar'>('clients')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ClientStatusFilter>('all')
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = rollups.filter((rollup) => {
    if (status !== 'all' && rollup.client.status !== status) return false
    if (!normalizedSearch) return true
    return [
      rollup.client.name,
      rollup.client.email,
      rollup.client.contact_person,
      rollup.client.website,
      rollup.client.profile.positioning,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch)
  })
  const activeRollups = rollups.filter((rollup) => rollup.client.status === 'active')

  return (
    <div className="space-y-6">
      <section aria-label="Client portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PortfolioMetric icon={Users} label="Active clients" value={activeRollups.length} detail="Currently receiving service" className="bg-sky-50 text-sky-700" />
        <PortfolioMetric icon={AlertCircle} label="Need attention" value={activeRollups.filter((rollup) => rollup.needsAttention).length} detail="Have a clear next action" className="bg-amber-50 text-amber-700" />
        <PortfolioMetric icon={Inbox} label="Open conversations" value={activeRollups.reduce((sum, rollup) => sum + rollup.conversations, 0)} detail="Host or scheduling replies" className="bg-fuchsia-50 text-fuchsia-700" />
        <PortfolioMetric icon={CalendarDays} label="Upcoming recordings" value={activeRollups.reduce((sum, rollup) => sum + rollup.upcomingRecordings, 0)} detail="Confirmed recording dates" className="bg-emerald-50 text-emerald-700" />
        <PortfolioMetric icon={Radio} label="Published episodes" value={rollups.reduce((sum, rollup) => sum + rollup.published, 0)} detail="Recorded client outcomes" className="bg-violet-50 text-violet-700" />
      </section>

      <Tabs value={portfolioView} onValueChange={(value) => setPortfolioView(value as 'clients' | 'calendar')}>
        <TabsList className="h-auto justify-start">
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-5">
          <ClientActivityCalendar items={items} onOpenItem={onOpenItem} />
        </TabsContent>

        <TabsContent value="clients" className="mt-5">
      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>All clients</CardTitle>
            <CardDescription>Clients needing action appear first. Select one to open their complete operational overview.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients" className="pl-9" />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as ClientStatusFilter)}>
              <SelectTrigger aria-label="Filter clients by status" className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active clients</SelectItem>
                <SelectItem value="paused">Paused clients</SelectItem>
                <SelectItem value="churned">Churned clients</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
              <Users className="h-9 w-9 text-muted-foreground/50" />
              <p className="mt-3 font-medium">No clients match this view</p>
              <p className="mt-1 text-sm text-muted-foreground">Try another status or search term.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((rollup) => {
                const { client } = rollup
                const website = safeExternalUrl(client.website)
                return (
                  <article key={client.id} className="rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30 sm:p-5">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <ClientAvatar client={client} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-lg font-semibold">{client.name}</h2>
                            <Badge variant="outline" className={statusClassName(client.status)}>{client.status}</Badge>
                            <Badge variant="outline" className={client.profile.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800'}>
                              {client.profile.ready ? 'Guest profile ready' : `${client.profile.completed_fields}/${client.profile.total_fields} profile sections`}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{client.email || client.contact_person || 'No primary contact saved'}</p>
                          {website && <a href={website} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center truncate text-xs text-primary hover:underline">{client.website}<ExternalLink className="ml-1 h-3 w-3" /></a>}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:w-[560px]">
                        <MiniMetric label="Podcasts" value={rollup.items.length} />
                        <MiniMetric label="To review" value={rollup.awaitingReview} />
                        <MiniMetric label="Approved" value={rollup.preparation} />
                        <MiniMetric label="Outreach" value={rollup.activeOutreach} />
                        <MiniMetric label="Replies" value={rollup.conversations} />
                        <MiniMetric label="Placements" value={rollup.placements} />
                      </div>

                      <div className={`xl:w-80 rounded-xl border p-3 ${rollup.nextAction.tone === 'urgent' ? 'border-amber-200 bg-amber-50' : rollup.nextAction.tone === 'work' ? 'border-violet-200 bg-violet-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
                        <p className="mt-1 text-sm font-semibold">{rollup.nextAction.label}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{rollup.nextAction.detail}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">Last activity {formattedDate(rollup.lastActivityAt, true)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm"><Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}`}>Client account</Link></Button>
                        <Button type="button" size="sm" onClick={() => onChooseClient(client.id)} aria-label={`View ${client.name} overview`}>View overview<ArrowRight className="ml-2 h-4 w-4" /></Button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0"><span className="text-sm text-muted-foreground">{label}</span><div className="max-w-[65%] text-right text-sm font-medium">{value}</div></div>
}

function OpportunityList({
  items,
  onOpen,
}: {
  items: ClientPodcastSystemItem[]
  onOpen: (item: ClientPodcastSystemItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <ListChecks className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-medium">Nothing needs attention here</p>
        <p className="mt-1 text-sm text-muted-foreground">New decisions, conversations, and delivery work will appear here.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onOpen(item)} className="flex w-full flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><PodcastIdentity item={item} /></div>
          <div className="flex flex-wrap gap-1.5"><StageBadge stage={item.stage} /><ConversationBadge item={item} />{item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Check history</Badge>}</div>
          <p className="w-full text-xs text-muted-foreground sm:w-52">{item.next_action || 'No action required'}</p>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function PodcastTable({
  items,
  onOpen,
}: {
  items: ClientPodcastSystemItem[]
  onOpen: (item: ClientPodcastSystemItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <Mic2 className="h-9 w-9 text-muted-foreground/50" />
        <p className="mt-3 font-medium">No podcasts match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">Try another stage, contact status, or search term.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-64">Podcast</TableHead>
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
              <TableCell><div className="flex flex-wrap gap-1.5"><StageBadge stage={item.stage} /><OutcomeBadge outcome={item.outcome} /><ConversationBadge item={item} /></div></TableCell>
              <TableCell><span className="inline-flex items-center gap-1.5 text-sm"><Mail className={`h-3.5 w-3.5 ${item.contact.available ? 'text-emerald-600' : 'text-muted-foreground'}`} />{contactLabel(item)}</span></TableCell>
              <TableCell className="text-sm">{item.next_action || 'No action required'}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formattedDate(item.last_activity_at)}</TableCell>
              <TableCell className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => onOpen(item)}>Open<ArrowRight className="ml-2 h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SelectedClientView({
  rollup,
  baseHref,
  canManage,
  onOpenItem,
}: {
  rollup: ClientRollup
  baseHref: string
  canManage: boolean
  onOpenItem: (itemId: string) => void
}) {
  const [view, setView] = useState<ClientView>('overview')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<PodcastScope>('active')
  const [stage, setStage] = useState<ClientPodcastLifecycleStage | 'all'>('all')
  const [contact, setContact] = useState<'all' | 'available' | 'missing'>('all')
  const [page, setPage] = useState(1)
  const { client, items } = rollup
  const website = safeExternalUrl(client.website)

  useEffect(() => {
    setView('overview')
    setSearch('')
    setScope('active')
    setStage('all')
    setContact('all')
    setPage(1)
  }, [client.id])

  useEffect(() => setPage(1), [contact, scope, search, stage])

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return items.filter((item) => {
      if (scope === 'active' && item.terminal) return false
      if (scope === 'completed' && !item.terminal) return false
      if (stage !== 'all' && item.stage !== stage) return false
      if (contact === 'available' && !item.contact.available) return false
      if (contact === 'missing' && item.contact.available) return false
      if (!normalizedSearch) return true
      return [item.podcast.name, item.podcast.host_name, item.podcast.publisher_name, item.next_action, item.contact.email]
        .filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch)
    })
  }, [contact, items, scope, search, stage])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const placementItems = items.filter((item) => Boolean(item.booking))
  const upcomingMilestones = placementItems.flatMap((item) => {
    const events: Array<{ id: string; date: string; label: string; item: ClientPodcastSystemItem }> = []
    if (item.booking?.recording_date) events.push({ id: `${item.id}:recording`, date: item.booking.recording_date, label: 'Recording', item })
    if (item.booking?.publish_date) events.push({ id: `${item.id}:publication`, date: item.booking.publish_date, label: 'Publication', item })
    return events
  }).filter((event) => event.date >= localToday()).sort((left, right) => left.date.localeCompare(right.date))
  const recentItems = [...items].sort((left, right) => (right.last_activity_at || '').localeCompare(left.last_activity_at || '')).slice(0, 6)

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-violet-50/50 to-sky-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ClientAvatar client={client} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{client.name}</h2>
                <Badge variant="outline" className={statusClassName(client.status)}>{client.status}</Badge>
              </div>
              {/* A full bio can run to several paragraphs, which pushed the
                  whole client workspace below the fold. Three lines is enough
                  to recognise the positioning; the rest opens in place. */}
              <ClientPositioning text={client.profile.positioning || client.bio} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {client.email && <span>{client.email}</span>}
                {website && <a href={website} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary hover:underline">{client.website}<ExternalLink className="ml-1 h-3 w-3" /></a>}
                <span>Last activity {formattedDate(rollup.lastActivityAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}`}><UserRound className="mr-2 h-4 w-4" />Client account</Link></Button>
            <Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns/${encodeURIComponent(client.id)}`}><Megaphone className="mr-2 h-4 w-4" />Campaign</Link></Button>
            <Button asChild variant="outline"><Link to={`${baseHref}/master-inbox?client=${encodeURIComponent(client.id)}`}><Inbox className="mr-2 h-4 w-4" />Master Inbox</Link></Button>
            <Button asChild><Link to={`${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button>
          </div>
        </div>
      </section>

      <Tabs value={view} onValueChange={(value) => setView(value as ClientView)}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="podcasts">Podcasts <span className="ml-1 text-muted-foreground">{items.length}</span></TabsTrigger>
            <TabsTrigger value="placements">Placements <span className="ml-1 text-muted-foreground">{placementItems.length}</span></TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-5 space-y-6">
          <section aria-label={`${client.name} workflow summary`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <PortfolioMetric icon={Mic2} label="Podcasts" value={items.length} detail="Complete client list" className="bg-sky-50 text-sky-700" />
            <PortfolioMetric icon={ListChecks} label="Awaiting review" value={rollup.awaitingReview} detail="Needs client decisions" className="bg-amber-50 text-amber-700" />
            <PortfolioMetric icon={CheckCircle2} label="Approved" value={rollup.preparation} detail="Approved and in preparation" className="bg-emerald-50 text-emerald-700" />
            <PortfolioMetric icon={Send} label="In outreach" value={rollup.activeOutreach} detail="Active follow-up" className="bg-indigo-50 text-indigo-700" />
            <PortfolioMetric icon={Inbox} label="Conversations" value={rollup.conversations} detail="Host replies and scheduling" className="bg-fuchsia-50 text-fuchsia-700" />
            <PortfolioMetric icon={Radio} label="Published" value={rollup.published} detail="Live client episodes" className="bg-violet-50 text-violet-700" />
          </section>

          <Card className={rollup.nextAction.tone === 'urgent' ? 'border-amber-200 bg-amber-50/50' : rollup.nextAction.tone === 'work' ? 'border-violet-200 bg-violet-50/40' : 'border-emerald-200 bg-emerald-50/40'}>
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={`rounded-xl p-2.5 ${rollup.nextAction.tone === 'urgent' ? 'bg-amber-100 text-amber-800' : rollup.nextAction.tone === 'work' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}><Activity className="h-5 w-5" /></div>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most important next action</p><h3 className="mt-1 text-lg font-semibold">{rollup.nextAction.label}</h3><p className="mt-1 text-sm text-muted-foreground">{rollup.nextAction.detail}</p></div>
              </div>
              {rollup.nextAction.itemId && <Button type="button" variant="outline" onClick={() => onOpenItem(rollup.nextAction.itemId!)}>Open opportunity<ArrowRight className="ml-2 h-4 w-4" /></Button>}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Guest and account readiness</CardTitle><CardDescription>The client context and access needed to run credible podcast outreach.</CardDescription></CardHeader>
              <CardContent className="space-y-5">
                <ProfileProgress client={client} />
                <div className="rounded-xl border px-4">
                  <DetailRow label="AI SDR context" value={client.profile.ready ? <span className="text-emerald-700">Ready</span> : 'Needs context'} />
                  <DetailRow label="Onboarding" value={canManage ? onboardingLabel(client) : 'Owner/admin only'} />
                  <DetailRow label="Approval dashboard" value={client.dashboard_configured ? 'Configured' : 'Not configured'} />
                  <DetailRow label="Booking calendar" value={client.profile.has_calendar ? 'Added' : 'Missing'} />
                  <DetailRow label="Media kit" value={client.profile.has_media_kit ? 'Added' : 'Missing'} />
                  <DetailRow label="Client portal" value={client.portal.enabled ? `Enabled${client.portal.last_login_at ? ` · last used ${formattedDate(client.portal.last_login_at)}` : ''}` : 'Not enabled'} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline"><Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}?tab=ai-sdr`}><Bot className="mr-2 h-4 w-4" />Guest profile</Link></Button>
                  <Button asChild variant="outline"><Link to={`${baseHref}/onboarding?client=${encodeURIComponent(client.id)}${client.onboarding ? `&instance=${encodeURIComponent(client.onboarding.id)}` : ''}`}><FileText className="mr-2 h-4 w-4" />Onboarding</Link></Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Outreach and conversations</CardTitle><CardDescription>Real campaign activity for this client, with replies handled in Master Inbox.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniMetric label="Preparing" value={rollup.preparation} />
                  <MiniMetric label="In outreach" value={rollup.activeOutreach} />
                  <MiniMetric label="Conversations" value={rollup.conversations} />
                  <MiniMetric label="Placements" value={rollup.placements} />
                </div>
                <div className="mt-5 space-y-3">
                  {items.filter((item) => item.campaign && !item.terminal).slice(0, 4).map((item) => (
                    <button key={item.id} type="button" onClick={() => onOpenItem(item.id)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:border-primary/40">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.podcast.name}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{item.next_action || 'Campaign active'}</p></div><StageBadge stage={item.stage} /><ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                  {items.every((item) => !item.campaign || item.terminal) && <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No active client campaigns yet.</div>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns/${encodeURIComponent(client.id)}`}><Megaphone className="mr-2 h-4 w-4" />Open campaign</Link></Button>
                  <Button asChild variant="outline"><Link to={`${baseHref}/master-inbox?client=${encodeURIComponent(client.id)}`}><Inbox className="mr-2 h-4 w-4" />Open inbox</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Needs attention</CardTitle><CardDescription>The podcast work most likely to need a decision or follow-up next.</CardDescription></CardHeader>
              <CardContent><OpportunityList items={rollup.needsAttentionItems.slice(0, 6)} onOpen={(item) => onOpenItem(item.id)} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Upcoming recordings and releases</CardTitle><CardDescription>Confirmed delivery milestones, not campaign activity dates.</CardDescription></CardHeader>
              <CardContent>
                {upcomingMilestones.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed text-center"><CalendarDays className="h-8 w-8 text-muted-foreground/50" /><p className="mt-3 font-medium">No upcoming milestones</p><p className="mt-1 text-sm text-muted-foreground">Recording and publication dates will appear here.</p></div>
                ) : (
                  <div className="space-y-2">{upcomingMilestones.slice(0, 6).map((event) => <button key={event.id} type="button" onClick={() => onOpenItem(event.item.id)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left hover:border-primary/40"><div className={`rounded-lg p-2 ${event.label === 'Recording' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>{event.label === 'Recording' ? <Mic2 className="h-4 w-4" /> : <Radio className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{event.item.podcast.name}</p><p className="text-xs text-muted-foreground">{event.label} · {formattedDate(event.date)}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></button>)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Recent client activity</CardTitle><CardDescription>The latest recorded changes across podcast review, campaigns, replies, and placements.</CardDescription></CardHeader>
            <CardContent>
              {recentItems.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No podcast activity has been recorded for this client yet.</div> : <div className="divide-y rounded-xl border">{recentItems.map((item) => <button key={item.id} type="button" onClick={() => onOpenItem(item.id)} className="flex w-full flex-col gap-2 p-4 text-left hover:bg-muted/30 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.podcast.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{formattedDate(item.last_activity_at, true)}</p></div><div className="flex flex-wrap gap-1.5"><StageBadge stage={item.stage} /><OutcomeBadge outcome={item.outcome} /></div><ArrowRight className="h-4 w-4 text-muted-foreground" /></button>)}</div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="podcasts" className="mt-5 space-y-4">
          <Card>
            <CardHeader><CardTitle>Client podcast journey</CardTitle><CardDescription>Every podcast associated with {client.name}, from shortlist through publication.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search this client's podcasts" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search podcast, host, email, or next action" className="pl-9" /></div>
              <Select value={scope} onValueChange={(value) => setScope(value as PodcastScope)}><SelectTrigger aria-label="Filter podcasts by workflow status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active workflow</SelectItem><SelectItem value="completed">Completed and passed</SelectItem><SelectItem value="all">All podcasts</SelectItem></SelectContent></Select>
              <Select value={stage} onValueChange={(value) => setStage(value as ClientPodcastLifecycleStage | 'all')}><SelectTrigger aria-label="Filter podcasts by lifecycle stage"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{Object.entries(stageMeta).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.shortLabel}</SelectItem>)}</SelectContent></Select>
              <Select value={contact} onValueChange={(value) => setContact(value as typeof contact)}><SelectTrigger aria-label="Filter podcasts by contact availability"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any contact status</SelectItem><SelectItem value="available">Has an email</SelectItem><SelectItem value="missing">Missing email</SelectItem></SelectContent></Select>
              <Badge variant="outline" className="w-fit self-center">{filteredItems.length} in view</Badge>
            </CardContent>
          </Card>
          <PodcastTable items={pagedItems} onOpen={(item) => onOpenItem(item.id)} />
          {totalPages > 1 && <div className="flex flex-col items-center justify-between gap-3 rounded-xl border p-3 sm:flex-row"><p className="text-sm text-muted-foreground">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}</p><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(Math.max(1, currentPage - 1))}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(Math.min(totalPages, currentPage + 1))}>Next</Button></div></div>}
        </TabsContent>

        <TabsContent value="placements" className="mt-5">
          <Card>
            <CardHeader><CardTitle>Placements and outcomes</CardTitle><CardDescription>Booked, recorded, published, and cancelled appearances for {client.name}.</CardDescription></CardHeader>
            <CardContent>
              {placementItems.length === 0 ? (
                <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed text-center"><CalendarDays className="h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">No confirmed placements yet</p><p className="mt-1 text-sm text-muted-foreground">Bookings will appear here once a host confirms an appearance.</p></div>
              ) : (
                <div className="overflow-x-auto rounded-xl border"><Table><TableHeader><TableRow><TableHead className="min-w-64">Podcast</TableHead><TableHead>Status</TableHead><TableHead>Recording</TableHead><TableHead>Publication</TableHead><TableHead>Episode</TableHead><TableHead className="text-right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{placementItems.map((item) => <TableRow key={item.id}><TableCell><PodcastIdentity item={item} /></TableCell><TableCell><div className="flex flex-wrap gap-1.5"><StageBadge stage={item.stage} /><OutcomeBadge outcome={item.outcome} /><ConversationBadge item={item} /></div></TableCell><TableCell className="whitespace-nowrap text-sm">{formattedDate(item.booking?.recording_date)}</TableCell><TableCell className="whitespace-nowrap text-sm">{formattedDate(item.booking?.publish_date)}</TableCell><TableCell>{safeExternalUrl(item.booking?.episode_url) ? <a href={safeExternalUrl(item.booking?.episode_url) || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-primary hover:underline">Listen<ExternalLink className="ml-1 h-3.5 w-3.5" /></a> : <span className="text-sm text-muted-foreground">Not live</span>}</TableCell><TableCell className="text-right"><Button type="button" variant="ghost" size="sm" onClick={() => onOpenItem(item.id)}>Open<ArrowRight className="ml-2 h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OpportunityDetail({
  item,
  baseHref,
  canManage,
  onLogPlacement,
}: {
  item: ClientPodcastSystemItem
  baseHref: string
  canManage: boolean
  onLogPlacement: () => void
}) {
  return (
    <>
      <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
        <div className="flex flex-wrap gap-2"><StageBadge stage={item.stage} /><OutcomeBadge outcome={item.outcome} /><ConversationBadge item={item} />{item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">History conflict</Badge>}</div>
        <SheetTitle className="text-2xl">{item.podcast.name}</SheetTitle>
        <SheetDescription>{item.client.name} · {stageMeta[item.stage].label}</SheetDescription>
      </SheetHeader>
      <div className="space-y-6 p-5 sm:p-6">
        {item.has_conflict && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-950">Review this history before taking another action</p><p className="mt-1 text-sm leading-6 text-amber-900/80">The current client decision or archive state conflicts with recorded outreach or campaign activity.</p></div></div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Next action</p><p className="mt-2 text-sm font-semibold leading-5">{item.next_action || 'No action required'}</p></CardContent></Card>
          <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contact</p><p className="mt-2 text-sm font-semibold">{contactLabel(item)}</p>{canManage && item.contact.email && <p className="mt-1 truncate text-xs text-muted-foreground">{item.contact.email}</p>}</CardContent></Card>
          <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-2 text-sm font-semibold">{compactNumber(item.podcast.audience_size)}</p><p className="mt-1 text-xs text-muted-foreground">Estimated listeners</p></CardContent></Card>
        </div>
        <section><h2 className="text-lg font-semibold">Workflow facts</h2><div className="mt-3 rounded-xl border px-4"><DetailRow label="Client decision" value={item.decision.status ? <span className="capitalize">{item.decision.status}</span> : 'Awaiting decision'} /><DetailRow label="Campaign" value={item.campaign ? <span className="capitalize">{item.campaign.status.replace(/_/g, ' ')}</span> : 'Not prepared'} /><DetailRow label="Legacy outreach" value={item.legacy_outreach_at ? formattedDate(item.legacy_outreach_at) : 'None recorded'} /><DetailRow label="Booking" value={item.booking ? <span className="capitalize">{item.booking.status.replace(/_/g, ' ')}</span> : 'Not booked'} /><DetailRow label="Last activity" value={formattedDate(item.last_activity_at, true)} /></div>{item.booking?.match === 'podcast_name' && <p className="mt-2 text-xs leading-5 text-amber-700">This legacy booking was matched by client and podcast name because it does not carry a canonical podcast ID.</p>}</section>
        <section><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Host-ready research</h2><Badge variant="outline">{item.analysis.source === 'normalized' ? 'Current analysis' : item.analysis.source === 'legacy_cache' ? 'Legacy analysis' : 'Not researched'}</Badge></div>{item.analysis.clean_description ? <p className="mt-3 rounded-xl border bg-muted/15 p-4 text-sm leading-6 text-muted-foreground">{item.analysis.clean_description}</p> : <div className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No client-specific research is available yet.</div>}{item.analysis.fit_reasons.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Why the guest fits</h3><ul className="mt-2 space-y-2">{item.analysis.fit_reasons.map((reason, index) => <li key={`${reason}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>{reason}</span></li>)}</ul></div>}</section>
        {item.booking && <section><h2 className="text-lg font-semibold">Booking milestones</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Scheduled</p><p className="mt-1 text-sm font-semibold">{formattedDate(item.booking.scheduled_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Recording</p><p className="mt-1 text-sm font-semibold">{formattedDate(item.booking.recording_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Publication</p><p className="mt-1 text-sm font-semibold">{formattedDate(item.booking.publish_date)}</p></div></div></section>}
        <Separator />
        <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients/${encodeURIComponent(item.client.id)}?tab=approval`}><UserRound className="mr-2 h-4 w-4" />Client shortlist</Link></Button><Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns/${encodeURIComponent(item.client.id)}`}><Megaphone className="mr-2 h-4 w-4" />Client campaign</Link></Button><Button asChild variant={item.conversation?.thread_key ? 'default' : 'outline'}><Link to={inboxHref(baseHref, item)}><Inbox className="mr-2 h-4 w-4" />{item.conversation?.thread_key ? 'Open conversation' : 'Master Inbox'}</Link></Button>{canManage && <Button type="button" onClick={onLogPlacement}><CalendarPlus className="mr-2 h-4 w-4" />{item.booking ? 'Update placement' : 'Log placement'}</Button>}{safeExternalUrl(item.podcast.url) && <Button asChild variant="ghost"><a href={safeExternalUrl(item.podcast.url) || undefined} target="_blank" rel="noreferrer">Podcast page<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}{safeExternalUrl(item.booking?.episode_url) && <Button asChild><a href={safeExternalUrl(item.booking?.episode_url) || undefined} target="_blank" rel="noreferrer">Listen to episode<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}</div>
        {!canManage && <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>You can view this client overview. Owners and admins manage client decisions, campaign preparation, and delivery actions.</p></div>}
      </div>
    </>
  )
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  // Logging a placement from an opportunity carries the podcast across, so
  // the same show never has to be retyped to become a booking.
  const [placementItem, setPlacementItem] = useState<ClientPodcastSystemItem | null>(null)
  const today = localToday()

  const systemQuery = useQuery({
    queryKey: ['workspace-client-podcast-system', user?.id || 'unknown', workspaceId],
    queryFn: () => getWorkspaceClientPodcastSystem(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
    staleTime: 30_000,
  })
  const system = systemQuery.data
  const canManage = Boolean(system?.can_manage || isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin')
  const rollups = useMemo(() => (system?.clients || [])
    .map((client) => buildClientRollup(client, system?.items || [], today))
    .sort((left, right) => {
      const statusOrder = { active: 0, paused: 1, churned: 2 } as Record<string, number>
      const statusDifference = (statusOrder[left.client.status] ?? 3) - (statusOrder[right.client.status] ?? 3)
      if (statusDifference !== 0) return statusDifference
      if (left.needsAttention !== right.needsAttention) return left.needsAttention ? -1 : 1
      return (right.lastActivityAt || '').localeCompare(left.lastActivityAt || '') || left.client.name.localeCompare(right.client.name)
    }), [system?.clients, system?.items, today])
  const selectedRollup = UUID_PATTERN.test(requestedClientId)
    ? rollups.find((rollup) => rollup.client.id === requestedClientId) || null
    : null
  // Arriving from a reply in Master Inbox: open the placement that reply
  // belongs to, resolved by the show, since the inbox knows the podcast and
  // not the shortlist row.
  const requestedPodcastId = (searchParams.get('podcast') || '').trim().toLowerCase()
  const linkedItem = requestedPodcastId && requestedClientId
    ? system?.items.find((item) => (
      item.client.id === requestedClientId
      && item.podcast.podscan_id.trim().toLowerCase() === requestedPodcastId
    )) || null
    : null
  const selectedItem = system?.items.find((item) => item.id === selectedItemId)
    || linkedItem
    || null

  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: system?.workspace.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          system?.workspace.id,
          system?.workspace.logo_path,
          system?.workspace.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const chooseClient = (clientId: string) => {
    const next = new URLSearchParams(searchParams)
    if (clientId === 'all') next.delete('client')
    else next.set('client', clientId)
    setSearchParams(next, { replace: false })
    setSelectedItemId(null)
  }

  useEffect(() => {
    if (!system || !requestedClientId || selectedRollup) return
    const next = new URLSearchParams(searchParams)
    next.delete('client')
    setSearchParams(next, { replace: true })
  }, [requestedClientId, searchParams, selectedRollup, setSearchParams, system])

  if (!validWorkspaceId) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  const selectedIndex = selectedRollup ? rollups.findIndex((rollup) => rollup.client.id === selectedRollup.client.id) : -1
  const previousClient = selectedIndex > 0 ? rollups[selectedIndex - 1] : null
  const nextClient = selectedIndex >= 0 && selectedIndex < rollups.length - 1 ? rollups[selectedIndex + 1] : null

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-background to-sky-50 p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border-violet-200 bg-violet-100 text-violet-900 hover:bg-violet-100"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Private workspace overview</Badge>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Client Command Center</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">See every client, identify what needs attention, then switch into one client to understand their profile, podcasts, outreach, conversations, and placements.</p>
            </div>
            <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients`}><Users className="mr-2 h-4 w-4" />Manage clients</Link></Button><Button asChild><Link to={`${baseHref}/podcast-finder`}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button></div>
          </div>
        </section>

        {systemQuery.isLoading ? (
          <Card><CardContent className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Building the client overview…</span></CardContent></Card>
        ) : systemQuery.error || !system ? (
          <Card className="border-destructive/30"><CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertCircle className="h-9 w-9 text-destructive" /><h2 className="mt-4 text-lg font-semibold">Client Command Center unavailable</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{systemQuery.error instanceof Error ? systemQuery.error.message : 'The workspace client overview could not be loaded.'}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void systemQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : system.clients.length === 0 ? (
          <Card><CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Users className="h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 text-xl font-semibold">No clients in this workspace yet</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Create the first client account to start onboarding, building a guest profile, and finding podcast opportunities.</p><Button asChild className="mt-5"><Link to={`${baseHref}/clients`}>Open Clients</Link></Button></CardContent></Card>
        ) : (
          <>
            <Card className="sticky top-3 z-20 border-primary/20 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary"><LayoutDashboard className="h-4 w-4" /></div>
                  <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Viewing</p><Select value={selectedRollup?.client.id || 'all'} onValueChange={chooseClient}><SelectTrigger aria-label="Switch client overview" className="mt-1 h-9 w-full min-w-0 border-0 p-0 text-base font-semibold shadow-none focus:ring-0 sm:w-80"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All clients</SelectItem>{rollups.map((rollup) => <SelectItem key={rollup.client.id} value={rollup.client.id}>{rollup.client.name} · {rollup.client.status}</SelectItem>)}</SelectContent></Select></div>
                </div>
                {selectedRollup && <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => chooseClient('all')}><Users className="mr-2 h-4 w-4" />All clients</Button><Button type="button" variant="outline" size="icon" disabled={!previousClient} onClick={() => previousClient && chooseClient(previousClient.client.id)} aria-label="Previous client"><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" size="icon" disabled={!nextClient} onClick={() => nextClient && chooseClient(nextClient.client.id)} aria-label="Next client"><ChevronRight className="h-4 w-4" /></Button></div>}
              </CardContent>
            </Card>

            {selectedRollup ? (
              <SelectedClientView rollup={selectedRollup} baseHref={baseHref} canManage={canManage} onOpenItem={setSelectedItemId} />
            ) : (
              <AllClientsView rollups={rollups} items={system?.items || []} baseHref={baseHref} onChooseClient={chooseClient} onOpenItem={setSelectedItemId} />
            )}
          </>
        )}
      </div>

      <Sheet
        open={Boolean(selectedItem)}
        onOpenChange={(open) => {
          if (open) return
          setSelectedItemId(null)
          // Without this the linked placement reopens on every render.
          if (requestedPodcastId) {
            const next = new URLSearchParams(searchParams)
            next.delete('podcast')
            setSearchParams(next, { replace: true })
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
          {selectedItem && (
            <OpportunityDetail
              item={selectedItem}
              baseHref={baseHref}
              canManage={canManage}
              onLogPlacement={() => setPlacementItem(selectedItem)}
            />
          )}
        </SheetContent>
      </Sheet>
      {placementItem && (
        <ClientBookingDialog
          open={Boolean(placementItem)}
          onOpenChange={(open) => { if (!open) setPlacementItem(null) }}
          workspaceId={workspaceId}
          clientId={placementItem.client.id}
          clientName={placementItem.client.name}
          booking={placementItem.booking
            ? {
              id: placementItem.booking.id,
              client_id: placementItem.client.id,
              podcast_id: placementItem.podcast.podscan_id ?? null,
              shortlist_podcast_id: placementItem.podcast.id ?? null,
              podcast_name: placementItem.podcast.name,
              podcast_url: placementItem.podcast.url ?? null,
              host_name: placementItem.booking.host_name,
              scheduled_date: placementItem.booking.scheduled_date,
              recording_date: placementItem.booking.recording_date,
              publish_date: placementItem.booking.publish_date,
              status: placementItem.booking.status,
              episode_url: placementItem.booking.episode_url,
              prep_sent: placementItem.booking.prep_sent,
              notes: placementItem.booking.notes,
              created_at: placementItem.booking.created_at,
              updated_at: placementItem.booking.updated_at,
            }
            : {
              // Not yet a booking: seed the form from the opportunity so the
              // operator only chooses a stage and a date.
              id: '',
              client_id: placementItem.client.id,
              podcast_id: placementItem.podcast.podscan_id ?? null,
              shortlist_podcast_id: placementItem.podcast.id ?? null,
              podcast_name: placementItem.podcast.name,
              podcast_url: placementItem.podcast.url ?? null,
              host_name: null,
              scheduled_date: null,
              recording_date: null,
              publish_date: null,
              status: 'conversation_started',
              episode_url: null,
              prep_sent: false,
              notes: null,
              created_at: '',
              updated_at: '',
            }}
          onSaved={() => { setPlacementItem(null); void systemQuery.refetch() }}
        />
      )}
    </WorkspaceLayout>
  )
}

export default WorkspaceClientPodcastSystem
