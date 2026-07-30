#!/usr/bin/env node
// Creates the Stripe objects that plan management needs: a Product and a
// recurring Price per plan, and a Customer Portal configuration that lists both
// so the portal can offer a switch between them.
//
// Reads STRIPE_SECRET_KEY from the environment and never prints it. Run it
// yourself rather than handing the key to anyone:
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe-plans.mjs --standard-cents 9900
//
// Idempotent: prices are claimed by lookup_key, so a second run adopts what the
// first created instead of making a duplicate ladder.

const KEY = process.env.STRIPE_SECRET_KEY?.trim()
if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not set. Export it in your shell and re-run.')
  process.exit(1)
}

const LIVE = KEY.startsWith('sk_live_')
const args = process.argv.slice(2)
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

// 3900 is the schema default for base_price_cents. Standard has no default
// anywhere, so it must be stated rather than guessed.
const FOUNDING_CENTS = Number.parseInt(flag('founding-cents', '3900'), 10)
const STANDARD_CENTS = Number.parseInt(flag('standard-cents', ''), 10)
if (!Number.isInteger(STANDARD_CENTS) || STANDARD_CENTS <= 0) {
  console.error('Pass --standard-cents <amount>. There is no default price for the Standard plan.')
  process.exit(1)
}

if (LIVE && !args.includes('--confirm-live')) {
  console.error('This key is a LIVE key. Re-run with --confirm-live to create real billable prices.')
  process.exit(1)
}
console.log(`Mode: ${LIVE ? 'LIVE' : 'TEST'}`)

async function stripe(path, params, method = 'POST') {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : new URLSearchParams(params).toString(),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed: ${payload?.error?.message ?? response.status}`)
  }
  return payload
}

async function findPrice(lookupKey) {
  const response = await fetch(
    `https://api.stripe.com/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`,
    { headers: { Authorization: `Bearer ${KEY}` } },
  )
  const payload = await response.json()
  if (!response.ok) throw new Error(`Stripe prices lookup failed: ${payload?.error?.message}`)
  return payload.data?.[0] ?? null
}

async function ensurePlan(planKey, name, unitAmount) {
  const lookupKey = `goap_${planKey}_monthly`
  const existing = await findPrice(lookupKey)
  if (existing) {
    if (existing.unit_amount !== unitAmount) {
      console.log(
        `  ${planKey}: keeping existing price ${existing.id} at ${existing.unit_amount} cents `
        + `(asked for ${unitAmount}). Stripe prices are immutable — archive it and re-run to change.`,
      )
    } else {
      console.log(`  ${planKey}: reusing ${existing.id}`)
    }
    return existing.id
  }

  const product = await stripe('products', {
    name,
    'metadata[plan_key]': planKey,
  })
  const price = await stripe('prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: String(unitAmount),
    'recurring[interval]': 'month',
    lookup_key: lookupKey,
    'metadata[plan_key]': planKey,
  })
  console.log(`  ${planKey}: created ${price.id} (${unitAmount} cents/month)`)
  return price.id
}

console.log('\nPlans:')
const foundingPriceId = await ensurePlan('founding_member', 'Get On A Pod · Founding member', FOUNDING_CENTS)
const standardPriceId = await ensurePlan('standard', 'Get On A Pod · Standard', STANDARD_CENTS)

console.log('\nCustomer Portal configuration:')
const portalConfig = await stripe('billing_portal/configurations', {
  'business_profile[headline]': 'Manage your Get On A Pod plan',
  'features[subscription_update][enabled]': 'true',
  'features[subscription_update][default_allowed_updates][]': 'price',
  'features[subscription_update][proration_behavior]': 'create_prorations',
  'features[subscription_update][products][0][product]': (await stripe(`prices/${foundingPriceId}`, {}, 'GET')).product,
  'features[subscription_update][products][0][prices][]': foundingPriceId,
  'features[subscription_update][products][1][product]': (await stripe(`prices/${standardPriceId}`, {}, 'GET')).product,
  'features[subscription_update][products][1][prices][]': standardPriceId,
  'features[subscription_cancel][enabled]': 'true',
  'features[payment_method_update][enabled]': 'true',
  'features[invoice_history][enabled]': 'true',
  // Promotion codes are entered on Stripe's page, here and at checkout.
  'features[subscription_update][coupon_offer][enabled]': 'false',
})
console.log(`  created ${portalConfig.id}`)

console.log(`
Next, set these as Supabase edge secrets:

  npx supabase secrets set \\
    STRIPE_PRICE_FOUNDING_MEMBER=${foundingPriceId} \\
    STRIPE_PRICE_STANDARD=${standardPriceId}

Then add a webhook endpoint in the Stripe dashboard pointing at:

  <SUPABASE_URL>/functions/v1/workspace-subscription-webhook

subscribed to customer.subscription.created, .updated and .deleted, and set its
signing secret:

  npx supabase secrets set STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...

Note: per_client_price_cents is not part of this subscription. The plan bills a
flat monthly base at quantity 1; charging per additional active client would
need a second, quantity-driven subscription item and something to keep that
quantity in step with the workspace's client count.
`)
