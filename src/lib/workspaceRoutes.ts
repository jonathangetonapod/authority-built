export const MY_WORKSPACE_BASE_HREF = '/app'

export type WorkspaceModule =
  | 'onboarding'
  | 'podcast-finder'
  | 'podcast-database'
  | 'client-podcast-system'
  | 'prospects'
  | 'clients'
  | 'client-campaigns'
  | 'master-inbox'
  | 'mailboxes'
  | 'settings'

const WORKSPACE_MODULES = new Set<WorkspaceModule>([
  'onboarding',
  'podcast-finder',
  'podcast-database',
  'client-podcast-system',
  'prospects',
  'clients',
  'client-campaigns',
  'master-inbox',
  'mailboxes',
  'settings',
])

export function selectedWorkspaceBaseHref(workspaceId: string): string {
  return `${MY_WORKSPACE_BASE_HREF}/workspaces/${workspaceId.toLowerCase()}`
}

export function workspaceModuleHref(baseHref: string, module: WorkspaceModule): string {
  return `${baseHref}/${module}`
}

export function workspaceModuleFromPath(pathname: string): WorkspaceModule {
  if (pathname.includes('/podcast-finder')) return 'podcast-finder'
  if (pathname.includes('/prospect-dashboards')) return 'prospects'
  if (pathname.includes('/client-campaigns')) return 'client-campaigns'
  if (pathname.includes('/settings')) return 'settings'

  const segments = pathname.split('/').filter(Boolean)
  const candidate = segments.at(-1)
  return candidate && WORKSPACE_MODULES.has(candidate as WorkspaceModule)
    ? candidate as WorkspaceModule
    : 'clients'
}
