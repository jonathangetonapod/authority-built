import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

/**
 * Closing a workspace, and undoing it while there is still time.
 *
 * Deleting is staged: access ends immediately and the data is removed once the
 * recovery window closes. The function settles Stripe, Instantly and the domain
 * providers before anything is marked, so a failure there leaves the workspace
 * intact rather than half-closed — which is why the errors it returns are worth
 * showing verbatim instead of collapsing into "something went wrong".
 */
export interface DeletedWorkspace {
  id: string
  name: string
  slug: string
  status: string
  deleted_at: string | null
  purge_after: string | null
}

interface WorkspaceDeletionResponse {
  workspace?: DeletedWorkspace
  already_deleted?: boolean
  campaigns_paused?: number
  stranded_domains?: string[]
}

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke<WorkspaceDeletionResponse>(
    'workspace-deletion',
    { body },
  )
  if (error) throw await toFunctionError(error, 'The workspace could not be closed.')
  return data || {}
}

export async function deleteWorkspace(
  workspaceId: string,
  reason?: string,
): Promise<WorkspaceDeletionResponse> {
  return await invoke({
    action: 'delete',
    workspace_id: workspaceId.toLowerCase(),
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  })
}

/**
 * Platform admins only, and not as a matter of trust: deleting revokes the
 * owner's access in the same statement, so by the time they want it back they
 * cannot sign in to ask for it.
 */
export async function restoreWorkspace(workspaceId: string): Promise<WorkspaceDeletionResponse> {
  return await invoke({ action: 'restore', workspace_id: workspaceId.toLowerCase() })
}
