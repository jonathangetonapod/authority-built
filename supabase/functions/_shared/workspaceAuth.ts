import {
  createClient,
  type SupabaseClient,
  type User,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3'

import { getCorsHeaders } from './cors.ts'
import { HttpError } from './httpError.ts'

export { HttpError } from './httpError.ts'

export const MEMBERSHIP_COLUMNS = [
  'id',
  'workspace_id',
  'user_id',
  'email_normalized',
  'full_name',
  'role',
  'status',
  'invited_by',
  'invited_at',
  'invite_expires_at',
  'accepted_at',
  'accepted_by',
  'provisioning_method',
  'password_change_required',
  'workspace_access_not_before_epoch',
  'suspended_at',
  'suspended_by',
  'revoked_at',
  'revoked_by',
  'created_at',
  'updated_at',
].join(',')

export const WORKSPACE_COLUMNS = [
  'id',
  'name',
  'slug',
  'status',
  'is_default',
  'created_by',
  'created_at',
  'updated_at',
].join(',')

export interface AuthContext {
  admin: SupabaseClient
  user: User
  email: string
  platformAdmin: boolean
  accessToken: string
  tokenIssuedAt: number
  tokenAppMetadata: Record<string, unknown>
}

export interface WorkspaceFeatureWorkspace {
  id: string
  name: string
  slug: string | null
  status: string
  is_default: boolean
  logo_path: string | null
  logo_updated_at: string | null
  access_not_before_epoch: number | string
}

export interface WorkspaceFeatureAccess {
  workspace: WorkspaceFeatureWorkspace
  role: 'owner' | 'admin' | 'member' | 'platform_admin'
}

interface WorkspaceFeatureMembership {
  id: string
  workspace_id: string
  email_normalized: string
  role: 'owner' | 'admin' | 'member'
  status: string
  provisioning_method: string
  password_change_required: boolean
  workspace_access_not_before_epoch: number | string
}

export interface AuditEvent {
  workspaceId?: string | null
  actorUserId: string
  action: string
  entityType: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The service is not configured')
  }
  return value
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

function bearerToken(req: Request): string {
  const authorization = req.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  if (!match) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication is required')
  }
  return match[1]
}

function verifiedTokenClaims(
  token: string,
  expectedUserId: string,
): { issuedAt: number; appMetadata: Record<string, unknown> } {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new HttpError(401, 'INVALID_AUTH', 'Authentication is invalid or expired')
  }

  try {
    const encoded = parts[1].replaceAll('-', '+').replaceAll('_', '/')
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (value) => value.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    const issuedAt = payload.iat
    const appMetadata = payload.app_metadata

    if (
      payload.sub !== expectedUserId
      || typeof issuedAt !== 'number'
      || !Number.isSafeInteger(issuedAt)
      || issuedAt < 1
      || !appMetadata
      || typeof appMetadata !== 'object'
      || Array.isArray(appMetadata)
    ) {
      throw new Error('invalid claims')
    }

    return {
      issuedAt,
      appMetadata: appMetadata as Record<string, unknown>,
    }
  } catch {
    // The token has already been verified with Auth. Parsing here extracts the
    // issuance and embedded app-metadata claims needed to reject stale tokens.
    throw new HttpError(401, 'INVALID_AUTH', 'Authentication is invalid or expired')
  }
}

function positiveCredentialVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

function credentialMarker(value: unknown): string | null {
  return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null
}

export function workspaceCredentialIsFresh(context: AuthContext): boolean {
  const current = context.user.app_metadata ?? {}
  if (current.workspace_provisioning_method !== 'admin_temporary_password') {
    return true
  }

  const token = context.tokenAppMetadata
  const currentVersion = positiveCredentialVersion(current.workspace_credential_version)
  const tokenVersion = positiveCredentialVersion(token.workspace_credential_version)
  const currentAttempt = credentialMarker(current.workspace_credential_attempt_id)
  const tokenAttempt = credentialMarker(token.workspace_credential_attempt_id)
  const currentExecution = credentialMarker(current.workspace_credential_execution_id)
  const tokenExecution = credentialMarker(token.workspace_credential_execution_id)

  return currentVersion !== null
    && tokenVersion === currentVersion
    && currentAttempt !== null
    && tokenAttempt === currentAttempt
    && currentExecution !== null
    && tokenExecution === currentExecution
    && token.workspace_provisioning_method === 'admin_temporary_password'
    && token.workspace_password_change_required === current.workspace_password_change_required
    && token.workspace_id === current.workspace_id
    && token.workspace_membership_id === current.workspace_membership_id
}

function validAccessEpoch(value: number | string): number | null {
  const epoch = typeof value === 'string' ? Number(value) : value
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : null
}

function membershipCredentialMatches(
  context: AuthContext,
  membership: WorkspaceFeatureMembership,
): boolean {
  if (membership.provisioning_method !== 'admin_temporary_password') return true
  const metadata = context.user.app_metadata ?? {}
  return membership.password_change_required === false
    && metadata.workspace_id === membership.workspace_id
    && metadata.workspace_membership_id === membership.id
    && metadata.workspace_provisioning_method === 'admin_temporary_password'
    && metadata.workspace_password_change_required === false
}

/**
 * Authorize a client-bound workspace feature without changing the user's role.
 * A platform administrator can enter another active workspace, but receives no
 * feature-level capability beyond that explicit workspace access.
 */
export async function requireWorkspaceFeatureAccess(
  context: AuthContext,
  workspaceId: string,
): Promise<WorkspaceFeatureAccess> {
  if (!workspaceCredentialIsFresh(context)) {
    throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
  }

  const { data: workspaceData, error: workspaceError } = await context.admin
    .from('workspaces')
    .select('id,name,slug,status,is_default,logo_path,logo_updated_at,access_not_before_epoch')
    .eq('id', workspaceId)
    .maybeSingle()

  if (workspaceError) {
    throw new HttpError(500, 'WORKSPACE_ACCESS_UNAVAILABLE', 'Workspace access could not be verified')
  }
  if (!workspaceData || workspaceData.status !== 'active') {
    throw new HttpError(404, 'WORKSPACE_NOT_FOUND', 'The selected workspace is unavailable')
  }

  const workspace = workspaceData as WorkspaceFeatureWorkspace
  const workspaceEpoch = validAccessEpoch(workspace.access_not_before_epoch)
  if (workspaceEpoch === null || context.tokenIssuedAt < workspaceEpoch) {
    throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again to access this workspace')
  }

  const { data: targetMembershipData, error: targetMembershipError } = await context.admin
    .from('workspace_memberships')
    .select('id,workspace_id,email_normalized,role,status,provisioning_method,password_change_required,workspace_access_not_before_epoch')
    .eq('workspace_id', workspaceId)
    .eq('user_id', context.user.id)
    .maybeSingle()

  if (targetMembershipError) {
    throw new HttpError(500, 'WORKSPACE_ACCESS_UNAVAILABLE', 'Workspace access could not be verified')
  }

  const targetMembership = targetMembershipData as WorkspaceFeatureMembership | null
  if (targetMembership) {
    const membershipEpoch = validAccessEpoch(targetMembership.workspace_access_not_before_epoch)
    if (
      targetMembership.workspace_id === workspace.id
      && targetMembership.email_normalized === context.email
      && targetMembership.status === 'active'
      && ['owner', 'admin', 'member'].includes(targetMembership.role)
      && membershipEpoch !== null
      && context.tokenIssuedAt >= membershipEpoch
      && membershipCredentialMatches(context, targetMembership)
    ) {
      return { workspace, role: targetMembership.role }
    }
  }

  if (!context.platformAdmin || workspace.is_default) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }

  // Platform access is anchored to the caller's active DEFAULT-workspace
  // membership. It grants entry to another workspace, never impersonation of
  // that workspace's owner or additional feature controls.
  //
  // The anchor is the membership ON THE DEFAULT WORKSPACE, not "the caller's
  // only membership". Requiring exactly one active membership anywhere made
  // platform access mutually exclusive with owning a workspace: a sub-agency
  // owner added to the default workspace would hold two active memberships and
  // every workspace call would 403 — costing them their own workspace and
  // granting nothing. public.is_platform_admin_identity has always joined to
  // the default workspace rather than counting memberships, so this makes the
  // TypeScript gate agree with the SQL one instead of being stricter than it.
  const { data: homeMembershipData, error: homeMembershipError } = await context.admin
    .from('workspace_memberships')
    .select('id,workspace_id,email_normalized,role,status,provisioning_method,password_change_required,workspace_access_not_before_epoch,workspaces!inner(is_default)')
    .eq('user_id', context.user.id)
    .eq('email_normalized', context.email)
    .eq('status', 'active')
    .eq('workspaces.is_default', true)
    .limit(2)

  if (homeMembershipError) {
    throw new HttpError(500, 'WORKSPACE_ACCESS_UNAVAILABLE', 'Workspace access could not be verified')
  }
  // Still exactly one. Two active memberships on the single default workspace
  // is ambiguous data, not a supported arrangement, and the identity it would
  // anchor to is unknowable.
  if (!homeMembershipData || homeMembershipData.length !== 1) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }

  const homeMembership = homeMembershipData[0] as WorkspaceFeatureMembership
  const membershipEpoch = validAccessEpoch(homeMembership.workspace_access_not_before_epoch)
  const { data: homeWorkspaceData, error: homeWorkspaceError } = await context.admin
    .from('workspaces')
    .select('id,status,is_default,access_not_before_epoch')
    .eq('id', homeMembership.workspace_id)
    .maybeSingle()

  const homeWorkspaceEpoch = homeWorkspaceData
    ? validAccessEpoch(homeWorkspaceData.access_not_before_epoch as number | string)
    : null
  if (
    homeWorkspaceError
    || !homeWorkspaceData
    || homeWorkspaceData.status !== 'active'
    || homeWorkspaceData.is_default !== true
    || membershipEpoch === null
    || homeWorkspaceEpoch === null
    || context.tokenIssuedAt < membershipEpoch
    || context.tokenIssuedAt < homeWorkspaceEpoch
    || !membershipCredentialMatches(context, homeMembership)
  ) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }

  return { workspace, role: 'platform_admin' }
}

export async function secretsMatch(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const leftBytes = new Uint8Array(leftHash)
  const rightBytes = new Uint8Array(rightHash)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

export async function requireAuthenticatedUser(req: Request): Promise<AuthContext> {
  const admin = createAdminClient()
  const token = bearerToken(req)
  const { data, error } = await admin.auth.getUser(token)

  if (error || !data.user) {
    throw new HttpError(401, 'INVALID_AUTH', 'Authentication is invalid or expired')
  }

  const email = normalizeEmail(data.user.email ?? '')
  if (!email) {
    throw new HttpError(403, 'EMAIL_REQUIRED', 'A verified account email is required')
  }
  const tokenClaims = verifiedTokenClaims(token, data.user.id)

  // Platform access is bound to the immutable Auth user, its current email,
  // and an active default-workspace membership. An email change alone can
  // therefore never promote a tenant into the legacy admin allowlist.
  const { data: platformAdmin, error: adminError } = await admin.rpc(
    'is_platform_admin_identity',
    { p_user_id: data.user.id, p_email: email },
  )

  if (adminError) {
    throw new HttpError(500, 'AUTHORIZATION_UNAVAILABLE', 'Authorization could not be verified')
  }

  return {
    admin,
    user: data.user,
    email,
    platformAdmin: platformAdmin === true,
    accessToken: token,
    tokenIssuedAt: tokenClaims.issuedAt,
    tokenAppMetadata: tokenClaims.appMetadata,
  }
}

export async function requirePlatformAdmin(req: Request): Promise<AuthContext> {
  const context = await requireAuthenticatedUser(req)
  if (!context.platformAdmin) {
    throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required')
  }
  return context
}

/**
 * Transitional guard for legacy operational functions. Browser calls must be
 * made by a platform administrator; existing function-to-function calls may
 * continue using the service-role bearer they already use. New tenant
 * functions should use requireAuthenticatedUser plus explicit workspace checks
 * instead of this compatibility guard.
 */
export async function requirePlatformAdminOrService(
  req: Request,
): Promise<AuthContext | null> {
  const token = bearerToken(req)
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (await secretsMatch(token, serviceRoleKey)) return null
  return await requirePlatformAdmin(req)
}

export async function parseJsonObject(
  req: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Content-Type must be application/json')
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', 'Request body must be a JSON object')
  }

  return value as Record<string, unknown>
}

export async function parseOptionalJsonObject(
  req: Request,
  maxBytes = 16_384,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }

  const raw = await req.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large')
  }
  if (!raw.trim()) return {}

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new HttpError(415, 'JSON_REQUIRED', 'Content-Type must be application/json')
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', 'Request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

export function requireOnlyKeys(
  body: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys)
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new HttpError(400, 'UNKNOWN_FIELD', 'Request body contains an unknown field')
  }
}

export function requireUuid(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid UUID`)
  }
  return value.toLowerCase()
}

export function requireString(
  value: unknown,
  field: string,
  options: { min?: number; max: number },
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a string`)
  }
  const result = value.trim()
  if (result.length < (options.min ?? 1) || result.length > options.max) {
    throw new HttpError(
      400,
      'INVALID_FIELD',
      `${field} must be between ${options.min ?? 1} and ${options.max} characters`,
    )
  }
  return result
}

export function requireEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).toLowerCase()
  // Deliberately conservative: Supabase Auth performs the authoritative email
  // validation, while this rejects malformed input before any data is written.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'email must be a valid email address')
  }
  return email
}

export function optionalString(
  value: unknown,
  field: string,
  max: number,
): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireString(value, field, { max })
}

export function inviteRedirectUrl(): string {
  const configured = [Deno.env.get('APP_URL'), Deno.env.get('WEB_URL')]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))

  if (configured.length === 0) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The invite redirect is not configured')
  }

  for (const candidate of configured) {
    try {
      const parsed = new URL(candidate)
      const localDevelopment = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol !== 'https:' && !(localDevelopment && parsed.protocol === 'http:')) {
        continue
      }

      // Only an environment-configured origin is used. Paths, queries and
      // fragments from configuration or request input never reach the redirect.
      return new URL('/accept-invite', parsed.origin).toString()
    } catch {
      // Try the other explicitly configured application URL.
    }
  }

  throw new HttpError(500, 'SERVER_MISCONFIGURED', 'The invite redirect is not configured')
}

export async function writeAudit(admin: SupabaseClient, event: AuditEvent): Promise<void> {
  const { error } = await admin.from('workspace_audit_log').insert({
    workspace_id: event.workspaceId ?? null,
    actor_user_id: event.actorUserId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    metadata: event.metadata ?? {},
  })

  if (error) {
    throw new HttpError(500, 'AUDIT_WRITE_FAILED', 'The operation could not be audited')
  }
}

export function responseHeaders(req: Request, methods: readonly string[]): Record<string, string> {
  return {
    ...getCorsHeaders(req),
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  }
}

export function jsonResponse(
  req: Request,
  methods: readonly string[],
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req, methods),
  })
}

export function optionsResponse(req: Request, methods: readonly string[]): Response {
  const headers = responseHeaders(req, methods)
  delete headers['Content-Type']
  return new Response(null, { status: 204, headers })
}

export function errorResponse(req: Request, methods: readonly string[], error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse(req, methods, error.status, {
      error: error.message,
      code: error.code,
    })
  }

  // Do not serialize database/Auth errors or request data into responses/logs.
  console.error('Workspace function failed with an unexpected error')
  return jsonResponse(req, methods, 500, {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
}
