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
  status: 'active' | 'provisioning' | 'awaiting_dns' | 'failed'
  error: string | null
}

/**
 * The worker that rewrites Host before the request leaves Cloudflare's edge.
 *
 * Railway routes by Host and answers a hostname it has not been told about
 * with its fallback 404 — and because it also serves its own certificate for
 * the SNI it does not recognise, strict origin validation turns that into a
 * 526 before the 404 is ever reached. Cloudflare can override the origin, but
 * overriding the SNI is Enterprise-only, so the rewrite has to happen in a
 * worker. Verified by hand: without the route the hostname 526s, with it the
 * app is served.
 *
 * Left unset, no route is managed and a custom hostname will reach whatever
 * the fallback origin serves — correct for an origin that does not route by
 * Host, which is why this is configuration rather than an assumption.
 */
function workerScript(): string | null {
  return Deno.env.get('CLOUDFLARE_SAAS_WORKER')?.trim() || null
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

async function cloudflareRequest(
  path: string,
  init: { method: string; body?: unknown },
): Promise<unknown> {
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
    const first = (errors[0] ?? {}) as { code?: unknown; message?: unknown }
    const message = typeof first.message === 'string' ? first.message : text.slice(0, 300)
    // Rate limiting is the one refusal that is not about the domain, and
    // Cloudflare phrases it for whoever wrote the client — "consider
    // throttling your request speed" reads as an accusation to an operator
    // who pressed a button once. Say what happened and what to do, and say
    // that nothing was created, because the next instinct is to check.
    // Kept as 404 rather than flattened into a refusal, so a caller can tell
    // "this no longer exists" from "the provider said no", which are different
    // answers and only one of them is a state of the domain.
    if (response.status === 404) {
      throw new HttpError(404, 'CLOUDFLARE_NOT_FOUND', message)
    }
    if (response.status === 429 || first.code === 971 || /throttling your request speed/iu.test(message)) {
      throw new HttpError(
        429,
        'CLOUDFLARE_RATE_LIMITED',
        'Cloudflare is temporarily rate-limiting us. Nothing was created — wait a few minutes and try again.',
      )
    }
    throw new HttpError(502, 'CLOUDFLARE_REJECTED', `Cloudflare refused the request: ${message}`)
  }
  return payload.result
}

/** For the endpoints whose result is one object. */
async function cloudflareFetch(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Record<string, unknown>> {
  const result = await cloudflareRequest(path, init)
  return (result ?? {}) as Record<string, unknown>
}

/** For the endpoints whose result is a list, such as worker routes. */
async function cloudflareFetchList(
  path: string,
  init: { method: string; body?: unknown },
): Promise<Array<Record<string, unknown>>> {
  const result = await cloudflareRequest(path, init)
  return Array.isArray(result) ? result as Array<Record<string, unknown>> : []
}

function routePattern(hostname: string): string {
  return `${hostname}/*`
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

  const script = workerScript()
  if (script) {
    try {
      await cloudflareFetch('/workers/routes', {
        method: 'POST',
        body: { pattern: routePattern(hostname), script },
      })
    } catch (error) {
      // A hostname without its route resolves, issues a certificate, and then
      // 526s — the worst shape of failure, because everything reports healthy.
      // Hand the hostname back instead of leaving one that can never serve.
      await cloudflareFetch(`/custom_hostnames/${id}`, { method: 'DELETE' }).catch(() => undefined)
      throw error
    }
  }

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
  // A hostname deleted at the provider is a state, not a transport failure.
  // Letting the 404 throw made every check 500 while the row stayed active
  // and links kept pointing at a domain that no longer serves — the one
  // outcome worse than reporting the failure, because it is unreportable.
  const result = await cloudflareFetch(`/custom_hostnames/${hostnameId}`, { method: 'GET' })
    .catch((error) => {
      if (error instanceof HttpError && error.status === 404) return null
      throw error
    })
  if (result === null) {
    return {
      status: 'failed',
      error: 'This hostname no longer exists at Cloudflare. Remove it here and add it again.',
    }
  }
  const ssl = (result.ssl ?? {}) as Record<string, unknown>
  if (ssl.status === 'active') return { status: 'active', error: null }

  const error = firstMessage(ssl.validation_errors)
    ?? firstMessage(result.verification_errors)
    ?? null

  // Failed is reserved for what waiting cannot fix. A hostname that has moved
  // away or been deleted is not slow — the record now points somewhere else,
  // and reporting that as "waiting for DNS" leaves an operator watching a row
  // that will never change. Every pending state stays waiting, because
  // Cloudflare reports transient validation errors during normal issuance.
  if (result.status === 'moved' || result.status === 'deleted' || ssl.status === 'deleted') {
    return {
      status: 'failed',
      error: error ?? 'The DNS record no longer points here, so this hostname has been released',
    }
  }

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
  // The route is keyed by pattern, not by the hostname id, so it is found by
  // reading the hostname back first. Routes are removed before the hostname:
  // a route left pointing at a hostname that no longer exists is invisible
  // until it collides with the next agency to claim that name.
  const script = workerScript()
  if (script) {
    const hostname = await cloudflareFetch(`/custom_hostnames/${hostnameId}`, { method: 'GET' })
      .then((result) => (typeof result.hostname === 'string' ? result.hostname : null))
      .catch(() => null)
    if (hostname) {
      const rows = await cloudflareFetchList('/workers/routes', { method: 'GET' }).catch(() => [])
      const wanted = routePattern(hostname)
      for (const row of rows) {
        if (row.pattern === wanted && typeof row.id === 'string') {
          await cloudflareFetch(`/workers/routes/${row.id}`, { method: 'DELETE' }).catch(() => undefined)
        }
      }
    }
  }
  await cloudflareFetch(`/custom_hostnames/${hostnameId}`, { method: 'DELETE' })
}
