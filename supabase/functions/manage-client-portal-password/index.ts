import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalPassword, hashPortalSessionToken } from '../_shared/portalSecurity.ts'
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import { safeWorkspaceBranding } from '../_shared/portalBranding.ts'
import { portalLoginUrl, portalResetUrl, sendPortalInviteEmail } from '../_shared/portalResetEmail.ts'
import { workspaceLinkOrigin } from '../_shared/workspaceOrigin.ts'

const METHODS = ['POST'] as const
const PASSWORD_MANAGER_ROLES = new Set(['owner', 'platform_admin'])
const INVITE_TOKEN_TTL_DAYS = 7

function requirePassword(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 8
    || value.length > 256
    || value.trim().length === 0
  ) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'password must be between 8 and 256 characters')
  }
  // Passwords are opaque credentials. Preserve intentional leading/trailing
  // spaces instead of applying the trimming used for ordinary text fields.
  return value
}

function actorLabel(user: {
  email?: string
  user_metadata?: Record<string, unknown>
}): string {
  const fullName = user.user_metadata?.full_name
  if (typeof fullName === 'string' && fullName.trim() && fullName.trim().length <= 120) {
    return fullName.trim()
  }
  const email = user.email?.trim().toLowerCase()
  return email && email.length <= 120 ? email : 'Workspace owner'
}

function passwordMutationError(
  error: { code?: string; details?: string; hint?: string; message?: string } | null,
  action: 'set' | 'clear',
): never {
  const code = error?.code?.toUpperCase() ?? ''
  const context = [error?.message, error?.details, error?.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  if (code === 'P0002' || context.includes('not found')) {
    throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
  }
  if (
    code === '42501'
    || context.includes('owner access')
    || context.includes('actor role hierarchy')
  ) {
    throw new HttpError(403, 'WORKSPACE_OWNER_REQUIRED', 'Workspace owner access is required')
  }
  if (
    code === '23505'
    && context.includes('clients_one_enabled_portal_email_idx')
  ) {
    throw new HttpError(
      409,
      'PORTAL_EMAIL_IN_USE',
      'Another enabled client portal already uses this email',
    )
  }
  if (
    code === '23514'
    && context.includes('clients_portal_access_email_check')
  ) {
    throw new HttpError(
      409,
      'CLIENT_EMAIL_REQUIRED',
      'Add a client email before enabling portal access',
    )
  }
  if (code.startsWith('PGRST')) {
    throw new HttpError(
      503,
      'PASSWORD_BACKEND_UNAVAILABLE',
      'Portal password service is updating. Try again in a moment',
    )
  }

  // Keep database details private while leaving a safe operational signal in
  // function logs for future diagnosis.
  console.error('Client portal password mutation failed', {
    action,
    database_code: code || 'unknown',
  })
  throw new HttpError(
    500,
    action === 'set' ? 'PASSWORD_SET_FAILED' : 'PASSWORD_CLEAR_FAILED',
    action === 'set'
      ? 'Portal password could not be set'
      : 'Portal password could not be cleared',
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = body.action
    const clientId = requireUuid(body.client_id, 'client_id')
    const tenantScoped = Object.hasOwn(body, 'workspace_id')

    if (tenantScoped) {
      const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
      const authContext = await requireAuthenticatedUser(req)
      if (!workspaceCredentialIsFresh(authContext)) {
        throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
      }
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!PASSWORD_MANAGER_ROLES.has(access.role)) {
        throw new HttpError(403, 'WORKSPACE_OWNER_REQUIRED', 'Workspace owner access is required')
      }
      const { admin, tokenIssuedAt, user } = authContext
      // Portal links carry the agency's own hostname when it has one.
      const linkOrigin = await workspaceLinkOrigin(admin, workspaceId)

      if (action === 'set') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'password'])
        const passwordHash = await hashPortalPassword(requirePassword(body.password))
        const { error } = await admin.rpc('manage_client_portal_password', {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_password_hash: passwordHash,
          p_set_by: actorLabel(user),
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        })
        if (error) passwordMutationError(error, 'set')
        return jsonResponse(req, METHODS, 200, { success: true, configured: true })
      }

      if (action === 'clear') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
        const { error } = await admin.rpc('manage_client_portal_password', {
          p_client_id: clientId,
          p_workspace_id: workspaceId,
          p_password_hash: null,
          p_set_by: null,
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        })
        if (error) passwordMutationError(error, 'clear')
        return jsonResponse(req, METHODS, 200, { success: true, configured: false })
      }

      if (action === 'invite') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])

        const { data: client, error: clientError } = await admin
          .from('clients')
          .select('id, name, email, portal_access_enabled, dashboard_slug, workspace:workspaces!clients_workspace_id_fkey(id, name, status, logo_path, logo_updated_at)')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()
        if (clientError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The invitation could not be prepared')
        }
        if (!client) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found in this workspace')
        }
        if (typeof client.email !== 'string' || !client.email.trim()) {
          throw new HttpError(409, 'CLIENT_EMAIL_REQUIRED', 'Add a client email before sending a portal invitation')
        }

        // A disabled portal is enabled with a random placeholder credential
        // through the audited owner-scoped RPC; the client immediately
        // replaces it via the set-password link, so it is never revealed.
        if (!client.portal_access_enabled) {
          const placeholder = crypto.randomUUID() + crypto.randomUUID()
          const placeholderHash = await hashPortalPassword(placeholder)
          const { error: enableError } = await admin.rpc('manage_client_portal_password', {
            p_client_id: clientId,
            p_workspace_id: workspaceId,
            p_password_hash: placeholderHash,
            p_set_by: actorLabel(user),
            p_actor_user_id: user.id,
            p_token_issued_at: tokenIssuedAt,
          })
          if (enableError) passwordMutationError(enableError, 'set')
        }

        const token = crypto.randomUUID()
        const tokenHash = await hashPortalSessionToken(token)
        const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 86_400_000).toISOString()
        const { error: tokenError } = await admin
          .from('client_portal_reset_tokens')
          .upsert({
            client_id: clientId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            requested_ip: null,
          }, { onConflict: 'client_id' })
        if (tokenError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The invitation could not be prepared')
        }

        const workspaceRecord = (Array.isArray(client.workspace) ? client.workspace[0] : client.workspace) ?? {}
        const branding = await safeWorkspaceBranding(admin, workspaceRecord as Record<string, unknown>)
        const workspaceName = branding?.name
          || (typeof (workspaceRecord as { name?: string }).name === 'string'
            ? (workspaceRecord as { name: string }).name
            : 'Your agency')
        const delivery = await sendPortalInviteEmail({
          workspaceName,
          recipientName: typeof client.name === 'string' && client.name.trim() ? client.name : 'there',
          recipientEmail: client.email.trim().toLowerCase(),
          url: portalResetUrl(token, linkOrigin),
          loginUrl: portalLoginUrl(typeof client.dashboard_slug === 'string' ? client.dashboard_slug : null, linkOrigin),
        })

        if (delivery.status === 'sent') {
          const { error: stampError } = await admin
            .from('clients')
            .update({ portal_invitation_sent_at: new Date().toISOString() })
            .eq('id', clientId)
            .eq('workspace_id', workspaceId)
          if (stampError) console.error('[Manage Client Portal Password] Invitation stamp failed')
        }

        await writeAudit(admin, {
          workspaceId,
          actorUserId: user.id,
          action: 'client.portal_invite.sent',
          entityType: 'client',
          entityId: clientId,
          metadata: { delivery_status: delivery.status },
        })

        return jsonResponse(req, METHODS, 200, { success: true, delivery: { status: delivery.status } })
      }

      if (action === 'setup-link') {
        // Same capability as the invitation, minus the email: the owner gets
        // the set-password URL to share on their own channels.
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])

        const { data: client, error: clientError } = await admin
          .from('clients')
          .select('id, name, email, portal_access_enabled, dashboard_slug')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()
        if (clientError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The setup link could not be prepared')
        }
        if (!client) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found in this workspace')
        }
        if (typeof client.email !== 'string' || !client.email.trim()) {
          throw new HttpError(409, 'CLIENT_EMAIL_REQUIRED', 'Add a client email before creating a setup link')
        }

        if (!client.portal_access_enabled) {
          const placeholder = crypto.randomUUID() + crypto.randomUUID()
          const placeholderHash = await hashPortalPassword(placeholder)
          const { error: enableError } = await admin.rpc('manage_client_portal_password', {
            p_client_id: clientId,
            p_workspace_id: workspaceId,
            p_password_hash: placeholderHash,
            p_set_by: actorLabel(user),
            p_actor_user_id: user.id,
            p_token_issued_at: tokenIssuedAt,
          })
          if (enableError) passwordMutationError(enableError, 'set')
        }

        const token = crypto.randomUUID()
        const tokenHash = await hashPortalSessionToken(token)
        const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_DAYS * 86_400_000).toISOString()
        const { error: tokenError } = await admin
          .from('client_portal_reset_tokens')
          .upsert({
            client_id: clientId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            requested_ip: null,
          }, { onConflict: 'client_id' })
        if (tokenError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The setup link could not be prepared')
        }

        await writeAudit(admin, {
          workspaceId,
          actorUserId: user.id,
          action: 'client.portal_setup_link.issued',
          entityType: 'client',
          entityId: clientId,
          metadata: { expires_at: expiresAt },
        })

        return jsonResponse(req, METHODS, 200, {
          success: true,
          url: portalResetUrl(token, linkOrigin),
          login_url: portalLoginUrl(typeof client.dashboard_slug === 'string' ? client.dashboard_slug : null, linkOrigin),
          expires_at: expiresAt,
        })
      }

      if (action === 'preview-session') {
        // Owner opens the client's portal exactly as the client sees it. The
        // session is real (validated server-side like any login session) but
        // short-lived and audited.
        requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])

        const { data: client, error: clientError } = await admin
          .from('clients')
          .select('id, name, email, photo_url, dashboard_slug, portal_access_enabled')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()
        if (clientError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The preview session could not be created')
        }
        if (!client) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found in this workspace')
        }
        if (!client.portal_access_enabled) {
          throw new HttpError(409, 'PORTAL_DISABLED', 'Enable the client portal before previewing it')
        }

        const sessionToken = crypto.randomUUID()
        const sessionTokenHash = await hashPortalSessionToken(sessionToken)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        const { error: sessionError } = await admin
          .from('client_portal_sessions')
          .insert({
            client_id: clientId,
            session_token: sessionTokenHash,
            expires_at: expiresAt,
            user_agent: `workspace-preview:${actorLabel(user)}`.slice(0, 1024),
          })
        if (sessionError) {
          throw new HttpError(503, 'PASSWORD_BACKEND_UNAVAILABLE', 'The preview session could not be created')
        }

        await writeAudit(admin, {
          workspaceId,
          actorUserId: user.id,
          action: 'client.portal_preview.started',
          entityType: 'client',
          entityId: clientId,
          metadata: { expires_at: expiresAt },
        })

        return jsonResponse(req, METHODS, 200, {
          success: true,
          session_token: sessionToken,
          expires_at: expiresAt,
          client: {
            id: client.id,
            name: client.name,
            email: client.email,
            photo_url: client.photo_url ?? null,
            dashboard_slug: client.dashboard_slug ?? null,
          },
        })
      }

      throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password action')
    }

    // Compatibility path for the legacy platform-only client screen. Tenant
    // callers must always supply workspace_id and pass the owner-scoped RPC.
    const { admin, user } = await requirePlatformAdmin(req)
    if (action === 'set') {
      requireOnlyKeys(body, ['action', 'client_id', 'password', 'set_by'])
      const passwordHash = await hashPortalPassword(requirePassword(body.password))
      const setBy = requireString(body.set_by ?? 'Admin', 'set_by', { max: 120 })
      const { error } = await admin.rpc('manage_client_portal_password', {
        p_client_id: clientId,
        p_password_hash: passwordHash,
        p_set_by: setBy,
        p_actor_user_id: user.id,
      })
      if (error) passwordMutationError(error, 'set')
      return jsonResponse(req, METHODS, 200, { success: true, configured: true })
    }

    if (action === 'clear') {
      requireOnlyKeys(body, ['action', 'client_id'])
      const { error } = await admin.rpc('manage_client_portal_password', {
        p_client_id: clientId,
        p_password_hash: null,
        p_set_by: null,
        p_actor_user_id: user.id,
      })
      if (error) passwordMutationError(error, 'clear')
      return jsonResponse(req, METHODS, 200, { success: true, configured: false })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown portal password action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
