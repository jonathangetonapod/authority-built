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

// Mirrors PLAN_PRICE_ENV in workspace-billing-portal. A plan switched inside the
// Customer Portal arrives with no metadata of ours, so the price is the only
// thing naming the plan.
const PLAN_PRICE_ENV: Record<string, string> = {
  founding_member: 'STRIPE_PRICE_FOUNDING_MEMBER',
  standard: 'STRIPE_PRICE_STANDARD',
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

function planKeyForPrice(priceId: string): string | null {
  for (const [planKey, envName] of Object.entries(PLAN_PRICE_ENV)) {
    const configured = Deno.env.get(envName)?.trim()
    if (configured && configured === priceId) return planKey
  }
  return null
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const secret = Deno.env.get('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET')?.trim()
  if (!secret) return json(500, { error: 'SERVER_MISCONFIGURED' })

  const payload = await req.text()
  if (payload.length > 500_000) return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  const verified = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)
  if (!verified) return json(400, { error: 'INVALID_SIGNATURE' })

  let event: {
    id?: string
    type?: string
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
    return json(200, { received: true, ignored: `status ${stripeStatus || 'unknown'}` })
  }

  const update: Record<string, unknown> = {
    billing_status: billingStatus,
    updated_at: new Date().toISOString(),
  }

  if (deleted) {
    update.stripe_subscription_id = null
  } else {
    update.stripe_subscription_id = typeof subscription.id === 'string' ? subscription.id : null

    // The price is read from the subscription rather than from our metadata, so
    // a switch made inside the Customer Portal — where nothing of ours is
    // attached — still records the plan the customer actually moved to.
    const items = subscription.items as { data?: Array<Record<string, unknown>> } | undefined
    const firstItem = items?.data?.[0]
    const price = firstItem?.price as Record<string, unknown> | undefined
    const priceId = typeof price?.id === 'string' ? price.id : ''
    const planKey = priceId ? planKeyForPrice(priceId) : null
    if (planKey) {
      update.plan_key = planKey
    } else if (typeof metadata.plan_key === 'string' && PLAN_PRICE_ENV[metadata.plan_key]) {
      update.plan_key = metadata.plan_key
    } else if (priceId) {
      // Leaving plan_key alone is deliberate: naming the wrong plan is worse
      // than showing a stale one, and the price is recoverable from Stripe.
      console.error('[Workspace Subscription Webhook] No plan configured for the subscribed price')
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('workspace_billing_profiles')
    .update(update)
    .eq('workspace_id', workspaceId)
  if (error) {
    console.error('[Workspace Subscription Webhook] Billing profile update failed')
    // Non-200 makes Stripe retry. The update is idempotent — it sets state
    // rather than accumulating it — so a retry costs nothing.
    return json(500, { error: 'UPDATE_FAILED' })
  }

  return json(200, { received: true })
})
