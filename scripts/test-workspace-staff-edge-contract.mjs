import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/manage-workspace-staff/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const workspaceAuth = readFileSync('supabase/functions/_shared/workspaceAuth.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)
const forwardMigration = readFileSync(
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql',
  'utf8',
)
const passwordMigration = readFileSync(
  'supabase/migrations/20260722000300_workspace_staff_temporary_passwords.sql',
  'utf8',
)
const brandingMigration = readFileSync(
  'supabase/migrations/20260722000400_workspace_branding.sql',
  'utf8',
)
const clientBrandingMigration = readFileSync(
  'supabase/migrations/20260723000700_workspace_client_branding.sql',
  'utf8',
)
const workspaceNameMigration = readFileSync(
  'supabase/migrations/20260723000800_workspace_name_management.sql',
  'utf8',
)
const ownerPasswordMigration = readFileSync(
  'supabase/migrations/20260723000500_workspace_owner_password_management.sql',
  'utf8',
)

const cutoverGuardIndex = migration.indexOf('DO $cutover_claim_guard$')
assert.ok(cutoverGuardIndex > 0, 'provider-claim cutover guard must remain installed')
for (const claimTable of [
  'workspace_account_credential_claims',
  'workspace_auth_lifecycle_claims',
  'workspace_invite_delivery_claims',
]) {
  const lockIndex = migration.indexOf(
    `LOCK TABLE public.${claimTable}\n  IN SHARE ROW EXCLUSIVE MODE;`,
  )
  assert.ok(lockIndex >= 0 && lockIndex < cutoverGuardIndex, `${claimTable} must be write-locked before the cutover guard`)
}

function sqlPattern(value) {
  return new RegExp(
    value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replaceAll(/\s+/gu, '\\s+'),
    'u',
  )
}

assert.match(source, /if \(req\.method === "OPTIONS"\) return optionsResponse\(req, METHODS\)/u)
assert.match(source, /return errorResponse\(req, METHODS, error\)/u)
assert.match(source, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(source, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(source, /const workspaceId = requireUuid\(body\.workspace_id, "workspace_id"\)/u)
assert.doesNotMatch(source, /PREVIEW_READ_ONLY/u)
assert.match(source, /if \(result\.capabilities\.read_only\) \{[\s\S]*?invalidRpcResponse/u)
assert.match(source, /actorIsPlatformAdmin: platformAdmin/u)
assert.match(source, /reauthentication_required: !platformAdmin/u)

for (const rpc of [
  'workspace_staff_list_v1',
  'begin_workspace_staff_invite_v1',
  'claim_workspace_staff_invite_delivery_v1',
  'find_workspace_staff_invite_auth_user_v1',
  'finalize_workspace_staff_invite_v1',
  'revoke_workspace_staff_account_v1',
  'claim_workspace_staff_auth_lifecycle_v1',
  'complete_workspace_staff_auth_lifecycle_v1',
  'update_workspace_staff_role_v1',
  'transfer_workspace_owner_v1',
]) {
  assert.match(source, new RegExp(`"${rpc}"`, 'u'), `${rpc} must remain version-pinned`)
  assert.match(
    forwardMigration,
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`, 'u'),
    `${rpc} must be upgraded for already-applied foundation databases`,
  )
}

for (const rpc of [
  'claim_workspace_staff_password_reset_v1',
  'cancel_workspace_staff_password_reset_v1',
  'complete_workspace_staff_password_reset_v1',
]) {
  assert.match(source, new RegExp(`"${rpc}"`, 'u'), `${rpc} must remain version-pinned`)
  assert.match(
    ownerPasswordMigration,
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`, 'u'),
    `${rpc} must be installed by the owner-password migration`,
  )
}

assert.match(source, /"set_workspace_logo_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_expected_logo_path: input\.expectedLogoPath,\s*p_logo_path: input\.logoPath,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u)
assert.match(
  brandingMigration,
  sqlPattern('CREATE OR REPLACE FUNCTION public.set_workspace_logo_v1( p_workspace_id UUID, p_expected_logo_path TEXT, p_logo_path TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT )'),
)
assert.match(
  brandingMigration,
  sqlPattern('REVOKE ALL ON FUNCTION public.set_workspace_logo_v1( UUID, TEXT, TEXT, UUID, BIGINT ) FROM PUBLIC, anon, authenticated, service_role;'),
)
assert.match(
  brandingMigration,
  sqlPattern('GRANT EXECUTE ON FUNCTION public.set_workspace_logo_v1( UUID, TEXT, TEXT, UUID, BIGINT ) TO service_role;'),
)

for (const rpc of [
  'begin_workspace_staff_password_account_v1',
  'claim_workspace_staff_password_delivery_v1',
  'finalize_workspace_staff_password_account_v1',
  'cancel_workspace_staff_password_account_v1',
]) {
  assert.match(source, new RegExp(`"${rpc}"`, 'u'), `${rpc} must remain version-pinned`)
  assert.match(
    passwordMigration,
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`, 'u'),
    `${rpc} must be installed by the temporary-password migration`,
  )
}

assert.match(forwardMigration, /'read_only', false/u)
assert.match(forwardMigration, /WHEN 'platform_admin' THEN jsonb_build_array\('admin', 'member'\)/u)
assert.doesNotMatch(
  forwardMigration,
  /workspace_staff_actor_role_v1\([\s\S]{0,180}?p_token_issued_at, false/u,
  'every upgraded staff operation must explicitly permit platform-owner management',
)

for (const edgeCall of [
  /"workspace_staff_list_v1", \{\s*p_workspace_id: workspaceId,\s*p_actor_user_id: actorUserId,\s*p_token_issued_at: tokenIssuedAt/u,
  /"begin_workspace_staff_invite_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_email: input\.email,\s*p_full_name: input\.fullName,\s*p_role: input\.role,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"claim_workspace_staff_invite_delivery_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"find_workspace_staff_invite_auth_user_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"finalize_workspace_staff_invite_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken,\s*p_auth_user_id: input\.authUserId/u,
  /"revoke_workspace_staff_account_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: lockToken/u,
  /"claim_workspace_staff_auth_lifecycle_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_action: input\.action,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"complete_workspace_staff_auth_lifecycle_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_action: input\.action,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"update_workspace_staff_role_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_role: input\.role,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"transfer_workspace_owner_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"begin_workspace_staff_password_account_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_email: input\.email,\s*p_full_name: input\.fullName,\s*p_role: input\.role,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"claim_workspace_staff_password_delivery_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"finalize_workspace_staff_password_account_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken,\s*p_auth_user_id: input\.authUserId/u,
  /"cancel_workspace_staff_password_account_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
]) {
  assert.match(source, edgeCall, 'Edge RPC argument map must match the SQL contract')
}

const passwordSqlContracts = [
  ['begin_workspace_staff_password_account_v1', 'p_workspace_id UUID, p_email TEXT, p_full_name TEXT, p_role TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, TEXT, TEXT, TEXT, UUID, BIGINT'],
  ['claim_workspace_staff_password_delivery_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['finalize_workspace_staff_password_account_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID, p_auth_user_id UUID', 'UUID, UUID, UUID, BIGINT, UUID, UUID'],
  ['cancel_workspace_staff_password_account_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
]

for (const [name, namedSignature, typeSignature] of passwordSqlContracts) {
  assert.match(
    passwordMigration,
    sqlPattern(`CREATE OR REPLACE FUNCTION public.${name}( ${namedSignature} )`),
    `${name} SQL named signature must match Edge`,
  )
  assert.match(
    passwordMigration,
    sqlPattern(`REVOKE ALL ON FUNCTION public.${name}( ${typeSignature} ) FROM PUBLIC, anon, authenticated, service_role;`),
    `${name} must be revoked before its narrow grant`,
  )
  assert.match(
    passwordMigration,
    sqlPattern(`GRANT EXECUTE ON FUNCTION public.${name}( ${typeSignature} ) TO service_role;`),
    `${name} must be service-role-only`,
  )
}

const ownerPasswordSqlContracts = [
  ['claim_workspace_staff_password_reset_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_attempt_id UUID, p_execution_id UUID', 'UUID, UUID, UUID, BIGINT, UUID, UUID'],
  ['cancel_workspace_staff_password_reset_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_attempt_id UUID, p_execution_id UUID', 'UUID, UUID, UUID, BIGINT, UUID, UUID'],
  ['complete_workspace_staff_password_reset_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_attempt_id UUID, p_execution_id UUID, p_credential_version BIGINT', 'UUID, UUID, UUID, BIGINT, UUID, UUID, BIGINT'],
]

for (const [name, namedSignature, typeSignature] of ownerPasswordSqlContracts) {
  assert.match(
    ownerPasswordMigration,
    sqlPattern(`CREATE OR REPLACE FUNCTION public.${name}( ${namedSignature} )`),
    `${name} SQL named signature must match Edge`,
  )
  assert.match(
    ownerPasswordMigration,
    sqlPattern(`REVOKE ALL ON FUNCTION public.${name}( ${typeSignature} ) FROM PUBLIC, anon, authenticated, service_role;`),
    `${name} must be revoked before its narrow grant`,
  )
  assert.match(
    ownerPasswordMigration,
    sqlPattern(`GRANT EXECUTE ON FUNCTION public.${name}( ${typeSignature} ) TO service_role;`),
    `${name} must be service-role-only`,
  )
}

const sqlContracts = [
  ['workspace_staff_list_v1', 'p_workspace_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, BIGINT'],
  ['begin_workspace_staff_invite_v1', 'p_workspace_id UUID, p_email TEXT, p_full_name TEXT, p_role TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, TEXT, TEXT, TEXT, UUID, BIGINT'],
  ['claim_workspace_staff_invite_delivery_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['find_workspace_staff_invite_auth_user_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['finalize_workspace_staff_invite_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID, p_auth_user_id UUID', 'UUID, UUID, UUID, BIGINT, UUID, UUID'],
  ['revoke_workspace_staff_account_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['claim_workspace_staff_auth_lifecycle_v1', 'p_workspace_id UUID, p_membership_id UUID, p_action TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, TEXT, UUID, BIGINT, UUID'],
  ['complete_workspace_staff_auth_lifecycle_v1', 'p_workspace_id UUID, p_membership_id UUID, p_action TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, TEXT, UUID, BIGINT, UUID'],
  ['update_workspace_staff_role_v1', 'p_workspace_id UUID, p_membership_id UUID, p_role TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, TEXT, UUID, BIGINT'],
  ['transfer_workspace_owner_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, UUID, BIGINT'],
]

for (const [name, namedSignature, typeSignature] of sqlContracts) {
  assert.match(
    migration,
    sqlPattern(`CREATE OR REPLACE FUNCTION public.${name}( ${namedSignature} )`),
    `${name} SQL named signature must match Edge`,
  )
  assert.match(
    migration,
    sqlPattern(`REVOKE ALL ON FUNCTION public.${name}( ${typeSignature} ) FROM PUBLIC, anon, authenticated;`),
    `${name} must not be browser-callable`,
  )
  assert.match(
    migration,
    sqlPattern(`GRANT EXECUTE ON FUNCTION public.${name}( ${typeSignature} ) TO service_role;`),
    `${name} must be service-role-only`,
  )
}

for (const parameter of [
  'p_workspace_id: input.workspaceId',
  'p_actor_user_id: input.actorUserId',
  'p_token_issued_at: input.tokenIssuedAt',
]) {
  assert.match(source, new RegExp(parameter.replaceAll('.', '\\.'), 'u'))
}

assert.match(source, /const lockToken = crypto\.randomUUID\(\)/u)
assert.match(source, /"release_workspace_invite_delivery_claim"/u)
assert.match(source, /admin\.auth\.admin[\s\S]*?\.inviteUserByEmail/u)
assert.match(source, /import \{ generateTemporaryPassword \} from "\.\.\/_shared\/workspaceCredentials\.ts"/u)
assert.match(source, /const temporaryPassword = generateTemporaryPassword\(\)/u)
assert.match(source, /admin\.auth\.admin\.createUser\(\{[\s\S]*?password: temporaryPassword,[\s\S]*?email_confirm: true/u)
assert.match(source, /workspace_provisioning_method: "admin_temporary_password"/u)
assert.match(source, /workspace_password_change_required: true/u)
assert.match(source, /workspace_credential_version: 1/u)
assert.match(source, /workspace_credential_attempt_id: lockToken/u)
assert.match(source, /temporary_password: issued\.temporaryPassword/u)
assert.match(source, /action === "create_password"/u)
assert.match(source, /action === "retry_password"/u)
assert.match(source, /action === "reset_password"/u)
assert.match(source, /const temporaryPassword = generateTemporaryPassword\(\)[\s\S]*?password: temporaryPassword, app_metadata: nextMetadata/u)
assert.match(source, /workspace_password_change_required: true/u)
assert.match(source, /"complete_workspace_staff_password_reset_v1"/u)
assert.match(ownerPasswordMigration, /'reset_password'/u)
assert.match(ownerPasswordMigration, /claim_kind = 'staff_password_reset'/u)
assert.match(ownerPasswordMigration, /status = 'invited',[\s\S]*?password_change_required = true/u)
assert.doesNotMatch(ownerPasswordMigration, /temporary_password\s+(?:TEXT|VARCHAR)/iu)
assert.match(source, /capabilities\.can_generate_password \?\? false/u)
assert.match(source, /capabilities\.can_manage_branding \?\? false/u)
assert.match(source, /capabilities\.can_manage_client_branding \?\? false/u)
assert.match(source, /capabilities\.can_manage_workspace_name \?\? false/u)
assert.match(source, /action === "update_logo"/u)
assert.match(source, /action === "remove_logo"/u)
assert.match(source, /action === "update_brand"/u)
assert.match(source, /action === "update_workspace_name"/u)
assert.match(source, /"set_workspace_client_brand_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_expected_brand_updated_at: input\.expectedBrandUpdatedAt,\s*p_client_brand_name: input\.clientBrandName,\s*p_client_brand_primary_color: input\.primaryColor,\s*p_client_brand_accent_color: input\.accentColor,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u)
assert.match(source, /"set_workspace_name_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_expected_updated_at: input\.expectedUpdatedAt,\s*p_workspace_name: input\.workspaceName,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u)
assert.match(source, /function schemaObjectUnavailable\([\s\S]*?PGRST202[\s\S]*?PGRST204/u)
assert.match(source, /const canManageWorkspaceBranding = staff\.capabilities\.can_generate_password/u)
assert.match(source, /function requireWorkspaceManager\([\s\S]*?WORKSPACE_MANAGER_REQUIRED/u)
assert.match(source, /requireWorkspaceManager\(staff\)/u)
assert.match(source, /\.from\("workspaces"\)[\s\S]*?\.update\(\{ name: input\.workspaceName \}\)[\s\S]*?\.eq\("updated_at", input\.expectedUpdatedAt\)/u)
assert.match(source, /\.from\("workspace_audit_log"\)\.insert\(\{[\s\S]*?action: "workspace\.branding\.client_identity_updated"/u)
assert.match(source, /parseJsonObject\(req, MAX_WORKSPACE_LOGO_REQUEST_BYTES\)/u)
assert.match(source, /MAX_WORKSPACE_LOGO_BYTES = 2 \* 1024 \* 1024/u)
assert.match(source, /"image\/jpeg": "jpg"[\s\S]*?"image\/png": "png"[\s\S]*?"image\/webp": "webp"/u)
assert.match(source, /\.from\(WORKSPACE_LOGO_BUCKET\)[\s\S]*?\.upload\(logoPath, image\.bytes/u)
assert.match(source, /cacheControl: "31536000"[\s\S]*?upsert: false/u)
assert.match(source, /await removeWorkspaceLogoObject\(admin, logoPath\)[\s\S]*?throw error/u)
assert.match(source, /currentBranding\.logo_path !== expectedLogoPath/u)
assert.match(passwordMigration, /'can_generate_password', actor_role IN/u)
assert.match(brandingMigration, /'workspace-logos',[\s\S]*?true,[\s\S]*?2097152/u)
assert.match(brandingMigration, /ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/u)
assert.match(brandingMigration, /workspace\.logo_path IS NOT DISTINCT FROM p_expected_logo_path/u)
assert.match(brandingMigration, /workspace\.branding\.logo_updated/u)
assert.match(brandingMigration, /workspace\.branding\.logo_removed/u)
assert.match(clientBrandingMigration, /ADD COLUMN IF NOT EXISTS client_brand_name TEXT/u)
assert.match(clientBrandingMigration, /client_brand_primary_color TEXT NOT NULL DEFAULT '#0D1B2A'/u)
assert.match(clientBrandingMigration, /client_brand_accent_color TEXT NOT NULL DEFAULT '#C7794F'/u)
assert.match(
  clientBrandingMigration,
  sqlPattern('CREATE OR REPLACE FUNCTION public.set_workspace_client_brand_v1( p_workspace_id UUID, p_expected_brand_updated_at TIMESTAMPTZ, p_client_brand_name TEXT, p_client_brand_primary_color TEXT, p_client_brand_accent_color TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT )'),
)
assert.match(clientBrandingMigration, /actor_role NOT IN \('owner', 'admin', 'platform_admin'\)/u)
assert.match(clientBrandingMigration, /workspace\.branding\.client_identity_updated/u)
assert.match(
  clientBrandingMigration,
  sqlPattern('REVOKE ALL ON FUNCTION public.set_workspace_client_brand_v1( UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, BIGINT ) FROM PUBLIC, anon, authenticated, service_role;'),
)
assert.match(
  clientBrandingMigration,
  sqlPattern('GRANT EXECUTE ON FUNCTION public.set_workspace_client_brand_v1( UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, BIGINT ) TO service_role;'),
)
assert.match(
  workspaceNameMigration,
  sqlPattern('CREATE OR REPLACE FUNCTION public.set_workspace_name_v1( p_workspace_id UUID, p_expected_updated_at TIMESTAMPTZ, p_workspace_name TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT )'),
)
assert.match(workspaceNameMigration, /actor_role NOT IN \('owner', 'admin', 'platform_admin'\)/u)
assert.match(workspaceNameMigration, /workspace\.identity\.name_updated/u)
assert.match(
  workspaceNameMigration,
  sqlPattern('REVOKE ALL ON FUNCTION public.set_workspace_name_v1( UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT ) FROM PUBLIC, anon, authenticated, service_role;'),
)
assert.match(
  workspaceNameMigration,
  sqlPattern('GRANT EXECUTE ON FUNCTION public.set_workspace_name_v1( UUID, TIMESTAMPTZ, TEXT, UUID, BIGINT ) TO service_role;'),
)
assert.doesNotMatch(source, /console\.[a-z]+\([^\n]*temporaryPassword/u)
assert.match(source, /data: \{[\s\S]*?workspace_id: membership\.workspace_id,[\s\S]*?workspace_membership_id: membership\.id/u)
assert.match(source, /app_metadata: \{[\s\S]*?workspace_id: membership\.workspace_id,[\s\S]*?workspace_membership_id: membership\.id/u)
assert.match(source, /markerMatches\(data\.user\.app_metadata, membership\)/u)
assert.match(source, /const safeUntrustedInviteMarker = allowInviteMarker &&[\s\S]*?Boolean\(data\.user\.invited_at\)[\s\S]*?!data\.user\.confirmed_at[\s\S]*?!data\.user\.last_sign_in_at/u)
assert.match(source, /admin\.auth\.admin\.deleteUser\(authUserId\)/u)
assert.match(source, /ban_duration: desiredStatus === "suspended" \? "876000h" : "none"/u)
assert.doesNotMatch(source, /reconcile_active|reconcile_suspended/u)
assert.match(source, /"transfer_workspace_owner_v1", \{[\s\S]*?p_membership_id: input\.membershipId/u)
assert.match(source, /message\.includes\("active selected workspace"\)/u)
assert.match(source, /message\.includes\("auth identity is not ready"\)/u)
assert.match(source, /\["22023", "23505", "42501", "55000", "55P03", "P0002"\]\.includes/u)
assert.match(source, /let sawTransportUncertainty = false/u)
assert.match(source, /if \(sawTransportUncertainty\) break;[\s\S]*?sawTransportUncertainty = true/u)
assert.match(source, /if \(!sawTransportUncertainty && notReadyResponses === 2\) return null/u)
assert.match(source, /"INVITE_FINALIZE_UNCERTAIN"[\s\S]*?requires operator review/u)
assert.match(source, /error\.code === "INVITE_FINALIZE_UNCERTAIN"[\s\S]*?throw error/u)
assert.match(migration, /RAISE EXCEPTION 'workspace staff invitation Auth identity is not ready'/u)
assert.ok(
  migration.indexOf("workspace staff invitation Auth identity is not ready") <
    migration.indexOf("workspace staff invitation Auth identity is unsafe"),
  'transient missing Auth markers must be distinguished before unsafe identity mismatches',
)

const publicMemberProjection = source.match(
  /function memberDto[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u,
)?.[1]
assert.ok(publicMemberProjection, 'memberDto must use an explicit public projection')
for (const key of [
  'id',
  'email',
  'full_name',
  'role',
  'status',
  'setup_method',
  'invited_at',
  'invite_expires_at',
  'accepted_at',
  'suspended_at',
  'pending_review',
  'allowed_actions',
]) {
  assert.match(publicMemberProjection, new RegExp(`\\b${key}\\b`, 'u'))
}
for (const forbidden of [
  'user_id',
  'workspace_id',
  'lock_token',
  'actor_user_id',
  'workspace_access_not_before_epoch',
  'provisioning_method',
  'password_change_required',
]) {
  assert.doesNotMatch(
    publicMemberProjection,
    new RegExp(`\\b${forbidden}\\b`, 'u'),
    `public staff DTO must exclude ${forbidden}`,
  )
}

assert.match(config, /\[functions\.manage-workspace-staff\]\s+verify_jwt = true/u)

process.stdout.write('Workspace Staff Edge contract checks passed\n')

// Platform access is anchored to the caller's membership ON THE DEFAULT
// WORKSPACE, not to their having exactly one membership anywhere. The stricter
// form made platform admin mutually exclusive with owning a workspace: a
// sub-agency owner added to the default workspace held two active memberships
// and every workspace call 403'd. public.is_platform_admin_identity has always
// joined to the default workspace instead of counting, so this keeps the
// TypeScript gate from being stricter than the SQL one.
assert.match(workspaceAuth, /\.eq\('workspaces\.is_default', true\)/u)
// Exactly one is still required — two memberships on the single default
// workspace is ambiguous data with no knowable identity to anchor to.
assert.match(workspaceAuth, /homeMembershipData\.length !== 1/u)
// The path is unreachable unless the caller is already a platform admin by the
// SQL definition, so widening the anchor cannot grant anyone new access.
assert.match(workspaceAuth, /if \(!context\.platformAdmin \|\| workspace\.is_default\) \{/u)
// Defence in depth: the anchor workspace is re-checked explicitly after the
// join, so a filter change alone cannot admit a non-default workspace.
assert.match(workspaceAuth, /homeWorkspaceData\.is_default !== true/u)

// One booking link per workspace, pasted in settings, offered to every
// prospect dashboard that has no call-to-action of its own.
const bookingMigration = readFileSync(
  'supabase/migrations/20260728002000_workspace_booking_link.sql',
  'utf8',
)
const prospectPublic = readFileSync('supabase/functions/get-prospect-dashboard/index.ts', 'utf8')
const prospectView = readFileSync('src/pages/prospect/ProspectView.tsx', 'utf8')
const schedulerEmbed = readFileSync('src/lib/schedulerEmbed.ts', 'utf8')

assert.match(bookingMigration, /ADD COLUMN IF NOT EXISTS booking_embed_url TEXT/u)
// https only at the column, so a link that cannot be framed never gets saved.
assert.match(bookingMigration, /booking_embed_url ~ '\^https:/u)
assert.match(bookingMigration, /CREATE OR REPLACE FUNCTION public\.set_workspace_booking_link_v1/u)
assert.match(bookingMigration, /actor_role NOT IN \('owner', 'admin', 'platform_admin'\)/u)
// Never the default platform workspace, like every other workspace setting.
assert.match(bookingMigration, /AND NOT workspace\.is_default/u)
assert.match(bookingMigration, /REVOKE ALL ON FUNCTION public\.set_workspace_booking_link_v1\(UUID, TEXT, UUID, BIGINT\)\s*\n\s*FROM PUBLIC, anon, authenticated;/u)

// A workspace without a booking link is the normal case, not a malformed
// response. Reading it as non-nullable made every settings load 500.
for (const call of source.matchAll(/booking_embed_url: responseText\(([^\n]*)\)/gu)) {
  assert.match(
    call[1],
    /,\s*true$/u,
    'the booking link must be read as nullable, or settings breaks for every workspace that has not set one',
  )
}

assert.match(source, /action === "update_booking_link"/u)
assert.match(source, /requireWorkspaceManager\(staff\)[\s\S]{0,400}set_workspace_booking_link_v1/u)
assert.match(prospectPublic, /booking_embed_url/u)
assert.match(prospectPublic, /startsWith\('https:\/\/'\)/u)

// Only schedulers that publish an embed are framed; every other link still
// works as a button rather than being refused.
assert.match(schedulerEmbed, /const EMBEDDABLE_HOSTS = new Set\(\[/u)
// A scheduler's "embed code" is a block of script, so that is what gets
// pasted. The link is taken out of it rather than the paste refused.
assert.match(schedulerEmbed, /export function bookingLinkFromPaste\(/u)
assert.match(schedulerEmbed, /calLink\\s\*:/u)
assert.match(schedulerEmbed, /const EMBED_ASSET =/u)
const staffPage = readFileSync('src/pages/app/WorkspaceStaff.tsx', 'utf8')
assert.match(staffPage, /Booking link or embed code/u)
assert.match(staffPage, /bookingLinkMutation\.mutate\(bookingLinkResolved\)/u)
assert.match(schedulerEmbed, /url\.protocol === 'https:'/u)
assert.match(prospectView, /bookingEmbedUrl && \(/u)
assert.match(prospectView, /sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"/u)
// The embed spans the section, under the copy: a scheduler beside a paragraph
// is too narrow to pick a time in.
assert.match(prospectView, /lg:col-span-2/u)
assert.match(prospectView, /Open the scheduler in a new tab/u)

// The default platform workspace runs real clients, so it holds the same
// settings surface as a tenant workspace: name, client-facing brand, logo, and
// booking link. The opening is narrow on purpose.
const defaultWorkspaceSettings = readFileSync(
  'supabase/migrations/20260728002100_default_workspace_settings.sql',
  'utf8',
)
assert.match(
  defaultWorkspaceSettings,
  /CREATE OR REPLACE FUNCTION public\.workspace_settings_actor_role_v1\(/u,
)
// A private workspace is authorized exactly as before — the settings gate
// delegates rather than reimplementing the staff rules.
assert.match(
  defaultWorkspaceSettings,
  /IF NOT workspace_is_default THEN\s+RETURN public\.workspace_staff_actor_role_v1\(/u,
)
// Platform admin is decided by admin_users plus an active default-workspace
// membership, never by the role that membership happens to carry.
assert.match(
  defaultWorkspaceSettings,
  /IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN\s+RETURN 'platform_admin';/u,
)

// Every settings entry point moves to the new gate...
for (const settingsFunction of [
  'workspace_staff_list_v1',
  'set_workspace_name_v1',
  'set_workspace_logo_v1',
  'set_workspace_client_brand_v1',
  'set_workspace_booking_link_v1',
]) {
  const body = defaultWorkspaceSettings.slice(
    defaultWorkspaceSettings.indexOf(`CREATE OR REPLACE FUNCTION public.${settingsFunction}(`),
  )
  const scoped = body.slice(0, body.indexOf('\n$$;'))
  assert.ok(
    scoped.includes('public.workspace_settings_actor_role_v1('),
    `${settingsFunction} must authorize through the settings gate`,
  )
  // ...and stops repeating the predicate that shut the default workspace out.
  assert.ok(
    !scoped.includes('NOT workspace.is_default'),
    `${settingsFunction} must not exclude the default workspace`,
  )
}

// Staff MUTATIONS stay closed to it. enforce_private_workspace_staff_invariants
// skips the default workspace, so there is no last-owner protection there, and
// platform admin identity is anchored on an active membership in it: removing
// the wrong row would take away the access that authorizes removing it.
assert.doesNotMatch(
  defaultWorkspaceSettings,
  /FUNCTION public\.(begin_workspace_staff_invite_v1|workspace_staff_update_role_v1|workspace_staff_transfer_owner_v1)\(/u,
)
// The roster the default workspace serves carries no action at all, so the page
// never offers a button whose mutation would be refused underneath it.
assert.match(defaultWorkspaceSettings, /WHEN workspace_is_default THEN '\[\]'::JSONB/u)
assert.match(defaultWorkspaceSettings, /'can_update_roles', NOT workspace_is_default/u)
assert.match(defaultWorkspaceSettings, /'can_transfer_owner', NOT workspace_is_default/u)

// The edge function refuses a default-workspace response that claims otherwise.
assert.match(source, /const isDefaultWorkspace = workspace\.is_default === true;/u)
assert.match(
  source,
  /isDefaultWorkspace &&\s+\(inviteRoles\.length > 0 \|\|[\s\S]*?allowed_actions\.length > 0\)\)/u,
)
// Exactly one live owner mirrors a private-workspace invariant the database
// does not apply to the default workspace, so the assertion follows it.
assert.match(source, /!isDefaultWorkspace && members\.filter\(/u)
// The branding read and the name fallback no longer exclude it.
assert.doesNotMatch(source, /\.eq\("is_default", false\)/u)

// The settings page is reached on the default workspace, and says where the
// platform operator accounts are actually managed.
const settingsEntry = readFileSync('src/pages/app/MyWorkspaceSettings.tsx', 'utf8')
assert.match(settingsEntry, /isPlatformAdmin && workspace\?\.is_default/u)
assert.match(staffPage, /const platformRoster = data\?\.workspace\.is_default === true/u)
assert.match(staffPage, /\/app\/manage-workspaces/u)
