import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const checkout = readFileSync('supabase/functions/workspace-credit-checkout/index.ts', 'utf8')
// Manager-gated, fixed server-side packs, credits granted only by the webhook.
assert.match(checkout, /requireAuthenticatedUser\(req\)/u)
assert.match(checkout, /requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(checkout, /MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(checkout, /export const CREDIT_PACKS = \{/u)
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
const billingPage = readFileSync('src/pages/app/WorkspaceBilling.tsx', 'utf8')
assert.match(config, /\[functions\.workspace-credit-checkout\]\nverify_jwt = true/u)
assert.match(config, /\[functions\.stripe-credit-webhook\]\nverify_jwt = false/u)

process.stdout.write('Credit checkout edge contract checks passed\n')

// The billing page must advertise exactly what the server charges. It once
// carried two pack lists — one wired to checkout at $0.98/credit, and a second,
// unwired card offering $0.39 with a button that only said billing "will be
// connected". A customer comparing them saw the cheaper one that did nothing.
const packSource = checkout.match(/export const CREDIT_PACKS = \{[\s\S]*?\n\} as const/u)
assert.ok(packSource, 'CREDIT_PACKS must be declared')
const serverPacks = [...packSource[0].matchAll(/(\w+): \{ credits: ([\d_]+), amount_cents: ([\d_]+)/gu)]
  .map(([, key, credits, cents]) => ({
    key,
    credits: Number(credits.replace(/_/gu, '')),
    price: Number(cents.replace(/_/gu, '')) / 100,
  }))
assert.equal(serverPacks.length, 3)
for (const pack of serverPacks) {
  assert.match(
    billingPage,
    new RegExp(`key: '${pack.key}' as const, credits: ${pack.credits}, price: ${pack.price}\\b`, 'u'),
    `the billing page must show ${pack.key} as ${pack.credits} credits for $${pack.price}`,
  )
}
// Buying more never costs more per credit than the plan's included rate, or a
// top-up is a penalty for needing one.
const PLAN_RATE = 29 / 100
let previousRate = Infinity
for (const pack of serverPacks) {
  const rate = pack.price / pack.credits
  assert.ok(rate <= PLAN_RATE + 1e-9, `${pack.key} costs more per credit than the plan`)
  assert.ok(rate <= previousRate + 1e-9, `${pack.key} must not cost more per credit than a smaller pack`)
  previousRate = rate
}
// And nothing may advertise a price the server cannot honour.
assert.doesNotMatch(billingPage, /Secure checkout will be connected/u)
assert.doesNotMatch(billingPage, /waterfallCreditPacks/u)
