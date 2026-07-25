import { useQuery } from '@tanstack/react-query'
import {
  BookOpen,
  ClipboardList,
  Database,
  Inbox,
  Loader2,
  Mailbox,
  Megaphone,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
  workspaceModuleHref,
  type WorkspaceModule,
} from '@/lib/workspaceRoutes'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceOverviewProps {
  platformWorkspaceId?: string
}

const moduleCards: Array<{
  module: WorkspaceModule
  name: string
  description: string
  icon: typeof Users
}> = [
  {
    module: 'onboarding',
    name: 'Onboarding',
    description: 'Build client intake forms, share secure links, and review submitted profiles.',
    icon: ClipboardList,
  },
  {
    module: 'podcast-finder',
    name: 'Podcast Finder',
    description: 'Find new podcasts for any client with weekly history deduplication built in.',
    icon: Search,
  },
  {
    module: 'podcast-database',
    name: 'Podcast Database',
    description: 'Search the shared catalog built by every workspace and add proven shows to a client shortlist.',
    icon: Database,
  },
  {
    module: 'clients',
    name: 'Clients',
    description: 'Manage the clients and research profiles owned by this workspace.',
    icon: Users,
  },
  {
    module: 'client-campaigns',
    name: 'Client Campaigns',
    description: 'Organize client outreach campaigns and monitor delivery and reply performance.',
    icon: Megaphone,
  },
  {
    module: 'master-inbox',
    name: 'Master Inbox',
    description: 'Review and respond to replies across every campaign without losing client context.',
    icon: Inbox,
  },
  {
    module: 'mailboxes',
    name: 'Mailboxes',
    description: 'See sending accounts, capacity, warmup, health, and client assignments in one place.',
    icon: Mailbox,
  },
  {
    module: 'guest-resources',
    name: 'Guest Resources',
    description: 'Publish resources for every client or a selected client audience.',
    icon: BookOpen,
  },
  {
    module: 'settings',
    name: 'Settings',
    description: 'Manage workspace access, people, and branding controls.',
    icon: Settings,
  },
]

const WorkspaceOverview = ({ platformWorkspaceId }: WorkspaceOverviewProps) => {
  const { isPlatformAdmin, user, workspace } = useAuth()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isSelectedWorkspace = platformWorkspaceId !== undefined
  const validSelectedWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'overview'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isSelectedWorkspace && validSelectedWorkspaceId,
    retry: false,
    gcTime: 0,
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

  const heading = isPlatformAdmin && !isSelectedWorkspace && effectiveWorkspace.is_default
    ? 'My Workspace'
    : effectiveWorkspace.name

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Workspace overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{heading}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Every workspace uses this same set of tools. Records and actions stay inside the workspace selected above.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moduleCards.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.module} className="flex h-full flex-col">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button asChild variant="outline" className="w-full">
                    <Link to={workspaceModuleHref(baseHref, item.module)}>Open {item.name}</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOverview
