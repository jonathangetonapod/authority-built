import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { Webhook } from 'npm:svix@1.98.0'
import { getCorsHeaders } from '../_shared/cors.ts'

function headers(req: Request): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    'Access-Control-Allow-Headers': 'content-type, svix-id, svix-timestamp, svix-signature',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

/**
 * Resend Webhook Handler
 *
 * Handles delivery events from Resend:
 * - email.sent
 * - email.delivered
 * - email.delivery_delayed
 * - email.bounced
 * - email.complained
 * - email.suppressed
 * - email.opened
 * - email.clicked
 *
 * Documentation: https://resend.com/docs/dashboard/webhooks/introduction
 */

interface ResendWebhookEvent {
  type: string
  created_at: string
  data: Record<string, unknown> & {
    email_id?: unknown
    // Which application sent it. This Resend account is shared with
    // aisdr.getonapod.com, and Resend scopes webhooks to the account rather
    // than the domain, so both applications' events arrive here.
    from?: unknown
    // Event-specific fields
    bounce?: {
      type?: string
      subType?: string
      message?: string
    }
  }
}

const SUPPORTED_EMAIL_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.failed',
  'email.bounced',
  'email.complained',
  'email.suppressed',
  'email.opened',
  'email.clicked',
])

type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; status: 400 | 413; error: string }

async function readBoundedUtf8Body(req: Request, maxBytes: number): Promise<BodyReadResult> {
  if (!req.body) return { ok: true, text: '' }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false, status: 413, error: 'Payload too large' }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { ok: false, status: 400, error: 'Invalid webhook payload' }
  }
}

function normalizeBounceType(value: unknown): 'hard' | 'soft' | 'unknown' {
  if (typeof value !== 'string') return 'unknown'
  switch (value.trim().toLowerCase()) {
    case 'permanent':
    case 'hard':
      return 'hard'
    case 'temporary':
    case 'transient':
    case 'soft':
      return 'soft'
    default:
      return 'unknown'
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(req) })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ received: false, error: 'Method not allowed' }),
        { status: 405, headers: headers(req) },
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendWebhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')

    if (
      !supabaseUrl || !supabaseServiceKey || !resendWebhookSecret
      || !resendWebhookSecret.startsWith('whsec_')
      || resendWebhookSecret.length > 512
    ) {
      console.error('[Resend Webhook] Required server configuration is missing')
      return new Response(
        JSON.stringify({ received: false, error: 'Webhook unavailable' }),
        { status: 503, headers: headers(req) },
      )
    }

    const svixId = req.headers.get('svix-id')
    const svixTimestamp = req.headers.get('svix-timestamp')
    const svixSignature = req.headers.get('svix-signature')
    if (
      !svixId || svixId.length > 256 || svixId.trim() !== svixId
      || !svixTimestamp || svixTimestamp.length > 64
      || svixTimestamp.trim() !== svixTimestamp
      || !svixSignature || svixSignature.length > 2_048
      || svixSignature.trim() !== svixSignature
    ) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook' }),
        { status: 400, headers: headers(req) },
      )
    }

    const declaredLength = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
      return new Response(
        JSON.stringify({ received: false, error: 'Payload too large' }),
        { status: 413, headers: headers(req) },
      )
    }

    // Resend signatures cover the exact request bytes, so verify the raw body
    // before parsing or performing any service-role operation.
    const bodyResult = await readBoundedUtf8Body(req, 65_536)
    if (!bodyResult.ok) {
      return new Response(
        JSON.stringify({ received: false, error: bodyResult.error }),
        { status: bodyResult.status, headers: headers(req) },
      )
    }
    const payload = bodyResult.text

    let event: ResendWebhookEvent
    let webhook: Webhook
    try {
      webhook = new Webhook(resendWebhookSecret)
    } catch {
      console.error('[Resend Webhook] Webhook secret is invalid')
      return new Response(
        JSON.stringify({ received: false, error: 'Webhook unavailable' }),
        { status: 503, headers: headers(req) },
      )
    }

    try {
      event = webhook.verify(payload, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as ResendWebhookEvent
    } catch {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook' }),
        { status: 400, headers: headers(req) },
      )
    }

    if (
      !event || typeof event !== 'object'
      || typeof event.type !== 'string'
      || event.type.length < 1 || event.type.length > 128
      || event.type.trim() !== event.type
      || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)
      || typeof event.created_at !== 'string'
    ) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook payload' }),
        { status: 400, headers: headers(req) },
      )
    }

    const rawEmailId = event.data.email_id
    if (
      rawEmailId !== undefined
      && (
        typeof rawEmailId !== 'string'
        || rawEmailId.length < 1 || rawEmailId.length > 256
        || rawEmailId.trim() !== rawEmailId
      )
    ) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook payload' }),
        { status: 400, headers: headers(req) },
      )
    }

    const emailId = typeof rawEmailId === 'string' ? rawEmailId : null
    if (SUPPORTED_EMAIL_EVENTS.has(event.type) && emailId === null) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook payload' }),
        { status: 400, headers: headers(req) },
      )
    }

    // The sender decides whether the event is ours at all; the database holds
    // the list of domains it will accept. A malformed or absent sender is
    // passed through as null and dropped there rather than guessed at here.
    const rawFrom = event.data.from
    if (
      rawFrom !== undefined
      && (typeof rawFrom !== 'string' || rawFrom.length > 320)
    ) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook payload' }),
        { status: 400, headers: headers(req) },
      )
    }
    const fromAddress = typeof rawFrom === 'string' ? rawFrom : null

    const eventCreatedAt = new Date(event.created_at)
    if (Number.isNaN(eventCreatedAt.getTime())) {
      return new Response(
        JSON.stringify({ received: false, error: 'Invalid webhook payload' }),
        { status: 400, headers: headers(req) },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: result, error: processingError } = await supabase.rpc(
      'process_resend_webhook_event',
      {
        p_svix_id: svixId,
        p_event_type: event.type,
        p_resend_email_id: emailId,
        p_event_created_at: eventCreatedAt.toISOString(),
        p_bounce_type: event.type === 'email.bounced'
          ? normalizeBounceType(event.data.bounce?.type)
          : null,
        p_complaint_type: event.type === 'email.complained' ? 'abuse' : null,
        p_from_address: fromAddress,
      },
    )

    if (processingError || !['processed', 'duplicate', 'ignored'].includes(result)) {
      throw new Error('Webhook transaction failed')
    }

    return new Response(
      JSON.stringify({ received: true, duplicate: result === 'duplicate' }),
      { status: 200, headers: headers(req) },
    )

  } catch {
    console.error('[Resend Webhook] Processing failed')

    // A server-side failure is retryable. Invalid signatures are rejected
    // above with 400 and never reach service-role processing.
    return new Response(
      JSON.stringify({ received: false, error: 'Webhook processing failed' }),
      { status: 500, headers: headers(req) },
    )
  }
})
