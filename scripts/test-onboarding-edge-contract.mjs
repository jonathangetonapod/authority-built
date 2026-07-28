import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const staff = readFileSync('supabase/functions/workspace-onboarding/index.ts', 'utf8')
const client = readFileSync('supabase/functions/client-onboarding/index.ts', 'utf8')
const shared = readFileSync('supabase/functions/_shared/workspaceOnboarding.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260722000500_workspace_onboarding.sql', 'utf8')
const whiteLabelMigration = readFileSync('supabase/migrations/20260722000600_workspace_onboarding_white_label.sql', 'utf8')
const activityMigration = readFileSync('supabase/migrations/20260723000100_workspace_onboarding_activity.sql', 'utf8')
const answerApprovalMigration = readFileSync('supabase/migrations/20260723000200_workspace_onboarding_answer_approval.sql', 'utf8')
const defaultWorkspaceParityMigration = readFileSync('supabase/migrations/20260723000300_default_workspace_onboarding_parity.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const publicPage = readFileSync('src/pages/onboarding/ClientOnboarding.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(config, /\[functions\.workspace-onboarding\]\s+verify_jwt = true/u)
assert.match(config, /\[functions\.client-onboarding\]\s+verify_jwt = false/u)
assert.doesNotMatch(config, /process-onboarding-reminders/u)

assert.match(staff, /requireAuthenticatedUser\(req\)/u)
assert.match(staff, /workspaceCredentialIsFresh\(context\)/u)
assert.match(staff, /workspace_onboarding_staff_list_v1/u)
assert.match(staff, /workspace_onboarding_start_v1/u)
assert.match(staff, /workspace_onboarding_approve_v1/u)
assert.match(staff, /action === 'approve_answers'[\s\S]*?workspace_onboarding_approve_answers_v1/u)
assert.match(staff, /record_workspace_onboarding_change_request_v1/u)
assert.match(staff, /kind: 'changes_requested'/u)
assert.match(staff, /experiencePayload\(body\.experience\)/u)
assert.match(staff, /brandLogoPath/u)
assert.match(staff, /action === 'get_link'[\s\S]*?workspace_onboarding_client_operation_v1/u)
assert.match(staff, /ONBOARDING_LINK_CHANGED/u)
assert.match(staff, /p_action: 'purge_paths'/u)
assert.match(staff, /No database records were deleted/u)
assert.match(staff, /listPrivateOnboardingFiles/u)
assert.doesNotMatch(staff, /console\.(?:log|error)\([^)]*(?:token|recipient|email)/iu)

assert.match(client, /verifyOnboardingCapability\(token, capabilitySecret\(\)\)/u)
assert.match(client, /action === 'metadata'/u)
assert.match(client, /metadata:\s*\{\s*workspace: brand\.workspace,\s*accent_color: brand\.accent_color/u)
assert.match(client, /action === 'get'[\s\S]*?mark_workspace_onboarding_viewed_v1/u)
assert.match(client, /validateOnboardingAnswers/u)
assert.match(client, /hasExpectedSignature/u)
assert.match(client, /createSignedUrl\(path, 900\)/u)
assert.doesNotMatch(client, /console\.(?:log|error)/u)

assert.match(shared, /name: 'HMAC', hash: 'SHA-256'/u)
assert.match(shared, /crypto\.subtle\.digest\('SHA-256'/u)
assert.match(shared, /timingSafeText/u)
assert.match(shared, /whiteLabelOnboardingSender/u)
assert.doesNotMatch(shared, /kind: 'invitation' \| 'reminder'/u)
assert.doesNotMatch(shared, /localStorage|sessionStorage/u)

assert.equal(existsSync('supabase/functions/process-onboarding-reminders/index.ts'), false)

assert.match(migration, /'workspace-onboarding-assets',[\s\S]*?false,[\s\S]*?10485760/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_onboarding_instances FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /workspace_onboarding_template_versions_immutable/u)
assert.match(migration, /workspace_onboarding_answer_revisions_immutable/u)
assert.match(migration, /portal_access_changed', false/u)
assert.match(migration, /client_record_retained', true/u)
assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]+workspace_onboarding[^;]+ TO (?:anon|authenticated)/iu)
assert.match(whiteLabelMigration, /workspace_onboarding_templates_reminders_disabled_check/u)
assert.match(whiteLabelMigration, /DROP FUNCTION IF EXISTS public\.claim_workspace_onboarding_reminders_v1/u)
assert.match(whiteLabelMigration, /experience_logo_path/u)
assert.match(whiteLabelMigration, /workspace\.onboarding\.experience_snapshotted/u)
assert.match(activityMigration, /ADD COLUMN viewed_at TIMESTAMPTZ/u)
assert.match(activityMigration, /mark_workspace_onboarding_viewed_v1/u)
assert.match(activityMigration, /'viewed_at', instance\.viewed_at/u)
assert.match(answerApprovalMigration, /CREATE OR REPLACE FUNCTION public\.workspace_onboarding_approve_answers_v1/u)
assert.match(answerApprovalMigration, /'approval_mode', 'answers_only'/u)
assert.match(answerApprovalMigration, /'profile_created', false/u)
assert.match(answerApprovalMigration, /GRANT EXECUTE ON FUNCTION public\.workspace_onboarding_approve_answers_v1\([\s\S]*?\) TO service_role/u)
assert.doesNotMatch(answerApprovalMigration, /workspace_client_pitch_profiles|workspace_onboarding_profile_drafts/u)
assert.match(defaultWorkspaceParityMigration, /SELECT membership\.role[\s\S]*?IF FOUND THEN[\s\S]*?RETURN actor_role[\s\S]*?is_platform_admin_identity/u)
assert.match(defaultWorkspaceParityMigration, /workspace_onboarding_client_operation_v1\(text,uuid,text,jsonb\)', 2/u)
assert.match(defaultWorkspaceParityMigration, /restriction_count <> expected_restrictions/u)
assert.match(defaultWorkspaceParityMigration, /workspace\.is_default[\s\S]*?seed_workspace_onboarding_template_v1/u)

assert.doesNotMatch(publicPage, /localStorage|sessionStorage/u)
assert.match(publicPage, /meta\.name = 'referrer'/u)
assert.match(publicPage, /meta\.content = 'no-referrer'/u)
assert.match(publicPage, /<PageSEO[\s\S]*?noindex/u)
assert.match(publicPage, /whiteLabel/u)
assert.match(publicPage, /ClientBrandHead/u)
assert.match(publicPage, /CAPABILITY_SCOPE_PATTERN/u)
assert.ok(routes.includes('path="/onboarding/:token" element={<ClientOnboarding />}'))
assert.ok(routes.includes('path="/app/onboarding"'))
assert.ok(routes.includes('path="/admin/workspaces/:workspaceId/onboarding"'))

console.log('Workspace onboarding Edge and browser contracts passed')

// The change-request loop is reachable. The action, the status, and the email
// all existed; nothing in the UI called them, so a thin answer could only be
// approved or left sitting.
const reviewDialog = readFileSync('src/components/onboarding/OnboardingReviewDialog.tsx', 'utf8')
const onboardingPage = readFileSync('src/pages/app/WorkspaceOnboarding.tsx', 'utf8')
assert.match(onboardingPage, /requestOnboardingChanges\(workspaceId, selectedInstanceId, comments\)/u)
assert.match(reviewDialog, /onRequestChanges\(comments\)/u)
// Only noted answers are sent, and a blank or whitespace note is not one.
assert.match(reviewDialog, /body: body\.trim\(\)/u)
assert.match(reviewDialog, /comment\.body\.length > 0 && comment\.body\.length <= 2000/u)
// The edge action refuses fewer than one note, so the button cannot offer a
// round trip that only produces an error.
assert.match(reviewDialog, /disabled=\{busy \|\| comments\.length === 0\}/u)
// This reaches the client's inbox and reopens their link, so the dialog says so
// before it is pressed and the page says so if the send fails.
assert.match(reviewDialog, /reopens their onboarding link/u)
assert.match(onboardingPage, /result\.delivery\?\.status === 'sent'/u)
assert.match(onboardingPage, /the email did not send/u)

// Nothing chases a client automatically — process-onboarding-reminders is not
// deployed and nothing schedules it (asserted above). So the page's job is to
// stop losing track of the ones that went quiet.
const chase = readFileSync('src/lib/onboardingChase.ts', 'utf8')
assert.match(chase, /export const UNOPENED_CHASE_DAYS = 3/u)
assert.match(chase, /export const UNFINISHED_CHASE_DAYS = 7/u)
assert.match(chase, /export const EXPIRING_SOON_DAYS = 3/u)
// A submitted form is the reviewer's move, and an archived or dead one is
// nobody's, so none of them are chased.
assert.match(
  chase,
  /\['submitted', 'approved', 'expired', 'revoked'\]\.includes\(instance\.status\)/u,
)
assert.match(chase, /instance\.archived_at !== null/u)
// An unusable date produces silence rather than a guessed age.
assert.match(chase, /if \(settled \|\| ageDays === null\)/u)

// The counts select the rows they count, and the table can be searched and
// filtered rather than rendering every instance ever created.
assert.match(onboardingPage, /aria-pressed=\{statusFilter === key\}/u)
assert.match(onboardingPage, /aria-label="Filter onboarding by status"/u)
assert.match(onboardingPage, /aria-label="Search onboarding"/u)
assert.match(onboardingPage, /tableInstances\.map\(\(instance\) =>/u)
// Archived rows are finished work: hidden unless asked for, never padding
// another view.
assert.match(
  onboardingPage,
  /statusFilter === 'archived' \? !instance\.archived_at : Boolean\(instance\.archived_at\)/u,
)
// A filtered table says how much it is hiding.
assert.match(onboardingPage, /\{tableInstances\.length\} of \{visibleInstances\.length\} shown/u)
