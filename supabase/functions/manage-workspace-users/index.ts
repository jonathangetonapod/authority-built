import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  inviteRedirectUrl,
  jsonResponse,
  MEMBERSHIP_COLUMNS,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireUuid,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

type MembershipRow = Record<string, unknown> & {
  id: string
  workspace_id: string
  user_id: string | null
  email_normalized: string
  full_name: string | null
  role: string
  status: string
  provisioning_method: string
  password_change_required: boolean
  created_at: string
}

type LifecycleAction =
  | 'suspend'
  | 'reactivate'
  | 'reconcile_active'
  | 'reconcile_suspended'

type LifecyclePendingRow = {
  membership_id: string
  review_after: string
}

type InviteCleanupConflictRow = {
  membership_id: string
  has_newer_membership: boolean
}

type InvitePendingRow = {
  membership_id: string
  claim_kind: 'deliver' | 'revoke_cleanup'
  review_after: string
}

type CredentialPendingRow = {
  membership_id: string
  claim_kind:
    | 'temporary_password_rotation'
    | 'initial_password_change'
    | 'staff_password_reset'
  review_after: string
}

type WorkspaceRow = Record<string, unknown> & {
  id: string
  name: string
  slug: string
  status: string
}

function userDto(row: MembershipRow) {
  const { email_normalized, ...membership } = row
  return { ...membership, email: email_normalized }
}

function membershipFromRpc(data: unknown): MembershipRow | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' ? value as MembershipRow : null
}

function provisioningFromRpc(data: unknown): {
  membership: MembershipRow
  workspace: WorkspaceRow
} | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data as { membership?: unknown; workspace?: unknown }
  if (!value.membership || typeof value.membership !== 'object') return null
  if (!value.workspace || typeof value.workspace !== 'object') return null
  return {
    membership: value.membership as MembershipRow,
    workspace: value.workspace as WorkspaceRow,
  }
}

async function beginInviteProvisioning(
  admin: Parameters<typeof writeAudit>[0],
  input: {
    email: string
    fullName: string | null
    workspaceName: string
    workspaceSlug: string
    actorUserId: string
  },
): Promise<{ membership: MembershipRow; workspace: WorkspaceRow }> {
  const { data, error } = await admin.rpc('begin_workspace_invite', {
    p_email: input.email,
    p_full_name: input.fullName,
    p_workspace_name: input.workspaceName,
    p_workspace_slug: input.workspaceSlug,
    p_actor_user_id: input.actorUserId,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('platform administrator')) {
      throw new HttpError(409, 'PLATFORM_ADMIN_EXISTS', 'This email is already a platform administrator')
    }
    if (message.includes('already exists') || error.code === '23505') {
      throw new HttpError(409, 'ACCOUNT_ALREADY_INVITED', 'This email already has workspace access')
    }
    if (message.includes('invalid')) {
      throw new HttpError(400, 'INVALID_INVITE', 'The invitation fields are invalid')
    }
    throw new HttpError(500, 'INVITE_PROVISION_FAILED', 'The invitation could not be provisioned')
  }

  const provisioning = provisioningFromRpc(data)
  if (!provisioning) {
    throw new HttpError(500, 'INVITE_PROVISION_FAILED', 'The invitation could not be provisioned')
  }
  return provisioning
}

async function finalizeInviteProvisioning(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  actorUserId: string,
  lockToken: string,
  authUserId: string,
): Promise<MembershipRow | null> {
  let notReadyResponses = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('finalize_workspace_invite', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
      p_auth_user_id: authUserId,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('auth identity is not ready')) {
      notReadyResponses += 1
      continue
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
    }
    if (message.includes('not provisioning')) {
      throw new HttpError(409, 'INVITE_NOT_PROVISIONING', 'This invitation cannot be retried')
    }
    if (message.includes('unsafe') || message.includes('platform administrator')) {
      throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invitation identity requires manual review')
    }
    if (message.includes('claim is required') || message.includes('delivery is busy') || message.includes('claim was lost')) {
      throw new HttpError(
        409,
        'INVITE_DELIVERY_CLAIM_LOST',
        'The invitation delivery claim requires operator review',
      )
    }
  }

  if (notReadyResponses === 2) return null
  throw new HttpError(
    503,
    'INVITE_FINALIZE_UNCERTAIN',
    'The invitation result is uncertain and requires operator review',
  )
}

async function claimInviteDelivery(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('claim_workspace_invite_delivery', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('delivery is busy')) {
      throw new HttpError(
        409,
        'INVITE_DELIVERY_BUSY',
        'Another invitation delivery is still running; review it before retrying',
      )
    }
    if (message.includes('not provisioning')) {
      throw new HttpError(409, 'INVITE_NOT_PROVISIONING', 'This invitation cannot be delivered')
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
    }
    if (message.includes('platform administrator')) {
      throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required')
    }
    if (message.includes('invalid') || message.includes('reused inconsistently')) {
      throw new HttpError(400, 'INVALID_INVITE_DELIVERY', 'The invitation delivery request is invalid')
    }
    // Retry once with the same token. If the first RPC committed but its
    // response was lost, the database returns the same non-stealable claim.
  }

  throw new HttpError(
    503,
    'INVITE_DELIVERY_CLAIM_UNCERTAIN',
    'The invitation delivery claim is uncertain and requires operator review',
  )
}

async function releaseInviteDeliveryClaim(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  lockToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('release_workspace_invite_delivery_claim', {
      p_membership_id: membershipId,
      p_lock_token: lockToken,
    })
    if (!error && data === true) return
    if (!error && data === false) {
      throw new HttpError(
        409,
        'INVITE_DELIVERY_CLAIM_LOST',
        'The invitation delivery claim requires operator review',
      )
    }
    if (error?.message.toLowerCase().includes('historical workspace invitation is superseded')) {
      throw new HttpError(
        409,
        'INVITE_SUPERSEDED',
        'A newer workspace account exists for this email; do not clean up the historical invitation',
      )
    }
  }

  throw new HttpError(
    503,
    'INVITE_DELIVERY_RELEASE_FAILED',
    'Invitation cleanup is complete, but the delivery claim requires operator review',
  )
}

async function findInviteAuthUserId(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  actorUserId: string,
  lockToken: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('find_workspace_invite_auth_user', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    if (!error) return typeof data === 'string' && data.length > 0 ? data : null

    const message = error.message.toLowerCase()
    if (message.includes('ambiguous') || message.includes('unsafe') || message.includes('platform administrator')) {
      throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invitation identity requires operator review')
    }
    if (message.includes('delivery is busy') || message.includes('claim is required')) {
      throw new HttpError(409, 'INVITE_DELIVERY_CLAIM_LOST', 'The invitation delivery claim requires operator review')
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
    }
    if (message.includes('historical workspace invitation is superseded')) {
      throw new HttpError(
        409,
        'INVITE_SUPERSEDED',
        'A newer workspace account exists for this email; do not clean up the historical invitation',
      )
    }
    // A read-only lookup can be retried with the same token without changing
    // either the claim timestamp or the scoped Auth candidate set.
  }

  throw new HttpError(503, 'INVITE_RECONCILIATION_FAILED', 'The invitation identity could not be reconciled')
}

async function requireSafeProviderInviteIdentity(
  admin: Parameters<typeof writeAudit>[0],
  user: {
    email?: string
    created_at?: string
    invited_at?: string
    confirmed_at?: string
    last_sign_in_at?: string
    user_metadata?: Record<string, unknown>
  },
  membership: MembershipRow,
): Promise<void> {
  const email = user.email?.trim().toLowerCase()
  const createdAt = Date.parse(user.created_at ?? '')
  const invitedAt = Date.parse(user.invited_at ?? '')
  const membershipCreatedAt = Date.parse(membership.created_at)
  const metadata = user.user_metadata ?? {}

  if (
    email !== membership.email_normalized
    || !Number.isFinite(createdAt)
    || !Number.isFinite(invitedAt)
    || !Number.isFinite(membershipCreatedAt)
    || createdAt < membershipCreatedAt - 60_000
    || invitedAt < membershipCreatedAt - 60_000
    || Boolean(user.confirmed_at)
    || Boolean(user.last_sign_in_at)
    || metadata.workspace_id !== membership.workspace_id
    || metadata.workspace_membership_id !== membership.id
  ) {
    throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invitation identity requires operator review')
  }

  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: email },
  )
  if (protectedAdminError) {
    throw new HttpError(503, 'ACCOUNT_PROTECTION_UNAVAILABLE', 'The account protection check failed')
  }
  if (protectedAdmin === true) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
  }
}

async function deliverProvisionedInvite(
  admin: Parameters<typeof writeAudit>[0],
  membership: MembershipRow,
  workspace: WorkspaceRow,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  // Resolve and validate configuration before acquiring the durable provider
  // claim. A provisioning row remains safely retryable when configuration is
  // missing, without stranding a claim for a provider call that never began.
  const redirectTo = inviteRedirectUrl()

  // The provider is never called from a stale in-memory provisioning object.
  // This database claim rechecks the locked membership immediately before the
  // cross-system delivery and serializes every retry for this membership.
  const claimedMembership = await claimInviteDelivery(
    admin,
    membership.id,
    actorUserId,
    lockToken,
  )
  if (workspace.id !== claimedMembership.workspace_id) {
    await releaseInviteDeliveryClaim(admin, claimedMembership.id, lockToken)
    throw new HttpError(409, 'INVITE_WORKSPACE_MISMATCH', 'The invitation workspace requires manual review')
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    claimedMembership.email_normalized,
    {
      redirectTo,
      data: {
        full_name: claimedMembership.full_name,
        workspace_id: claimedMembership.workspace_id,
        workspace_membership_id: claimedMembership.id,
        // The invitation email can only say the workspace name if it is carried
        // here; the template has nothing else to read. Safe to add because the
        // workspace was matched against the claimed membership above, and the
        // identity check that follows only ever asserts on the ids.
        workspace_name: workspace.name,
      },
    },
  )

  if (inviteError || !invited.user) {
    // Never treat an ambiguous provider error as delivered. Remove a matching
    // invite identity so any possibly emailed link becomes invalid, while the
    // database remains blocked in provisioning for an explicit retry.
    const authUserId = await findInviteAuthUserId(
      admin,
      claimedMembership.id,
      actorUserId,
      lockToken,
    )
    if (authUserId) {
      await deleteAuthUserIfPresent(
        admin,
        authUserId,
        claimedMembership.email_normalized,
        'INVITE_AMBIGUOUS_CLEANUP_FAILED',
        'Invitation delivery is uncertain and Auth cleanup must be retried',
      )
      await releaseInviteDeliveryClaim(admin, claimedMembership.id, lockToken)
      throw new HttpError(
        503,
        'INVITE_DELIVERY_RETRY_REQUIRED',
        'An uncertain invitation was invalidated. Retry the provisioning record to send a fresh link',
      )
    }
    // A provider-declared existing account is a known no-delivery outcome, but
    // release still asks PostgreSQL to prove that no scoped/recent invited Auth
    // identity exists. Every ambiguous provider/no-user result keeps the claim
    // for operator reconciliation; a fresh request may not steal it.
    if (inviteError?.message.toLowerCase().includes('registered')) {
      await releaseInviteDeliveryClaim(admin, claimedMembership.id, lockToken)
      throw new HttpError(
        409,
        'AUTH_ACCOUNT_EXISTS',
        'This email has an unrelated account; revoke the provisioning record or review it manually',
      )
    }
    throw new HttpError(
      503,
      'INVITE_DELIVERY_UNCERTAIN',
      'Invitation delivery is uncertain. The account remains blocked for operator review',
    )
  }

  // Validate the provider-returned user before adding trusted app metadata or
  // making that exact Auth ID eligible for cleanup. A surprising provider
  // response therefore cannot turn an unrelated account into a delete target.
  await requireSafeProviderInviteIdentity(admin, invited.user, claimedMembership)

  // Only the service-role admin API can write app_metadata. Finalization
  // therefore does not trust the user-editable metadata used for cleanup.
  const { error: markerError } = await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: {
      ...invited.user.app_metadata,
      workspace_id: claimedMembership.workspace_id,
      workspace_membership_id: claimedMembership.id,
    },
  })

  let finalized: MembershipRow | null
  let finalizationError: HttpError | null = null
  try {
    finalized = await finalizeInviteProvisioning(
      admin,
      claimedMembership.id,
      actorUserId,
      lockToken,
      invited.user.id,
    )
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    if (
      error.code === 'INVITE_FINALIZE_UNCERTAIN'
      || error.code === 'INVITE_DELIVERY_CLAIM_LOST'
      || error.code === 'INVITE_IDENTITY_UNSAFE'
    ) {
      // The database may already be finalized, another token may own recovery,
      // or the identity may be protected. Do not delete or release anything.
      throw error
    }
    finalizationError = error
    finalized = null
  }
  if (finalized) return finalized

  // A failed/ambiguous app-metadata write or DB finalization must not leave a
  // live link outside the fail-closed provisioning state.
  await deleteAuthUserIfPresent(
    admin,
    invited.user.id,
    claimedMembership.email_normalized,
    'INVITE_FINALIZE_CLEANUP_FAILED',
    'The invitation is blocked, but Auth cleanup must be retried',
  )
  await releaseInviteDeliveryClaim(admin, claimedMembership.id, lockToken)

  if (finalizationError?.code === 'INVITE_NOT_PROVISIONING') {
    throw new HttpError(
      409,
      'INVITE_REVOKED_DURING_DELIVERY',
      'The invitation was revoked while delivery was running',
    )
  }
  if (finalizationError) throw finalizationError

  throw new HttpError(
    503,
    markerError ? 'INVITE_MARKER_FAILED' : 'INVITE_FINALIZE_FAILED',
    'The invitation was invalidated before activation. Retry the provisioning record to send a fresh link',
  )
}

async function revokeWorkspaceInvite(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('revoke_workspace_invite', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
    }
    if (message.includes('platform administrator') || message.includes('default workspace')) {
      throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
    }
    if (message.includes('invite delivery is busy')) {
      throw new HttpError(
        409,
        'INVITE_DELIVERY_BUSY',
        'Invitation delivery is still running; retry revocation after it is reconciled',
      )
    }
    if (message.includes('not pending')) {
      throw new HttpError(409, 'INVITE_NOT_PENDING', 'Only a pending invitation can be revoked')
    }
    if (message.includes('historical workspace invitation is superseded')) {
      throw new HttpError(
        409,
        'INVITE_SUPERSEDED',
        'A newer workspace account exists for this email; do not clean up the historical invitation',
      )
    }
    if (message.includes('invalid') || message.includes('reused inconsistently')) {
      throw new HttpError(400, 'INVALID_INVITE_REVOCATION', 'The invitation revocation request is invalid')
    }
    if (message.includes('inconsistent')) {
      throw new HttpError(409, 'INVITE_REVOCATION_INCONSISTENT', 'The invitation requires operator review')
    }
    // Retry once with the same token so a committed revocation whose response
    // was lost returns the original non-stealable cleanup claim unchanged.
  }

  throw new HttpError(
    503,
    'INVITE_REVOCATION_UNCERTAIN',
    'The invitation was not changed again; its revocation result requires operator review',
  )
}

async function claimMembershipLifecycle(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  action: LifecycleAction,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('claim_workspace_auth_lifecycle', {
      p_membership_id: membershipId,
      p_action: action,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })

    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('lifecycle is busy')) {
      throw new HttpError(
        409,
        'ACCOUNT_LIFECYCLE_BUSY',
        'Auth reconciliation is pending and requires operator review',
      )
    }
    if (message.includes('identity mismatch')) {
      throw new HttpError(
        409,
        'ACCOUNT_IDENTITY_MISMATCH',
        'The account identity changed and requires manual review',
      )
    }
    if (message.includes('platform administrator') || message.includes('default workspace')) {
      throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
    }
    if (message.includes('status no longer matches')) {
      throw new HttpError(
        409,
        'ACCOUNT_STATE_CHANGED',
        'The account status changed. Refresh the user list before continuing',
      )
    }
    if (message.includes('not active') || message.includes('not suspended')) {
      throw new HttpError(
        409,
        message.includes('not active') ? 'ACCOUNT_NOT_ACTIVE' : 'ACCOUNT_NOT_SUSPENDED',
        message.includes('not active')
          ? 'Only an active account can be suspended'
          : 'Only a suspended account can be reactivated',
      )
    }
    if (message.includes('claim is inconsistent')) {
      throw new HttpError(
        409,
        'ACCOUNT_LIFECYCLE_INCONSISTENT',
        'The account reconciliation requires operator review',
      )
    }
    if (message.includes('invalid') || message.includes('reused inconsistently')) {
      throw new HttpError(400, 'INVALID_LIFECYCLE_REQUEST', 'The account change request is invalid')
    }
    // Retry once with the same token. If the first RPC committed but its
    // response was lost, the database returns the existing idempotent claim.
  }

  throw new HttpError(
    503,
    'ACCOUNT_LIFECYCLE_UNCERTAIN',
    'The account change result is uncertain and requires operator review',
  )
}

async function completeMembershipLifecycle(
  admin: Parameters<typeof writeAudit>[0],
  membershipId: string,
  action: LifecycleAction,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('complete_workspace_auth_lifecycle', {
      p_membership_id: membershipId,
      p_action: action,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('lifecycle is busy')) {
      throw new HttpError(
        409,
        'ACCOUNT_LIFECYCLE_BUSY',
        'Another Auth reconciliation owns this account and requires operator review',
      )
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
    }
    if (message.includes('invalid') || message.includes('reused inconsistently')) {
      throw new HttpError(400, 'INVALID_LIFECYCLE_REQUEST', 'The account change request is invalid')
    }
    if (
      message.includes('claim is required')
      || message.includes('claim was lost')
      || message.includes('status changed')
    ) {
      throw new HttpError(
        409,
        'ACCOUNT_LIFECYCLE_COMPLETION_CONFLICT',
        'Auth was updated, but completion requires operator review',
      )
    }
    // Retry once with the same token. If completion committed but its response
    // was lost, the audit fingerprint provides token-bound idempotency.
  }

  throw new HttpError(
    503,
    'ACCOUNT_LIFECYCLE_COMPLETION_UNCERTAIN',
    'Auth was updated, but completion is uncertain and requires operator review',
  )
}

async function deleteAuthUserIfPresent(
  admin: Parameters<typeof writeAudit>[0],
  userId: string,
  expectedEmail: string,
  code: string,
  message: string,
): Promise<void> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError) {
    const missing = lookupError.status === 404 || lookupError.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, code, message)
  }
  if (!data.user) return

  if (data.user.email?.trim().toLowerCase() !== expectedEmail) {
    throw new HttpError(409, code, message)
  }

  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: data.user.email },
  )
  if (protectedAdminError) {
    throw new HttpError(503, code, message)
  }
  if (protectedAdmin === true) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    const missing = deleteError.status === 404 || deleteError.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, code, message)
  }
}

async function requireSafeAuthIdentity(
  admin: Parameters<typeof writeAudit>[0],
  row: MembershipRow,
): Promise<string | null> {
  if (!row.user_id) return null

  const { data, error } = await admin.auth.admin.getUserById(row.user_id)
  const authEmail = data.user?.email?.trim().toLowerCase()
  if (error || !authEmail) {
    throw new HttpError(
      409,
      'ACCOUNT_IDENTITY_MISMATCH',
      'The account Auth identity is unavailable and requires manual review',
    )
  }

  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: authEmail },
  )
  if (protectedAdminError) {
    throw new HttpError(500, 'ACCOUNT_PROTECTION_UNAVAILABLE', 'The account protection check failed')
  }
  if (protectedAdmin === true) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
  }
  return authEmail
}

function workspaceName(email: string, fullName: string | null, requested: string | null): string {
  if (requested) return requested
  if (fullName) return `${fullName}'s Workspace`
  return `${email.split('@')[0]}'s Workspace`
}

function workspaceSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'

  const suffix = [crypto.randomUUID(), crypto.randomUUID()]
    .map((value) => value.replaceAll('-', '').slice(0, 12))
    .join('')
  return `${base}-${suffix}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user } = await requirePlatformAdmin(req)

    if (action === 'list') {
      requireOnlyKeys(body, ['action'])

      const { data, error } = await admin
        .from('workspace_memberships')
        .select(`${MEMBERSHIP_COLUMNS}, workspace:workspaces(id,name,slug,status,is_default)`)
        .eq('role', 'owner')
        .order('invited_at', { ascending: false })

      if (error) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded')
      }

      // Claim-table privileges remain revoked even from service_role. These
      // narrow projections return only membership IDs, review timestamps,
      // claim purpose, and a supersession boolean; capability tokens and
      // actors never enter the list response.
      const { data: pendingData, error: pendingError } = await admin.rpc(
        'list_workspace_auth_lifecycle_pending',
      )
      if (pendingError) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded safely')
      }
      const { data: cleanupConflictData, error: cleanupConflictError } = await admin.rpc(
        'list_workspace_invite_cleanup_conflicts',
      )
      if (cleanupConflictError) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded safely')
      }
      const { data: invitePendingData, error: invitePendingError } = await admin.rpc(
        'list_workspace_invite_reconciliation_pending',
      )
      if (invitePendingError) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded safely')
      }
      const { data: credentialPendingData, error: credentialPendingError } = await admin.rpc(
        'list_workspace_account_credential_reconciliation_pending',
      )
      if (credentialPendingError) {
        throw new HttpError(500, 'USER_LIST_FAILED', 'Workspace users could not be loaded safely')
      }

      const membershipRows = (data ?? []) as unknown as MembershipRow[]
      const pendingRows = (pendingData ?? []) as unknown as LifecyclePendingRow[]
      const cleanupConflictRows = (cleanupConflictData ?? []) as unknown as InviteCleanupConflictRow[]
      const invitePendingRows = (invitePendingData ?? []) as unknown as InvitePendingRow[]
      const credentialPendingRows = (credentialPendingData ?? []) as unknown as CredentialPendingRow[]
      const pendingByMembership = new Map(
        pendingRows.map((row) => [row.membership_id, row.review_after]),
      )
      const cleanupConflictByMembership = new Map(
        cleanupConflictRows.map((row) => [row.membership_id, row]),
      )
      const invitePendingByMembership = new Map(
        invitePendingRows.map((row) => [row.membership_id, row]),
      )
      const credentialPendingByMembership = new Map(
        credentialPendingRows.map((row) => [row.membership_id, row]),
      )

      return jsonResponse(req, METHODS, 200, {
        // Default-workspace memberships are platform operators managed by the
        // legacy allowlist, not invite-only tenant accounts. Hiding them keeps
        // this UI aligned with the lifecycle actions it can actually perform.
        users: membershipRows
          .filter((row) => {
            const workspace = (row as { workspace?: { is_default?: boolean } | null }).workspace
            return row.role === 'owner' && workspace?.is_default === false
          })
          .map((row) => {
            const reviewAfter = pendingByMembership.get(row.id) ?? null
            const cleanupConflict = cleanupConflictByMembership.get(row.id)
            const invitePending = invitePendingByMembership.get(row.id)
            const credentialPending = credentialPendingByMembership.get(row.id)
            return userDto({
              ...row,
              auth_reconciliation_pending: reviewAfter !== null,
              auth_reconciliation_review_after: reviewAfter,
              has_newer_membership: cleanupConflict?.has_newer_membership ?? false,
              invite_cleanup_blocked: cleanupConflict !== undefined,
              invite_reconciliation_pending: invitePending !== undefined,
              invite_reconciliation_claim_kind: invitePending?.claim_kind ?? null,
              invite_reconciliation_review_after: invitePending?.review_after ?? null,
              credential_reconciliation_pending: credentialPending !== undefined,
              credential_reconciliation_claim_kind: credentialPending?.claim_kind ?? null,
              credential_reconciliation_review_after: credentialPending?.review_after ?? null,
            })
          }),
      })
    }

    if (action === 'invite') {
      requireOnlyKeys(body, ['action', 'email', 'full_name', 'workspace_name'])
      const email = requireEmail(body.email)
      const fullName = optionalString(body.full_name, 'full_name', 120)
      const requestedWorkspaceName = optionalString(body.workspace_name, 'workspace_name', 120)
      const name = workspaceName(email, fullName, requestedWorkspaceName)
      const provisioning = await beginInviteProvisioning(admin, {
        email,
        fullName,
        workspaceName: name,
        workspaceSlug: workspaceSlug(name),
        actorUserId: user.id,
      })
      const invited = await deliverProvisionedInvite(
        admin,
        provisioning.membership,
        provisioning.workspace,
        user.id,
        crypto.randomUUID(),
      )

      return jsonResponse(req, METHODS, 201, {
        success: true,
        user: userDto({ ...invited, workspace: provisioning.workspace } as MembershipRow),
      })
    }

    if (action === 'retry_invite') {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const { data, error } = await admin
        .from('workspace_memberships')
        .select(`${MEMBERSHIP_COLUMNS}, workspace:workspaces(id,name,slug,status,is_default)`)
        .eq('id', membershipId)
        .maybeSingle()

      if (error) {
        throw new HttpError(500, 'ACCOUNT_LOOKUP_FAILED', 'The workspace invitation could not be loaded')
      }
      if (!data) {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
      }
      const membership = data as unknown as MembershipRow & { workspace?: WorkspaceRow | null }
      if (membership.role !== 'owner') {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace invitation not found')
      }
      if (membership.provisioning_method === 'admin_temporary_password') {
        throw new HttpError(
          409,
          'MANUAL_ACCOUNT_ACTION_REQUIRED',
          'Use the manual account retry action for this workspace account',
        )
      }
      if (!membership.workspace) {
        throw new HttpError(409, 'INVITE_WORKSPACE_MISSING', 'The invitation workspace requires manual review')
      }
      if (membership.status === 'invited' && membership.user_id) {
        return jsonResponse(req, METHODS, 200, {
          success: true,
          user: userDto(membership),
        })
      }
      if (membership.status !== 'provisioning') {
        throw new HttpError(409, 'INVITE_NOT_PROVISIONING', 'Only a provisioning invitation can be retried')
      }

      const invited = await deliverProvisionedInvite(
        admin,
        membership,
        membership.workspace,
        user.id,
        crypto.randomUUID(),
      )
      return jsonResponse(req, METHODS, 200, {
        success: true,
        user: userDto({ ...invited, workspace: membership.workspace } as MembershipRow),
      })
    }

    if (
      action === 'suspend'
      || action === 'reactivate'
      || action === 'reconcile_active'
      || action === 'reconcile_suspended'
      || action === 'revoke_pending'
    ) {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')

      const { data: membership, error: membershipError } = await admin
        .from('workspace_memberships')
        .select(MEMBERSHIP_COLUMNS)
        .eq('id', membershipId)
        .maybeSingle()

      if (membershipError) {
        throw new HttpError(500, 'ACCOUNT_LOOKUP_FAILED', 'The workspace account could not be loaded')
      }
      if (!membership) {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
      }

      const row = membership as unknown as MembershipRow
      if (row.role !== 'owner') {
        throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
      }
      if (
        action === 'revoke_pending'
        && row.provisioning_method === 'admin_temporary_password'
      ) {
        throw new HttpError(
          409,
          'MANUAL_ACCOUNT_ACTION_REQUIRED',
          'Manual account revocation requires the dedicated credential workflow',
        )
      }
      const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
        'is_platform_admin_email',
        { p_email: row.email_normalized },
      )
      if (protectedAdminError) {
        throw new HttpError(500, 'ACCOUNT_PROTECTION_UNAVAILABLE', 'The account protection check failed')
      }
      if (protectedAdmin === true) {
        throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
      }
      if (
        action === 'suspend'
        || action === 'reactivate'
        || action === 'reconcile_active'
        || action === 'reconcile_suspended'
      ) {
        const lifecycleAction: LifecycleAction = action
        const desiredStatus = action === 'suspend' || action === 'reconcile_suspended'
          ? 'suspended'
          : 'active'
        const authEmail = await requireSafeAuthIdentity(admin, row)
        if (desiredStatus === 'active' && authEmail !== row.email_normalized) {
          throw new HttpError(
            409,
            'ACCOUNT_IDENTITY_MISMATCH',
            'The account identity changed and requires manual review',
          )
        }

        const lockToken = crypto.randomUUID()
        const claimed = await claimMembershipLifecycle(
          admin,
          row.id,
          lifecycleAction,
          user.id,
          lockToken,
        )
        if (!claimed.user_id || claimed.status !== desiredStatus) {
          throw new HttpError(
            503,
            'ACCOUNT_LIFECYCLE_INVALID',
            'The account reconciliation is inconsistent and requires operator review',
          )
        }

        const { error: authError } = await admin.auth.admin.updateUserById(claimed.user_id, {
          ban_duration: desiredStatus === 'suspended' ? '876000h' : 'none',
        })
        if (authError) {
          // An Auth transport/provider error cannot prove that no side effect
          // occurred. Keep the non-stealable claim for operator reconciliation
          // instead of allowing a fresh request to race an unknown outcome.
          throw new HttpError(
            503,
            'AUTH_RECONCILIATION_UNCERTAIN',
            'The account state is saved, but Auth reconciliation is uncertain and requires operator review',
          )
        }

        const completed = await completeMembershipLifecycle(
          admin,
          row.id,
          lifecycleAction,
          user.id,
          lockToken,
        )
        return jsonResponse(req, METHODS, 200, { success: true, user: userDto(completed) })
      }

      if (!['provisioning', 'invited', 'revoked'].includes(row.status)) {
        throw new HttpError(409, 'INVITE_NOT_PENDING', 'Only a pending invitation can be revoked')
      }

      // Database revocation and cleanup-claim acquisition commit together.
      // Delivery, finalization, acceptance, and revocation all lock the same
      // membership, so stale provisioning objects cannot send after revocation.
      const lockToken = crypto.randomUUID()
      const revoked = await revokeWorkspaceInvite(admin, row.id, user.id, lockToken)

      // The invite provider may have committed while returning an ambiguous
      // error. The lookup is token-bound and rejects duplicate candidates.
      // Unknown lookup/deletion outcomes leave the durable claim for review.
      const authUserId = await findInviteAuthUserId(
        admin,
        revoked.id,
        user.id,
        lockToken,
      )
      if (authUserId) {
        await deleteAuthUserIfPresent(
          admin,
          authUserId,
          revoked.email_normalized,
          'AUTH_REVOKE_FAILED',
          'Database access is revoked, but Auth cleanup must be retried',
        )
      }
      await releaseInviteDeliveryClaim(admin, revoked.id, lockToken)

      return jsonResponse(req, METHODS, 200, { success: true, user: userDto(revoked) })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown workspace user action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
