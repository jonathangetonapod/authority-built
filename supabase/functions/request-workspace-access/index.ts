import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { HttpError } from '../_shared/httpError.ts'
import {
  createAdminClient,
  errorResponse,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requireString,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST', 'OPTIONS'] as const

// The tabs on the landing page, in the same words. A value the page cannot
// produce is a value nobody chose.
const AUDIENCES = new Set(['agency', 'pr', 'freelancer', 'starting_out', 'other'])

// Enough to stop a bored script, loose enough that an office behind one NAT can
// still send a handful of colleagues.
const MAX_PER_IP_PER_DAY = 5

// Requests arriving with no address header at all share one bucket. In practice
// the edge always sets one, so this is anything that reached the function
// another way — and it has to be stricter than the identified limit, or
// stripping your headers is a way to buy a bigger allowance. It was briefly 20,
// which is exactly the mistake this comment is describing.
const UNIDENTIFIED_BUCKET = 'unidentified'
const MAX_UNIDENTIFIED_PER_DAY = 3

/**
 * Take an access request from the public landing page.
 *
 * The platform is invite-only and stays that way: nothing here creates a user,
 * a workspace, or a session. It records that somebody asked, so a platform admin
 * can decide. The submitter is told the same thing whether or not they have
 * asked before — a request form that says "you already applied" is a way to
 * check who else has.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 8_192)
    requireOnlyKeys(body, ['email', 'fullName', 'company', 'website', 'audience', 'clientsNow', 'notes'])

    const email = requireEmail(body.email)
    const fullName = requireString(body.fullName, 'fullName', { max: 120 })
    const audience = requireString(body.audience, 'audience', { max: 32 })
    if (!AUDIENCES.has(audience)) {
      throw new HttpError(400, 'INVALID_FIELD', 'audience is not one of the options offered')
    }
    const company = optionalString(body.company, 'company', 160)
    const website = optionalString(body.website, 'website', 200)
    const clientsNow = optionalString(body.clientsNow, 'clientsNow', 60)
    const notes = optionalString(body.notes, 'notes', 1_000)

    const admin = createAdminClient()
    // Falls back to a shared bucket rather than skipping the limit: a caller who
    // strips both headers should end up more restricted, not unlimited.
    const ipHash = await hashSourceIp(req) ?? UNIDENTIFIED_BUCKET

    {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count, error } = await admin
        .from('workspace_access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('source_ip_hash', ipHash)
        .gte('created_at', since)
      // A rate-limit lookup that fails is not a reason to lose the request; it
      // is a reason to accept this one and let the admin see the volume.
      const ceiling = ipHash === UNIDENTIFIED_BUCKET ? MAX_UNIDENTIFIED_PER_DAY : MAX_PER_IP_PER_DAY
      if (!error && (count ?? 0) >= ceiling) {
        throw new HttpError(
          429,
          'TOO_MANY_REQUESTS',
          'A few requests have already come from here today. Email jonathan@getonapod.com and we will pick it up there.',
        )
      }
    }

    const { error: insertError } = await admin.from('workspace_access_requests').insert({
      email,
      full_name: fullName,
      company,
      website,
      audience,
      clients_now: clientsNow,
      notes,
      source_ip_hash: ipHash,
    })
    if (insertError) {
      console.error('[Request Workspace Access] Could not record the request')
      throw new HttpError(500, 'REQUEST_NOT_SAVED', 'The request could not be saved. Please try again.')
    }

    // Best effort: the request is already recorded, so a mail provider having a
    // bad afternoon must not turn a saved request into an error the person sees.
    await notifyPlatform({ email, fullName, company, website, audience, clientsNow, notes })

    return jsonResponse(req, METHODS, 200, { received: true })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})

/**
 * A salted hash of the caller's address, for counting only.
 *
 * Salted with the service role key, which never leaves the function, so the
 * stored value cannot be reversed into an address by anyone reading the table —
 * including a platform admin.
 *
 * The header order matters. `x-forwarded-for` is a list the client can prepend
 * to, so the *first* entry is whatever the caller typed and the last is what the
 * nearest proxy appended. Reading the first entry would have let anyone reset
 * their own rate-limit bucket per request by sending a different fake address
 * each time. `cf-connecting-ip` is set by the edge, not the caller, so it wins.
 */
function callerAddress(req: Request): string | null {
  const direct = req.headers.get('cf-connecting-ip')?.trim()
  if (direct) return direct
  const chain = req.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean)
  return chain?.length ? chain[chain.length - 1] : null
}

async function hashSourceIp(req: Request): Promise<string | null> {
  const address = callerAddress(req)
  if (!address) return null
  const salt = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${address}`))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

async function notifyPlatform(request: {
  email: string
  fullName: string
  company: string | null
  website: string | null
  audience: string
  clientsNow: string | null
  notes: string | null
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = Deno.env.get('RESEND_FROM_EMAIL')?.trim()
  const to = Deno.env.get('ACCESS_REQUEST_NOTIFY_EMAIL')?.trim()
  if (!apiKey || !from || !to) return

  const rows: Array<[string, string]> = [
    ['Name', request.fullName],
    ['Email', request.email],
    ['Company', request.company ?? '—'],
    ['Website', request.website ?? '—'],
    ['Describes themselves as', request.audience],
    ['Clients today', request.clientsNow ?? '—'],
    ['Notes', request.notes ?? '—'],
  ]
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#19172d"><h2 style="margin:0 0 16px">Access request</h2><table cellpadding="6" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="color:#77728e">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join('')}</table></body></html>`
  const text = rows.map(([label, value]) => `${label}: ${value}`).join('\n')

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: request.email,
        subject: `Access request — ${request.fullName}`,
        html,
        text,
      }),
    })
    if (!response.ok) console.error('[Request Workspace Access] Notification was rejected by the provider')
  } catch (_error) {
    console.error('[Request Workspace Access] Notification provider was unavailable')
  }
}
