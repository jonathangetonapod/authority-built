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
import { MailboxesTable } from '@/components/workspace/MailboxesTable'
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
    // Mailboxes needs the client list too: a mailbox is connected to a client
    // by being on that client's campaign.
    enabled: ['client-campaigns', 'master-inbox', 'mailboxes'].includes(module)
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
        workspaceId: selectedWorkspaceId,
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
            <MailboxesTable
              workspaceId={effectiveWorkspace.id}
              data={mailboxesQuery.data}
              loading={mailboxesQuery.isLoading}
              error={mailboxesQuery.error instanceof Error ? mailboxesQuery.error : null}
              onRetry={() => void mailboxesQuery.refetch()}
              canManage={canManage}
              clients={campaignClients}
            />
          </>
        )}

      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOutreachSuite
