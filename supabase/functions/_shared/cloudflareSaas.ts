import { HttpError } from './httpError.ts'

/**
 * Cloudflare for SaaS custom hostnames.
 *
 * The second provider behind the same three states the rest of the domain flow
 * speaks. It exists because the first one could not say why a domain was
 * stuck: an hour in VALIDATING_OWNERSHIP with a null error message is not
 * something an operator can act on, and it is not something the card can
 * explain. Cloudflare reports validation failures as text, which is the whole
 * reason to carry a second integration at all.
 *
 * Rows record which provider created them, so switching the env var changes
 * where NEW domains are created without stranding the ones already serving.
 */

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'

export interface ProviderDomain {
  id: string
  dnsRecordType: string
  dnsRecordName: string
  dnsRecordValue: string | null
}

export interface ProviderProgress {
  status: 'active' | 'provisioning' | 'awaiting_dns'
  error: string | null
}

function cloudflareConfig(): { token: string; zoneId: string; fallbackOrigin: string } {
  const token = Deno.env.get('CLOUDFLARE_API_TOKEN')?.trim()
  const zoneId = Deno.env.get('CLOUDFLARE_ZONE_ID')?.trim()
  // The hostname agencies point their CNAME at. Cloudflare does not hand this
  // back per hostname — it is the fallback origin configured once on the zone,
  // so it is configuration here rather than something read from a response.
  const fallbackOrigin = Deno.env.get('CLOUDFLARE_SAAS_FALLBACK_ORIGIN')?.trim()
  if (!token || !zoneId || !fallbackOrigin) {
    throw new HttpError(
      503,
      'CLOUDFLARE_NOT_CONFIGURED',
      'CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID and CLOUDFLARE_SAAS_FALLBACK_ORIGIN must all be set',
    )
  }
  return { token, zoneId, fallbackOrigin }
}

async function cloudflareFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const { token, zoneId } = cloudflareConfig()
  let response: Response
  try {
    response = await fetch(`${CLOUDFLARE_API}/zones/${zoneId}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (_error) {
    throw new HttpError(504, 'CLOUDFLARE_UNREACHABLE', 'Cloudflare did not respond')
  }

  const text = await response.text()
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new HttpError(502, 'CLOUDFLARE_REJECTED', 'Cloudflare returned a response that was not JSON')
  }
  // Cloudflare answers 200 with success:false, so the status code alone is not
  // the check. Their message is carried through rather than replaced: it is
  // the thing this provider was chosen for.
  if (!response.ok || payload.success === false) {
    const errors = Array.isArray(payload.errors) ? payload.errors : []
    const first = (errors[0] ?? {}) as { message?: unknown }
    const message = typeof first.message === 'string' ? first.message : text.slice(0, 300)
    throw new HttpError(502, 'CLOUDFLARE_REJECTED', `Cloudflare refused the request: ${message}`)
  }
  return (payload.result ?? {}) as Record<string, unknown>
}

/** Registers the hostname and returns the record the agency has to create. */
export async function createCloudflareHostname(hostname: string): Promise<ProviderDomain> {
  const { fallbackOrigin } = cloudflareConfig()
  const result = await cloudflareFetch('/custom_hostnames', {
    method: 'POST',
    // http validation keeps the agency's job to the single CNAME they are
    // already creating; txt would be a second record and a second thing to get
    // wrong, for a certificate that issues either way.
    body: { hostname, ssl: { method: 'http', type: 'dv' } },
  })
  const id = typeof result.id === 'string' ? result.id : ''
  if (!id) throw new HttpError(502, 'CLOUDFLARE_REJECTED', 'Cloudflare did not return the created hostname')
  return {
    id,
    dnsRecordType: 'CNAME',
    dnsRecordName: hostname,
    dnsRecordValue: fallbackOrigin,
  }
}

function firstMessage(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const entry = value[0]
  if (typeof entry === 'string') return entry
  const message = (entry as { message?: unknown })?.message
  return typeof message === 'string' ? message : null
}

/**
 * The same three states the card renders, from Cloudflare's two status fields.
 *
 * Ownership going active is Cloudflare confirming the agency's CNAME resolves
 * to us, which is the same fact Railway reports as a propagated DNS record —
 * so it promotes out of waiting for exactly the same reason, and nothing is
 * called provisioning until the provider has confirmed the record.
 */
export async function cloudflareHostnameProgress(hostnameId: string): Promise<ProviderProgress> {
  const result = await cloudflareFetch(`/custom_hostnames/${hostnameId}`, { method: 'GET' })
  const ssl = (result.ssl ?? {}) as Record<string, unknown>
  if (ssl.status === 'active') return { status: 'active', error: null }

  const error = firstMessage(ssl.validation_errors)
    ?? firstMessage(result.verification_errors)
    ?? null
  const ownershipVerified = result.status === 'active'
  return {
    status: ownershipVerified ? 'provisioning' : 'awaiting_dns',
    error: error
      ?? (ownershipVerified
        ? 'The DNS record is in place. Waiting for the certificate to be issued'
        : 'The DNS record has not been created yet, or has not propagated'),
  }
}

export async function deleteCloudflareHostname(hostnameId: string): Promise<void> {
  await cloudflareFetch(`/custom_hostnames/${hostnameId}`, { method: 'DELETE' })
}
