import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const studio = readFileSync('supabase/functions/workspace-prospect-dashboards/index.ts', 'utf8')
const publicDashboard = readFileSync('supabase/functions/get-prospect-dashboard/index.ts', 'utf8')
const publicPodcasts = readFileSync('supabase/functions/get-prospect-podcasts/index.ts', 'utf8')
const publicFeedback = readFileSync('supabase/functions/save-prospect-feedback/index.ts', 'utf8')
const queryGeneration = readFileSync('supabase/functions/generate-podcast-queries/index.ts', 'utf8')
const compatibilityScoring = readFileSync('supabase/functions/score-podcast-compatibility/index.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260725000100_workspace_prospect_studio_foundation.sql',
  'utf8',
)
const pendingReviewMigration = readFileSync(
  'supabase/migrations/20260805000100_prospect_pending_review.sql',
  'utf8',
)
const config = readFileSync('supabase/config.toml', 'utf8')

assert.match(studio, /const context = await requireAuthenticatedUser\(req\)/u)
assert.match(studio, /if \(!workspaceCredentialIsFresh\(context\)\)/u)
assert.match(studio, /const access = await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(studio, /const MANAGER_ROLES = new Set\(\['owner', 'admin', 'platform_admin'\]\)/u)
assert.match(studio, /startsWith\('multipart\/form-data'\)[\s\S]*?form\.get\('photo'\)/u, 'photo uploads must use a bounded multipart path')
assert.match(studio, /const PROSPECT_IMAGE_BUCKET = 'prospect-images'/u)
assert.match(studio, /\['image\/jpeg', 'jpg'\][\s\S]*?\['image\/png', 'png'\][\s\S]*?\['image\/webp', 'webp'\]/u)
assert.match(studio, /const MAX_PROSPECT_IMAGE_BYTES = 5 \* 1024 \* 1024/u)
assert.match(studio, /const MAX_PROSPECT_IMAGE_MULTIPART_BYTES = MAX_PROSPECT_IMAGE_BYTES \+ \(64 \* 1024\)/u)
assert.match(studio, /const declaredLength = Number\(req\.headers\.get\('content-length'\)\)[\s\S]*?BODY_TOO_LARGE[\s\S]*?await req\.formData\(\)/u, 'multipart size must be rejected before parsing the upload')
assert.match(studio, /function matchesProspectImageSignature[\s\S]*?INVALID_PHOTO_CONTENT/u, 'photo MIME declarations must be checked against file signatures')
assert.match(studio, /if \(action === 'create'\)[\s\S]*?const dashboardId = requireUuid\(body\.dashboard_id, 'dashboard_id'\)/u, 'create must not require a pre-existing dashboard UUID')
assert.match(studio, /\.from\('prospect_dashboards'\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
assert.match(studio, /if \(action === 'build'\)[\s\S]*?buildProspect\(context, workspaceId, dashboardId\)/u)
assert.match(studio, /model: 'text-embedding-3-small'/u)
assert.match(studio, /model: 'claude-haiku-4-5-20251001'/u)
assert.match(studio, /function fallbackRankCandidates/u)
assert.match(studio, /ranking_source: rankingSource/u)
assert.match(studio, /\.from\('prospect_dashboard_podcasts'\)[\s\S]*?\.upsert\(selected, \{ onConflict: 'prospect_dashboard_id,podcast_id' \}\)/u)
assert.match(studio, /\.in\('match_source', \['legacy', 'sheet', 'semantic', 'ai_ranked'\]\)/u)
assert.match(studio, /rpc\('set_workspace_prospect_publication_v1'/u)
// Publication now means only what the prospect can read. Review is its own
// column, so an edit marks the dashboard without closing it — and the property
// that used to justify closing it, that no unreviewed change reaches a
// prospect, is kept by writing Finder additions hidden instead.
assert.doesNotMatch(
  studio,
  /update\.published_at = null/u,
  'no edit may unpublish a live prospect dashboard',
)
assert.match(
  studio,
  /if \(existing\.published_at\)\s*\{\s*update\.pending_review_at = /u,
  'edits to a live dashboard must mark a pending review',
)
assert.match(studio, /if \(action === 'podcast-add'\)[\s\S]*?prospectShortlistPodcasts\(body\.podcasts\)/u)
assert.match(studio, /action: 'workspace\.prospect\.shortlist\.added'/u)
assert.match(
  studio,
  /const isLive = Boolean\(existing\.published_at\)[\s\S]*?if \(isLive\) await markPendingReview\(\)/u,
  'Finder additions to a live prospect must be marked for review before they are written',
)
assert.match(
  studio,
  /visibility: isLive \? 'archived' : 'visible'/u,
  'Finder additions must be hidden from a live dashboard until they are reviewed',
)
assert.match(studio, /requireManager\(access\)[\s\S]*?if \(action === 'photo-upload'\)/u, 'photo changes must require manager access')
assert.match(studio, /if \(action === 'photo-upload'\)[\s\S]*?const path = `\$\{workspaceId\}\/\$\{dashboardId\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{extension\}`/u)
assert.match(studio, /if \(action === 'photo-upload'\)[\s\S]*?if \(existing\.published_at\)[\s\S]*?update.pending_review_at = now/u, 'a new photo must mark a review without closing the page')
assert.match(studio, /action: 'workspace\.prospect\.photo_uploaded'/u)
assert.match(studio, /if \(action === 'photo-remove'\)[\s\S]*?if \(existing\.published_at\)[\s\S]*?update\.pending_review_at = now/u, 'removing a photo must mark a review without closing the page')
assert.match(studio, /action: 'workspace\.prospect\.photo_removed'/u)
assert.match(config, /\[functions\.workspace-prospect-dashboards\]\s+verify_jwt = true/u)

for (const edge of [queryGeneration, compatibilityScoring]) {
  assert.match(edge, /body\.prospectDashboardId/u)
  assert.match(edge, /\.from\('prospect_dashboards'\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
  assert.match(edge, /await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
}
assert.match(queryGeneration, /function fallbackQueries/u)
assert.match(queryGeneration, /source: 'deterministic'/u)
assert.match(compatibilityScoring, /function deterministicScore/u)

assert.match(migration, /ADD COLUMN IF NOT EXISTS workspace_id UUID/u)
assert.match(migration, /ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'draft'/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.prospect_dashboard_readiness_v1/u)
assert.match(migration, /shortlist\.visible_count >= 5[\s\S]*?shortlist\.analyzed_count >= 5/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_workspace_prospect_publication_v1/u)
assert.match(migration, /workspace_staff_actor_role_v1\([\s\S]*?true[\s\S]*?actor_role NOT IN \('owner', 'admin', 'platform_admin'\)/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_workspace_prospect_publication_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?TO service_role/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.prospect_dashboards FROM anon/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.prospect_dashboard_podcasts FROM anon/u)

// Review lives in its own column, and publishing is the operator saying they are
// happy with what is live, so it clears it. Unpublishing must not: the changes
// are still unreviewed and the studio has to keep saying so.
assert.match(pendingReviewMigration, /ADD COLUMN IF NOT EXISTS pending_review_at TIMESTAMPTZ/u)
assert.match(pendingReviewMigration, /CREATE OR REPLACE FUNCTION public\.set_workspace_prospect_publication_v1/u)
assert.match(
  pendingReviewMigration,
  /pending_review_at = CASE WHEN p_publish THEN NULL ELSE dashboard\.pending_review_at END/u,
  'publishing must clear a pending review and unpublishing must keep it',
)
assert.match(
  pendingReviewMigration,
  /REVOKE ALL ON FUNCTION public\.set_workspace_prospect_publication_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role[\s\S]*?TO service_role/u,
  'the redefined publication function must keep its grants',
)

// Writing feedback still refuses an unpublished dashboard in the query itself:
// nobody is reading the page, so there is nothing to soften.
assert.match(
  publicFeedback,
  /\.eq\('content_ready', true\)[\s\S]*?\.not\('published_at', 'is', null\)/u,
  'prospect feedback must require publication',
)

// The two public reads fetch the row and then refuse it, so an edit in progress
// can answer "being updated" instead of turning a link already in somebody's
// inbox into a dead end. The guarantee is unchanged — nothing unpublished is
// ever served — and on a workspace hostname the host check still comes first,
// so another agency's dashboard does not exist either way.
for (const edge of [publicDashboard, publicPodcasts]) {
  assert.match(
    edge,
    /content_ready !== true \|\| !\w+\.published_at/u,
    'public prospect reads must still refuse an unpublished dashboard',
  )
  assert.match(edge, /'DASHBOARD_UPDATING'/u, 'public prospect reads must answer with the updating code')
  assert.match(edge, /409/u, 'the updating answer must not be a 404')
}
assert.match(
  publicDashboard,
  /requireServedByHost\([\s\S]*?DASHBOARD_UPDATING/u,
  'the host check must run before the dashboard admits to being updated',
)

assert.match(publicPodcasts, /function getCanonicalShortlist[\s\S]*?\.from\('prospect_dashboard_podcasts'\)[\s\S]*?\.eq\('visibility', 'visible'\)/u)
assert.doesNotMatch(publicPodcasts.match(/if \(cacheOnly && prospectDashboardId\)[\s\S]*?if \(!spreadsheetId\)/u)?.[0] || '', /\.from\('prospect_podcast_analyses'\)/u, 'the public cache path must not depend on normalized analyses')
assert.match(publicPodcasts, /materializeCanonicalShortlist\(supabase, prospectDashboardId, orderedPodcasts\)/u)
assert.match(publicFeedback, /\.from\('prospect_dashboard_podcasts'\)[\s\S]*?\.eq\('visibility', 'visible'\)/u)
assert.doesNotMatch(publicFeedback, /\.from\('prospect_podcast_analyses'\)/u)
assert.match(publicFeedback, /first_engaged_at: dashboard\.first_engaged_at \|\| new Date\(\)\.toISOString\(\)/u)
assert.match(publicFeedback, /lifecycle_status: dashboard\.lifecycle_status === 'converted' \? 'converted' : 'engaged'/u)
assert.match(publicDashboard, /brand_name: workspace\.client_brand_name \|\| workspace\.name/u)

process.stdout.write('Workspace Prospect Studio Edge contract checks passed\n')

// A prospect page can say which client it became. The link lives on the client,
// so it has to be read back — and scoped to this workspace, since the slug is a
// public capability URL.
assert.match(
  studio,
  /const linkedClientsResult = slugs\.length > 0[\s\S]*?from\('clients'\)[\s\S]*?\.eq\('workspace_id', workspaceId\)[\s\S]*?\.in\('prospect_dashboard_slug', slugs\)/u,
)
assert.match(studio, /linked_client: clientBySlug\.get\(dashboard\.slug\) \?\? null/u)
