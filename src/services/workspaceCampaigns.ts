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

export interface WorkspaceMailboxAccount {
  email: string
  first_name: string | null
  last_name: string | null
  status: number
  status_message: string | null
  warmup_status: number | null
  daily_limit: number | null
  sent_today: number | null
  warmup_emails: number | null
  warmup_limit: number | null
  health_score: number | null
  tags: WorkspaceMailboxTag[]
}

export interface WorkspaceMailboxesResponse {
  connected: boolean
  reason?: 'key_rejected' | 'scope_missing'
  provider_workspace_name: string | null
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
  email_open_count: number
  email_reply_count: number
  approved_at: string | null
  launched_at: string | null
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
}): Promise<{ added: boolean; campaign: WorkspaceClientCampaign; target: WorkspaceCampaignTarget }> {
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
}): Promise<WorkspaceClientCampaign> {
  const response = await invokeWorkspaceCampaigns<CampaignMutationResponse>({
    action: 'update-settings',
    workspace_id: input.workspaceId,
    client_id: input.clientId,
    name: input.name,
    timezone: input.timezone,
    daily_limit: input.dailyLimit,
    sender_accounts: input.senderAccounts,
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
  content: string
  updated_at: string | null
}

export type ResearchPromptOverrides = Partial<Record<string, ResearchPromptOverride>>

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
  lead_email: string
  campaign: {
    campaign_id: string
    campaign_name: string | null
    client: { id: string; name: string } | null
  } | null
}

export interface WorkspaceInboxThreadsResponse {
  connected: boolean
  reason?: 'key_rejected' | 'scope_missing'
  threads: WorkspaceInboxThread[]
}

export async function getWorkspaceInboxThreads(
  workspaceId: string,
): Promise<WorkspaceInboxThreadsResponse> {
  return await invokeWorkspaceCampaigns<WorkspaceInboxThreadsResponse>({
    action: 'inbox-list',
    workspace_id: workspaceId,
  }, 'Inbox replies could not be loaded.')
}

export async function draftWorkspaceInboxReply(
  workspaceId: string,
  clientId: string,
  subject: string,
  message: string,
): Promise<{ subject: string; body: string }> {
  const data = await invokeWorkspaceCampaigns<{ draft: { subject: string; body: string } }>({
    action: 'inbox-draft',
    workspace_id: workspaceId,
    client_id: clientId,
    subject,
    message,
  }, 'The reply draft could not be generated.')
  return data.draft
}

export async function sendWorkspaceInboxReply(
  workspaceId: string,
  input: { reply_to_id: string; eaccount: string; subject: string; message: string },
): Promise<void> {
  await invokeWorkspaceCampaigns<{ success: boolean }>({
    action: 'inbox-reply',
    workspace_id: workspaceId,
    ...input,
  }, 'The reply could not be sent.')
}
