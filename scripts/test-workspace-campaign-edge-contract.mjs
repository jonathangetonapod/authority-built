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
const nudgeTick = readFileSync('supabase/functions/inbox-nudge-tick/index.ts', 'utf8')
const enrollTick = readFileSync('supabase/functions/inbox-enroll-tick/index.ts', 'utf8')
const sdrShared = readFileSync('supabase/functions/_shared/inboxSdr.ts', 'utf8')
const prepDialog = readFileSync('src/components/workspace/ClientCampaignPrepDialog.tsx', 'utf8')
const stagingMigration = readFileSync(
  'supabase/migrations/20260728001400_campaign_target_lead_staging.sql',
  'utf8',
)

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
// Only client-attributable replies reach the Master Inbox.
assert.match(edge, /const mapped = providerCampaignId \? campaignByProviderId\.get\(providerCampaignId\) \?\? null : null;[\s\S]*?if \(!mapped\) return \[\];/u)
// Actions that carry no client_id must run before the generic client parse.
const genericParseIndex = edge.indexOf('const clientId = requireUuid(body.client_id, "client_id");\n    const client = await requireWorkspaceClient(')
assert.ok(genericParseIndex > 0, 'generic client_id parse must exist')
for (const handler of ['if (action === "inbox-list")', 'if (action === "inbox-reply")', 'if (action === "inbox-draft")', 'if (action === "inbox-thread-state")']) {
  const handlerIndex = edge.indexOf(handler)
  assert.ok(
    handlerIndex > 0 && handlerIndex < genericParseIndex,
    `${handler} must exist and be handled before the generic client_id requirement`,
  )
}
// The persisted review package survives navigation and marks replies.
assert.match(edge, /from\("workspace_inbox_thread_state"\)[\s\S]*?onConflict: "workspace_id,thread_key"/u)
assert.match(edge, /action === "inbox-thread-state"[\s\S]*?\["needs_reply", "booked", "archived"\]/u)
// Links replace-set safety: conflict-check errors fail closed, deletes only
// remove deselected rows, and inserts never steal a concurrent link.
assert.match(edge, /if \(conflictLinks\.error \|\| conflictCampaigns\.error\) \{/u)
assert.match(edge, /ignoreDuplicates: true/u)
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

// Automated sending is switched off platform-wide (2026-07-26): the nudge
// tick must bail out right after auth, before it can reach a thread or the
// provider. Removing this gate is an explicit product decision, not cleanup.
assert.match(nudgeTick, /const NUDGE_SENDING_DISABLED: boolean = true/u)
assert.match(nudgeTick, /if \(NUDGE_SENDING_DISABLED\) \{\s*\n\s*return json\(200, \{ sent: 0, host_replies: 0, skipped: 0, sending_disabled: true \}\)/u)
assert.ok(
  nudgeTick.indexOf('NUDGE_SENDING_DISABLED) {') < nudgeTick.indexOf('createAdminClient()'),
  'the sending-disabled gate must precede any database or provider access',
)

// Nudge tick safety gates: shared-secret auth, never send on an inbound or
// missing latest message, per-tick caps, and a concurrency-safe step claim.
assert.match(nudgeTick, /Deno\.env\.get\('NUDGE_TICK_SECRET'\)/u)
assert.match(nudgeTick, /x-nudge-secret/u)
assert.match(nudgeTick, /const MAX_SENDS_PER_TICK = 15/u)
assert.match(nudgeTick, /const MAX_SENDS_PER_WORKSPACE = 5/u)
assert.match(nudgeTick, /latestHuman\.ue_type === 2[\s\S]*?status: 'needs_reply'/u)
assert.match(nudgeTick, /\.eq\('nudges_sent', raw\.nudges_sent\)/u)
assert.match(config, /\[functions\.inbox-nudge-tick\]\nverify_jwt = false/u)


// Nudge tick claim-before-send: the step is consumed under a guard that
// re-checks status and pause, sends only on a confirmed claim, refunds only
// definite pre-dispatch rejections, and keeps ambiguous outcomes consumed.
assert.match(nudgeTick, /const \{ data: claimed \}[\s\S]*?\.eq\('nudges_sent', raw\.nudges_sent\)[\s\S]*?\.eq\('status', 'replied'\)[\s\S]*?\.eq\('nudges_paused', false\)/u)
assert.ok(
  nudgeTick.indexOf("const { data: claimed }") < nudgeTick.indexOf("'/emails/reply'"),
  'the nudge step must be claimed before the provider send',
)
assert.match(nudgeTick, /delivery_unknown[\s\S]*?stays consumed/u)
assert.match(nudgeTick, /latestHuman\.ue_type !== 1 && latestHuman\.ue_type !== 3/u)
assert.match(nudgeTick, /is_auto_reply !== 1/u)
assert.match(nudgeTick, /MAX_FAILURES_BEFORE_PAUSE/u)
assert.match(nudgeTick, /withinSendWindow/u)
// Auto-enrollment: opt-in per client, deterministic pre-filter before any
// model call, claim before billing, and review-only output.
assert.match(enrollTick, /Deno\.env\.get\('ENROLL_TICK_SECRET'\)/u)
assert.match(enrollTick, /x-enroll-secret/u)
assert.match(enrollTick, /\.in\('ai_sdr_mode', \['auto_draft', 'auto_send'\]\)/u)
assert.match(enrollTick, /detectDeterministicReply/u)
assert.match(enrollTick, /draft_claim_email_id/u)
assert.ok(
  enrollTick.indexOf('draft_claim_email_id') < enrollTick.indexOf('generateReplyPackage({'),
  'the enrollment claim must precede the model call',
)
assert.match(enrollTick, /status: 'review'/u)
// Automated sending was removed on 2026-07-26: the drafting tick must never
// call the provider send endpoint, and no package may ever become eligible.
// Every generated package stops in review, where a person sends it.
assert.ok(
  !enrollTick.includes('/emails/reply'),
  'the enrollment tick must never call the provider send endpoint',
)
assert.match(enrollTick, /auto_send_eligible_at: null/u)
assert.ok(
  !enrollTick.includes('dispatchDueAutoSends'),
  'the auto-send dispatch phase must stay removed',
)
// The shared module no longer defines send authority for anyone.
assert.ok(
  !sdrShared.includes('AUTO_SEND_LABELS') && !sdrShared.includes('packageIsAutoSendable'),
  'inboxSdr must not export an auto-send gate',
)
// Shared generator: deterministic filters exist and the profile gate holds.
assert.match(sdrShared, /SDR_PROFILE_NOT_READY/u)
assert.match(sdrShared, /OPT_OUT_PATTERNS/u)
// inbox-reply server gates: thread-advanced refusal and the status contract.
assert.match(edge, /THREAD_ADVANCED/u)
assert.match(edge, /\.in\("status", \["needs_reply", "review", "replied"\]\)/u)
assert.match(config, /\[functions\.inbox-enroll-tick\]\nverify_jwt = false/u)

// Per-client AI SDR prompts: owner-gated writes, inbox ids only, and the
// generator resolves client -> workspace -> shipped default.
assert.match(edge, /const CLIENT_PROMPT_IDS = RESEARCH_PROMPT_IDS\.filter\(\(id\) => id !== "host_name_extractor"\)/u)
assert.match(edge, /action === "client-prompts-set"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /action === "client-prompts-reset"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(sdrShared, /from\('client_ai_sdr_prompts'\)[\s\S]*?\.eq\('client_id', clientId\)/u)
assert.match(sdrShared, /clientPrompt[\s\S]*?workspacePrompt[\s\S]*?replyDefault\.content/u)
assert.match(enrollTick, /email\.i_status !== 1\) continue/u)
// The nudge prompt is really consumed: its resolved content is appended to
// the reply call as the nudge-array guidance.
assert.match(sdrShared, /FOLLOW-UP NUDGE GUIDANCE/u)
assert.match(sdrShared, /resolvePrompt\('inbox_nudges', nudgeDefault\.content\)/u)

// Journey links: marking a conversation booked creates the placement against
// the outreach it came from, exactly once, and finishes that target.
assert.match(edge, /status === "booked" && leadEmail[\s\S]*?workspace_client_campaign_targets/u)
assert.match(edge, /campaign_target_id: target\.id[\s\S]*?shortlist_podcast_id: target\.shortlist_podcast_id/u)
assert.match(edge, /\.update\(\{ status: "completed"[\s\S]*?\.in\("status", \["in_outreach", "replied"\]\)/u)
// The launch path enforces the same approval gate as its siblings.
assert.match(edge, /addCampaignTargets\(context, campaign, \[\s*shortlistPodcastId,\s*\], \{ requireApproved: true \}\)/u)
// Scheduled sync: shared secret only, no user input, bounded per run.
assert.match(edge, /Deno\.env\.get\("CAMPAIGN_SYNC_SECRET"\)/u)
assert.match(edge, /x-campaign-sync-secret/u)

// Prompt enrichment: the SDR sees what we pitched and what research found,
// so a reply never repeats the opening email or invents show details.
assert.match(sdrShared, /pitch_sent: pitchSent/u)
assert.match(sdrShared, /podcast_research: podcastResearch/u)
assert.match(sdrShared, /from\('workspace_client_campaign_targets'\)[\s\S]*?pitch_subject, pitch_body/u)

// Send to Client Campaign creates the Instantly lead in the campaign itself
// (Jonathan's decision, 2026-07-27), which means preparing contacts the host
// whenever that campaign is live. Everything below exists because of that.

// The same relationship gate the launch path runs. Without it the faster path
// would be the unguarded one, and an opt-out would be reachable by preparing.
assert.match(
  edge,
  /async function stageCampaignLead\([\s\S]*?workspace_podcast_relationships_v1[\s\S]*?CAMPAIGN_CONTACT_SUPPRESSED[\s\S]*?CAMPAIGN_CONTACT_IN_CONVERSATION/u,
)
// Staging must never activate the campaign — that stays an explicit decision.
const stageBody = edge.match(/async function stageCampaignLead\([\s\S]*?\n\}\n/u)
assert.ok(stageBody, 'stageCampaignLead must exist')
assert.doesNotMatch(
  stageBody[0],
  /\/activate/u,
  'preparing a pitch must not activate the provider campaign',
)
// Copy a host has already received cannot be rewritten underneath them.
assert.match(stageBody[0], /CAMPAIGN_PITCH_LOCKED[\s\S]*?already moved through the sequence/u)
assert.match(stageBody[0], /email_reply_count > 0[\s\S]*?CAMPAIGN_PITCH_LOCKED/u)
// The pasted v2 create-lead endpoint, with the campaign attached.
assert.match(stageBody[0], /instantlyRequest<unknown>\(apiKey, "\/leads", \{[\s\S]*?campaign: providerCampaignValue\.id/u)
assert.match(stageBody[0], /skip_if_in_campaign: true/u)
// Whether the host is now in a sending sequence travels back to the caller, so
// the dialog can never report "saved" when the truth is "sent".
assert.match(stageBody[0], /willSend: providerCampaignValue\.status === 1/u)
assert.match(edge, /will_send: staged\?\.willSend \?\? false/u)
assert.match(edge, /action: "workspace\.client_campaign\.podcast_prepared"[\s\S]*?will_send: staged\?\.willSend \?\? false/u)
// The provider call happens before the local write, so a refusal never leaves a
// row claiming a lead that does not exist.
const prepareAction = edge.match(/action === "prepare-podcast"[\s\S]*?action === "upsert"/u)
assert.ok(prepareAction, 'prepare-podcast action must exist')
assert.ok(
  prepareAction[0].indexOf('await stageCampaignLead(')
    < prepareAction[0].indexOf('.from("workspace_client_campaign_targets")\n        .update({\n          research_notes'),
  'the lead must be created before the target row records it',
)
// Editing stays open until launch: a staged lead is no longer the lock.
assert.match(prepareAction[0], /target\.launched_at \|\|\s+\["launching", "in_outreach", "replied", "completed"\]/u)
assert.doesNotMatch(prepareAction[0], /target\.instantly_lead_id \|\|/u)

// The dialog must state which of the two things the button does.
assert.match(prepDialog, /const submitWillSend = campaignIsLive && validEmail\(normalizedEmail\)/u)
assert.match(prepDialog, /submitWillSend \? 'Send to Client Campaign \(goes live\)' : alreadyStaged \? 'Update in Client Campaign' : 'Send to Client Campaign'/u)
// (the will_send warning moved from a toast into the confirmation panel,
// asserted below)
assert.match(stagingMigration, /ADD COLUMN IF NOT EXISTS lead_staged_at TIMESTAMPTZ/u)
assert.match(stagingMigration, /ADD COLUMN IF NOT EXISTS lead_staged_campaign_status INTEGER/u)

// A consequential action deserves a completion state, not a toast that leaves.
// The dialog holds a confirmation naming the contact, the campaign, and whether
// the sequence is running, with the next step spelled out.
assert.match(prepDialog, /setStagedResult\(\{[\s\S]*?willSend: result\.will_send/u)
assert.match(prepDialog, /aria-label="Pitch added to client campaign"/u)
assert.match(prepDialog, /stagedResult\.willSend \? 'Live — starts automatically' : 'Paused — nothing sends yet'/u)
assert.doesNotMatch(
  prepDialog.match(/onSuccess: async \(result\) => \{[\s\S]*?\n    \},/u)[0],
  /onOpenChange\(false\)/u,
  'a successful send must land on a confirmation, not close the dialog',
)
// Sending into a live campaign asks first, because there is no draft state on
// the other side of it and nothing can be recalled.
assert.match(
  prepDialog,
  /onClick=\{\(\) => \(submitWillSend \? setConfirmSendOpen\(true\) : prepareMutation\.mutate\(\)\)\}/u,
)
assert.match(prepDialog, /Add and start sending/u)
assert.match(prepDialog, /To add the lead without sending, pause/u)
// Reopening a staged podcast says so, so a second send is an update by choice.
assert.match(prepDialog, /const alreadyStaged = Boolean\(target\?\.lead_staged_at\) && !target\?\.launched_at/u)
