import { supabase } from '@/lib/supabase'

// =====================================================
// Types
// =====================================================

export interface IndexingLog {
  id: string
  post_id: string
  url: string
  service: 'google'
  action: 'submit' | 'update' | 'check_status'
  status: 'success' | 'failed' | 'pending'
  response_data?: any
  error_message?: string
  created_at: string
}

export interface IndexingStats {
  total_posts: number
  submitted: number
  indexed: number
  failed: number
  pending: number
  indexation_rate: number
}

export interface IndexingStatusCheck {
  isIndexed: boolean
  coverageState: string
  lastCrawlTime?: string
  indexingState?: string
  crawlDecision?: string
  verdict?: string
  canonicalUrl?: string
  urlMismatch?: boolean
  richResultsItems?: any[]
}

export interface CheckIndexingResponse {
  success: boolean
  message: string
  data?: IndexingStatusCheck
  error?: string
}

// =====================================================
// Google Indexing API Functions
// =====================================================

/**
 * Submit a blog post URL to Google Indexing API
 */
export const submitToGoogleIndexing = async (url: string, postId: string) => {
  try {
    const { data, error } = await supabase.functions.invoke('submit-to-indexing', {
      body: {
        url,
        postId,
      },
    })

    if (error) throw error

    return {
      success: data.success,
      message: data.message,
      data: data.data,
    }
  } catch (error) {
    console.error('Error submitting to Google Indexing API:', error)
    throw error
  }
}

/**
 * Submit multiple blog post URLs to Google Indexing API (batch)
 */
export const submitBatchToGoogleIndexing = async (
  posts: Array<{ url: string; postId: string }>
) => {
  const results = []

  for (const post of posts) {
    try {
      const result = await submitToGoogleIndexing(post.url, post.postId)
      results.push({ ...post, success: result.success })

      // Rate limiting: Wait 350ms between requests (Google allows 200 req/min)
      await new Promise((resolve) => setTimeout(resolve, 350))
    } catch (error) {
      results.push({
        ...post,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}

// =====================================================
// Google Search Console API Functions
// =====================================================

/**
 * Check indexing status for a single blog post via Search Console API
 */
export const checkGoogleIndexingStatus = async (
  url: string,
  postId: string
): Promise<CheckIndexingResponse> => {
  try {
    const { data, error } = await supabase.functions.invoke('check-indexing-status', {
      body: {
        url,
        postId,
      },
    })

    if (error) throw error

    return {
      success: data.success,
      message: data.message,
      data: data.data,
      error: data.error,
    }
  } catch (error) {
    console.error('Error checking Google indexing status:', error)
    throw error
  }
}

/**
 * Check indexing status for multiple posts (batch)
 * Rate limited to comply with Search Console API quota (2,000/day)
 */
export const checkBatchGoogleIndexingStatus = async (
  posts: Array<{ url: string; postId: string }>
): Promise<
  Array<{ postId: string; success: boolean; data?: IndexingStatusCheck; error?: string }>
> => {
  const results = []

  for (const post of posts) {
    try {
      const result = await checkGoogleIndexingStatus(post.url, post.postId)
      results.push({
        postId: post.postId,
        success: result.success,
        data: result.data,
        error: result.error,
      })

      // Rate limiting: Wait 500ms between requests
      // Search Console API has lower quota than Indexing API
      // Daily limit: 2,000 requests (careful with batch operations)
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      results.push({
        postId: post.postId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return results
}

// =====================================================
// Indexing Log Functions
// =====================================================

/**
 * Get all indexing logs for a specific post
 */
export const getIndexingLogsByPost = async (postId: string) => {
  const { data, error } = await supabase
    .from('blog_indexing_log')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as IndexingLog[]
}

/**
 * Get recent indexing logs (all posts)
 */
export const getRecentIndexingLogs = async (limit = 50) => {
  const { data, error } = await supabase
    .from('blog_indexing_log')
    .select(`
      *,
      blog_posts (
        title,
        slug
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * Get failed indexing attempts (for retry)
 */
export const getFailedIndexingAttempts = async () => {
  const { data, error } = await supabase
    .from('blog_indexing_log')
    .select(`
      *,
      blog_posts (
        id,
        slug,
        title
      )
    `)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// =====================================================
// Indexing Statistics
// =====================================================

/**
 * Get indexing statistics dashboard
 */
export const getIndexingStats = async (): Promise<IndexingStats> => {
  // Get total published posts
  const { count: totalPosts, error: totalError } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')

  if (totalError) throw totalError

  // Get posts that have been submitted to Google
  const { count: submittedCount, error: submittedError } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .not('submitted_to_google_at', 'is', null)

  if (submittedError) throw submittedError

  // Get posts that have been indexed by Google
  const { count: indexedCount, error: indexedError } = await supabase
    .from('blog_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .not('indexed_by_google_at', 'is', null)

  if (indexedError) throw indexedError

  // Get failed indexing attempts (recent)
  const { count: failedCount, error: failedError } = await supabase
    .from('blog_indexing_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days

  if (failedError) throw failedError

  const submitted = submittedCount || 0
  const indexed = indexedCount || 0
  const total = totalPosts || 0
  const failed = failedCount || 0
  const pending = submitted - indexed - failed

  const indexationRate = submitted > 0 ? (indexed / submitted) * 100 : 0

  return {
    total_posts: total,
    submitted,
    indexed,
    failed,
    pending,
    indexation_rate: Math.round(indexationRate * 10) / 10, // Round to 1 decimal
  }
}

/**
 * Get posts that need indexing submission
 */
export const getPostsNeedingIndexing = async () => {
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, published_at')
    .eq('status', 'published')
    .is('submitted_to_google_at', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Get posts submitted but not yet indexed (for retry)
 */
export const getPostsNeedingResubmission = async () => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, submitted_to_google_at')
    .eq('status', 'published')
    .not('submitted_to_google_at', 'is', null)
    .is('indexed_by_google_at', null)
    .lte('submitted_to_google_at', threeDaysAgo)
    .order('submitted_to_google_at', { ascending: true })

  if (error) throw error
  return data
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Build full URL for a blog post
 */
export const buildPostUrl = (slug: string): string => {
  const baseUrl = import.meta.env.VITE_APP_URL || 'https://getonapod.com'
  return `${baseUrl}/blog/${slug}`
}

/**
 * Check if post has been submitted to Google
 */
export const hasBeenSubmitted = (post: { submitted_to_google_at?: string | null }): boolean => {
  return !!post.submitted_to_google_at
}

/**
 * Check if post has been indexed by Google
 */
export const hasBeenIndexed = (post: { indexed_by_google_at?: string | null }): boolean => {
  return !!post.indexed_by_google_at
}

/**
 * Get days since submission
 */
export const getDaysSinceSubmission = (submittedAt?: string | null): number | null => {
  if (!submittedAt) return null

  const submitted = new Date(submittedAt)
  const now = new Date()
  const diffMs = now.getTime() - submitted.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Get indexing status badge color
 */
export const getIndexingStatusBadge = (
  post: {
    submitted_to_google_at?: string | null
    indexed_by_google_at?: string | null
    google_indexing_status?: string | null
  }
): { label: string; color: string } => {
  // If indexed, show green badge
  if (hasBeenIndexed(post)) {
    return { label: 'Indexed', color: 'green' }
  }

  // If explicitly checked and status available
  if (post.google_indexing_status && post.google_indexing_status !== 'submitted') {
    // Handle various coverage states from Search Console API
    const status = post.google_indexing_status.toLowerCase()

    if (status.includes('not indexed') || status.includes('discovered')) {
      return { label: post.google_indexing_status, color: 'red' }
    }

    if (status.includes('crawled')) {
      return { label: post.google_indexing_status, color: 'yellow' }
    }

    // Other statuses
    return { label: post.google_indexing_status, color: 'orange' }
  }

  // If submitted but not yet checked
  if (hasBeenSubmitted(post)) {
    const days = getDaysSinceSubmission(post.submitted_to_google_at)

    if (days !== null && days > 7) {
      return { label: 'Pending (7+ days)', color: 'yellow' }
    }

    return { label: 'Pending', color: 'blue' }
  }

  // Never submitted
  return { label: 'Not Submitted', color: 'gray' }
}
