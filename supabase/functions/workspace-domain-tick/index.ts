import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, writeAudit } from '../_shared/workspaceAuth.ts'
import { checkDomain, DOMAIN_CHECK_COLUMNS } from '../_shared/domainCheck.ts'

/**
 * Looks at custom domains nobody is looking at.
 *
 * Every check the platform performed was a side effect of a platform admin
 * having the domains card open: the poll only ran while that page was
 * mounted, and only for domains still setting up. A domain that reached
 * serving was never checked again by anything. Certificates renew on their
 * own until the day they do not, and the first anyone would have known was an
 * agency's client meeting a browser warning on the agency's own address.
 *
 * Invoked by pg_cron via pg_net with a shared secret — no user JWT
 * (verify_jwt = false), the same shape as inbox-enroll-tick.
 *
 * The check itself is the one the button runs. A second implementation here
 * would drift from it, and the drift would be invisible precisely because
 * nobody watches this path.
 */
const MAX_DOMAINS_PER_TICK = 25
// A domain still being set up is worth watching closely; one that has been
// serving for a month is worth watching, but not often. Both numbers are
// under the cron interval's control too — this is the floor, not the rate.
const SETUP_RECHECK_MS = 2 * 60 * 1000
const SERVING_RECHECK_MS = 6 * 60 * 60 * 1000

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const secret = Deno.env.get('DOMAIN_TICK_SECRET')?.trim()
  if (!secret || req.headers.get('x-domain-tick-secret') !== secret) {
    return json(401, { error: 'unauthorized' })
  }

  const admin = createAdminClient()
  const now = Date.now()

  // Disabled rows are excluded: they are kept for history and deliberately
  // never resolved, so checking them would be spending a provider call to
  // learn something nobody acts on.
  const { data: rows, error } = await admin
    .from('workspace_domains')
    .select(`${DOMAIN_CHECK_COLUMNS},last_checked_at`)
    .in('status', ['awaiting_dns', 'provisioning', 'active', 'failed'])
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(200)
  if (error) {
    return json(200, { checked: 0, error: 'domains_unavailable' })
  }

  const due = (rows ?? []).filter((row: Record<string, unknown>) => {
    const lastChecked = typeof row.last_checked_at === 'string'
      ? Date.parse(row.last_checked_at)
      : Number.NaN
    // Never checked is always due — a row that failed to record a check is
    // the one most likely to be wrong.
    if (Number.isNaN(lastChecked)) return true
    const interval = row.status === 'active' ? SERVING_RECHECK_MS : SETUP_RECHECK_MS
    return now - lastChecked >= interval
  }).slice(0, MAX_DOMAINS_PER_TICK)

  let checked = 0
  let changed = 0
  // Carried back rather than swallowed. A sweep that reports "failed: 1" and
  // nothing else is the same unactionable answer this whole integration was
  // built to stop accepting from a provider — and nobody is watching a cron
  // job closely enough to go and reconstruct it.
  const errors: Array<{ hostname: string; message: string }> = []
  for (const row of due) {
    const before = row.status
    try {
      // Sequential on purpose. These are provider API calls, and the reason
      // this whole integration exists is that one of them rate-limited us at
      // the exact moment a domain was being added.
      const result = await checkDomain(admin, row as never, null, writeAudit)
      checked += 1
      if (result.status !== before) changed += 1
    } catch (error) {
      // One unreachable provider must not stop the rest of the sweep, and the
      // row keeps its previous status rather than being marked on a failure
      // that belongs to the network.
      errors.push({
        hostname: String(row.hostname ?? 'unknown'),
        message: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
      })
    }
  }

  return json(200, { checked, changed, failed: errors.length, due: due.length, errors: errors.slice(0, 10) })
})
