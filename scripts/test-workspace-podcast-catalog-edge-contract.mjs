import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-podcast-catalog/index.ts', 'utf8')
const shortlistEdge = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const searchHelper = readFileSync('supabase/functions/_shared/podcastSearch.ts', 'utf8')
const foundationMigration = readFileSync('supabase/migrations/20260725000600_workspace_podcast_catalog.sql', 'utf8')
const filterMigration = readFileSync('supabase/migrations/20260725000700_workspace_podcast_catalog_filters.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/workspacePodcastCatalog.ts', 'utf8')
const clientEditor = readFileSync('src/components/workspace/ClientShortlistEditor.tsx', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /rpc\('workspace_podcast_catalog_page_v2'/u)
assert.match(edge, /generatePodcastSearchEmbedding\(search[,)]/u)
assert.match(edge, /p_query_embedding: queryEmbedding/u)
assert.match(edge, /search_mode: search \? \(queryEmbedding \? 'hybrid' : 'keyword'\) : 'browse'/u)
assert.match(edge, /'none'/u)
assert.match(edge, /'last_90_days'/u)
assert.match(edge, /'250k_plus'/u)
assert.match(edge, /requireOnlyKeys\(body,/u)
assert.doesNotMatch(edge, /from\('podcasts'\)/u)

assert.match(foundationMigration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v1/u)
assert.match(filterMigration, /CREATE OR REPLACE FUNCTION public\.workspace_podcast_catalog_page_v2/u)
assert.match(filterMigration, /SECURITY DEFINER/u)
assert.match(filterMigration, /podcast\.podscan_email[\s\S]+\^\[\^\[:space:\]@\]/u)
assert.match(filterMigration, /LEFT JOIN public\.podcast_direct_contacts/u)
assert.match(filterMigration, /verification_status = 'verified'/u)
assert.match(filterMigration, /public\.client_dashboard_podcasts/u)
assert.match(filterMigration, /public\.prospect_dashboard_podcasts/u)
assert.match(filterMigration, /podcast\.embedding <=> p_query_embedding/u)
assert.match(filterMigration, /semantic_candidates AS MATERIALIZED/u)
assert.match(filterMigration, /ORDER BY podcast\.embedding <=> p_query_embedding[\s\S]*?LIMIT 300/u)
assert.match(filterMigration, /podcast_categories::TEXT/u)
assert.match(filterMigration, /normalized_contact = 'none'/u)
assert.match(filterMigration, /normalized_activity = 'last_90_days'/u)
assert.match(filterMigration, /normalized_audience = '10k_50k'/u)
assert.match(
  filterMigration,
  /REVOKE ALL ON FUNCTION public\.workspace_podcast_catalog_page_v2\([\s\S]+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(
  filterMigration,
  /GRANT EXECUTE ON FUNCTION public\.workspace_podcast_catalog_page_v2\([\s\S]+TO service_role;/u,
)
assert.match(searchHelper, /model: EMBEDDING_MODEL/u)
assert.match(searchHelper, /dimensions: EMBEDDING_DIMENSIONS/u)
assert.match(shortlistEdge, /rpc\('workspace_podcast_catalog_page_v2'/u)
assert.match(shortlistEdge, /generatePodcastSearchEmbedding\(query[,)]/u)

assert.match(config, /\[functions\.workspace-podcast-catalog\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-podcast-catalog'/u)
assert.match(service, /audience: params\.audience \|\| 'all'/u)
assert.match(service, /response\.workspace\.id !== canonicalWorkspaceId/u)
assert.match(clientEditor, /Browse database/u)
assert.match(layout, /id: 'podcast-database'[\s\S]+enabled: true/u)
assert.match(routes, /path="\/app\/podcast-database"/u)
assert.match(routes, /path="\/app\/workspaces\/:workspaceId\/podcast-database"/u)

console.log('workspace podcast catalog Edge contract passed')
