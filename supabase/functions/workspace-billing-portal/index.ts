// Plan management for a workspace that manages its own billing: a Stripe-hosted
// Customer Portal session for one that already subscribes, and a subscription
// Checkout Session for one that does not.
//
// This function never writes plan_key, billing_status, or stripe_subscription_id.
// Stripe is the authority on what a workspace is subscribed to, and the signed
// webhook (workspace-subscription-webhook) is the only thing that records it —
// the same split the credit packs already use. A success redirect here proves
// the customer finished a form, not that Stripe charged them.

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

// Prices are Stripe catalog objects rather than inline price_data, because the
// Customer Portal can only offer a switch between prices it can name. A plan
// with no configured price cannot be subscribed to, and says so rather than
// opening a checkout that Stripe will reject.
const PLAN_PRICE_ENV: Record<string, string> = {
  founding_member: 'STRIPE_PRICE_FOUNDING_MEMBER',
  standard: 'STRIPE_PRICE_STANDARD',
}

function appUrl(): string {
  return (Deno.env.get('APP_URL') || 'https://getonapod.com').replace(/\/+$/u, '')
}

async function stripePost(
  path: string,
  params: URLSearchParams,
  key: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(503, 'STRIPE_UNAVAILABLE', 'The payment provider is unreachable right now')
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok || !payload) {
    throw new HttpError(502, 'STRIPE_REJECTED', 'The payment provider rejected the request')
  }
  return payload
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
    if (!stripeKey) {
      throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Plan management is not configured')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    if (action !== 'portal-create' && action !== 'subscription-create') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown billing portal action')
    }
    if (action === 'portal-create') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
    } else {
      requireOnlyKeys(body, ['action', 'workspace_id', 'plan_key'])
    }
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')

    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'CREDENTIAL_STALE', 'Sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    if (!MANAGER_ROLES.has(access.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Workspace manager access is required')
    }

    const admin = createAdminClient()
    const { data: profile, error: profileError } = await admin
      .from('workspace_billing_profiles')
      .select('stripe_customer_id, stripe_subscription_id, plan_key')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (profileError) {
      throw new HttpError(503, 'BILLING_UNAVAILABLE', 'Billing data could not be read')
    }

    // A customer is created once and reused. Without this the portal would open
    // on an empty customer each time and show none of the workspace's history.
    let customerId = typeof profile?.stripe_customer_id === 'string' && profile.stripe_customer_id
      ? profile.stripe_customer_id
      : ''
    if (!customerId) {
      const customerParams = new URLSearchParams({
        'metadata[workspace_id]': workspaceId,
      })
      if (typeof authContext.user.email === 'string' && authContext.user.email.includes('@')) {
        customerParams.set('email', authContext.user.email)
      }
      const customer = await stripePost('customers', customerParams, stripeKey)
      customerId = typeof customer.id === 'string' ? customer.id : ''
      if (!customerId) {
        throw new HttpError(502, 'STRIPE_REJECTED', 'The payment provider rejected the request')
      }
      // Recording the id is not the same as recording a subscription: it only
      // says which Stripe customer this workspace is, so the next portal
      // session opens on the same history.
      const { error: writeError } = await admin
        .from('workspace_billing_profiles')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
      if (writeError) {
        throw new HttpError(503, 'BILLING_UNAVAILABLE', 'The billing customer could not be recorded')
      }
    }

    const billingBase = `${appUrl()}/app/settings/billing`

    if (action === 'portal-create') {
      const session = await stripePost(
        'billing_portal/sessions',
        new URLSearchParams({ customer: customerId, return_url: billingBase }),
        stripeKey,
      )
      const url = typeof session.url === 'string' ? session.url : ''
      if (!url) throw new HttpError(502, 'STRIPE_REJECTED', 'The payment provider rejected the request')
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'billing_portal_opened',
        entityType: 'workspace_billing_profile',
        entityId: workspaceId,
        metadata: { customer_id: customerId },
      })
      return jsonResponse(req, METHODS, 200, { success: true, url })
    }

    const planKey = requireString(body.plan_key, 'plan_key', { max: 40 })
    const priceEnv = PLAN_PRICE_ENV[planKey]
    if (!priceEnv) {
      throw new HttpError(400, 'INVALID_FIELD', 'plan_key must be founding_member or standard')
    }
    const priceId = Deno.env.get(priceEnv)?.trim()
    if (!priceId) {
      throw new HttpError(500, 'PLAN_NOT_CONFIGURED', 'That plan has no price configured in Stripe')
    }

    const session = await stripePost('checkout/sessions', new URLSearchParams({
      mode: 'subscription',
      customer: customerId,
      // Stripe collects and validates the code on its own page.
      allow_promotion_codes: 'true',
      success_url: `${billingBase}?plan=updated`,
      cancel_url: `${billingBase}?plan=cancelled`,
      client_reference_id: workspaceId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'metadata[workspace_id]': workspaceId,
      'metadata[plan_key]': planKey,
      'subscription_data[metadata][workspace_id]': workspaceId,
      'subscription_data[metadata][plan_key]': planKey,
    }), stripeKey)
    const url = typeof session.url === 'string' ? session.url : ''
    if (!url) throw new HttpError(502, 'STRIPE_REJECTED', 'The payment provider rejected the request')

    await writeAudit(admin, {
      workspaceId,
      actorUserId: authContext.user.id,
      action: 'billing_subscription_checkout_opened',
      entityType: 'workspace_billing_profile',
      entityId: workspaceId,
      metadata: { customer_id: customerId, plan_key: planKey },
    })
    return jsonResponse(req, METHODS, 200, { success: true, url })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
