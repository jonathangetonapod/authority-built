import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type WorkspaceCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'attention'
export type WorkspaceCampaignTargetStatus = 'draft' | 'ready' | 'launching' | 'in_outreach' | 'replied' | 'completed' | 'failed'

export interface InstantlySendingAccount {
  email: string
  first_name: string | null
  last_name: string | null
  status: number
  warmup_status: number | null
  daily_limit: number | null
}

export interface WorkspaceInstantlyIntegration {
  connected: boolean
  status: 'connected' | 'error' | 'disconnected'
  provider_workspace_id: string | null
  provider_workspace_name: string | null
  api_key_last_four: string | null
  accounts: InstantlySendingAccount[]
  active_account_count: number
  connected_at: string | null
  last_verified_at: string | null
  last_error: string | null
  can_manage: boolean
  required_scopes: string[]
}

export interface WorkspaceMailboxTag {
  id: string
  label: string
  description: string | null
}

export interface WorkspaceMailboxSendDay {
  date: string
  sent: number
}

/** A client whose outreach this mailbox sends, via that client's campaign. */
export interface WorkspaceMailboxCampaignLink {
  campaign_id: string
  campaign_name: string
  campaign_status: string
  client_id: string
  client_name: string | null
}

export interface WorkspaceMailboxAccount {
  email: string
  first_name: string | null
  last_name: string | null
  status: number
  status_message: string | null
  warmup_status: number | null
  daily_limit: number | null
  sent_today: number | null
  send_history?: WorkspaceMailboxSendDay[]
  warmup_emails: number | null
  warmup_limit: number | null
  health_score: number | null
  tags: WorkspaceMailboxTag[]
  campaigns?: WorkspaceMailboxCampaignLink[]
}

export interface WorkspaceMailboxesResponse {
  connected: boolean
  reason?: 'key_rejected' | 'scope_missing'
  provider_workspace_name: string | null
  /** The zone the sending day is measured in, never the viewer's. */
  send_day_timezone?: string
  accounts: WorkspaceMailboxAccount[]
  last_synced_at: string | null
  analytics_errors: string[]
}

export interface WorkspaceCampaignAnalytics {
  emails_sent_count: number
  contacted_count: number
  open_count_unique: number
  reply_count_unique: number
  bounced_count: number
  unsubscribed_count: number
  total_interested: number
  total_meeting_booked: number
}

export interface WorkspaceCampaignTargetCounts {
  total: number
  needs_contact: number
  needs_pitch: number
  ready: number
  in_outreach: number
  replied: number
  failed: number
  /** Leads sitting in the provider campaign that nobody launched from here. */
  staged: number
  /** Of those, the ones already sending because the campaign was live. */
  staged_sending: number
}

export interface WorkspaceCampaignProviderSchedule {
  name: string | null
  /** 24h "HH:MM" in the schedule's own timezone. */
  from: string | null
  to: string | null
  timezone: string | null
  /** Seven booleans in provider key order 0..6. */
  days: boolean[]
}

export interface WorkspaceClientCampaign {
  id: string
  workspace_id: string
  client_id: string
  name: string
  status: WorkspaceCampaignStatus
  instantly_campaign_id: string | null
  instantly_campaign_status: number | null
  sender_accounts: string[]
  timezone: string
  daily_limit: number
  /**
   * Days this campaign may send, indexed as Instantly does: 0 is Sunday through
   * 6 is Saturday. This is what the app asked for; provider_schedule below is
   * what Instantly reports back.
   */
  send_days: number[]
  send_window_start: string
  send_window_end: string
  /** Days after the opening email before the first follow-up. */
  follow_up_one_delay_days: number
  /** Days after the first follow-up before the second. */
  follow_up_two_delay_days: number
  /** The sending window Instantly actually holds, observed on the last sync. */
  provider_schedule: WorkspaceCampaignProviderSchedule | null
  /** Minutes between sends at the provider, null when it reported none. */
  provider_email_gap: number | null
  /**
   * Why the provider is not sending, observed on the last sync. 1 outside the
   * schedule, 2 waiting for a lead, 3 daily limit reached, 4 every sending
   * account at its limit, 99 a provider error. Null means no reason given.
   */
  provider_not_sending_status: number | null
  analytics: WorkspaceCampaignAnalytics
  target_counts: WorkspaceCampaignTargetCounts
  target_shortlist_podcast_ids: string[]
  last_synced_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceInstantlyCampaign {
  id: string
  name: string
  status: number
  sender_accounts: string[]
  timezone: string
  daily_limit: number
  timestamp_created: string | null
  timestamp_updated: string | null
  mapped_client_id: string | null
}

export interface WorkspaceCampaignTarget {
  id: string
  shortlist_podcast_id: string
  podcast_id: string
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  contact_email: string | null
  selection_source: 'client_positive' | 'owner_override'
  wave_started_on: string
  research_notes: string | null
  pitch_subject: string | null
  pitch_body: string | null
  follow_up_1_subject: string | null
  follow_up_1_body: string | null
  follow_up_2_subject: string | null
  follow_up_2_body: string | null
  status: WorkspaceCampaignTargetStatus
  instantly_lead_id: string | null
  instantly_lead_status: number | null
  /**
   * Which Instantly campaign this lead was staged into. Null on targets with no
   * lead, and on rows written before a client could hold several campaigns —
   * both mean the client's own campaign, which is where they went.
   */
  instantly_campaign_id: string | null
  email_open_count: number
  email_reply_count: number
  approved_at: string | null
  launched_at: string | null
  /** The Instantly lead exists. Set by Send to Client Campaign, before launch. */
  lead_staged_at: string | null
  /** Provider campaign status when the lead was staged: 1 means it began sending. */
  lead_staged_campaign_status: number | null
  last_activity_at: string | null
  last_error: string | null
  prior_outreach_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceCampaignOverview {
  integration: WorkspaceInstantlyIntegration
  can_manage_campaigns: boolean
  campaigns: WorkspaceClientCampaign[]
  provider_campaigns: WorkspaceInstantlyCampaign[]
  provider_campaigns_error: string | null
}

export interface WorkspaceCampaignDetailResponse {
  integration: WorkspaceInstantlyIntegration
  can_manage_campaigns: boolean
  campaign: WorkspaceClientCampaign | null
  targets: WorkspaceCampaignTarget[]
}

interface CampaignMutationResponse {
  campaign: WorkspaceClientCampaign | null
  targets?: WorkspaceCampaignTarget[]
}

async function invokeWorkspaceCampaigns<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-client-campaigns', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

export async function getWorkspaceCampaignOverview(workspaceId: string): Promise<WorkspaceCampaignOverview> {
  return await invokeWorkspaceCampaigns<WorkspaceCampaignOverview>({
    action: 'overview',
    workspace_id: workspaceId,
  }, 'Client campaigns could not be loaded.')
}

export async function getWorkspaceMailboxes(workspaceId: string): Promise<WorkspaceMailboxesResponse> {
  return await invokeWorkspaceCampaigns<WorkspaceMailboxesResponse>({
    action: 'mailboxes',
    workspace_id: workspaceId,
  }, 'Mailboxes could not be loaded.')
}

/**
 * Connect a mailbox to a client, or take it off them.
 *
 * A mailbox belongs to a client by sending that client's campaign, so this
 * writes the campaign's sender list rather than inventing a second record of
 * who owns what.
 */
export async function setWorkspaceMailboxClient(input: {
  workspaceId: string
  clientId: string
  email: string
  assigned: boolean
}): Promise<{ sender_accounts: string[] }> {
  return await invokeWorkspaceCampaigns<{ sender_accounts: string[] }>({
    action: 'mailbox-assign',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    email: input.email,
    assigned: input.assigned,
  }, 'The mailbox assignment could not be saved.')
}

export async function getWorkspaceCampaign(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceCampaignDetailResponse> {
  return await invokeWorkspaceCampaigns<WorkspaceCampaignDetailResponse>({
    action: 'get',
    workspace_id: workspaceId,
    client_id: clientId,
  }, 'The client campaign could not be loaded.')
}

export async function connectWorkspaceInstantly(
  workspaceId: string,
  apiKey: string,
): Promise<WorkspaceInstantlyIntegration> {
  const response = await invokeWorkspaceCampaigns<{ integration: WorkspaceInstantlyIntegration }>({
    action: 'connect-instantly',
    workspace_id: workspaceId,
    api_key: apiKey,
  }, 'Instantly could not be connected.')
  return response.integration
}

export async function refreshWorkspaceInstantly(workspaceId: string): Promise<WorkspaceInstantlyIntegration> {
  const response = await invokeWorkspaceCampaigns<{ integration: WorkspaceInstantlyIntegration }>({
    action: 'refresh-instantly',
    workspace_id: workspaceId,
  }, 'The Instantly connection could not be refreshed.')
  return response.integration
}

export async function disconnectWorkspaceInstantly(workspaceId: string): Promise<WorkspaceInstantlyIntegration> {
  const response = await invokeWorkspaceCampaigns<{ integration: WorkspaceInstantlyIntegration }>({
    action: 'disconnect-instantly',
    workspace_id: workspaceId,
  }, 'The Instantly connection could not be removed.')
  return response.integration
}

export async function saveWorkspaceCampaign(input: {
  workspaceId: string
  clientId: string
  name: string
  timezone: string
  dailyLimit: number
  senderAccounts: string[]
  shortlistPodcastIds: string[]
  providerCampaignId?: string | null
}): Promise<CampaignMutationResponse> {
  return await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: 'upsert',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    name: input.name,
    timezone: input.timezone,
    daily_limit: input.dailyLimit,
    sender_accounts: input.senderAccounts,
    shortlist_podcast_ids: input.shortlistPodcastIds,
    provider_campaign_id: input.providerCampaignId || null,
  }, 'The campaign draft could not be saved.')
}

export async function addWorkspaceCampaignPodcasts(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastIds: string[]
}): Promise<{ added: number; campaign: WorkspaceClientCampaign; targets: WorkspaceCampaignTarget[] }> {
  return await invokeWorkspaceCampaigns({
    action: 'add-podcasts',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_ids: input.shortlistPodcastIds,
  }, 'The podcast could not be added to the client campaign.')
}

/**
 * Take a staged podcast back out of the Instantly campaign.
 *
 * The lead is deleted at the provider and the local record forgets it, which
 * stops any remaining sequence steps. It cannot recall an email already
 * delivered — nothing can.
 */
export async function removeWorkspaceCampaignLead(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
}): Promise<{ removed: boolean; campaign: WorkspaceClientCampaign; target: WorkspaceCampaignTarget }> {
  return await invokeWorkspaceCampaigns({
    action: 'unstage-podcast',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
  }, 'The podcast could not be removed from the client campaign.')
}

export async function prepareWorkspaceCampaignPodcast(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
  researchNotes: string
  hostName: string
  contactEmail: string
  subject: string
  pitchBody: string
  followUpOneSubject: string
  followUpOneBody: string
  followUpTwoSubject: string
  followUpTwoBody: string
  pitchChainVersion?: string | null
  /** Which linked campaign to send into. Omitted means the client's own. */
  instantlyCampaignId?: string | null
}): Promise<{
  added: boolean
  campaign: WorkspaceClientCampaign
  target: WorkspaceCampaignTarget
  /** The Instantly lead was created. */
  lead_staged: boolean
  /** The lead entered a live campaign, so this host will be emailed. */
  will_send: boolean
  provider_campaign_status: number | null
}> {
  return await invokeWorkspaceCampaigns({
    action: 'prepare-podcast',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
    research_notes: input.researchNotes,
    host_name: input.hostName,
    contact_email: input.contactEmail,
    subject: input.subject,
    pitch_body: input.pitchBody,
    follow_up_1_subject: input.followUpOneSubject,
    follow_up_1_body: input.followUpOneBody,
    follow_up_2_subject: input.followUpTwoSubject,
    follow_up_2_body: input.followUpTwoBody,
    pitch_chain_version: input.pitchChainVersion ?? null,
    instantly_campaign_id: input.instantlyCampaignId ?? null,
  }, 'The prepared outreach could not be pushed to the client campaign.')
}

export async function saveWorkspaceCampaignPitch(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
  subject: string
  pitchBody: string
  followUpOneSubject: string
  followUpOneBody: string
  followUpTwoSubject: string
  followUpTwoBody: string
}): Promise<WorkspaceCampaignTarget> {
  const response = await invokeWorkspaceCampaigns<{ target: WorkspaceCampaignTarget }>({
    action: 'save-pitch',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
    subject: input.subject,
    pitch_body: input.pitchBody,
    follow_up_1_subject: input.followUpOneSubject,
    follow_up_1_body: input.followUpOneBody,
    follow_up_2_subject: input.followUpTwoSubject,
    follow_up_2_body: input.followUpTwoBody,
  }, 'The custom pitch could not be saved.')
  return response.target
}

export async function updateWorkspaceCampaignContact(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
  contactEmail: string
  hostName: string
}): Promise<WorkspaceCampaignTarget> {
  const response = await invokeWorkspaceCampaigns<{ target: WorkspaceCampaignTarget }>({
    action: 'update-contact',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
    contact_email: input.contactEmail,
    host_name: input.hostName,
  }, 'The podcast contact could not be saved.')
  return response.target
}

export async function launchWorkspaceCampaignPitch(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
  subject: string
  pitchBody: string
  followUpOneSubject: string
  followUpOneBody: string
  followUpTwoSubject: string
  followUpTwoBody: string
}): Promise<CampaignMutationResponse> {
  return await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: 'launch-pitch',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
    subject: input.subject,
    pitch_body: input.pitchBody,
    follow_up_1_subject: input.followUpOneSubject,
    follow_up_1_body: input.followUpOneBody,
    follow_up_2_subject: input.followUpTwoSubject,
    follow_up_2_body: input.followUpTwoBody,
  }, 'Outreach could not be started for this podcast.')
}

export async function updateWorkspaceCampaignSettings(input: {
  workspaceId: string
  clientId: string
  name: string
  timezone: string
  dailyLimit: number
  senderAccounts: string[]
  /** Omitted fields keep whatever the campaign already has. */
  sendDays?: number[]
  sendWindowStart?: string
  sendWindowEnd?: string
  followUpOneDelayDays?: number
  followUpTwoDelayDays?: number
}): Promise<WorkspaceClientCampaign> {
  const response = await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: 'update-settings',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    name: input.name,
    timezone: input.timezone,
    daily_limit: input.dailyLimit,
    sender_accounts: input.senderAccounts,
    send_days: input.sendDays ?? null,
    send_window_start: input.sendWindowStart ?? null,
    send_window_end: input.sendWindowEnd ?? null,
    follow_up_one_delay_days: input.followUpOneDelayDays ?? null,
    follow_up_two_delay_days: input.followUpTwoDelayDays ?? null,
  }, 'Campaign settings could not be saved.')
  if (!response.campaign) throw new Error('Campaign settings returned no campaign.')
  return response.campaign
}

export async function syncWorkspaceCampaign(
  workspaceId: string,
  clientId: string,
): Promise<CampaignMutationResponse> {
  return await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: 'sync',
    workspace_id: workspaceId,
    client_id: clientId,
  }, 'The Instantly campaign could not be synced.')
}

export interface WorkspaceCampaignAnalyticsRefresh {
  /** Launched campaigns the refresh asked the provider about. */
  requested: number
  refreshed: number
  /** Asked for, not answered for — usually deleted inside Instantly. */
  missing: number
}

/**
 * Totals for every launched campaign in the workspace, in one provider call.
 * Per-recipient state still comes from a campaign's own sync; this is the
 * numbers on the list, which otherwise cost a round trip per client.
 */
export async function refreshWorkspaceCampaignAnalytics(
  workspaceId: string,
): Promise<WorkspaceCampaignAnalyticsRefresh> {
  return await invokeWorkspaceCampaigns<WorkspaceCampaignAnalyticsRefresh>({
    action: 'refresh-analytics',
    workspace_id: workspaceId,
  }, 'Campaign totals could not be refreshed.')
}

export async function setWorkspaceCampaignRunning(
  workspaceId: string,
  clientId: string,
  running: boolean,
): Promise<WorkspaceClientCampaign> {
  const response = await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: running ? 'resume' : 'pause',
    workspace_id: workspaceId,
    client_id: clientId,
  }, running ? 'The campaign could not be resumed.' : 'The campaign could not be paused.')
  if (!response.campaign) throw new Error('Campaign status returned no campaign.')
  return response.campaign
}

export interface ResearchPromptOverride {
  /** Null when the stage runs the shipped instructions and only its model was chosen. */
  content: string | null
  /** Null means the stage runs on its shipped default model. */
  model: string | null
  updated_at: string | null
}

export type ResearchPromptOverrides = Partial<Record<string, ResearchPromptOverride>>

/** A model this workspace's Anthropic key can actually use, as the API reports it. */
export interface PromptModelOption {
  id: string
  label: string
  contextTokens: number | null
  maxOutputTokens: number | null
  thinksByDefault: boolean
}

/**
 * The models available to this workspace, read live from Anthropic.
 *
 * Not a list shipped in this app: the usable set changes as models ship and
 * retire, and it differs by key — a workspace on its own Anthropic credential
 * may reach models the platform key cannot, or fewer.
 */
export async function getWorkspacePromptModels(
  workspaceId: string,
): Promise<PromptModelOption[]> {
  const data = await invokeWorkspaceCampaigns<{ models?: PromptModelOption[] }>({
    action: 'prompts-models',
    workspace_id: workspaceId,
  }, 'The available models could not be loaded.')
  return Array.isArray(data.models) ? data.models : []
}

/** Chooses the model a stage runs on. Null returns it to the shipped default. */
export async function setWorkspacePromptModel(
  workspaceId: string,
  promptId: string,
  model: string | null,
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'prompt-model-set',
    workspace_id: workspaceId,
    prompt_id: promptId,
    model,
  }, 'The model could not be saved.')
  if (data?.success !== true) throw new Error('The model could not be saved.')
}

export async function getWorkspaceResearchPromptOverrides(
  workspaceId: string,
): Promise<ResearchPromptOverrides> {
  const data = await invokeWorkspaceCampaigns<{ overrides?: ResearchPromptOverrides }>({
    action: 'prompts-get',
    workspace_id: workspaceId,
  }, 'Workspace research prompts could not be loaded.')
  return data.overrides ?? {}
}

export async function setWorkspaceResearchPrompt(
  workspaceId: string,
  promptId: string,
  content: string,
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'prompts-set',
    workspace_id: workspaceId,
    prompt_id: promptId,
    content,
  }, 'The prompt could not be saved.')
  if (data?.success !== true) throw new Error('The prompt could not be saved.')
}

/** Fields a stage refuses to run without. Absent stage = nothing required. */
export type PromptRequirements = Record<string, string[]>

export async function getWorkspacePromptRequirements(
  workspaceId: string,
): Promise<PromptRequirements> {
  const data = await invokeWorkspaceCampaigns<{ requirements?: PromptRequirements }>({
    action: 'prompt-requirements-get',
    workspace_id: workspaceId,
  }, 'Field requirements could not be loaded.')
  return data.requirements ?? {}
}

export async function setWorkspacePromptRequirements(
  workspaceId: string,
  promptId: string,
  requiredVariables: string[],
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'prompt-requirements-set',
    workspace_id: workspaceId,
    prompt_id: promptId,
    required_variables: requiredVariables,
  }, 'The field requirements could not be saved.')
  if (data?.success !== true) throw new Error('The field requirements could not be saved.')
}

export async function getClientPromptRequirements(
  workspaceId: string,
  clientId: string,
): Promise<PromptRequirements> {
  const data = await invokeWorkspaceCampaigns<{ requirements?: PromptRequirements }>({
    action: 'client-prompt-requirements-get',
    workspace_id: workspaceId,
    client_id: clientId,
  }, 'Field requirements could not be loaded.')
  return data.requirements ?? {}
}

export async function setClientPromptRequirements(
  workspaceId: string,
  clientId: string,
  promptId: string,
  requiredVariables: string[],
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'client-prompt-requirements-set',
    workspace_id: workspaceId,
    client_id: clientId,
    prompt_id: promptId,
    required_variables: requiredVariables,
  }, 'The field requirements could not be saved.')
  if (data?.success !== true) throw new Error('The field requirements could not be saved.')
}

/**
 * Drops this client's row so the stage inherits the workspace set again —
 * different from saving an empty set, which requires nothing in spite of it.
 */
export async function resetClientPromptRequirements(
  workspaceId: string,
  clientId: string,
  promptId: string,
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'client-prompt-requirements-reset',
    workspace_id: workspaceId,
    client_id: clientId,
    prompt_id: promptId,
  }, 'The field requirements could not be reset.')
  if (data?.success !== true) throw new Error('The field requirements could not be reset.')
}

export async function resetWorkspaceResearchPrompt(
  workspaceId: string,
  promptId: string,
): Promise<void> {
  const data = await invokeWorkspaceCampaigns<{ success?: boolean }>({
    action: 'prompts-reset',
    workspace_id: workspaceId,
    prompt_id: promptId,
  }, 'The prompt could not be reset.')
  if (data?.success !== true) throw new Error('The prompt could not be reset.')
}

export interface WorkspaceInboxThread {
  id: string
  thread_id: string | null
  message_id: string | null
  eaccount: string | null
  subject: string
  from_email: string
  to_email: string
  body_text: string
  received_at: string | null
  is_unread: boolean
  interested: boolean
  /**
   * Effective Instantly interest status. An operator's own decision, recorded
   * locally, wins over the i_status on the provider's email rows — updating a
   * lead does not rewrite emails already in the list.
   */
  interest_status?: number | null
  /** The sender is on this workspace's do-not-contact list. */
  suppressed?: boolean
  /** This reply asks not to be contacted, by deterministic detection. */
  opt_out_detected?: boolean
  lead_email: string
  lead_id?: string | null
  campaign: {
    campaign_id: string
    campaign_name: string | null
    client: { id: string; name: string } | null
  } | null
  lead_context?: {
    podcast_id: string | null
    podcast_name: string | null
    host_name: string | null
    stage: string | null
    first_message_at: string | null
    opens: number
    replies: number
  } | null
  thread_key?: string
  relationship?: { podcast_id: string } | null
  state?: {
    status: WorkspaceInboxThreadStatus
    classification: WorkspaceInboxReplyClassification | null
    nudges_sent: number
    nudges_paused: boolean
    last_nudge_at: string | null
    last_nudge_error?: string | null
    suppressed_at?: string | null
    draft: {
      subject: string
      body: string
      nudges: WorkspaceInboxNudge[]
      based_on_email_id: string | null
      generated_at: string | null
    } | null
    draft_stale: boolean
  } | null
}

export type WorkspaceInboxThreadStatus = 'needs_reply' | 'review' | 'replied' | 'booked' | 'archived'

export interface WorkspaceInboxNudge {
  send_after_days: number
  body: string
}

export interface WorkspaceInboxReplyClassification {
  label: 'interested' | 'not_interested' | 'not_now' | 'question' | 'referral' | 'auto_reply' | 'other'
  confidence: number
  reasoning: string
}

export interface WorkspaceInboxThreadsResponse {
  connected: boolean
  reason?: 'key_rejected' | 'scope_missing'
  threads: WorkspaceInboxThread[]
  /**
   * Older replies exist beyond the window that was read. The provider inbox is
   * paged and shared by every campaign, so a busy workspace can push a client's
   * reply past the end. A truncated list must not look like a complete one.
   */
  truncated?: boolean
}

/**
 * Where a host stands in the sequence right now, read from Instantly on
 * demand. Everything else on the campaign page is as fresh as the last sync;
 * this is the one thing that changes without anybody here acting.
 */
export interface WorkspaceTargetLeadStatus {
  id: string
  email: string
  /** 1 Active, 2 Paused, 3 Completed, -1 Bounced, -2 Unsubscribed, -3 Skipped. */
  status: number | null
  email_open_count: number
  email_reply_count: number
  email_click_count: number
  /** Which step was last opened or replied to, when the provider says. */
  email_opened_step: number | null
  email_replied_step: number | null
  /** 1 Interested, 2 Meeting booked, 3 Meeting completed, 4 Won, 0 OOO, negatives lost. */
  lt_interest_status: number | null
  /** 1 Verified, -1 Invalid, -2 Risky, -3 Catch all, -4 Job change, 11/12 pending. */
  verification_status: number | null
  timestamp_last_contact: string | null
  timestamp_last_open: string | null
  timestamp_last_reply: string | null
  timestamp_last_click: string | null
}

export interface WorkspaceTargetLeadStatusResponse {
  lead: WorkspaceTargetLeadStatus | null
  /** The lead was deleted in Instantly, which is an answer rather than a fault. */
  deleted_upstream: boolean
  checked_at: string
}

export async function getWorkspaceTargetLeadStatus(input: {
  workspaceId: string
  clientId: string
  shortlistPodcastId: string
}): Promise<WorkspaceTargetLeadStatusResponse> {
  return await invokeWorkspaceCampaigns<WorkspaceTargetLeadStatusResponse>({
    action: 'target-lead-status',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    shortlist_podcast_id: input.shortlistPodcastId,
  }, 'The delivery status could not be read from Instantly.')
}

export interface ClientInstantlyCampaignLink {
  instantly_campaign_id: string
  campaign_name: string | null
  created_at: string | null
  /**
   * When this app built the campaign's sequence and registered the variables a
   * written pitch renders through. Null means the campaign was made in
   * Instantly and carries its own copy.
   */
  provisioned_at?: string | null
  /** Only a provisioned campaign may be chosen as a send target. */
  sendable?: boolean
  /**
   * Instantly's campaign status. 1 means live, so a send reaches the host on
   * the next window — the dialog cannot warn about that without knowing the
   * status of the campaign actually chosen, not the client's default one.
   */
  status?: number | null
  /**
   * The campaign is gone from Instantly, established against a listing known to
   * be exhaustive. False when the listing was truncated or unavailable, where
   * absence proves nothing.
   */
  missing_from_provider?: boolean
}

export interface ClientLinkableInstantlyCampaign {
  id: string
  name: string
  status: number | null
  linked_client_id: string | null
  linked_client_name: string | null
  managed_client_id: string | null
}

export interface ClientInstantlyCampaignLinksResponse {
  connected: boolean
  links: ClientInstantlyCampaignLink[]
  provider_campaigns: ClientLinkableInstantlyCampaign[]
}

export async function getClientInstantlyCampaignLinks(
  workspaceId: string,
  clientId: string,
): Promise<ClientInstantlyCampaignLinksResponse> {
  return await invokeWorkspaceCampaigns<ClientInstantlyCampaignLinksResponse>({
    action: 'client-links-list',
    workspace_id: workspaceId,
    client_id: clientId,
  }, 'Linked Instantly campaigns could not be loaded.')
}

export async function setClientInstantlyCampaignLinks(
  workspaceId: string,
  clientId: string,
  campaignIds: string[],
): Promise<ClientInstantlyCampaignLink[]> {
  const data = await invokeWorkspaceCampaigns<{ links: ClientInstantlyCampaignLink[] }>({
    action: 'client-links-set',
    workspace_id: workspaceId,
    client_id: clientId,
    campaign_ids: campaignIds,
  }, 'The linked Instantly campaigns could not be saved.')
  return data.links ?? []
}

/**
 * Builds a campaign this app owns the sequence of, and links it to the client.
 *
 * The only way to add a send target. Linking an existing Instantly campaign
 * attributes its replies to the client but can never receive a pitch, because
 * it carries copy of its own.
 */
export async function createClientInstantlyCampaign(input: {
  workspaceId: string
  clientId: string
  name: string
  senderAccounts: string[]
  timezone?: string
  dailyLimit?: number
}): Promise<ClientInstantlyCampaignLink> {
  const data = await invokeWorkspaceCampaigns<{ link: ClientInstantlyCampaignLink }>({
    action: 'client-links-create',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    name: input.name,
    sender_accounts: input.senderAccounts,
    timezone: input.timezone ?? null,
    daily_limit: input.dailyLimit ?? null,
  }, 'The campaign could not be created in Instantly.')
  return data.link
}

export interface WorkspaceInboxMessage {
  id: string
  /** 'outbound' is what this agency sent — the half the pane could not show. */
  direction: 'inbound' | 'outbound'
  subject: string
  from_email: string
  to_email: string
  body_text: string
  sent_at: string | null
}

/**
 * Both sides of one conversation, oldest first. The reply list reads only
 * received mail, so without this an operator composes a reply having never
 * seen what was actually pitched — only what the host happened to quote back.
 */
export async function getWorkspaceInboxThreadMessages(
  workspaceId: string,
  threadKey: string,
): Promise<WorkspaceInboxMessage[]> {
  const data = await invokeWorkspaceCampaigns<{ messages: WorkspaceInboxMessage[] }>({
    action: 'inbox-thread-messages',
    workspace_id: workspaceId,
    thread_key: threadKey,
  }, 'The conversation history could not be loaded.')
  return Array.isArray(data.messages) ? data.messages : []
}

export async function getWorkspaceInboxThreads(
  workspaceId: string,
): Promise<WorkspaceInboxThreadsResponse> {
  return await invokeWorkspaceCampaigns<WorkspaceInboxThreadsResponse>({
    action: 'inbox-list',
    workspace_id: workspaceId,
  }, 'Inbox replies could not be loaded.')
}

export interface WorkspaceInboxDraft {
  subject: string
  body: string
  classification: WorkspaceInboxReplyClassification | null
  nudges: WorkspaceInboxNudge[]
}

export async function draftWorkspaceInboxReply(
  workspaceId: string,
  clientId: string,
  subject: string,
  message: string,
  threadContext?: { thread_key: string; email_id: string; force?: boolean; lead_email?: string },
): Promise<WorkspaceInboxDraft> {
  const data = await invokeWorkspaceCampaigns<{
    draft: { subject: string; body: string }
    classification?: WorkspaceInboxReplyClassification | null
    nudges?: WorkspaceInboxNudge[]
  }>({
    action: 'inbox-draft',
    workspace_id: workspaceId,
    client_id: clientId,
    subject,
    message,
    ...(threadContext ? { thread_key: threadContext.thread_key, email_id: threadContext.email_id, ...(threadContext.force ? { force: true } : {}), ...(threadContext.lead_email ? { lead_email: threadContext.lead_email } : {}) } : {}),
  }, 'The reply draft could not be generated.')
  return {
    ...data.draft,
    classification: data.classification ?? null,
    nudges: data.nudges ?? [],
  }
}

export interface WorkspaceInboxLeadDetail {
  first_name: string | null
  last_name: string | null
  company_name: string | null
  job_title: string | null
  website: string | null
  phone: string | null
  email: string | null
  opens: number
  replies: number
  clicks: number
  first_contacted_at: string | null
  last_contacted_at: string | null
  last_reply_at: string | null
  interest_status?: number | null
}

export async function getWorkspaceInboxLeadDetail(
  workspaceId: string,
  leadId: string,
): Promise<WorkspaceInboxLeadDetail | null> {
  const data = await invokeWorkspaceCampaigns<{ lead: WorkspaceInboxLeadDetail | null }>({
    action: 'inbox-lead-detail',
    workspace_id: workspaceId,
    lead_id: leadId,
  }, 'The lead details could not be loaded.')
  return data.lead ?? null
}

export type ClientSdrPromptId =
  | 'podcast_research'
  | 'host_info'
  | 'guest_info'
  | 'host_name_extractor'
  | 'find_topics'
  | 'write_email'
  | 'clean_email'
  | 'inbox_reply'
  | 'inbox_nudges'

export type ClientSdrPromptOverrides = Partial<
  Record<ClientSdrPromptId, { content: string; updated_at: string | null }>
>

export async function getClientSdrPrompts(
  workspaceId: string,
  clientId: string,
): Promise<ClientSdrPromptOverrides> {
  const data = await invokeWorkspaceCampaigns<{ overrides?: ClientSdrPromptOverrides }>({
    action: 'client-prompts-get',
    workspace_id: workspaceId,
    client_id: clientId,
  }, 'The client AI SDR prompts could not be loaded.')
  return data.overrides ?? {}
}

export async function setClientSdrPrompt(
  workspaceId: string,
  clientId: string,
  promptId: ClientSdrPromptId,
  content: string,
): Promise<void> {
  await invokeWorkspaceCampaigns<{ success: boolean }>({
    action: 'client-prompts-set',
    workspace_id: workspaceId,
    client_id: clientId,
    prompt_id: promptId,
    content,
  }, 'The client AI SDR prompt could not be saved.')
}

export async function resetClientSdrPrompt(
  workspaceId: string,
  clientId: string,
  promptId: ClientSdrPromptId,
): Promise<void> {
  await invokeWorkspaceCampaigns<{ success: boolean }>({
    action: 'client-prompts-reset',
    workspace_id: workspaceId,
    client_id: clientId,
    prompt_id: promptId,
  }, 'The client AI SDR prompt could not be reset.')
}

export type WorkspaceLeadInterestValue = 1 | 2 | 3 | 4 | 0 | -1 | -2 | -3 | -4 | null

export async function setWorkspaceInboxLeadInterest(
  workspaceId: string,
  input: { lead_email: string; interest_value: WorkspaceLeadInterestValue; campaign_id?: string },
): Promise<void> {
  await invokeWorkspaceCampaigns<{ success: boolean }>({
    action: 'inbox-interest-set',
    workspace_id: workspaceId,
    ...input,
  }, 'The lead status could not be updated in Instantly.')
}

export async function setWorkspaceInboxThreadStatus(
  workspaceId: string,
  input: {
    thread_key: string
    client_id: string
    status?: 'needs_reply' | 'booked' | 'archived'
    nudges_paused?: boolean
    lead_email?: string
  },
): Promise<{ booking_id: string | null }> {
  return await invokeWorkspaceCampaigns<{ success: boolean; booking_id: string | null }>({
    action: 'inbox-thread-state',
    workspace_id: workspaceId,
    ...input,
  }, 'The conversation state could not be saved.')
}

export async function sendWorkspaceInboxReply(
  workspaceId: string,
  input: { reply_to_id: string; eaccount: string; subject: string; message: string; thread_key?: string; client_id?: string; lead_email?: string },
): Promise<void> {
  await invokeWorkspaceCampaigns<{ success: boolean }>({
    action: 'inbox-reply',
    workspace_id: workspaceId,
    ...input,
  }, 'The reply could not be sent.')
}
