import { HttpError } from './httpError.ts'

/**
 * Ties a public page to the hostname it was requested on.
 *
 * The public surfaces authenticate by unguessable slug alone, which is fine
 * while everything is served from one origin. Once a workspace answers on its
 * own hostname, a slug that resolves anywhere means a link built for one
 * agency also renders on every other agency's domain, wearing that agency's
 * brand. This is what stops that.
 *
 * To be precise about what it is and is not: the hostname comes from the
 * browser and is not a credential, so this is not an additional authorization
 * check on top of the slug. It is the guarantee that a domain only ever shows
 * its own workspace's pages — so a shared link works exactly where it should,
 * and the brand around it is never somebody else's.
 */

const MAX_HOSTNAME_LENGTH = 253
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u

interface DomainLookupClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/**
 * Takes a hostname out of a Host header, an Origin, or a whole URL. Returns
 * null for anything that is not one, because a malformed host is the same
 * answer as an unknown one.
 */
export function normalizeHostname(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/\.$/u, '')
  if (!hostname || hostname.length > MAX_HOSTNAME_LENGTH) return null
  return HOSTNAME_PATTERN.test(hostname) ? hostname : null
}

/**
 * The workspace serving this hostname, or null when the request arrived on the
 * platform's own origin — where every slug is still valid, because that is
 * where they have always worked.
 */
export async function resolveHostWorkspaceId(
  admin: DomainLookupClient,
  hostname: unknown,
): Promise<string | null> {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return null
  const { data, error } = await admin.rpc('resolve_workspace_domain_v1', {
    p_hostname: normalized,
  })
  // A lookup that failed must not silently widen the page to every workspace,
  // but it must not take down the platform origin either. Null means "not a
  // tenant domain", which is the platform's own behaviour.
  if (error || !data || typeof data !== 'object') return null
  const workspaceId = (data as Record<string, unknown>).workspace_id
  return typeof workspaceId === 'string' && workspaceId.length > 0 ? workspaceId : null
}

/**
 * Refuse a resource that belongs to a different workspace than the domain it
 * was asked for on. The 404 is deliberate: on somebody else's domain, this
 * page does not exist, and saying anything more precise would confirm that the
 * slug is real.
 */
export function requireServedByHost(
  hostWorkspaceId: string | null,
  resourceWorkspaceId: string | null | undefined,
  notFoundCode: string,
  notFoundMessage: string,
): void {
  if (!hostWorkspaceId) return
  if (
    typeof resourceWorkspaceId === 'string'
    && resourceWorkspaceId.toLowerCase() === hostWorkspaceId.toLowerCase()
  ) return
  throw new HttpError(404, notFoundCode, notFoundMessage)
}
