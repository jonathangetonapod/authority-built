import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity,
  Ban,
  BookUser,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Handshake,
  Inbox,
  Loader2,
  Mail,
  MailX,
  MessageSquare,
  Mic,
  NotebookPen,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { OutreachSuppressionsDialog } from '@/components/workspace/OutreachSuppressionsDialog'
import {
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { decodeFeedText } from '@/lib/feedText'
import {
  RELATIONSHIP_MANUAL_STAGE_VIEW as MANUAL_STAGE_VIEW,
  RELATIONSHIP_STATE_VIEW as STATE_VIEW,
} from '@/lib/relationshipLabels'
import { describeQuiet, quietConversations } from '@/lib/relationshipAttention'
import { sortRelationships, type RelationshipSort } from '@/lib/relationshipSort'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import {
  addHostRelationshipNote,
  createHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationships,
  saveHostRelationship,
  type HostRelationshipClientIntent,
  type HostRelationshipDerivedState,
  type HostRelationshipManualStage,
  type HostRelationshipSummary,
} from '@/services/hostRelationships'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// The book grows with every host the agency ever contacts, and folding the
// legacy outreach ledger in took this workspace from 1 row to 106 in a day.
// Ten large cards per page meant eleven pages to scroll; a denser row lets a
// page hold enough to actually scan.
const RELATIONSHIPS_PER_PAGE = 25

/** How each derived state reads to an operator scanning the book. */
type StageDraft = HostRelationshipManualStage | 'derived'
type NoteKind = 'note' | 'call' | 'meeting'
type RelationshipFilter = 'all' | 'active' | 'warm' | 'placed' | 'do_not_contact'
type RelationshipView = 'overview' | 'notes' | 'threads' | 'activity'

interface RelationshipActivityItem {
  id: string
  kind: 'note' | 'call' | 'meeting' | 'stage_change' | 'system' | 'email'
  title: string
  body: string | null
  occurredAt: string
  clientName: string | null
  meta: string | null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

const EVENT_TITLES: Record<Exclude<RelationshipActivityItem['kind'], 'email'>, string> = {
  note: 'Internal note added',
  call: 'Call logged',
  meeting: 'Meeting logged',
  stage_change: 'Relationship stage changed',
  system: 'Relationship updated',
}

function podcastInitials(name: string): string {
  const words = decodeFeedText(name).trim().split(/\s+/u).filter(Boolean)
  if (words.length === 0) return 'P'
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[1][0]}`).toUpperCase()
}

// A cover that never loads is routine rather than exceptional: a show can take
// its artwork private or delete it long after the feed keeps pointing there,
// which is why roughly one in four Buzzsprout-hosted covers 403s. The stand-in
// therefore has to look deliberate instead of broken, and it has to separate
// the two cases an operator can act on — a show we cannot name yet, versus a
// named show whose cover simply is not reachable.
function PodcastArtwork({ imageUrl, name, identified = true, large = false }: {
  imageUrl: string | null
  name: string
  identified?: boolean
  large?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const sizeClass = large ? 'h-20 w-20 rounded-xl text-lg' : 'h-12 w-12 rounded-lg text-xs'
  const showImage = Boolean(imageUrl) && !imageFailed
  const label = identified
    ? (showImage ? `${decodeFeedText(name)} cover` : `${decodeFeedText(name)} — cover art unavailable`)
    : 'Show not identified yet'

  return (
    <div
      className={`relative ${sizeClass} flex shrink-0 items-center justify-center overflow-hidden border bg-primary/5 font-semibold text-primary`}
      title={label}
    >
      {/* The stand-in stays mounted underneath the image rather than being
          swapped in on error, so a cover that 403s degrades into it silently
          instead of flashing the browser's broken-image glyph first. */}
      {identified
        ? <span aria-hidden="true">{podcastInitials(name)}</span>
        : <Mic aria-hidden="true" className={large ? 'h-7 w-7 opacity-60' : 'h-4 w-4 opacity-60'} />}
      {showImage
        ? (
          <img
            src={imageUrl as string}
            alt={`${decodeFeedText(name)} cover`}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageFailed(true)}
          />
        )
        : <span className="sr-only">{label}</span>}
    </div>
  )
}

function ActivityItemView({ item, compact = false }: { item: RelationshipActivityItem; compact?: boolean }) {
  const Icon = item.kind === 'email'
    ? Mail
    : item.kind === 'call'
      ? PhoneCall
      : item.kind === 'meeting'
        ? CalendarDays
        : item.kind === 'note'
          ? NotebookPen
          : Activity
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
        </div>
        {(item.clientName || item.meta) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[item.clientName, item.meta].filter(Boolean).join(' · ')}
          </p>
        )}
        {item.body && (
          <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground/80 ${compact ? 'line-clamp-2' : ''}`}>
            {item.body}
          </p>
        )}
      </div>
    </div>
  )
}

interface WorkspaceRelationshipsProps {
  platformWorkspaceId?: string
}

const WorkspaceRelationships = ({ platformWorkspaceId }: WorkspaceRelationshipsProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const canManage = Boolean(
    isPlatformWorkspace
    || isPlatformAdmin
    || membership?.role === 'owner'
    || membership?.role === 'admin',
  )
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all')
  const [relationshipSort, setRelationshipSort] = useState<RelationshipSort>('recent')
  const [relationshipPage, setRelationshipPage] = useState(1)
  const [openPodcastId, setOpenPodcastId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<RelationshipView>('overview')
  const [threadSearch, setThreadSearch] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [stageDraft, setStageDraft] = useState<StageDraft>('derived')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientIntent, setClientIntent] = useState<HostRelationshipClientIntent>('considering')
  const [addOpen, setAddOpen] = useState(false)
  const [suppressionsOpen, setSuppressionsOpen] = useState(false)
  const [newShowName, setNewShowName] = useState('')
  const [newHostName, setNewHostName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newStage, setNewStage] = useState<StageDraft>('nurturing')
  const [newSummary, setNewSummary] = useState('')

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'relationships'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isPlatformWorkspace && validWorkspaceId,
    retry: false,
    gcTime: 0,
  })
  const selectedWorkspaceReady = !isPlatformWorkspace || Boolean(selectedWorkspaceQuery.data?.workspace)
  const bookQuery = useQuery({
    queryKey: ['host-relationships', workspaceId],
    queryFn: () => listHostRelationships(workspaceId),
    enabled: validWorkspaceId && selectedWorkspaceReady,
    retry: false,
  })
  const detailQuery = useQuery({
    queryKey: ['host-relationship', workspaceId, openPodcastId],
    queryFn: () => getHostRelationship(workspaceId, openPodcastId!),
    enabled: validWorkspaceId && selectedWorkspaceReady && Boolean(openPodcastId),
    retry: false,
  })
  const tenantClientsQuery = useQuery({
    queryKey: ['host-relationships', workspaceId, 'clients'],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: validWorkspaceId && selectedWorkspaceReady && canManage && !isPlatformWorkspace && Boolean(openPodcastId),
    retry: false,
  })

  // Stable identity so the derived memos below only recompute on new data.
  const relationships = useMemo(() => bookQuery.data ?? [], [bookQuery.data])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return relationships.filter((row) => (
      (
        relationshipFilter === 'all'
        || (relationshipFilter === 'active' && ['in_conversation', 'replied'].includes(row.derived_state))
        || (relationshipFilter === 'warm' && ['warm', 'nurturing'].includes(row.manual_stage ?? ''))
        || (relationshipFilter === 'placed' && row.derived_state === 'booked')
        || (relationshipFilter === 'do_not_contact' && (row.manual_stage === 'do_not_contact' || row.derived_state === 'suppressed'))
      )
      && (
        !term
        || decodeFeedText(row.podcast_name ?? '').toLowerCase().includes(term)
        || decodeFeedText(row.host_name ?? '').toLowerCase().includes(term)
        || (row.contact_email ?? '').toLowerCase().includes(term)
      )
    ))
  }, [relationshipFilter, relationships, search])
  const sorted = useMemo(() => sortRelationships(filtered, relationshipSort), [filtered, relationshipSort])
  const relationshipPageCount = Math.max(1, Math.ceil(sorted.length / RELATIONSHIPS_PER_PAGE))
  const currentRelationshipPage = Math.min(relationshipPage, relationshipPageCount)
  const relationshipPageStart = (currentRelationshipPage - 1) * RELATIONSHIPS_PER_PAGE
  const visibleRelationships = sorted.slice(
    relationshipPageStart,
    relationshipPageStart + RELATIONSHIPS_PER_PAGE,
  )

  // Live and warm relationships are the ones worth acting on; count them so
  // the header answers "what do we have" before any scrolling.
  // The count of live conversations is not the actionable fact — which of
  // them has gone silent is. Recency sort puts exactly those at the bottom.
  const quiet = useMemo(() => quietConversations(relationships), [relationships])
  const counts = useMemo(() => ({
    live: relationships.filter((row) => row.derived_state === 'in_conversation').length,
    placed: relationships.filter((row) => row.derived_state === 'booked').length,
    engaged: relationships.filter((row) => ['replied', 'declined'].includes(row.derived_state)).length,
  }), [relationships])

  const invalidate = (podcastId: string) => {
    void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId] })
    void queryClient.invalidateQueries({ queryKey: ['host-relationship', workspaceId, podcastId] })
  }
  const noteMutation = useMutation({
    mutationFn: (input: { podcastId: string; body: string; kind: NoteKind }) => (
      addHostRelationshipNote(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      setNoteDraft('')
      setNoteKind('note')
      toast.success('Interaction added to this relationship.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The interaction could not be saved.'),
  })
  const relationshipMutation = useMutation({
    mutationFn: (input: { podcastId: string; summary: string; manualStage: HostRelationshipManualStage | null }) => (
      saveHostRelationship(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      toast.success('Relationship details saved.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The relationship could not be saved.'),
  })
  const clientMutation = useMutation({
    mutationFn: (input: { podcastId: string; clientId: string; intent: HostRelationshipClientIntent }) => (
      linkHostRelationshipClient(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      setSelectedClientId('')
      setClientIntent('considering')
      toast.success('Client linked to this host.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The client could not be linked.'),
  })
  const createMutation = useMutation({
    mutationFn: () => createHostRelationship(workspaceId, {
      podcastName: newShowName.trim(),
      hostName: newHostName.trim() || null,
      contactEmail: newContactEmail.trim() || null,
      manualStage: newStage === 'derived' ? null : newStage,
      summary: newSummary.trim() || null,
    }),
    onSuccess: (result) => {
      const summary = newSummary.trim()
      const stage = newStage
      setAddOpen(false)
      setNewShowName('')
      setNewHostName('')
      setNewContactEmail('')
      setNewStage('nurturing')
      setNewSummary('')
      setOpenPodcastId(result.podcast_id)
      setActiveView('overview')
      setThreadSearch('')
      setSummaryDraft(summary)
      setStageDraft(stage)
      toast.success(result.created ? 'Relationship added to the book.' : 'Existing relationship updated.')
      invalidate(result.podcast_id)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The relationship could not be created.'),
  })

  const openRow = relationships.find((row) => row.podcast_id === openPodcastId) ?? null
  const detail = detailQuery.data ?? null
  const clients = isPlatformWorkspace
    ? selectedWorkspaceQuery.data?.clients ?? []
    : tenantClientsQuery.data ?? []
  const activeClients = clients.filter((client) => client.status === 'active')
  const internalNotes = detail?.events.filter((event) => ['note', 'call', 'meeting'].includes(event.kind)) ?? []
  const threadTerm = threadSearch.trim().toLowerCase()
  const visibleThreads = (detail?.threads ?? []).filter((thread) => (
    !threadTerm
    || [
      thread.subject,
      thread.client_name,
      thread.campaign_name,
      thread.from_email,
      thread.lead_email,
      thread.latest_message_body,
    ].filter(Boolean).join(' ').toLowerCase().includes(threadTerm)
  ))
  const clientNames = new Map((detail?.clients ?? []).map((client) => [client.client_id, client.client_name]))
  const activityItems: RelationshipActivityItem[] = [
    ...(detail?.events ?? []).map((event) => ({
      id: `event:${event.id}`,
      kind: event.kind,
      title: EVENT_TITLES[event.kind],
      body: event.body,
      occurredAt: event.occurred_at,
      clientName: event.client_id ? clientNames.get(event.client_id) ?? null : null,
      meta: null,
    })),
    ...(detail?.threads ?? []).map((thread) => ({
      id: `thread:${thread.thread_key}`,
      kind: 'email' as const,
      title: thread.subject || 'Inbox conversation saved',
      body: thread.latest_message_body,
      occurredAt: thread.latest_message_at || thread.updated_at,
      clientName: thread.client_name,
      meta: [thread.campaign_name, thread.from_email || thread.lead_email].filter(Boolean).join(' · ') || null,
    })),
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
  const selectedName = decodeFeedText(
    detail?.relationship?.podcast_name
    || openRow?.podcast_name
    || 'Show not identified',
  )
  const selectedHost = decodeFeedText(
    detail?.relationship?.host_name
    || openRow?.host_name
    || 'Host not identified',
  )
  const selectedState = detail?.derived?.state || openRow?.derived_state || 'none'
  /*
   * The reply happens in Master Inbox; this page only knows about it. The
   * quiet band and the saved threads named the conversation and stopped one
   * click short of the place a follow-up is actually written — the inbox
   * already links here, and this is the way back.
   */
  const inboxThreadHref = (thread: { thread_key: string; client_id: string | null }): string => {
    const params = new URLSearchParams()
    if (thread.client_id) params.set('client', thread.client_id)
    params.set('thread', thread.thread_key)
    return `${baseHref}/master-inbox?${params.toString()}`
  }
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  if (isPlatformWorkspace && selectedWorkspaceQuery.isLoading && validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </WorkspaceLayout>
    )
  }

  if (!validWorkspaceId || (isPlatformWorkspace && (selectedWorkspaceQuery.error || !selectedWorkspace))) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>
              {selectedWorkspaceQuery.error instanceof Error
                ? selectedWorkspaceQuery.error.message
                : 'Your account does not have an active workspace.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <BookUser className="h-6 w-6 text-primary" />Relationships
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Your agency's host CRM. Find a show, understand the relationship, and continue the right conversation.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-900">{counts.live} in conversation</Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">{counts.placed} placed</Badge>
              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-900">{counts.engaged} engaged</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSuppressionsOpen(true)}>
                <MailX className="mr-2 h-4 w-4" />Do not contact
              </Button>
              {canManage && (
                <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />Add relationship
                </Button>
              )}
            </div>
          </div>
        </div>

        {quiet.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {quiet.length === 1
                ? 'A live conversation is going quiet'
                : `${quiet.length} live conversations are going quiet`}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">
              Hosts mid-conversation with no touch in five days. Silence here is how a placement dies.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {quiet.slice(0, 6).map((row) => (
                <button
                  key={row.podcast_id}
                  type="button"
                  onClick={() => { setOpenPodcastId(row.podcast_id); setActiveView('overview') }}
                  className="flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
                >
                  <span className="max-w-48 truncate">{decodeFeedText(row.podcast_name ?? 'Show not identified')}</span>
                  <span className="tabular-nums text-amber-700">{describeQuiet(row.last_contacted_at)}</span>
                </button>
              ))}
              {quiet.length > 6 && (
                <span className="self-center text-xs text-amber-800">and {quiet.length - 6} more</span>
              )}
            </div>
          </div>
        )}

        {!canManage && (
          <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>You can use the relationship history while planning pitches. Owners and admins curate stages, notes, and client associations.</p>
          </div>
        )}

        <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search relationships"
              placeholder="Search podcasts, hosts, or emails"
              className="pl-9"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setRelationshipPage(1)
                setOpenPodcastId(null)
              }}
            />
          </div>
          <Select
            value={relationshipFilter}
            onValueChange={(value) => {
              setRelationshipFilter(value as RelationshipFilter)
              setRelationshipPage(1)
              setOpenPodcastId(null)
            }}
          >
            <SelectTrigger aria-label="Filter relationships" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All relationships</SelectItem>
              <SelectItem value="active">Active conversations</SelectItem>
              <SelectItem value="warm">Warm &amp; nurturing</SelectItem>
              <SelectItem value="placed">Guest placements</SelectItem>
              <SelectItem value="do_not_contact">Do not contact</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={relationshipSort}
            onValueChange={(value) => {
              setRelationshipSort(value as RelationshipSort)
              setRelationshipPage(1)
              setOpenPodcastId(null)
            }}
          >
            <SelectTrigger aria-label="Sort relationships" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent contact</SelectItem>
              <SelectItem value="show">Show name A–Z</SelectItem>
              <SelectItem value="host">Host name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {bookQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading the relationship book…
          </div>
        )}
        {bookQuery.error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-destructive">The relationship book could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void bookQuery.refetch()}>Retry</Button>
            </CardContent>
          </Card>
        )}
        {!bookQuery.isLoading && !bookQuery.error && filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm font-medium">
                {relationships.length === 0 ? 'No host relationships yet' : 'No relationships match that search'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {relationships.length === 0
                  ? 'Hosts appear here after outreach, a reply, a booking, or a relationship note.'
                  : 'Try a different search or relationship filter.'}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid items-start gap-3 xl:grid-cols-[22rem_minmax(0,1fr)]">
          {visibleRelationships.map((row: HostRelationshipSummary) => {
            const view = STATE_VIEW[row.derived_state] ?? STATE_VIEW.none
            const manualView = row.manual_stage ? MANUAL_STAGE_VIEW[row.manual_stage] : null
            const open = row.podcast_id === openPodcastId
            return (
              <Card
                key={row.podcast_id}
                className={open
                  ? 'overflow-hidden border-primary/40 ring-1 ring-primary/10 xl:col-span-2 xl:grid xl:grid-cols-[22rem_minmax(0,1fr)]'
                  : 'xl:col-start-1'}
              >
                <CardHeader className={open ? 'pb-3' : 'p-3'}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PodcastArtwork
                        imageUrl={row.podcast_image_url}
                        name={row.podcast_name ?? 'Show not identified'}
                        identified={Boolean(row.podcast_name)}
                      />
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{decodeFeedText(row.podcast_name ?? 'Show not identified')}</CardTitle>
                        <CardDescription className="mt-1 truncate">
                          {decodeFeedText(row.host_name || 'Host not identified')}
                          {row.contact_email ? ` · ${row.contact_email}` : ''}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={view.className}>{view.label}</Badge>
                      {manualView && (
                        <Badge variant="outline" className={manualView.className}>
                          {row.manual_stage === 'do_not_contact' && <Ban className="mr-1 h-3 w-3" />}
                          {manualView.label}
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant={open ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          const next = open ? null : row.podcast_id
                          setOpenPodcastId(next)
                          setActiveView('overview')
                          setThreadSearch('')
                          setSummaryDraft(next ? row.summary ?? '' : '')
                          setStageDraft(next ? row.manual_stage ?? 'derived' : 'derived')
                          setNoteDraft('')
                          setNoteKind('note')
                          setSelectedClientId('')
                          setClientIntent('considering')
                        }}
                      >
                        {open ? 'Close' : 'Open'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Last contact {formatDate(row.last_contacted_at)}</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{row.client_count} client{row.client_count === 1 ? '' : 's'}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{row.note_count} note{row.note_count === 1 ? '' : 's'}</span>
                    {row.booked_client_name && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <Handshake className="h-3 w-3" />Placed {row.booked_client_name}
                      </span>
                    )}
                  </div>
                </CardHeader>

                {open && (
                  <CardContent className="space-y-5 border-t pt-4 xl:col-start-2 xl:row-start-1 xl:border-l xl:border-t-0">
                    {detailQuery.isLoading && (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />Loading history…
                      </p>
                    )}
                    {detailQuery.error && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm text-destructive">The relationship history could not be loaded.</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>Retry</Button>
                      </div>
                    )}
                    {detail && (
                      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as RelationshipView)}>
                        <div className="flex flex-col gap-4 rounded-xl border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-4">
                            <PodcastArtwork
                              imageUrl={openRow?.podcast_image_url ?? null}
                              name={selectedName}
                              identified={Boolean(detail.relationship?.podcast_name || openRow?.podcast_name)}
                              large
                            />
                            <div className="min-w-0">
                              <h2 className="truncate text-xl font-semibold">{selectedName}</h2>
                              <p className="mt-1 truncate text-sm text-muted-foreground">
                                {selectedHost}{(detail.relationship?.contact_email || openRow?.contact_email) ? ` · ${detail.relationship?.contact_email || openRow?.contact_email}` : ''}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <Badge variant="outline" className={STATE_VIEW[selectedState].className}>{STATE_VIEW[selectedState].label}</Badge>
                                {openRow?.manual_stage && (
                                  <Badge variant="outline" className={MANUAL_STAGE_VIEW[openRow.manual_stage].className}>
                                    {MANUAL_STAGE_VIEW[openRow.manual_stage].label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          {detail.threads[0] && (
                            <Button asChild size="sm" variant="outline">
                              <Link to={inboxThreadHref(detail.threads[0])}>
                                <Inbox className="mr-2 h-4 w-4" />Reply in Master Inbox
                              </Link>
                            </Button>
                          )}
                          {canManage && (
                            <Button type="button" size="sm" onClick={() => setActiveView('notes')}>
                              <NotebookPen className="mr-2 h-4 w-4" />Add note
                            </Button>
                          )}
                        </div>

                        <div className="mt-4 overflow-x-auto border-b">
                          <TabsList aria-label="Relationship CRM sections" className="h-auto min-w-max justify-start bg-transparent p-0">
                            <TabsTrigger value="overview" className="rounded-b-none">Overview</TabsTrigger>
                            <TabsTrigger value="notes" className="rounded-b-none">
                              Notes <span className="ml-1 text-muted-foreground">{internalNotes.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="threads" className="rounded-b-none">
                              Threads <span className="ml-1 text-muted-foreground">{detail.threads.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="activity" className="rounded-b-none">
                              Activity <span className="ml-1 text-muted-foreground">{activityItems.length}</span>
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <TabsContent value="overview" className="mt-5 space-y-5">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">Last contact</p>
                              <p className="mt-1 text-sm font-medium">{formatDate(openRow?.last_contacted_at ?? null)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">Clients</p>
                              <p className="mt-1 text-sm font-medium">{detail.clients.length}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">Internal notes</p>
                              <p className="mt-1 text-sm font-medium">{internalNotes.length}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-3">
                              <p className="text-xs text-muted-foreground">Saved threads</p>
                              <p className="mt-1 text-sm font-medium">{detail.threads.length}</p>
                            </div>
                          </div>
                        {canManage ? (
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                            <div className="space-y-2">
                              <Label htmlFor="relationship-summary">What we know about this host</Label>
                              <Textarea
                                id="relationship-summary"
                                value={summaryDraft}
                                onChange={(event) => setSummaryDraft(event.target.value)}
                                placeholder="How they prefer to be pitched, what they cover, anything worth remembering next time."
                                className="min-h-28 resize-y"
                                maxLength={5_000}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="relationship-stage">Relationship stage</Label>
                              <Select value={stageDraft} onValueChange={(value) => setStageDraft(value as StageDraft)}>
                                <SelectTrigger id="relationship-stage"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="derived">Use outreach activity</SelectItem>
                                  <SelectItem value="nurturing">Nurturing</SelectItem>
                                  <SelectItem value="warm">Warm relationship</SelectItem>
                                  <SelectItem value="do_not_contact">Do not contact</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs leading-5 text-muted-foreground">
                                Do not contact blocks new pitches to this show. Other stages and notes guide the next pitch while recorded activity remains the source of truth.
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="w-fit"
                              disabled={
                                relationshipMutation.isPending
                                || (
                                  summaryDraft === (openRow?.summary ?? '')
                                  && stageDraft === (openRow?.manual_stage ?? 'derived')
                                )
                              }
                              onClick={() => relationshipMutation.mutate({
                                podcastId: row.podcast_id,
                                summary: summaryDraft,
                                manualStage: stageDraft === 'derived' ? null : stageDraft,
                              })}
                            >
                              {relationshipMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save relationship
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What we know</p>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
                              {openRow?.summary || 'No relationship summary has been recorded.'}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clients on this host</p>
                          {detail.clients.length === 0
                            ? <p className="mt-1.5 text-sm text-muted-foreground">No client history is linked yet.</p>
                            : (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {detail.clients.map((client) => (
                                  <Badge key={client.client_id} variant="secondary" className="font-normal">
                                    {client.client_name ?? 'Client'} · {client.intent.replace('_', ' ')}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>

                        {canManage && (
                          <div className="space-y-2 rounded-xl border bg-muted/10 p-4">
                            <p className="text-sm font-medium">Add or update a client plan</p>
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                <SelectTrigger aria-label="Choose a client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                                <SelectContent>
                                  {activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Select value={clientIntent} onValueChange={(value) => setClientIntent(value as HostRelationshipClientIntent)}>
                                <SelectTrigger aria-label="Choose client intent"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="considering">Considering</SelectItem>
                                  <SelectItem value="pitched">Pitched</SelectItem>
                                  <SelectItem value="placed">Placed</SelectItem>
                                  <SelectItem value="declined">Declined</SelectItem>
                                  <SelectItem value="ruled_out">Ruled out</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={!selectedClientId || clientMutation.isPending}
                                onClick={() => clientMutation.mutate({
                                  podcastId: row.podcast_id,
                                  clientId: selectedClientId,
                                  intent: clientIntent,
                                })}
                              >
                                {clientMutation.isPending
                                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  : <UserRoundPlus className="mr-2 h-4 w-4" />}
                                Save client
                              </Button>
                            </div>
                            {tenantClientsQuery.error && !isPlatformWorkspace && (
                              <p className="text-xs text-destructive">The client list could not be loaded.</p>
                            )}
                          </div>
                        )}

                        <div className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">Recent activity</p>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setActiveView('activity')}>
                              View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {activityItems.length === 0
                            ? <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded yet.</p>
                            : <div className="mt-3 divide-y">{activityItems.slice(0, 4).map((item) => <ActivityItemView key={item.id} item={item} compact />)}</div>}
                        </div>
                        </TabsContent>

                        <TabsContent value="notes" className="mt-5 space-y-5">
                        {canManage && (
                          <div className="space-y-2">
                            <Label htmlFor="relationship-note">Add an internal note</Label>
                            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                              <Select value={noteKind} onValueChange={(value) => setNoteKind(value as NoteKind)}>
                                <SelectTrigger aria-label="Interaction type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="note">Note</SelectItem>
                                  <SelectItem value="call">Call</SelectItem>
                                  <SelectItem value="meeting">Meeting</SelectItem>
                                </SelectContent>
                              </Select>
                              <Textarea
                                id="relationship-note"
                                value={noteDraft}
                                onChange={(event) => setNoteDraft(event.target.value)}
                                placeholder="Spoke with the producer, asked us to come back in Q3 with an operations guest."
                                className="min-h-20 resize-y"
                                maxLength={5_000}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={noteMutation.isPending || !noteDraft.trim()}
                              onClick={() => noteMutation.mutate({
                                podcastId: row.podcast_id,
                                body: noteDraft.trim(),
                                kind: noteKind,
                              })}
                            >
                              {noteMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              {noteKind === 'note' ? 'Save note' : noteKind === 'call' ? 'Log call' : 'Log meeting'}
                            </Button>
                          </div>
                        )}

                        <div>
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Internal notes</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Private to your agency workspace.</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{internalNotes.length} total</span>
                          </div>
                          {internalNotes.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No internal notes yet.</p>
                            : (
                              <div className="mt-3 divide-y rounded-xl border px-4">
                                {internalNotes.map((event) => (
                                  <div key={event.id} className="py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{EVENT_TITLES[event.kind]}</p>
                                      <p className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</p>
                                    </div>
                                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{event.body}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                        </TabsContent>

                        <TabsContent value="threads" className="mt-5 space-y-4">
                        <div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-sm font-medium">Saved inbox threads</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Conversations deliberately saved from Master Inbox.</p>
                            </div>
                            {detail.threads.length > 1 && (
                              <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  aria-label="Search saved threads"
                                  value={threadSearch}
                                  onChange={(event) => setThreadSearch(event.target.value)}
                                  placeholder="Search threads"
                                  className="h-9 pl-8"
                                />
                              </div>
                            )}
                          </div>
                          {detail.threads.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No Master Inbox conversation has been saved yet.</p>
                            : visibleThreads.length === 0
                              ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No saved threads match that search.</p>
                            : (
                              <ul className="mt-3 space-y-2">
                                {visibleThreads.map((thread) => (
                                  <li key={thread.thread_key} className="rounded-lg border bg-muted/10 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{thread.subject || '(no subject)'}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {thread.client_name || 'Unassigned client'}
                                          {thread.campaign_name ? ` · ${thread.campaign_name}` : ''}
                                          {(thread.from_email || thread.lead_email) ? ` · ${thread.from_email || thread.lead_email}` : ''}
                                        </p>
                                      </div>
                                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                        {formatDate(thread.latest_message_at)}
                                        <Link to={inboxThreadHref(thread)} className="font-medium text-primary hover:underline">
                                          Open in Master Inbox
                                        </Link>
                                      </span>
                                    </div>
                                    {thread.latest_message_body && (
                                      <details className="mt-2 text-sm">
                                        <summary className="cursor-pointer text-xs font-medium text-primary">View saved message</summary>
                                        <p className="mt-2 whitespace-pre-wrap border-l-2 pl-3 leading-6 text-foreground/80">
                                          {thread.latest_message_body}
                                        </p>
                                      </details>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                        </div>
                        </TabsContent>

                        <TabsContent value="activity" className="mt-5">
                        <div>
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Activity log</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Internal notes and saved conversations, newest first.</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{activityItems.length} activities</span>
                          </div>
                          {activityItems.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
                            : (
                              <div className="mt-4 divide-y rounded-xl border px-4 pt-4">
                                {activityItems.map((item) => <ActivityItemView key={item.id} item={item} />)}
                              </div>
                            )}
                        </div>
                        </TabsContent>
                      </Tabs>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

        {sorted.length > RELATIONSHIPS_PER_PAGE && (
          <nav
            aria-label="Relationship pagination"
            className="flex flex-col gap-3 rounded-xl border bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-muted-foreground">
              Showing {relationshipPageStart + 1}–{Math.min(relationshipPageStart + RELATIONSHIPS_PER_PAGE, sorted.length)} of {sorted.length} relationships
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentRelationshipPage === 1}
                onClick={() => {
                  setRelationshipPage(currentRelationshipPage - 1)
                  setOpenPodcastId(null)
                }}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">
                Page {currentRelationshipPage} of {relationshipPageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentRelationshipPage === relationshipPageCount}
                onClick={() => {
                  setRelationshipPage(currentRelationshipPage + 1)
                  setOpenPodcastId(null)
                }}
              >
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}

        <OutreachSuppressionsDialog
          workspaceId={workspaceId}
          canManage={canManage}
          open={suppressionsOpen}
          onOpenChange={setSuppressionsOpen}
        />

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-xl">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (newShowName.trim()) createMutation.mutate()
              }}
            >
              <DialogHeader>
                <DialogTitle>Add a relationship</DialogTitle>
                <DialogDescription>
                  Add a host before outreach exists. Their email lets GOAP connect this context to a future canonical show when the match is unambiguous.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-show">Podcast or show</Label>
                  <Input
                    id="new-relationship-show"
                    value={newShowName}
                    onChange={(event) => setNewShowName(event.target.value)}
                    placeholder="Founder & Operator"
                    maxLength={500}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-relationship-host">Host name</Label>
                  <Input
                    id="new-relationship-host"
                    value={newHostName}
                    onChange={(event) => setNewHostName(event.target.value)}
                    placeholder="Morgan Host"
                    maxLength={300}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-relationship-email">Host email</Label>
                  <Input
                    id="new-relationship-email"
                    type="email"
                    value={newContactEmail}
                    onChange={(event) => setNewContactEmail(event.target.value)}
                    placeholder="morgan@example.com"
                    maxLength={254}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-stage">Relationship stage</Label>
                  <Select value={newStage} onValueChange={(value) => setNewStage(value as StageDraft)}>
                    <SelectTrigger id="new-relationship-stage"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="derived">Use recorded activity</SelectItem>
                      <SelectItem value="nurturing">Nurturing</SelectItem>
                      <SelectItem value="warm">Warm relationship</SelectItem>
                      <SelectItem value="do_not_contact">Do not contact</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-summary">What should the team remember?</Label>
                  <Textarea
                    id="new-relationship-summary"
                    value={newSummary}
                    onChange={(event) => setNewSummary(event.target.value)}
                    placeholder="Prefers concise, operator-led ideas. Reconnect after their fall season planning call."
                    className="min-h-28 resize-y"
                    maxLength={5_000}
                  />
                </div>
              </div>
              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <Button type="submit" disabled={!newShowName.trim() || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add relationship
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceRelationships
