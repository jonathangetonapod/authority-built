import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type WorkspacePodcastCatalogContactFilter = 'all' | 'any' | 'free' | 'direct' | 'none'
export type WorkspacePodcastCatalogActivityFilter = 'active' | 'last_30_days' | 'last_90_days' | 'last_180_days' | 'last_year' | 'all'
export type WorkspacePodcastCatalogAudienceFilter = 'all' | 'under_10k' | '10k_50k' | '50k_250k' | '250k_plus'
export type WorkspacePodcastCatalogSort = 'audience' | 'name' | 'recent' | 'community'

export interface WorkspacePodcastCatalogCategory {
  category_id?: string
  category_name: string
}

export interface WorkspacePodcastCatalogItem {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  host_name: string | null
  podcast_categories: Array<WorkspacePodcastCatalogCategory | string> | null
  episode_count: number | null
  itunes_rating: number | null
  spotify_rating: number | null
  audience_size: number | null
  podcast_reach_score: number | null
  language: string | null
  region: string | null
  website: string | null
  rss_feed: string | null
  last_posted_at: string | null
  is_active: boolean
  catalog_updated_at: string | null
  free_podscan_email: string | null
  direct_email: string | null
  direct_verified_at: string | null
  shortlist_uses: number
  workspace_uses: number
}

export interface WorkspacePodcastCatalogSummary {
  total_podcasts: number
  active_podcasts: number
  podcasts_with_free_email: number
  podcasts_with_direct_email: number
  podcasts_used_in_shortlists: number
  shortlist_uses: number
  contributing_workspaces: number
}

export interface WorkspacePodcastCatalogPage {
  workspace: { id: string; name: string }
  search_mode?: 'browse' | 'keyword' | 'hybrid'
  items: WorkspacePodcastCatalogItem[]
  categories: string[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
  summary: WorkspacePodcastCatalogSummary
}

export interface WorkspacePodcastCatalogParams {
  search?: string
  category?: string
  contact?: WorkspacePodcastCatalogContactFilter
  activity?: WorkspacePodcastCatalogActivityFilter
  audience?: WorkspacePodcastCatalogAudienceFilter
  sort?: WorkspacePodcastCatalogSort
  page?: number
  pageSize?: number
}

export async function getWorkspacePodcastCatalog(
  workspaceId: string,
  params: WorkspacePodcastCatalogParams = {},
): Promise<WorkspacePodcastCatalogPage> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-podcast-catalog', {
    body: {
      action: 'list',
      workspace_id: canonicalWorkspaceId,
      search: params.search?.trim() || undefined,
      category: params.category || undefined,
      contact: params.contact || 'all',
      activity: params.activity || 'active',
      audience: params.audience || 'all',
      sort: params.sort || 'audience',
      page: params.page || 1,
      page_size: params.pageSize || 24,
    },
  })
  if (error) throw await toFunctionError(error, 'The shared podcast database could not be loaded.')

  const response = data as WorkspacePodcastCatalogPage | null
  if (
    !response?.workspace
    || response.workspace.id !== canonicalWorkspaceId
    || !Array.isArray(response.items)
    || !Array.isArray(response.categories)
    || !response.pagination
    || !response.summary
  ) {
    throw new Error('The podcast database response did not match the workspace address.')
  }
  return response
}
