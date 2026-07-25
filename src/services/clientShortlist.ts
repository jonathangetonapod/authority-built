import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

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
  return await invokeClientShortlist<ClientShortlistResponse>({
    action: 'list',
    workspace_id: workspaceId,
    client_id: clientId,
  })
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
