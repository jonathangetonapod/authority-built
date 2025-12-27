const PODSCAN_API_BASE = 'https://podscan.fm/api/v1';
const API_KEY = import.meta.env.VITE_PODSCAN_API_KEY;

export interface PodcastData {
  podcast_id: string;
  podcast_guid?: string;
  podcast_name: string;
  podcast_url: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_reach_score?: number;
  podcast_categories?: Array<{ category_id: string; category_name: string }>;
  episode_count?: number;
  language?: string;
  region?: string;
  publisher_name?: string;
  is_active?: boolean;
  rss_url?: string;
  last_posted_at?: string;
  podcast_itunes_id?: string;
  podcast_spotify_id?: string;
  podcast_has_guests?: boolean;
  podcast_has_sponsors?: boolean;
  reach?: {
    itunes?: {
      itunes_rating_average?: string;
      itunes_rating_count?: string;
      itunes_rating_count_bracket?: string;
    };
    spotify?: {
      spotify_rating_average?: string;
      spotify_rating_count?: string;
      spotify_rating_count_bracket?: string;
    };
    audience_size?: number;
    social_links?: Array<{
      platform: string;
      url: string;
    }>;
    email?: string;
    website?: string;
  };
  brand_safety?: {
    framework: string;
    risk_level: string;
    recommendation: string;
  };
}

export interface PodcastSearchResponse {
  podcasts: PodcastData[];
  pagination?: {
    total?: string;
    per_page?: string;
    current_page?: string;
    last_page?: string;
    from?: string;
    to?: string;
  };
}

interface SearchOptions {
  query?: string;
  category_ids?: string;
  per_page?: number;
  order_by?: 'best_match' | 'name' | 'created_at' | 'episode_count' | 'rating' | 'audience_size' | 'last_posted_at';
  order_dir?: 'asc' | 'desc';
  search_fields?: string;
  language?: string;
  region?: string;
  min_audience_size?: number;
  max_audience_size?: number;
  min_episode_count?: number;
  max_episode_count?: number;
  min_last_episode_posted_at?: string;
  max_last_episode_posted_at?: string;
  has_guests?: boolean;
  has_sponsors?: boolean;
}

/**
 * Search for podcasts directly
 */
export async function searchPodcasts(options: SearchOptions = {}): Promise<PodcastSearchResponse> {
  const params = new URLSearchParams();

  // Add all options to params
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  });

  const url = `${PODSCAN_API_BASE}/podcasts/search?${params}`;
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
  console.log('📦 Podcasts found:', data.podcasts?.length || 0);

  return data;
}

/**
 * Search for business/entrepreneurship podcasts with variety
 */
export async function searchBusinessPodcasts(limit = 20): Promise<PodcastData[]> {
  // Fetch more than needed to create variety
  const fetchSize = Math.min(limit * 3, 50); // Fetch 3x what we need, max 50

  // Randomize the order_by to get different results each time
  const orderOptions: Array<'rating' | 'episode_count' | 'audience_size' | 'last_posted_at'> = [
    'rating',
    'episode_count',
    'audience_size',
    'last_posted_at'
  ];
  const randomOrder = orderOptions[Math.floor(Math.random() * orderOptions.length)];

  const response = await searchPodcasts({
    query: 'business OR entrepreneurship OR startup OR founder',
    per_page: fetchSize,
    order_by: randomOrder,
    order_dir: 'desc',
    min_episode_count: 10, // Filter out brand new podcasts
    min_audience_size: 1000, // Minimum 1K audience
    max_audience_size: 30000, // Max 30K listeners - realistic boutique agency range
    region: 'US', // Only US-based podcasts
    has_guests: true, // Only shows that do interviews
  });

  console.log(`🎯 Fetched ${response.podcasts.length} business podcasts`);

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  console.log(`✅ ${validPodcasts.length} podcasts have valid images, selecting ${limit} randomly`);

  // Shuffle and return random subset
  const shuffled = validPodcasts.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Search for premium/high-tier podcasts for premium placements
 */
export async function searchPremiumPodcasts(limit = 12): Promise<PodcastData[]> {
  // Fetch more for variety
  const fetchSize = Math.min(limit * 2, 50);

  const response = await searchPodcasts({
    query: 'business OR entrepreneurship OR startup OR founder OR leadership OR SaaS',
    per_page: fetchSize,
    order_by: 'audience_size', // Sort by audience size for premium tier
    order_dir: 'desc',
    min_episode_count: 20, // More established shows
    min_audience_size: 10000, // Minimum 10K audience
    max_audience_size: 200000, // Max 200K - premium tier shows
    region: 'US',
    has_guests: true,
  });

  console.log(`💎 Fetched ${response.podcasts.length} premium podcasts`);

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  console.log(`✅ ${validPodcasts.length} premium podcasts have valid images, selecting ${limit} randomly`);

  // Shuffle and return subset
  const shuffled = validPodcasts.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Search for finance/investment podcasts
 */
export async function searchFinancePodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'finance OR investing OR wealth OR fintech',
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Search for tech/SaaS podcasts
 */
export async function searchTechPodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'technology OR tech OR SaaS OR software',
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Search for podcasts in specific categories
 */
export async function searchPodcastsByCategory(
  categories: string[],
  limit = 20
): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    category_ids: categories.join(','),
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Get a single podcast by ID
 */
export async function getPodcastById(podcastId: string): Promise<PodcastData> {
  const url = `${PODSCAN_API_BASE}/podcasts/${podcastId}`;
  console.log('🎙️ Fetching podcast by ID:', podcastId);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch podcast: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Podcast fetched:', data);

  // API returns { podcast: { ... } }, extract the podcast object
  return data.podcast || data;
}

/**
 * Get podcast analytics/stats
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
  audience_size: number;
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
    audience_size: podcast.reach?.audience_size || 0,
  };
}
