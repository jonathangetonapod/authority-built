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
import { hashPortalPassword, hashPortalSessionToken } from '../_shared/portalSecurity.ts'
import { safeWorkspaceBranding } from '../_shared/portalBranding.ts'
import { portalResetUrl, sendPortalResetEmail } from '../_shared/portalResetEmail.ts'
import { workspaceLinkOrigin } from '../_shared/workspaceOrigin.ts'

const METHODS = ['POST'] as const
const RESET_TOKEN_TTL_MINUTES = 60

function requestNetworkContext(req: Request): { ip: string; userAgent: string } {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').at(-1)
  const ip = (req.headers.get('cf-connecting-ip')
    || req.headers.get('x-real-ip')
    || forwardedFor
    || 'unknown').trim().slice(0, 120)
  const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 1024)
  return { ip, userAgent }
}

function normalizedEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).toLowerCase().trim()
  if (email.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'A valid email address is required')
  }
  return email
}

function requirePortalPassword(value: unknown): string {
  // Same policy as manage-client-portal-password: 8-256 chars, non-blank.
  if (typeof value !== 'string' || value.length < 8 || value.length > 256 || !value.trim()) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Password must be between 8 and 256 characters')
  }
  return value
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 2_048)
    const action = typeof body.action === 'string' ? body.action : ''
    const admin = createAdminClient()
    const { ip, userAgent } = requestNetworkContext(req)

    if (action === 'request') {
      requireOnlyKeys(body, ['action', 'email'])
      const email = normalizedEmail(body.email)

      const { data: reserved, error: reserveError } = await admin.rpc('reserve_client_portal_reset_request_v1', {
        p_email_normalized: email,
        p_ip_address: ip,
        p_user_agent: userAgent,
      })
      if (reserveError) {
        throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is temporarily unavailable')
      }
      if (!reserved) {
        throw new HttpError(429, 'RESET_RATE_LIMITED', 'Too many reset requests. Try again later.')
      }

      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id, name, email, portal_access_enabled, workspace:workspaces!clients_workspace_id_fkey(id, name, status, logo_path, logo_updated_at)')
        .eq('portal_email_normalized', email)
        .eq('portal_access_enabled', true)
        .maybeSingle()

      const workspace = client?.workspace as { id?: string; name?: string; status?: string } | null
      if (!clientError && client && workspace?.status === 'active') {
        const token = crypto.randomUUID()
        const tokenHash = await hashPortalSessionToken(token)
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

        const { error: upsertError } = await admin
          .from('client_portal_reset_tokens')
          .upsert({
            client_id: client.id,
            token_hash: tokenHash,
            expires_at: expiresAt,
            requested_ip: ip,
          }, { onConflict: 'client_id' })

        if (!upsertError) {
          const branding = await safeWorkspaceBranding(admin, workspace ?? {})
          const linkOrigin = await workspaceLinkOrigin(admin, workspace?.id ?? null)
          const delivery = await sendPortalResetEmail({
            workspaceName: branding?.name || workspace?.name || 'Your agency',
            recipientName: client.name || 'there',
            recipientEmail: email,
            url: portalResetUrl(token, linkOrigin),
          })
          if (delivery.status !== 'sent') {
            console.error('[Portal Password Reset] Delivery status:', delivery.status)
          }
        } else {
          console.error('[Portal Password Reset] Token storage failed')
        }
      }

      // Identical response whether or not the email matched a portal account.
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    if (action === 'complete') {
      requireOnlyKeys(body, ['action', 'token', 'password'])
      const token = requireString(body.token, 'token', { max: 100 })
      const password = requirePortalPassword(body.password)

      const tokenHash = await hashPortalSessionToken(token)
      const passwordHash = await hashPortalPassword(password)

      const { data: completed, error: completeError } = await admin.rpc('complete_client_portal_password_reset_v1', {
        p_token_hash: tokenHash,
        p_password_hash: passwordHash,
        p_ip_address: ip,
      })
      if (completeError) {
        throw new HttpError(503, 'RESET_UNAVAILABLE', 'Password reset is temporarily unavailable')
      }
      if (!completed) {
        throw new HttpError(400, 'RESET_INVALID', 'This reset link is invalid or has expired. Request a new one.')
      }

      return jsonResponse(req, METHODS, 200, { success: true })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password reset action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
