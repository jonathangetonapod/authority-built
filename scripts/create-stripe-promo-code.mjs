#!/usr/bin/env node
// Creates a coupon and the promotion code customers type at checkout. Two
// Stripe objects: the coupon is the discount, the promotion code is the string
// that redeems it, and a coupon with no promotion code cannot be entered by
// anyone.
//
// Reads STRIPE_SECRET_KEY from the environment and never prints it:
//
//   STRIPE_SECRET_KEY=rk_live_... node scripts/create-stripe-promo-code.mjs \
//     --code INTERNALTEST --percent-off 100 --max-redemptions 3
//
// Checkout already accepts promotion codes — workspace-credit-checkout and
// workspace-billing-portal both send allow_promotion_codes, so a code made here
// works on credit packs and on plan subscriptions without any further change.

const KEY = process.env.STRIPE_SECRET_KEY?.trim()
if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not set. Export it in your shell and re-run.')
  process.exit(1)
}

const args = process.argv.slice(2)
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

// Stripe upper-cases codes and matches case-insensitively, so it is stored the
// way a customer will see it rather than the way it was typed here.
const CODE = (flag('code', '') || '').trim().toUpperCase()
if (!/^[A-Z0-9_-]{3,40}$/u.test(CODE)) {
  console.error('Pass --code with 3 to 40 characters: letters, digits, hyphen or underscore.')
  process.exit(1)
}

const PERCENT_OFF = Number.parseInt(flag('percent-off', '100'), 10)
if (!Number.isInteger(PERCENT_OFF) || PERCENT_OFF < 1 || PERCENT_OFF > 100) {
  console.error('--percent-off must be a whole number from 1 to 100.')
  process.exit(1)
}

const MAX_REDEMPTIONS = flag('max-redemptions', '')
const DURATION = flag('duration', 'once')
if (!['once', 'forever', 'repeating'].includes(DURATION)) {
  console.error('--duration must be once, forever, or repeating.')
  process.exit(1)
}

const LIVE = KEY.startsWith('sk_live_') || KEY.startsWith('rk_live_')
console.log(`Mode: ${LIVE ? 'LIVE' : 'TEST'}`)
if (LIVE && PERCENT_OFF === 100) {
  console.log('A live code giving 100% off. Anyone who learns the string can use it')
  console.log('until it runs out, so keep --max-redemptions small for an internal test.\n')
}

async function stripe(path, params) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(`Stripe ${path} failed: ${payload?.error?.message ?? response.status}`)
  }
  return payload
}

const coupon = await stripe('coupons', {
  percent_off: String(PERCENT_OFF),
  duration: DURATION,
  name: `${PERCENT_OFF}% off · ${CODE}`,
})
console.log(`coupon:         ${coupon.id} (${PERCENT_OFF}% off, ${DURATION})`)

const promotion = await stripe('promotion_codes', {
  coupon: coupon.id,
  code: CODE,
  ...(MAX_REDEMPTIONS ? { max_redemptions: String(Number.parseInt(MAX_REDEMPTIONS, 10)) } : {}),
})
console.log(`promotion code: ${promotion.code} (${promotion.id})`)
console.log(`
Customers enter "${promotion.code}" under "Add promotion code" at checkout —
on credit packs and on plan subscriptions alike.

To take it out of circulation later, deactivate the promotion code in the
dashboard. The coupon can stay; without an active code nobody can redeem it.
`)
