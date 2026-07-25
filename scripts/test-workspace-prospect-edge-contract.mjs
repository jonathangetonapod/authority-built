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
const config = readFileSync('supabase/config.toml', 'utf8')

assert.match(studio, /const context = await requireAuthenticatedUser\(req\)/u)
assert.match(studio, /if \(!workspaceCredentialIsFresh\(context\)\)/u)
assert.match(studio, /const access = await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(studio, /const MANAGER_ROLES = new Set\(\['owner', 'admin', 'platform_admin'\]\)/u)
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
assert.match(studio, /if \(existing\.published_at\)[\s\S]*?update\.published_at = null[\s\S]*?update\.content_ready = false/u, 'profile edits must unpublish stale positioning')
assert.match(studio, /if \(action === 'podcast-add'\)[\s\S]*?prospectShortlistPodcasts\(body\.podcasts\)/u)
assert.match(studio, /action: 'workspace\.prospect\.shortlist\.added'/u)
assert.match(studio, /lifecycle_status: 'review'[\s\S]*?published_at: null[\s\S]*?content_ready: false/u, 'Finder additions must return a live prospect to review')
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

for (const edge of [publicDashboard, publicPodcasts, publicFeedback]) {
  assert.match(edge, /\.eq\('content_ready', true\)[\s\S]*?\.not\('published_at', 'is', null\)/u, 'every public prospect action must require publication')
}
assert.match(publicPodcasts, /function getCanonicalShortlist[\s\S]*?\.from\('prospect_dashboard_podcasts'\)[\s\S]*?\.eq\('visibility', 'visible'\)/u)
assert.doesNotMatch(publicPodcasts.match(/if \(cacheOnly && prospectDashboardId\)[\s\S]*?if \(!spreadsheetId\)/u)?.[0] || '', /\.from\('prospect_podcast_analyses'\)/u, 'the public cache path must not depend on normalized analyses')
assert.match(publicPodcasts, /materializeCanonicalShortlist\(supabase, prospectDashboardId, orderedPodcasts\)/u)
assert.match(publicFeedback, /\.from\('prospect_dashboard_podcasts'\)[\s\S]*?\.eq\('visibility', 'visible'\)/u)
assert.doesNotMatch(publicFeedback, /\.from\('prospect_podcast_analyses'\)/u)
assert.match(publicFeedback, /first_engaged_at: dashboard\.first_engaged_at \|\| new Date\(\)\.toISOString\(\)/u)
assert.match(publicFeedback, /lifecycle_status: dashboard\.lifecycle_status === 'converted' \? 'converted' : 'engaged'/u)
assert.match(publicDashboard, /brand_name: workspace\.client_brand_name \|\| workspace\.name/u)

process.stdout.write('Workspace Prospect Studio Edge contract checks passed\n')
