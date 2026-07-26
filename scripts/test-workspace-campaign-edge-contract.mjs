import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-client-campaigns/index.ts', 'utf8')
const provider = readFileSync('supabase/functions/_shared/instantly.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260724000100_workspace_client_campaigns.sql',
  'utf8',
)
const sequenceMigration = readFileSync(
  'supabase/migrations/20260724000300_workspace_campaign_sequence_copy.sql',
  'utf8',
)
const config = readFileSync('supabase/config.toml', 'utf8')

assert.match(edge, /if \(req\.method === "OPTIONS"\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /const context = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /const access = await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /const CAMPAIGN_MANAGER_ROLES = new Set\(\["owner", "admin", "platform_admin"\]\)/u)
// The Instantly key is managed by the workspace owner and platform admins
// only — never workspace admins or members.
assert.match(edge, /const INTEGRATION_MANAGER_ROLES = new Set\(\["owner", "platform_admin"\]\)/u)
assert.match(edge, /function requireIntegrationOwner[\s\S]*?!INTEGRATION_MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(edge, /can_manage: INTEGRATION_MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(edge, /action === "connect-instantly"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /action === "disconnect-instantly"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /action === "mailboxes"[\s\S]*?requireOnlyKeys\(body, \["action", "workspace_id"\]\)/u)
assert.match(edge, /action === "mailboxes"[\s\S]*?integrationApiKey\(connection, false\)[\s\S]*?refreshProviderAccounts/u)
assert.match(edge, /action === "mailboxes"[\s\S]*?Promise\.allSettled/u)
// A rejected or under-scoped Instantly key answers 200 with a connection
// state instead of forwarding the provider 401/403 as an HTTP 400.
assert.match(edge, /action === "mailboxes"[\s\S]*?error\.status === 401[\s\S]*?key_rejected[\s\S]*?error\.status === 403[\s\S]*?scope_missing/u)
assert.match(edge, /action === "mailboxes"[\s\S]*?if \(!Array\.isArray\(accounts\)\)[\s\S]*?reason: accounts\.auth_failure/u)
assert.match(edge, /action === "launch-pitch"[\s\S]*?requireCampaignManager\(access\)/u)
// Client ↔ Instantly campaign links: manager-gated writes, one client per
// campaign, and inbox attribution that tolerates the pre-migration state.
assert.match(edge, /action === "client-links-set"[\s\S]*?requireCampaignManager\(access\)/u)
assert.match(edge, /action === "client-links-set"[\s\S]*?CAMPAIGN_ALREADY_LINKED/u)
assert.match(edge, /action === "client-links-set"[\s\S]*?CAMPAIGN_NOT_FOUND/u)
assert.match(edge, /from\("client_instantly_campaign_links"\)[\s\S]*?\.eq\("workspace_id", workspaceId\)/u)
assert.match(edge, /const linkRows = linksResult\.error \? \[\] : linksResult\.data \?\? \[\]/u)
// The inbox list needs no client id and must run before the client parse.
assert.ok(
  edge.indexOf('if (action === "inbox-list")') < edge.indexOf('const clientId = requireUuid(body.client_id, "client_id")'),
  'inbox-list must be handled before the generic client_id requirement',
)
assert.match(edge, /action === "prepare-podcast"[\s\S]*?requireCampaignManager\(access\)/u)
assert.match(edge, /action === "prepare-podcast"[\s\S]*?CAMPAIGN_NOT_ASSIGNED[\s\S]*?requireApproved: true/u)
assert.match(edge, /action === "update-contact"[\s\S]*?requireCampaignManager\(access\)/u)
assert.match(edge, /action === "add-podcasts"[\s\S]*?requireCampaignManager\(access\)[\s\S]*?CAMPAIGN_NOT_ASSIGNED[\s\S]*?addCampaignTargets[\s\S]*?requireApproved: true/u)
assert.match(edge, /options\.requireApproved[\s\S]*?CAMPAIGN_TARGET_NOT_APPROVED/u)
assert.match(edge, /\.from\("clients"\)[\s\S]*?\.eq\("id", clientId\)[\s\S]*?\.eq\("workspace_id", workspaceId\)/u)
assert.match(edge, /encryptInstantlyApiKey\(apiKey\)/u)
assert.match(edge, /api_key_ciphertext: encrypted\.ciphertext[\s\S]*?api_key_iv: encrypted\.iv[\s\S]*?api_key_last_four: apiKey\.slice\(-4\)/u)
assert.match(edge, /providerCampaignName[\s\S]*?GOAP-\$\{campaign\.id\}/u)
assert.match(edge, /verifyProviderReadAccess[\s\S]*?"\/campaigns"[\s\S]*?"\/leads\/list"/u)
assert.match(edge, /listProviderCampaigns[\s\S]*?starting_after[\s\S]*?provider_campaigns/u)
assert.match(edge, /provider_campaign_id[\s\S]*?CAMPAIGN_ALREADY_MAPPED/u)
assert.match(edge, /if \(!campaign\.instantly_campaign_id\) \{[\s\S]*?ensureProviderCampaign\(context, campaign, apiKey\)/u)
assert.match(edge, /skip_if_in_workspace: false,[\s\S]*?skip_if_in_campaign: false,[\s\S]*?skip_if_in_list: false/u)
assert.match(edge, /CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH/u)
assert.match(edge, /\.from\("podcast_outreach_actions"\)[\s\S]*?webhook_response_status[\s\S]*?CAMPAIGN_PREVIOUS_OUTREACH_EXISTS/u)
assert.match(edge, /\.eq\("campaign_id", campaign\.id\)[\s\S]*?\.eq\("contact_email", target\.contact_email\)/u)
assert.match(edge, /provider_sync_state: "creating"[\s\S]*?\.in\("provider_sync_state", \["idle", "error"\]\)/u)
assert.match(edge, /provider_sync_state", "creating"[\s\S]*?\.lt\("provider_sync_started_at", staleBefore\)/u)
assert.doesNotMatch(edge, /subsequence|workspace[_ -]group/iu)
assert.match(edge, /goapFollowUpOneSubject/u)
assert.match(edge, /goapFollowUpOneBody/u)
assert.match(edge, /goapFollowUpTwoSubject/u)
assert.match(edge, /goapFollowUpTwoBody/u)
assert.match(edge, /variables: \[[\s\S]*?"goapFollowUpOneSubject"[\s\S]*?"goapFollowUpTwoBody"/u)

const connectionProjection = edge.match(/function connectionDto[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u)?.[1]
assert.ok(connectionProjection, 'the integration response must use an explicit DTO')
assert.match(connectionProjection, /api_key_last_four/u)
assert.doesNotMatch(connectionProjection, /api_key_ciphertext|api_key_iv/u)

assert.match(provider, /const INSTANTLY_API_ORIGIN = "https:\/\/api\.instantly\.ai"/u)
assert.match(provider, /const INSTANTLY_API_PREFIX = "\/api\/v2"/u)
assert.match(provider, /Deno\.env\.get\("INSTANTLY_CREDENTIAL_ENCRYPTION_KEY"\)/u)
assert.match(provider, /AES-GCM/u)
assert.match(provider, /Authorization: `Bearer \$\{apiKey\}`/u)
assert.match(provider, /path\.includes\(":\/\/"\)/u)
assert.match(provider, /"\/workspaces\/current"/u)
assert.match(provider, /"\/accounts"/u)
assert.match(provider, /include_tags: "true"/u)
assert.match(provider, /"\/accounts\/analytics\/daily"/u)
assert.match(provider, /"\/accounts\/warmup-analytics"/u)
assert.match(provider, /const MAX_DAILY_ANALYTICS_EMAILS = 200/u)
assert.match(provider, /const MAX_WARMUP_ANALYTICS_EMAILS = 100/u)

for (const table of [
  'workspace_instantly_integrations',
  'workspace_client_campaigns',
  'workspace_client_campaign_targets',
]) {
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'u'))
  assert.match(
    migration,
    new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'u'),
  )
  assert.match(
    migration,
    new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE[\\s\\S]*?ON TABLE public\\.${table} TO service_role`, 'u'),
  )
}
assert.match(migration, /provider_workspace_id UUID NOT NULL UNIQUE/u)
assert.match(migration, /UNIQUE \(workspace_id, client_id\)/u)
assert.match(migration, /UNIQUE \(campaign_id, shortlist_podcast_id\)/u)
assert.match(migration, /FOREIGN KEY \(workspace_id, client_id, campaign_id\)[\s\S]*?REFERENCES public\.workspace_client_campaigns\(workspace_id, client_id, id\)/u)
for (const column of [
  'research_notes',
  'follow_up_1_subject',
  'follow_up_1_body',
  'follow_up_2_subject',
  'follow_up_2_body',
]) {
  assert.match(sequenceMigration, new RegExp(`ADD COLUMN ${column} TEXT`, 'u'))
}
assert.match(sequenceMigration, /research_notes IS NULL OR char_length\(research_notes\) <= 10000/u)
assert.match(sequenceMigration, /follow_up_1_subject IS NULL OR char_length\(follow_up_1_subject\) <= 300/u)
assert.match(sequenceMigration, /follow_up_2_body IS NULL OR char_length\(follow_up_2_body\) <= 20000/u)
assert.match(config, /\[functions\.workspace-client-campaigns\]\s+verify_jwt = true/u)

// Workspace research prompts: owner-gated writes, workspace-scoped before the
// client_id requirement, and generated frontend defaults in sync with the
// canonical docs/pitch-research-prompts.json.
const promptsMigration = readFileSync('supabase/migrations/20260726000400_workspace_research_prompts.sql', 'utf8')
assert.match(promptsMigration, /char_length\(content\) BETWEEN 1 AND 20000/u)
assert.match(promptsMigration, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_research_prompts FROM PUBLIC, anon, authenticated/u)
assert.match(edge, /if \(action === "prompts-set"\)[\s\S]*?requireIntegrationOwner\(access\)[\s\S]*?requireResearchPromptId\(body\.prompt_id\)[\s\S]*?requireString\(body\.content, "content", \{ max: 20_000 \}\)/u)
assert.match(edge, /if \(action === "prompts-reset"\)[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /workspace\.research_prompts\.updated/u)
assert.match(edge, /workspace\.research_prompts\.reset/u)
const promptsGetIndex = edge.indexOf('action === "prompts-get"')
const clientIdRequirement = edge.indexOf('const clientId = requireUuid(body.client_id, "client_id")')
assert.ok(promptsGetIndex > 0 && clientIdRequirement > promptsGetIndex, 'prompt actions must not require client_id')

const canonicalPrompts = JSON.parse(readFileSync('docs/pitch-research-prompts.json', 'utf8'))
const generatedDefaults = readFileSync('src/lib/researchPromptDefaults.ts', 'utf8')
for (const [promptId, prompt] of Object.entries(canonicalPrompts.prompts)) {
  assert.ok(
    generatedDefaults.includes(JSON.stringify(prompt.content)),
    `researchPromptDefaults.ts is out of sync with docs JSON for ${promptId} — regenerate it`,
  )
  assert.ok(
    generatedDefaults.includes(JSON.stringify(prompt.system)),
    `researchPromptDefaults.ts system prompt out of sync for ${promptId}`,
  )
}

process.stdout.write('Workspace Client Campaign Edge contract checks passed\n')
