const PODSCAN_API_BASE = 'https://podscan.fm/api/v1';
const API_KEY = import.meta.env.VITE_PODSCAN_API_KEY;

export interface PodcastData {
  id: string;
  name: string;
  url: string;
  description?: string;
  image?: string;
  reach_score?: number;
  categories?: string[];
  episode_count?: number;
  language?: string;
  region?: string;
  rating?: number;
}

export interface EpisodeSearchResult {
  id: string;
  title: string;
  description: string;
  url: string;
  posted_at: string;
  podcast: PodcastData;
}

export interface SearchResponse {
  data: EpisodeSearchResult[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

interface SearchOptions {
  query?: string;
  category_ids?: string;
  podcast_ids?: string;
  before?: string;
  since?: string;
  per_page?: number;
  order_by?: 'best_match' | 'created_at' | 'title' | 'posted_at' | 'podcast_rating';
  order_dir?: 'asc' | 'desc';
  podcast_language?: string;
  podcast_region?: string;
  show_full_podcast?: boolean;
}

/**
 * Search for podcasts via episode search with full podcast metadata
 */
export async function searchPodcasts(options: SearchOptions = {}): Promise<SearchResponse> {
  const params = new URLSearchParams({
    show_full_podcast: 'true', // Always get full podcast data
    per_page: String(options.per_page || 20),
    order_by: options.order_by || 'podcast_rating',
    order_dir: options.order_dir || 'desc',
    ...Object.entries(options).reduce((acc, [key, value]) => {
      if (value !== undefined && key !== 'show_full_podcast' && key !== 'per_page' && key !== 'order_by' && key !== 'order_dir') {
        acc[key] = String(value);
      }
      return acc;
    }, {} as Record<string, string>)
  });

  const response = await fetch(`${PODSCAN_API_BASE}/episodes/search?${params}`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Podscan API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get unique podcasts from search results (deduplicates by podcast ID)
 */
export function extractUniquePodcasts(searchResponse: SearchResponse): PodcastData[] {
  const podcastMap = new Map<string, PodcastData>();

  searchResponse.data.forEach((episode) => {
    if (episode.podcast && !podcastMap.has(episode.podcast.id)) {
      podcastMap.set(episode.podcast.id, episode.podcast);
    }
  });

  return Array.from(podcastMap.values());
}

/**
 * Search for podcasts in specific categories
 */
export async function searchPodcastsByCategory(
  categories: string[],
  limit = 20
): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    per_page: limit * 2, // Fetch more to account for duplicates
    order_by: 'podcast_rating',
    order_dir: 'desc',
  });

  const podcasts = extractUniquePodcasts(response);
  return podcasts.slice(0, limit);
}

/**
 * Search for business/entrepreneurship podcasts
 */
export async function searchBusinessPodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'business OR entrepreneurship OR startup OR founder',
    per_page: limit * 2,
    order_by: 'podcast_rating',
    order_dir: 'desc',
  });

  const podcasts = extractUniquePodcasts(response);
  return podcasts.slice(0, limit);
}

/**
 * Search for finance/investment podcasts
 */
export async function searchFinancePodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'finance OR investing OR wealth OR fintech',
    per_page: limit * 2,
    order_by: 'podcast_rating',
    order_dir: 'desc',
  });

  const podcasts = extractUniquePodcasts(response);
  return podcasts.slice(0, limit);
}

/**
 * Search for tech/SaaS podcasts
 */
export async function searchTechPodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'technology OR tech OR SaaS OR software',
    per_page: limit * 2,
    order_by: 'podcast_rating',
    order_dir: 'desc',
  });

  const podcasts = extractUniquePodcasts(response);
  return podcasts.slice(0, limit);
}

/**
 * Get podcast analytics/stats (simplified - real analytics would need additional endpoints)
 */
export interface PodcastAnalytics {
  id: string;
  name: string;
  reach_score: number;
  episode_count: number;
  rating: number;
  categories: string[];
  language: string;
  region: string;
}

export function getPodcastAnalytics(podcast: PodcastData): PodcastAnalytics {
  return {
    id: podcast.id,
    name: podcast.name,
    reach_score: podcast.reach_score || 0,
    episode_count: podcast.episode_count || 0,
    rating: podcast.rating || 0,
    categories: podcast.categories || [],
    language: podcast.language || 'en',
    region: podcast.region || 'US',
  };
}
