import { timingSafeEqual, verifyStripeSignature } from './stripeSignature.ts'

// Local, like the other _shared tests: an external assertion module would put a
// new entry in the frozen lockfile for nothing.
function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

const SECRET = 'whsec_test_secret'
const PAYLOAD = '{"id":"evt_1","type":"customer.subscription.updated"}'

async function sign(payload: string, timestamp: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const NOW_SECONDS = 1_800_000_000
const NOW_MS = NOW_SECONDS * 1000

Deno.test('accepts a signature Stripe would have sent', async () => {
  const header = `t=${NOW_SECONDS},v1=${await sign(PAYLOAD, NOW_SECONDS)}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), true)
})

Deno.test('rejects a signature made with a different secret', async () => {
  const header = `t=${NOW_SECONDS},v1=${await sign(PAYLOAD, NOW_SECONDS, 'whsec_wrong')}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), false)
})

// The signature covers the body, so a replayed header cannot carry new content.
Deno.test('rejects a body that was edited after signing', async () => {
  const header = `t=${NOW_SECONDS},v1=${await sign(PAYLOAD, NOW_SECONDS)}`
  const tampered = PAYLOAD.replace('evt_1', 'evt_2')
  assertEquals(await verifyStripeSignature(tampered, header, SECRET, NOW_MS), false)
})

Deno.test('rejects a signature older than the replay window', async () => {
  const stale = NOW_SECONDS - 400
  const header = `t=${stale},v1=${await sign(PAYLOAD, stale)}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), false)
})

Deno.test('accepts one inside the replay window', async () => {
  const recent = NOW_SECONDS - 60
  const header = `t=${recent},v1=${await sign(PAYLOAD, recent)}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), true)
})

// Rotating a signing secret gives an overlap window where Stripe signs with
// every valid secret and lists one v1 per secret. The old parser read them into
// a Map, so only the last survived and verification came down to Stripe's
// ordering. Both positions are checked here because only one of them failed.
Deno.test('accepts a rotation header whose matching signature comes second', async () => {
  const ours = await sign(PAYLOAD, NOW_SECONDS)
  const theirs = await sign(PAYLOAD, NOW_SECONDS, 'whsec_other')
  const header = `t=${NOW_SECONDS},v1=${theirs},v1=${ours}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), true)
})

Deno.test('accepts a rotation header whose matching signature comes first', async () => {
  const ours = await sign(PAYLOAD, NOW_SECONDS)
  const theirs = await sign(PAYLOAD, NOW_SECONDS, 'whsec_other')
  const header = `t=${NOW_SECONDS},v1=${ours},v1=${theirs}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), true)
})

// Several wrong signatures are still no signature. Widening the search must not
// widen what counts as valid.
Deno.test('rejects a header of signatures none of which are ours', async () => {
  const a = await sign(PAYLOAD, NOW_SECONDS, 'whsec_one')
  const b = await sign(PAYLOAD, NOW_SECONDS, 'whsec_two')
  assertEquals(
    await verifyStripeSignature(PAYLOAD, `t=${NOW_SECONDS},v1=${a},v1=${b}`, SECRET, NOW_MS),
    false,
  )
})

// The timestamp is what the signature covers, so a second t must not be able to
// replace the one that was signed.
Deno.test('keeps the first timestamp when a header carries two', async () => {
  const stale = NOW_SECONDS - 400
  const header = `t=${stale},t=${NOW_SECONDS},v1=${await sign(PAYLOAD, NOW_SECONDS)}`
  assertEquals(await verifyStripeSignature(PAYLOAD, header, SECRET, NOW_MS), false)
})

// v0 is Stripe's test-mode scheme and is not the one we verify.
Deno.test('ignores signature schemes other than v1', async () => {
  const ours = await sign(PAYLOAD, NOW_SECONDS)
  assertEquals(
    await verifyStripeSignature(PAYLOAD, `t=${NOW_SECONDS},v0=${ours}`, SECRET, NOW_MS),
    false,
  )
  assertEquals(
    await verifyStripeSignature(PAYLOAD, `t=${NOW_SECONDS},v0=deadbeef,v1=${ours}`, SECRET, NOW_MS),
    true,
  )
})

Deno.test('rejects a missing or malformed header', async () => {
  assertEquals(await verifyStripeSignature(PAYLOAD, null, SECRET, NOW_MS), false)
  assertEquals(await verifyStripeSignature(PAYLOAD, '', SECRET, NOW_MS), false)
  assertEquals(await verifyStripeSignature(PAYLOAD, 'v1=abc', SECRET, NOW_MS), false)
  assertEquals(await verifyStripeSignature(PAYLOAD, `t=${NOW_SECONDS}`, SECRET, NOW_MS), false)
})

Deno.test('timingSafeEqual compares content, not just length', () => {
  assertEquals(timingSafeEqual('abcd', 'abcd'), true)
  assertEquals(timingSafeEqual('abcd', 'abce'), false)
  assertEquals(timingSafeEqual('abcd', 'abc'), false)
})
