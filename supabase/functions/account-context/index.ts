import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  type AccountMembershipRecord,
  type AccountWorkspaceRecord,
  toAccountMembershipDto,
  toAccountWorkspaceDto,
} from '../_shared/accountContextDto.ts'
import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseOptionalJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  workspaceCredentialIsFresh,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['GET', 'POST'] as const

const ACCOUNT_MEMBERSHIP_COLUMNS = [
  'id',
  'workspace_id',
  'email_normalized',
  'full_name',
  'avatar_path',
  'avatar_updated_at',
  'role',
  'status',
  'invite_expires_at',
  'password_change_required',
  'workspace_access_not_before_epoch',
].join(',')

const ACCOUNT_WORKSPACE_COLUMNS = [
  'id',
  'name',
  'slug',
  'status',
  'is_default',
  'logo_path',
  'logo_updated_at',
  'access_not_before_epoch',
].join(',')

type MembershipRow = AccountMembershipRecord & {
  email_normalized: string
  invite_expires_at: string | null
  password_change_required: boolean
  workspace_access_not_before_epoch: number | string
}

type WorkspaceRow = AccountWorkspaceRecord & {
  access_not_before_epoch: number | string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed')
    }

    if (req.method === 'POST') {
      const body = await parseOptionalJsonObject(req)
      requireOnlyKeys(body, [])
    }

    const authContext = await requireAuthenticatedUser(req)
    const { admin, user, email, platformAdmin } = authContext

    // Accepted/suspended memberships are permanently bound to the Auth user ID.
    const { data: userMemberships, error: userMembershipError } = await admin
      .from('workspace_memberships')
      .select(ACCOUNT_MEMBERSHIP_COLUMNS)
      .eq('user_id', user.id)
      .limit(2)

    if (userMembershipError) {
      throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
    }

    let memberships = (userMemberships ?? []) as unknown as MembershipRow[]

    // Pending invitations are discovered by email; accepted memberships remain
    // bound to user_id but fail closed if the Auth identity's email changes.
    if (memberships.length === 0) {
      const { data: pendingMemberships, error: pendingError } = await admin
        .from('workspace_memberships')
        .select(ACCOUNT_MEMBERSHIP_COLUMNS)
        .is('user_id', null)
        .eq('email_normalized', email)
        .eq('status', 'invited')
        .limit(2)

      if (pendingError) {
        throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
      }
      memberships = (pendingMemberships ?? []) as unknown as MembershipRow[]
    }

    if (memberships.some((membership) => membership.email_normalized !== email)) {
      throw new HttpError(
        403,
        'ACCOUNT_IDENTITY_MISMATCH',
        'The account identity changed and requires administrator review',
      )
    }

    if (memberships.length > 1) {
      throw new HttpError(409, 'MULTIPLE_WORKSPACES', 'The account has an ambiguous workspace assignment')
    }

    const membership = memberships[0] ?? null
    if (!membership) {
      return jsonResponse(req, METHODS, 200, {
        platform_admin: platformAdmin,
        state: 'no_membership',
        membership: null,
        workspace: null,
      })
    }

    const { data: workspaceData, error: workspaceError } = await admin
      .from('workspaces')
      .select(ACCOUNT_WORKSPACE_COLUMNS)
      .eq('id', membership.workspace_id)
      .maybeSingle()

    if (workspaceError || !workspaceData) {
      throw new HttpError(500, 'CONTEXT_UNAVAILABLE', 'Account context is unavailable')
    }
    const workspace = workspaceData as unknown as WorkspaceRow
    const workspaceAccessNotBefore = Number(workspace.access_not_before_epoch)
    const workspaceTokenIsFresh = Number.isSafeInteger(workspaceAccessNotBefore)
      && workspaceAccessNotBefore >= 0
      && authContext.tokenIssuedAt >= workspaceAccessNotBefore

    let state:
      | 'active'
      | 'pending'
      | 'password_change_required'
      | 'reauthentication_required'
      | 'expired'
      | 'suspended'
    if (membership.status === 'invited') {
      const expiresAt = membership.invite_expires_at
        ? new Date(membership.invite_expires_at).getTime()
        : Number.NaN
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || workspace.status !== 'active') {
        state = 'expired'
      } else if (!workspaceTokenIsFresh) {
        state = 'reauthentication_required'
      } else if (membership.password_change_required) {
        const accessNotBefore = Number(membership.workspace_access_not_before_epoch)
        const temporaryTokenIsFresh = Number.isSafeInteger(accessNotBefore)
          && accessNotBefore >= 0
          && authContext.tokenIssuedAt >= accessNotBefore
          && workspaceCredentialIsFresh(authContext)
        state = temporaryTokenIsFresh
          ? 'password_change_required'
          : 'reauthentication_required'
      } else {
        state = 'pending'
      }
    } else if (membership.status === 'suspended' || workspace.status === 'suspended') {
      state = 'suspended'
    } else if (membership.status === 'active' && workspace.status === 'active') {
      const accessNotBefore = Number(membership.workspace_access_not_before_epoch)
      const accessTokenIsFresh = Number.isSafeInteger(accessNotBefore)
        && accessNotBefore >= 0
        && authContext.tokenIssuedAt >= accessNotBefore
      state = accessTokenIsFresh
          && workspaceTokenIsFresh
          && workspaceCredentialIsFresh(authContext)
        ? 'active'
        : 'reauthentication_required'
    } else {
      throw new HttpError(500, 'INVALID_ACCOUNT_STATE', 'Account context is unavailable')
    }

    return jsonResponse(req, METHODS, 200, {
      platform_admin: platformAdmin,
      state,
      membership: toAccountMembershipDto(membership),
      workspace: toAccountWorkspaceDto(workspace),
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
