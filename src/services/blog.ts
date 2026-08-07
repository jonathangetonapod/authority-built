import { supabase } from '@/lib/supabase'

// =====================================================
// Types & Interfaces
// =====================================================

export interface BlogPost {
  id: string
  slug: string
  title: string
  meta_description: string
  content: string
  excerpt?: string
  featured_image_url?: string
  featured_image_alt?: string
  focus_keyword?: string
  schema_markup?: Record<string, unknown>
  category_id?: string
  tags?: string[]
  status: 'draft' | 'published'
  published_at?: string
  view_count: number
  read_time_minutes: number
  submitted_to_google_at?: string
  indexed_by_google_at?: string
  google_indexing_status?: string
  author_name: string
  created_at: string
  updated_at: string
  created_by?: string
  blog_categories?: BlogCategory
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
  description?: string
  display_order: number
  is_active: boolean
  created_at: string
}

export interface CreateBlogPostInput {
  title: string
  slug: string
  meta_description: string
  content: string
  excerpt?: string
  featured_image_url?: string
  featured_image_alt?: string
  focus_keyword?: string
  schema_markup?: Record<string, unknown>
  category_id?: string
  tags?: string[]
  status?: 'draft' | 'published'
  read_time_minutes?: number
  author_name?: string
}

export interface UpdateBlogPostInput extends Partial<CreateBlogPostInput> {
  id: string
}

export interface BlogFilters {
  category?: string
  status?: 'draft' | 'published' | 'all'
  search?: string
  limit?: number
  offset?: number
}

// =====================================================
// Blog Post CRUD Operations
// =====================================================

/**
 * Get all blog posts with optional filters
 */
export const getAllPosts = async (filters: BlogFilters = {}) => {
  let query = supabase
    .from('blog_posts')
    .select('*, blog_categories(*)')

  // Apply filters
  if (filters.category) {
    query = query.eq('category_id', filters.category)
  }

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters.search) {
    // Strip PostgREST filter metacharacters ( , ) * before building the .or()
    // expression — an unescaped comma or paren breaks parsing at best and
    // injects filter terms at worst (repo security rule).
    const safeSearch = filters.search.replace(/[,()*\\]/gu, ' ').trim()
    if (safeSearch) {
      query = query.or(`title.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%,excerpt.ilike.%${safeSearch}%`)
    }
  }

  // Pagination
  if (filters.limit) {
    query = query.limit(filters.limit)
  }

  if (filters.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
  }

  // Order by published date (newest first)
  query = query.order('published_at', { ascending: false, nullsFirst: false })
  query = query.order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) throw error
  return data as unknown as BlogPost[]
}

/**
 * Get single blog post by slug
 */
export const getPostBySlug = async (slug: string) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(*)')
    .eq('slug', slug)
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Get single blog post by ID
 */
export const getPostById = async (id: string) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*, blog_categories(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Create new blog post
 */
export const createPost = async (post: CreateBlogPostInput) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .insert(post)
    .select('*, blog_categories(*)')
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Update existing blog post
 */
export const updatePost = async (input: UpdateBlogPostInput) => {
  const { id, ...updates } = input

  const { data, error } = await supabase
    .from('blog_posts')
    .update(updates)
    .eq('id', id)
    .select('*, blog_categories(*)')
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Delete blog post
 */
export const deletePost = async (id: string) => {
  const { error } = await supabase
    .from('blog_posts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Publish blog post (change status from draft to published)
 */
export const publishPost = async (id: string) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, blog_categories(*)')
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Unpublish blog post (change status from published to draft)
 */
export const unpublishPost = async (id: string) => {
  const { data, error } = await supabase
    .from('blog_posts')
    .update({
      status: 'draft',
      published_at: null,
    })
    .eq('id', id)
    .select('*, blog_categories(*)')
    .single()

  if (error) throw error
  return data as BlogPost
}

/**
 * Increment view count for a blog post
 */
export const incrementViewCount = async (id: string) => {
  const { error } = await supabase.rpc('increment_post_views', { post_id: id })

  if (error) {
    // Fallback: manual increment
    const { data: post } = await supabase
      .from('blog_posts')
      .select('view_count')
      .eq('id', id)
      .single()

    if (post) {
      await supabase
        .from('blog_posts')
        .update({ view_count: post.view_count + 1 })
        .eq('id', id)
    }
  }
}

// =====================================================
// Blog Category Operations
// =====================================================

/**
 * Get all blog categories
 */
export const getAllCategories = async () => {
  const { data, error } = await supabase
    .from('blog_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) throw error
  return data as BlogCategory[]
}

/**
 * Get category by slug
 */
export const getCategoryBySlug = async (slug: string) => {
  const { data, error } = await supabase
    .from('blog_categories')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error) throw error
  return data as BlogCategory
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Generate URL-friendly slug from title
 */
export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
}

/**
 * Check if slug is unique
 */
export const isSlugUnique = async (slug: string, excludeId?: string): Promise<boolean> => {
  let query = supabase
    .from('blog_posts')
    .select('id')
    .eq('slug', slug)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data, error } = await query

  if (error) throw error
  return data.length === 0
}

/**
 * Calculate read time based on content
 */
export const calculateReadTime = (content: string): number => {
  const wordsPerMinute = 200
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute))
}

/**
 * Generate excerpt from content
 */
export const generateExcerpt = (content: string, maxLength = 160): string => {
  // Strip HTML tags
  const text = content.replace(/<[^>]*>/g, '')

  // Trim to max length at word boundary
  if (text.length <= maxLength) {
    return text
  }

  const trimmed = text.substr(0, maxLength)
  const lastSpace = trimmed.lastIndexOf(' ')

  return trimmed.substr(0, lastSpace) + '...'
}

/**
 * Generate JSON-LD schema markup for blog post
 */
export const generateSchemaMarkup = (post: BlogPost) => {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.meta_description,
    image: post.featured_image_url || 'https://getonapod.com/og-image.png',
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      '@type': 'Person',
      name: post.author_name || 'Get On A Pod Team',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Get On A Pod',
      logo: {
        '@type': 'ImageObject',
        url: 'https://getonapod.com/icon-512.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://getonapod.com/blog/${post.slug}`,
    },
  }
}

/**
 * Get related posts based on category and tags
 */
export const getRelatedPosts = async (post: BlogPost, limit = 3) => {
  // category_id is nullable (ON DELETE SET NULL). Passing '' to a uuid column
  // threw at PostgREST, which the caller caught as "Post not found" and bounced
  // the reader out of a post that had already loaded. No category → no related.
  if (!post.category_id) return []
  const { data, error} = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, featured_image_url, published_at, read_time_minutes, blog_categories(name, slug)')
    .eq('status', 'published')
    .neq('id', post.id)
    .eq('category_id', post.category_id || '')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data as unknown as BlogPost[]
}
