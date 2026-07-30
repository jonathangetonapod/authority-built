import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const portal = readFileSync('supabase/functions/workspace-billing-portal/index.ts', 'utf8')

// Manager-gated on the workspace being billed, with a fresh credential.
assert.match(portal, /requireAuthenticatedUser\(req\)/u)
assert.match(portal, /workspaceCredentialIsFresh\(authContext\)/u)
assert.match(portal, /requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(portal, /MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(portal, /requireOnlyKeys\(body, \['action', 'workspace_id'\]\)/u)

// Opening a Stripe page is not evidence of a subscription — a success redirect
// is a URL anyone can visit. Only the signed webhook may record plan state, so
// the sole column this function writes is which Stripe customer it is talking
// to. Asserted on the update payloads themselves, because reading plan_key and
// naming it in an audit entry are both fine.
const portalUpdates = [...portal.matchAll(/\.update\(\{([^}]*)\}\)/gu)].map((match) => match[1])
assert.equal(portalUpdates.length, 1, 'the portal writes exactly one update')
assert.match(portalUpdates[0], /stripe_customer_id: customerId/u)
for (const payload of portalUpdates) {
  assert.doesNotMatch(payload, /plan_key/u)
  assert.doesNotMatch(payload, /billing_status/u)
  assert.doesNotMatch(payload, /stripe_subscription_id/u)
}

// Prices come from configuration, never from the caller: a client-supplied
// price would let a workspace subscribe itself to any amount it liked.
assert.doesNotMatch(portal, /body\.(?:price|amount|price_id)/u)
assert.match(portal, /PLAN_PRICE_ENV\[planKey\]/u)
assert.match(portal, /allow_promotion_codes: 'true'/u)

const webhook = readFileSync('supabase/functions/workspace-subscription-webhook/index.ts', 'utf8')

// Signature-verified before anything is read out of the body.
assert.match(webhook, /verifyStripeSignature\(payload, req\.headers\.get\('stripe-signature'\), secret\)/u)
assert.match(webhook, /STRIPE_SUBSCRIPTION_WEBHOOK_SECRET/u)
assert.match(webhook, /if \(!verified\) return json\(400/u)
assert.match(webhook, /customer\.subscription\.created/u)
assert.match(webhook, /customer\.subscription\.updated/u)
assert.match(webhook, /customer\.subscription\.deleted/u)
// The plan is read from the subscribed price, so a switch made inside the
// Customer Portal — carrying none of our metadata — is still recorded.
assert.match(webhook, /planKeyForPrice\(priceId\)/u)

const config = readFileSync('supabase/config.toml', 'utf8')
assert.match(config, /\[functions\.workspace-billing-portal\]\nverify_jwt = true/u)
assert.match(config, /\[functions\.workspace-subscription-webhook\]\nverify_jwt = false/u)

// Both halves must name the same plans, or a price that can be subscribed to
// would come back from Stripe as a plan the webhook cannot record.
const planKeys = (source) => [...source.matchAll(/^\s{2}(\w+): 'STRIPE_PRICE_\w+',$/gmu)].map((m) => m[1])
assert.deepEqual(planKeys(portal), planKeys(webhook))
assert.ok(planKeys(portal).length >= 2, 'at least two plans must be configurable')

console.log('Billing portal edge contract checks passed')
