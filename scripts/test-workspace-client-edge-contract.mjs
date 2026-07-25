import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-clients/index.ts', 'utf8')
const exportEdge = readFileSync('supabase/functions/export-to-google-sheets/index.ts', 'utf8')
const shortlistEdge = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const publicDashboardEdge = readFileSync('supabase/functions/public-client-dashboard/index.ts', 'utf8')
const portalBrandingShared = readFileSync('supabase/functions/_shared/portalBranding.ts', 'utf8')
const clientPodcastsEdge = readFileSync('supabase/functions/get-client-podcasts/index.ts', 'utf8')
const portalPasswordEdge = readFileSync('supabase/functions/manage-client-portal-password/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)
const forwardMigration = readFileSync(
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql',
  'utf8',
)
const shortlistMigration = readFileSync(
  'supabase/migrations/20260723000400_client_shortlist_editor.sql',
  'utf8',
)
const ownerPasswordMigration = readFileSync(
  'supabase/migrations/20260723000500_workspace_owner_password_management.sql',
  'utf8',
)
const portalPasswordRepairMigration = readFileSync(
  'supabase/migrations/20260723000600_fix_client_portal_password_management.sql',
  'utf8',
)
const clientBrandingMigration = readFileSync(
  'supabase/migrations/20260723000700_workspace_client_branding.sql',
  'utf8',
)
const dashboardAlwaysLiveMigration = readFileSync(
  'supabase/migrations/20260724000200_client_dashboards_always_live.sql',
  'utf8',
)
const clientProfileEditingMigration = readFileSync(
  'supabase/migrations/20260724000400_workspace_client_profile_editing.sql',
  'utf8',
)
const clientAiSdrProfileMigration = readFileSync(
  'supabase/migrations/20260725000200_client_ai_sdr_profiles.sql',
  'utf8',
)

assert.match(edge, /if \(req\.method === 'OPTIONS'\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /return errorResponse\(req, METHODS, error\)/u)
assert.match(edge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(edge, /const workspaceId = requireUuid\(body\.workspace_id, 'workspace_id'\)/u)
assert.match(edge, /if \(action === 'research-get' \|\| action === 'detail-get' \|\| action === 'sdr-context-get'\)[\s\S]*?clientId = requireUuid\(body\.client_id, 'client_id'\)/u)
assert.match(edge, /action === 'profile-update'[\s\S]*?requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id', 'bio', 'expected_updated_at'\]\)[\s\S]*?optionalString\(body\.bio, 'bio', 20_000\)/u)
assert.match(edge, /action === 'sdr-profile-update'[\s\S]*?requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id', 'ai_sdr_profile', 'expected_profile_updated_at'\]\)[\s\S]*?aiSdrProfile\(body\.ai_sdr_profile\)/u)
assert.match(edge, /if \(action === 'profile-update'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?\['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\)[\s\S]*?admin\.rpc\('update_workspace_client_profile_v1'/u)
assert.match(edge, /if \(action === 'sdr-profile-update'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?\['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\)[\s\S]*?admin\.rpc\('update_workspace_client_ai_sdr_profile_v1'/u)
assert.match(edge, /if \(action === 'sdr-context-get'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?\.eq\('id', clientId!\)[\s\S]*?\.eq\('workspace_id', workspaceId\)[\s\S]*?safe_to_draft: client\.status === 'active' && readiness\.ready,[\s\S]*?delivery_authorized: false/u)
assert.match(edge, /if \(action === 'detail-get'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(edge, /if \(action === 'dashboard-slug-rotate'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?\['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\)[\s\S]*?admin\.rpc\('rotate_client_dashboard_slug_v1'[\s\S]*?writeAudit\(admin/u)
assert.match(edge, /\.from\('clients'\)[\s\S]*?\.eq\('id', clientId!\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /\.from\('bookings'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(500\)/u)
assert.match(edge, /\.from\('workspace_onboarding_instances'\)[\s\S]*?\.eq\('workspace_id', workspaceId\)[\s\S]*?\.eq\('client_id', clientId!\)/u)
assert.match(edge, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(1_000\)/u)
assert.match(edge, /\.from\('client_podcast_feedback'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(1_000\)/u)
assert.match(edge, /\.from\('outreach_messages'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(5_000\)/u)
assert.match(edge, /viewer_role: access\.role,[\s\S]*?can_manage: \['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\),[\s\S]*?dashboard: \{[\s\S]*?podcast_count: dashboardPodcasts\.length,[\s\S]*?reviewed_count: reviewedCount,[\s\S]*?outreach: \{[\s\S]*?initial_emails_sent: sentOutreach\.length,[\s\S]*?podcasts_contacted: contactedPodcastKeys\.size,[\s\S]*?bookings: bookingsResult\.data \|\| \[\],[\s\S]*?onboarding: access\.role === 'member' \? null : onboardingResult\.data \|\| null/u)
assert.doesNotMatch(edge, /portal_password/u)
assert.match(edge, /const historyTables = \[[\s\S]*?'client_dashboard_podcasts',[\s\S]*?'client_podcast_feedback',[\s\S]*?'podcast_outreach_actions',[\s\S]*?'bookings'/u)
assert.match(edge, /\.range\(offset, offset \+ pageSize - 1\)/u)
assert.match(edge, /existing_podcast_ids: existingPodcastIds/u)
assert.doesNotMatch(edge, /dashboard-visibility-update|set_workspace_client_dashboard_visibility_v1/u)
assert.match(edge, /admin\.rpc\('workspace_client_operation_v2', \{[\s\S]*?p_action: action,[\s\S]*?p_workspace_id: workspaceId,[\s\S]*?p_client_id: clientId,[\s\S]*?p_payload: payload,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.match(edge, /message\.includes\('active workspace staff'\)/u)
assert.match(edge, /message\.includes\('active selected workspace'\)/u)
assert.doesNotMatch(edge, /PREVIEW_READ_ONLY|preview is read-only/u)
assert.match(config, /\[functions\.workspace-clients\]\s+verify_jwt = true/u)
assert.doesNotMatch(edge, /\.select\([^\n]*google_sheet_url/u)

assert.match(shortlistEdge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(shortlistEdge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(shortlistEdge, /const access = await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?requireManager\(access\)/u)
assert.match(shortlistEdge, /\.from\('clients'\)[\s\S]*?\.eq\('id', clientId\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
assert.match(shortlistEdge, /if \(action === 'list'\)[\s\S]*?if \(action === 'catalog-search'\)[\s\S]*?if \(action === 'add'\)[\s\S]*?if \(action === 'update'\)[\s\S]*?if \(action === 'reorder-featured'\)/u)
assert.match(shortlistEdge, /archived_at = visibility === 'archived'[\s\S]*?archived_by = visibility === 'archived'/u)
assert.doesNotMatch(shortlistEdge, /\.from\('client_dashboard_podcasts'\)\.delete\(/u)
assert.match(shortlistEdge, /podscan_email/u)
assert.match(shortlistEdge, /rpc\('reorder_client_shortlist_featured_v1'/u)
assert.match(config, /\[functions\.workspace-client-shortlist\]\s+verify_jwt = true/u)

assert.match(portalPasswordEdge, /const tenantScoped = Object\.hasOwn\(body, 'workspace_id'\)/u)
assert.match(portalPasswordEdge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(portalPasswordEdge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(portalPasswordEdge, /await requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(portalPasswordEdge, /PASSWORD_MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(portalPasswordEdge, /p_client_id: clientId,[\s\S]*?p_workspace_id: workspaceId,[\s\S]*?p_password_hash: passwordHash,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.doesNotMatch(portalPasswordEdge, /password:\s*(?:password|body\.password)[,}]/u)
assert.match(config, /\[functions\.manage-client-portal-password\]\s+verify_jwt = true/u)
assert.match(ownerPasswordMigration, /CREATE OR REPLACE FUNCTION public\.manage_client_portal_password\([\s\S]*?p_workspace_id UUID[\s\S]*?p_token_issued_at BIGINT/u)
assert.match(ownerPasswordMigration, /actor_role NOT IN \('owner', 'platform_admin'\)/u)
assert.match(ownerPasswordMigration, /client\.workspace_id = p_workspace_id/u)
assert.match(ownerPasswordMigration, /password_verifier = EXCLUDED\.password_verifier/u)
assert.match(ownerPasswordMigration, /portal_password = NULL/u)
assert.doesNotMatch(ownerPasswordMigration, /portal_password\s*=\s*p_/u)
assert.match(portalPasswordRepairMigration, /IF workspace_is_default THEN/u)
assert.match(portalPasswordRepairMigration, /membership\.role = 'owner'/u)
assert.match(portalPasswordRepairMigration, /workspace_staff_actor_role_v1\([\s\S]*?p_workspace_id,[\s\S]*?p_actor_user_id,[\s\S]*?p_token_issued_at,[\s\S]*?true/u)
assert.ok(
  portalPasswordRepairMigration.includes(
    '[A-Za-z0-9+/]{22}==\\$[A-Za-z0-9+/]{43}=',
  ),
)
assert.doesNotMatch(portalPasswordRepairMigration, /\{(?:32|[0-9]+),256\}/u)
assert.match(portalPasswordRepairMigration, /NOTIFY pgrst, 'reload schema'/u)

assert.match(shortlistMigration, /ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible'/u)
assert.match(shortlistMigration, /CHECK \(visibility IN \('visible', 'hidden', 'archived'\)\)/u)
assert.match(shortlistMigration, /CREATE OR REPLACE FUNCTION public\.reorder_client_shortlist_featured_v1/u)
assert.match(shortlistMigration, /SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/u)
assert.match(shortlistMigration, /REVOKE ALL ON FUNCTION public\.reorder_client_shortlist_featured_v1\(UUID, TEXT\[\]\)[\s\S]*?FROM PUBLIC, anon, authenticated/u)
assert.match(shortlistMigration, /GRANT EXECUTE ON FUNCTION public\.reorder_client_shortlist_featured_v1\(UUID, TEXT\[\]\)[\s\S]*?TO service_role/u)

assert.match(clientPodcastsEdge, /DATABASE PATH - querying the curated client list/u)
assert.match(clientPodcastsEdge, /\.eq\('visibility', 'visible'\)[\s\S]*?\.order\('is_featured'/u)
assert.doesNotMatch(clientPodcastsEdge, /select\('id,name,bio,google_sheet_url/u)
assert.doesNotMatch(clientPodcastsEdge, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.delete\(\)/u)
assert.match(publicDashboardEdge, /\.eq\('visibility', 'visible'\)/u)
assert.match(publicDashboardEdge, /workspace:workspaces\(id,name,status,logo_path,logo_updated_at\)/u)
assert.match(publicDashboardEdge, /import \{ loadWorkspacePresentation \} from '\.\.\/_shared\/portalBranding\.ts'/u)
assert.match(portalBrandingShared, /\.select\('client_brand_name,client_brand_primary_color,client_brand_accent_color'\)/u)
assert.match(portalBrandingShared, /brandSchemaUnavailable\(canonicalBrandError\)/u)
assert.match(portalBrandingShared, /\.from\('workspace_audit_log'\)[\s\S]*?\.eq\('action', 'workspace\.branding\.client_identity_updated'\)/u)
assert.match(portalBrandingShared, /name: presentedWorkspaceName\(metadata\?\.client_brand_name \?\? workspace\.name\)/u)
assert.match(portalBrandingShared, /primary_color: presentedWorkspaceColor[\s\S]*?accent_color: presentedWorkspaceColor/u)
assert.match(publicDashboardEdge, /if \(action === 'metadata'\)[\s\S]*?dashboard_tagline: dashboard\.dashboard_tagline,[\s\S]*?workspace: dashboard\.workspace,[\s\S]*?if \(action === 'get'\)[\s\S]*?record_public_client_dashboard_view/u)
assert.match(clientBrandingMigration, /client_brand_name TEXT/u)
assert.match(clientBrandingMigration, /client_brand_primary_color TEXT/u)
assert.match(clientBrandingMigration, /client_brand_accent_color TEXT/u)
assert.match(clientBrandingMigration, /WITH latest_compatibility_brand AS[\s\S]*?workspace\.branding\.client_identity_updated[\s\S]*?workspace\.client_brand_name IS NULL/u)
assert.match(dashboardAlwaysLiveMigration, /UPDATE public\.clients[\s\S]*?SET dashboard_enabled = true[\s\S]*?dashboard_slug IS NOT NULL/u)
assert.match(dashboardAlwaysLiveMigration, /UPDATE public\.client_dashboard_podcasts[\s\S]*?visibility = 'archived'[\s\S]*?WHERE visibility = 'hidden'/u)
assert.match(dashboardAlwaysLiveMigration, /CHECK \(visibility IN \('visible', 'archived'\)\)/u)
assert.match(dashboardAlwaysLiveMigration, /CHECK \(dashboard_slug IS NULL OR dashboard_enabled\)/u)
assert.match(dashboardAlwaysLiveMigration, /DROP FUNCTION IF EXISTS public\.set_workspace_client_dashboard_visibility_v1/u)
assert.match(clientProfileEditingMigration, /CREATE OR REPLACE FUNCTION public\.update_workspace_client_profile_v1\([\s\S]*?p_workspace_id UUID[\s\S]*?p_client_id UUID[\s\S]*?p_expected_updated_at TIMESTAMPTZ[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/u)
assert.match(clientProfileEditingMigration, /workspace_staff_actor_role_v1\([\s\S]*?true[\s\S]*?actor_role NOT IN \('owner', 'admin', 'platform_admin'\)/u)
assert.match(clientProfileEditingMigration, /client\.id = p_client_id[\s\S]*?client\.workspace_id = p_workspace_id[\s\S]*?current_updated_at IS DISTINCT FROM p_expected_updated_at/u)
assert.match(clientProfileEditingMigration, /'workspace\.client\.profile_updated'[\s\S]*?'previous_character_count'[\s\S]*?'character_count'[\s\S]*?'cleared'/u)
assert.match(clientProfileEditingMigration, /REVOKE ALL ON FUNCTION public\.update_workspace_client_profile_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;[\s\S]*?GRANT EXECUTE[\s\S]*?TO service_role;/u)
assert.match(clientAiSdrProfileMigration, /ADD COLUMN IF NOT EXISTS ai_sdr_profile JSONB NOT NULL DEFAULT '\{\}'::JSONB/u)
assert.match(clientAiSdrProfileMigration, /CREATE OR REPLACE FUNCTION public\.update_workspace_client_ai_sdr_profile_v1\([\s\S]*?p_expected_profile_updated_at TIMESTAMPTZ[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/u)
assert.match(clientAiSdrProfileMigration, /p_profile - ARRAY\[[\s\S]*?'positioning'[\s\S]*?'booking_details'[\s\S]*?\]::TEXT\[\] <> '\{\}'::JSONB/u)
assert.doesNotMatch(clientAiSdrProfileMigration, /char_length\(p_profile::TEXT\)/u, 'valid per-field maxima must not be rejected because of JSON key overhead')
assert.match(clientAiSdrProfileMigration, /current_profile_updated_at IS DISTINCT FROM p_expected_profile_updated_at[\s\S]*?client\.ai_sdr_profile_updated_at IS NOT DISTINCT FROM p_expected_profile_updated_at/u)
assert.match(clientAiSdrProfileMigration, /'workspace\.client\.ai_sdr_profile_updated'[\s\S]*?'completed_fields'[\s\S]*?'ready'[\s\S]*?'cleared'/u)
assert.match(clientAiSdrProfileMigration, /REVOKE ALL ON FUNCTION public\.update_workspace_client_ai_sdr_profile_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;[\s\S]*?GRANT EXECUTE[\s\S]*?TO service_role;/u)
assert.doesNotMatch(shortlistEdge, /'hidden'/u)
assert.doesNotMatch(publicDashboardEdge, /dashboard_enabled/u)
assert.doesNotMatch(clientPodcastsEdge, /dashboard_enabled/u)

assert.match(exportEdge, /await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(exportEdge, /fields=sheets\.properties/u)
assert.match(exportEdge, /const quotedFirstSheetName = `'/u)
assert.match(exportEdge, /const existingIdsRange = encodeURIComponent\(`\$\{quotedFirstSheetName\}!E2:E`\)/u)
assert.match(exportEdge, /partitionPodcastExports\(podcasts, existingPodcastIds\)/u)
assert.match(exportEdge, /const rows = newPodcasts\.map/u)
assert.match(exportEdge, /from\('client_dashboard_podcasts'\)[\s\S]*?onConflict: 'client_id,podcast_id'/u)
assert.match(exportEdge, /duplicatesSkipped: podcasts\.length - newPodcasts\.length/u)

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation_v2\([\s\S]*?p_token_issued_at BIGINT[\s\S]*?\)\s+RETURNS JSONB/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation\([\s\S]*?actor_is_authorized := public\.is_platform_admin_identity\([\s\S]*?p_actor_user_id,[\s\S]*?actor_email[\s\S]*?\);[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?NOT workspace\.is_default/u)
assert.match(migration, /IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?actor_role := public\.workspace_staff_actor_role_v1\([\s\S]*?p_token_issued_at,[\s\S]*?true[\s\S]*?\);[\s\S]*?ELSE/u)
assert.doesNotMatch(migration, /platform administrator preview is read-only/u)
assert.match(migration, /ELSE[\s\S]*?membership\.workspace_id = p_workspace_id[\s\S]*?membership\.user_id = p_actor_user_id[\s\S]*?p_token_issued_at >= membership\.workspace_access_not_before_epoch[\s\S]*?p_token_issued_at >= workspace\.access_not_before_epoch/u)
assert.match(migration, /IF normalized_action <> 'list' AND actor_role = 'member' THEN[\s\S]*?active workspace manager access is required/u)
assert.match(migration, /'workspace\.client\.(?:created|updated|deleted)'[\s\S]*?'client'[\s\S]*?p_actor_user_id/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) FROM PUBLIC, anon, authenticated;/u)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) TO service_role;/u)
assert.match(forwardMigration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation\([\s\S]*?actor_is_authorized := public\.is_platform_admin_identity/u)
assert.match(forwardMigration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation_v2\([\s\S]*?IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?p_token_issued_at,[\s\S]*?true/u)
assert.doesNotMatch(forwardMigration, /platform administrator preview is read-only/u)

process.stdout.write('Workspace Client Edge contract checks passed\n')
