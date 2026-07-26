// Credit metering runtime. Cost logging is always on; credit charging is
// gated by CREDIT_ENFORCEMENT_ENABLED so the ledger can be dry-run against
// real traffic before any workspace is actually charged. Operations executed
// with a workspace-owned (BYO) provider key are never charged.

import { createAdminClient, HttpError } from './workspaceAuth.ts'

export type MeteredOperation =
  | 'research_run'
  | 'email_unlock_identify'
  | 'email_unlock_find'
  | 'email_unlock_verify'
  | 'dashboard_build'
  | 'query_generation'
  | 'compatibility_scoring'
  | 'podscan_lookup'
  | 'semantic_search'
  | 'pitch_profile'
  | 'mailbox_domain_purchase'
  | 'mailbox_monthly'
  | 'other'

export interface TokenUsage {
  anthropicInputTokens?: number
  anthropicOutputTokens?: number
  openaiTokens?: number
  podscanCalls?: number
}

// Rough USD per unit for margin analytics; repriced here without ceremony
// because the numbers are estimates, not invoices.
const USD_PER_ANTHROPIC_INPUT_TOKEN = 0.000003
const USD_PER_ANTHROPIC_OUTPUT_TOKEN = 0.000015
const USD_PER_OPENAI_TOKEN = 0.00000002
const USD_PER_PODSCAN_CALL = 0.002

export function enforcementEnabled(): boolean {
  return Deno.env.get('CREDIT_ENFORCEMENT_ENABLED')?.trim() === 'true'
}

export function estimatedCostUsd(usage: TokenUsage): number {
  const total = (usage.anthropicInputTokens ?? 0) * USD_PER_ANTHROPIC_INPUT_TOKEN
    + (usage.anthropicOutputTokens ?? 0) * USD_PER_ANTHROPIC_OUTPUT_TOKEN
    + (usage.openaiTokens ?? 0) * USD_PER_OPENAI_TOKEN
    + (usage.podscanCalls ?? 0) * USD_PER_PODSCAN_CALL
  return Math.round(total * 1_000_000) / 1_000_000
}

async function ensureMonthlyAllowance(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
): Promise<void> {
  const { data: profile, error: profileError } = await admin
    .from('workspace_billing_profiles')
    .select('monthly_credit_allowance')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (profileError) {
    throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing is temporarily unavailable')
  }

  let allowance = profile?.monthly_credit_allowance
  if (profile === null) {
    const { error: insertError } = await admin
      .from('workspace_billing_profiles')
      .upsert({ workspace_id: workspaceId }, { onConflict: 'workspace_id', ignoreDuplicates: true })
    if (insertError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing is temporarily unavailable')
    }
    allowance = 25
  }
  if (typeof allowance !== 'number' || allowance < 1) return

  const period = new Date().toISOString().slice(0, 7)
  const endOfNextMonth = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth() + 2,
    1,
  )).toISOString()
  const { error: grantError } = await admin.rpc('grant_workspace_credits_v1', {
    p_workspace_id: workspaceId,
    p_source: 'monthly_allowance',
    p_amount: allowance,
    p_expires_at: endOfNextMonth,
    p_reference_kind: 'allowance_period',
    p_reference_id: period,
    p_idempotency_key: `allowance:${workspaceId}:${period}`,
  })
  if (grantError) {
    throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing is temporarily unavailable')
  }
}

// Charge BEFORE the provider call so an empty balance never gets a free ride.
// Throws HttpError(402, 'INSUFFICIENT_CREDITS') when the balance cannot cover
// the operation. Returns the charged amount (0 when enforcement is off or the
// operation ran on a workspace-owned key).
export async function chargeCredits(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    workspaceId: string
    operationType: MeteredOperation
    referenceKind?: string
    referenceId?: string
    clientId?: string | null
    actorUserId?: string | null
    idempotencyKey?: string
    byoKeyUsed?: boolean
  },
): Promise<number> {
  if (!enforcementEnabled() || input.byoKeyUsed) return 0

  await ensureMonthlyAllowance(admin, input.workspaceId)

  const { data, error } = await admin.rpc('spend_workspace_credits_v1', {
    p_workspace_id: input.workspaceId,
    p_operation_type: input.operationType,
    p_reference_kind: input.referenceKind ?? null,
    p_reference_id: input.referenceId ?? null,
    p_client_id: input.clientId ?? null,
    p_actor_user_id: input.actorUserId ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  })
  if (error) {
    if ((error.message ?? '').includes('INSUFFICIENT_CREDITS')) {
      throw new HttpError(402, 'INSUFFICIENT_CREDITS', 'Not enough credits for this operation. Top up in workspace billing.')
    }
    throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing is temporarily unavailable')
  }
  const charged = (data as { charged?: number } | null)?.charged
  return typeof charged === 'number' ? charged : 0
}

// Cost logging never fails the underlying operation.
export async function logOperationCost(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    workspaceId: string
    operationType: MeteredOperation
    usage: TokenUsage
    usedByoKey?: boolean
    clientId?: string | null
    referenceKind?: string
    referenceId?: string
  },
): Promise<void> {
  try {
    const { error } = await admin.from('workspace_operation_costs').insert({
      workspace_id: input.workspaceId,
      client_id: input.clientId ?? null,
      operation_type: input.operationType,
      anthropic_input_tokens: Math.max(0, Math.round(input.usage.anthropicInputTokens ?? 0)),
      anthropic_output_tokens: Math.max(0, Math.round(input.usage.anthropicOutputTokens ?? 0)),
      openai_tokens: Math.max(0, Math.round(input.usage.openaiTokens ?? 0)),
      podscan_calls: Math.max(0, Math.round(input.usage.podscanCalls ?? 0)),
      estimated_cost_usd: estimatedCostUsd(input.usage),
      used_byo_key: input.usedByoKey === true,
      reference_kind: input.referenceKind?.slice(0, 60) ?? null,
      reference_id: input.referenceId?.slice(0, 120) ?? null,
    })
    if (error) console.error('[Billing] Operation cost logging failed')
  } catch (_error) {
    console.error('[Billing] Operation cost logging failed')
  }
}
