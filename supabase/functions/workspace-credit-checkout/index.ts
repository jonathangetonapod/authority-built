// Credit pack checkout: creates a Stripe Checkout Session for a fixed pack.
// Packs are priced inline (price_data) so no Stripe catalog objects are
// required. Credits are granted only by the signed Stripe webhook
// (stripe-credit-webhook) — never by this function or the client.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])

// Re-exported so the contract that pins these prices, and any caller that
// already imports them from here, keeps working after the move.
export { CREDIT_PACKS } from '../_shared/creditPacks.ts'
import { CREDIT_PACKS } from '../_shared/creditPacks.ts'

type PackKey = keyof typeof CREDIT_PACKS

function appUrl(): string {
  const value = (Deno.env.get('APP_URL') || 'https://getonapod.com').replace(/\/+$/u, '')
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
    if (!stripeKey) {
      throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Credit purchases are not configured')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    if (action !== 'checkout-create') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown credit checkout action')
    }
    requireOnlyKeys(body, ['action', 'workspace_id', 'pack'])
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const packKey = requireString(body.pack, 'pack', { max: 20 }) as PackKey
    const pack = CREDIT_PACKS[packKey]
    if (!pack) throw new HttpError(400, 'INVALID_FIELD', 'pack must be starter, growth, or scale')

    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'CREDENTIAL_STALE', 'Sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    if (!MANAGER_ROLES.has(access.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Workspace manager access is required')
    }

    // The customer this workspace already has, or a new one recorded against
    // it. Without a customer the purchase is a guest payment: the card is not
    // kept, nothing links the payment to the workspace in Stripe, and an
    // automatic top-up later has nothing to charge.
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('workspace_billing_profiles')
      .select('stripe_customer_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    let customerId = typeof profile?.stripe_customer_id === 'string' && profile.stripe_customer_id
      ? profile.stripe_customer_id
      : ''
    if (!customerId) {
      const customerParams = new URLSearchParams({ 'metadata[workspace_id]': workspaceId })
      if (typeof authContext.user.email === 'string' && authContext.user.email.includes('@')) {
        customerParams.set('email', authContext.user.email)
      }
      const customerResponse = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: customerParams,
        signal: AbortSignal.timeout(20_000),
      })
      const customer = await customerResponse.json().catch(() => ({})) as { id?: unknown }
      if (customerResponse.ok && typeof customer.id === 'string') {
        customerId = customer.id
        await admin
          .from('workspace_billing_profiles')
          .upsert(
            { workspace_id: workspaceId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
            { onConflict: 'workspace_id' },
          )
      }
    }

    const billingBase = `${appUrl()}/app/settings/billing`
    const params = new URLSearchParams({
      mode: 'payment',
      // Stripe collects and validates the code on its own page, so a promotion
      // is created in the dashboard and needs nothing here. Credits are granted
      // from metadata[credits] rather than the amount paid, so a discount
      // changes the price without changing the size of the pack.
      allow_promotion_codes: 'true',
      success_url: `${billingBase}?checkout=success`,
      cancel_url: `${billingBase}?checkout=cancelled`,
      client_reference_id: workspaceId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(pack.amount_cents),
      'line_items[0][price_data][product_data][name]': pack.label,
      'metadata[workspace_id]': workspaceId,
      'metadata[pack]': packKey,
      'metadata[credits]': String(pack.credits),
      'payment_intent_data[metadata][workspace_id]': workspaceId,
    })
    if (customerId) {
      params.set('customer', customerId)
      // Consent to charging this card again without them present. Stripe shows
      // the customer that the card will be saved, and refuses an off-session
      // charge later against a card never saved this way — which is the whole
      // reason automatic top-ups could not work before.
      params.set('payment_intent_data[setup_future_usage]', 'off_session')
    } else if (typeof authContext.user.email === 'string' && authContext.user.email.includes('@')) {
      // No customer could be created, so this is a guest payment: it still buys
      // credits, it just cannot be charged again automatically.
      params.set('customer_email', authContext.user.email)
    }

    let response: Response
    try {
      response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (_error) {
      throw new HttpError(503, 'STRIPE_UNAVAILABLE', 'The payment provider is unreachable right now')
    }
    const payload = await response.json().catch(() => null) as
      | { id?: string; url?: string; error?: { message?: string } }
      | null
    if (!response.ok || !payload?.url || !payload.id) {
      console.error('[Credit Checkout] Stripe session creation failed', payload?.error?.message ?? response.status)
      throw new HttpError(502, 'CHECKOUT_FAILED', 'The checkout session could not be created')
    }

    await writeAudit(authContext.admin, {
      workspaceId,
      actorUserId: authContext.user.id,
      action: 'workspace.credits.checkout_started',
      entityType: 'billing',
      // entity_id is a UUID column, for ids of our own rows. A Stripe session
      // id is not one, so Postgres rejected the insert, writeAudit threw, and
      // the request failed with 500 — after the session had been created. The
      // audit is the last step, so nobody could buy credits at all. The id is
      // still recorded, in metadata, which is JSONB and takes it as it comes.
      entityId: workspaceId,
      metadata: {
        pack: packKey,
        credits: pack.credits,
        amount_cents: pack.amount_cents,
        stripe_session_id: payload.id,
      },
    })

    return jsonResponse(req, METHODS, 200, { url: payload.url, session_id: payload.id })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
