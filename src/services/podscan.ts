const PODSCAN_API_BASE = 'https://podscan.fm/api/v1';
const API_KEY = import.meta.env.VITE_PODSCAN_API_KEY;

export interface PodcastData {
  podcast_id: string;
  podcast_name: string;
  podcast_url: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_reach_score?: number;
  podcast_categories?: Array<{ category_id: string; category_name: string }>;
  episode_count?: number;
  language?: string;
  region?: string;
  reach?: {
    itunes?: {
      itunes_rating_average?: string;
      itunes_rating_count?: string;
    };
  };
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
  episodes: EpisodeSearchResult[];
  meta?: {
    total?: number;
    per_page?: number;
    current_page?: number;
    last_page?: number;
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

  const url = `${PODSCAN_API_BASE}/episodes/search?${params}`;
  console.log('🎙️ Podscan API Request:', url);
  console.log('📊 Search options:', options);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Podscan API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Podscan API Response:', data);
  console.log('📦 Episodes found:', data.episodes?.length || 0);

  return data;
}

/**
 * Get unique podcasts from search results (deduplicates by podcast ID)
 */
export function extractUniquePodcasts(searchResponse: SearchResponse): PodcastData[] {
  const podcastMap = new Map<string, PodcastData>();

  searchResponse.episodes.forEach((episode) => {
    if (episode.podcast && !podcastMap.has(episode.podcast.podcast_id)) {
      podcastMap.set(episode.podcast.podcast_id, episode.podcast);
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
  const rating = podcast.reach?.itunes?.itunes_rating_average
    ? parseFloat(podcast.reach.itunes.itunes_rating_average)
    : 0;

  const categories = podcast.podcast_categories?.map(cat => cat.category_name) || [];

  return {
    id: podcast.podcast_id,
    name: podcast.podcast_name,
    reach_score: podcast.podcast_reach_score || 0,
    episode_count: podcast.episode_count || 0,
    rating: rating,
    categories: categories,
    language: podcast.language || 'en',
    region: podcast.region || 'US',
  };
}
