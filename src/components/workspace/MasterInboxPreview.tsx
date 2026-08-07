import { useEffect, useMemo, useRef, useState } from 'react'
import { describeWait, sortThreadsForAttention, waitIsOverdue } from '@/lib/inboxAttention'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  Archive,
  ArrowRight,
  Ban,
  Bot,
  BookUser,
  CalendarCheck2,
  Inbox,
  Loader2,
  MailOpen,
  Megaphone,
  Globe,
  MessageSquare,
  Mic2,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  draftWorkspaceInboxReply,
  getWorkspaceInboxLeadDetail,
  getWorkspaceInboxThreadMessages,
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
import { addOutreachSuppression, captureHostRelationshipThread } from '@/services/hostRelationships'
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

// A reply has to keep the subject the host is already reading. Mail clients
// thread on subject as well as on the reference headers, so a changed subject —
// whether an operator retyped it or the model invented its own — lands as a
// second conversation beside the one being answered, and the host sees two.
// Derived from the thread at send time rather than held in state, so no drafting
// path can reintroduce the fork.
function replySubject(subject: string | null | undefined): string {
  const original = (subject ?? '').trim()
  if (!original) return 'Re:'
  return /^re\s*:/iu.test(original) ? original : `Re: ${original}`
}

const MasterInboxPreview = ({ workspaceId, clients, clientsLoading, clientsError, baseHref, canManage }: MasterInboxPreviewProps) => {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<InboxScope>('interested')
  const [suppressTarget, setSuppressTarget] = useState<WorkspaceInboxThread | null>(null)
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
  const [showFullThread, setShowFullThread] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  // Arriving from a placement: open that host's conversation rather than
  // dropping the operator into the client's whole inbox to search for it.
  const requestedThreadKey = searchParams.get('thread') || ''
  const [draftBody, setDraftBody] = useState('')
  const [draftedForThread, setDraftedForThread] = useState<string | null>(null)
  const [draftClassification, setDraftClassification] = useState<WorkspaceInboxReplyClassification | null>(null)
  const [draftNudges, setDraftNudges] = useState<WorkspaceInboxNudge[]>([])
  const [sentThreadIds, setSentThreadIds] = useState<Set<string>>(new Set())
  /**
   * Persist the operator's edits as they type, debounced.
   *
   * The AI draft is stored server-side and restored on open, but edits lived
   * only in this component — so leaving and returning restored the original
   * draft over the human's version, which looks like the work survived when it
   * did not. Keyed to the thread and client captured at edit time, never at
   * flush time, so a queued save can only ever land on the thread it was
   * written in.
   */
  const persistDraftEdit = useMemo(() => {
    let timer: number | null = null
    let pending: (() => void) | null = null
    let pendingThreadKey: string | null = null
    const schedule = (thread: WorkspaceInboxThread, body: string) => {
      const clientId = thread.campaign?.client?.id
      if (!thread.thread_key || !clientId) return
      // Members can type, but their save would 403 — and the cache patch ran
      // before the server call, so their edits looked persisted in-session and
      // reverted on the next refetch: the exact "work survived when it did
      // not" this feature exists to end. No save, no cache lie.
      if (!canManage) return
      const threadKey = thread.thread_key
      if (timer !== null) {
        window.clearTimeout(timer)
        // A pending save for a DIFFERENT thread is work about to be lost, not
        // a keystroke to coalesce — flush it now. Cancelling it outright was
        // how switching threads inside the debounce window silently dropped
        // the previous thread's edit.
        if (pending && pendingThreadKey !== threadKey) pending()
      }
      const flush = () => {
        // The cached list is what a re-opened thread restores from, so it has
        // to carry the edit too — the server copy alone only helps after a
        // refetch, and switching threads and back is faster than one.
        queryClient.setQueryData(
          ['workspace-inbox', workspaceId],
          (current: { threads: WorkspaceInboxThread[] } | undefined) => (current
            ? {
              ...current,
              threads: current.threads.map((item) => (
                item.thread_key === threadKey
                  ? {
                    ...item,
                    /*
                     * Synthesized when the row has no state yet, because that
                     * is exactly when losing the edit hurts most: a reply on
                     * its first page load after arriving has state: null, and
                     * skipping the patch meant switching threads and back
                     * emptied the textarea. The server-side save below already
                     * upserts the row either way — this makes the cache agree
                     * with it. The defaults match a freshly created row.
                     */
                    state: {
                      status: 'needs_reply' as const,
                      classification: null,
                      nudges_sent: 0,
                      nudges_paused: false,
                      last_nudge_at: null,
                      draft_stale: false,
                      ...item.state,
                      draft: item.state?.draft
                        ? { ...item.state.draft, body }
                        : { subject: '', body, nudges: [], based_on_email_id: null, generated_at: null },
                    },
                  }
                  : item
              )),
            }
            : current),
        )
        // Fire-and-forget on purpose: a failed background save must not
        // interrupt typing, and the worst case is the pre-edit draft — exactly
        // what the operator had before this feature existed.
        void Promise.resolve(setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: threadKey,
          client_id: clientId,
          draft_body: body,
        })).catch(() => {})
        if (pending === flush) { pending = null; pendingThreadKey = null; timer = null }
      }
      pending = flush
      pendingThreadKey = threadKey
      timer = window.setTimeout(flush, 900)
    }
    return Object.assign(schedule, {
      // Commit whatever is queued right now. Re-opening a conversation inside
      // the debounce window restored the cached (pre-edit) draft over the
      // textarea, and the next keystroke saved that reverted text.
      flush: () => {
        if (timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }
        if (pending) pending()
      },
    })
  }, [workspaceId, queryClient, canManage])

  const counts = useMemo(() => ({
    interested: threads.filter((thread) => thread.interested).length,
    other: threads.filter((thread) => !thread.interested).length,
    optOutsAwaitingAction: threads.filter((thread) => (
      thread.opt_out_detected && !thread.suppressed
    )).length,
  }), [threads])
  const filterCounts = useMemo(() => {
    const counts: Record<InboxFilter, number> = { all: 0, needs_reply: 0, review: 0, replied: 0, booked: 0, archived: 0 }
    for (const thread of threads) {
      // Count what the list under these chips can actually show: the chip
      // said "Review 3" over a list of one when the other two sat in the
      // other interest scope.
      if (scope === 'interested' ? !thread.interested : thread.interested) continue
      if (selectedClient && thread.campaign?.client?.id !== selectedClient.id) continue
      const status = threadStatus(thread, sentThreadIds)
      counts[status] += 1
      if (status !== 'archived') counts.all += 1
    }
    return counts
  }, [threads, scope, selectedClient, sentThreadIds])
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = threads.filter((thread) => {
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
    // Attention order, not arrival order. The host who has waited longest for
    // an answer leads; recency only orders what is already handled.
    return sortThreadsForAttention(filtered, (item) => threadStatus(item, sentThreadIds))
  }, [threads, scope, search, selectedClient, filter, sentThreadIds])
  const linkedThread = requestedThreadKey
    ? threads.find((thread) => thread.thread_key === requestedThreadKey) || null
    : null
  const selectedThread = visibleThreads.find((thread) => thread.id === selectedThreadId)
    || threads.find((thread) => thread.id === selectedThreadId)
    || linkedThread
    || null
  // A deep link lands through the fallback above without running openThread,
  // which is where a persisted draft is restored — so the one entry path built
  // for returning to a conversation was the one that rendered it empty. Runs
  // once per link target, then normal selection takes over.
  const hydratedLinkRef = useRef<string | null>(null)
  useEffect(() => {
    if (!linkedThread || selectedThreadId) return
    if (hydratedLinkRef.current === linkedThread.id) return
    hydratedLinkRef.current = linkedThread.id
    openThread(linkedThread.id)
    // openThread is stable enough for this purpose and not memoized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedThread, selectedThreadId])
  // Both sides of the conversation. Loaded on request rather than with the
  // list: it is one provider call per thread, and most triage never needs it.
  const threadMessagesQuery = useQuery({
    queryKey: ['workspace-inbox-thread', workspaceId, selectedThread?.thread_key ?? ''],
    queryFn: () => getWorkspaceInboxThreadMessages(workspaceId, selectedThread!.thread_key),
    enabled: showFullThread && Boolean(workspaceId) && Boolean(selectedThread?.thread_key),
    retry: false,
    staleTime: 30_000,
  })
  const threadClient = selectedThread?.campaign?.client
    ? clients.find((client) => client.id === selectedThread.campaign?.client?.id) ?? null
    : null

  // Which core fields are missing, for the thread's own client. sdrContextQuery
  // is keyed to the client FILTER, so during all-client triage it is disabled
  // and the banner had nothing to name. "Not ready" without saying what is
  // missing sends the operator to hunt through a form.
  const threadSdrQuery = useQuery({
    queryKey: ['workspace-client-sdr-context', workspaceId, threadClient?.id ?? 'none'],
    queryFn: () => getWorkspaceClientSdrContext(workspaceId, threadClient!.id),
    enabled: Boolean(workspaceId) && Boolean(threadClient?.id) && threadClient?.ai_sdr_profile_ready === false,
    retry: false,
  })
  const missingSdrFields = (threadSdrQuery.data?.readiness.missing_core_fields ?? [])
    .map((field) => CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.find((definition) => definition.id === field)?.shortLabel)
    .filter((label) => Boolean(label))

  // When there is no inbox to browse, there is nothing for two panes to hold.
  // The split view is sized to the viewport so the reading pane has something
  // to scroll inside; wrapping that around a one-line notice leaves most of
  // the screen blank, which reads as a broken page rather than an empty one.
  const unavailable = inboxQuery.isLoading
    ? null
    : inboxQuery.data?.connected === false
      ? {
        title: inboxQuery.data.reason ? 'Instantly declined the connected key' : 'Instantly is not connected',
        detail: inboxQuery.data.reason === 'key_rejected'
          ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
          : inboxQuery.data.reason === 'scope_missing'
            ? 'The saved API key cannot read emails. Reconnect Instantly with a key that has all scopes enabled.'
            : 'Connect Instantly in Client Campaigns to load replies.',
        action: true,
      }
      : inboxQuery.isError
        ? {
          title: 'Replies could not be loaded',
          detail: inboxQuery.error instanceof Error ? inboxQuery.error.message : 'Try again in a moment.',
          action: false,
        }
        : null
  // Lead identity is fetched lazily for the open conversation only: campaigns
  // built directly in Instantly have no local target row, so this is the only
  // place a host's real name, company, and engagement can come from.
  const leadDetailQuery = useQuery({
    queryKey: ['workspace-inbox-lead', workspaceId, selectedThread?.lead_id || 'none'],
    queryFn: () => getWorkspaceInboxLeadDetail(workspaceId, selectedThread!.lead_id!),
    // canManage because the server allows only managers here: without it a
    // member opening any thread with a lead fired a guaranteed, silent 403.
    enabled: Boolean(workspaceId && selectedThread?.lead_id && canManage),
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
    ? { opens: leadDetail.opens, replies: leadDetail.replies, clicks: leadDetail.clicks as number | null }
    : selectedThread?.lead_context
      // Clicks unknown here, and unknown is not zero: the thread context does
      // not carry them, and rendering 0 stated a fact nobody measured.
      ? { opens: selectedThread.lead_context.opens, replies: selectedThread.lead_context.replies, clicks: null }
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
      /*
       * Race guard: only stage the result if the thread it was drafted for is
       * still the open conversation. Compared against the rendered thread, not
       * the selection id — a deep-linked conversation stays open through the
       * ?thread= fallback with the id null (changing the client filter clears
       * the id but not the link), and comparing the id there threw away a
       * draft the operator had just paid for, silently, into a live textarea.
       */
      if (selectedThread?.id !== thread.id) return
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
      subject: replySubject(thread.subject),
      message: draftBody.trim(),
      ...(thread.thread_key ? { thread_key: thread.thread_key } : {}),
      ...(thread.campaign?.client ? { client_id: thread.campaign.client.id } : {}),
      // Sent so the server can refuse a reply to a suppressed address. The UI
      // hides the composer for those, but the gate belongs on the send.
      ...(thread.lead_email || thread.from_email
        ? { lead_email: (thread.lead_email || thread.from_email).trim().toLowerCase() }
        : {}),
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
      // Marking a conversation changes which bucket it belongs to, so follow it
      // rather than letting it disappear out of the list being read.
      const movedTo: InboxScope = input.value === 1 ? 'interested' : 'other'
      const moved = movedTo !== scope
      setScope(movedTo)
      toast.success(input.value === null
        ? 'Status reset in Instantly.'
        : moved
          ? `Status updated. Moved to ${movedTo === 'interested' ? 'Interested only' : 'Other replies'}.`
          : 'Status updated in Instantly.')
      void inboxQuery.refetch()
      void leadDetailQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The lead status could not be updated.')
    },
  })
  // The reply in front of the operator is often the only place an opt-out is
  // ever seen. Until now there was nothing to do about it here: the automatic
  // prefilter only suppresses threads it processes, so a request to stop that
  // arrived on an unprocessed thread simply sat in the list.
  const suppressMutation = useMutation({
    mutationFn: async (thread: WorkspaceInboxThread) => {
      const email = (thread.lead_email || thread.from_email || '').trim().toLowerCase()
      if (!email) throw new Error('This conversation has no sender address to suppress.')
      await addOutreachSuppression(workspaceId, {
        contactEmail: email,
        reason: 'opted_out',
        note: `Asked to stop in ${thread.subject ? `“${thread.subject.slice(0, 120)}”` : 'a reply'}`,
      })
      /*
       * The suppression above is the part that matters and has already
       * succeeded; a failed archive must not roll the toast back to an error.
       * But it must not be silent either — the dialog promised the
       * conversation would be archived, and a swallowed failure left that
       * promise broken with a success toast on top of it.
       */
      // Archiving is per client-mapped thread state; an unmapped thread has
      // nothing to archive and must not turn that absence into a warning.
      const clientId = thread.campaign?.client?.id
      const archived = clientId
        ? await setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: thread.thread_key,
          client_id: clientId,
          status: 'archived',
        }).then(() => true, () => false)
        : true
      return { archived }
    },
    onSuccess: ({ archived }) => {
      setSuppressTarget(null)
      if (archived) {
        toast.success('Added to do not contact. No client in this workspace will email that address again.')
      } else {
        toast.warning('Added to do not contact, but the conversation could not be archived. It may reappear in the list.')
      }
      void inboxQuery.refetch()
    },
    onError: (error) => {
      setSuppressTarget(null)
      toast.error(error instanceof Error ? error.message : 'The address could not be suppressed.')
    },
  })
  /*
   * Bulk triage. Archiving was one thread at a time, which on a Monday means
   * a click per handled conversation. Selection is offered only on threads a
   * bulk archive can actually act on — mapped, and not already archived — and
   * runs sequentially so one refusal names itself without hiding the rest.
   */
  /*
   * Keyed by thread_key, not the row id: the id is the latest message, and a
   * new reply changes it — a selection keyed on it went stale on any refetch
   * and "Archive selected" archived nothing while reporting success.
   */
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkArchiving, setBulkArchiving] = useState(false)
  const toggleBulkSelected = (threadKey: string) => {
    setBulkSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(threadKey)) next.delete(threadKey)
      else next.add(threadKey)
      return next
    })
  }
  // Pruned to what a bulk archive can still act on, every time the list moves:
  // a conversation archived elsewhere, or gone from the reply window, leaves
  // the selection instead of inflating its count.
  useEffect(() => {
    setBulkSelectedKeys((current) => {
      if (current.size === 0) return current
      const archivable = new Set(
        threads
          .filter((thread) => thread.thread_key && thread.campaign?.client && threadStatus(thread, sentThreadIds) !== 'archived')
          .map((thread) => thread.thread_key as string),
      )
      const next = new Set([...current].filter((key) => archivable.has(key)))
      return next.size === current.size ? current : next
    })
  }, [threads, sentThreadIds])
  const bulkArchive = async () => {
    if (bulkArchiving || bulkSelectedKeys.size === 0) return
    setBulkArchiving(true)
    let archived = 0
    let failed = 0
    for (const threadKey of bulkSelectedKeys) {
      const thread = threads.find((item) => item.thread_key === threadKey)
      if (!thread?.campaign?.client || !thread.thread_key) continue
      try {
        await setWorkspaceInboxThreadStatus(workspaceId, {
          thread_key: thread.thread_key,
          client_id: thread.campaign.client.id,
          status: 'archived',
        })
        archived += 1
      } catch (error) {
        failed += 1
        console.error('Bulk archive failed for a thread:', error)
      }
    }
    setBulkArchiving(false)
    setBulkSelectedKeys(new Set())
    if (failed > 0) toast.warning(`Archived ${archived}; ${failed} could not be archived.`)
    else if (archived === 0) toast.warning('Nothing was archived — the selection no longer matched the list.')
    else toast.success(archived === 1 ? 'Archived 1 conversation.' : `Archived ${archived} conversations.`)
    void inboxQuery.refetch()
  }

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
    persistDraftEdit.flush()
    setSelectedThreadId(threadId)
    // History is per-conversation; carrying it open into the next thread would
    // show one host's messages under another's subject line.
    setShowFullThread(false)
    const thread = threads.find((item) => item.id === threadId)
    const persisted = thread?.state?.draft
    if (persisted && !thread.state?.draft_stale) {
      // Restore the staged review package (Reply-style persisted runs).
      setDraftBody(persisted.body)
      setDraftedForThread(threadId)
      setDraftClassification((thread.state?.classification ?? null) as WorkspaceInboxReplyClassification | null)
      setDraftNudges(persisted.nudges)
    } else {
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
    // Switching clients closes the previous client's open conversation, and
    // drops any bulk selection made against it: archiving rows the operator
    // can no longer see is the wrong kind of surprise.
    setSelectedThreadId(null)
    setBulkSelectedKeys(new Set())
    setDraftBody('')
    setDraftedForThread(null)
    setDraftClassification(null)
    setDraftNudges([])
  }

  return (
    <Card className="overflow-hidden shadow-none">
      {/* Scope, search, and filters only describe an inbox that loaded. With
          nothing behind them they offer controls that cannot change anything
          and counts that are zero for a reason the notice below explains. */}
      {!unavailable && (
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
      )}

      {unavailable ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
            <Inbox className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">{unavailable.title}</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{unavailable.detail}</p>
          {unavailable.action && (
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link to={`${baseHref}/client-campaigns`}>Open Client Campaigns</Link>
            </Button>
          )}
        </div>
      ) : (
      <div className="grid h-[max(520px,calc(100vh-260px))] md:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className={cn('min-h-0 flex-col border-r bg-muted/10', selectedClient ? 'hidden md:flex' : 'flex')}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Client and campaign shown on every reply</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{visibleThreads.length}</span>
          </div>
          {/* An unactioned request to stop is the one thing in this list that
              should not wait to be scrolled to. Counted across both scopes,
              because an opt-out does not care which bucket it landed in. */}
          {inboxQuery.data?.truncated && (
            <div role="status" className="flex items-start gap-2 border-b bg-muted/30 px-4 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-4 text-muted-foreground">
                Showing the most recent replies only. Instantly has more than this window holds, so an
                older conversation may be missing — search finds only what is loaded here.
              </p>
            </div>
          )}
          {counts.optOutsAwaitingAction > 0 && (
            <div role="status" className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2.5">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <p className="text-[11px] leading-4 text-destructive">
                {counts.optOutsAwaitingAction === 1
                  ? '1 reply asks not to be contacted and is not on the do-not-contact list.'
                  : `${counts.optOutsAwaitingAction} replies ask not to be contacted and are not on the do-not-contact list.`}
                {' '}Open each one to add the address.
              </p>
            </div>
          )}
          {canManage && bulkSelectedKeys.size > 0 && (
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
              <span className="text-xs text-muted-foreground">
                {bulkSelectedKeys.size === 1 ? '1 conversation selected' : `${bulkSelectedKeys.size} conversations selected`}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={bulkArchiving} onClick={() => setBulkSelectedKeys(new Set())}>
                  Clear
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={bulkArchiving} onClick={() => void bulkArchive()}>
                  {bulkArchiving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Archive className="mr-1.5 h-3 w-3" />}
                  Archive selected
                </Button>
              </div>
            </div>
          )}
          {inboxQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading replies…
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
                <li key={thread.id} className="relative">
                  {/* Left edge, not right: the interested dot owns the top-right
                      corner and the first checkbox placement painted over it. */}
                  {canManage && thread.thread_key && thread.campaign?.client && threadStatus(thread, sentThreadIds) !== 'archived' && (
                    <input
                      type="checkbox"
                      aria-label={`Select conversation with ${thread.from_email || thread.lead_email || 'unknown sender'}`}
                      checked={bulkSelectedKeys.has(thread.thread_key)}
                      disabled={bulkArchiving}
                      onChange={() => toggleBulkSelected(thread.thread_key as string)}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute left-3 top-3.5 z-10 h-3.5 w-3.5 accent-primary"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      canManage && thread.thread_key && thread.campaign?.client && threadStatus(thread, sentThreadIds) !== 'archived' && 'pl-9',
                      selectedThread?.id === thread.id && 'bg-muted/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-xs', thread.is_unread ? 'font-semibold' : 'font-medium')}>{thread.from_email || thread.lead_email}</span>
                      {thread.interested && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="Interested" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-foreground/90">{thread.subject || '(no subject)'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {thread.window_aged_out ? 'Staged for review — the reply is older than the inbox window' : thread.body_text}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {thread.campaign?.client
                        ? <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">{thread.campaign.client.name}</Badge>
                        : <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-800">Unmapped</Badge>}
                      {(() => {
                        const status = threadStatus(thread, sentThreadIds)
                        const pill = statusPill[status]
                        const wait = status === 'needs_reply' || status === 'review'
                          ? describeWait(thread.received_at)
                          : null
                        return (
                          <>
                            {pill && <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', pill.className)}>{pill.label}</Badge>}
                            {/* How long this host has been waiting on us. Two
                                days of silence after a warm reply is where a
                                booking starts dying, so past that it turns
                                amber. */}
                            {wait && (
                              <span className={cn(
                                'text-[10px] font-medium tabular-nums',
                                waitIsOverdue(thread.received_at) ? 'text-amber-700' : 'text-muted-foreground',
                              )}>
                                {wait}
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* min-h-0 is load-bearing: as a grid item this column defaults to
            min-height:auto and grows to fit the thread, so the reading pane's
            overflow-y-auto below never gets a constrained parent to scroll
            against and the Card's overflow-hidden clips the rest out of reach.
            The conversation list beside it already carries the same guard. */}
        <section className={cn('min-h-0 min-w-0 flex-col bg-background', selectedClient ? 'flex' : 'hidden md:flex')}>
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
                  {selectedThread.relationship ? 'Update relationship' : 'Save to relationships'}
                </Button>
              )}
              {/* The Command Center links into this inbox; this is the way
                  back. The reply's placement — stage, dates, prep — lived one
                  unaided navigation away, and the thread already knows the
                  client and, once captured, the show. */}
              {/* Only for a show the Command Center can actually resolve: a
                  captured-but-unidentified relationship gets a manual-<uuid>
                  id that matches nothing, and offering the link anyway
                  stranded the operator on an unfiltered page. */}
              {selectedThread?.relationship?.podcast_id && !selectedThread.relationship.podcast_id.startsWith('manual-') && selectedThread.campaign?.client && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`${baseHref}/client-podcast-system?client=${encodeURIComponent(selectedThread.campaign.client.id)}&podcast=${encodeURIComponent(selectedThread.relationship.podcast_id)}`}>
                    <CalendarCheck2 className="mr-2 h-3.5 w-3.5" />View placement
                  </Link>
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
                  {selectedThread.window_aged_out ? (
                    <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                      This reply has scrolled out of the inbox window, but its staged package is kept
                      here so it cannot be lost. Open the conversation below to read what the host
                      wrote before sending.
                    </p>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{selectedThread.body_text || 'No text content.'}</p>
                  )}
                </div>

                {/* The list reads received mail only, so without this an
                    operator answers having never seen what was pitched —
                    only what the host happened to quote back. */}
                {selectedThread.thread_key && (
                  <div className="mt-3">
                    {!showFullThread ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowFullThread(true)}>
                        <MailOpen className="mr-2 h-3.5 w-3.5" />Show what we sent
                      </Button>
                    ) : threadMessagesQuery.isLoading ? (
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the full conversation…
                      </p>
                    ) : threadMessagesQuery.error ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-xs text-destructive">The conversation history could not be loaded.</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void threadMessagesQuery.refetch()}>Retry</Button>
                      </div>
                    ) : (threadMessagesQuery.data ?? []).length === 0 ? (
                      <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                        Instantly returned no other messages on this thread.
                      </p>
                    ) : (
                      <div className="space-y-2" aria-label="Full conversation">
                        {(threadMessagesQuery.data ?? []).map((message) => (
                          <div
                            key={message.id}
                            className={message.direction === 'outbound'
                              ? 'rounded-xl border border-primary/20 bg-primary/5 p-3'
                              : 'rounded-xl border bg-muted/15 p-3'}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {message.direction === 'outbound' ? 'We sent' : 'They replied'}
                              </span>
                              {message.sent_at && (
                                <span className="text-[11px] text-muted-foreground">{new Date(message.sent_at).toLocaleString()}</span>
                              )}
                            </div>
                            <p className="mt-1 text-xs font-medium">{message.subject || '(no subject)'}</p>
                            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{message.body_text || 'No text content.'}</p>
                          </div>
                        ))}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowFullThread(false)}>Hide history</Button>
                      </div>
                    )}
                  </div>
                )}

                {selectedThread.suppressed ? (
                  <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive">
                    <span className="font-semibold">This address is on the do-not-contact list.</span> Replying is disabled for
                    every client in this workspace. If that was recorded in error, remove it in Relationships, where the
                    reversal asks for a written reason.
                  </div>
                ) : !selectedThread.campaign?.client ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
                      <span className="font-semibold">No client match, no AI response.</span> This reply is not mapped to a client campaign, so drafting is disabled by policy.
                    </div>
                    {/* Suppression needs only the address, so an opt-out on an
                        unmapped thread is still actionable here. The banner
                        above the list said "open each one to add the address"
                        and this was the one kind of thread with nothing to
                        press when you did. */}
                    {selectedThread.opt_out_detected && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={!canManage || suppressMutation.isPending}
                        onClick={() => setSuppressTarget(selectedThread)}
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" />They asked to stop — add to do not contact
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {threadClient && !threadClient.ai_sdr_profile_ready && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900">
                        <span>
                          <span className="font-semibold">{selectedThread.campaign.client.name}&rsquo;s AI SDR profile is not ready.</span>{' '}
                          {missingSdrFields.length > 0
                            ? `AI drafting is off until ${missingSdrFields.length === 1 ? 'one core field is' : `${missingSdrFields.length} core fields are`} filled in: ${missingSdrFields.join(', ')}. You can still reply manually below.`
                            : threadSdrQuery.isLoading
                              ? 'Checking which fields are missing. You can still reply manually below.'
                              : 'AI drafting is off until the core fields are complete — you can still reply manually below.'}
                        </span>
                        <Button asChild size="sm" variant="outline" className="border-amber-300 bg-background">
                          <Link to={`${baseHref}/clients/${selectedThread.campaign.client.id}?tab=ai-sdr`}>Open profile</Link>
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
                        disabled={!canManage || draftMutation.isPending || Boolean(threadClient && !threadClient.ai_sdr_profile_ready)}
                        title={threadClient && !threadClient.ai_sdr_profile_ready
                          ? 'Complete the AI SDR profile to draft with AI — manual replies work now'
                          : undefined}
                        onClick={() => draftMutation.mutate(selectedThread)}
                      >
                        {draftMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                        {draftedForThread === selectedThread.id ? 'Redraft with AI' : 'Draft with AI'}
                      </Button>
                    </div>
                    {/* A disabled control has to say why where it sits. The
                        banner above explains it, but a greyed button with the
                        reason somewhere else reads as broken, not as blocked. */}
                    {threadClient && !threadClient.ai_sdr_profile_ready && (
                      <p className="-mt-1 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">Drafting is off</span> because{' '}
                        {threadClient.name}&rsquo;s AI SDR profile is incomplete
                        {missingSdrFields.length > 0 ? ` (${missingSdrFields.join(', ')})` : ''}. Writing a reply
                        yourself still works.
                      </p>
                    )}
                    {/* Shown, not editable: the subject is what keeps this
                        reply in the host's existing thread. */}
                    <div
                      className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground"
                      aria-label="Reply subject"
                    >
                      <span className="shrink-0 text-xs uppercase tracking-wide">Subject</span>
                      <span className="truncate text-foreground" title={replySubject(selectedThread.subject)}>
                        {replySubject(selectedThread.subject)}
                      </span>
                    </div>
                    <Textarea
                      value={draftBody}
                      onChange={(event) => {
                        setDraftBody(event.target.value)
                        persistDraftEdit(selectedThread, event.target.value)
                      }}
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
                        disabled={!canManage || sendMutation.isPending || !draftBody.trim() || !selectedThread.eaccount || sentThreadIds.has(selectedThread.id) || Boolean(selectedThread.state?.draft_stale && draftedForThread !== selectedThread.id)}
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
                            disabled={!canManage || statusMutation.isPending || !selectedThread.campaign?.client}
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
                            // Mirrors NUDGE_SENDING_DISABLED in inbox-nudge-tick:
                            // automated dispatch is off platform-wide, and this
                            // panel must not promise follow-ups nothing will send.
                            // Change both together if sending is ever restored.
                            : 'Automatic nudge sending is currently switched off platform-wide — this plan is staged as a reference, and these follow-ups only go out if you send them yourself.'}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                      {threadStatus(selectedThread, sentThreadIds) === 'archived' ? (
                        <Button type="button" size="sm" variant="outline" disabled={!canManage || statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'needs_reply' })}>
                          Reopen conversation
                        </Button>
                      ) : (
                        <>
                          <Button type="button" size="sm" variant="outline" disabled={!canManage || statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'booked' })}>
                            Mark booked
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" disabled={!canManage || statusMutation.isPending} onClick={() => statusMutation.mutate({ thread: selectedThread, status: 'archived' })}>
                            Archive conversation
                          </Button>
                          {selectedThread.suppressed ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                              <Ban className="h-3.5 w-3.5" />Do not contact
                            </span>
                          ) : selectedThread.opt_out_detected ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={!canManage || suppressMutation.isPending}
                              onClick={() => setSuppressTarget(selectedThread)}
                            >
                              <Ban className="mr-1.5 h-3.5 w-3.5" />They asked to stop — add to do not contact
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={!canManage || suppressMutation.isPending}
                              onClick={() => setSuppressTarget(selectedThread)}
                            >
                              <Ban className="mr-1.5 h-3.5 w-3.5" />Do not contact
                            </Button>
                          )}
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
                      // The thread carries the operator's own decision; the
                      // lead detail is the provider's view and lags it.
                      const effectiveInterest = selectedThread.interest_status ?? leadDetail?.interest_status ?? null
                      const interest = typeof effectiveInterest === 'number'
                        ? INTEREST_STATUS[effectiveInterest]
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
                          const active = (selectedThread.interest_status ?? leadDetail?.interest_status ?? null) === option.value
                          return (
                            <Button
                              key={String(option.value)}
                              type="button"
                              size="sm"
                              variant={active ? 'default' : 'outline'}
                              className="h-7 px-2.5 text-xs"
                              disabled={!canManage || interestMutation.isPending}
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
                        <p className="text-lg font-semibold tabular-nums">{stat.value ?? '—'}</p>
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
                  <div className="space-y-2 border-t p-4">
                    {/* Back to the placement this reply belongs to. The inbox
                        could reach the client but never the show, so the
                        stage, pitch, and dates behind a reply were a search
                        away. */}
                    {selectedThread.relationship?.podcast_id && (
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link
                          to={`${baseHref}/client-podcast-system?client=${encodeURIComponent(selectedThread.campaign.client.id)}&podcast=${encodeURIComponent(selectedThread.relationship.podcast_id)}`}
                        >
                          <Mic2 className="mr-2 h-4 w-4" />Open this placement
                        </Link>
                      </Button>
                    )}
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
              {/* A deep link whose conversation has scrolled out of the reply
                  window used to land here with no explanation at all — the
                  relationship book keeps threads forever, the provider window
                  does not, and silence read as a broken link. */}
              {requestedThreadKey && !linkedThread && !inboxQuery.isLoading && (
                <div role="status" className="mx-auto mb-6 max-w-xl rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
                  That saved conversation is older than the reply window, so it cannot be opened here.
                  Its saved messages remain on the relationship record.
                </div>
              )}
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
      )}

      {/* Suppression is workspace-wide and directed at the sender, so it is
          worth naming the address before it silences that person for every
          client. The safe direction, but not a small one. */}
      <Dialog open={Boolean(suppressTarget)} onOpenChange={(next) => !suppressMutation.isPending && !next && setSuppressTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Never contact {suppressTarget?.lead_email || suppressTarget?.from_email}?</DialogTitle>
            <DialogDescription>
              An opt-out is directed at your agency, not at one campaign. This address will be
              excluded from outreach for every client in this workspace, and the conversation is
              archived.
            </DialogDescription>
          </DialogHeader>
          {suppressTarget?.body_text && (
            <p className="mt-4 line-clamp-4 rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
              {suppressTarget.body_text.slice(0, 400)}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            It stays reversible from Relationships, where removing it asks for a written reason.
          </p>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => setSuppressTarget(null)} disabled={suppressMutation.isPending}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => suppressTarget && suppressMutation.mutate(suppressTarget)} disabled={!canManage || suppressMutation.isPending}>
              {suppressMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add to do not contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export default MasterInboxPreview
