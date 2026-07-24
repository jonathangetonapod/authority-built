import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Inbox,
  Loader2,
  Mailbox,
  Megaphone,
  PlugZap,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import MasterInboxPreview from '@/components/workspace/MasterInboxPreview'
import WorkspaceCampaigns from '@/pages/app/WorkspaceCampaigns'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
  type WorkspaceModule,
} from '@/lib/workspaceRoutes'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type OutreachWorkspaceModule = Extract<
  WorkspaceModule,
  'client-campaigns' | 'master-inbox' | 'mailboxes'
>

interface WorkspaceOutreachSuiteProps {
  module: OutreachWorkspaceModule
  platformWorkspaceId?: string
}

interface SuiteItem {
  module: OutreachWorkspaceModule
  name: string
  icon: LucideIcon
}

interface ModuleConfig extends SuiteItem {
  eyebrow: string
  description: string
  metrics: Array<{ label: string; detail: string }>
}

const suiteItems = [
  {
    module: 'client-campaigns',
    name: 'Client Campaigns',
    icon: Megaphone,
  },
  {
    module: 'master-inbox',
    name: 'Master Inbox',
    icon: Inbox,
  },
  {
    module: 'mailboxes',
    name: 'Mailboxes',
    icon: Mailbox,
  },
] as const satisfies readonly SuiteItem[]

const moduleConfigs: Record<OutreachWorkspaceModule, ModuleConfig> = {
  'client-campaigns': {
    ...suiteItems[0],
    eyebrow: 'Outreach command center',
    description: 'Plan, launch, and monitor Instantly-powered outreach without losing the client context behind each campaign.',
    metrics: [
      { label: 'Campaigns', detail: 'Synced from Instantly' },
      { label: 'Active clients', detail: 'Assigned to outreach' },
      { label: 'Replies', detail: 'Across all campaigns' },
    ],
  },
  'master-inbox': {
    ...suiteItems[1],
    eyebrow: 'AI SDR command center',
    description: 'See every reply in one place, resolve it to the right client and campaign, and give each conversation the correct client AI SDR context and response policy.',
    metrics: [
      { label: 'Unread', detail: 'New conversations' },
      { label: 'Interested', detail: 'Positive intent' },
      { label: 'Needs response', detail: 'Open follow-up work' },
    ],
  },
  mailboxes: {
    ...suiteItems[2],
    eyebrow: 'Sending infrastructure',
    description: 'See every sending account, its warmup and health signals, capacity, and the clients it supports.',
    metrics: [
      { label: 'Connected', detail: 'Sending accounts' },
      { label: 'Healthy', detail: 'Ready to send' },
      { label: 'Daily capacity', detail: 'Across the workspace' },
    ],
  },
}

const MetricStrip = ({ metrics }: { metrics: ModuleConfig['metrics'] }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    {metrics.map((metric) => (
      <Card key={metric.label} className="border-border/70 shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">—</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{metric.detail} after connection</p>
        </CardContent>
      </Card>
    ))}
  </div>
)

const DetailList = ({
  items,
}: {
  items: Array<{ title: string; description: string; icon: LucideIcon }>
}) => (
  <div className="divide-y divide-border">
    {items.map((item) => {
      const Icon = item.icon
      return (
        <div key={item.title} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
          </div>
        </div>
      )
    })}
  </div>
)

const MailboxesContent = () => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Sending accounts</CardTitle>
          <CardDescription>Health, warmup, limits, and assignments across the workspace.</CardDescription>
        </div>
        <Badge variant="outline" className="mt-3 w-fit sm:mt-0">No accounts connected</Badge>
      </CardHeader>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mailbox className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">No mailboxes synced yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Instantly sending accounts will appear here only after a secure server-side connection is configured for this workspace.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mailbox health signals</CardTitle>
        <CardDescription>Spot capacity and deliverability risks before they affect a campaign.</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList items={[
          { title: 'Warmup and status', description: 'See which accounts are healthy, paused, or need attention.', icon: Activity },
          { title: 'Daily capacity', description: 'Understand limits at the mailbox and workspace level.', icon: Send },
          { title: 'Client assignment', description: 'Know exactly which campaigns each sending account supports.', icon: Users },
        ]} />
      </CardContent>
    </Card>
  </div>
)

const WorkspaceOutreachSuite = ({ module, platformWorkspaceId }: WorkspaceOutreachSuiteProps) => {
  const { user, workspace } = useAuth()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isSelectedWorkspace = platformWorkspaceId !== undefined
  const validSelectedWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)
  const config = moduleConfigs[module]

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, module],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isSelectedWorkspace && validSelectedWorkspaceId,
    retry: false,
    gcTime: 0,
  })
  const tenantClientsQuery = useQuery({
    queryKey: ['tenant', user?.id || 'unknown', workspace?.id || 'missing', 'campaign-clients'],
    queryFn: () => getWorkspaceClients(workspace?.id || ''),
    enabled: module === 'client-campaigns' && !isSelectedWorkspace && Boolean(workspace?.id),
    retry: false,
  })

  const effectiveWorkspace = isSelectedWorkspace
    ? selectedWorkspaceQuery.data?.workspace || null
    : workspace
  const baseHref = isSelectedWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
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

  const ActiveIcon = config.icon
  const workspaceLabel = effectiveWorkspace.is_default ? 'My Workspace' : effectiveWorkspace.name
  const campaignClients = isSelectedWorkspace
    ? selectedWorkspaceQuery.data?.clients || []
    : tenantClientsQuery.data || []
  const campaignClientsLoading = isSelectedWorkspace
    ? selectedWorkspaceQuery.isLoading
    : tenantClientsQuery.isLoading
  const campaignClientsError = isSelectedWorkspace
    ? selectedWorkspaceQuery.error instanceof Error ? selectedWorkspaceQuery.error : null
    : tenantClientsQuery.error instanceof Error ? tenantClientsQuery.error : null

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-primary">{config.eyebrow}</span>
              <span className="text-xs text-muted-foreground">{workspaceLabel}</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ActiveIcon className="h-5 w-5" /></div>
              <h1 className="min-w-0 text-3xl font-bold tracking-tight">{config.name}</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{config.description}</p>
          </div>
          {module !== 'client-campaigns' && (
            <div data-testid="instantly-connection-state" className="flex w-fit shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <PlugZap className="h-3.5 w-3.5" />Instantly not connected
            </div>
          )}
        </header>

        {module === 'client-campaigns' && (
          <WorkspaceCampaigns
            workspaceId={effectiveWorkspace.id}
            clients={campaignClients}
            clientsLoading={campaignClientsLoading}
            clientsError={campaignClientsError}
            baseHref={baseHref}
            onRetryClients={() => {
              if (isSelectedWorkspace) void selectedWorkspaceQuery.refetch()
              else void tenantClientsQuery.refetch()
            }}
          />
        )}
        {module === 'mailboxes' && <MetricStrip metrics={config.metrics} />}
        {module === 'master-inbox' && <MasterInboxPreview />}
        {module === 'mailboxes' && <MailboxesContent />}

        {module !== 'client-campaigns' && (
          <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="leading-6">
              This page remains a layout preview until its own workspace-safe Instantly data boundary is released.
            </p>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOutreachSuite
