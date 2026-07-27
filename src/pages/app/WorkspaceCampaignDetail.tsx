import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Pause,
  Play,
  Send,
  Settings2,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { InstantlyAccountPicker } from '@/components/workspace/InstantlyAccountPicker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail } from '@/services/clients'
import {
  getWorkspaceCampaign,
  saveWorkspaceCampaign,
  setWorkspaceCampaignRunning,
  updateWorkspaceCampaignSettings,
  type WorkspaceCampaignProviderSchedule,
  type WorkspaceCampaignTarget,
} from '@/services/workspaceCampaigns'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PitchStage = 'ready' | 'previously-contacted' | 'launching' | 'in-outreach' | 'replied' | 'failed' | 'completed'

interface WorkspaceCampaignDetailProps {
  platformWorkspaceId?: string
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function pitchStage(target?: WorkspaceCampaignTarget): PitchStage {
  if (target?.prior_outreach_at && !target.launched_at) return 'previously-contacted'
  if (!target || target.status === 'draft') return 'ready'
  if (target.status === 'in_outreach') return 'in-outreach'
  return target.status
}

function targetWasSentToCampaign(target: WorkspaceCampaignTarget): boolean {
  return target.status !== 'draft'
    && Boolean(target.contact_email?.trim())
    && Boolean(target.pitch_subject?.trim())
    && Boolean(target.pitch_body?.trim())
    && Boolean(target.follow_up_1_body?.trim())
    && Boolean(target.follow_up_2_body?.trim())
}

function stageLabel(stage: PitchStage): string {
  const labels: Record<PitchStage, string> = {
    ready: 'Ready for outreach',
    'previously-contacted': 'Previously contacted',
    launching: 'Launching',
    'in-outreach': 'In outreach',
    replied: 'Replied',
    failed: 'Needs attention',
    completed: 'Completed',
  }
  return labels[stage]
}

function stageClass(stage: PitchStage): string {
  if (stage === 'failed') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (stage === 'previously-contacted') return 'border-sky-200 bg-sky-50 text-sky-800'
  if (stage === 'ready') return 'border-violet-200 bg-violet-50 text-violet-800'
  if (stage === 'in-outreach' || stage === 'launching') return 'border-sky-200 bg-sky-50 text-sky-800'
  if (stage === 'replied' || stage === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function leadDelivery(target?: WorkspaceCampaignTarget): { label: string; detail: string; className: string } {
  const stage = pitchStage(target)
  if (stage === 'ready') return { label: 'Not emailed', detail: 'Ready for campaign', className: 'border-slate-200 bg-slate-50 text-slate-700' }
  if (stage === 'previously-contacted') return { label: 'Previously contacted', detail: 'Earlier client outreach', className: 'border-sky-200 bg-sky-50 text-sky-800' }
  if (stage === 'launching') return { label: 'Queued', detail: 'Preparing first email', className: 'border-violet-200 bg-violet-50 text-violet-800' }
  if (stage === 'in-outreach') return { label: 'Emailed', detail: 'Sequence running', className: 'border-sky-200 bg-sky-50 text-sky-800' }
  if (stage === 'replied') return { label: 'Replied', detail: 'Follow-ups stopped', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
  if (stage === 'completed') return { label: 'Completed', detail: 'Sequence finished', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
  return { label: 'Delivery issue', detail: 'Needs attention', className: 'border-amber-200 bg-amber-50 text-amber-800' }
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof Mic2 }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </CardContent>
    </Card>
  )
}

/**
 * Instantly's API reference does not state which day index is Sunday, so the
 * convention lives here in one place and the page says so out loud. Guessing
 * silently is what produced a hardcoded "Monday–Friday" nobody could check.
 */
const SCHEDULE_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function scheduleDaysLabel(schedule: WorkspaceCampaignProviderSchedule | null): string {
  const days = schedule?.days ?? []
  const active = days.map((enabled, index) => (enabled ? SCHEDULE_DAY_NAMES[index] : null))
    .filter((name): name is string => Boolean(name))
  if (active.length === 0) return 'None'
  if (active.length === 7) return 'Every day'
  const indexes = days.map((enabled, index) => (enabled ? index : -1)).filter((index) => index >= 0)
  const contiguous = indexes.every((value, position) => (
    position === 0 || value === indexes[position - 1] + 1
  ))
  // A contiguous run reads as a range; anything scattered has to be listed.
  return contiguous && active.length > 2
    ? `${active[0]}–${active[active.length - 1]}`
    : active.join(', ')
}

function scheduleWindowLabel(schedule: WorkspaceCampaignProviderSchedule | null): string {
  if (!schedule?.from || !schedule.to) return 'Not reported'
  const label = (value: string) => {
    const [hour, minute] = value.split(':').map(Number)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value
    const suffix = hour < 12 ? 'AM' : 'PM'
    const display = hour % 12 === 0 ? 12 : hour % 12
    return `${display}:${String(minute).padStart(2, '0')} ${suffix}`
  }
  return `${label(schedule.from)}–${label(schedule.to)}`
}

const WorkspaceCampaignDetail = ({ platformWorkspaceId }: WorkspaceCampaignDetailProps) => {
  const { clientId: routeClientId = '' } = useParams<{ clientId: string }>()
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const clientId = routeClientId.toLowerCase()
  const validAddress = UUID_PATTERN.test(workspaceId) && UUID_PATTERN.test(clientId)
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(workspaceId) : MY_WORKSPACE_BASE_HREF

  const campaignQuery = useQuery({
    queryKey: [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'campaign-layout', clientId],
    queryFn: async () => {
      const [detail, shortlist, campaignState] = await Promise.all([
        getWorkspaceClientDetail(workspaceId, clientId),
        getClientShortlist(workspaceId, clientId),
        getWorkspaceCampaign(workspaceId, clientId),
      ])
      if (
        detail.workspace.id !== workspaceId
        || detail.client.id !== clientId
        || shortlist.client.id !== clientId
        || (campaignState.campaign && campaignState.campaign.client_id !== clientId)
      ) {
        throw new Error('The campaign workspace did not match the client address.')
      }
      return { detail, shortlist, campaignState }
    },
    enabled: validAddress,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  const data = campaignQuery.data
  const detail = data?.detail
  const client = detail?.client
  const campaignState = data?.campaignState
  const campaign = campaignState?.campaign || null
  const integration = campaignState?.integration || null
  const storedCampaignTargets = useMemo(() => campaignState?.targets || [], [campaignState?.targets])
  const campaignTargets = useMemo(
    () => storedCampaignTargets.filter(targetWasSentToCampaign),
    [storedCampaignTargets],
  )
  const targetByShortlistId = useMemo(() => new Map(
    campaignTargets.map((target) => [target.shortlist_podcast_id, target]),
  ), [campaignTargets])
  const effectiveWorkspace = detail?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
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

  const persistedPodcastIds = useMemo(() => new Set(
    campaignTargets.map((target) => target.shortlist_podcast_id),
  ), [campaignTargets])
  const campaignPodcasts = useMemo(() => (data?.shortlist.podcasts || []).filter((podcast) => (
    podcast.visibility === 'visible'
    && persistedPodcastIds.has(podcast.id)
  )), [data?.shortlist.podcasts, persistedPodcastIds])
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null)
  const [settingsName, setSettingsName] = useState('')
  const [settingsTimezone, setSettingsTimezone] = useState('America/New_York')
  const [settingsDailyLimit, setSettingsDailyLimit] = useState(30)
  const [settingsSenders, setSettingsSenders] = useState<Set<string>>(new Set())
  const [campaignRunningPreview, setCampaignRunningPreview] = useState<boolean | null>(null)

  const selectedPodcast = campaignPodcasts.find((podcast) => podcast.id === selectedPodcastId) || null
  const selectedTarget = selectedPodcast ? targetByShortlistId.get(selectedPodcast.id) || null : null

  useEffect(() => {
    setSettingsName(campaign?.name || (client ? `${client.name} Podcast Outreach` : ''))
    setSettingsTimezone(campaign?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York')
    setSettingsDailyLimit(campaign?.daily_limit || 30)
    setSettingsSenders(new Set(campaign?.sender_accounts || []))
  }, [campaign, client])

  const refreshCampaignData = async () => {
    await Promise.all([
      campaignQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
    ])
  }
  const [confirmActivateOpen, setConfirmActivateOpen] = useState(false)
  const runningMutation = useMutation({
    mutationFn: (running: boolean) => setWorkspaceCampaignRunning(workspaceId, clientId, running),
    onMutate: (running) => setCampaignRunningPreview(running),
    onSuccess: async (result, running) => {
      setConfirmActivateOpen(false)
      setCampaignRunningPreview(result.status === 'active')
      await refreshCampaignData()
      toast.success(running ? campaign?.status === 'draft' ? 'Campaign launched.' : 'Campaign resumed.' : 'Campaign paused.')
    },
    onError: (error) => {
      setConfirmActivateOpen(false)
      setCampaignRunningPreview(null)
      toast.error(error instanceof Error ? error.message : 'Campaign status could not be changed.')
    },
  })
  const settingsMutation = useMutation({
    mutationFn: async () => {
      const common = {
        workspaceId,
        clientId,
        name: settingsName.trim(),
        timezone: settingsTimezone.trim(),
        dailyLimit: settingsDailyLimit,
        senderAccounts: Array.from(settingsSenders),
      }
      return campaign
        ? await updateWorkspaceCampaignSettings(common)
        : await saveWorkspaceCampaign({
            ...common,
            shortlistPodcastIds: campaignPodcasts.map((podcast) => podcast.id),
          })
    },
    onSuccess: async () => {
      await refreshCampaignData()
      toast.success('Campaign settings saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Campaign settings could not be saved.'),
  })

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  if (!validAddress) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Campaign unavailable</CardTitle><CardDescription>The campaign address is invalid.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns`}>Back to campaigns</Link></Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (campaignQuery.isLoading) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></WorkspaceLayout>
  }

  if (campaignQuery.error || !detail || !client) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Campaign unavailable</CardTitle><CardDescription>{campaignQuery.error instanceof Error ? campaignQuery.error.message : 'This client campaign could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns`}>Back to campaigns</Link></Button><Button variant="outline" onClick={() => void campaignQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  const finderHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const clientHref = `${baseHref}/clients/${client.id}`
  const persistedCampaignStatus = campaign?.status === 'attention'
    ? 'Needs attention'
    : campaign?.status === 'active'
      ? 'Active'
      : campaign?.status === 'paused'
        ? 'Paused'
        : campaign?.status === 'completed'
          ? 'Completed'
          : campaign
            ? 'Draft'
            : detail.outreach.pending_review_count > 0
              ? 'Needs attention'
              : detail.outreach.initial_emails_sent > 0
                ? 'Active'
                : campaignPodcasts.length > 0
                  ? 'Draft'
                  : 'Not started'
  const campaignIsRunning = campaignRunningPreview ?? persistedCampaignStatus === 'Active'
  const campaignStatus = campaignRunningPreview === null
    ? persistedCampaignStatus
    : campaignIsRunning ? 'Active' : 'Paused'
  const campaignHeaderStatus = campaignIsRunning
    ? 'Campaign active'
    : campaignStatus === 'Paused'
      ? 'Campaign inactive · Paused'
      : campaignStatus === 'Needs attention'
        ? 'Campaign inactive · Needs attention'
        : campaignStatus === 'Completed'
          ? 'Campaign inactive · Completed'
          : 'Campaign inactive · Not launched'
  const providerSchedule = campaign?.provider_schedule ?? null
  const providerScheduleDays = scheduleDaysLabel(providerSchedule)
  const providerScheduleWindow = scheduleWindowLabel(providerSchedule)
  const providerTimezoneMismatch = Boolean(
    providerSchedule?.timezone && settingsTimezone && providerSchedule.timezone !== settingsTimezone,
  )
  // Podcasts already sitting in the provider campaign. Activating emails them.
  const stagedWaitingCount = campaign?.target_counts.staged ?? 0
  const campaignRunningAction = campaignIsRunning
    ? 'Pause Campaign'
    : persistedCampaignStatus === 'Draft' ? 'Launch Campaign' : 'Resume Campaign'
  const campaignStatusClass = campaignStatus === 'Active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : campaignStatus === 'Needs attention'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : campaignStatus === 'Paused'
        ? 'border-violet-200 bg-violet-50 text-violet-800'
        : 'border-slate-200 bg-slate-50 text-slate-700'
  const campaignAnalytics = campaign?.analytics
  const contactedCount = campaignAnalytics?.contacted_count ?? detail.outreach.podcasts_contacted
  const replyCount = campaignAnalytics?.reply_count_unique ?? 0
  const positiveReplyCount = campaignAnalytics?.total_interested || 0
  const replyRate = contactedCount > 0 ? Math.round((replyCount / contactedCount) * 100) : 0
  const positiveReplyRate = contactedCount > 0 ? Math.round((positiveReplyCount / contactedCount) * 100) : 0
  const activityTargets = [...campaignTargets]
    .filter((target) => target.launched_at || ['in_outreach', 'replied', 'completed', 'failed'].includes(target.status))
    .sort((left, right) => (right.last_activity_at || right.updated_at).localeCompare(left.last_activity_at || left.updated_at))
  const emailedPodcastCount = campaignTargets.filter((target) => (
    Boolean(target.launched_at) || ['in_outreach', 'replied', 'completed'].includes(target.status)
  )).length
  const openedPodcastCount = campaignTargets.filter((target) => target.email_open_count > 0).length
  const repliedPodcastCount = campaignTargets.filter((target) => target.email_reply_count > 0 || target.status === 'replied').length
  const podcastReplyRate = emailedPodcastCount > 0 ? Math.round((repliedPodcastCount / emailedPodcastCount) * 100) : 0
  const providerAccounts = integration?.accounts || []
  const canManageCampaign = Boolean(campaignState?.can_manage_campaigns)
  const selectedHostName = selectedTarget?.host_name || selectedPodcast?.publisher_name || 'Host not identified'
  const selectedContactEmail = selectedTarget?.contact_email || selectedPodcast?.podcast_email || 'No contact email found'

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-14">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to={`${baseHref}/client-campaigns`}><ArrowLeft className="mr-2 h-4 w-4" />Back to campaigns</Link>
        </Button>

        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-primary">Client · {client.name}</p>
              <Badge variant="outline" className={campaignStatusClass}>
                <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${campaignIsRunning ? 'bg-emerald-600' : 'bg-current opacity-60'}`} />
                {campaignHeaderStatus}
              </Badge>
              <Badge
                variant="outline"
                className={integration?.connected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'}
              >
                {integration?.connected ? `Instantly · ${integration.active_account_count} sender${integration.active_account_count === 1 ? '' : 's'}` : 'Instantly not connected'}
              </Badge>
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight">{campaign?.name || `${client.name} Podcast Outreach`}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Podcast outreach with a custom reviewed pitch for every show</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to={clientHref}><UserRound className="mr-2 h-4 w-4" />Open client</Link></Button>
          </div>
        </header>

        <Tabs defaultValue="analytics" className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max justify-start" aria-label="Campaign sections">
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="leads">Podcasts</TabsTrigger>
              <TabsTrigger value="sequences">Sequences</TabsTrigger>
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="leads" className="mt-0 space-y-4">
            <Card className="overflow-hidden">
              {campaignPodcasts.length > 0 && (
                <>
                  <div className="border-b p-4">
                    <h2 className="font-semibold">Podcast lead list</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Track delivery and engagement for every podcast contact in this campaign.</p>
                  </div>
                  <div className="grid grid-cols-2 border-b bg-muted/10 sm:grid-cols-5" aria-label="Podcast outreach summary">
                    {[
                      ['In campaign', campaignTargets.length],
                      ['Emailed', emailedPodcastCount],
                      ['Opened', openedPodcastCount],
                      ['Replied', repliedPodcastCount],
                      ['Reply rate', `${podcastReplyRate}%`],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="border-b p-3 last:border-b-0 odd:border-r sm:border-b-0 sm:border-r sm:last:border-r-0">
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {campaignPodcasts.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <Mic2 className="h-9 w-9 text-muted-foreground/50" />
                  <h2 className="mt-3 font-semibold">No podcasts in this campaign</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">A podcast appears here only after its finished sequence is sent from the Write Pitch modal.</p>
                  <Button asChild variant="outline" className="mt-4"><Link to={finderHref}>Open podcasts and write a pitch</Link></Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 p-3 md:hidden">
                    {campaignPodcasts.map((podcast) => {
                      const target = targetByShortlistId.get(podcast.id)
                      const stage = pitchStage(target)
                      const delivery = leadDelivery(target)
                      const contactEmail = target?.contact_email || podcast.podcast_email
                      return (
                        <button key={podcast.id} type="button" onClick={() => setSelectedPodcastId(podcast.id)} className="w-full rounded-xl border p-4 text-left hover:bg-muted/30">
                          <div className="flex items-start justify-between gap-3"><p className="font-semibold">{podcast.podcast_name}</p><Badge variant="outline" className={stageClass(stage)}>{stageLabel(stage)}</Badge></div>
                          <p className="mt-2 text-xs text-muted-foreground">{target?.host_name || podcast.publisher_name || 'Host not identified'} · {contactEmail || 'Contact needed'}</p>
                          <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="font-medium">{delivery.label} · {delivery.detail}</span><span className="text-muted-foreground">{target?.email_open_count || 0} opens · {target?.email_reply_count || 0} replies</span></div>
                          <p className="mt-3 text-sm font-medium text-primary">{stage === 'failed' ? 'View issue' : 'View details'}<ArrowRight className="ml-1 inline h-3.5 w-3.5" /></p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader><TableRow><TableHead className="min-w-64">Podcast</TableHead><TableHead className="min-w-48">Contact</TableHead><TableHead className="min-w-40">Delivery</TableHead><TableHead className="text-center">Opens</TableHead><TableHead className="text-center">Replies</TableHead><TableHead>Last activity</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {campaignPodcasts.map((podcast) => {
                          const target = targetByShortlistId.get(podcast.id)
                          const stage = pitchStage(target)
                          const delivery = leadDelivery(target)
                          const contactEmail = target?.contact_email || podcast.podcast_email
                          const podcastUrl = podcast.podcast_url ? safeExternalUrl(podcast.podcast_url) : null
                          return (
                            <TableRow key={podcast.id}>
                              <TableCell><div className="flex items-center gap-3">{podcast.podcast_image_url ? <img src={podcast.podcast_image_url} alt="" className="h-10 w-10 rounded-lg border object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Mic2 className="h-4 w-4" /></div>}<div className="min-w-0"><p className="font-semibold">{podcast.podcast_name}</p>{podcastUrl && <a href={podcastUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">Open podcast<ExternalLink className="ml-1 inline h-3 w-3" /></a>}</div></div></TableCell>
                              <TableCell><p className="font-medium">{target?.host_name || podcast.publisher_name || 'Host needed'}</p><p className="text-xs text-muted-foreground">{contactEmail || 'Email not found'}</p></TableCell>
                              <TableCell><Badge variant="outline" className={delivery.className}>{delivery.label}</Badge><p className="mt-1 text-xs text-muted-foreground">{delivery.detail}</p></TableCell>
                              <TableCell className="text-center font-medium tabular-nums">{target?.email_open_count || 0}</TableCell>
                              <TableCell className="text-center font-medium tabular-nums">{target?.email_reply_count || 0}</TableCell>
                              <TableCell><span className="text-sm text-muted-foreground">{formatDate(target?.last_activity_at || target?.updated_at || podcast.feedback_updated_at || podcast.updated_at)}</span></TableCell>
                              <TableCell className="text-right"><Button type="button" size="sm" variant="ghost" className="text-primary" onClick={() => setSelectedPodcastId(podcast.id)}>{stage === 'failed' ? 'View issue' : 'View details'}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3"><Metric label="Sent" value={campaignAnalytics?.emails_sent_count ?? detail.outreach.initial_emails_sent} detail={`${contactedCount} unique podcast contacts`} icon={Mail} /><Metric label="Replies" value={replyCount} detail={`${replyRate}% reply rate`} icon={MessageSquare} /><Metric label="Positive replies" value={positiveReplyCount} detail={`${positiveReplyRate}% positive reply rate`} icon={Inbox} /></div>
            <Card>
              <CardHeader><CardTitle>Campaign conversion</CardTitle><CardDescription>A direct view from podcast outreach to replies and positive interest.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {[['Contacted', contactedCount], ['Replied', replyCount], ['Positive replies', positiveReplyCount]].map(([label, value], index) => (
                  <div key={String(label)} className="relative rounded-xl border bg-muted/15 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p>
                    {index < 2 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground sm:block" />}
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
              <Card>
                <CardHeader><CardTitle>Outreach timeline</CardTitle><CardDescription>Launches and reply activity synced from this client’s Instantly campaign.</CardDescription></CardHeader>
                <CardContent>
                  {activityTargets.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
                      <Activity className="h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-3 font-semibold">No outreach activity yet</p>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">Approve the first custom pitch to add a podcast to the live campaign.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {activityTargets.slice(0, 30).map((target) => (
                        <div key={target.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${target.status === 'replied' ? 'bg-emerald-100 text-emerald-700' : target.status === 'failed' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                            {target.status === 'replied' ? <MessageSquare className="h-4 w-4" /> : target.status === 'failed' ? <AlertCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{target.podcast_name}</p><span className="text-xs text-muted-foreground">{formatDate(target.last_activity_at || target.updated_at)}</span></div>
                            <p className="mt-1 text-sm text-muted-foreground">{stageLabel(pitchStage(target))} · {target.email_reply_count} repl{target.email_reply_count === 1 ? 'y' : 'ies'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Live activity</CardTitle><CardDescription>{campaign?.last_synced_at ? `Automatically synced · Updated ${formatDate(campaign.last_synced_at)}` : 'Automatically synced from Instantly after launch.'}</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Emails sent</span><strong>{campaignAnalytics?.emails_sent_count ?? detail.outreach.initial_emails_sent}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Podcasts contacted</span><strong>{contactedCount}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Unique replies</span><strong>{replyCount}</strong></div>
                  <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Positive replies</span><strong>{positiveReplyCount}</strong></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sequences" className="mt-0">
            <Card>
              <CardHeader><CardTitle>Outreach sequence</CardTitle><CardDescription>Research and all three messages are prepared for each show in Podcasts, then sent through this client’s associated Instantly campaign.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { step: 'Email 1', timing: 'Send when approved', title: 'Reviewed opening pitch', detail: 'Uses the subject and message prepared for this individual podcast.' },
                  { step: 'Email 2', timing: 'Wait 3 days', title: 'Reviewed follow-up', detail: 'Uses the first follow-up prepared for this individual podcast.' },
                  { step: 'Email 3', timing: 'Wait 5 more days', title: 'Reviewed close', detail: 'Uses the final follow-up prepared for this individual podcast.' },
                ].map((item, index) => (
                  <div key={item.step} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[7rem_minmax(0,1fr)_9rem] sm:items-center">
                    <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</div><span className="text-sm font-semibold">{item.step}</span></div>
                    <div><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div>
                    <Badge variant="outline" className="w-fit">{item.timing}</Badge>
                  </div>
                ))}
                <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground"><Settings2 className="mt-0.5 h-4 w-4 shrink-0" /><p>Message preparation belongs in Podcasts. This section controls delivery cadence: text-only email, open tracking on, link tracking off, and stop on reply.</p></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Sending schedule</CardTitle>
                  <CardDescription>What you set here is pushed to Instantly, which does the sending.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="campaign-detail-timezone">Sending timezone</Label>
                      <Input id="campaign-detail-timezone" value={settingsTimezone} onChange={(event) => setSettingsTimezone(event.target.value)} disabled={!canManageCampaign} />
                      <p className="text-xs text-muted-foreground">An IANA name, like America/Bogota. The daily window below is interpreted in this timezone.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="campaign-detail-limit">Daily lead limit</Label>
                      <Input id="campaign-detail-limit" type="number" min={1} max={1000} value={settingsDailyLimit} onChange={(event) => setSettingsDailyLimit(Number(event.target.value) || 1)} disabled={!canManageCampaign} />
                      <p className="text-xs text-muted-foreground">The most new podcast hosts this campaign may email in a day, across every sending account.</p>
                    </div>
                  </div>
                  <Button disabled={!canManageCampaign || !settingsName.trim() || settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>{settingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save schedule</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>What Instantly is set to</CardTitle>
                  <CardDescription>
                    {providerSchedule
                      ? `Read from the campaign${campaign?.last_synced_at ? ` on ${formatDate(campaign.last_synced_at)}` : ''}, not assumed.`
                      : 'Read from the campaign once it has been synced.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {providerSchedule ? (
                    <>
                      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="text-sm text-muted-foreground">Sending days</span><strong className="text-right text-sm">{providerScheduleDays}</strong></div>
                      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="text-sm text-muted-foreground">Daily window</span><strong className="text-right text-sm">{providerScheduleWindow}</strong></div>
                      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="text-sm text-muted-foreground">Timezone</span><strong className="text-right text-sm">{providerSchedule.timezone || 'Not reported'}</strong></div>
                      <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><span className="text-sm text-muted-foreground">Gap between emails</span><strong className="text-right text-sm">{campaign?.provider_email_gap === null || campaign?.provider_email_gap === undefined ? 'Not reported' : `${campaign.provider_email_gap} min`}</strong></div>
                      {providerTimezoneMismatch && (
                        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                          Instantly is sending in {providerSchedule.timezone}, but this campaign is set to {settingsTimezone}. Save the schedule to push your timezone across.
                        </p>
                      )}
                      <p className="text-xs leading-5 text-muted-foreground">
                        Day names assume Instantly numbers days from Sunday. Their API reference does not state it, so check this against the campaign in Instantly once.
                      </p>
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-center">
                      <p className="text-sm font-medium">Nothing read yet</p>
                      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                        This campaign has not been synced with Instantly, so its real sending window is unknown. It is deliberately blank rather than guessed.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="options" className="mt-0">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><h2 className="text-lg font-semibold">Campaign options</h2><p className="mt-1 text-sm text-muted-foreground">Update the campaign identity, sending accounts, and live status.</p></div>
                {campaign?.instantly_campaign_id && canManageCampaign && (persistedCampaignStatus !== 'Draft' || campaignIsRunning) && (
                  <Button variant={campaignIsRunning ? 'destructive' : 'default'} disabled={runningMutation.isPending} onClick={() => (campaignIsRunning ? runningMutation.mutate(false) : setConfirmActivateOpen(true))}>
                    {runningMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : campaignIsRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{campaignRunningAction}
                  </Button>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Campaign identity</CardTitle><CardDescription>Manage this campaign’s name and provider status.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2"><Label htmlFor="campaign-detail-name">Campaign name</Label><Input id="campaign-detail-name" value={settingsName} onChange={(event) => setSettingsName(event.target.value)} disabled={!canManageCampaign} /></div>
                    <div className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">Campaign status</p><p className="text-xs text-muted-foreground">Updates immediately when the campaign is launched, paused, or resumed.</p></div><Badge variant="outline" className={campaignStatusClass}>{campaignStatus}</Badge></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Accounts to use</CardTitle><CardDescription>Select the Instantly mailboxes assigned to this client campaign.</CardDescription></CardHeader>
                  <CardContent><InstantlyAccountPicker accounts={providerAccounts} connected={Boolean(integration?.connected)} selected={settingsSenders} onChange={setSettingsSenders} disabled={!canManageCampaign} /></CardContent>
                </Card>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border bg-muted/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-xs leading-5 text-muted-foreground">Save name and mailbox changes before changing campaign status. Pausing stops new sends; resuming continues the existing campaign.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" disabled={!canManageCampaign || !settingsName.trim() || settingsMutation.isPending} onClick={() => settingsMutation.mutate()}>{settingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button>
                  {campaign?.instantly_campaign_id && canManageCampaign && (
                    <Button variant={campaignIsRunning ? 'destructive' : 'default'} disabled={runningMutation.isPending} onClick={() => (campaignIsRunning ? runningMutation.mutate(false) : setConfirmActivateOpen(true))}>
                      {runningMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : campaignIsRunning ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}{campaignRunningAction}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={Boolean(selectedPodcast)} onOpenChange={(open) => { if (!open) setSelectedPodcastId(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
          {selectedPodcast && (
            <>
              <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={stageClass(pitchStage(selectedTarget || undefined))}>{stageLabel(pitchStage(selectedTarget || undefined))}</Badge><Badge variant="outline">Final sequence</Badge></div>
                <SheetTitle className="text-2xl">{selectedPodcast.podcast_name}</SheetTitle>
                <SheetDescription>Final contact and approved three-email sequence for this campaign.</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-5 sm:p-6">
                <section className="rounded-xl border p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Host contact</p>
                    <p className="mt-1 text-sm text-muted-foreground">Finalized when this podcast was sent to the campaign.</p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/25 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Host name</p>
                      <p className="mt-1 font-medium">{selectedHostName}</p>
                    </div>
                    <div className="rounded-lg bg-muted/25 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Contact email</p>
                      <p className="mt-1 break-all font-medium">{selectedContactEmail}</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div><h3 className="font-semibold">Final three-email sequence</h3><p className="mt-1 text-sm text-muted-foreground">Read-only copy approved before this podcast entered the campaign.</p></div>
                  <div className="space-y-3 rounded-xl border p-4">
                    <Badge variant="secondary">Email 1 · Opening pitch</Badge>
                    <div><p className="text-xs font-medium text-muted-foreground">Subject line</p><p className="mt-1 rounded-lg bg-muted/25 p-3 text-sm font-medium">{selectedTarget?.pitch_subject || 'Subject unavailable'}</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Opening email</p><p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/25 p-3 text-sm leading-6">{selectedTarget?.pitch_body || 'Opening email unavailable'}</p></div>
                  </div>
                  <div className="space-y-3 rounded-xl border p-4">
                    <div><Badge variant="secondary">Email 2 · Follow-up</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 3 days and reply in the original thread.</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Follow-up 1 reply</p><p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/25 p-3 text-sm leading-6">{selectedTarget?.follow_up_1_body || 'First follow-up unavailable'}</p></div>
                  </div>
                  <div className="space-y-3 rounded-xl border p-4">
                    <div><Badge variant="secondary">Email 3 · Close the loop</Badge><p className="mt-2 text-xs text-muted-foreground">Wait 5 more days and reply in the same thread.</p></div>
                    <div><p className="text-xs font-medium text-muted-foreground">Follow-up 2 reply</p><p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/25 p-3 text-sm leading-6">{selectedTarget?.follow_up_2_body || 'Final follow-up unavailable'}</p></div>
                  </div>
                  <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                    {selectedTarget?.prior_outreach_at && !selectedTarget.launched_at
                      ? `Earlier outreach was recorded for this client on ${formatDate(selectedTarget.prior_outreach_at)}. A second launch is blocked to prevent duplicate contact.`
                      : selectedTarget?.last_error
                      || (selectedTarget?.launched_at
                        ? `Outreach started ${formatDate(selectedTarget.launched_at)}. Reply activity updates automatically.`
                        : 'This final sequence is ready for outreach. Launch or pause delivery for the entire campaign from Options.')}
                  </div>
                </section>

                {(selectedTarget?.research_notes || selectedPodcast.ai_fit_reasons?.length || selectedPodcast.ai_pitch_angles?.length) && (
                  <details className="rounded-xl border bg-muted/15 p-4">
                    <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" />Pitch context</summary>
                    {selectedTarget?.research_notes ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Research notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedTarget.research_notes}</p></div> : null}
                    {selectedPodcast.ai_fit_reasons?.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this show fits</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{selectedPodcast.ai_fit_reasons.slice(0, 3).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{reason}</li>)}</ul></div> : null}
                    {selectedPodcast.ai_pitch_angles?.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested talking points</p><div className="mt-2 space-y-2">{selectedPodcast.ai_pitch_angles.slice(0, 3).map((angle) => <div key={angle.title} className="rounded-lg bg-background p-3"><p className="text-sm font-medium">{angle.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{angle.description}</p></div>)}</div></div> : null}
                  </details>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Activating does two things, and only one of them is obvious. The
          second — that Send to Client Campaign stops being a staging action and
          starts emailing hosts on its own — is a change to what a button
          elsewhere in the product means, so it is stated here rather than
          discovered later. */}
      <Dialog open={confirmActivateOpen} onOpenChange={(next) => !runningMutation.isPending && setConfirmActivateOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start sending from {campaign?.name || 'this campaign'}?</DialogTitle>
            <DialogDescription>
              Instantly begins working through this campaign on its next send window.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {stagedWaitingCount > 0 && (
              <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                {stagedWaitingCount === 1
                  ? '1 podcast is already staged in this campaign and will be emailed.'
                  : `${stagedWaitingCount} podcasts are already staged in this campaign and will be emailed.`}
              </p>
            )}
            <p className="rounded-xl border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">This also changes Send to Client Campaign.</span>{' '}
              While the campaign is live, sending a finished pitch adds that host straight into the
              running sequence — the opening email goes out without a separate launch step. Pause the
              campaign again to go back to staging pitches without contacting anyone.
            </p>
          </div>
          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => setConfirmActivateOpen(false)} disabled={runningMutation.isPending}>Cancel</Button>
            <Button onClick={() => runningMutation.mutate(true)} disabled={runningMutation.isPending}>
              {runningMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {campaignRunningAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceCampaignDetail
