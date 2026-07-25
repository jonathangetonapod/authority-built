export const MY_WORKSPACE_BASE_HREF = '/app'

export type WorkspaceModule =
  | 'overview'
  | 'onboarding'
  | 'podcast-finder'
  | 'prospects'
  | 'clients'
  | 'client-campaigns'
  | 'master-inbox'
  | 'mailboxes'
  | 'guest-resources'
  | 'settings'

const WORKSPACE_MODULES = new Set<WorkspaceModule>([
  'overview',
  'onboarding',
  'podcast-finder',
  'prospects',
  'clients',
  'client-campaigns',
  'master-inbox',
  'mailboxes',
  'guest-resources',
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
    : 'overview'
}
