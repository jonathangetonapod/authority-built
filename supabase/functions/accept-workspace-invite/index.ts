import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireUuid,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    requireOnlyKeys(body, ['membership_id'])
    const membershipId = requireUuid(body.membership_id, 'membership_id')
    const { admin, user, email } = await requireAuthenticatedUser(req)

    if (user.app_metadata?.workspace_provisioning_method === 'admin_temporary_password') {
      throw new HttpError(
        409,
        'INITIAL_PASSWORD_CHANGE_REQUIRED',
        'Use the initial password change flow for this account',
      )
    }

    // The service-role-only RPC locks and validates the invitation, including
    // status, expiry, email ownership and idempotent re-acceptance by this user.
    const { data, error } = await admin.rpc('accept_workspace_invite', {
      p_membership_id: membershipId,
      p_user_id: user.id,
      p_email: email,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('expired')) {
        throw new HttpError(410, 'INVITE_EXPIRED', 'This invitation has expired')
      }
      if (message.includes('email')) {
        throw new HttpError(403, 'INVITE_EMAIL_MISMATCH', 'This invitation belongs to another account')
      }
      if (message.includes('password')) {
        throw new HttpError(409, 'PASSWORD_SETUP_REQUIRED', 'Create a password before accepting this invitation')
      }
      if (message.includes('not found')) {
        throw new HttpError(404, 'INVITE_NOT_FOUND', 'Invitation not found')
      }
      if (message.includes('suspend')) {
        throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended')
      }
      if (message.includes('pending') || message.includes('status')) {
        throw new HttpError(409, 'INVITE_NOT_PENDING', 'This invitation cannot be accepted')
      }
      // Both of these are refusals the RPC raises deliberately, and neither
      // matched a branch above — so a conflict the caller can act on was
      // arriving as an opaque 500.
      if (message.includes('already exists')) {
        throw new HttpError(
          409,
          'MEMBERSHIP_ALREADY_EXISTS',
          'This email already belongs to a workspace. Sign in instead of accepting again',
        )
      }
      if (message.includes('different auth user')) {
        throw new HttpError(
          409,
          'INVITE_IDENTITY_MISMATCH',
          'This invitation was issued to a different sign-in. Sign in with the address it was sent to',
        )
      }
      throw new HttpError(500, 'INVITE_ACCEPT_FAILED', 'The invitation could not be accepted')
    }

    const membership = Array.isArray(data) ? (data[0] ?? null) : data
    if (!membership) {
      throw new HttpError(500, 'INVITE_ACCEPT_FAILED', 'The invitation could not be accepted')
    }

    return jsonResponse(req, METHODS, 200, {
      success: true,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
