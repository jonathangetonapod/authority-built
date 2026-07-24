import { useQuery } from '@tanstack/react-query'
import {
  Inbox,
  Loader2,
  Mailbox,
  Megaphone,
  PlugZap,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import MasterInboxPreview from '@/components/workspace/MasterInboxPreview'
import WorkspaceCampaigns from '@/pages/app/WorkspaceCampaigns'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  },
  'master-inbox': {
    ...suiteItems[1],
    eyebrow: 'AI SDR command center',
    description: 'See every reply in one place, resolve it to the right client and campaign, and give each conversation the correct client AI SDR context and response policy.',
  },
  mailboxes: {
    ...suiteItems[2],
    eyebrow: 'Sending infrastructure',
    description: 'Monitor daily sending volume, warmup activity, and account health across every connected mailbox.',
  },
}

interface MailboxPreviewAccount {
  email: string
  label: string
  sent: number
  dailyLimit: number
  warmupEmails: number
  healthScore: number
  sendingError?: boolean
}

const mailboxPreviewAccounts: MailboxPreviewAccount[] = [
  { email: 'admin@solaraccountreview.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 100 },
  { email: 'admin@solaraccountreview.homes', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 100 },
  { email: 'admin@solarserviceupdate.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 0, healthScore: 100, sendingError: true },
  { email: 'admin@solarserviceupdate.homes', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 100 },
  { email: 'admin@solarsupportcenter.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 100 },
  { email: 'admin@solarsupportcenter.homes', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 97 },
  { email: 'admin@titanbankruptcy.lat', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 100 },
  { email: 'admin@titanbankruptcyupdate.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 0, healthScore: 99, sendingError: true },
  { email: 'admin@titanbankruptcyupdates.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 70, healthScore: 99 },
  { email: 'admin@titansolarbankrupcy.help', label: 'Solar - CI 04/23/2026', sent: 0, dailyLimit: 15, warmupEmails: 0, healthScore: 100, sendingError: true },
]

const MailboxesContent = () => (
  <Card className="overflow-hidden shadow-none">
    <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:px-5">
      <div>
        <CardTitle className="text-lg">Sending accounts</CardTitle>
        <CardDescription className="mt-1">Daily sends, warmup activity, and health for every mailbox.</CardDescription>
      </div>
      <Badge variant="outline" className="mt-3 w-fit bg-background text-muted-foreground sm:mt-0">
        {mailboxPreviewAccounts.length} mailboxes
      </Badge>
    </CardHeader>
    <CardContent className="p-0">
      <Table aria-label="Mailbox accounts" className="min-w-[760px]">
        <caption className="sr-only">Sending volume, warmup activity, and health by mailbox.</caption>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[52%] px-5">Email</TableHead>
            <TableHead className="w-[16%]">Emails sent</TableHead>
            <TableHead className="w-[16%]">Warmup emails</TableHead>
            <TableHead className="w-[16%] pr-5">Health score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mailboxPreviewAccounts.map((account) => {
            const sendProgress = account.dailyLimit > 0 ? (account.sent / account.dailyLimit) * 100 : 0
            return (
              <TableRow key={account.email} className={account.sendingError ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-muted/30'}>
                <TableCell className="px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{account.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{account.label}</span>
                      {account.sendingError && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 px-2 py-0 text-[10px] font-semibold text-red-700 hover:bg-red-50">
                          Sending error
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="w-24">
                    <p className="font-semibold tabular-nums">{account.sent} of {account.dailyLimit}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${sendProgress}%` }} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <span className={`font-semibold tabular-nums ${account.sendingError ? 'text-red-700' : 'text-foreground'}`}>
                    {account.warmupEmails}
                  </span>
                </TableCell>
                <TableCell className="py-4 pr-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${account.healthScore >= 95 ? 'bg-emerald-500' : account.healthScore >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{account.healthScore}%</span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
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
          {module === 'master-inbox' && (
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
