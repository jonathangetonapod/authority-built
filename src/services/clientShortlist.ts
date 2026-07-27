import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { decodeHtmlEntities } from '@/lib/htmlEntities'

export type ClientShortlistVisibility = 'visible' | 'archived'
export type ClientShortlistFeedbackStatus = 'approved' | 'rejected' | null
export type ClientShortlistResearchStageId = 'podcast_profile' | 'host_profile' | 'recent_episodes' | 'guest_patterns' | 'guest_fit' | 'pitch_angles'
export type ClientShortlistResearchStatus = 'queued' | 'running' | 'completed' | 'failed'
export type ClientShortlistEmailUnlockStageId = 'identify_contact' | 'find_email' | 'verify_email'
export type ClientShortlistEmailUnlockStatus = 'queued' | 'running' | 'unlocked' | 'not_found' | 'failed'

export interface ClientShortlistResearchProgress {
  status: ClientShortlistResearchStatus
  current_stage: ClientShortlistResearchStageId | null
  completed_stages: ClientShortlistResearchStageId[]
  message?: string | null
  started_at?: string | null
  updated_at?: string | null
}

export interface ClientShortlistEmailUnlock {
  status: ClientShortlistEmailUnlockStatus
  current_stage: ClientShortlistEmailUnlockStageId | null
  completed_stages: ClientShortlistEmailUnlockStageId[]
  email?: string | null
  host_name?: string | null
  message?: string | null
  started_at?: string | null
  updated_at?: string | null
  unlocked_at?: string | null
  verified_at?: string | null
  scope?: 'global' | null
  credit_cost?: number | null
}

export interface ClientShortlistCategory {
  category_id: string
  category_name: string
}

export interface ClientShortlistPodcastInput {
  podcast_id: string
  podscan_podcast_id?: string
  podcast_name: string
  podcast_description?: string | null
  podcast_image_url?: string | null
  podcast_url?: string | null
  publisher_name?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  audience_size?: number | null
  last_posted_at?: string | null
  podcast_categories?: ClientShortlistCategory[] | null
  language?: string | null
  region?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

export interface ClientShortlistEpisodePerson {
  name: string
  company: string | null
  role: string | null
}

export interface ClientShortlistEpisode {
  title: string
  description: string | null
  posted_at: string | null
  episode_id?: string | null
  url?: string | null
  audio_url?: string | null
  image_url?: string | null
  duration_seconds?: number | null
  word_count?: number | null
  has_guests?: boolean
  hosts?: ClientShortlistEpisodePerson[]
  guests?: ClientShortlistEpisodePerson[]
  summary?: string | null
  keywords?: string[]
  topics?: string[]
}

/**
 * What this workspace already means to a host. `booked`, `replied`, and
 * `declined` and `in_conversation` change the opening; `suppressed` blocks
 * preparation. Curated context can exist even while the derived state is `none`.
 */
export interface ClientShortlistAgencyRelationship {
  /** Canonical Podscan show identifier used for workspace-wide dedupe. */
  podcast_id: string
  state: 'none' | 'pitched' | 'replied' | 'declined' | 'booked' | 'in_conversation' | 'suppressed'
  touch_count: number
  last_contacted_at: string | null
  last_client_name: string | null
  booked_client_name: string | null
  booked_at: string | null
  booked_episode_url: string | null
  replied_client_name: string | null
  contact_email: string | null
  same_contact_other_show: boolean
  manual_stage: 'nurturing' | 'warm' | 'do_not_contact' | null
  summary: string | null
}

export interface ClientShortlistPodcast extends ClientShortlistPodcastInput {
  id: string
  client_id: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: ClientShortlistCategory[] | null
  recent_episodes?: ClientShortlistEpisode[] | null
  episodes_fetched_at?: string | null
  host_name?: string | null
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title: string; description: string }> | null
  ai_analyzed_at: string | null
  research_progress?: ClientShortlistResearchProgress | null
  email_unlock?: ClientShortlistEmailUnlock | null
  visibility: ClientShortlistVisibility
  display_order: number
  is_featured: boolean
  featured_order: number | null
  operator_notes: string | null
  archived_at: string | null
  feedback_status: ClientShortlistFeedbackStatus
  feedback_notes: string | null
  feedback_updated_at: string | null
  prior_outreach_at?: string | null
  agency_relationship?: ClientShortlistAgencyRelationship | null
  created_at: string
  updated_at: string
}

export interface ClientShortlistCatalogPodcast extends ClientShortlistPodcastInput {
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: ClientShortlistCategory[] | null
  language: string | null
  region: string | null
  podcast_email: string | null
  rss_feed: string | null
  already_added: boolean
  existing_visibility: ClientShortlistVisibility | null
}

export interface ClientShortlistResponse {
  client: { id: string; name: string }
  podcasts: ClientShortlistPodcast[]
}

export interface ClientShortlistAddResult {
  added: number
  skipped: number
  podcast_ids: string[]
}

async function invokeClientShortlist<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', { body })
  if (error) throw await toFunctionError(error, 'The client podcast list could not be updated.')
  return data as T
}

export async function getClientShortlist(
  workspaceId: string,
  clientId: string,
): Promise<ClientShortlistResponse> {
  const data = await invokeClientShortlist<ClientShortlistResponse>({
    action: 'list',
    workspace_id: workspaceId,
    client_id: clientId,
  })
  data.podcasts = (data.podcasts || []).map((podcast) => ({
    ...podcast,
    podcast_name: decodeHtmlEntities(podcast.podcast_name),
    podcast_description: podcast.podcast_description
      ? decodeHtmlEntities(podcast.podcast_description)
      : podcast.podcast_description,
  }))
  return data
}

export async function searchClientPodcastCatalog(
  workspaceId: string,
  clientId: string,
  query: string,
): Promise<ClientShortlistCatalogPodcast[]> {
  const data = await invokeClientShortlist<{ podcasts: ClientShortlistCatalogPodcast[] }>({
    action: 'catalog-search',
    workspace_id: workspaceId,
    client_id: clientId,
    query,
  })
  return data.podcasts || []
}

export async function addClientShortlistPodcasts(
  workspaceId: string,
  clientId: string,
  podcasts: ClientShortlistPodcastInput[],
): Promise<ClientShortlistAddResult> {
  const combined: ClientShortlistAddResult = { added: 0, skipped: 0, podcast_ids: [] }
  for (let offset = 0; offset < podcasts.length; offset += 50) {
    const result = await invokeClientShortlist<ClientShortlistAddResult>({
      action: 'add',
      workspace_id: workspaceId,
      client_id: clientId,
      podcasts: podcasts.slice(offset, offset + 50),
    })
    combined.added += result.added
    combined.skipped += result.skipped
    combined.podcast_ids.push(...result.podcast_ids)
  }
  return combined
}

export async function updateClientShortlistPodcast(
  workspaceId: string,
  clientId: string,
  podcastId: string,
  changes: {
    visibility?: ClientShortlistVisibility
    is_featured?: boolean
    operator_notes?: string | null
    feedback_status?: ClientShortlistFeedbackStatus
  },
): Promise<ClientShortlistPodcast> {
  const data = await invokeClientShortlist<{ podcast: ClientShortlistPodcast }>({
    action: 'update',
    workspace_id: workspaceId,
    client_id: clientId,
    podcast_id: podcastId,
    changes,
  })
  return data.podcast
}

export async function reorderClientShortlistFeatured(
  workspaceId: string,
  clientId: string,
  podcastIds: string[],
): Promise<void> {
  await invokeClientShortlist({
    action: 'reorder-featured',
    workspace_id: workspaceId,
    client_id: clientId,
    podcast_ids: podcastIds,
  })
}

export async function runClientShortlistResearch(
  workspaceId: string,
  clientId: string,
  shortlistPodcastId: string,
  relationshipAcknowledged = false,
): Promise<ClientShortlistResearchProgress> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', {
    body: {
      action: 'research-run',
      workspace_id: workspaceId,
      client_id: clientId,
      shortlist_podcast_id: shortlistPodcastId,
      ...(relationshipAcknowledged ? { relationship_acknowledged: true } : {}),
    },
  })
  if (error) throw await toFunctionError(error, 'The research run could not be started.')
  if (!data?.research_progress || typeof data.research_progress !== 'object') {
    throw new Error('The research response was invalid.')
  }
  return data.research_progress as ClientShortlistResearchProgress
}

export async function runClientShortlistEmailSearch(
  workspaceId: string,
  clientId: string,
  shortlistPodcastId: string,
  relationshipAcknowledged = false,
): Promise<ClientShortlistEmailUnlock> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', {
    body: {
      action: 'email-search-run',
      workspace_id: workspaceId,
      client_id: clientId,
      shortlist_podcast_id: shortlistPodcastId,
      ...(relationshipAcknowledged ? { relationship_acknowledged: true } : {}),
    },
  })
  if (error) throw await toFunctionError(error, 'The direct email search could not be started.')
  if (!data?.email_unlock || typeof data.email_unlock !== 'object') {
    throw new Error('The email search response was invalid.')
  }
  return data.email_unlock as ClientShortlistEmailUnlock
}

export interface ClientShortlistResearchDocument {
  podcast_research: string | null
  host_info: string | null
  guest_info: string | null
  find_topics: string | null
  episode_transcript_excerpt: string | null
  recent_guest_name: string | null
  episodes_used: Array<{ title: string; had_transcript: boolean }>
  generated_at: string | null
}

export async function getClientShortlistResearchDocument(
  workspaceId: string,
  clientId: string,
  shortlistPodcastId: string,
): Promise<ClientShortlistResearchDocument | null> {
  const data = await invokeClientShortlist<{ document: ClientShortlistResearchDocument | null }>({
    action: 'research-inspect',
    workspace_id: workspaceId,
    client_id: clientId,
    shortlist_podcast_id: shortlistPodcastId,
  })
  return data.document ?? null
}

export interface ClientShortlistEpisodeMetadata {
  episodes: ClientShortlistEpisode[]
  last_posted_at: string | null
  episodes_fetched_at: string | null
}

/**
 * Guarantees the stored episode capture for a shortlisted show exists,
 * fetching from Podscan only when it is missing or stale. Called by the
 * pitch dialog on open — never by an operator action.
 */
export async function ensureClientShortlistEpisodes(
  workspaceId: string,
  clientId: string,
  podcastId: string,
  relationshipAcknowledged = false,
): Promise<ClientShortlistEpisodeMetadata> {
  const data = await invokeClientShortlist<ClientShortlistEpisodeMetadata>({
    action: 'episodes-ensure',
    workspace_id: workspaceId,
    client_id: clientId,
    podcast_id: podcastId,
    ...(relationshipAcknowledged ? { relationship_acknowledged: true } : {}),
  })
  return {
    episodes: Array.isArray(data.episodes) ? data.episodes : [],
    last_posted_at: data.last_posted_at ?? null,
    episodes_fetched_at: data.episodes_fetched_at ?? null,
  }
}

export interface ClientAutopilotSettings {
  enabled: boolean
  max_weekly_adds: number
  min_score: number
  last_run_at: string | null
  last_run_added: number
  next_run_at: string | null
}

export async function getClientAutopilot(
  workspaceId: string,
  clientId: string,
): Promise<ClientAutopilotSettings | null> {
  const data = await invokeClientShortlist<{ autopilot: ClientAutopilotSettings | null }>({
    action: 'autopilot-get',
    workspace_id: workspaceId,
    client_id: clientId,
  })
  return data.autopilot
}

export async function setClientAutopilot(
  workspaceId: string,
  clientId: string,
  settings: { enabled: boolean; max_weekly_adds?: number; min_score?: number },
): Promise<ClientAutopilotSettings> {
  const data = await invokeClientShortlist<{ autopilot: ClientAutopilotSettings }>({
    action: 'autopilot-set',
    workspace_id: workspaceId,
    client_id: clientId,
    ...settings,
  })
  return data.autopilot
}

export interface ClientShortlistPitch {
  subject: string
  body: string
  follow_up_1_body?: string | null
  follow_up_2_body?: string | null
  /** Unresolved trust-layer flags — style breaches or unsupported claims the
   * revision pass could not fix. Shown to the operator, never hidden. */
  audit_flags?: string[]
  /** Prompt-chain revision that wrote this copy (reply-rate analytics). */
  chain_version?: string | null
  angle_index: number
}

export async function generateClientShortlistPitch(
  workspaceId: string,
  clientId: string,
  shortlistPodcastId: string,
  angleIndex: number,
  relationshipAcknowledged = false,
): Promise<ClientShortlistPitch> {
  const { data, error } = await supabase.functions.invoke('workspace-client-shortlist', {
    body: {
      action: 'pitch-generate',
      workspace_id: workspaceId,
      client_id: clientId,
      shortlist_podcast_id: shortlistPodcastId,
      angle_index: angleIndex,
      ...(relationshipAcknowledged ? { relationship_acknowledged: true } : {}),
    },
  })
  if (error) throw await toFunctionError(error, 'The pitch could not be written.')
  if (!data?.pitch || typeof data.pitch.body !== 'string') {
    throw new Error('The pitch response was invalid.')
  }
  return data.pitch as ClientShortlistPitch
}
