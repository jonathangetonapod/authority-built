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
const portalUpdates = [...portal.matchAll(/\.update\(\{([^}]*)\}\)/gsu)].map((match) => match[1])
assert.ok(
  portalUpdates.some((payload) => /stripe_customer_id: customerId/u.test(payload)),
  'the portal records which Stripe customer a workspace is',
)
// Plan pricing is a different table. What no update here may ever touch is what
// a workspace is subscribed to — that belongs to the webhook alone.
for (const payload of portalUpdates) {
  assert.doesNotMatch(payload, /^\s*plan_key:/mu)
  assert.doesNotMatch(payload, /billing_status/u)
  assert.doesNotMatch(payload, /stripe_subscription_id/u)
}

// Prices come from the billing_plans table, never from the caller: a
// client-supplied price would let a workspace subscribe itself to any amount
// it liked. A plan that is not purchasable cannot be checked out either.
// An admin may set an amount — the server turns it into a Price. Nobody may
// hand over a price id, which would point a plan at an arbitrary Stripe object.
assert.doesNotMatch(portal, /body\.(?:price|price_id|stripe_price_id)\b/u)
assert.match(portal, /from\('billing_plans'\)/u)
assert.match(portal, /plan\.stripe_price_id/u)
assert.match(portal, /!plan\.is_purchasable/u)
assert.match(portal, /allow_promotion_codes: 'true'/u)

// Plan administration sets what a plan costs for everyone, so it is gated on
// platform admin rather than on membership of any one workspace.
assert.match(portal, /const authContext = await requirePlatformAdmin\(req\)/u)
assert.match(portal, /action === 'plans-list' \|\| action === 'plans-update'/u)
// The amount is the only thing a caller may set. A caller-supplied price id
// would let an admin screen point a plan at any Stripe object at all.
assert.match(portal, /requireOnlyKeys\(body, \['action', 'plan_key', 'base_price_cents', 'monthly_credit_allowance'\]\)/u)
assert.doesNotMatch(portal, /body\.stripe_price_id/u)
// Stripe Prices are immutable, so a change creates one; and creating one does
// not put it in the portal, so the configuration is repointed in the same call.
assert.match(portal, /stripePost\('prices'/u)
assert.match(portal, /syncPortalConfiguration\(updated, stripeKey\)/u)
// Saving an unchanged price must still reach the sync. The sync runs after the
// price is recorded, so one that failed there leaves a plan priced but not
// offered, and an early return would make every retry a no-op — permanently.
const syncAt = portal.indexOf('await syncPortalConfiguration(updated, stripeKey)')
const unchangedReturnAt = portal.indexOf('if (alreadyPriced) {')
assert.ok(syncAt > 0, 'the portal configuration is repointed after a price change')
assert.ok(unchangedReturnAt > syncAt, 'the unchanged path must sync before it returns')
assert.match(portal, /billing_portal\/configurations\?is_default=true/u)
// The recorded amount and the Price it describes are written together.
assert.match(portal, /base_price_cents: amount,\n\s+stripe_price_id: priceId,/u)
assert.match(portal, /monthly_credit_allowance/u)
assert.match(portal, /action: 'billing_plan_price_changed'/u)

const webhook = readFileSync('supabase/functions/workspace-subscription-webhook/index.ts', 'utf8')

// A plan carries what it gives, not only what it costs. Applied with the plan,
// or a workspace that downgraded keeps the dearer allowance and goes on
// spending it — credits are granted from that column.
assert.match(webhook, /update\.monthly_credit_allowance = plan\.monthly_credit_allowance/u)
// A portal cancellation lands as an update with the subscription still active,
// so the status alone cannot show that a plan is on its way out.
assert.match(webhook, /update\.cancel_at_period_end/u)
assert.match(webhook, /update\.current_period_end/u)

// Signature-verified before anything is read out of the body.
assert.match(webhook, /verifyStripeSignature\(payload, req\.headers\.get\('stripe-signature'\), secret\)/u)
assert.match(webhook, /STRIPE_SUBSCRIPTION_WEBHOOK_SECRET/u)
assert.match(webhook, /if \(!verified\) return json\(400/u)
assert.match(webhook, /customer\.subscription\.created/u)
assert.match(webhook, /customer\.subscription\.updated/u)
assert.match(webhook, /customer\.subscription\.deleted/u)
// The plan is read from the subscribed price, so a switch made inside the
// Customer Portal — carrying none of our metadata — is still recorded. Both
// halves resolve it through billing_plans, so a price the admin screen creates
// is understood by the webhook without a redeploy.
assert.match(webhook, /from\('billing_plans'\)/u)
assert.match(webhook, /byPrice\.get\(priceId\)/u)
// A price nobody can name must not become a guessed plan.
assert.match(webhook, /No plan configured for the subscribed price/u)

const config = readFileSync('supabase/config.toml', 'utf8')
assert.match(config, /\[functions\.workspace-billing-portal\]\nverify_jwt = true/u)
assert.match(config, /\[functions\.workspace-subscription-webhook\]\nverify_jwt = false/u)

// Price ids must not drift back into the environment: an env var cannot be
// edited from the admin screen, which is the whole reason they live in a table.
for (const [name, source] of [['portal', portal], ['webhook', webhook]]) {
  assert.doesNotMatch(source, /STRIPE_PRICE_/u, `${name} must not read price ids from the environment`)
}

const migration = readFileSync('supabase/migrations/20260730000100_billing_plans.sql', 'utf8')
// Writes go through the platform-admin edge action on the service role, so the
// table carries a select policy and nothing else.
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)
assert.match(migration, /FOR SELECT\n\s+TO authenticated/u)
assert.doesNotMatch(migration, /FOR (?:INSERT|UPDATE|DELETE|ALL)/u)
// One plan per Stripe Price: sharing one would make repointing a plan silently
// repoint another.
assert.match(migration, /CREATE UNIQUE INDEX.*billing_plans_stripe_price_id_key/su)

console.log('Billing portal edge contract checks passed')
