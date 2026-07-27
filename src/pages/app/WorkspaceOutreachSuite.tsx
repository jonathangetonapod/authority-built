import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
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
import { MailboxInfraCard } from '@/components/workspace/MailboxInfraCard'
import WorkspaceCampaigns from '@/pages/app/WorkspaceCampaigns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  getWorkspaceInboxThreads,
  getWorkspaceMailboxes,
  type WorkspaceMailboxAccount,
  type WorkspaceMailboxesResponse,
} from '@/services/workspaceCampaigns'

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

function mailboxStatus(status: number): { label: string; className: string } | null {
  if (status === 1) return null
  if (status === 2) return { label: 'Paused', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50' }
  if (status === 3) return { label: 'Maintenance', className: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50' }
  if (status === -1) return { label: 'Connection error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  if (status === -2) return { label: 'Soft bounce error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  if (status === -3) return { label: 'Sending error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  return { label: 'Account issue', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50' }
}

function mailboxLabel(account: WorkspaceMailboxAccount): string {
  if (account.tags?.[0]?.label) return account.tags[0].label
  const name = [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
  return name || 'No account tag'
}

function healthDot(score: number | null): string {
  if (score === null) return 'bg-muted-foreground/40'
  if (score >= 95) return 'bg-emerald-500'
  if (score >= 80) return 'bg-amber-500'
  return 'bg-red-500'
}

interface MailboxesContentProps {
  data?: WorkspaceMailboxesResponse
  loading: boolean
  error: Error | null
  onRetry: () => void
}

const MAILBOX_PAGE_SIZE = 25

const MailboxesContent = ({ data, loading, error, onRetry }: MailboxesContentProps) => {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(MAILBOX_PAGE_SIZE)
  const allAccounts = data?.accounts || []
  const query = search.trim().toLowerCase()
  const accounts = query
    ? allAccounts.filter((account) => (
      account.email.toLowerCase().includes(query)
      || mailboxLabel(account).toLowerCase().includes(query)
    ))
    : allAccounts
  const visibleAccounts = accounts.slice(0, visibleCount)
  const connected = Boolean(data?.connected)

  return (
  <Card className="overflow-hidden shadow-none">
    <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:px-5">
      <div>
        <CardTitle className="text-lg">Sending accounts</CardTitle>
        <CardDescription className="mt-1">
          {data?.provider_workspace_name
            ? `Live from ${data.provider_workspace_name}.`
            : 'Daily sends, warmup activity, and health for every mailbox.'}
        </CardDescription>
      </div>
      <div className="mt-3 flex items-center gap-2 sm:mt-0">
        {connected && allAccounts.length > MAILBOX_PAGE_SIZE && (
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setVisibleCount(MAILBOX_PAGE_SIZE)
            }}
            placeholder="Search mailboxes…"
            aria-label="Search mailboxes"
            className="h-8 w-48 bg-background"
          />
        )}
        <Badge variant="outline" className="w-fit bg-background text-muted-foreground">
          {loading
            ? 'Loading mailboxes'
            : error
              ? 'Unavailable'
              : connected
                ? query
                  ? `${accounts.length} of ${allAccounts.length}`
                  : `${allAccounts.length} mailboxes`
                : 'Not connected'}
        </Badge>
      </div>
    </CardHeader>
    {data?.analytics_errors?.length ? (
      <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Account details are current, but some sending or warmup analytics could not be refreshed.
      </div>
    ) : null}
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
          {loading && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="h-52 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading mailboxes
                </div>
              </TableCell>
            </TableRow>
          )}
          {!loading && error && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="h-52 text-center">
                <div className="mx-auto max-w-md">
                  <AlertCircle className="mx-auto h-6 w-6 text-amber-600" />
                  <h2 className="mt-3 font-semibold">Mailbox data unavailable</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
                </div>
              </TableCell>
            </TableRow>
          )}
          {!loading && !error && !connected && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="h-52 text-center">
                <h2 className="font-semibold">
                  {data?.reason ? 'Instantly declined the connected key' : 'Instantly is not connected'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data?.reason === 'key_rejected'
                    ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
                    : data?.reason === 'scope_missing'
                      ? 'The saved API key cannot read accounts. Reconnect Instantly with a key that has all scopes enabled.'
                      : 'Connect this workspace to load its sending accounts.'}
                </p>
              </TableCell>
            </TableRow>
          )}
          {!loading && !error && connected && accounts.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="h-52 text-center">
                <h2 className="font-semibold">No mailboxes found</h2>
                <p className="mt-1 text-sm text-muted-foreground">This Instantly workspace has no sending accounts.</p>
              </TableCell>
            </TableRow>
          )}
          {!loading && !error && connected && visibleAccounts.map((account) => {
            const status = mailboxStatus(account.status)
            const sendingError = account.status < 0
            const sendProgress = account.daily_limit && account.sent_today !== null
              ? Math.min((account.sent_today / account.daily_limit) * 100, 100)
              : 0
            const healthScore = account.health_score === null ? null : Math.round(account.health_score)
            return (
              <TableRow key={account.email} className={sendingError ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-muted/30'}>
                <TableCell className="px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{account.email}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">{mailboxLabel(account)}</span>
                      {(account.tags?.length ?? 0) > 1 && <span className="text-[10px] text-muted-foreground">+{account.tags.length - 1}</span>}
                      {status && (
                        <Badge variant="outline" title={account.status_message || status.label} className={`px-2 py-0 text-[10px] font-semibold ${status.className}`}>
                          {status.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="w-24">
                    <p className="font-semibold tabular-nums">
                      {account.sent_today ?? '—'} of {account.daily_limit ?? '—'}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${sendProgress}%` }} />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <span className={`font-semibold tabular-nums ${sendingError ? 'text-red-700' : 'text-foreground'}`}>
                    {account.warmup_emails ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="py-4 pr-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${healthDot(healthScore)}`} aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{healthScore === null ? '—' : `${healthScore}%`}</span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {!loading && !error && connected && accounts.length > visibleCount && (
        <div className="border-t px-5 py-3 text-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setVisibleCount((current) => current + 50)}
          >
            Show more ({accounts.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </CardContent>
  </Card>
  )
}

const WorkspaceOutreachSuite = ({ module, platformWorkspaceId }: WorkspaceOutreachSuiteProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
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
    enabled: ['client-campaigns', 'master-inbox'].includes(module)
      && !isSelectedWorkspace
      && Boolean(workspace?.id),
    retry: false,
  })
  const mailboxWorkspaceId = isSelectedWorkspace ? selectedWorkspaceId : workspace?.id || ''
  const mailboxesQuery = useQuery({
    queryKey: [
      isSelectedWorkspace ? 'platform' : 'tenant',
      user?.id || 'unknown',
      'workspace',
      mailboxWorkspaceId || 'missing',
      'mailboxes',
    ],
    queryFn: () => getWorkspaceMailboxes(mailboxWorkspaceId),
    enabled: module === 'mailboxes'
      && UUID_PATTERN.test(mailboxWorkspaceId)
      && (!isSelectedWorkspace || Boolean(selectedWorkspaceQuery.data?.workspace)),
    retry: false,
    staleTime: 60_000,
  })

  const effectiveWorkspace = isSelectedWorkspace
    ? selectedWorkspaceQuery.data?.workspace || null
    : workspace
  const baseHref = isSelectedWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const canManage = Boolean(
    isSelectedWorkspace
    || isPlatformAdmin
    || membership?.role === 'owner'
    || membership?.role === 'admin',
  )
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

  // Same key the Master Inbox itself uses, so the badge and the panel below it
  // can never disagree. It used to be a static element that said "not
  // connected" whenever this module was open — including above a list of
  // replies it had just loaded from Instantly.
  const inboxConnectionQuery = useQuery({
    queryKey: ['workspace-inbox', effectiveWorkspace?.id ?? ''],
    queryFn: () => getWorkspaceInboxThreads(effectiveWorkspace?.id ?? ''),
    enabled: module === 'master-inbox' && Boolean(effectiveWorkspace?.id),
    retry: false,
    staleTime: 30_000,
  })
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
        <header className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ActiveIcon className="h-4.5 w-4.5" /></div>
            <div className="min-w-0">
              <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{config.name}</h1>
              <p className="truncate text-xs text-muted-foreground" title={config.description}>{workspaceLabel}</p>
            </div>
          </div>
          {module === 'master-inbox' && !inboxConnectionQuery.isLoading && (
            inboxConnectionQuery.data?.connected
              ? (
                <div data-testid="instantly-connection-state" className="flex w-fit shrink-0 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  <PlugZap className="h-3.5 w-3.5" />Instantly connected
                </div>
              )
              : (
                <div data-testid="instantly-connection-state" className="flex w-fit shrink-0 items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  <PlugZap className="h-3.5 w-3.5" />
                  {inboxConnectionQuery.data?.reason === 'key_rejected'
                    ? 'Instantly key rejected'
                    : inboxConnectionQuery.data?.reason === 'scope_missing'
                      ? 'Instantly key missing scopes'
                      : 'Instantly not connected'}
                </div>
              )
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
        {module === 'master-inbox' && (
          <MasterInboxPreview
            workspaceId={effectiveWorkspace.id}
            clients={campaignClients}
            clientsLoading={campaignClientsLoading}
            clientsError={campaignClientsError}
            baseHref={baseHref}
            canManage={canManage}
          />
        )}
        {module === 'mailboxes' && (
          <>
            <MailboxesContent
              data={mailboxesQuery.data}
              loading={mailboxesQuery.isLoading}
              error={mailboxesQuery.error instanceof Error ? mailboxesQuery.error : null}
              onRetry={() => void mailboxesQuery.refetch()}
            />
            <MailboxInfraCard workspaceId={effectiveWorkspace.id} />
          </>
        )}

      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOutreachSuite
