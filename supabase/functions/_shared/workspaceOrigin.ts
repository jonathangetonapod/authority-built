import { HttpError } from './httpError.ts'

/**
 * The origin a client-facing link should be built from.
 *
 * Every one of these links — the onboarding invitation, the portal invite, the
 * password reset, the milestone email — was built from a single global APP_URL,
 * so an agency could brand the page in every way the product allowed and then
 * send their client a getonapod.com address to reach it. The branding was
 * undone by the email that delivered it.
 *
 * A workspace serving its own hostname gets that hostname here. Everything else
 * falls back to the platform origin, which is what every existing link already
 * uses, so nothing that works today changes.
 */

interface OriginLookupClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

/** The platform's own origin, from configuration. Throws when unset. */
export function platformOrigin(): string {
  for (const candidate of [Deno.env.get('APP_URL'), Deno.env.get('WEB_URL')]) {
    if (!candidate?.trim()) continue
    try {
      const parsed = new URL(candidate)
      const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol === 'https:' || (local && parsed.protocol === 'http:')) {
        return parsed.origin
      }
    } catch {
      // Try the next configured application URL.
    }
  }
  throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The application URL is not configured')
}

/**
 * The origin for links this workspace sends to its clients. A workspace with a
 * serving primary domain gets it; everyone else gets the platform origin.
 *
 * A lookup failure falls back rather than throwing: an unbranded link that
 * works beats no invitation at all, and the alternative is an email path that
 * breaks the moment the domain table is unreachable.
 */
export async function workspaceLinkOrigin(
  admin: OriginLookupClient,
  workspaceId: string | null | undefined,
): Promise<string> {
  const fallback = platformOrigin()
  if (!workspaceId) return fallback
  try {
    const { data, error } = await admin.rpc('workspace_primary_domain_v1', {
      p_workspace_id: workspaceId,
    })
    if (error || typeof data !== 'string' || data.length === 0) return fallback
    const origin = new URL(`https://${data}`).origin
    return origin
  } catch {
    return fallback
  }
}
