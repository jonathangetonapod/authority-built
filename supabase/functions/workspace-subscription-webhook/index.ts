// Stripe webhook for plan subscriptions. Signature-verified, then subscription
// lifecycle events record what a workspace is actually subscribed to.
//
// This is the only thing that writes plan_key, billing_status, and
// stripe_subscription_id. workspace-billing-portal opens the Stripe pages and
// writes none of it, because finishing a form is not the same as being charged,
// and a plan can also change inside the portal without this app ever seeing it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient } from '../_shared/workspaceAuth.ts'
import { verifyStripeSignature } from '../_shared/stripeSignature.ts'

// The same billing_plans rows workspace-billing-portal sells from. A plan
// switched inside the Customer Portal arrives with no metadata of ours, so the
// Stripe Price is the only thing naming the plan, and this is the table that
// says which plan that Price belongs to.
interface PlanEconomics {
  plan_key: string
  monthly_credit_allowance: number
  base_price_cents: number
  per_client_price_cents: number
  included_active_clients: number
}

async function loadPlans(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ byPrice: Map<string, PlanEconomics>; byKey: Map<string, PlanEconomics> }> {
  const { data, error } = await admin
    .from('billing_plans')
    .select('plan_key, stripe_price_id, monthly_credit_allowance, base_price_cents, per_client_price_cents, included_active_clients')
  if (error) throw new Error('billing_plans could not be read')
  const byPrice = new Map<string, PlanEconomics>()
  const byKey = new Map<string, PlanEconomics>()
  for (const row of data ?? []) {
    const plan = row as PlanEconomics & { stripe_price_id: string | null }
    byKey.set(plan.plan_key, plan)
    if (plan.stripe_price_id) byPrice.set(plan.stripe_price_id, plan)
  }
  return { byPrice, byKey }
}

// Stripe's subscription statuses, narrowed to the ones billing_status allows.
const BILLING_STATUS: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  incomplete: 'past_due',
  incomplete_expired: 'suspended',
  canceled: 'suspended',
  paused: 'suspended',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const secret = Deno.env.get('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')?.trim()
  if (!secret) return json(500, { error: 'SERVER_MISCONFIGURED' })

  // Declared size first, so an oversized body is refused before it is read
  // into memory — this endpoint is reachable without any signature.
  const declaredLength = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > 500_000) {
    return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  }
  const payload = await req.text()
  if (payload.length > 500_000) return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  const verified = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)
  if (!verified) return json(400, { error: 'INVALID_SIGNATURE' })

  let event: {
    id?: string
    type?: string
    created?: number
    data?: { object?: Record<string, unknown> }
  }
  try {
    event = JSON.parse(payload)
  } catch (_error) {
    return json(400, { error: 'INVALID_PAYLOAD' })
  }

  const handled = new Set([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ])
  if (!event.type || !handled.has(event.type)) {
    return json(200, { received: true, ignored: event.type ?? 'unknown' })
  }

  const subscription = event.data?.object ?? {}
  const metadata = (subscription.metadata ?? {}) as Record<string, unknown>
  const workspaceId = typeof metadata.workspace_id === 'string' ? metadata.workspace_id : null
  if (!workspaceId) {
    console.error('[Workspace Subscription Webhook] Subscription missing workspace_id metadata')
    return json(200, { received: true, ignored: 'missing metadata' })
  }

  const stripeStatus = typeof subscription.status === 'string' ? subscription.status : ''
  const deleted = event.type === 'customer.subscription.deleted'
  const billingStatus = deleted ? 'suspended' : BILLING_STATUS[stripeStatus]
  if (!billingStatus) {
    // Every status Stripe documents today is mapped, so this is unreachable
    // until Stripe adds one — at which point the whole update is dropped, not
    // just the status, and nothing else would say so.
    console.error(`[Workspace Subscription Webhook] Unmapped subscription status: ${stripeStatus || 'unknown'}`)
    return json(200, { received: true, ignored: `status ${stripeStatus || 'unknown'}` })
  }

  // Stripe does not promise order. Without this an update delivered after the
  // deletion that followed it would put a cancelled workspace back on an active
  // plan, holding that plan's allowance.
  const eventAt = typeof event.created === 'number' && Number.isFinite(event.created)
    ? new Date(event.created * 1000).toISOString()
    : new Date().toISOString()

  const admin = createAdminClient()
  const update: Record<string, unknown> = {
    billing_status: billingStatus,
    last_subscription_event_at: eventAt,
    updated_at: new Date().toISOString(),
  }

  if (deleted) {
    update.stripe_subscription_id = null
    update.cancel_at_period_end = false
    update.current_period_end = null
  } else {
    update.stripe_subscription_id = typeof subscription.id === 'string' ? subscription.id : null

    // A portal cancellation takes effect at period end, and arrives as an
    // update with the subscription still active. Recorded, or a plan on its way
    // out is indistinguishable from one that is staying.
    update.cancel_at_period_end = subscription.cancel_at_period_end === true
    const periodEnd = typeof subscription.current_period_end === 'number'
      ? subscription.current_period_end
      : null
    update.current_period_end = periodEnd === null
      ? null
      : new Date(periodEnd * 1000).toISOString()

    // The price is read from the subscription rather than from our metadata, so
    // a switch made inside the Customer Portal — where nothing of ours is
    // attached — still records the plan the customer actually moved to.
    const items = subscription.items as { data?: Array<Record<string, unknown>> } | undefined
    const firstItem = items?.data?.[0]
    const price = firstItem?.price as Record<string, unknown> | undefined
    const priceId = typeof price?.id === 'string' ? price.id : ''
    let plans: Awaited<ReturnType<typeof loadPlans>>
    try {
      plans = await loadPlans(admin)
    } catch (_error) {
      console.error('[Workspace Subscription Webhook] billing_plans could not be read')
      return json(500, { error: 'PLANS_UNAVAILABLE' })
    }
    const plan = (priceId ? plans.byPrice.get(priceId) : undefined)
      ?? (typeof metadata.plan_key === 'string' ? plans.byKey.get(metadata.plan_key) : undefined)
    if (plan) {
      update.plan_key = plan.plan_key
      // What the plan gives, applied with the plan. Without this a workspace
      // moving to the cheaper plan kept the dearer allowance and went on
      // spending it, because credits are granted from this column.
      update.monthly_credit_allowance = plan.monthly_credit_allowance
      update.base_price_cents = plan.base_price_cents
      update.per_client_price_cents = plan.per_client_price_cents
      update.included_active_clients = plan.included_active_clients
    } else if (priceId) {
      // Leaving plan_key alone is deliberate: naming the wrong plan is worse
      // than showing a stale one, and the price is recoverable from Stripe.
      console.error('[Workspace Subscription Webhook] No plan configured for the subscribed price')
    }
  }

  // The comparison is part of the write, not a read before it: two deliveries
  // racing would both pass a separate check and the later-arriving one would
  // still win. Postgres settles it on the row.
  const { data, error } = await admin
    .from('workspace_billing_profiles')
    .update(update)
    .eq('workspace_id', workspaceId)
    .or(`last_subscription_event_at.is.null,last_subscription_event_at.lte.${eventAt}`)
    .select('workspace_id')
  if (error) {
    console.error('[Workspace Subscription Webhook] Billing profile update failed')
    // Non-200 makes Stripe retry. The update is idempotent — it sets state
    // rather than accumulating it — so a retry costs nothing.
    return json(500, { error: 'UPDATE_FAILED' })
  }
  if ((data ?? []).length === 0) {
    // Either the workspace has no profile row, or a newer event already landed.
    // Both are 200: retrying will not make an older event newer.
    return json(200, { received: true, ignored: 'stale or unknown workspace' })
  }

  return json(200, { received: true })
})
