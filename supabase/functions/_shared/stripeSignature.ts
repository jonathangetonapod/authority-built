// Stripe's v1 webhook signature scheme: HMAC-SHA256 over `${timestamp}.${body}`,
// compared in constant time, with a replay window on the timestamp.
//
// stripe-credit-webhook still carries its own copy. That function is the live
// path for money already taken, and moving its verification here would mean
// redeploying it for a refactor rather than a fix. It can adopt this module the
// next time it changes for a reason of its own.

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!header) return false

  // While a signing secret is being rotated, Stripe signs with every secret
  // that is still valid and puts one v1 in the header per secret. Reading them
  // into a Map kept only the last, so whether a real event verified came down
  // to the order Stripe happened to list them in — and a rotation with an
  // overlap window would have rejected live events for the length of it.
  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [rawKey, rawValue] = part.split('=', 2)
    if (!rawKey || !rawValue) continue
    const key = rawKey.trim()
    const value = rawValue.trim()
    if (key === 't' && !timestamp) timestamp = value
    else if (key === 'v1') signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) return false
  const age = Math.abs(nowMs / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false

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
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  // Every candidate is compared, and comparison stays constant-time per
  // candidate: a match anywhere means this secret signed the payload.
  let matched = false
  for (const signature of signatures) {
    if (timingSafeEqual(expected, signature)) matched = true
  }
  return matched
}
