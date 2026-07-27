import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  BookUser,
  CalendarCheck2,
  Inbox,
  Loader2,
  MailOpen,
  Megaphone,
  Globe,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waypoints,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  draftWorkspaceInboxReply,
  getWorkspaceInboxLeadDetail,
  getWorkspaceInboxThreads,
  setWorkspaceInboxLeadInterest,
  sendWorkspaceInboxReply,
  setWorkspaceInboxThreadStatus,
  type WorkspaceInboxNudge,
  type WorkspaceInboxReplyClassification,
  type WorkspaceInboxThread,
  type WorkspaceInboxThreadStatus,
  type WorkspaceLeadInterestValue,
} from '@/services/workspaceCampaigns'
import { captureHostRelationshipThread } from '@/services/hostRelationships'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  type ClientSdrProfile,
} from '@/lib/clientSdrProfile'
import {
  getWorkspaceClientSdrContext,
  type WorkspaceClient,
  type WorkspaceClientSdrContext,
} from '@/services/clients'

type InboxScope = 'interested' | 'other'
type InboxFilter = 'all' | 'needs_reply' | 'review' | 'replied' | 'booked' | 'archived'

const inboxFilters: Array<{ value: InboxFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'Every open conversation in this reply scope' },
  { value: 'needs_reply', label: 'Needs reply', title: 'The host sent the newest message and no draft is staged' },
  { value: 'review', label: 'Review', title: 'An AI reply package is staged and waiting for review' },
  { value: 'replied', label: 'Replied', title: 'The workspace has replied' },
  { value: 'booked', label: 'Booked', title: 'Conversations marked as a confirmed booking' },
  { value: 'archived', label: 'Archived', title: 'Conversations closed out of the inbox — reopen any time' },
]

// Instantly lt_interest_status values.
const INTEREST_STATUS: Record<number, { label: string; className: string }> = {
  1: { label: 'Interested', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  2: { label: 'Meeting booked', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  3: { label: 'Meeting completed', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  4: { label: 'Won', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  0: { label: 'Out of office', className: 'bg-muted text-muted-foreground' },
  [-1]: { label: 'Not interested', className: 'bg-muted text-muted-foreground' },
  [-2]: { label: 'Wrong person', className: 'bg-muted text-muted-foreground' },
  [-3]: { label: 'Lost', className: 'bg-muted text-muted-foreground' },
  [-4]: { label: 'No show', className: 'border-amber-200 bg-amber-50 text-amber-800' },
}

const leadInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase()
}

const threadStatus = (thread: WorkspaceInboxThread, sentThreadIds: Set<string>): WorkspaceInboxThreadStatus => {
  if (sentThreadIds.has(thread.id)) return 'replied'
  return thread.state?.status ?? 'needs_reply'
}

const statusPill: Partial<Record<WorkspaceInboxThreadStatus, { label: string; className: string }>> = {
  review: { label: 'Review', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  replied: { label: 'Replied', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  booked: { label: 'Booked', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  archived: { label: 'Archived', className: 'bg-muted text-muted-foreground' },
}

const aiRoutingSteps = [
  {
    title: 'Reply received',
    detail: 'Keep the Instantly thread and sender identity intact.',
    icon: MailOpen,
  },
  {
    title: 'Client resolved',
    detail: 'Campaign and podcast records identify the exact client.',
    icon: Waypoints,
  },
  {
    title: 'Client AI SDR loaded',
    detail: 'Use that client’s approved positioning, topics, proof, listener value, and booking details.',
    icon: Bot,
  },
  {
    title: 'Review or act',
    detail: 'Draft, reply, or help book according to the approved policy.',
    icon: CalendarCheck2,
  },
] as const

interface MasterInboxPreviewProps {
  workspaceId: string
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: Error | null
  baseHref: string
  canManage: boolean
}

function ClientSdrContextPanel({
  context,
  loading,
  error,
  client,
  baseHref,
  onRetry,
}: {
  context?: WorkspaceClientSdrContext
  loading: boolean
  error: Error | null
  client: WorkspaceClient
  baseHref: string
  onRetry: () => void
}) {
  if (loading) {
    return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }
  if (error || !context) {
    return (
      <div className="mx-auto flex min-h-96 max-w-lg flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-600" />
        <h2 className="mt-4 text-lg font-semibold">AI SDR context unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error?.message || 'This client context could not be loaded.'}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-5 lg:p-7">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{context.client_name} AI SDR context</h2>
              <Badge
                variant="outline"
                className={context.safe_to_draft
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'}
              >
                {context.client_status !== 'active'
                  ? `${context.client_status[0].toUpperCase()}${context.client_status.slice(1)} — drafting off`
                  : context.safe_to_draft
                    ? 'Ready for review drafts'
                    : `${context.readiness.completed_fields} of ${context.readiness.total_fields}`}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              This is the exact client-scoped context Master Inbox will attach after a mapped reply resolves to {context.client_name}.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}?tab=ai-sdr`}><Bot className="mr-2 h-4 w-4" />Edit AI SDR Profile</Link>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.map((field) => {
          const value = context.ai_sdr_profile[field.id as keyof ClientSdrProfile]
          return (
            <div key={field.id} className={`rounded-xl border p-3.5 text-left ${value ? 'bg-muted/10' : 'border-dashed bg-background'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{field.shortLabel}</p>
                {field.core && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Core</span>}
              </div>
              <p className={`mt-2 line-clamp-3 text-xs leading-5 ${value ? 'text-foreground/80' : 'italic text-muted-foreground'}`}>{value || 'Not set yet.'}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-left">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Delivery authority is off.</span>{' '}
          Loading this profile is read-only. Sending still requires a separate workspace-authorized action after a real conversation is connected.
        </p>
      </div>
    </div>
  )
}

const MasterInboxPreview = ({ workspaceId, clients, clientsLoading, clientsError, baseHref, canManage }: MasterInboxPreviewProps) => {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<InboxScope>('interested')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedClientId = searchParams.get('client') || ''
  const selectedClient = clients.find((client) => client.id === requestedClientId) || null
  const selectedClientId = selectedClient?.id || 'all-clients'
  const activeClients = clients.filter((client) => client.status === 'active')
  const readyClientCount = activeClients.filter((client) => client.ai_sdr_profile_ready).length
  const sdrContextQuery = useQuery({
    queryKey: ['workspace-client-sdr-context', workspaceId, selectedClient?.id || 'none'],
    queryFn: () => getWorkspaceClientSdrContext(workspaceId, selectedClient!.id),
    enabled: Boolean(workspaceId && selectedClient),
    retry: false,
  })
  const inboxQuery = useQuery({
    queryKey: ['workspace-inbox', workspaceId],
    queryFn: () => getWorkspaceInboxThreads(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
  const threads = useMemo(() => inboxQuery.data?.threads ?? [], [inboxQuery.data?.threads])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftedForThread, setDraftedForThread] = useState<string | null>(null)
  const [draftClassification, setDraftClassification] = useState<WorkspaceInboxReplyClassification | null>(null)
  const [draftNudges, setDraftNudges] = useState<WorkspaceInboxNudge[]>([])
  const [sentThreadIds, setSentThreadIds] = useState<Set<string>>(new Set())

  const counts = useMemo(() => ({
    interested: threads.filter((thread) => thread.interested).length,
    other: threads.filter((thread) => !thread.interested).length,
  }), [threads])
  const filterCounts = useMemo(() => {
    const counts: Record<InboxFilter, number> = { all: 0, needs_reply: 0, review: 0, replied: 0, booked: 0, archived: 0 }
    for (const thread of threads) {
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) continue
      const status = threadStatus(thread, sentThreadIds)
      counts[status] += 1
      if (status !== 'archived') counts.all += 1
    }
    return counts
  }, [threads, selectedClient, sentThreadIds])
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    return threads.filter((thread) => {
      if (scope === 'interested' ? !thread.interested : thread.interested) return false
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) return false
      const status = threadStatus(thread, sentThreadIds)
      if (filter === 'all' ? status === 'archived' : status !== filter) return false
      if (query) {
        const haystack = [thread.subject, thread.from_email, thread.body_text, thread.campaign?.client?.name ?? '', thread.campaign?.campaign_name ?? '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [threads, scope, search, selectedClient, filter, sentThreadIds])
  const selectedThread = visibleThreads.find((thread) => thread.id === selectedThreadId)
    || threads.find((thread) => thread.id === selectedThreadId)
    || null
  const threadClient = selectedThread?.campaign?.client
    ? clients.find((client) => client.id === selectedThread.campaign?.client?.id) ?? null
    : null
  // Lead identity is fetched lazily for the open conversation only: campaigns
  // built directly in Instantly have no local target row, so this is the only
  // place a host's real name, company, and engagement can come from.
  const leadDetailQuery = useQuery({
    queryKey: ['workspace-inbox-lead', workspaceId, selectedThread?.lead_id || 'none'],
    queryFn: () => getWorkspaceInboxLeadDetail(workspaceId, selectedThread!.lead_id!),
    enabled: Boolean(workspaceId && selectedThread?.lead_id),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const leadDetail = leadDetailQuery.data ?? null
  const leadFullName = [leadDetail?.first_name, leadDetail?.last_name].filter(Boolean).join(' ').trim()
  const leadName = leadFullName
    || selectedThread?.lead_context?.host_name
    || selectedThread?.from_email
    || selectedThread?.lead_email
    || 'Unknown lead'
  const leadSubtitle = [leadDetail?.job_title, leadDetail?.company_name].filter(Boolean).join(' · ')
  const leadWebsite = leadDetail?.website ? safeExternalUrl(leadDetail.website) : null
  const engagement = leadDetail
    ? { opens: leadDetail.opens, replies: leadDetail.replies, clicks: leadDetail.clicks }
    : selectedThread?.lead_context
      ? { opens: selectedThread.lead_context.opens, replies: selectedThread.lead_context.replies, clicks: 0 }
      : null
  const firstContactedAt = leadDetail?.first_contacted_at
    || selectedThread?.lead_context?.first_message_at
    || null

  const captureRelationshipMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => {
      const isSelected = thread.id === selectedThread?.id
      return captureHostRelationshipThread(workspaceId, {
        podcastId: thread.lead_context?.podcast_id ?? null,
        // Never a stand-in name. podcast_name is the show's identity in the
        // relationship book and part of how it dedupes a host across clients,
        // so a placeholder here forks one host into two rows later. Sending
        // null lets the server resolve the show from the host's address.
        podcastName: thread.lead_context?.podcast_name || null,
        // leadDetail is fetched for the open conversation only, so its
        // identity may only be stamped on that same thread.
        hostName: (isSelected ? leadFullName : '') || thread.lead_context?.host_name || null,
        contactEmail: (isSelected ? leadDetail?.email : null)
          || thread.lead_email || thread.from_email || null,
        threadKey: thread.thread_key || thread.id,
        clientId: thread.campaign?.client?.id ?? null,
        messageId: thread.id,
        subject: thread.subject || null,
        fromEmail: thread.from_email || null,
        toEmail: thread.to_email || null,
        body: thread.body_text || null,
        receivedAt: thread.received_at,
        campaignId: thread.campaign?.campaign_id ?? null,
        campaignName: thread.campaign?.campaign_name ?? null,
      })
    },
    onSuccess: (result) => {
      // An unidentified row is a task, not a failure: say so, so nobody has to
      // notice it later in a list of shows that all look named.
      toast.success(result.show_identified === false
        ? 'Conversation saved. The show could not be identified from this address — name it in Relationships.'
        : result.relationship_created
          ? 'Relationship created and conversation saved.'
          : 'Conversation saved to the relationship book.')
      void inboxQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId] })
      void queryClient.invalidateQueries({ queryKey: ['host-relationship', workspaceId, result.podcast_id] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The conversation could not be saved to relationships.')
    },
  })

  const draftMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => draftWorkspaceInboxReply(
      workspaceId,
      thread.campaign!.client!.id,
      thread.subject || '(no subject)',
      thread.body_text,
      thread.thread_key
        ? {
          thread_key: thread.thread_key,
          email_id: thread.id,
          force: draftedForThread === thread.id,
          lead_email: thread.lead_email || thread.from_email,
        }
        : undefined,
    ),
    onSuccess: (draft, thread) => {
      // Race guard: only stage the result if the thread it was drafted for is
      // still the open conversation.
      if (selectedThreadId !== thread.id) return
      setDraftSubject(draft.subject)
      setDraftBody(draft.body)
      setDraftedForThread(thread.id)
      setDraftClassification(draft.classification)
      setDraftNudges(draft.nudges)
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The reply draft could not be generated.')
    },
  })
  const sendMutation = useMutation({
    mutationFn: (thread: WorkspaceInboxThread) => sendWorkspaceInboxReply(workspaceId, {
      reply_to_id: thread.id,
      eaccount: thread.eaccount!,
      subject: draftSubject.trim() || `Re: ${thread.subject}`,
      message: draftBody.trim(),
      ...(thread.thread_key ? { thread_key: thread.thread_key } : {}),
      ...(thread.campaign?.client ? { client_id: thread.campaign.client.id } : {}),
    }),
    onSuccess: (_result, thread) => {
      setSentThreadIds((current) => new Set([...current, thread.id]))
      toast.success('Reply sent through Instantly.')
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The reply could not be sent.')
    },
  })
  const interestMutation = useMutation({
    mutationFn: (input: { thread: WorkspaceInboxThread; value: WorkspaceLeadInterestValue }) =>
      setWorkspaceInboxLeadInterest(workspaceId, {
        lead_email: input.thread.lead_email || input.thread.from_email,
        interest_value: input.value,
        ...(input.thread.campaign?.campaign_id ? { campaign_id: input.thread.campaign.campaign_id } : {}),
      }),
    onSuccess: (_result, input) => {
      toast.success(input.value === null ? 'Status reset in Instantly.' : 'Status updated in Instantly.')
      void inboxQuery.refetch()
      void leadDetailQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The lead status could not be updated.')
    },
  })
  const statusMutation = useMutation({
    mutationFn: (input: { thread: WorkspaceInboxThread; status?: 'needs_reply' | 'booked' | 'archived'; nudges_paused?: boolean }) =>
      setWorkspaceInboxThreadStatus(workspaceId, {
        thread_key: input.thread.thread_key || input.thread.id,
        client_id: input.thread.campaign!.client!.id,
        ...(input.status ? { status: input.status } : {}),
        ...(input.nudges_paused !== undefined ? { nudges_paused: input.nudges_paused } : {}),
        // Booking a conversation needs the lead address to find the outreach
        // it came from, so the placement is created against the right show.
        ...(input.status === 'booked' && (input.thread.lead_email || input.thread.from_email)
          ? { lead_email: input.thread.lead_email || input.thread.from_email }
          : {}),
      }),
    onSuccess: (_result, input) => {
      toast.success(input.status === 'archived'
        ? 'Conversation archived.'
        : input.status === 'booked'
          ? _result?.booking_id
            ? 'Booked — the placement is on the client’s calendar.'
            : 'Marked as booked.'
          : input.status === 'needs_reply'
            ? 'Conversation reopened.'
            : input.nudges_paused
              ? 'Nudges paused for this conversation.'
              : 'Nudges resumed.')
      void inboxQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The conversation state could not be saved.')
    },
  })
  const openThread = (threadId: string) => {
    setSelectedThreadId(threadId)
    const thread = threads.find((item) => item.id === threadId)
    const persisted = thread?.state?.draft
    if (persisted && !thread.state?.draft_stale) {
      // Restore the staged review package (Reply-style persisted runs).
      setDraftSubject(persisted.subject)
      setDraftBody(persisted.body)
      setDraftedForThread(threadId)
      setDraftClassification((thread.state?.classification ?? null) as WorkspaceInboxReplyClassification | null)
      setDraftNudges(persisted.nudges)
    } else {
      setDraftSubject('')
      setDraftBody('')
      setDraftedForThread(null)
      setDraftClassification(null)
      setDraftNudges([])
    }
  }

  const selectClient = (clientId: string) => {
    const next = new URLSearchParams(searchParams)
    if (clientId === 'all-clients') next.delete('client')
    else next.set('client', clientId)
    setSearchParams(next, { replace: true })
    // Switching clients closes the previous client's open conversation.
    setSelectedThreadId(null)
    setDraftSubject('')
    setDraftBody('')
    setDraftedForThread(null)
    setDraftClassification(null)
    setDraftNudges([])
  }

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="border-b bg-background">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Inbox scope" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'interested'}
                onClick={() => setScope('interested')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'interested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Interested only <span className="ml-1 text-muted-foreground">{counts.interested}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'other'}
                onClick={() => setScope('other')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'other' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Other replies <span className="ml-1 text-muted-foreground">{counts.other}</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
                placeholder="Search conversations"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Badge variant="outline" className="w-fit gap-2 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {clientsLoading
              ? 'Loading client AI SDR profiles'
              : clientsError
                ? 'Client AI SDR profiles unavailable'
                : activeClients.length === 0
                  ? 'Add a client to create an AI SDR profile'
                  : `${readyClientCount} of ${activeClients.length} client AI SDR${activeClients.length === 1 ? '' : 's'} ready`}
          </Badge>
        </div>

        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto border-t bg-muted/10 px-3 py-2 lg:px-4" aria-label="Conversation filters">
          <Select value={selectedClientId} onValueChange={selectClient} disabled={clientsLoading || Boolean(clientsError)}>
            <SelectTrigger aria-label="Filter by client" className="h-7 w-40 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue>
                <span className="truncate">{selectedClient ? selectedClient.name : 'All clients'}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-clients">All clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <span className="flex items-center gap-2">
                    <span>{client.name}</span>
                    <span className={client.ai_sdr_profile_ready ? 'text-emerald-700' : 'text-amber-700'}>
                      {client.ai_sdr_profile_ready ? 'Ready' : `${client.ai_sdr_profile_completed_fields || 0}/${client.ai_sdr_profile_total_fields || 6}`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select defaultValue="all-campaigns">
            <SelectTrigger aria-label="Filter by client campaign" className="h-7 w-40 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-campaigns">All campaigns</SelectItem>
            </SelectContent>
          </Select>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {inboxFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              title={item.title}
              onClick={() => setFilter(item.value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === item.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label} <span className="ml-1 opacity-70">{filterCounts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid h-[max(520px,calc(100vh-260px))] md:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className={cn('min-h-0 flex-col border-r bg-muted/10', selectedClient ? 'hidden md:flex' : 'flex')}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Client and campaign shown on every reply</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{visibleThreads.length}</span>
          </div>
          {inboxQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading replies…
            </div>
          ) : inboxQuery.data?.connected === false ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <h3 className="text-sm font-semibold">
                {inboxQuery.data.reason ? 'Instantly declined the connected key' : 'Instantly is not connected'}
              </h3>
              <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
                {inboxQuery.data.reason === 'key_rejected'
                  ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
                  : inboxQuery.data.reason === 'scope_missing'
                    ? 'The saved API key cannot read emails. Reconnect Instantly with a key that has all scopes enabled.'
                    : 'Connect Instantly in Client Campaigns to load replies.'}
              </p>
            </div>
          ) : inboxQuery.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <h3 className="text-sm font-semibold">Replies could not be loaded</h3>
              <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
                {inboxQuery.error instanceof Error ? inboxQuery.error.message : 'Try again in a moment.'}
              </p>
            </div>
          ) : visibleThreads.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
                <Inbox className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{search.trim() ? 'No matching conversations' : 'No replies yet'}</h3>
              <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
                {search.trim() ? 'Try another name, podcast, client, or campaign.' : 'Replies from mapped client campaigns will appear here automatically.'}
              </p>
            </div>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto" aria-label="Inbox conversations">
              {visibleThreads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      selectedThread?.id === thread.id && 'bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-xs', thread.is_unread ? 'font-semibold' : 'font-medium')}>{thread.from_email || thread.lead_email}</span>
                      {thread.interested && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Interested" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-foreground/90">{thread.subject || '(no subject)'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{thread.body_text}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {thread.campaign?.client
                        ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{thread.campaign.client.name}</Badge>
                        : <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800">Unmapped</Badge>}
                      {(() => {
                        const pill = statusPill[threadStatus(thread, sentThreadIds)]
                        return pill
                          ? <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', pill.className)}>{pill.label}</Badge>
                          : null
                      })()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={cn('min-w-0 flex-col bg-background', selectedClient ? 'flex' : 'hidden md:flex')}>
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">{selectedThread ? 'Conversation' : selectedClient ? 'Client AI SDR profile' : 'Conversation thread'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedThread ? (selectedThread.campaign?.campaign_name || 'Reply from outreach') : selectedClient ? 'Preview the exact context available to mapped inbox replies.' : 'Open a reply to see its history and client AI SDR state.'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedThread && canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant={selectedThread.relationship ? 'secondary' : 'outline'}
                  disabled={captureRelationshipMutation.isPending}
                  onClick={() => captureRelationshipMutation.mutate(selectedThread)}
                >
                  {captureRelationshipMutation.isPending
                    ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    : <BookUser className="mr-2 h-3.5 w-3.5" />}
                  {selectedThread.relationship ? 'Update saved conversation' : 'Save to relationships'}
                </Button>
              )}
              <Badge variant="outline" className="text-muted-foreground">{selectedThread ? (selectedThread.campaign?.client?.name || 'Unmapped reply') : selectedClient?.name || 'No conversation selected'}</Badge>
            </div>
          </div>

          <div className={cn('flex flex-1', selectedThread ? 'min-h-0' : 'items-center justify-center')}>
            {selectedThread ? (
              <div className="flex min-h-0 flex-1">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5">
                <div className="rounded-xl border bg-muted/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{selectedThread.subject || '(no subject)'}</p>
                    {selectedThread.received_at && (
                      <span className="text-xs text-muted-foreground">{new Date(selectedThread.received_at).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">From {selectedThread.from_email || selectedThread.lead_email}</p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{selectedThread.body_text || 'No text content.'}</p>
                </div>

                {!selectedThread.campaign?.client ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
                    <span className="font-semibold">No client match, no AI response.</span> This reply is not mapped to a client campaign, so drafting is disabled by policy.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {threadClient && !threadClient.ai_sdr_profile_ready && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
                        <span><span className="font-semibold">{selectedThread.campaign.client.name}&rsquo;s AI SDR profile is not ready.</span> AI drafting is off until the core fields are complete — you can still reply manually below.</span>
                        <Button asChild size="sm" variant="outline" className="border-amber-300 bg-background">
                          <Link to={`${baseHref}/clients/${selectedThread.campaign.client.id}`}>Open profile</Link>
                        </Button>
                      </div>
                    )}
                    {selectedThread.state?.draft_stale && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
                        <span><span className="font-semibold">This draft is no longer based on the latest message.</span> Regenerate before sending so the reply answers what the host actually said.</span>
                      </div>
                    )}
                    {draftClassification && draftedForThread === selectedThread.id && (
                      <div className="flex items-start gap-2.5 rounded-xl border bg-muted/10 px-4 py-3">
                        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <p className="text-xs leading-5 text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            Classified as {draftClassification.label.replace(/_/gu, ' ')}
                            {draftClassification.confidence ? ` · ${draftClassification.confidence}% confidence` : ''}
                          </span>
                          {draftClassification.reasoning ? <> — {draftClassification.reasoning}</> : null}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Reply as {selectedThread.campaign.client.name}&rsquo;s SDR</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={draftMutation.isPending || Boolean(threadClient && !threadClient.ai_sdr_profile_ready)}
                        title={threadClient && !threadClient.ai_sdr_profile_ready
                          ? 'Complete the AI SDR profile to draft with AI — manual replies work now'
                          : undefined}
                        onClick={() => draftMutation.mutate(selectedThread)}
                      >
                        {draftMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                        {draftedForThread === selectedThread.id ? 'Redraft with AI' : 'Draft with AI'}
                      </Button>
                    </div>
                    <Input
                      value={draftSubject}
                      onChange={(event) => setDraftSubject(event.target.value)}
                      placeholder={`Re: ${selectedThread.subject || ''}`}
                      aria-label="Reply subject"
                    />
                    <Textarea
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      placeholder="Draft with AI, or write the reply yourself…"
                      aria-label="Reply body"
                      className="min-h-36"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
                        {selectedThread.eaccount ? `Sends from ${selectedThread.eaccount} in the same thread.` : 'Sending mailbox unknown — reply from Instantly directly.'}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={sendMutation.isPending || !draftBody.trim() || !selectedThread.eaccount || sentThreadIds.has(selectedThread.id) || Boolean(selectedThread.state?.draft_stale && draftedForThread !== selectedThread.id)}
                        onClick={() => sendMutation.mutate(selectedThread)}
                      >
                        {sendMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                        {sentThreadIds.has(selectedThread.id) ? 'Replied' : 'Send reply'}
                      </Button>
                    </div>
                    {draftNudges.length > 0 && draftedForThread === selectedThread.id && (
                      <div className="rounded-xl border bg-muted/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Follow-up nudge plan
                            {selectedThread.state ? ` · ${selectedThread.state.nudges_sent} of ${draftNudges.length} sent` : ''}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            disabled={statusMutation.isPending || !selectedThread.campaign?.client}
                            onClick={() => statusMutation.mutate({
                              thread: selectedThread,
                              nudges_paused: !selectedThread.state?.nudges_paused,
                            })}
                          >
                            {selectedThread.state?.nudges_paused ? 'Resume nudges' : 'Pause nudges'}
                          </Button>
                        </div>
                        <ol className="mt-2 space-y-2">
                          {draftNudges.map((nudge, index) => {
                            const sent = (selectedThread.state?.nudges_sent ?? 0) > index
                            return (
                              <li key={`${index}-${nudge.send_after_days}`} className="text-xs leading-5">
                                <span className={`font-semibold ${sent ? 'text-emerald-700' : 'text-foreground'}`}>
                                  Nudge {index + 1} · {sent ? 'sent' : `after ${nudge.send_after_days} day${nudge.send_after_days === 1 ? '' : 's'} of silence`}
                                </span>
                                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{nudge.body}</p>
                              </li>
                            )
                          })}
                        </ol>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {selectedThread.state?.nudges_paused
                            ? 'Nudges are paused for this conversation.'
                            : 'After you send the reply, nudges go out automatically when the host stays quiet — a reply from them cancels the rest of the plan.'}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      {threadStatus(selectedThread, sentThreadIds) === 'archived' ? (
                        <Button type="button" size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'needs_reply' })}>
                          Reopen conversation
                        </Button>
                      ) : (
                        <>
                          <Button type="button" size="sm" variant="outline" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'booked' })}>
                            Mark booked
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'archived' })}>
                            Archive conversation
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-muted/5 xl:flex" aria-label="Lead details">
                <div className="border-b bg-background/60 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {leadInitials(leadName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={leadName}>{leadName}</p>
                      {leadSubtitle && <p className="truncate text-xs text-muted-foreground" title={leadSubtitle}>{leadSubtitle}</p>}
                      <p className="mt-0.5 break-all text-xs text-muted-foreground">
                        {leadDetail?.email || selectedThread.lead_email || selectedThread.from_email}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(() => {
                      const interest = typeof leadDetail?.interest_status === 'number'
                        ? INTEREST_STATUS[leadDetail.interest_status]
                        : null
                      if (interest) {
                        return <Badge variant="outline" className={interest.className} title="Interest status in Instantly">{interest.label}</Badge>
                      }
                      return selectedThread.interested
                        ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Interested</Badge>
                        : null
                    })()}
                    {(() => {
                      const pill = statusPill[threadStatus(selectedThread, sentThreadIds)]
                      return pill ? <Badge variant="outline" className={pill.className}>{pill.label}</Badge> : null
                    })()}
                    {selectedThread.state?.suppressed_at && (
                      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">Opted out</Badge>
                    )}
                  </div>
                  {selectedThread.lead_email || selectedThread.from_email ? (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Instantly status</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {([
                          { value: 1 as const, label: 'Interested' },
                          { value: 2 as const, label: 'Meeting booked' },
                          { value: -1 as const, label: 'Not interested' },
                          { value: null, label: 'Reset' },
                        ]).map((option) => {
                          const active = (leadDetail?.interest_status ?? null) === option.value
                          return (
                            <Button
                              key={String(option.value)}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className="h-7 px-2.5 text-xs"
                              disabled={interestMutation.isPending}
                              onClick={() => interestMutation.mutate({ thread: selectedThread, value: option.value })}
                            >
                              {option.label}
                            </Button>
                          )
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">
                        Writes straight to Instantly and moves this conversation between Interested only and Other replies.
                      </p>
                    </div>
                  ) : null}
                  {(leadWebsite || leadDetail?.phone) && (
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {leadWebsite && (
                        <a href={leadWebsite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Globe className="h-3.5 w-3.5" />Website
                        </a>
                      )}
                      {leadDetail?.phone && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{leadDetail.phone}</span>
                      )}
                    </div>
                  )}
                </div>

                {leadDetailQuery.isLoading ? (
                  <div className="flex items-center gap-2 border-b p-4 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading lead details…
                  </div>
                ) : engagement ? (
                  <div className="grid grid-cols-3 divide-x border-b text-center">
                    {[
                      { label: 'Opens', value: engagement.opens },
                      { label: 'Replies', value: engagement.replies },
                      { label: 'Clicks', value: engagement.clicks },
                    ].map((stat) => (
                      <div key={stat.label} className="p-3">
                        <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
                        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex-1 space-y-4 p-4">
                  {selectedThread.lead_context?.podcast_name && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Podcast</p>
                      <p className="mt-1.5 text-sm">{selectedThread.lead_context.podcast_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outreach</p>
                    <dl className="mt-1.5 space-y-1.5 text-xs">
                      {selectedThread.campaign?.client && (
                        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Client</dt><dd className="text-right font-medium">{selectedThread.campaign.client.name}</dd></div>
                      )}
                      {selectedThread.campaign?.campaign_name && (
                        <div className="flex justify-between gap-2"><dt className="shrink-0 text-muted-foreground">Campaign</dt><dd className="min-w-0 truncate text-right font-medium" title={selectedThread.campaign.campaign_name}>{selectedThread.campaign.campaign_name}</dd></div>
                      )}
                      {firstContactedAt && (
                        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">First contacted</dt><dd className="text-right">{new Date(firstContactedAt).toLocaleDateString()}</dd></div>
                      )}
                      {selectedThread.received_at && (
                        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last reply</dt><dd className="text-right">{new Date(selectedThread.received_at).toLocaleDateString()}</dd></div>
                      )}
                      {selectedThread.state?.last_nudge_at && (
                        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Last nudge</dt><dd className="text-right">{new Date(selectedThread.state.last_nudge_at).toLocaleDateString()}</dd></div>
                      )}
                      {selectedThread.eaccount && (
                        <div className="flex flex-col gap-0.5"><dt className="text-muted-foreground">Sending mailbox</dt><dd className="break-all font-medium" title={selectedThread.eaccount}>{selectedThread.eaccount}</dd></div>
                      )}
                    </dl>
                  </div>
                  {selectedThread.state?.last_nudge_error && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900">
                      <p className="font-semibold">Nudges stalled</p>
                      <p className="mt-0.5">{selectedThread.state.last_nudge_error}</p>
                    </div>
                  )}
                </div>

                {selectedThread.campaign?.client && (
                  <div className="border-t p-4">
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link to={`${baseHref}/clients/${encodeURIComponent(selectedThread.campaign.client.id)}`}>
                        Open {selectedThread.campaign.client.name.split(' ')[0]}&rsquo;s page
                      </Link>
                    </Button>
                  </div>
                )}
              </aside>
              </div>
            ) : selectedClient ? (
              <ClientSdrContextPanel
                context={sdrContextQuery.data}
                loading={sdrContextQuery.isLoading}
                error={sdrContextQuery.error instanceof Error ? sdrContextQuery.error : null}
                client={selectedClient}
                baseHref={baseHref}
                onRetry={() => void sdrContextQuery.refetch()}
              />
            ) : (
            <div className="w-full max-w-4xl p-5 text-center lg:p-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">Every reply reaches the right client AI SDR</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                The Master Inbox resolves the outreach owner before any AI work begins, then loads only that client’s approved context and response policy.
              </p>

              <div role="list" aria-label="AI SDR reply routing" className="mt-7 grid gap-2 text-left sm:grid-cols-2 xl:grid-cols-4">
                {aiRoutingSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div key={step.title} role="listitem" className="relative min-w-0">
                      <div className="h-full rounded-xl border bg-muted/15 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-primary shadow-sm">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">0{index + 1}</span>
                        </div>
                        <p className="mt-3 text-xs font-semibold">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                      </div>
                      {index < aiRoutingSteps.length - 1 && (
                        <div className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground xl:flex" aria-hidden="true">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mx-auto mt-4 flex max-w-2xl items-start gap-2.5 rounded-xl border border-dashed bg-background px-4 py-3 text-left">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">No client match, no AI response.</span>{' '}
                  Ambiguous replies stop for routing review instead of borrowing another client’s identity or context.
                </p>
              </div>
            </div>
            )}
          </div>

          <div className="border-t bg-muted/10 p-3">
            <div className="flex items-center justify-between rounded-lg border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground">
              <span>{selectedClient ? 'Choose All clients to return to inbox routing, or open this client to edit its approved context.' : 'AI draft, review, reply, and booking controls appear with a selected conversation.'}</span>
              <Send className="h-4 w-4" />
            </div>
          </div>
        </section>

      </div>
    </Card>
  )
}

export default MasterInboxPreview
