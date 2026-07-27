import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  BookUser,
  Handshake,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { decodeHtmlEntities } from '@/lib/htmlEntities'
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

/** How each derived state reads to an operator scanning the book. */
const STATE_VIEW: Record<HostRelationshipDerivedState, { label: string; className: string }> = {
  in_conversation: { label: 'In conversation', className: 'border-sky-200 bg-sky-50 text-sky-900' },
  booked: { label: 'Placed a guest', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  replied: { label: 'Replied', className: 'border-violet-200 bg-violet-50 text-violet-900' },
  declined: { label: 'Passed', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  suppressed: { label: 'Do not contact', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
  pitched: { label: 'Pitched, no reply', className: 'border-muted bg-muted/50 text-muted-foreground' },
  none: { label: 'Not contacted', className: 'border-muted bg-muted/30 text-muted-foreground' },
}

const MANUAL_STAGE_VIEW: Record<HostRelationshipManualStage, { label: string; className: string }> = {
  nurturing: { label: 'Nurturing', className: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
  warm: { label: 'Warm relationship', className: 'border-orange-200 bg-orange-50 text-orange-900' },
  do_not_contact: { label: 'Marked do not contact', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
}

type StageDraft = HostRelationshipManualStage | 'derived'
type NoteKind = 'note' | 'call' | 'meeting'

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
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
  const [openPodcastId, setOpenPodcastId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [stageDraft, setStageDraft] = useState<StageDraft>('derived')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientIntent, setClientIntent] = useState<HostRelationshipClientIntent>('considering')
  const [addOpen, setAddOpen] = useState(false)
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
    if (!term) return relationships
    return relationships.filter((row) => (
      decodeHtmlEntities(row.podcast_name ?? '').toLowerCase().includes(term)
      || decodeHtmlEntities(row.host_name ?? '').toLowerCase().includes(term)
      || (row.contact_email ?? '').toLowerCase().includes(term)
    ))
  }, [relationships, search])

  // Live and warm relationships are the ones worth acting on; count them so
  // the header answers "what do we have" before any scrolling.
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
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
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
              Every host this workspace has reached, across all clients. What you know about them lives here,
              so the next pitch continues the relationship instead of restarting it.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-900">{counts.live} in conversation</Badge>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-900">{counts.placed} placed</Badge>
              <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-900">{counts.engaged} engaged</Badge>
            </div>
            {canManage && (
              <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Add relationship
              </Button>
            )}
          </div>
        </div>

        {!canManage && (
          <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>You can use the relationship history while planning pitches. Owners and admins curate stages, notes, and client associations.</p>
          </div>
        )}

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search relationships"
            placeholder="Search by show, host, or email"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
                  : 'Try a different show, host, or email address.'}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {filtered.map((row: HostRelationshipSummary) => {
            const view = STATE_VIEW[row.derived_state] ?? STATE_VIEW.none
            const manualView = row.manual_stage ? MANUAL_STAGE_VIEW[row.manual_stage] : null
            const open = row.podcast_id === openPodcastId
            return (
              <Card key={row.podcast_id} className={open ? 'border-primary/40 ring-1 ring-primary/10' : undefined}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{decodeHtmlEntities(row.podcast_name ?? 'Untitled show')}</CardTitle>
                      <CardDescription className="mt-1">
                        {decodeHtmlEntities(row.host_name || 'Host not identified')}
                        {row.contact_email ? ` · ${row.contact_email}` : ''}
                      </CardDescription>
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
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
                  <CardContent className="space-y-5 border-t pt-4">
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
                      <>
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

                        {canManage && (
                          <div className="space-y-2">
                            <Label htmlFor="relationship-note">Log an interaction</Label>
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
                              {noteMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Add interaction
                            </Button>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved conversations</p>
                          {detail.threads.length === 0
                            ? <p className="mt-1.5 text-sm text-muted-foreground">No Master Inbox conversation has been saved yet.</p>
                            : (
                              <ul className="mt-1.5 space-y-2">
                                {detail.threads.map((thread) => (
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
                                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(thread.latest_message_at)}</span>
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

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
                          {detail.events.length === 0
                            ? <p className="mt-1.5 text-sm text-muted-foreground">Nothing recorded yet.</p>
                            : (
                              <ul className="mt-1.5 space-y-2">
                                {detail.events.map((event) => (
                                  <li key={event.id} className="rounded-lg border bg-muted/10 p-3">
                                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                      {event.kind.replace('_', ' ')} · {formatDate(event.occurred_at)}
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{event.body}</p>
                                  </li>
                                ))}
                              </ul>
                            )}
                        </div>
                      </>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

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
