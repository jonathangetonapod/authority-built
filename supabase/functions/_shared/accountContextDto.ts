export interface AccountMembershipRecord {
  id: string
  workspace_id: string
  full_name: string | null
  role: string
  status: string
  /** The member's own picture, shown beside their name in the sidebar. */
  avatar_path?: string | null
  avatar_updated_at?: string | null
}

export interface AccountMembershipDto {
  id: string
  workspace_id: string
  full_name: string | null
  role: string
  status: string
  avatar_path: string | null
  avatar_updated_at: string | null
}

export interface AccountWorkspaceRecord {
  id: string
  name: string
  slug: string | null
  status: string
  is_default: boolean
  logo_path: string | null
  logo_updated_at: string | null
}

export interface AccountWorkspaceDto {
  id: string
  name: string
  slug: string | null
  status: string
  is_default: boolean
  logo_path: string | null
  logo_updated_at: string | null
}

export function toAccountMembershipDto(
  membership: AccountMembershipRecord,
): AccountMembershipDto {
  return {
    id: membership.id,
    workspace_id: membership.workspace_id,
    full_name: membership.full_name,
    role: membership.role,
    status: membership.status,
    avatar_path: membership.avatar_path ?? null,
    avatar_updated_at: membership.avatar_updated_at ?? null,
  }
}

export function toAccountWorkspaceDto(
  workspace: AccountWorkspaceRecord,
): AccountWorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
    is_default: workspace.is_default,
    logo_path: workspace.logo_path,
    logo_updated_at: workspace.logo_updated_at,
  }
}
