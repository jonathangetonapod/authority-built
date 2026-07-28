/**
 * Shared CORS configuration for all edge functions.
 * Restricts origins to known domains instead of wildcard '*'.
 */

const PRODUCTION_ALLOWED_ORIGINS = [
  'https://getonapod.com',
  'https://www.getonapod.com',
]

const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
]

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.startsWith('127.')
    || normalized === '[::1]'
}

export function resolveAllowedOrigins(
  environment: string | undefined,
  configuredValues: Array<string | undefined>,
): string[] {
  const development = environment?.trim().toLowerCase() === 'development'
  const configured = configuredValues
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .flatMap((value) => {
      try {
        const parsed = new URL(value)
        const local = isLocalHostname(parsed.hostname)
        if (local && !development) return []
        if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return []
        return [parsed.origin]
      } catch {
        return []
      }
    })

  return [...new Set([
    ...PRODUCTION_ALLOWED_ORIGINS,
    ...configured,
    ...(development ? LOCAL_DEVELOPMENT_ORIGINS : []),
  ])]
}

const ALLOWED_ORIGINS = resolveAllowedOrigins(Deno.env.get('ENVIRONMENT'), [
  Deno.env.get('ALLOWED_ORIGINS'),
  Deno.env.get('ALLOWED_ORIGIN'),
  Deno.env.get('APP_URL'),
  Deno.env.get('WEB_URL'),
])

/**
 * Origins of workspace custom domains, refreshed from the database.
 *
 * A tenant hostname cannot be in the static list — it is created after this
 * code is deployed — and widening to a wildcard would hand every origin on the
 * internet an authenticated preflight. So the allowlist stays an allowlist and
 * gains a second, database-backed half.
 *
 * Held per isolate with a short TTL. A domain that has just gone live is worth
 * one uncached lookup rather than a failed request the operator has to retry.
 */
const WORKSPACE_ORIGIN_TTL_MS = 60_000
let workspaceOrigins = new Set<string>()
let workspaceOriginsFetchedAt = 0

interface OriginLookupClient {
  rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }>
}

async function loadWorkspaceOrigins(admin: OriginLookupClient): Promise<void> {
  const { data, error } = await admin.rpc('active_workspace_domain_origins_v1')
  if (error) return
  if (!Array.isArray(data)) return
  workspaceOrigins = new Set(
    data.filter((value): value is string => typeof value === 'string' && value.startsWith('https://')),
  )
  workspaceOriginsFetchedAt = Date.now()
}

/**
 * Make sure the request's origin has been considered before headers are built.
 * A known origin costs nothing; an unknown one costs one lookup, and only until
 * the cache holds it.
 */
export async function ensureWorkspaceOriginAllowed(
  admin: OriginLookupClient,
  req?: Request,
): Promise<void> {
  const origin = req?.headers?.get('origin') || ''
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return
  // Staleness alone decides this. Refreshing on every *miss* would let anyone
  // force an unlimited number of database reads from an unauthenticated
  // endpoint just by varying the Origin header — a known origin is cheap, an
  // unknown one must be too.
  const stale = Date.now() - workspaceOriginsFetchedAt > WORKSPACE_ORIGIN_TTL_MS
  if (!stale) return
  await loadWorkspaceOrigins(admin)
}

/** Test seam: forget what was cached so a case starts from a known state. */
export function resetWorkspaceOriginCache(): void {
  workspaceOrigins = new Set()
  workspaceOriginsFetchedAt = 0
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || ''
  const allowed = ALLOWED_ORIGINS.includes(origin) || workspaceOrigins.has(origin)
  const allowedOrigin = allowed && origin ? origin : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    // A response that varies by request origin must say so, or a shared cache
    // will hand one tenant's allowed origin to another's browser.
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/**
 * Static CORS headers for backward compatibility.
 * Prefer getCorsHeaders(req) for proper origin checking.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
