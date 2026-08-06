import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const checkout = readFileSync('supabase/functions/workspace-credit-checkout/index.ts', 'utf8')
// Manager-gated, fixed server-side packs, credits granted only by the webhook.
assert.match(checkout, /requireAuthenticatedUser\(req\)/u)
assert.match(checkout, /requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(checkout, /MANAGER_ROLES\.has\(access\.role\)/u)
// The prices moved to _shared so an automatic refill could read them without
// importing — and so executing — the checkout function.
const packs = readFileSync('supabase/functions/_shared/creditPacks.ts', 'utf8')
assert.match(packs, /export const CREDIT_PACKS = \{/u)
assert.match(checkout, /export \{ CREDIT_PACKS \} from '\.\.\/_shared\/creditPacks\.ts'/u)
assert.doesNotMatch(checkout, /grant_workspace_credits/u)
assert.doesNotMatch(checkout, /body\.(?:amount|credits|price)/u)
assert.match(checkout, /'metadata\[workspace_id\]': workspaceId/u)
// Promotion codes are entered and validated on Stripe's page. The pack size
// still comes from metadata, so a discount must never be able to change it.
assert.match(checkout, /allow_promotion_codes: 'true'/u)
assert.match(checkout, /'metadata\[credits\]': String\(pack\.credits\)/u)

// workspace_audit_log.entity_id is a UUID column. A Stripe session id is not a
// UUID, and passing it made the insert fail, which failed the whole request
// after the session had been created — checkout was unusable. The Stripe id
// belongs in metadata; entity_id gets something that is actually a UUID.
assert.match(checkout, /entityId: workspaceId,/u)
assert.doesNotMatch(checkout, /entityId: payload\.id/u)
assert.match(checkout, /stripe_session_id: payload\.id/u)

// The audit runs after Stripe has been called, so it must not be able to fail
// the request: the session exists either way, and a 500 here strands a customer
// who has already been sent through checkout. That is how this broke. writeAudit
// records without throwing; writeAuditOrRefuse is the pre-effect form and would
// reintroduce exactly the fault.
assert.match(checkout, /await writeAudit\(/u)
assert.doesNotMatch(checkout, /writeAuditOrRefuse/u)

const webhook = readFileSync('supabase/functions/stripe-credit-webhook/index.ts', 'utf8')
// Signature-verified with replay tolerance; idempotent grant keyed on event id.
assert.match(webhook, /STRIPE_CREDIT_WEBHOOK_SECRET/u)
assert.match(webhook, /SIGNATURE_TOLERANCE_SECONDS = 5 \* 60/u)
assert.match(webhook, /timingSafeEqual\(expected, signature\)/u)
assert.match(webhook, /if \(!verified\) return json\(400/u)
assert.match(webhook, /checkout\.session\.completed/u)
// Two events buy credits — a person completing a checkout session, and an
// automatic top-up charged off-session with nobody present. Each reports its
// success under a different field, so the paid value is read per event rather
// than assumed.
assert.match(webhook, /paymentStatus !== paidValue/u)
assert.match(webhook, /const AUTOMATIC = 'payment_intent\.succeeded'/u)
assert.match(webhook, /event\.type === AUTOMATIC[\s\S]{0,160}session\.status/u)
assert.match(webhook, /const paidValue = event\.type === AUTOMATIC \? 'succeeded' : 'paid'/u)
// Both grant through the same idempotent call: a second grant path could
// drift from this one, and credits would exist for money that never arrived.
assert.match(webhook, /p_reference_kind: event\.type === AUTOMATIC \? 'stripe_auto_refill' : 'stripe_checkout'/u)
assert.match(webhook, /p_source: 'purchase'/u)
// Auto-refills grant under the tick's own auto-refill:… key so the tick's
// daily pre-check and monthly cap can see past refills in the ledger; keyed on
// the Stripe event id they were invisible, the daily check was dead code, and
// the cap summed zero. Checkout purchases keep the event-id key, and event
// retries still deduplicate either way — redeliveries carry the same metadata.
assert.match(webhook, /event\.type === AUTOMATIC && typeof metadata\.refill_key === 'string' && metadata\.refill_key\.startsWith\('auto-refill:'\)\s*\n\s*\? metadata\.refill_key\s*\n\s*: `stripe:\$\{event\.id\}`/u)

const config = readFileSync('supabase/config.toml', 'utf8')
const billingPage = readFileSync('src/pages/app/WorkspaceBilling.tsx', 'utf8')
assert.match(config, /\[functions\.workspace-credit-checkout\]\nverify_jwt = true/u)
assert.match(config, /\[functions\.stripe-credit-webhook\]\nverify_jwt = false/u)

process.stdout.write('Credit checkout edge contract checks passed\n')

// The billing page must advertise exactly what the server charges. It once
// carried two pack lists — one wired to checkout at $0.98/credit, and a second,
// unwired card offering $0.39 with a button that only said billing "will be
// connected". A customer comparing them saw the cheaper one that did nothing.
const packSource = packs.match(/export const CREDIT_PACKS = \{[\s\S]*?\n\} as const/u)
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

// The purchase chain, end to end: a session is created here, the credits are
// granted by the webhook, and the page waits for that rather than assuming it.
const creditWebhook = readFileSync('supabase/functions/stripe-credit-webhook/index.ts', 'utf8')
const workspaceLayout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')

// Only a signed, completed session may grant credits, and only once.
assert.match(creditWebhook, /STRIPE_CREDIT_WEBHOOK_SECRET/u)
assert.match(creditWebhook, /event\.type !== 'checkout\.session\.completed'/u)
assert.match(creditWebhook, /grant_workspace_credits_v1/u)
assert.match(creditWebhook, /p_idempotency_key/u)

// Buying credits is reachable from the main navigation, not only from inside
// a settings sub-page.
assert.match(workspaceLayout, /id: 'billing', name: 'Billing & credits', segment: 'settings\/billing'/u)
assert.match(workspaceLayout, /item\.id !== 'billing'/u)

// A payment can succeed while the webhook never lands, which leaves a paid
// balance that never moves. Saying so beats letting somebody pay twice.
assert.match(billingPage, /setAwaitingCredits\(true\)/u)
assert.match(billingPage, /refetchInterval: awaitingCredits/u)
assert.match(billingPage, /the payment went through/u)
