import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type WorkspaceDomainStatus =
  | 'awaiting_dns'
  | 'provisioning'
  | 'active'
  | 'failed'
  | 'disabled'

export interface WorkspaceDomain {
  id: string
  workspace_id: string
  hostname: string
  status: WorkspaceDomainStatus
  is_primary: boolean
  /** What the agency creates at their DNS host. An apex domain gets an A record. */
  dns_record_type: string
  dns_record_name: string | null
  dns_record_value: string | null
  last_error: string | null
  activated_at: string | null
  created_at: string
  workspace: { id: string; name: string; slug: string } | null
}

async function invoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-domains', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

export async function listWorkspaceDomains(): Promise<WorkspaceDomain[]> {
  const data = await invoke<{ domains?: unknown }>(
    { action: 'list' },
    'Custom domains could not be loaded.',
  )
  return Array.isArray(data.domains) ? data.domains as WorkspaceDomain[] : []
}

export async function addWorkspaceDomain(
  workspaceId: string,
  hostname: string,
): Promise<WorkspaceDomain> {
  const data = await invoke<{ domain: WorkspaceDomain }>(
    { action: 'add', workspace_id: workspaceId, hostname },
    'The domain could not be added.',
  )
  return data.domain
}

/** Ask the provider whether DNS resolves and the certificate has issued. */
export async function refreshWorkspaceDomain(domainId: string): Promise<WorkspaceDomainStatus> {
  const data = await invoke<{ status: WorkspaceDomainStatus }>(
    { action: 'refresh', domain_id: domainId },
    'The domain status could not be checked.',
  )
  return data.status
}

/** The domain client-facing links are built from. Serving domains only. */
export async function setPrimaryWorkspaceDomain(domainId: string): Promise<void> {
  await invoke({ action: 'set_primary', domain_id: domainId }, 'The primary domain could not be set.')
}

export async function removeWorkspaceDomain(domainId: string): Promise<void> {
  await invoke({ action: 'remove', domain_id: domainId }, 'The domain could not be removed.')
}
