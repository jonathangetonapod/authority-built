import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requireString,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'

/**
 * Turns a hostname into the workspace serving it and the brand a client should
 * see on it.
 *
 * Unauthenticated by necessity: this is the first call a stranger's browser
 * makes on a tenant domain, before any slug or token is in play. It is
 * therefore deliberately thin — it answers with public branding a client is
 * about to be shown anyway, and nothing else. No client list, no counts, no
 * internal identifiers beyond the workspace id the public pages already carry
 * in their own responses.
 *
 * An unknown hostname is not an error. The platform's own origin resolves to
 * nothing, and the app renders its own brand.
 */
const METHODS = ['POST'] as const
const MAX_HOSTNAME_LENGTH = 253

function normalizeHostname(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  // A Host header can carry a port, and a caller may paste a whole URL. Take
  // the hostname out of either rather than refusing something recoverable.
  const withoutScheme = trimmed.replace(/^https?:\/\//u, '')
  const hostname = withoutScheme.split('/')[0].split(':')[0].replace(/\.$/u, '')
  if (!hostname || hostname.length > MAX_HOSTNAME_LENGTH) return null
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u.test(hostname)) return null
  return hostname
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const admin = createAdminClient()
    await ensureWorkspaceOriginAllowed(admin, req)

    const body = await parseJsonObject(req)
    requireOnlyKeys(body, ['hostname'])
    const hostname = normalizeHostname(
      requireString(body.hostname, 'hostname', { max: MAX_HOSTNAME_LENGTH + 16 }),
    )
    if (!hostname) {
      // A malformed host is the same answer as an unrecognized one: this is
      // not the place to teach a caller what a hostname looks like.
      return jsonResponse(req, METHODS, 200, { success: true, workspace: null })
    }

    const { data, error } = await admin.rpc('resolve_workspace_domain_v1', {
      p_hostname: hostname,
    })
    if (error) {
      throw new HttpError(503, 'DOMAIN_LOOKUP_UNAVAILABLE', 'The domain could not be resolved')
    }
    if (!data || typeof data !== 'object') {
      return jsonResponse(req, METHODS, 200, { success: true, workspace: null })
    }

    const row = data as Record<string, unknown>
    // The response is echoed onto a page a stranger reads, so every field is
    // shaped here rather than forwarded.
    return jsonResponse(req, METHODS, 200, {
      success: true,
      workspace: {
        workspace_id: String(row.workspace_id ?? ''),
        hostname,
        workspace_name: typeof row.workspace_name === 'string' ? row.workspace_name.slice(0, 120) : '',
        client_brand_name: typeof row.client_brand_name === 'string'
          ? row.client_brand_name.slice(0, 120)
          : '',
        client_brand_primary_color: typeof row.client_brand_primary_color === 'string'
          && /^#[0-9A-Fa-f]{6}$/u.test(row.client_brand_primary_color)
          ? row.client_brand_primary_color.toUpperCase()
          : '#0D1B2A',
        client_brand_accent_color: typeof row.client_brand_accent_color === 'string'
          && /^#[0-9A-Fa-f]{6}$/u.test(row.client_brand_accent_color)
          ? row.client_brand_accent_color.toUpperCase()
          : '#C7794F',
        logo_path: typeof row.logo_path === 'string' ? row.logo_path.slice(0, 300) : null,
        logo_updated_at: typeof row.logo_updated_at === 'string' ? row.logo_updated_at : null,
        booking_embed_url: typeof row.booking_embed_url === 'string'
          && row.booking_embed_url.startsWith('https://')
          ? row.booking_embed_url.slice(0, 500)
          : null,
      },
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
