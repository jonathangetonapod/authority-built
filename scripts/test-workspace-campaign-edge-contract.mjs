import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

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
const leadInterestMigration = readFileSync(
  'supabase/migrations/20260728001500_inbox_lead_interest.sql',
  'utf8',
)
const masterInbox = readFileSync('src/components/workspace/MasterInboxPreview.tsx', 'utf8')
const campaignDetail = readFileSync('src/pages/app/WorkspaceCampaignDetail.tsx', 'utf8')
const outreachSuite = readFileSync('src/pages/app/WorkspaceOutreachSuite.tsx', 'utf8')
const scheduleMigration = readFileSync(
  'supabase/migrations/20260728001600_campaign_provider_schedule.sql',
  'utf8',
)
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

// Removing a staged podcast: the undo. Deleting the provider lead stops what
// has not been sent; nothing can recall what has, and the confirmation says so.
assert.match(edge, /action === "unstage-podcast"[\s\S]*?requireCampaignManager\(access\)/u)
const unstageAction = edge.match(/action === "unstage-podcast"[\s\S]*?action === "upsert"/u)
assert.ok(unstageAction, 'unstage-podcast action must exist')
assert.match(unstageAction[0], /method: "DELETE"/u)
assert.match(unstageAction[0], /`\/leads\/\$\{encodeURIComponent\(target\.instantly_lead_id\)\}`/u)
// Launched outreach owns approval, an activated campaign, and reply tracking;
// unwinding it here would leave launched_at pointing at a deleted lead.
assert.match(unstageAction[0], /if \(target\.launched_at\)[\s\S]*?CAMPAIGN_TARGET_ALREADY_LAUNCHED/u)
// Already gone at the provider is the state we asked for, not a failure.
assert.match(unstageAction[0], /error instanceof InstantlyApiError && error\.status === 404[\s\S]*?if \(!missing\) throw error/u)
assert.match(unstageAction[0], /instantly_lead_id: null,[\s\S]*?lead_staged_at: null,[\s\S]*?lead_staged_campaign_status: null/u)
assert.match(unstageAction[0], /action: "workspace\.client_campaign\.lead_removed"/u)
assert.match(provider, /method\?: "GET" \| "POST" \| "PATCH" \| "DELETE"/u)
assert.match(prepDialog, /removeWorkspaceCampaignLead/u)
assert.match(prepDialog, /cannot recall what has/u)
// A refused send stays on screen next to the draft it refers to.
assert.match(prepDialog, /const \[prepareError, setPrepareError\] = useState<string \| null>\(null\)/u)
assert.match(prepDialog, /role="alert"[\s\S]*?This pitch was not sent to Client Campaign/u)
assert.doesNotMatch(
  prepDialog.match(/const prepareMutation = useMutation\(\{[\s\S]*?\n  \}\)/u)[0],
  /toast\.error/u,
  'a refused send belongs in the dialog, not in a notification that fades',
)

// Marking a conversation interested has to move it. The write goes to the LEAD
// via /leads/update-interest-status, while the bucket is decided by i_status on
// the provider's EMAIL rows — different records, so the operator's decision is
// recorded locally and read in preference to what the emails still say.
assert.match(edge, /action === "inbox-interest-set"[\s\S]*?from\("workspace_inbox_lead_interest"\)[\s\S]*?\.upsert\(\{[\s\S]*?contact_email: leadEmail\.trim\(\)\.toLowerCase\(\)/u)
assert.match(edge, /interested: interestByLeadEmail\.has\(leadEmail\)\s+\? interestByLeadEmail\.get\(leadEmail\) === 1\s+: interestValue === 1/u)
assert.match(edge, /interest_status: interestByLeadEmail\.has\(leadEmail\)/u)
// Same normalization trap as the suppression list: a stored override that does
// not match lower(btrim(...)) would silently apply to nobody.
assert.match(
  leadInterestMigration,
  /CONSTRAINT workspace_inbox_lead_interest_email_normalized_check\s+CHECK \(contact_email = lower\(btrim\(contact_email\)\) AND contact_email <> ''\)/u,
)
assert.match(leadInterestMigration, /CREATE POLICY workspace_inbox_lead_interest_isolation/u)
assert.match(leadInterestMigration, /FORCE ROW LEVEL SECURITY/u)
// The conversation is followed into its new bucket rather than vanishing.
assert.match(masterInbox, /const movedTo: InboxScope = input\.value === 1 \? 'interested' : 'other'[\s\S]*?setScope\(movedTo\)/u)
assert.match(masterInbox, /selectedThread\.interest_status \?\? leadDetail\?\.interest_status \?\? null/u)

// An opt-out is usually only ever seen in the reply itself. The automatic
// prefilter suppresses threads it processes; a request to stop on any other
// thread had nowhere to go, so the inbox offers the action directly.
assert.match(masterInbox, /const suppressMutation = useMutation\(\{[\s\S]*?addOutreachSuppression\(workspaceId, \{[\s\S]*?reason: 'opted_out'/u)
// Archiving is best-effort: the suppression is the part that must not be lost.
assert.match(masterInbox, /setWorkspaceInboxThreadStatus\(workspaceId, \{[\s\S]*?status: 'archived',\s+\}\)\.catch\(\(\) => undefined\)/u)
assert.match(masterInbox, /excluded from outreach for every client in this workspace/u)
// An address already on the list is stated, not offered for suppressing again.
assert.match(masterInbox, /selectedThread\.suppressed \?/u)
assert.match(edge, /suppressed: suppressedEmails\.has\(leadEmail\)/u)
assert.match(edge, /from\("workspace_outreach_suppressions"\)\s+\.select\("contact_email"\)/u)

// A request to stop must be caught wherever it arrives, not only on threads the
// enroll tick happens to process — it processes none while a client's SDR
// profile is incomplete, which is how a plain opt-out stayed contactable.
assert.match(edge, /opt_out_detected: detectDeterministicReply\(bodyText \|\| ""\) === "opt_out"/u)
assert.match(sdrShared, /do\\s\+not\\s\+\(\?:send\|reply\|respond\|write\)/u)
assert.match(masterInbox, /They asked to stop — add to do not contact/u)
assert.match(masterInbox, /optOutsAwaitingAction: threads\.filter\(\(thread\) => \(\s+thread\.opt_out_detected && !thread\.suppressed/u)
// Activating a campaign changes what a button on another page does. That is
// stated at the moment of the decision rather than discovered afterwards.
assert.match(campaignDetail, /This also changes Send to Client Campaign/u)
assert.match(campaignDetail, /without a separate launch step/u)
assert.match(
  campaignDetail,
  /onClick=\{\(\) => \(campaignIsRunning \? runningMutation\.mutate\(false\) : setConfirmActivateOpen\(true\)\)\}/u,
)
// Pausing needs no confirmation: it only ever reduces what goes out.
assert.equal(
  [...campaignDetail.matchAll(/setConfirmActivateOpen\(true\)/gu)].length,
  2,
  'both activation controls must confirm, and neither pause path may',
)

// The schedule page asserted "Monday–Friday, 9-5, 15+ minutes" from hardcoded
// strings under a heading claiming it was what Instantly applied. Nothing read
// the provider, so the card could not disagree with reality. It now reports
// what the campaign actually holds.
assert.match(edge, /interface ProviderSchedule \{[\s\S]*?days: boolean\[\];/u)
assert.match(edge, /provider_schedule: provider\.schedule,\s+provider_email_gap: provider\.emailGap,/u)
assert.match(edge, /provider_schedule: campaign\.provider_schedule \?\? null/u)
assert.match(scheduleMigration, /ADD COLUMN IF NOT EXISTS provider_schedule JSONB/u)
assert.match(scheduleMigration, /ADD COLUMN IF NOT EXISTS provider_email_gap INTEGER/u)
// No hardcoded window may survive on that page.
assert.doesNotMatch(campaignDetail, /The standard safe window applied to this campaign/u)
for (const claim of ['Monday–Friday', '9:00 AM–5:00 PM', '15\\+ minutes']) {
  assert.doesNotMatch(
    campaignDetail,
    new RegExp(`>${claim}<`, 'u'),
    `"${claim}" must be read from Instantly, never asserted`,
  )
}
// Unsynced reads as unknown rather than as the old default.
assert.match(campaignDetail, /Nothing read yet[\s\S]*?deliberately blank rather than guessed/u)
// The day-index convention is stated where it is applied, and to the operator.
assert.match(campaignDetail, /Instantly's API reference does not state which day index is Sunday/u)
assert.match(campaignDetail, /Their API reference does not state it, so check this against the campaign in Instantly once/u)
assert.match(campaignDetail, /providerTimezoneMismatch/u)

// The Master Inbox connection badge was a static element reading "not
// connected" whenever the module was open, including above replies it had just
// loaded. It now shares the inbox query so the two cannot disagree.
assert.match(outreachSuite, /queryKey: \['workspace-inbox', effectiveWorkspace\?\.id \?\? ''\]/u)
assert.match(outreachSuite, /inboxConnectionQuery\.data\?\.connected\s*\?/u)
assert.match(outreachSuite, /Instantly key rejected/u)

// Do-not-contact is enforced on the way out. The inbox is the one place a
// suppressed address can be emailed by hand, often on the reply that asked.
assert.match(
  edge,
  /action === "inbox-reply"[\s\S]*?from\("workspace_outreach_suppressions"\)[\s\S]*?INBOX_CONTACT_SUPPRESSED/u,
)
// The gate precedes the provider send, not merely the status write.
const replyAction = edge.match(/action === "inbox-reply"[\s\S]*?action === "inbox-lead-detail"/u)
assert.ok(replyAction, 'inbox-reply action must exist')
assert.ok(
  replyAction[0].indexOf('INBOX_CONTACT_SUPPRESSED')
    < replyAction[0].indexOf('"/emails/reply"'),
  'a suppressed address must be refused before anything is sent',
)
assert.match(masterInbox, /This address is on the do-not-contact list/u)

// A paged provider inbox shared by every campaign can push a client's reply
// past the end. Silence would make a short window look like the whole inbox.
assert.match(edge, /let truncated = false;/u)
assert.match(edge, /if \(page === 2\) truncated = true;/u)
assert.match(edge, /if \(page > 0 && error\.status === 429\) \{\s+truncated = true;/u)
assert.match(masterInbox, /Showing the most recent replies only/u)

// Inbox replies: both provider-facing inputs arrive from the browser, so both
// are bounded before anything is sent.
assert.match(edge, /INBOX_SENDER_NOT_CONNECTED/u)
assert.match(edge, /connectedAccounts\.size > 0 && !connectedAccounts\.has\(eaccount\.toLowerCase\(\)\)/u)
assert.match(edge, /INBOX_MESSAGE_NOT_ATTRIBUTED/u)
assert.ok(
  replyAction[0].indexOf('INBOX_SENDER_NOT_CONNECTED') < replyAction[0].indexOf('"/emails/reply"')
    && replyAction[0].indexOf('INBOX_MESSAGE_NOT_ATTRIBUTED') < replyAction[0].indexOf('"/emails/reply"'),
  'both gates must precede the provider send',
)

// Nudges follow the campaign's real window, not a fixed weekday assumption
// that could disagree with it in either direction.
assert.match(sdrShared, /export function withinSendWindow\(timezone: string, window\?: CampaignSendWindow \| null\)/u)
assert.match(sdrShared, /if \(to <= from\) return true/u)
assert.match(nudgeTick, /\.select\('timezone, provider_schedule'\)/u)
assert.match(nudgeTick, /withinSendWindow\(\s*timezoneByClient\.get\(raw\.client_id\)!,\s*windowByClient\.get\(raw\.client_id\) \?\? null,/u)

// The reading pane read received mail only, so an operator answered having
// never seen what was pitched. The full thread is available on request, and
// only for campaigns this workspace has claimed.
assert.match(edge, /action === "inbox-thread-messages"/u)
const threadMessagesAction = edge.match(/action === "inbox-thread-messages"[\s\S]*?action === "inbox-draft"/u)
assert.ok(threadMessagesAction, 'inbox-thread-messages action must exist')
assert.match(threadMessagesAction[0], /if \(!campaignId \|\| !claimed\.has\(campaignId\)\) return \[\]/u)
assert.match(threadMessagesAction[0], /direction: email\.ue_type === 2 \? "inbound" : "outbound"/u)
assert.match(masterInbox, /Show what we sent/u)
// One provider call per thread, so it loads on request rather than with the list.
assert.match(masterInbox, /enabled: showFullThread && Boolean\(workspaceId\) && Boolean\(selectedThread\?\.thread_key\)/u)
// History is per-conversation and must not carry across threads.
assert.match(masterInbox, /setSelectedThreadId\(threadId\)[\s\S]{0,220}setShowFullThread\(false\)/u)

// "Not ready" now names the fields, instead of sending the operator to hunt.
assert.match(masterInbox, /missingSdrFields/u)
assert.match(masterInbox, /threadClient\?\.ai_sdr_profile_ready === false/u)

// Campaign totals refresh: one provider call for the whole workspace, using
// the list analytics endpoint rather than one overview call per client.
const campaignsPage = readFileSync('src/pages/app/WorkspaceCampaigns.tsx', 'utf8')
const campaignService = readFileSync('src/services/workspaceCampaigns.ts', 'utf8')

assert.match(provider, /"\/campaigns\/analytics"/u)
assert.match(provider, /query\.append\("ids", id\)/u)
assert.match(provider, /exclude_total_leads_count/u)
// Only campaigns that were asked for may be written back: dropping the filter
// makes the endpoint answer for every campaign on the API key.
assert.match(provider, /if \(!requested\.has\(campaignId\)\) continue;/u)
// The list endpoint does not report these, so a bulk refresh must not zero them.
assert.match(
  provider,
  /export function withStoredOpportunityCounts[\s\S]*?total_interested: fresh\.total_interested \|\| previous\.total_interested/u,
)
assert.match(
  provider,
  /export function withStoredOpportunityCounts[\s\S]*?total_meeting_booked: fresh\.total_meeting_booked \|\|\s*previous\.total_meeting_booked/u,
)

// Sliced to the next action rather than to one named handler, so moving this
// block does not silently widen the slice over unrelated code.
const refreshAnalyticsAction = edge.match(
  /action === "refresh-analytics"[\s\S]*?\n {4}if \(action ===/u,
)
assert.ok(refreshAnalyticsAction, 'refresh-analytics action must exist')
assert.match(refreshAnalyticsAction[0], /requireOnlyKeys\(body, \["action", "workspace_id"\]\)/u)
assert.match(refreshAnalyticsAction[0], /requireCampaignManager\(access\)/u)
assert.match(refreshAnalyticsAction[0], /INSTANTLY_NOT_CONNECTED/u)
// A campaign mid-sync is left to its own writer.
assert.match(refreshAnalyticsAction[0], /\.in\("provider_sync_state", \["idle", "error"\]\)/u)
assert.match(refreshAnalyticsAction[0], /listInstantlyCampaignAnalytics\(/u)
assert.match(refreshAnalyticsAction[0], /withStoredOpportunityCounts\(/u)
// Totals are not per-recipient state: stamping last_synced_at here would claim
// a full sync that never ran.
assert.doesNotMatch(
  refreshAnalyticsAction[0],
  /last_synced_at:/u,
  'a totals refresh must not claim a full campaign sync',
)
assert.match(refreshAnalyticsAction[0], /workspace\.client_campaign\.analytics_refreshed/u)
// A campaign the provider no longer answers for keeps its last known numbers.
assert.match(refreshAnalyticsAction[0], /if \(!fresh\) \{\s*missing \+= 1;\s*return;\s*\}/u)

assert.match(campaignService, /action: 'refresh-analytics'/u)
assert.match(campaignsPage, /refreshWorkspaceCampaignAnalytics\(workspaceId\)/u)
assert.match(campaignsPage, /Refresh totals/u)
// The count that could not be refreshed is reported, not folded into success.
assert.match(campaignsPage, /result\.missing > 0/u)

// Mailboxes: the sending day is the campaign's day, mailboxes carry the client
// they send for, and connecting one writes the campaign that does the sending.
const mailboxInfra = readFileSync('supabase/functions/workspace-mailbox-infra/index.ts', 'utf8')
const mailboxesTable = readFileSync('src/components/workspace/MailboxesTable.tsx', 'utf8')
const infraCard = readFileSync('src/components/workspace/MailboxInfraCard.tsx', 'utf8')

// A UTC day rolls over during the American sending window, so an afternoon of
// sending read as zero from late afternoon onwards.
assert.match(provider, /export function localCalendarDay\(timeZone: string/u)
assert.match(provider, /new Intl\.DateTimeFormat\("en-CA", \{\s*timeZone,/u)
assert.match(provider, /export async function getInstantlyAccountSendHistory/u)
assert.doesNotMatch(
  provider,
  /getInstantlyDailyAccountSends/u,
  'the UTC-day send counter must not come back',
)
assert.match(edge, /const workspaceTimeZone = commonCampaignTimeZone\(/u)
assert.match(edge, /send_day_timezone: workspaceTimeZone/u)
assert.match(edge, /send_history: history/u)

const mailboxesAction = edge.match(/action === "mailboxes"[\s\S]*?action === "overview"/u)
assert.ok(mailboxesAction, 'mailboxes action must exist')
// Who a mailbox sends for comes from campaign rows already held, not a second
// record of ownership that could disagree with what actually sends.
assert.match(mailboxesAction[0], /campaigns: linksByEmail\.get\(account\.email\) \?\? \[\]/u)

// Same reason as above: sliced to the next action, not to a named neighbour.
const assignAction = edge.match(/action === "mailbox-assign"[\s\S]*?\n {4}if \(action ===/u)
assert.ok(assignAction, 'mailbox-assign action must exist')
assert.match(assignAction[0], /requireCampaignManager\(access\)/u)
assert.match(assignAction[0], /verifySelectedAccounts\(/u)
// Emptying a launched campaign's sender list stops it without saying so.
assert.match(assignAction[0], /CAMPAIGN_NEEDS_SENDER/u)
assert.match(assignAction[0], /mailbox_assigned|mailbox_unassigned/u)

// Winnr: credits come back when the provider refuses, orders move on without
// somebody watching, and a failed warmup start is recorded rather than hidden.
assert.match(mailboxInfra, /async function refundMailboxCredits\(/u)
assert.match(mailboxInfra, /await refundMailboxCredits\(authContext, workspaceId, orders, creditsCharged\)\s*\n\s*throw error/u)
assert.match(mailboxInfra, /async function advanceMailboxOrder\(/u)
assert.match(mailboxInfra, /advanceMailboxOrder\(authContext, winnrKey\.apiKey, order\)\s*\n\s*\.catch/u)
assert.match(mailboxInfra, /warmingError = 'Mailboxes were created but warmup could not be started/u)
assert.match(mailboxInfra, /warming_enabled_at: warmingError \? null : warmingEnabledAt/u)
assert.match(mailboxInfra, /action === 'warming-retry'/u)

// The page states the Winnr requirement instead of offering a wizard that
// cannot run, and never offers the purchase flow to a non-manager.
assert.match(infraCard, /A Winnr account is required to buy sending domains/u)
assert.match(infraCard, /if \(!canManage\) \{/u)
assert.match(infraCard, /enabled: Boolean\(workspaceId\) && canManage/u)
assert.match(infraCard, /In Instantly/u)
assert.doesNotMatch(infraCard, /window\.open\(/u, 'a post-await window.open is eaten by popup blockers')

// Problems first, and the SMTP reason on the row rather than in a hover title.
assert.match(mailboxesTable, /function severity\(account: WorkspaceMailboxAccount\)/u)
assert.match(mailboxesTable, /severity\(left\) - severity\(right\) \|\| left\.email\.localeCompare/u)
assert.match(mailboxesTable, /\{account\.status_message\}/u)
assert.match(mailboxesTable, /daily capacity used/u)

// Why a campaign is not sending. The provider reports it on every sync and it
// used to be discarded, so an Active campaign that sent nothing all day
// explained itself nowhere short of opening Instantly.
const notSendingMigration = readFileSync(
  'supabase/migrations/20260728001900_campaign_not_sending_status.sql',
  'utf8',
)
const campaignDetailPage = readFileSync('src/pages/app/WorkspaceCampaignDetail.tsx', 'utf8')

assert.match(notSendingMigration, /ADD COLUMN IF NOT EXISTS provider_not_sending_status INTEGER/u)
assert.match(edge, /const notSendingStatus = typeof item\.not_sending_status === "number"/u)
assert.match(edge, /provider_not_sending_status: campaign\.provider_not_sending_status \?\? null/u)
assert.match(edge, /provider_not_sending_status: provider\.notSendingStatus/u)
assert.match(campaignDetailPage, /function notSendingStatusLabel\(status: number \| null\)/u)
// Every documented code, and an unrecognised one said out loud rather than
// swallowed by a build that predates it.
for (const phrase of [
  /outside its sending window/u,
  /Waiting for a lead to process/u,
  /reached its daily sending limit/u,
  /hit its own daily limit/u,
  /reason code \$\{status\}/u,
]) assert.match(campaignDetailPage, phrase)

// Bounces and unsubscribes were synced on every campaign and shown nowhere.
assert.match(campaignsPage, /label="Bounce rate"/u)
assert.match(campaignsPage, /bounced · \$\{unsubscribedCount\} unsubscribed/u)
// A percentage of nothing must not read as a reassuring zero.
assert.match(campaignsPage, /whole > 0 \? `\$\{Math\.round\(\(part \/ whole\) \* 100\)\}%` : '—'/u)

// The workspace prompt editor offers nine stages, the edge function accepts
// nine, and the table's CHECK allowed seven — so saving an inbox prompt at
// workspace level passed every application check and then failed on the
// database. Derive both lists and compare them, rather than restating either.
const workspacePromptMigration = readFileSync(
  'supabase/migrations/20260729000100_workspace_prompt_inbox_stages.sql',
  'utf8',
)
const clientPromptMigration = readFileSync(
  'supabase/migrations/20260726001400_client_ai_sdr_prompts.sql',
  'utf8',
)
function checkedPromptIds(sql) {
  const match = sql.match(/prompt_id IN \(([\s\S]*?)\)/u)
  assert.ok(match, 'prompt_id CHECK list not found')
  return [...match[1].matchAll(/'([a-z_]+)'/gu)].map((entry) => entry[1]).sort()
}
const edgePromptIds = (() => {
  const match = edge.match(/const RESEARCH_PROMPT_IDS = \[([\s\S]*?)\];/u)
  assert.ok(match, 'RESEARCH_PROMPT_IDS not found')
  return [...match[1].matchAll(/"([a-z_]+)"/gu)].map((entry) => entry[1]).sort()
})()
assert.deepEqual(checkedPromptIds(workspacePromptMigration), edgePromptIds)
// The two prompt layers must offer the same stages, or a prompt is editable
// for one client and unsavable for the workspace it belongs to.
assert.deepEqual(checkedPromptIds(clientPromptMigration), edgePromptIds)

// Research charges two credits a run. The badge said so while the caption
// underneath it said the run was included with the plan.
assert.match(prepDialog, /2 credits per run/u)
assert.doesNotMatch(prepDialog, /included with your plan/iu)

// Contact name extraction is offered in the prompt editor, and the call that
// decides the name a pitch opens with read the shipped default, so an owner's
// rewrite of that stage changed nothing.
const shortlistEdge = readFileSync(
  'supabase/functions/workspace-client-shortlist/index.ts',
  'utf8',
)
assert.match(
  shortlistEdge,
  /\.eq\('prompt_id', 'host_name_extractor'\)/u,
)
assert.match(shortlistEdge, /fillPromptTemplate\(extractorContent,/u)

// ---- prompt variable registry -------------------------------------------
// docs/prompt-variables.json is canonical; both TS files are generated from it
// by scripts/generate-prompt-variables.mjs. Assert all three agree, so a hand
// edit to a mirror fails here instead of drifting quietly.
const variableRegistry = JSON.parse(
  readFileSync('docs/prompt-variables.json', 'utf8'),
)
function mirrorVariables(source) {
  return [...source.matchAll(
    /\{ id: '([a-z_]+)', group: '([a-z]+)'(?:, column: '([a-z_]+)')?(?:, profile: '([a-z_]+)')?, type: '([a-z_]+)'/gu,
  )]
    .map((match) => ({
      id: match[1], group: match[2], column: match[3], profile: match[4], type: match[5],
    }))
}
// The per-stage response fields the generator derives, rebuilt here from the
// rule rather than read back from the mirrors: {{<stage>_response}} carries a
// stage's whole answer, and the naming rule is the feature. A generator that
// started naming them anything else would pass a mirror-to-mirror comparison
// and quietly break every prompt that reaches for a stage by its own name.
const stageResponseSpecs = Object.entries(variableRegistry.stage_responses.stages)
const stageResponseVariables = stageResponseSpecs.map(([stage, spec]) => ({
  id: `${stage}_response`,
  group: 'run',
  column: undefined,
  profile: undefined,
  type: 'long_text',
  label: spec.label,
  producedBy: stage,
  aliases: spec.aliases ?? [],
}))
// Inserted at the head of the run group, matching the generator: a stage's own
// name is offered above the older name for the same answer.
const firstRunIndex = variableRegistry.variables.findIndex((variable) => variable.group === 'run')
const canonicalSource = firstRunIndex === -1
  ? [...variableRegistry.variables, ...stageResponseVariables]
  : [
    ...variableRegistry.variables.slice(0, firstRunIndex),
    ...stageResponseVariables,
    ...variableRegistry.variables.slice(firstRunIndex),
  ]
const canonicalVariables = canonicalSource.map((variable) => ({
  id: variable.id,
  group: variable.group,
  column: variable.column,
  profile: variable.profile,
  type: variable.type,
}))

// A stage without a response field is a stage whose output no later prompt can
// name. Adding a prompt and forgetting the entry fails here rather than shipping
// a stage that silently cannot be read.
const promptRegistry = JSON.parse(readFileSync('docs/pitch-research-prompts.json', 'utf8'))
const stagesWithResponses = new Set(stageResponseSpecs.map(([stage]) => stage))
for (const promptId of Object.keys(promptRegistry.prompts)) {
  assert.ok(
    stagesWithResponses.has(promptId),
    `${promptId} has no stage_responses entry, so nothing can reference its output`,
  )
}
for (const stage of stagesWithResponses) {
  assert.ok(
    Object.hasOwn(promptRegistry.prompts, stage),
    `stage_responses names ${stage}, which is not a prompt`,
  )
}

// An alias must name a variable that already exists: aliases are the older
// names shipped and saved prompts still use, and one pointing at nothing would
// declare a compatibility promise the registry does not keep.
const declaredIds = new Set(variableRegistry.variables.map((variable) => variable.id))
const claimedAliases = new Set()
for (const variable of stageResponseVariables) {
  for (const alias of variable.aliases) {
    assert.ok(declaredIds.has(alias), `${variable.id} aliases {{${alias}}}, which is not a registry variable`)
    assert.ok(!claimedAliases.has(alias), `{{${alias}}} is claimed as an alias by two stages`)
    claimedAliases.add(alias)
  }
}
const edgeMirror = mirrorVariables(
  readFileSync('supabase/functions/_shared/promptVariables.ts', 'utf8'),
)
const appMirror = mirrorVariables(readFileSync('src/lib/promptVariables.ts', 'utf8'))
assert.equal(edgeMirror.length, canonicalVariables.length)
assert.deepEqual(edgeMirror, canonicalVariables)
assert.deepEqual(appMirror, canonicalVariables)

// Every {{variable}} a shipped prompt references must exist in the registry,
// or the field picker offers a prompt-author less than the prompts already use.
// The exception is a prompt writing ABOUT placeholder syntax: the filler leaves
// an unregistered token alone precisely so that prose survives, and listing it
// here keeps a genuine typo from passing as prose.
const PROSE_TOKENS = new Set(['placeholders'])
const shippedPrompts = readFileSync('src/lib/researchPromptDefaults.ts', 'utf8')
const referenced = new Set(
  [...shippedPrompts.matchAll(/\{\{([a-z_]+)\}\}/gu)].map((match) => match[1]),
)
const registryIds = new Set(canonicalVariables.map((variable) => variable.id))
for (const name of referenced) {
  if (PROSE_TOKENS.has(name)) continue
  assert.ok(registryIds.has(name), `{{${name}}} is used by a prompt but missing from the registry`)
}

// Both executors load the registry's full column set. Research used to select
// five columns of which four reached a prompt; the pitch stage, which actually
// writes the emails, then read six of the thirty research had.
// A registry column that does not exist breaks EVERY research run, because
// PostgREST fails the whole select rather than the one field — and the repo
// migrations cannot settle which columns exist (two CREATE TABLE IF NOT EXISTS
// public.podcasts migrations disagree). So the registry is checked against a
// captured production schema instead of against the migrations.
const sourceColumns = JSON.parse(readFileSync('docs/prompt-source-columns.json', 'utf8'))
for (const variable of canonicalVariables) {
  if (!variable.column) continue
  const table = variable.group === 'podcast' ? 'podcasts' : 'clients'
  assert.ok(
    sourceColumns.tables[table].includes(variable.column),
    `${variable.id} reads ${table}.${variable.column}, which is not in the captured schema`,
  )
}

// The column lists are built once from the registry...
assert.match(
  shortlistEdge,
  /const CLIENT_PROMPT_COLUMNS = `\$\{CLIENT_VARIABLE_COLUMNS\.join\(', '\)\}, ai_sdr_profile`/u,
)
assert.match(shortlistEdge, /const PODCAST_PROMPT_COLUMNS = PODCAST_VARIABLE_COLUMNS\.join\(', '\)/u)
assert.match(
  shortlistEdge,
  /const PITCH_CATALOG_COLUMNS = `\$\{PODCAST_VARIABLE_COLUMNS\.join\(', '\)\}, recent_episodes`/u,
)
// ...and both executors select them. The pitch stage read a hand-written six
// columns while research read the registry's thirty.
assert.equal(
  shortlistEdge.match(/\.select\(CLIENT_PROMPT_COLUMNS\)/gu)?.length,
  4,
  'research, pitch, the identify step and the editor preview must all load the client AI SDR profile',
)
assert.match(shortlistEdge, /\.select\(PODCAST_PROMPT_COLUMNS\)/u)
assert.match(shortlistEdge, /\.select\(PITCH_CATALOG_COLUMNS\)/u)
assert.match(
  shortlistEdge,
  /import \{\s*buildClientVariables,\s*buildEpisodeVariables,\s*buildPodcastVariables,\s*CLIENT_VARIABLE_COLUMNS,\s*decodeFeedText,\s*formatPromptValue,\s*isPromptVariable,\s*PODCAST_VARIABLE_COLUMNS,\s*STAGE_RESPONSE_TARGETS,\s*\} from '\.\.\/_shared\/promptVariables\.ts'/u,
)
// Every stage builds its variables through the same helpers, so no two can
// disagree about how much of a show they can see. Research, pitch generation
// and the waterfall's identify step all qualify — the last of these decides
// the name a pitch opens with and used to receive a single field.
assert.equal(shortlistEdge.match(/buildPodcastVariables\(/gu)?.length, 3)
assert.equal(shortlistEdge.match(/buildClientVariables\(/gu)?.length, 3)
assert.equal(shortlistEdge.match(/buildEpisodeVariables\(/gu)?.length, 3)
// The inbox reply stage reads the catalogue too, from storage only — an
// inbound reply must not trigger a provider fetch.
const inboxSdr = readFileSync('supabase/functions/_shared/inboxSdr.ts', 'utf8')
assert.match(inboxSdr, /\.\.\.buildPodcastVariables\(row\)/u)
assert.match(inboxSdr, /\.\.\.buildEpisodeVariables\(row\?\.recent_episodes\)/u)
assert.match(inboxSdr, /\.\.\.buildClientVariables\(client\)/u)
assert.ok(
  !/ensureEpisodesCaptured|fetchPodcastHosts/u.test(inboxSdr),
  'the inbox path must read stored capture only, never fetch',
)
assert.match(inboxSdr, /if \(!isPromptVariable\(key\)\) return match/u)

// The pitch revision stage runs in the pitch scope and gets all of it; it used
// to receive only the draft and the flags it was being asked to fix.
// The draft reaches it through the registry, so the stage's own
// {{write_email_response}} and the older {{sequence_json}} carry the same JSON.
assert.match(
  shortlistEdge,
  /\.\.\.pitchVariables,(?:\s*\/\/[^\n]*\n)*\s*\.\.\.stageOutputVariables\(\{ write_email: JSON\.stringify\(sequence\) \}\)/u,
)

// Values are formatted by declared type before filling, so a false boolean and
// a zero cannot reach a prompt looking like missing data.
const sharedVariables = readFileSync('supabase/functions/_shared/promptVariables.ts', 'utf8')
assert.match(sharedVariables, /formatPromptValue\(\s*variable\.id,\s*values\[variable\.column\]/u)
assert.match(sharedVariables, /formatPromptValue\(variable\.id, profile\[variable\.profile\]\)/u)

// The filler substitutes registered variables only. Filling every token turned
// clean_email's rule about unfilled placeholders into "unfilled Not available
// must never appear".
assert.match(shortlistEdge, /if \(!isPromptVariable\(key\)\) return match/u)

// Each stage's result becomes a field the stages after it can reference, and
// it is published by stage rather than by field name — one value reaching the
// stage's own {{<stage>_response}} and every older name for the same answer,
// so the two can never disagree.
assert.match(shortlistEdge, /publishStageOutput\('host_info', hostReport/u)
assert.match(shortlistEdge, /publishStageOutput\('guest_info', guestReport/u)
assert.match(shortlistEdge, /publishStageOutput\('find_topics', topicProposal/u)
assert.match(
  shortlistEdge,
  /const publishStageOutput = \(promptId: string, value: string \| null\) => \{\s*\n\s*for \(const id of STAGE_RESPONSE_TARGETS\[promptId\] \?\? \[\]\) stageVariables\[id\] = value/u,
)
// ...including the first stage's. Every response field is seeded null and the
// first stage's pointer is set only once the report block exists: stage one is
// the only stage sent WITHOUT that block, so an eagerly-seeded pointer aims the
// first prompt at nothing.
assert.match(
  shortlistEdge,
  /Object\.values\(STAGE_RESPONSE_TARGETS\)\.flat\(\)\.map\(\(id\) => \[id, null\]\)/u,
)
// Seeded BEFORE baseVariables, never after: a stage response sharing a name
// with real catalogue data (host_name) must not blank the data it shares with.
assert.match(
  shortlistEdge,
  /Object\.values\(STAGE_RESPONSE_TARGETS\)\.flat\(\)\.map\(\(id\) => \[id, null\]\),\s*\n\s*\),\s*\n\s*\.\.\.baseVariables,/u,
)
assert.match(
  shortlistEdge,
  /const reportBlock = `<research_report>[^`]*`(?:\s*\/\/[^\n]*\n)*\s*publishStageOutput\('podcast_research', '\(provided in the research report section above\)'\)/u,
)
// ...and the pitch stage can name what research produced, not just the
// concatenated report it used to receive.
for (const runVariable of ['clean_description', 'fit_reasons', 'selected_angle']) {
  assert.ok(
    new RegExp(`^\\s*${runVariable}:`, 'mu').test(shortlistEdge),
    `pitch generation must expose ${runVariable} as a prompt variable`,
  )
}
// The research stages reach the pitch through the registry, so a stage added
// later arrives without anyone editing this object.
assert.match(
  shortlistEdge,
  /\.\.\.stageOutputVariables\(\{\s*\n\s*podcast_research: researchReport,\s*\n\s*host_info:/u,
)

// A stage refuses to run when a field it requires is absent for this podcast.
// The whole point is that this costs nothing, so the gate must come BEFORE the
// charge, not after it. These two assertions are the money: a later edit that
// moves chargeCredits back above the gate reintroduces billing a podcast for
// discovering it can never be pitched.
const requirementsShared = readFileSync('supabase/functions/_shared/promptRequirements.ts', 'utf8')
assert.match(requirementsShared, /export function resolveRequiredVariables/u)
assert.match(requirementsShared, /export function missingRequiredVariables/u)
// The registry is the authority on what may be required; SQL only checks shape.
assert.match(requirementsShared, /if \(!isPromptVariable\(id\)\) throw new Error/u)

assert.match(
  shortlistEdge,
  /await gateStage\('podcast_research'\)\s*\n\s*await chargeCredits\(/u,
  'the research run must gate required fields before charging a credit',
)
assert.ok(
  shortlistEdge.indexOf("throw new HttpError(409, 'PITCH_BLOCKED'")
    < shortlistEdge.indexOf("operationType: 'query_generation'"),
  'pitch generation must block on a missing required field before charging',
)
// A blocked run is not a failed one: the catch must let it past before it
// rewrites progress as failed and logs a cost for work never done.
assert.match(
  shortlistEdge,
  /catch \(error\) \{[\s\S]{0,400}?if \(error instanceof RequirementBlock\)/u,
  'a requirement block must be handled before the generic failure path',
)

// Requirements are owner-gated and validated, exactly like the prompts.
for (const action of [
  'prompt-requirements-get',
  'prompt-requirements-set',
  'client-prompt-requirements-get',
  'client-prompt-requirements-set',
  'client-prompt-requirements-reset',
]) {
  assert.ok(
    edge.includes(`action === "${action}"`),
    `workspace-client-campaigns must expose ${action}`,
  )
}
assert.match(edge, /"prompt-requirements-set"[\s\S]{0,200}requireIntegrationOwner\(access\)/u)
assert.match(edge, /"client-prompt-requirements-set"[\s\S]{0,220}requireIntegrationOwner\(access\)/u)

// The prompt editor's field preview is built by the same function the run uses.
// A hand-written mirror of that mapping is what the editor carried before, and
// it answered "Mapped at run time" for two thirds of the registry.
assert.match(shortlistEdge, /function buildBaseVariables\(input: \{/u)
assert.ok(
  (shortlistEdge.match(/buildBaseVariables\(\{/gu) ?? []).length >= 2,
  'the run and the preview must both build their variables through buildBaseVariables',
)
// Opening an editor must never become a provider call or a charge.
const previewAction = shortlistEdge.slice(
  shortlistEdge.indexOf("if (action === 'prompt-preview')"),
  shortlistEdge.indexOf("if (action === 'research-run')"),
)
assert.ok(previewAction.length > 0, 'workspace-client-shortlist must expose prompt-preview')
assert.ok(!previewAction.includes('chargeCredits('), 'the preview must not charge a credit')
assert.ok(!previewAction.includes('runResearchPrompt('), 'the preview must not call the model')
assert.ok(
  !previewAction.includes('ensureEpisodesCaptured(') && previewAction.includes('readStoredEpisodes('),
  'the preview must read the stored capture, never refetch from Podscan',
)

// Every research stage goes through one runner, so a stage cannot be added
// that quietly skips the shared prompt fill.
assert.match(shortlistEdge, /const runStage = async \(/u)
for (const stage of ['podcast_research', 'host_info', 'guest_info', 'find_topics']) {
  assert.ok(
    shortlistEdge.includes(`runStage('${stage}'`),
    `${stage} must run through runStage so its output is published to later stages`,
  )
}
// A stage's answer reaches the next stage whole.
//
// Stages could once declare named fields to return, which appended a trailing
// JSON block to the prompt and parsed values back out of it — reshaping and
// then re-stripping the answer on the way through. {{<stage>_response}} carries
// the whole answer now, so none of that survives: no declared shape appended to
// a prompt, and nothing cut off the end of a report on the way back.
for (const removed of [
  'buildOutputInstruction',
  'parseOutputFields',
  'splitOutputBlock',
  'resolveOutputFields',
  'workspace_prompt_outputs',
  'client_prompt_outputs',
]) {
  assert.ok(
    !shortlistEdge.includes(removed),
    `the run must not reshape a stage answer through ${removed}`,
  )
}
assert.match(
  shortlistEdge,
  /\{ \.\.\.parts, instruction: fillPromptTemplate\(promptContent\(promptId\), stageVariables\) \}/u,
)

// The storage behind declared fields is gone too, not just the code that read
// it: endpoints that accept writes nothing consumes are how a removed feature
// comes back as half of one.
for (const removed of [
  'prompt-outputs-get',
  'prompt-outputs-set',
  'client-prompt-outputs-get',
  'client-prompt-outputs-set',
  'workspace_prompt_outputs',
  'client_prompt_outputs',
  'normalizeOutputFields',
  'promptOutputs.ts',
]) {
  assert.ok(
    !edge.includes(removed),
    `workspace-client-campaigns must not still carry ${removed}`,
  )
}
assert.ok(
  !existsSync('supabase/functions/_shared/promptOutputs.ts'),
  '_shared/promptOutputs.ts has no callers left and must not be reintroduced',
)

// The no-transcript rule is stated when it is true, not carried permanently.
//
// It used to sit in two shipped prompts, describing a case that may never
// arise for the podcast in hand. Deleting it outright would have been wrong
// while nothing requires a transcript: it is the only thing standing between a
// transcript-less show and an invented episode reference. So it moved, and
// both paths must still emit it.
for (const marker of ['Do NOT invent an episode reference', 'quote bank skipped']) {
  assert.ok(
    shortlistEdge.includes(marker),
    `the run must still tell a transcript-less show: ${marker}`,
  )
}
assert.match(
  shortlistEdge,
  /baseVariables\.episode_transcript\s*\n\s*\?\s*''\s*\n\s*:\s*'No transcript is available/u,
  'the research context must state the rule only when there is no transcript',
)
assert.match(
  shortlistEdge,
  /variables\.episode_transcript\s*\n\s*\?\s*''\s*\n\s*:\s*'No transcript or episode content is available/u,
  'the pitch context must state the rule only when there is no transcript',
)
// ...and the prompts themselves no longer describe the case.
for (const promptId of ['podcast_research', 'write_email']) {
  assert.ok(
    !canonicalPrompts.prompts[promptId].content.includes('If NO transcript'),
    `${promptId} must not carry the no-transcript branch as permanent text`,
  )
}
