import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Plus,
  PlugZap,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { InstantlyAccountPicker, type InstantlyAccountClientLink } from '@/components/workspace/InstantlyAccountPicker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  connectWorkspaceInstantly,
  disconnectWorkspaceInstantly,
  getWorkspaceCampaignOverview,
  refreshWorkspaceCampaignAnalytics,
  refreshWorkspaceInstantly,
  saveWorkspaceCampaign,
  type WorkspaceClientCampaign,
  type WorkspaceInstantlyIntegration,
} from '@/services/workspaceCampaigns'
import { type WorkspaceClient } from '@/services/clients'
import { defaultInstantlyTimezone } from '@/lib/instantlyTimezones'
import { describeSyncFreshness } from '@/lib/syncFreshness'

type CampaignFilter = 'all' | 'attention' | 'draft' | 'active' | 'paused' | 'completed'
type CampaignStatus = 'Needs attention' | 'Draft' | 'Active' | 'Paused' | 'Completed'

interface WorkspaceCampaignsProps {
  workspaceId: string
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: Error | null
  baseHref: string
  onRetryClients: () => void
}

/**
 * What the operator should do next, and where that work actually happens.
 * A row that says "Write 3 pitches" and makes you go find them is a report;
 * one that takes you to the three is a worklist.
 */
interface CampaignNextAction {
  label: string
  href: string
}

interface CampaignSummary {
  client: WorkspaceClient
  campaign: WorkspaceClientCampaign | null
  status: CampaignStatus
  nextAction: CampaignNextAction
}

const filterLabels: Array<{ value: CampaignFilter; label: string }> = [
  { value: 'all', label: 'All campaigns' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
]

/** Worst first: the default order answers "what needs me?" before anything else. */
const statusPriority: Record<CampaignStatus, number> = {
  'Needs attention': 0,
  Draft: 1,
  Active: 2,
  Paused: 3,
  Completed: 4,
}

type SortColumn = 'default' | 'name' | 'client' | 'status' | 'progress' | 'sent' | 'replies' | 'staged'

/** Sorting these opens on the largest value: the question is always "who has the most?". */
const descendingFirst = new Set<SortColumn>(['progress', 'sent', 'replies', 'staged'])

const statusClasses: Record<CampaignStatus, string> = {
  'Needs attention': 'border-amber-200 bg-amber-50 text-amber-800',
  Draft: 'border-sky-200 bg-sky-50 text-sky-800',
  Active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  Paused: 'border-violet-200 bg-violet-50 text-violet-800',
  Completed: 'border-slate-200 bg-slate-100 text-slate-700',
}

function instantlyStatusLabel(status: number): CampaignStatus {
  if (status === 1 || status === 4) return 'Active'
  if (status === 2) return 'Paused'
  if (status === 3) return 'Completed'
  if (status === 0) return 'Draft'
  return 'Needs attention'
}

function summarizeCampaign(
  client: WorkspaceClient,
  campaign: WorkspaceClientCampaign | null,
  baseHref: string,
): CampaignSummary {
  const missingContacts = campaign?.target_counts.needs_contact || 0
  const status: CampaignStatus = campaign?.status === 'attention'
    ? 'Needs attention'
    : campaign?.status === 'active'
      ? 'Active'
      : campaign?.status === 'paused'
        ? 'Paused'
        : campaign?.status === 'completed'
          ? 'Completed'
          : 'Draft'
  const readyCount = campaign?.target_counts.ready || 0
  const needsPitchCount = campaign?.target_counts.needs_pitch || 0
  const stagedCount = campaign?.target_counts.staged || 0
  const stagedSendingCount = campaign?.target_counts.staged_sending || 0
  // Podcasts tab for work on leads already in the campaign; Options for a
  // provider fault; the finder for writing a pitch, which is where Write Pitch
  // lives — a podcast reaches the campaign only from there.
  const podcastsHref = `${baseHref}/client-campaigns/${client.id}?tab=leads`
  const writeHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const nextAction: CampaignNextAction = campaign?.last_error
    ? { label: 'Resolve campaign issue', href: `${baseHref}/client-campaigns/${client.id}?tab=options` }
    : stagedSendingCount > 0
      ? { label: `${stagedSendingCount} pitch${stagedSendingCount === 1 ? '' : 'es'} already sending`, href: podcastsHref }
      : stagedCount > 0
      ? { label: `Launch ${stagedCount} staged pitch${stagedCount === 1 ? '' : 'es'}`, href: podcastsHref }
      : readyCount > 0
      ? { label: `Launch ${readyCount} approved pitch${readyCount === 1 ? '' : 'es'}`, href: podcastsHref }
      : needsPitchCount > 0
        ? { label: `Write ${needsPitchCount} pitch${needsPitchCount === 1 ? '' : 'es'}`, href: writeHref }
        : missingContacts > 0
      ? { label: `Find ${missingContacts} contact${missingContacts === 1 ? '' : 's'}`, href: podcastsHref }
      : (campaign?.target_counts.total || 0) > 0
        ? { label: 'Review custom pitches', href: podcastsHref }
        : { label: 'Send a finished pitch', href: writeHref }

  return { client, campaign, status, nextAction }
}

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant="outline" className={statusClasses[status]}>{status}</Badge>
}

function campaignListMetrics(summary: CampaignSummary) {
  const campaign = summary.campaign
  const contacted = campaign?.analytics.contacted_count ?? 0
  const totalTargets = campaign?.target_counts.total || 0
  const progress = campaign && totalTargets > 0
    ? Math.min(100, Math.round((contacted / totalTargets) * 100))
    : null
  return {
    progress: summary.status === 'Completed' ? 100 : progress,
    sent: campaign?.analytics.emails_sent_count ?? 0,
    replies: campaign ? campaign.analytics.reply_count_unique : null,
    positiveReplies: campaign ? campaign.analytics.total_interested : null,
    // Sitting in Instantly without anyone having launched them from here.
    staged: campaign?.target_counts.staged ?? 0,
    // The subset already sending, because the campaign was live when they were
    // added. Nobody pressed launch for these, so nothing else on this page
    // would say they are reaching hosts right now.
    stagedSending: campaign?.target_counts.staged_sending ?? 0,
  }
}

function sortValue(summary: CampaignSummary, column: SortColumn): string | number {
  const metrics = campaignListMetrics(summary)
  switch (column) {
    case 'name':
      return (summary.campaign?.name || `${summary.client.name} Podcast Outreach`).toLowerCase()
    case 'client':
      return summary.client.name.toLowerCase()
    case 'status':
      return statusPriority[summary.status]
    // A campaign with nothing to report sorts below a real zero rather than
    // above it: "—" is not an achievement.
    case 'progress':
      return metrics.progress ?? -1
    case 'sent':
      return metrics.sent
    case 'replies':
      return metrics.replies ?? -1
    case 'staged':
      return metrics.staged
    default:
      return 0
  }
}

/**
 * Declared at module scope on purpose. Defined inside the page it would be a
 * new component type on every render, so React would remount each header and
 * the sort button would lose focus on the very click that used it.
 */
function SortableHead({
  column,
  label,
  className,
  sort,
  onToggle,
}: {
  column: SortColumn
  label: string
  className?: string
  sort: { column: SortColumn; direction: 'asc' | 'desc' }
  onToggle: (column: SortColumn) => void
}) {
  const active = sort.column === column
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ChevronUp : ChevronDown
  return (
    <TableHead className={className} aria-sort={!active ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'}>
      <button type="button" onClick={() => onToggle(column)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-foreground' : 'text-muted-foreground/60'}`} aria-hidden="true" />
      </button>
    </TableHead>
  )
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: number | string
  detail: string
  icon: typeof Mail
  /** 'alarm' marks a number that should stop somebody, not just inform them. */
  tone?: 'alarm'
}) {
  return (
    <Card className={tone === 'alarm' ? 'border-red-200 bg-red-50/40 shadow-none' : 'border-border/70 shadow-none'}>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight ${tone === 'alarm' ? 'text-red-700' : ''}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <Icon className={`h-4 w-4 ${tone === 'alarm' ? 'text-red-500' : 'text-muted-foreground/60'}`} />
      </CardContent>
    </Card>
  )
}

const WorkspaceCampaigns = ({
  workspaceId,
  clients,
  clientsLoading,
  clientsError,
  baseHref,
  onRetryClients,
}: WorkspaceCampaignsProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeClients = useMemo(
    () => clients.filter((client) => client.status === 'active'),
    [clients],
  )
  const campaignOverviewQuery = useQuery({
    queryKey: ['workspace-client-campaigns', workspaceId, 'overview'],
    queryFn: () => getWorkspaceCampaignOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 15_000,
  })
  const providerBackedCampaigns = useMemo(() => (
    (campaignOverviewQuery.data?.campaigns || []).filter((campaign) => Boolean(campaign.instantly_campaign_id))
  ), [campaignOverviewQuery.data?.campaigns])
  const clientById = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )
  // A mailbox belongs to a client by being on that client's campaign, so the
  // picker's client filter is derived from the campaign sender lists already
  // loaded here rather than a second record of ownership that could disagree.
  const mailboxAssignments = useMemo(() => {
    const byEmail = new Map<string, InstantlyAccountClientLink[]>()
    for (const campaign of campaignOverviewQuery.data?.campaigns || []) {
      const client = clientById.get(campaign.client_id)
      if (!client) continue
      for (const email of campaign.sender_accounts || []) {
        const links = byEmail.get(email) || []
        if (links.some((link) => link.client_id === client.id)) continue
        links.push({ client_id: client.id, client_name: client.name })
        byEmail.set(email, links)
      }
    }
    return byEmail
  }, [campaignOverviewQuery.data?.campaigns, clientById])
  const campaignEntries = useMemo(() => providerBackedCampaigns.flatMap((campaign) => {
    const client = clientById.get(campaign.client_id)
    return client ? [{ campaign, client }] : []
  }), [clientById, providerBackedCampaigns])
  // Everything this table shows comes from the overview above. It used to also
  // fetch each client's detail and shortlist per row — two requests per client,
  // whose payloads were never rendered. Their only visible effect was a spinner
  // per row and, when one failed, an "Unavailable" badge on a campaign whose
  // data was loaded and fine.
  const summaries = campaignEntries.map(({ campaign, client }) => summarizeCampaign(
    client,
    campaign,
    baseHref,
  ))

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CampaignFilter>('all')
  // 'default' is the needs-attention-first order, and is what the page opens on.
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'default',
    direction: 'asc',
  })
  const [clientGroupFilter, setClientGroupFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedProviderCampaignId, setSelectedProviderCampaignId] = useState('new')
  const [campaignName, setCampaignName] = useState('')
  const [campaignTimezoneDraft, setCampaignTimezoneDraft] = useState(() => (
    defaultInstantlyTimezone()
  ))
  const [campaignDailyLimit, setCampaignDailyLimit] = useState(30)
  const [selectedSenderAccounts, setSelectedSenderAccounts] = useState<Set<string>>(new Set())
  const [connectionOpen, setConnectionOpen] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [connectionSaving, setConnectionSaving] = useState(false)

  const integration = campaignOverviewQuery.data?.integration || null
  const canManageCampaigns = Boolean(campaignOverviewQuery.data?.can_manage_campaigns)
  const sendingAccounts = integration?.accounts || []
  const providerCampaigns = campaignOverviewQuery.data?.provider_campaigns || []
  const unassignedProviderCampaigns = providerCampaigns.filter((campaign) => !campaign.mapped_client_id)

  const refreshConnectionMutation = useMutation({
    mutationFn: () => refreshWorkspaceInstantly(workspaceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      toast.success('Instantly connection refreshed.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Instantly could not be refreshed.'),
  })
  const analyticsTotals = summaries.reduce((totals, summary) => {
    const analytics = summary.campaign?.analytics
    if (!analytics) return totals
    return {
      contacted: totals.contacted + analytics.contacted_count,
      replies: totals.replies + analytics.reply_count_unique,
      bounced: totals.bounced + analytics.bounced_count,
      unsubscribed: totals.unsubscribed + analytics.unsubscribed_count,
      sent: totals.sent + analytics.emails_sent_count,
    }
  }, { contacted: 0, replies: 0, bounced: 0, unsubscribed: 0, sent: 0 })
  const contactedCount = analyticsTotals.contacted
  const replyCount = analyticsTotals.replies
  const bouncedCount = analyticsTotals.bounced
  const unsubscribedCount = analyticsTotals.unsubscribed
  // Rates are only meaningful once something has actually been attempted; a
  // percentage of nothing reads as a real zero.
  const percent = (part: number, whole: number): string => (
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'
  )
  const replyRate = percent(replyCount, contactedCount)
  const bounceRate = percent(bouncedCount, analyticsTotals.sent)
  const bounceAlarm = analyticsTotals.sent >= 20
    && bouncedCount / analyticsTotals.sent > 0.03

  const refreshAnalyticsMutation = useMutation({
    mutationFn: () => refreshWorkspaceCampaignAnalytics(workspaceId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      if (result.requested === 0) {
        toast.info('No launched campaigns to refresh yet.')
        return
      }
      // A campaign Instantly no longer answers for is named as unrefreshed
      // rather than counted as done — its numbers on this page are the last
      // ones anybody saw.
      toast.success(
        result.missing > 0
          ? `Totals refreshed for ${result.refreshed} of ${result.requested} campaigns. ${result.missing} could not be found in Instantly.`
          : `Totals refreshed for ${result.refreshed} campaign${result.refreshed === 1 ? '' : 's'}.`,
      )
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Campaign totals could not be refreshed.'),
  })
  const disconnectMutation = useMutation({
    mutationFn: () => disconnectWorkspaceInstantly(workspaceId),
    onSuccess: async () => {
      setApiKeyDraft('')
      setConnectionOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      toast.success('Instantly API access removed from this workspace.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Instantly could not be disconnected.'),
  })
  const saveCampaignMutation = useMutation({
    mutationFn: saveWorkspaceCampaign,
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      resetCreateDialog()
      navigate(`${baseHref}/client-campaigns/${variables.clientId}`)
      toast.success('Campaign draft saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The campaign draft could not be saved.'),
  })

  // Third click returns to needs-attention-first rather than stranding the
  // operator in an order they can only leave by reloading.
  const toggleSort = (column: SortColumn) => {
    setSort((current) => {
      if (current.column !== column) {
        return { column, direction: descendingFirst.has(column) ? 'desc' : 'asc' }
      }
      const opened = descendingFirst.has(column) ? 'desc' : 'asc'
      return current.direction === opened
        ? { column, direction: opened === 'asc' ? 'desc' : 'asc' }
        : { column: 'default', direction: 'asc' }
    })
  }

  const selectedClient = activeClients.find((client) => client.id === selectedClientId) || null
  const normalizedSearch = search.trim().toLowerCase()
  const filteredSummaries = summaries.filter((summary) => {
    const matchesSearch = !normalizedSearch
      || summary.client.name.toLowerCase().includes(normalizedSearch)
      || `${summary.client.name} podcast outreach`.toLowerCase().includes(normalizedSearch)
    const matchesClient = clientGroupFilter === 'all' || summary.client.id === clientGroupFilter
    const matchesFilter = filter === 'all'
      || (filter === 'attention' && summary.status === 'Needs attention')
      || (filter === 'draft' && summary.status === 'Draft')
      || (filter === 'active' && summary.status === 'Active')
      || (filter === 'paused' && summary.status === 'Paused')
      || (filter === 'completed' && summary.status === 'Completed')
    return matchesSearch && matchesClient && matchesFilter
  }).sort((left, right) => {
    // Ties always fall back to client name, so re-sorting never reshuffles rows
    // that compare equal and the list stays readable between clicks.
    const byClient = left.client.name.localeCompare(right.client.name)
    if (sort.column === 'default') {
      return statusPriority[left.status] - statusPriority[right.status] || byClient
    }
    const leftValue = sortValue(left, sort.column)
    const rightValue = sortValue(right, sort.column)
    const ordered = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue))
    return (sort.direction === 'asc' ? ordered : -ordered) || byClient
  })

  const syncFreshness = useMemo(
    () => describeSyncFreshness(summaries.map((summary) => summary.campaign?.last_synced_at), Date.now()),
    [summaries],
  )
  const sendingNow = useMemo(() => {
    const sending = summaries.filter((summary) => (summary.campaign?.target_counts.staged_sending || 0) > 0)
    return {
      pitches: sending.reduce((total, summary) => total + (summary.campaign?.target_counts.staged_sending || 0), 0),
      campaigns: sending.length,
      href: sending.length === 0 ? null : `${baseHref}/client-campaigns/${sending[0].client.id}?tab=leads`,
    }
  }, [baseHref, summaries])

  const activeCount = summaries.filter((summary) => summary.status === 'Active').length
  const sentCount = summaries.reduce((total, summary) => (
    total + (summary.campaign?.analytics.emails_sent_count ?? 0)
  ), 0)
  const positiveReplyCount = summaries.reduce((total, summary) => (
    total + (summary.campaign?.analytics.total_interested || 0)
  ), 0)
  const assignedClientIds = new Set(providerBackedCampaigns.map((campaign) => campaign.client_id))
  const availableCampaignClients = activeClients.filter((client) => !assignedClientIds.has(client.id))
  const selectedProviderCampaign = selectedProviderCampaignId === 'new'
    ? null
    : unassignedProviderCampaigns.find((campaign) => campaign.id === selectedProviderCampaignId) || null

  const saveInstantlyConnection = async () => {
    let apiKey = apiKeyDraft.trim()
    if (apiKey.length < 20 || connectionSaving) return
    setApiKeyDraft('')
    setConnectionSaving(true)
    try {
      await connectWorkspaceInstantly(workspaceId, apiKey)
      setConnectionOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      toast.success('Instantly connected. Campaign launching is ready.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Instantly could not be connected.')
    } finally {
      apiKey = ''
      setConnectionSaving(false)
    }
  }

  function resetCreateDialog() {
    setCreateOpen(false)
    setCreateStep(1)
    setSelectedClientId('')
    setSelectedProviderCampaignId('new')
    setCampaignName('')
    setCampaignTimezoneDraft(defaultInstantlyTimezone())
    setCampaignDailyLimit(30)
    setSelectedSenderAccounts(new Set())
  }

  const selectClient = (clientId: string) => {
    const client = availableCampaignClients.find((candidate) => candidate.id === clientId)
    setSelectedClientId(clientId)
    setSelectedProviderCampaignId('new')
    setCampaignName(client ? `${client.name} Podcast Outreach` : '')
    setSelectedSenderAccounts(new Set())
  }

  const selectProviderCampaign = (providerCampaignId: string) => {
    setSelectedProviderCampaignId(providerCampaignId)
    if (providerCampaignId === 'new') {
      setCampaignName(selectedClient ? `${selectedClient.name} Podcast Outreach` : '')
      setCampaignTimezoneDraft(defaultInstantlyTimezone())
      setCampaignDailyLimit(30)
      setSelectedSenderAccounts(new Set())
      return
    }
    const providerCampaign = unassignedProviderCampaigns.find((campaign) => campaign.id === providerCampaignId)
    if (!providerCampaign) return
    setCampaignName(providerCampaign.name)
    setCampaignTimezoneDraft(providerCampaign.timezone)
    setCampaignDailyLimit(providerCampaign.daily_limit)
    setSelectedSenderAccounts(new Set(providerCampaign.sender_accounts))
  }

  const openDraftWorkspace = () => {
    if (!selectedClientId) return
    saveCampaignMutation.mutate({
      workspaceId,
      clientId: selectedClientId,
      name: campaignName.trim(),
      timezone: campaignTimezoneDraft,
      dailyLimit: campaignDailyLimit,
      senderAccounts: Array.from(selectedSenderAccounts),
      shortlistPodcastIds: [],
      providerCampaignId: selectedProviderCampaign?.id || null,
    })
  }

  if (clientsError) {
    return (
      <Card>
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div><p className="font-semibold">Campaign clients could not be loaded</p><p className="text-sm text-muted-foreground">{clientsError.message}</p></div>
          <Button variant="outline" onClick={onRetryClients}>Try again</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card
        data-testid="instantly-connection-card"
        className={integration?.connected ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}
      >
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration?.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {campaignOverviewQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlugZap className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {campaignOverviewQuery.isLoading
                    ? 'Checking Instantly connection…'
                    : integration?.connected
                      ? integration.provider_workspace_name || 'Instantly connected'
                      : integration?.status === 'error'
                        ? 'Instantly needs attention'
                        : 'Connect Instantly to launch outreach'}
                </p>
                {integration?.connected && <Badge variant="outline" className="border-emerald-200 bg-background text-emerald-800">Connected</Badge>}
              </div>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {campaignOverviewQuery.error instanceof Error
                  ? campaignOverviewQuery.error.message
                  : integration?.connected
                    ? `${integration.active_account_count} active sending account${integration.active_account_count === 1 ? '' : 's'} · ${providerCampaigns.length} Instantly campaign${providerCampaigns.length === 1 ? '' : 's'} found · key ending ${integration.api_key_last_four || '••••'}`
                    : integration?.last_error || 'Draft campaigns and pitches now; the workspace owner connects one V2 API key before anyone sends.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {campaignOverviewQuery.error && (
              <Button type="button" variant="outline" size="sm" onClick={() => void campaignOverviewQuery.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />Try again
              </Button>
            )}
            {integration?.connected && canManageCampaigns && (
              <Button type="button" variant="outline" size="sm" disabled={refreshConnectionMutation.isPending} onClick={() => refreshConnectionMutation.mutate()}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshConnectionMutation.isPending ? 'animate-spin' : ''}`} />Refresh
              </Button>
            )}
            {integration?.can_manage && (
              <Button type="button" size="sm" variant={integration.connected ? 'outline' : 'default'} onClick={() => setConnectionOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />{integration.connected ? 'Manage key' : 'Connect Instantly'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {campaignOverviewQuery.data?.provider_campaigns_error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><p className="font-medium">Instantly campaigns could not be refreshed</p><p className="mt-0.5 text-amber-800">{campaignOverviewQuery.data.provider_campaigns_error}</p></div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">All campaigns</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every row is a real Instantly campaign assigned to one client.</p>
        </div>
        {canManageCampaigns && (
          <div className="flex flex-wrap gap-2">
            {integration?.connected && (
              <Button
                type="button"
                variant="outline"
                disabled={refreshAnalyticsMutation.isPending}
                onClick={() => refreshAnalyticsMutation.mutate()}
              >
                <BarChart3 className={`mr-2 h-4 w-4 ${refreshAnalyticsMutation.isPending ? 'animate-pulse' : ''}`} />
                Refresh totals
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)} disabled={clientsLoading || campaignOverviewQuery.isLoading || !integration?.connected || availableCampaignClients.length === 0}>
              <Plus className="mr-2 h-4 w-4" />New campaign
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Active campaigns" value={activeCount} detail="Currently sending outreach" icon={CheckCircle2} />
        <SummaryMetric label="Emails sent" value={sentCount} detail="Synced campaign outreach" icon={Mail} />
        <SummaryMetric
          label="Positive replies"
          value={integration?.connected ? positiveReplyCount : '—'}
          detail={integration?.connected
            ? `Replies marked interested · ${replyRate} of ${contactedCount} contacted replied`
            : 'Available after Instantly sync'}
          icon={MessageSquare}
        />
        {/* Bounces and unsubscribes were collected on every sync and shown
            nowhere. A rising bounce rate is the signal that a sending domain
            is burning, and it arrives before Instantly disables anything. */}
        <SummaryMetric
          label="Bounce rate"
          value={integration?.connected ? bounceRate : '—'}
          detail={integration?.connected
            ? bouncedCount === 0 && unsubscribedCount === 0
              ? 'No bounces recorded'
              : `${bouncedCount} bounced · ${unsubscribedCount} unsubscribed`
            : 'Available after Instantly sync'}
          icon={AlertCircle}
          tone={bounceAlarm ? 'alarm' : undefined}
        />
      </div>

      {/* Every number above arrives only when somebody presses Refresh totals,
          and without this they look equally current at one minute or one
          fortnight old. */}
      {integration?.connected && syncFreshness && (
        <p className={`flex items-center gap-2 text-xs ${syncFreshness.stale ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>
          {syncFreshness.stale && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {syncFreshness.label}
        </p>
      )}

      {/* Pitches added to a campaign that was already live start sending on the
          next window without anyone pressing launch. That is the one state on
          this page where real hosts are being emailed right now, and it was
          only ever a cell in a table. */}
      {sendingNow.pitches > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">
                {sendingNow.pitches} pitch{sendingNow.pitches === 1 ? '' : 'es'} {sendingNow.pitches === 1 ? 'is' : 'are'} already emailing hosts
              </p>
              <p className="mt-0.5 text-amber-800">
                Added to {sendingNow.campaigns === 1 ? 'a campaign that was' : `${sendingNow.campaigns} campaigns that were`} already live, so {sendingNow.pitches === 1 ? 'it sends' : 'they send'} on the next window without a launch.
              </p>
            </div>
          </div>
          {sendingNow.href && (
            <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-300 bg-white hover:bg-amber-100">
              <Link to={sendingNow.href}>Review{sendingNow.campaigns === 1 ? '' : ' first campaign'}<ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl">
              <Select value={clientGroupFilter} onValueChange={setClientGroupFilter}>
                <SelectTrigger aria-label="Filter campaigns by client" className="w-full sm:w-56"><Users className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All clients</SelectItem>
                  {activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaigns…" className="pl-9" />
              </div>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Campaign status filters">
              {filterLabels.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={filter === item.value ? 'secondary' : 'ghost'}
                  className="shrink-0"
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* The overview is what fills this table, so waiting on clients alone
            flashed "No Instantly campaigns assigned yet" at anyone whose client
            list resolved first. */}
        {clientsLoading || campaignOverviewQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : activeClients.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <Mic2 className="h-9 w-9 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No active clients</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add or reactivate a client before creating a podcast outreach campaign.</p>
            <Button asChild variant="outline" className="mt-4"><Link to={`${baseHref}/clients`}>Open clients</Link></Button>
          </div>
        ) : summaries.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <PlugZap className="h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No Instantly campaigns assigned yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Create a new campaign in Instantly or assign an existing Instantly campaign to a client.</p>
            {canManageCampaigns && integration?.connected && availableCampaignClients.length > 0 && <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />New campaign</Button>}
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No campaigns match this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">Clear the search or choose another status.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredSummaries.map((summary) => {
                const metrics = campaignListMetrics(summary)
                return (
                  <div key={summary.client.id} className="rounded-xl border p-4">
                    <Link to={`${baseHref}/client-campaigns/${summary.client.id}`} className="block transition-colors hover:text-primary">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate font-semibold">{summary.campaign?.name || `${summary.client.name} Podcast Outreach`}</p><p className="truncate text-xs text-muted-foreground">{summary.client.name}</p></div>
                        <CampaignStatusBadge status={summary.status} />
                      </div>
                    </Link>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Progress</p><p className="mt-1 font-medium">{metrics.progress === null ? '—' : `${metrics.progress}%`}</p></div>
                      <div><p className="text-xs text-muted-foreground">Sent</p><p className="mt-1 font-medium">{metrics.sent.toLocaleString()}</p></div>
                      <div className="col-span-2"><p className="text-xs text-muted-foreground">Replies</p><p className="mt-1 font-medium">{metrics.replies === null ? '—' : `${metrics.replies.toLocaleString()}${metrics.positiveReplies === null ? '' : ` · ${metrics.positiveReplies.toLocaleString()} interested`}`}</p></div>
                      <div><p className="text-xs text-muted-foreground">Staged in Instantly</p><p className={metrics.stagedSending > 0 ? 'mt-1 font-semibold text-amber-700' : 'mt-1 font-medium'}>{metrics.staged}{metrics.stagedSending > 0 ? ` · ${metrics.stagedSending} sending` : ''}</p></div>
                    </div>
                    <Link to={summary.nextAction.href} className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium text-primary hover:bg-muted">
                      <span><span className="block text-xs font-normal text-muted-foreground">Next step</span>{summary.nextAction.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead column="name" label="Name" className="min-w-64" sort={sort} onToggle={toggleSort} />
                    <SortableHead column="client" label="Client" className="min-w-44" sort={sort} onToggle={toggleSort} />
                    <SortableHead column="status" label="Status" sort={sort} onToggle={toggleSort} />
                    {/* The instruction, not just the history. It was mobile-only
                        before, so the operators on a laptop got seven
                        backward-looking metrics and nothing to act on. */}
                    <TableHead className="min-w-48">Next step</TableHead>
                    <SortableHead column="progress" label="Progress" className="min-w-36" sort={sort} onToggle={toggleSort} />
                    <SortableHead column="sent" label="Sent" sort={sort} onToggle={toggleSort} />
                    <SortableHead column="replies" label="Replies" className="min-w-36" sort={sort} onToggle={toggleSort} />
                    <SortableHead column="staged" label="Staged" className="min-w-32" sort={sort} onToggle={toggleSort} />
                    <TableHead className="w-20 text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummaries.map((summary) => {
                    const metrics = campaignListMetrics(summary)
                    return (
                      <TableRow key={summary.client.id} className="group">
                        <TableCell>
                          <Link to={`${baseHref}/client-campaigns/${summary.client.id}`} className="font-semibold hover:text-primary hover:underline">{summary.campaign?.name || `${summary.client.name} Podcast Outreach`}</Link>
                        </TableCell>
                        <TableCell><Link to={`${baseHref}/clients/${summary.client.id}`} className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline">{summary.client.name}</Link></TableCell>
                        <TableCell><CampaignStatusBadge status={summary.status} /></TableCell>
                        <TableCell>
                          <Link to={summary.nextAction.href} className="text-sm font-medium text-primary hover:underline">{summary.nextAction.label}</Link>
                        </TableCell>
                        <TableCell>{metrics.progress === null ? <span className="text-muted-foreground">—</span> : <div className="flex items-center gap-2"><Progress value={metrics.progress} className="h-1.5 w-20" aria-label={`${summary.client.name} campaign progress`} /><span className="text-sm font-medium">{metrics.progress}%</span></div>}</TableCell>
                        <TableCell>{metrics.sent.toLocaleString()}</TableCell>
                        {/* Replies and positive replies were two columns for one
                            question. Merged, they read as an outcome and leave
                            room for Next step without widening the table. */}
                        <TableCell>{metrics.replies === null ? <span className="text-muted-foreground">—</span> : <span>{metrics.replies.toLocaleString()}{metrics.positiveReplies === null ? '' : <span className="text-muted-foreground"> · {metrics.positiveReplies.toLocaleString()} interested</span>}</span>}</TableCell>
                        <TableCell>
                          {metrics.staged === 0
                            ? <span className="text-muted-foreground">—</span>
                            : metrics.stagedSending > 0
                              ? <span className="font-semibold text-amber-700">{metrics.staged} · {metrics.stagedSending} sending</span>
                              : <span className="font-medium">{metrics.staged} waiting</span>}
                        </TableCell>
                        <TableCell className="text-right"><Button asChild variant="ghost" size="icon" className="text-primary"><Link to={`${baseHref}/client-campaigns/${summary.client.id}`} aria-label={`Open ${summary.client.name} campaign`}><ArrowRight className="h-4 w-4" /></Link></Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateDialog(); else setCreateOpen(true) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <span>Step {createStep} of 2</span>
              <span className="text-muted-foreground">Create client campaign</span>
            </div>
            <DialogTitle>{createStep === 1 ? 'Choose the client' : 'Confirm the campaign'}</DialogTitle>
            <DialogDescription>
              {createStep === 1
                ? 'Each active client has one ongoing podcast outreach campaign.'
                : 'The campaign starts empty. Finished pitches are added only through Send to Client Campaign.'}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 ? (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-client">Client</Label>
                <Select value={selectedClientId} onValueChange={selectClient}>
                  <SelectTrigger id="campaign-client"><SelectValue placeholder="Select an active client" /></SelectTrigger>
                  <SelectContent>
                    {availableCampaignClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="instantly-campaign">Instantly campaign</Label>
                <Select value={selectedProviderCampaignId} onValueChange={selectProviderCampaign} disabled={!selectedClient}>
                  <SelectTrigger id="instantly-campaign"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create a new Instantly campaign</SelectItem>
                    {unassignedProviderCampaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>{campaign.name} · {instantlyStatusLabel(campaign.status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Choose an existing unassigned campaign, or create a new provider campaign for this client.</p>
              </div>
              {selectedProviderCampaign ? (
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-semibold">{selectedProviderCampaign.name}</p><p className="mt-1 text-xs text-muted-foreground">This exact Instantly campaign will be assigned to {selectedClient?.name}.</p></div>
                    <CampaignStatusBadge status={instantlyStatusLabel(selectedProviderCampaign.status)} />
                  </div>
                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><p className="text-xs text-muted-foreground">Sending accounts</p><p className="mt-1 font-medium">{selectedProviderCampaign.sender_accounts?.length ?? 0}</p></div>
                    <div><p className="text-xs text-muted-foreground">Daily limit</p><p className="mt-1 font-medium">{selectedProviderCampaign.daily_limit.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">Timezone</p><p className="mt-1 truncate font-medium">{selectedProviderCampaign.timezone}</p></div>
                  </div>
                </div>
              ) : <>
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign name</Label>
                  <Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} disabled={!selectedClient} />
                  <p className="text-xs text-muted-foreground">This name will also be used for the new campaign in Instantly.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="campaign-timezone">Sending timezone</Label>
                  <Input id="campaign-timezone" value={campaignTimezoneDraft} onChange={(event) => setCampaignTimezoneDraft(event.target.value)} disabled={!selectedClient} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-daily-limit">Daily lead limit</Label>
                  <Input
                    id="campaign-daily-limit"
                    type="number"
                    min={1}
                    max={1000}
                    value={campaignDailyLimit}
                    onChange={(event) => setCampaignDailyLimit(Number(event.target.value) || 1)}
                    disabled={!selectedClient}
                  />
                </div>
              </div>
              <InstantlyAccountPicker
                accounts={sendingAccounts}
                connected={Boolean(integration?.connected)}
                selected={selectedSenderAccounts}
                onChange={setSelectedSenderAccounts}
                assignments={mailboxAssignments}
                defaultClientId={selectedClientId || null}
                className="max-h-52"
              />
              </>}
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="font-semibold text-emerald-950">Campaign ready to create</p><p className="mt-1 text-sm leading-6 text-emerald-900/80">This creates the client’s campaign shell without adding any podcasts. A podcast appears in Client Campaigns only after its sequence is finalized and sent from the Write Pitch modal.</p></div></div>
              </div>
              <div className="grid gap-3 rounded-xl border bg-muted/15 p-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Client</p><p className="mt-1 font-medium">{selectedClient?.name}</p></div>
                <div><p className="text-xs text-muted-foreground">Instantly campaign</p><p className="mt-1 font-medium">{selectedProviderCampaign?.name || campaignName}</p></div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            Saving creates or assigns a real Instantly campaign and ties it to this client. Email only begins after a podcast message is explicitly approved.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={createStep === 1 ? resetCreateDialog : () => setCreateStep(1)}>{createStep === 1 ? 'Cancel' : 'Back'}</Button>
            {createStep === 1 ? (
              <Button type="button" disabled={!selectedClientId || !campaignName.trim() || (selectedProviderCampaignId === 'new' ? selectedSenderAccounts.size === 0 : !selectedProviderCampaign)} onClick={() => setCreateStep(2)}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
            ) : (
              <Button type="button" disabled={saveCampaignMutation.isPending} onClick={openDraftWorkspace}>
                {saveCampaignMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save &amp; open campaign<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connectionOpen} onOpenChange={(open) => {
        setConnectionOpen(open)
        if (!open) setApiKeyDraft('')
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <DialogTitle>{integration?.connected ? 'Manage Instantly connection' : 'Connect your Instantly workspace'}</DialogTitle>
            <DialogDescription>
              Enter a V2 API key for this agency workspace. The key is verified against Instantly, encrypted server-side, and never shown again.
            </DialogDescription>
          </DialogHeader>

          {integration?.connected && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
              <p className="font-semibold text-emerald-900">{integration.provider_workspace_name}</p>
              <p className="mt-1 text-emerald-800">Key ending {integration.api_key_last_four} · {integration.active_account_count} active sender{integration.active_account_count === 1 ? '' : 's'}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="instantly-api-key">{integration?.connected ? 'Replacement API key' : 'Instantly V2 API key'}</Label>
            <Input
              id="instantly-api-key"
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder="Paste the workspace API key"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Required scopes: workspace and account read; campaign read/create/update; lead read/create/update. No inbox or subsequence permissions are needed.
            </p>
          </div>

          <div className="flex gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Staff can use the connected campaign tools, but only the workspace owner can replace or remove the credential.</p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {integration?.connected && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">Disconnect</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Instantly?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the stored API key immediately. Existing Instantly campaigns keep running there until they are paused in Instantly or reconnected here.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep connected</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={disconnectMutation.isPending}
                        onClick={() => disconnectMutation.mutate()}
                      >
                        Remove API key
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setConnectionOpen(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={apiKeyDraft.trim().length < 20 || connectionSaving}
                onClick={() => void saveInstantlyConnection()}
              >
                {connectionSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify &amp; save key
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WorkspaceCampaigns
