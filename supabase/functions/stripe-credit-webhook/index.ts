// Stripe webhook for credit pack purchases. Signature-verified (manual
// HMAC-SHA256 over the v1 scheme), then checkout.session.completed grants the
// purchased credits idempotently via grant_workspace_credits_v1 keyed on the
// Stripe event id — replays and retries can never double-grant.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient } from '../_shared/workspaceAuth.ts'

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false
  const parts = new Map(
    header.split(',').flatMap((part) => {
      const [key, value] = part.split('=', 2)
      return key && value ? [[key.trim(), value.trim()] as const] : []
    }),
  )
  const timestamp = parts.get('t')
  const signature = parts.get('v1')
  if (!timestamp || !signature) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
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
  return timingSafeEqual(expected, signature)
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const secret = Deno.env.get('STRIPE_CREDIT_WEBHOOK_SECRET')?.trim()
  if (!secret) return json(500, { error: 'SERVER_MISCONFIGURED' })

  const payload = await req.text()
  if (payload.length > 500_000) return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  const verified = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)
  if (!verified) return json(400, { error: 'INVALID_SIGNATURE' })

  let event: {
    id?: string
    type?: string
    data?: { object?: Record<string, unknown> }
  }
  try {
    event = JSON.parse(payload)
  } catch (_error) {
    return json(400, { error: 'INVALID_PAYLOAD' })
  }
  // Two ways credits are bought, and they are different Stripe events. A
  // person at a checkout page completes a session; an automatic top-up has
  // nobody present, so it is a payment intent charged off-session against a
  // saved card. Both carry the same metadata and grant through the same
  // idempotent call — the alternative was a second grant path that could
  // drift from this one.
  const AUTOMATIC = 'payment_intent.succeeded'
  if (event.type !== 'checkout.session.completed' && event.type !== AUTOMATIC) {
    return json(200, { received: true, ignored: event.type ?? 'unknown' })
  }

  const session = event.data?.object ?? {}
  const metadata = (session.metadata ?? {}) as Record<string, unknown>
  const workspaceId = typeof metadata.workspace_id === 'string' ? metadata.workspace_id : null
  const credits = Number.parseInt(String(metadata.credits ?? ''), 10)
  // A session reports payment_status; a payment intent reports status. Read
  // whichever this event carries rather than trusting one shape.
  const paymentStatus = event.type === AUTOMATIC
    ? (typeof session.status === 'string' ? session.status : null)
    : (typeof session.payment_status === 'string' ? session.payment_status : null)
  const paidValue = event.type === AUTOMATIC ? 'succeeded' : 'paid'
  if (!workspaceId || !Number.isInteger(credits) || credits <= 0 || credits > 100_000) {
    console.error('[Stripe Credit Webhook] Completed session missing grant metadata')
    return json(200, { received: true, ignored: 'missing metadata' })
  }
  if (paymentStatus !== paidValue) {
    return json(200, { received: true, ignored: `payment_status ${paymentStatus ?? 'unknown'}` })
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('grant_workspace_credits_v1', {
    p_workspace_id: workspaceId,
    p_source: 'purchase',
    p_amount: credits,
    p_expires_at: null,
    p_reference_kind: event.type === AUTOMATIC ? 'stripe_auto_refill' : 'stripe_checkout',
    p_reference_id: typeof session.id === 'string' ? session.id : null,
    p_actor_user_id: null,
    p_idempotency_key: `stripe:${event.id ?? crypto.randomUUID()}`,
  })
  if (error) {
    console.error('[Stripe Credit Webhook] Credit grant failed')
    // Non-200 makes Stripe retry — the idempotency key makes retries safe.
    return json(500, { error: 'GRANT_FAILED' })
  }

  return json(200, { received: true, granted: credits, workspace_id: workspaceId })
})
