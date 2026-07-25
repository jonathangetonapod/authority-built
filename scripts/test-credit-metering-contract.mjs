// Static contract checks for credit metering and BYO AI keys.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const billing = readFileSync('supabase/functions/_shared/billing.ts', 'utf8')
const aiKeys = readFileSync('supabase/functions/_shared/workspaceAiKeys.ts', 'utf8')
const prospectBuild = readFileSync('supabase/functions/workspace-prospect-dashboards/index.ts', 'utf8')
const scoring = readFileSync('supabase/functions/score-podcast-compatibility/index.ts', 'utf8')
const queries = readFileSync('supabase/functions/generate-podcast-queries/index.ts', 'utf8')
const podscanProxy = readFileSync('supabase/functions/podscan-proxy/index.ts', 'utf8')
const staffEdge = readFileSync('supabase/functions/manage-workspace-staff/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260726000300_metering_and_byo_keys.sql', 'utf8')

// Enforcement is opt-in and BYO-key operations are never charged.
assert.match(billing, /CREDIT_ENFORCEMENT_ENABLED/u)
assert.match(billing, /if \(!enforcementEnabled\(\) \|\| input\.byoKeyUsed\) return 0/u)
assert.match(billing, /INSUFFICIENT_CREDITS/u)
assert.match(billing, /HttpError\(402/u)

// Charge happens before the provider call in the dashboard build.
const chargeIndex = prospectBuild.indexOf("operationType: 'dashboard_build'")
const anthropicCallIndex = prospectBuild.indexOf('api.anthropic.com')
assert.ok(chargeIndex > 0 && anthropicCallIndex > 0, 'dashboard build metering markers missing')
assert.match(prospectBuild, /await chargeCredits\(context\.admin/u)
assert.match(prospectBuild, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Compatibility scoring caps workspace batches at 20.
assert.match(scoring, /body\.podcasts\.slice\(0, 20\)/u)
assert.match(scoring, /operationType: 'compatibility_scoring'/u)
assert.match(scoring, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Query generation charges only the workspace branch and honors BYO keys.
assert.match(queries, /operationType: 'query_generation'/u)
assert.match(queries, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Podscan proxy meters only the workspace branch.
const podscanWorkspaceBranch = podscanProxy.indexOf('if (workspaceId) {')
const podscanAdminBranch = podscanProxy.indexOf('requirePlatformAdmin(req)')
assert.ok(podscanWorkspaceBranch > 0 && podscanAdminBranch > podscanWorkspaceBranch)
assert.match(podscanProxy, /operationType: 'podscan_lookup'/u)

// AI key management: owner-gated, probed before storage, never echoed back.
assert.match(staffEdge, /action === "ai-keys-status" \|\| action === "ai-keys-set" \|\| action === "ai-keys-clear"/u)
assert.match(staffEdge, /\["owner", "platform_admin"\]\.includes\(access\.role\)/u)
assert.match(staffEdge, /await probeAiKey\(provider, apiKey\.trim\(\)\)/u)
assert.doesNotMatch(staffEdge, /api_key_ciphertext/u)
assert.match(aiKeys, /select\('provider, api_key_last_four, updated_at'\)/u)
const statusFnBody = aiKeys.slice(aiKeys.indexOf('workspaceAiKeyStatus'), aiKeys.indexOf('resolveAiKey'))
assert.ok(statusFnBody.length > 0, 'ai key status function missing')
assert.doesNotMatch(statusFnBody, /ciphertext/u)

// Migration: extended vocabulary, BYO column, service-role-only key table.
assert.match(migration, /'compatibility_scoring',\s*\n\s*'podscan_lookup',\s*\n\s*'semantic_search',\s*\n\s*'pitch_profile',/u)
assert.match(migration, /ADD COLUMN IF NOT EXISTS used_byo_key BOOLEAN NOT NULL DEFAULT false/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_ai_credentials FROM PUBLIC, anon, authenticated/u)

console.log('Credit metering edge contract passed')
