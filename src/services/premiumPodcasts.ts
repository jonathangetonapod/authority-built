import { supabase } from '@/lib/supabase'

export interface PremiumPodcast {
  id: string
  podscan_id: string
  podcast_name: string
  podcast_image_url?: string
  audience_size?: string
  episode_count?: string
  rating?: string
  reach_score?: string
  why_this_show?: string
  whats_included: string[]
  price: string
  my_cost?: string // Admin-only field: what it costs to purchase the placement
  is_featured: boolean
  is_active: boolean
  display_order: number
  notes?: string
  created_at: string
  updated_at: string
  created_by?: string
}

export interface CreatePremiumPodcastInput {
  podscan_id: string
  podcast_name: string
  podcast_image_url?: string
  audience_size?: string
  episode_count?: string
  rating?: string
  reach_score?: string
  why_this_show?: string
  whats_included?: string[]
  price: string
  my_cost?: string
  is_featured?: boolean
  is_active?: boolean
  display_order?: number
  notes?: string
}

export interface UpdatePremiumPodcastInput extends Partial<CreatePremiumPodcastInput> {
  id: string
}

// Get all premium podcasts (admin view)
export const getAllPremiumPodcasts = async (): Promise<PremiumPodcast[]> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get active premium podcasts (public view)
export const getActivePremiumPodcasts = async (): Promise<PremiumPodcast[]> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

// Get featured premium podcasts
export const getFeaturedPremiumPodcasts = async (): Promise<PremiumPodcast[]> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

// Get podcasts by category
export const getPremiumPodcastsByCategory = async (category: string): Promise<PremiumPodcast[]> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .select('*')
    .eq('is_active', true)
    .contains('categories', [category])
    .order('display_order', { ascending: true })

  if (error) throw error
  return data || []
}

// Get single premium podcast by ID
export const getPremiumPodcastById = async (id: string): Promise<PremiumPodcast | null> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// Create new premium podcast
export const createPremiumPodcast = async (input: CreatePremiumPodcastInput): Promise<PremiumPodcast> => {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('premium_podcasts')
    .insert({
      ...input,
      created_by: user?.id
    })
    .select()
    .single()

  if (error) throw error
  return data
}

// Update premium podcast
export const updatePremiumPodcast = async (input: UpdatePremiumPodcastInput): Promise<PremiumPodcast> => {
  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('premium_podcasts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Delete premium podcast
export const deletePremiumPodcast = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('premium_podcasts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// Toggle featured status
export const togglePodcastFeatured = async (id: string, isFeatured: boolean): Promise<PremiumPodcast> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .update({ is_featured: isFeatured })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Toggle active status
export const togglePodcastActive = async (id: string, isActive: boolean): Promise<PremiumPodcast> => {
  const { data, error } = await supabase
    .from('premium_podcasts')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Helper function to format audience size
export const formatAudienceSize = (size: number): string => {
  if (size >= 1000000) {
    return `${(size / 1000000).toFixed(1)}M`
  } else if (size >= 1000) {
    return `${(size / 1000).toFixed(0)}K`
  }
  return size.toString()
}

// Helper function to get pricing tier badge color
export const getPricingTierColor = (price: string): string => {
  const priceNum = parseInt(price.replace(/[^0-9]/g, ''))
  if (priceNum >= 3000) return 'bg-purple-100 text-purple-700'
  if (priceNum >= 2000) return 'bg-blue-100 text-blue-700'
  if (priceNum >= 1500) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-700'
}
