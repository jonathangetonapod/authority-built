import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-podcast-catalog/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260725000600_workspace_podcast_catalog.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/workspacePodcastCatalog.ts', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /rpc\('workspace_podcast_catalog_page_v1'/u)
assert.match(edge, /requireOnlyKeys\(body,/u)
assert.doesNotMatch(edge, /from\('podcasts'\)/u)

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v1/u)
assert.match(migration, /SECURITY DEFINER/u)
assert.match(migration, /podcast\.podscan_email[\s\S]+\^\[\^\[:space:\]@\]/u)
assert.match(migration, /LEFT JOIN public\.podcast_direct_contacts/u)
assert.match(migration, /verification_status = 'verified'/u)
assert.match(migration, /public\.client_dashboard_podcasts/u)
assert.match(migration, /public\.prospect_dashboard_podcasts/u)
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.workspace_podcast_catalog_page_v1\([\s\S]+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.workspace_podcast_catalog_page_v1\([\s\S]+TO service_role;/u,
)

assert.match(config, /\[functions\.workspace-podcast-catalog\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-podcast-catalog'/u)
assert.match(service, /response\.workspace\.id !== canonicalWorkspaceId/u)
assert.match(layout, /id: 'podcast-database'[\s\S]+enabled: true/u)
assert.match(routes, /path="\/app\/podcast-database"/u)
assert.match(routes, /path="\/app\/workspaces\/:workspaceId\/podcast-database"/u)

console.log('workspace podcast catalog Edge contract passed')
