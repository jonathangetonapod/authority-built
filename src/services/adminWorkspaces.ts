import { supabase } from '@/lib/supabase'
import type { WorkspaceClient } from '@/services/clients'
import { clientSdrProfileReadiness, isClientSdrProfile } from '@/lib/clientSdrProfile'

export interface AdminWorkspace {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'archived' | 'deleted'
  is_default: boolean
  logo_path?: string | null
  logo_updated_at?: string | null
  /** Set while a deleted workspace is still inside its recovery window. */
  deleted_at?: string | null
  purge_after?: string | null
}

export interface AdminWorkspaceView {
  workspace: AdminWorkspace
  viewer: AdminWorkspaceViewer
  clients: WorkspaceClient[]
}

export interface AdminWorkspaceViewer {
  workspace_id: string
  email: string
  full_name: string | null
  role: 'owner'
}

interface AdminWorkspaceOwnerCandidate {
  workspace_id: string
  email_normalized?: string
  full_name?: string | null
  role: 'owner'
  status: 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
  provisioning_method: 'platform_bootstrap' | 'email_invite' | 'admin_temporary_password'
  password_change_required: boolean
}

function isAvailableOwner(owner: AdminWorkspaceOwnerCandidate): boolean {
  return owner.status === 'active'
    || (
      owner.status === 'invited'
      && owner.provisioning_method === 'admin_temporary_password'
      && owner.password_change_required
    )
}

const WORKSPACE_CLIENT_COLUMNS = [
  'id',
  'workspace_id',
  'name',
  'email',
  'contact_person',
  'linkedin_url',
  'website',
  'status',
  'notes',
  'ai_sdr_profile',
  'ai_sdr_profile_updated_at',
  'created_at',
  'updated_at',
].join(',')

export async function listAdminWorkspaces(): Promise<AdminWorkspace[]> {
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default,logo_path,logo_updated_at')
    .eq('is_default', false)
    .eq('status', 'active')
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  if (workspaceError) throw new Error('Client workspaces could not be loaded.')

  const workspaces = (workspaceData || []) as AdminWorkspace[]
  if (workspaces.length === 0) return []

  const { data: membershipData, error: membershipError } = await supabase
    .from('workspace_memberships')
    .select('workspace_id,status,provisioning_method,password_change_required')
    .in('workspace_id', workspaces.map((workspace) => workspace.id))
    .eq('role', 'owner')
    .in('status', ['active', 'invited'])

  if (membershipError) throw new Error('Client workspaces could not be loaded.')

  const availableWorkspaceIds = new Set(
    ((membershipData || []) as AdminWorkspaceOwnerCandidate[])
      .filter(isAvailableOwner)
      .map((membership) => membership.workspace_id),
  )
  return workspaces.filter((workspace) => availableWorkspaceIds.has(workspace.id))
}

/**
 * Workspaces a platform admin can credit.
 *
 * Deliberately not listAdminWorkspaces: that list answers "whose owner can I
 * act on", so it drops a workspace whose owner has been invited but has not
 * accepted yet. A credit grant lands on the workspace ledger and stays there
 * through a change of ownership, so an unaccepted invite is no reason to
 * refuse one — it only means there is no name to show next to the balance.
 */
export async function listGrantableWorkspaces(): Promise<AdminWorkspace[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default,logo_path,logo_updated_at')
    .eq('is_default', false)
    .eq('status', 'active')
    .order('name', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw new Error('Client workspaces could not be loaded.')
  return (data || []) as AdminWorkspace[]
}

export async function listPodcastResearchWorkspaces(): Promise<AdminWorkspace[]> {
  const [clientWorkspaces, defaultWorkspaceResult] = await Promise.all([
    listAdminWorkspaces(),
    supabase
      .from('workspaces')
      .select('id,name,slug,status,is_default,logo_path,logo_updated_at')
      .eq('is_default', true)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (defaultWorkspaceResult.error) {
    throw new Error('Your workspace could not be loaded.')
  }

  const defaultWorkspace = defaultWorkspaceResult.data as AdminWorkspace | null
  return defaultWorkspace ? [defaultWorkspace, ...clientWorkspaces] : clientWorkspaces
}

export async function getAdminWorkspaceView(workspaceId: string, signal?: AbortSignal): Promise<AdminWorkspaceView> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  let workspaceQuery = supabase
    .from('workspaces')
    .select('id,name,slug,status,is_default,logo_path,logo_updated_at')
    .eq('id', canonicalWorkspaceId)
    .eq('is_default', false)
  if (signal) workspaceQuery = workspaceQuery.abortSignal(signal)
  const { data: workspaceData, error: workspaceError } = await workspaceQuery.maybeSingle()

  if (workspaceError) throw new Error('The client workspace could not be loaded.')
  if (!workspaceData || workspaceData.status !== 'active') {
    throw new Error('This client workspace is unavailable or no longer active.')
  }
  if (workspaceData.id !== canonicalWorkspaceId || workspaceData.is_default) {
    throw new Error('The selected workspace response did not match the workspace address.')
  }

  let viewerQuery = supabase
    .from('workspace_memberships')
    .select('workspace_id,email_normalized,full_name,role,status,provisioning_method,password_change_required')
    .eq('workspace_id', canonicalWorkspaceId)
    .eq('role', 'owner')
    .in('status', ['active', 'invited'])
    .order('id', { ascending: true })
  if (signal) viewerQuery = viewerQuery.abortSignal(signal)
  const { data: viewerData, error: viewerError } = await viewerQuery

  if (viewerError) throw new Error('The workspace owner could not be loaded.')
  const availableOwners = ((viewerData || []) as AdminWorkspaceOwnerCandidate[])
    .filter(isAvailableOwner)
  const viewer = availableOwners.length === 1 ? availableOwners[0] : null
  if (
    !viewer
    || viewer.workspace_id !== canonicalWorkspaceId
    || viewer.role !== 'owner'
    || !isAvailableOwner(viewer)
    || !viewer.email_normalized
  ) {
    throw new Error('This client workspace does not have an available owner.')
  }

  let clientsQuery = supabase
    .from('clients')
    .select(WORKSPACE_CLIENT_COLUMNS)
    .eq('workspace_id', canonicalWorkspaceId)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
  if (signal) clientsQuery = clientsQuery.abortSignal(signal)
  const { data: clientsData, error: clientsError } = await clientsQuery

  if (clientsError) throw new Error('The workspace clients could not be loaded.')

  const clientRows = (clientsData || []) as unknown as Array<WorkspaceClient & { ai_sdr_profile: unknown }>
  if (clientRows.some((client) => (
    client.workspace_id !== canonicalWorkspaceId || !isClientSdrProfile(client.ai_sdr_profile)
  ))) {
    throw new Error('The selected workspace response did not match the workspace address.')
  }
  const clients = clientRows.map((client) => {
    const readiness = clientSdrProfileReadiness(client.ai_sdr_profile)
    const { ai_sdr_profile: _profile, ...summary } = client
    return {
      ...summary,
      ai_sdr_profile_ready: readiness.ready,
      ai_sdr_profile_completed_fields: readiness.completed_fields,
      ai_sdr_profile_total_fields: readiness.total_fields,
    }
  })

  return {
    workspace: workspaceData as AdminWorkspace,
    viewer: {
      workspace_id: viewer.workspace_id,
      email: viewer.email_normalized,
      full_name: viewer.full_name ?? null,
      role: viewer.role,
    },
    clients,
  }
}
