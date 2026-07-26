import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const checkout = readFileSync('supabase/functions/workspace-credit-checkout/index.ts', 'utf8')
// Manager-gated, fixed server-side packs, credits granted only by the webhook.
assert.match(checkout, /requireAuthenticatedUser\(req\)/u)
assert.match(checkout, /requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(checkout, /MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(checkout, /CREDIT_PACKS = \{[\s\S]*?starter: \{ credits: 50, amount_cents: 4_900/u)
assert.doesNotMatch(checkout, /grant_workspace_credits/u)
assert.doesNotMatch(checkout, /body\.(?:amount|credits|price)/u)
assert.match(checkout, /'metadata\[workspace_id\]': workspaceId/u)

const webhook = readFileSync('supabase/functions/stripe-credit-webhook/index.ts', 'utf8')
// Signature-verified with replay tolerance; idempotent grant keyed on event id.
assert.match(webhook, /STRIPE_CREDIT_WEBHOOK_SECRET/u)
assert.match(webhook, /SIGNATURE_TOLERANCE_SECONDS = 5 \* 60/u)
assert.match(webhook, /timingSafeEqual\(expected, signature\)/u)
assert.match(webhook, /if \(!verified\) return json\(400/u)
assert.match(webhook, /checkout\.session\.completed/u)
assert.match(webhook, /paymentStatus !== 'paid'/u)
assert.match(webhook, /p_source: 'purchase'/u)
assert.match(webhook, /p_idempotency_key: `stripe:\$\{event\.id/u)

const config = readFileSync('supabase/config.toml', 'utf8')
assert.match(config, /\[functions\.workspace-credit-checkout\]\nverify_jwt = true/u)
assert.match(config, /\[functions\.stripe-credit-webhook\]\nverify_jwt = false/u)

process.stdout.write('Credit checkout edge contract checks passed\n')
