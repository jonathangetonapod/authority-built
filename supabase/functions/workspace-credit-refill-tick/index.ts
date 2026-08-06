import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, secretsMatch, writeAudit } from '../_shared/workspaceAuth.ts'
import { CREDIT_PACKS } from '../_shared/creditPacks.ts'

/**
 * Buy credits back for a workspace that is running out, without a person.
 *
 * The columns for this — refill_threshold_credits and refill_pack_credits —
 * have been in the billing profile since it was created, with a constraint
 * requiring both or neither, and nothing ever read them. So an agency that had
 * asked for automatic top-ups still stopped dead at zero.
 *
 * This spends somebody's money while they are asleep, so every guard here is
 * deliberate:
 *
 *   * opt-in only, and off unless both columns are set
 *   * one refill per workspace per day, keyed in the ledger, so a stuck tick
 *     or a double schedule cannot bill twice
 *   * a saved card only; there is no path here that asks anyone for one
 *   * a failure is recorded and the workspace is left alone until tomorrow
 *
 * Granting is the webhook's job, not this function's. It charges and stops:
 * payment_intent.succeeded is what proves the money arrived, and inventing a
 * second grant path here would let credits exist for a payment that later
 * failed.
 */
const MAX_REFILLS_PER_TICK = 10
const STRIPE_API = 'https://api.stripe.com/v1'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function stripePost(
  path: string,
  form: URLSearchParams,
  key: string,
  idempotencyKey: string,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const response = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      // Stripe's own idempotency, on top of the ledger's. A retry of this exact
      // request is the same charge, not a second one.
      'Idempotency-Key': idempotencyKey,
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  return { ok: response.ok, body }
}


/**
 * A card Stripe will accept without the customer present.
 *
 * A PaymentIntent with only a customer relies on invoice_settings holding a
 * default payment method, which a Checkout purchase never sets. Asking for the
 * cards attached to the customer and naming one explicitly is what actually
 * works — and returning null when there are none is how a workspace that never
 * saved a card is skipped rather than charged at.
 */
async function savedCardFor(customerId: string, key: string): Promise<string | null> {
  const query = new URLSearchParams({ customer: customerId, type: 'card', limit: '1' })
  const response = await fetch(`${STRIPE_API}/payment_methods?${query.toString()}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) return null
  const body = await response.json().catch(() => ({})) as { data?: Array<{ id?: unknown }> }
  const first = Array.isArray(body.data) ? body.data[0] : null
  return first && typeof first.id === 'string' ? first.id : null
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // Timing-safe like every other secret comparison in this codebase: this
  // header authorizes charging saved cards off-session.
  const secret = Deno.env.get('REFILL_TICK_SECRET')?.trim()
  const providedSecret = req.headers.get('x-refill-secret') ?? ''
  if (!secret || !(await secretsMatch(providedSecret, secret))) {
    return json(401, { error: 'unauthorized' })
  }
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim()
  if (!stripeKey) return json(200, { charged: 0, error: 'stripe_not_configured' })

  const admin = createAdminClient()

  // Opt-in only. Both columns are required together by constraint, so one of
  // them being present is enough to know this workspace asked for it.
  const { data: profiles, error } = await admin
    .from('workspace_billing_profiles')
    .select('workspace_id, refill_threshold_credits, refill_pack_credits, refill_monthly_cap_cents, stripe_customer_id, billing_status')
    .not('refill_threshold_credits', 'is', null)
    .not('stripe_customer_id', 'is', null)
    .limit(200)
  if (error) return json(200, { charged: 0, error: 'profiles_unavailable' })

  const today = new Date().toISOString().slice(0, 10)
  let charged = 0
  let skipped = 0
  // Counted separately from skips: a ceiling doing its job is worth seeing.
  let capReached = 0
  const failures: Array<{ workspace_id: string; reason: string }> = []

  for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
    if (charged >= MAX_REFILLS_PER_TICK) break

    const workspaceId = String(profile.workspace_id)
    const threshold = Number(profile.refill_threshold_credits)
    const packCredits = Number(profile.refill_pack_credits)
    const customerId = String(profile.stripe_customer_id ?? '')
    const billingStatus = String(profile.billing_status ?? 'trialing')

    // A workspace whose payments are already failing is the last one to charge
    // again automatically.
    if (['past_due', 'unpaid', 'canceled', 'cancelled', 'incomplete'].includes(billingStatus)) {
      skipped += 1
      continue
    }

    const pack = Object.values(CREDIT_PACKS).find((entry) => entry.credits === packCredits)
    if (!pack) {
      failures.push({ workspace_id: workspaceId, reason: 'pack no longer sold' })
      continue
    }

    /*
     * The monthly spending ceiling, enforced where the charging happens. The
     * column existed with nothing reading it, which is worse than no cap: a
     * schema that promises a control invites somebody to set it and believe
     * it. Spend so far is reconstructed from the ledger — refill grants carry
     * the auto-refill:{workspace}:{day} key — because the audit trail is
     * best-effort by design and a charge whose audit write failed must still
     * count against the ceiling. Each past refill is priced at its own pack
     * (matched by credits granted), falling back to today's pack if the
     * catalog moved underneath it.
     */
    const monthlyCapCents = Number(profile.refill_monthly_cap_cents)
    if (Number.isFinite(monthlyCapCents) && monthlyCapCents >= 0) {
      const monthPrefix = `auto-refill:${workspaceId}:${today.slice(0, 7)}-`
      const { data: monthRefills } = await admin
        .from('workspace_credit_ledger')
        .select('amount')
        .eq('workspace_id', workspaceId)
        .eq('entry_type', 'grant')
        .like('idempotency_key', `${monthPrefix}%`)
      const spentCents = (monthRefills ?? []).reduce((sum: number, row: Record<string, unknown>) => {
        const credited = Number(row.amount) || 0
        const priced = Object.values(CREDIT_PACKS).find((entry) => entry.credits === credited)
        return sum + (priced?.amount_cents ?? pack.amount_cents)
      }, 0)
      if (spentCents + pack.amount_cents > monthlyCapCents) {
        capReached += 1
        continue
      }
    }

    const { data: lots } = await admin
      .from('workspace_credit_lots')
      .select('remaining, expires_at')
      .eq('workspace_id', workspaceId)
      .gt('remaining', 0)
    const now = Date.now()
    const balance = (lots ?? []).reduce((sum: number, lot: Record<string, unknown>) => {
      const expires = typeof lot.expires_at === 'string' ? Date.parse(lot.expires_at) : Number.NaN
      if (!Number.isNaN(expires) && expires <= now) return sum
      return sum + (Number(lot.remaining) || 0)
    }, 0)
    if (balance > threshold) {
      skipped += 1
      continue
    }

    // One per workspace per day. The ledger entry the webhook writes carries
    // this key, so a refill already bought today is visible before charging.
    const refillKey = `auto-refill:${workspaceId}:${today}`
    const { data: existing } = await admin
      .from('workspace_credit_ledger')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('idempotency_key', refillKey)
      .maybeSingle()
    if (existing) {
      skipped += 1
      continue
    }

    // Named explicitly rather than left to a default the purchase flow never
    // sets. No saved card means this workspace never consented to being
    // charged again, so it is skipped, not attempted.
    const paymentMethodId = await savedCardFor(customerId, stripeKey)
    if (!paymentMethodId) {
      failures.push({ workspace_id: workspaceId, reason: 'no saved card to charge' })
      continue
    }

    const form = new URLSearchParams({
      amount: String(pack.amount_cents),
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: 'true',
      // Nobody is present to answer a card challenge, so a card that demands
      // one fails here rather than hanging.
      off_session: 'true',
      description: pack.label,
      'metadata[workspace_id]': workspaceId,
      'metadata[credits]': String(pack.credits),
      'metadata[auto_refill]': 'true',
    })
    const result = await stripePost('payment_intents', form, stripeKey, refillKey)
    if (!result.ok) {
      const message = ((result.body.error ?? {}) as { message?: unknown }).message
      failures.push({
        workspace_id: workspaceId,
        reason: typeof message === 'string' ? message.slice(0, 200) : 'charge refused',
      })
      await writeAudit(admin, {
        workspaceId,
        actorUserId: null as unknown as string,
        action: 'workspace.credits.auto_refill_failed',
        entityType: 'workspace',
        entityId: workspaceId,
        metadata: { credits: pack.credits, amount_cents: pack.amount_cents, balance, threshold },
      })
      continue
    }

    charged += 1
    await writeAudit(admin, {
      workspaceId,
      actorUserId: null as unknown as string,
      action: 'workspace.credits.auto_refill_charged',
      entityType: 'workspace',
      entityId: workspaceId,
      metadata: {
        credits: pack.credits,
        amount_cents: pack.amount_cents,
        balance_before: balance,
        threshold,
        payment_intent: typeof result.body.id === 'string' ? result.body.id : null,
      },
    })
  }

  // The credits are not here yet: the webhook grants them when Stripe confirms
  // the money. Saying "charged" rather than "granted" keeps that distinction.
  return json(200, { charged, skipped, cap_reached: capReached, failed: failures.length, failures: failures.slice(0, 10) })
})
