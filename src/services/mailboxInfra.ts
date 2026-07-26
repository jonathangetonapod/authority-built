import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export interface MailboxDomainSearchResult {
  domain: string
  available: boolean
  price_usd: number | null
}

export interface MailboxOrderInput {
  domain: string
  mailboxes: Array<{ name: string; username: string }>
}

export interface MailboxOrder {
  id: string
  status: 'processing' | 'provisioned' | 'warming' | 'failed'
  domains: MailboxOrderInput[]
  mailbox_count: number
  credits_charged: number
  warming_enabled_at?: string | null
  error_message?: string | null
  created_at: string
}

export interface InfraMailbox {
  full_address: string
  name: string | null
  status: string
  warming_status: string | null
  warming_health_score: number | null
  warming_inbox_rate: number | null
}

export interface InfraDomain {
  id: string
  name: string
  status: string
  dns_health: string | null
  expire_date: string | null
  mailboxes: InfraMailbox[]
}

async function invokeMailboxInfra<T>(body: Record<string, unknown>, message: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-mailbox-infra', { body })
  if (error) throw await toFunctionError(error, message)
  return data as T
}

export async function searchMailboxDomains(
  workspaceId: string,
  domains: string[],
): Promise<MailboxDomainSearchResult[]> {
  const data = await invokeMailboxInfra<{ results: MailboxDomainSearchResult[] }>({
    action: 'domain-search',
    workspace_id: workspaceId,
    domains,
  }, 'Domain availability could not be checked.')
  return data.results || []
}

export async function createMailboxOrder(
  workspaceId: string,
  orders: MailboxOrderInput[],
): Promise<MailboxOrder> {
  const data = await invokeMailboxInfra<{ order: MailboxOrder }>({
    action: 'order-create',
    workspace_id: workspaceId,
    orders,
  }, 'The mailbox order could not be placed.')
  return data.order
}

export async function getMailboxOrderStatus(
  workspaceId: string,
  orderId: string,
): Promise<{ order: MailboxOrder; progress: Record<string, unknown> | null }> {
  return await invokeMailboxInfra({
    action: 'order-status',
    workspace_id: workspaceId,
    order_id: orderId,
  }, 'The order status could not be loaded.')
}

export async function getMailboxInfraOverview(
  workspaceId: string,
): Promise<{ domains: InfraDomain[]; orders: MailboxOrder[] }> {
  return await invokeMailboxInfra({
    action: 'infra-overview',
    workspace_id: workspaceId,
  }, 'Sending infrastructure could not be loaded.')
}

export async function exportMailboxesForInstantly(
  workspaceId: string,
): Promise<{ download_url: string; user_count: number | null }> {
  return await invokeMailboxInfra({
    action: 'export-instantly',
    workspace_id: workspaceId,
  }, 'The Instantly export could not be generated.')
}
