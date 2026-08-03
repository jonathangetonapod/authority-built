import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import SocialProofSection from '@/components/SocialProofSection'
import {
  Mic,
  Users,
  Star,
  ExternalLink,
  Loader2,
  Sparkles,
  Target,
  CheckCircle2,
  TrendingUp,
  Radio,
  X,
  ChevronRight,
  ChevronLeft,
  Headphones,
  Zap,
  Globe,
  Award,
  BarChart3,
  ArrowRight,
  Search,
  Tag,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Check,
  Clock,
  Building2,
  MapPin,
  Home,
  Heart,
  Smartphone,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  MousePointerClick,
  ListChecks,
  Rocket,
  Info,
  Phone,
  Calendar,
  DollarSign,
  FileText,
  RefreshCw
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { bookingLinkUrl, schedulerEmbedUrl, schedulerName } from '@/lib/schedulerEmbed'
import type { PodcastDemographics } from '@/services/podscan'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { FeatureDetailModal } from '@/components/pricing/FeatureDetailModal'
import { PricingFAQ } from '@/components/pricing/PricingFAQ'
import PageSEO from '@/components/seo/PageSEO'
import { openExternalUrl } from '@/lib/externalUrl'
import { currentHostname } from '@/lib/workspaceHost'

export default function ProspectView() {
  return (
    <>
      <PageSEO
        title="Private podcast shortlist"
        description="A private, personalized podcast shortlist."
        noindex
      />
      <ProspectViewContent />
    </>
  )
}

interface ProspectDashboard {
  prospect_name: string
  prospect_bio: string | null
  prospect_image_url: string | null
  is_active: boolean
  show_pricing_section: boolean
  personalized_tagline: string | null
  media_kit_url: string | null
  loom_video_url: string | null
  loom_thumbnail_url: string | null
  loom_video_title: string | null
  show_loom_video: boolean
  testimonial_ids: string[] | null
  show_testimonials: boolean
  cta_type: 'reply' | 'book_call' | 'learn_more' | 'none'
  cta_label: string
  cta_url: string | null
}

interface ProspectWorkspaceBrand {
  name: string
  brand_name: string
  logo_url: string | null
  primary_color: string | null
  accent_color: string | null
  /** Workspace scheduler link, used when this dashboard sets no CTA. */
  booking_url?: string | null
}

interface PodcastCategory {
  category_id: string
  category_name: string
}

interface OutreachPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories?: PodcastCategory[] | null
  last_posted_at: string | null
  // Cached AI analysis fields
  ai_clean_description?: string | null
  ai_fit_reasons?: string[] | null
  ai_pitch_angles?: Array<{ title: string; description: string }> | null
  // Cached demographics
  demographics?: PodcastDemographics | null
}

interface PitchAngle {
  title: string
  description: string
}

interface PodcastFitAnalysis {
  clean_description: string
  fit_reasons: string[]
  pitch_angles: PitchAngle[]
}

interface PodcastFeedback {
  id: string
  prospect_dashboard_id: string
  podcast_id: string
  podcast_name: string | null
  status: 'approved' | 'rejected' | null
  notes: string | null
  created_at: string
  updated_at: string
}

type FeedbackFilter = 'all' | 'approved' | 'rejected' | 'not_reviewed'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const PUBLIC_READ_TIMEOUT_MS = 12_000

class PublicReadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'PublicReadError'
  }
}

async function readPublicEndpoint<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), PUBLIC_READ_TIMEOUT_MS)

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const responseText = await response.text()
    let payload: unknown = {}

    if (responseText) {
      try {
        payload = JSON.parse(responseText)
      } catch {
        throw new PublicReadError('The server returned an unreadable response. Please try again.', response.status)
      }
    }

    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'This page could not be loaded. Please try again.'
      throw new PublicReadError(message, response.status)
    }

    return payload as T
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PublicReadError('This page took too long to load. Please try again.')
    }
    if (error instanceof PublicReadError) throw error
    throw new PublicReadError('We could not connect to this page. Check your connection and try again.')
  } finally {
    window.clearTimeout(timeout)
  }
}

function shouldRetryPublicRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  if (!(error instanceof PublicReadError) || error.status === undefined) return true
  return error.status >= 500 || [408, 425, 429].includes(error.status)
}

function ProspectViewContent() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const forceTour = searchParams.get('tour') === '1'
  const queryClient = useQueryClient()


  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [episodeFilter, setEpisodeFilter] = useState<string>('any')
  const [audienceFilter, setAudienceFilter] = useState<string>('any')
  const [sortBy, setSortBy] = useState<'default' | 'audience_desc' | 'audience_asc'>('default')

  // Pagination
  const CARDS_PER_PAGE = 18
  const [currentPage, setCurrentPage] = useState(1)

  // Side panel state
  const [selectedPodcast, setSelectedPodcast] = useState<OutreachPodcast | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fitAnalysis, setFitAnalysis] = useState<PodcastFitAnalysis | null>(null)
  const [isLoadingDemographics, setIsLoadingDemographics] = useState(false)
  const [demographics, setDemographics] = useState<PodcastDemographics | null>(null)
  const [isDemographicsExpanded, setIsDemographicsExpanded] = useState(false)

  // Loom video modal state
  const [showLoomVideo, setShowLoomVideo] = useState(false)
  const [loomVideoLoading, setLoomVideoLoading] = useState(true)

  // Feedback state (for saving)
  const [currentNotes, setCurrentNotes] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  // Cache for analyses and demographics
  const [analysisCache, setAnalysisCache] = useState<Map<string, PodcastFitAnalysis>>(new Map())
  const [demographicsCache, setDemographicsCache] = useState<Map<string, PodcastDemographics | null>>(new Map())

  // Preloading state
  const [preloadingAnalyses, setPreloadingAnalyses] = useState(false)

  // Personalized tagline state
  const [personalizedTagline, setPersonalizedTagline] = useState<string | null>(null)

  // Tutorial modal state
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)

  // Review panel state
  const [showReviewPanel, setShowReviewPanel] = useState(false)

  // Pricing feature modal state
  const [selectedPricingFeature, setSelectedPricingFeature] = useState<string | null>(null)

  // React Query: Fetch dashboard + feedback via edge function (cached for 5 minutes)
  const {
    data: dashboardResponse,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['prospect-dashboard', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Invalid dashboard link')

      const result = await readPublicEndpoint<{
        success: boolean
        error?: string
        dashboard: ProspectDashboard
        feedback: PodcastFeedback[]
        workspace: ProspectWorkspaceBrand
      }>('get-prospect-dashboard', { slug, hostname: currentHostname() })

      if (!result.success) {
        throw new PublicReadError(result.error || 'Dashboard not found', 400)
      }

      return result as { success: true; dashboard: ProspectDashboard; feedback: PodcastFeedback[]; workspace: ProspectWorkspaceBrand }
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
    retry: shouldRetryPublicRead,
    retryDelay: 600,
  })

  const dashboard = dashboardResponse?.dashboard ?? null
  const workspaceBrand = dashboardResponse?.workspace ?? null
  // The agency's own scheduler, pasted once in workspace settings. A dashboard
  // with its own call-to-action still wins; this is what the page falls back to
  // instead of "reply to the email that brought you here".
  /*
   * The dashboard is white-label, so the accent and the person signing the note
   * come from the workspace, not from us. The fallback is the design's own
   * terracotta, used only when a workspace has set no accent of its own.
   */
  const accentColor = workspaceBrand?.accent_color?.trim() || '#b46a3c'
  const conciergeName = workspaceBrand?.brand_name?.trim()
    ? `${workspaceBrand.brand_name.trim()}, your booking team`
    : 'Your booking team'
  const conciergeInitial = (workspaceBrand?.brand_name?.trim() || 'G').charAt(0).toUpperCase()
  const bookingLink = bookingLinkUrl(workspaceBrand?.booking_url)
  const bookingEmbedUrl = schedulerEmbedUrl(workspaceBrand?.booking_url)
  const bookingProvider = schedulerName(workspaceBrand?.booking_url)

  // Fetch the shortlist in parallel with the dashboard so a slow request cannot block both.
  const {
    data: podcasts = [],
    isLoading: podcastsLoading,
    error: podcastsError,
    refetch: refetchPodcasts,
  } = useQuery({
    queryKey: ['prospect-podcasts', slug],
    queryFn: async () => {
      if (!slug) return []

      const data = await readPublicEndpoint<{
        podcasts?: OutreachPodcast[]
        cachePerformance?: {
          cacheHitRate: number
          apiCallsSaved: number
          costSavings: number
        }
      }>('get-prospect-podcasts', {
        dashboardSlug: slug,
        cacheOnly: true,
      })

      // Log cache performance
      if (data.cachePerformance) {
        const { cacheHitRate, apiCallsSaved, costSavings } = data.cachePerformance
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('📊 [PROSPECT DASHBOARD] Cache Performance')
        console.log(`   Podcasts loaded: ${data.podcasts?.length || 0}`)
        console.log(`   ✅ Cache hit rate: ${cacheHitRate}%`)
        console.log(`   💰 API calls saved: ${apiCallsSaved}`)
        console.log(`   💵 Cost savings: $${costSavings}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      } else {
        console.log(`[Dashboard] Loaded ${data.podcasts?.length || 0} podcasts from cache`)
      }

      if (data.podcasts !== undefined && !Array.isArray(data.podcasts)) {
        throw new PublicReadError('The podcast shortlist could not be read. Please try again.')
      }
      return data.podcasts || []
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
    retry: shouldRetryPublicRead,
    retryDelay: 600,
  })

  // Feedback data comes from the dashboard edge function response
  const feedbackData = dashboardResponse?.feedback ?? []

  // Build feedback map from query data
  const feedbackMap = new Map<string, PodcastFeedback>(
    feedbackData.map((fb: PodcastFeedback) => [fb.podcast_id, fb])
  )
  const selectedFeedbackNotes = selectedPodcast
    ? feedbackMap.get(selectedPodcast.podcast_id)?.notes || ''
    : ''

  // Derived state
  const loading = dashboardLoading
  const loadingPodcasts = podcastsLoading
  const error = dashboardError instanceof Error
    ? dashboardError.message
    : dashboardError
      ? 'This dashboard could not be loaded.'
      : null

  // Helper function to extract Loom video ID from URL
  const getLoomEmbedUrl = (url: string): string | null => {
    try {
      const parsedUrl = new URL(url)
      if (
        parsedUrl.protocol !== 'https:' ||
        !['loom.com', 'www.loom.com'].includes(parsedUrl.hostname)
      ) {
        return null
      }

      const match = parsedUrl.pathname.match(/^\/(?:share|embed)\/([a-zA-Z0-9_-]{8,128})\/?$/)
      return match ? `https://www.loom.com/embed/${match[1]}` : null
    } catch {
      return null
    }
  }

  const loomEmbedUrl = dashboard?.loom_video_url
    ? getLoomEmbedUrl(dashboard.loom_video_url)
    : null

  // View count is now incremented server-side by the get-prospect-dashboard edge function

  // Debounce search query for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedCategories, debouncedSearch, feedbackFilter, episodeFilter, audienceFilter, sortBy])

  // Public dashboards display only content precomputed by an administrator.
  useEffect(() => {
    setPersonalizedTagline(dashboard?.personalized_tagline ?? null)
  }, [dashboard?.personalized_tagline])

  // The dashboard is designed to be self-explanatory. The guided tour remains
  // available from Help and via ?tour=1, but never interrupts a first visit.
  useEffect(() => {
    if (!dashboard || loading || !forceTour) return
    const timer = setTimeout(() => setShowTutorial(true), 500)
    return () => clearTimeout(timer)
  }, [dashboard, loading, forceTour])

  const closeTutorial = () => {
    setShowTutorial(false)
    setTutorialStep(0)
  }

  // Populate AI analysis cache from database-cached data (instant, no API calls needed)
  useEffect(() => {
    if (podcasts.length === 0) return

    setAnalysisCache((current) => {
      const newCache = new Map(current)
      let addedCount = 0

      podcasts.forEach(podcast => {
        if (!newCache.has(podcast.podcast_id) && podcast.ai_fit_reasons && podcast.ai_fit_reasons.length > 0) {
          newCache.set(podcast.podcast_id, {
            clean_description: podcast.ai_clean_description || podcast.podcast_description || '',
            fit_reasons: podcast.ai_fit_reasons || [],
            pitch_angles: podcast.ai_pitch_angles || [],
          })
          addedCount++
        }
      })

      if (addedCount > 0) console.log(`[Cache] Loaded ${addedCount} AI analyses from database`)
      return addedCount > 0 ? newCache : current
    })
  }, [podcasts])

  // Populate demographics cache from database-cached data (instant, no API calls)
  useEffect(() => {
    if (podcasts.length === 0) return

    setDemographicsCache((current) => {
      const newCache = new Map(current)
      let loadedCount = 0
      let changedCount = 0

      podcasts.forEach(podcast => {
        if (!newCache.has(podcast.podcast_id) && podcast.demographics) {
          newCache.set(podcast.podcast_id, podcast.demographics as PodcastDemographics)
          loadedCount++
          changedCount++
        } else if (!newCache.has(podcast.podcast_id)) {
          newCache.set(podcast.podcast_id, null) // Mark as checked but no data
          changedCount++
        }
      })

      if (loadedCount > 0) console.log(`[Cache] Loaded ${loadedCount} demographics from database`)
      return changedCount > 0 ? newCache : current
    })
  }, [podcasts])

  // Analyze podcast fit when side panel opens
  useEffect(() => {
    if (!selectedPodcast || !dashboard?.prospect_bio) {
      setFitAnalysis(null)
      return
    }

    const cached = analysisCache.get(selectedPodcast.podcast_id)
    console.log('[Panel] Checking cache for:', selectedPodcast.podcast_name, 'Found:', !!cached, 'Cache size:', analysisCache.size)
    if (cached) {
      console.log('[Panel] ✅ Using cached analysis')
      setFitAnalysis(cached)
      return
    }

    console.log('[Panel] No precomputed fit analysis is available')
    setIsAnalyzing(false)
    setFitAnalysis(null)
  }, [selectedPodcast, dashboard, analysisCache])

  // Fetch demographics when side panel opens (use cache if available)
  useEffect(() => {
    if (!selectedPodcast) {
      setDemographics(null)
      return
    }

    // Check cache first
    if (demographicsCache.has(selectedPodcast.podcast_id)) {
      setDemographics(demographicsCache.get(selectedPodcast.podcast_id) || null)
      return
    }

    setIsLoadingDemographics(false)
    setDemographics(null)
  }, [selectedPodcast, demographicsCache])

  // Load existing notes when podcast is selected
  useEffect(() => {
    if (selectedPodcast) {
      setCurrentNotes(selectedFeedbackNotes)
    } else {
      setCurrentNotes('')
    }
  }, [selectedFeedbackNotes, selectedPodcast])


  // Confetti celebration for approvals
  const triggerConfetti = () => {
    const count = 200
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    }

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      })
    }

    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }

  // Save feedback (approve/reject/notes)
  const saveFeedback = async (podcastId: string, status: 'approved' | 'rejected' | null, notes?: string) => {
    if (!dashboard) return

    // Check if this is a new approval (not already approved)
    const existingFeedback = feedbackMap.get(podcastId)
    const isNewApproval = status === 'approved' && existingFeedback?.status !== 'approved'

    setIsSavingFeedback(true)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/save-prospect-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          dashboard_slug: slug,
          podcast_id: podcastId,
          status,
          notes: notes !== undefined ? notes : (currentNotes || null)
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save feedback')
      }

      // Invalidate dashboard cache to refresh the feedback data
      queryClient.invalidateQueries({ queryKey: ['prospect-dashboard', slug] })

      // Trigger confetti for new approvals
      if (isNewApproval) {
        triggerConfetti()
      }
    } catch (err) {
      console.error('Error saving feedback:', err)
      toast.error(err instanceof Error ? err.message : 'Unable to save your feedback. Please try again.')
    } finally {
      setIsSavingFeedback(false)
    }
  }

  // Loading state - show skeleton UI for snappier feel
  if (loading) {
    return (
      <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
        <section className="paper-noise px-4 py-16 md:py-20">
          <div className="container mx-auto">
            <div className="grid gap-10 xl:grid-cols-[1.02fr_0.98fr]">
              <div className="space-y-5">
                <div className="h-6 w-40 rounded-full bg-[#dfeafb] animate-pulse" />
                <div className="h-24 max-w-2xl rounded-[28px] bg-[#eef4ff] animate-pulse" />
                <div className="h-8 max-w-xl rounded-[20px] bg-[#eef4ff] animate-pulse" />
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-36 rounded-[24px] bg-white/80 shadow-[0_14px_30px_rgba(13,27,42,0.08)] animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="h-[420px] rounded-[34px] bg-[#10263b] animate-pulse" />
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="overflow-hidden rounded-[28px] border border-[#0d1b2a]/8 bg-white/82 shadow-[0_16px_34px_rgba(13,27,42,0.08)] animate-pulse">
                  <div className="aspect-[16/10] bg-[#dfeafb]" />
                  <div className="space-y-3 p-5">
                    <div className="h-5 w-3/4 rounded bg-[#e8f0fb]" />
                    <div className="h-4 w-1/2 rounded bg-[#edf3fa]" />
                    <div className="flex gap-2">
                      <div className="h-6 w-16 rounded-full bg-[#edf3fa]" />
                      <div className="h-6 w-16 rounded-full bg-[#edf3fa]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    )
  }

  // Error state
  if (error || !dashboard) {
    return (
      <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
        <section className="paper-noise flex min-h-screen items-center justify-center px-4 py-16">
          <Card className="max-w-md w-full border border-[#0d1b2a]/8 bg-white/84 shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-[#fce9ea] flex items-center justify-center mx-auto">
                <X className="h-8 w-8 text-[#c5545b]" />
              </div>
              <div className="space-y-2">
                <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">Dashboard not available</h2>
                <p className="text-[#5d7188]">{error || 'This dashboard could not be found.'}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => void refetchDashboard()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    )
  }


  // Calculate stats
  const totalReach = podcasts.reduce((sum, p) => sum + (p.audience_size || 0), 0)
  const podcastsWithAudience = podcasts.filter(p => p.audience_size && p.audience_size > 0)
  const avgListenersPerEpisode = podcastsWithAudience.length > 0
    ? Math.round(totalReach / podcastsWithAudience.length)
    : 0

  const ratings = podcasts.filter(p => p.itunes_rating).map(p => p.itunes_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0

  const totalEpisodes = podcasts.reduce((sum, p) => sum + (p.episode_count || 0), 0)
  const avgEpisodesPerPodcast = podcasts.length > 0
    ? Math.round(totalEpisodes / podcasts.length)
    : 0

  // Find top podcasts
  const topRatedPodcast = [...podcasts].sort((a, b) => (b.itunes_rating || 0) - (a.itunes_rating || 0))[0]
  const highestReachPodcast = [...podcasts].sort((a, b) => (b.audience_size || 0) - (a.audience_size || 0))[0]
  const mostEpisodesPodcast = [...podcasts].sort((a, b) => (b.episode_count || 0) - (a.episode_count || 0))[0]

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toLocaleString()
  }

  // Extract unique categories from all podcasts (computed each render, no useMemo)
  const allCategories: Array<{ category_id: string; category_name: string }> = []
  const seenCategoryIds = new Set<string>()
  for (const podcast of podcasts) {
    const cats = podcast.podcast_categories
    if (Array.isArray(cats)) {
      for (const cat of cats) {
        if (cat?.category_id && cat?.category_name && !seenCategoryIds.has(cat.category_id)) {
          seenCategoryIds.add(cat.category_id)
          allCategories.push({ category_id: cat.category_id, category_name: cat.category_name })
        }
      }
    }
  }
  allCategories.sort((a, b) => a.category_name.localeCompare(b.category_name))

  // Filter podcasts based on search query, categories, and feedback status
  // First dedupe podcasts by ID
  const uniquePodcasts = podcasts.filter((podcast, index, self) =>
    index === self.findIndex(p => p.podcast_id === podcast.podcast_id)
  )

  // Count feedback stats (from deduplicated list)
  const feedbackStats = {
    approved: 0,
    rejected: 0,
    notReviewed: 0
  }
  uniquePodcasts.forEach(podcast => {
    const feedback = feedbackMap.get(podcast.podcast_id)
    if (feedback?.status === 'approved') feedbackStats.approved++
    else if (feedback?.status === 'rejected') feedbackStats.rejected++
    else feedbackStats.notReviewed++
  })

  const filteredPodcasts = uniquePodcasts.filter(podcast => {
    // Search filter (use debounced for performance)
    if (debouncedSearch.trim()) {
      const query = debouncedSearch.toLowerCase()
      const matchesSearch = (
        podcast.podcast_name.toLowerCase().includes(query) ||
        podcast.podcast_description?.toLowerCase().includes(query) ||
        podcast.publisher_name?.toLowerCase().includes(query)
      )
      if (!matchesSearch) return false
    }

    // Category filter
    if (selectedCategories.length > 0) {
      const podcastCats = podcast.podcast_categories
      if (!Array.isArray(podcastCats) || podcastCats.length === 0) return false
      const podcastCatIds = podcastCats.map(c => c.category_id)
      const hasMatch = selectedCategories.some(id => podcastCatIds.includes(id))
      if (!hasMatch) return false
    }

    // Feedback status filter
    if (feedbackFilter !== 'all') {
      const feedback = feedbackMap.get(podcast.podcast_id)
      if (feedbackFilter === 'approved' && feedback?.status !== 'approved') return false
      if (feedbackFilter === 'rejected' && feedback?.status !== 'rejected') return false
      if (feedbackFilter === 'not_reviewed' && feedback?.status) return false
    }

    // Episode count filter
    if (episodeFilter !== 'any') {
      const eps = podcast.episode_count || 0
      if (episodeFilter === 'under50' && eps >= 50) return false
      if (episodeFilter === '50to100' && (eps < 50 || eps >= 100)) return false
      if (episodeFilter === '100to200' && (eps < 100 || eps >= 200)) return false
      if (episodeFilter === '200plus' && eps < 200) return false
    }

    // Audience size filter
    if (audienceFilter !== 'any') {
      const aud = podcast.audience_size || 0
      if (audienceFilter === 'under1k' && aud >= 1000) return false
      if (audienceFilter === '1kto5k' && (aud < 1000 || aud >= 5000)) return false
      if (audienceFilter === '5kto10k' && (aud < 5000 || aud >= 10000)) return false
      if (audienceFilter === '10kto25k' && (aud < 10000 || aud >= 25000)) return false
      if (audienceFilter === '25kto50k' && (aud < 25000 || aud >= 50000)) return false
      if (audienceFilter === '50kto100k' && (aud < 50000 || aud >= 100000)) return false
      if (audienceFilter === '100kplus' && aud < 100000) return false
    }

    return true
  })

  // Sort filtered podcasts
  const sortedPodcasts = [...filteredPodcasts].sort((a, b) => {
    switch (sortBy) {
      case 'audience_desc':
        return (b.audience_size || 0) - (a.audience_size || 0)
      case 'audience_asc':
        return (a.audience_size || 0) - (b.audience_size || 0)
      default:
        return 0
    }
  })

  // Pagination
  const totalPages = Math.ceil(sortedPodcasts.length / CARDS_PER_PAGE)
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE
  const paginatedPodcasts = sortedPodcasts.slice(startIndex, startIndex + CARDS_PER_PAGE)
  const reviewedCountTotal = Array.from(feedbackMap.values()).filter(f => f.status).length
  const approvedCountTotal = Array.from(feedbackMap.values()).filter(f => f.status === 'approved').length
  const progressPercent = uniquePodcasts.length > 0 ? (reviewedCountTotal / uniquePodcasts.length) * 100 : 0
  const prospectFirstName = dashboard.prospect_name.trim().split(/\s+/)[0] || dashboard.prospect_name

  return (
    <main className="homepage-shell min-h-screen bg-transparent text-[#0d1b2a]">
      <a
        href="#opportunities"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-[#0d1b2a] focus:px-4 focus:py-2 focus:text-sm focus:text-[#f7fafc]"
      >
        Skip to opportunities
      </a>

      <section className="px-4 pb-10 pt-14 md:pb-12 md:pt-16">
        <div className="container mx-auto">
          <div className="grid gap-6 rounded-[32px] border border-[#0d1b2a]/8 bg-white px-5 py-6 shadow-[0_18px_38px_rgba(13,27,42,0.08)] sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1.2fr)_360px] lg:gap-8">
            {/* Grid children stretch to the tallest in the row, and the panel
                beside this one is taller — so this column's content ended at the
                stats and left the rest of the stretched cell blank underneath
                them. Made a column so the slack can be pushed above the stats
                rather than trailing below. */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3">
                {workspaceBrand?.logo_url && (
                  <img src={workspaceBrand.logo_url} alt={`${workspaceBrand.brand_name} logo`} className="mr-1 h-9 max-w-28 object-contain" />
                )}
                <p className="section-kicker">Prospect dashboard</p>
                <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6f9fc] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#5d7188]">
                  Built for {prospectFirstName}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-4">
                {dashboard.prospect_image_url && (
                  <div className="h-14 w-14 overflow-hidden rounded-[18px] border border-[#0d1b2a]/10 bg-white sm:h-16 sm:w-16">
                    <img
                      src={dashboard.prospect_image_url}
                      alt={dashboard.prospect_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <p className="max-w-xl text-sm leading-6 text-[#4c5d73]">
                  Review the best-fit shows, approve the ones you want, and we handle the outreach and booking workflow from there.
                </p>
              </div>

              <h1 className="mt-6 font-editorial text-[clamp(2.6rem,6.4vw,4.9rem)] leading-[0.94] tracking-[-0.05em] text-[#0d1b2a] text-balance">
                {uniquePodcasts.length > 0
                  ? `${prospectFirstName}, we found ${uniquePodcasts.length} rooms where your story belongs.`
                  : `${prospectFirstName}, your shortlist is ready.`}
              </h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c5d73]">
                {loadingPodcasts
                  ? 'Loading your personalized podcast matches.'
                  : podcastsError
                    ? 'Your profile is ready, but the shortlist needs a quick refresh.'
                    : personalizedTagline
                      || `Every show below was matched to your expertise and the audience you want in front of you${totalReach > 0 ? ` — ${formatNumber(totalReach)} combined listeners` : ''}. Approve the ones that feel right; we do everything after that.`}
              </p>

              {/*
               * The note from whoever built the shortlist. It is signed by the
               * workspace rather than by us: this page is white-label, so a
               * fixed name here would put one agency's booking lead on every
               * other agency's dashboard.
               */}
              <div
                className="mt-7 flex max-w-[620px] items-start gap-4 rounded-[22px] border p-5"
                style={{ borderColor: `${accentColor}2e`, background: `${accentColor}0f` }}
              >
                <div
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full font-editorial text-lg text-white"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}b0)` }}
                  aria-hidden="true"
                >
                  {conciergeInitial}
                </div>
                <div>
                  <p className="text-[15px] leading-[25px] text-[#4c5d73]">
                    “{prospectFirstName}, these were picked by hand after going through your
                    background. Start with the ones marked strongest — they are your best openings.
                    Any questions, grab a time below.”
                  </p>
                  <p
                    className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em]"
                    style={{ color: accentColor }}
                  >
                    — {conciergeName}
                  </p>
                </div>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button variant="hero" size="xl" className="rounded-full px-8 text-base" asChild>
                  <a href="#opportunities">Review Opportunities</a>
                </Button>
                {dashboard.media_kit_url && (
                  <Button
                    variant="heroOutline"
                    size="xl"
                    className="rounded-full px-8 text-base"
                    onClick={() => openExternalUrl(dashboard.media_kit_url!)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    View My Media Kit
                  </Button>
                )}
                {dashboard.cta_url && (dashboard.cta_type === 'book_call' || dashboard.cta_type === 'learn_more') && (
                  <Button
                    variant="heroOutline"
                    size="xl"
                    className="rounded-full px-8 text-base"
                    onClick={() => openExternalUrl(dashboard.cta_url!)}
                  >
                    {dashboard.cta_type === 'book_call' ? <Calendar className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    {dashboard.cta_label}
                  </Button>
                )}
              </div>

              {/*
               * Four figures on a baseline rather than three boxed tiles, as
               * drawn. mt-auto because the panel beside this column is taller:
               * the leftover height collects above these rather than under
               * them, so the two columns finish level. Side by side only —
               * stacked there is no leftover height to take up.
               */}
              <div className="mt-8 flex flex-wrap gap-x-8 gap-y-5 lg:mt-auto lg:pt-8">
                {[
                  { value: totalReach > 0 ? `${formatNumber(totalReach)}+` : '—', label: 'combined listeners' },
                  { value: podcastsError ? '—' : String(uniquePodcasts.length), label: 'shows matched' },
                  { value: avgRating > 0 ? `${avgRating.toFixed(1)}★` : '—', label: 'average rating' },
                  { value: '2–4 wks', label: 'to first booking' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[28px] font-semibold tracking-[-0.04em] text-[#0d1b2a]">{stat.value}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#7a6554]">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#f8fbff] p-5">
              {/* The three-step explanation moved to a full-width strip below
                  the hero, so this panel says where to begin instead of
                  repeating it. */}
              <p className="section-kicker">Start here</p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0d1b2a]">
                Approve the shows you want us to pitch.
              </h2>

              <div className="mt-5 rounded-[22px] border border-[#0d1b2a]/8 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#0d1b2a]">Review progress</p>
                    <p className="mt-1 text-sm leading-6 text-[#4c5d73]">
                      {reviewedCountTotal > 0
                        ? `${reviewedCountTotal} of ${uniquePodcasts.length} reviewed so far`
                        : 'Start by approving the rooms that feel strongest for your story.'}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#0d1b2a]/10 bg-[#f6f9fc] px-3 py-1.5 text-sm font-semibold text-[#0d1b2a]">
                    {approvedCountTotal} approved
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e5edf6]">
                  <div
                    className="h-full rounded-full bg-[#2d6df6] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  'Open any show to see the fit logic, audience signals, and suggested angles.',
                  'Approve the shows you want pursued, reject the ones that are off, and leave notes where useful.',
                  'Once approved, our team handles the pitching, follow-up, and booking workflow.',
                ].map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-3">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-xs font-semibold text-[#2d6df6]">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-[#4c5d73]">{step}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="justify-start rounded-full border-[#0d1b2a]/10 bg-white"
                  onClick={() => setShowReviewPanel(true)}
                >
                  <BarChart3 className="mr-2 h-4 w-4 text-[#2d6df6]" />
                  About the data
                </Button>

                {loomEmbedUrl && dashboard.show_loom_video ? (
                  <button
                    onClick={() => setShowLoomVideo(true)}
                    className="rounded-[22px] border border-[#0d1b2a]/8 bg-white p-4 text-left transition-colors hover:bg-[#f8fbff]"
                  >
                    <p className="section-kicker">Watch this first</p>
                    <p className="mt-2 font-medium text-[#0d1b2a]">
                      {dashboard.loom_video_title || 'Your personal video message'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#4c5d73]">
                      A quick walkthrough of how to use this dashboard and where to start.
                    </p>
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#0d1b2a]">
                      Watch the walkthrough
                      <ArrowRight className="h-4 w-4" />
                    </p>
                  </button>
                ) : (
                  <div className="rounded-[22px] border border-[#0d1b2a]/8 bg-white px-4 py-4">
                    <p className="text-sm leading-6 text-[#4c5d73]">
                      Use the shortlist below to decide which rooms feel most aligned with your voice, offer, and audience. A short note on any approval helps our team pitch more sharply.
                    </p>
                  </div>
                )}
              </div>

              {preloadingAnalyses && analysisCache.size < uniquePodcasts.length && (
                <div className="mt-4 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-3 text-sm text-[#4c5d73]">
                  AI insights ready: {analysisCache.size}/{uniquePodcasts.length}
                </div>
              )}
              {analysisCache.size >= uniquePodcasts.length && analysisCache.size > 0 && (
                <div className="mt-4 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-3 text-sm text-[#4c5d73]">
                  All AI fit insights are loaded and ready.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/*
       * What happens next, in three steps, across the full width. It used to be
       * a panel in the hero's right column, where it competed with the shortlist
       * for the reader's first look and made that column taller than the one
       * beside it — which is where the gap under the greeting came from.
       */}
      <section className="px-4 pb-6 pt-2">
        <div className="mx-auto grid max-w-[1320px] gap-4 md:grid-cols-3">
          {[
            { step: '1', lead: 'Browse the shortlist.', body: 'Open any show to see why it fits you and what you would talk about.' },
            { step: '2', lead: 'Approve your favourites.', body: 'One tap. Pass on anything that feels off — that helps too.' },
            { step: '3', lead: 'We take it from there.', body: 'Pitching, follow-up, scheduling, prep — handled for you.' },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-start gap-4 rounded-[22px] border border-[#0d1b2a]/8 bg-white/70 px-5 py-5 backdrop-blur-[4px]"
            >
              <span
                className="font-editorial text-[28px] leading-none"
                style={{ color: accentColor }}
                aria-hidden="true"
              >
                {item.step}
              </span>
              <p className="text-sm leading-[23px] text-[#4c5d73]">
                <strong className="font-semibold text-[#0d1b2a]">{item.lead}</strong>{' '}
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured Podcasts Section */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8" id="opportunities">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 text-center">
          Featured Opportunities
        </p>
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-3 sm:overflow-visible scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
          {/* Highest Reach */}
          {highestReachPodcast && highestReachPodcast.audience_size && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-950/50 dark:to-emerald-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up min-w-[280px] sm:min-w-0 flex-shrink-0 sm:flex-shrink"
              style={{ animationDelay: '100ms' }}
              onClick={() => setSelectedPodcast(highestReachPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {highestReachPodcast.podcast_image_url ? (
                    <img src={highestReachPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full bg-green-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-green-600 uppercase tracking-wide">Highest Reach</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{highestReachPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{formatNumber(highestReachPodcast.audience_size)} listeners</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Rated */}
          {topRatedPodcast && topRatedPodcast.itunes_rating && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-amber-50/80 to-yellow-50/80 dark:from-amber-950/50 dark:to-yellow-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up min-w-[280px] sm:min-w-0 flex-shrink-0 sm:flex-shrink"
              style={{ animationDelay: '200ms' }}
              onClick={() => setSelectedPodcast(topRatedPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {topRatedPodcast.podcast_image_url ? (
                    <img src={topRatedPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full bg-amber-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-amber-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-amber-600 uppercase tracking-wide">Top Rated</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{topRatedPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-amber-500 text-amber-500" />
                    {Number(topRatedPodcast.itunes_rating).toFixed(1)} rating
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Most Established */}
          {mostEpisodesPodcast && mostEpisodesPodcast.episode_count && (
            <Card
              className="border-0 shadow-xl bg-gradient-to-br from-purple-50/80 to-violet-50/80 dark:from-purple-950/50 dark:to-violet-950/50 backdrop-blur-sm cursor-pointer hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 active:scale-[0.98] animate-fade-in-up min-w-[280px] sm:min-w-0 flex-shrink-0 sm:flex-shrink"
              style={{ animationDelay: '300ms' }}
              onClick={() => setSelectedPodcast(mostEpisodesPodcast)}
            >
              <CardContent className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md">
                  {mostEpisodesPodcast.podcast_image_url ? (
                    <img src={mostEpisodesPodcast.podcast_image_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full bg-purple-200 flex items-center justify-center">
                      <Mic className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-xs font-semibold text-purple-600 uppercase tracking-wide">Most Established</p>
                  <p className="font-semibold truncate text-sm sm:text-base">{mostEpisodesPodcast.podcast_name}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{mostEpisodesPodcast.episode_count} episodes</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Scroll Down Indicator */}
        <div className="flex justify-center items-center gap-4 mt-6">
          <ChevronDown className="h-5 w-5 text-muted-foreground/50 animate-bounce" />
          <ChevronDown className="h-5 w-5 text-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
        </div>
      </div>

      {/* Podcast Grid */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12" id="shortlist">
        {/*
         * Left-aligned and editorial, as drawn. Centred bold sans read as a
         * marketing page; this is a document addressed to one person, and the
         * heading is the promise the cards underneath have to keep.
         */}
        <div className="mb-6 sm:mb-8">
          <p className="section-kicker">The full shortlist</p>
          <h2 className="mt-3 font-editorial text-[clamp(1.9rem,3.4vw,2.8rem)] leading-[1.02] tracking-[-0.04em] text-[#0d1b2a]">
            Every room, and why it&rsquo;s yours.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-[25px] text-[#4c5d73]">
            Open any show to see why it fits and what you would talk about. Approve the ones
            you want and we start reaching out on your behalf.
          </p>
        </div>

        {/* Search */}
        <div className="flex justify-center mb-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, topic, or host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 bg-white dark:bg-slate-900 h-12 text-base rounded-full border-2 focus:border-primary"
            />
          </div>
        </div>

        {/* Feedback Status Filter */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-2">
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">Filter by status</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFeedbackFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border",
                feedbackFilter === 'all'
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-primary/50"
              )}
            >
              All ({loadingPodcasts || podcastsError ? '-' : uniquePodcasts.length})
            </button>
            <button
              onClick={() => setFeedbackFilter('approved')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                feedbackFilter === 'approved'
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-green-500 hover:text-green-600"
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved ({loadingPodcasts || podcastsError ? '-' : feedbackStats.approved})
            </button>
            <button
              onClick={() => setFeedbackFilter('rejected')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border flex items-center gap-1.5",
                feedbackFilter === 'rejected'
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-red-500 hover:text-red-600"
              )}
            >
              <X className="h-3.5 w-3.5" />
              Rejected ({loadingPodcasts || podcastsError ? '-' : feedbackStats.rejected})
            </button>
            <button
              onClick={() => setFeedbackFilter('not_reviewed')}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 border",
                feedbackFilter === 'not_reviewed'
                  ? "bg-slate-600 text-white border-slate-600"
                  : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-slate-500"
              )}
            >
              To Review ({loadingPodcasts || podcastsError ? '-' : feedbackStats.notReviewed})
            </button>
          </div>
        </div>

        {/* Category Filter Chips */}
        {allCategories.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium text-muted-foreground">Filter by category</span>
              {selectedCategories.length > 0 && (
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-xs text-primary hover:text-primary/80 ml-auto"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => (
                <button
                  key={cat.category_id}
                  onClick={() => {
                    setSelectedCategories(prev =>
                      prev.includes(cat.category_id)
                        ? prev.filter(id => id !== cat.category_id)
                        : [...prev, cat.category_id]
                    )
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200",
                    "border hover:shadow-md active:scale-95",
                    selectedCategories.includes(cat.category_id)
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-white dark:bg-slate-900 text-muted-foreground border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:text-primary"
                  )}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Episode Count & Audience Size Filters */}
        <div className="mb-4 sm:mb-6 flex flex-wrap gap-3 sm:gap-4">
          {/* Episode Count Filter */}
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-muted-foreground" />
            <select
              value={episodeFilter}
              onChange={(e) => setEpisodeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="any">Episodes: Any</option>
              <option value="under50">Under 50 episodes</option>
              <option value="50to100">50-100 episodes</option>
              <option value="100to200">100-200 episodes</option>
              <option value="200plus">200+ episodes</option>
            </select>
          </div>

          {/* Audience Size Filter */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <select
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="any">Audience: Any</option>
              <option value="under1k">Under 1K</option>
              <option value="1kto5k">1K - 5K</option>
              <option value="5kto10k">5K - 10K</option>
              <option value="10kto25k">10K - 25K</option>
              <option value="25kto50k">25K - 50K</option>
              <option value="50kto100k">50K - 100K</option>
              <option value="100kplus">100K+</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="default">Sort: Default</option>
              <option value="audience_desc">Audience: High to Low</option>
              <option value="audience_asc">Audience: Low to High</option>
            </select>
          </div>

          {/* Clear filters */}
          {(episodeFilter !== 'any' || audienceFilter !== 'any' || sortBy !== 'default') && (
            <button
              onClick={() => {
                setEpisodeFilter('any')
                setAudienceFilter('any')
                setSortBy('default')
              }}
              className="px-3 py-1.5 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Results count when filtering */}
        {!loadingPodcasts && !podcastsError && (searchQuery || selectedCategories.length > 0 || episodeFilter !== 'any' || audienceFilter !== 'any') && (
          <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
            Showing {sortedPodcasts.length} of {uniquePodcasts.length} podcasts
            {selectedCategories.length > 0 && ` in ${selectedCategories.length} ${selectedCategories.length === 1 ? 'category' : 'categories'}`}
          </p>
        )}

        {podcastsError ? (
          <Card className="border border-[#0d1b2a]/8 bg-white shadow-md">
            <CardContent className="p-8 text-center sm:p-12">
              <RefreshCw className="mx-auto mb-4 h-10 w-10 text-[#5d7188]" />
              <h3 className="mb-2 text-base font-semibold sm:text-lg">The shortlist needs a quick refresh</h3>
              <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                Your dashboard is still available. We just could not load the podcast matches on this attempt.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-5 rounded-full"
                onClick={() => void refetchPodcasts()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry shortlist
              </Button>
            </CardContent>
          </Card>
        ) : loadingPodcasts ? (
          /* Podcast grid skeleton while loading */
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white dark:bg-slate-900 rounded-xl shadow-lg overflow-hidden animate-pulse">
                <div className="aspect-[16/10] bg-slate-200 dark:bg-slate-800" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded" />
                  <div className="h-4 w-1/2 bg-slate-100 dark:bg-slate-800 rounded" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" />
                    <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : uniquePodcasts.length === 0 ? (
          <Card className="border-0 shadow-md">
            <CardContent className="p-8 sm:p-12 text-center">
              <Radio className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">Podcasts Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                We're curating the perfect podcast opportunities for you. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : sortedPodcasts.length === 0 && (searchQuery || selectedCategories.length > 0 || episodeFilter !== 'any' || audienceFilter !== 'any') ? (
          <Card className="border-0 shadow-md">
            <CardContent className="p-8 sm:p-12 text-center">
              <Search className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold mb-2">No podcasts found</h3>
              <p className="text-sm text-muted-foreground">
                No podcasts match your current filters. Try adjusting your criteria.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategories([])
                  setEpisodeFilter('any')
                  setAudienceFilter('any')
                }}
              >
                Clear all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
          <div
            key={`podcast-grid-${selectedCategories.join(',')}-${debouncedSearch}-${feedbackFilter}-${episodeFilter}-${audienceFilter}-${sortBy}-${currentPage}`}
            className="grid gap-3 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          >
              {paginatedPodcasts.map((podcast, index) => (
            <Card
              key={podcast.podcast_id}
              className={cn(
                "group cursor-pointer border-0 shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden",
                "active:scale-[0.98] bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm",
                "hover:-translate-y-1 hover:scale-[1.02]",
                selectedPodcast?.podcast_id === podcast.podcast_id && "ring-2 ring-primary shadow-xl"
              )}
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              onClick={() => setSelectedPodcast(podcast)}
            >
              <CardContent className="p-0">
                {/* Image */}
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                  {podcast.podcast_image_url ? (
                    <img
                      src={podcast.podcast_image_url}
                      alt={podcast.podcast_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/50" />
                    </div>
                  )}
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                  {/* Feedback Status Badge */}
                  {feedbackMap.get(podcast.podcast_id)?.status && (
                    <div className={cn(
                      "absolute top-2 right-2 sm:top-3 sm:right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-sm",
                      feedbackMap.get(podcast.podcast_id)?.status === 'approved'
                        ? "bg-green-500/90 text-white"
                        : "bg-red-500/90 text-white"
                    )}>
                      {feedbackMap.get(podcast.podcast_id)?.status === 'approved' ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="hidden sm:inline">Approved</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3 w-3" />
                          <span className="hidden sm:inline">Rejected</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Top-left badges: Quality & AI Ready */}
                  <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1.5">
                    {/* Quality Badge - based on audience + episodes */}
                    {(() => {
                      const hasHighAudience = podcast.audience_size && podcast.audience_size >= 50000
                      const hasGoodEpisodes = podcast.episode_count && podcast.episode_count >= 100
                      if (hasHighAudience && hasGoodEpisodes) {
                        return (
                          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-500 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5 shadow-lg">
                            <Award className="h-3 w-3 mr-1" />
                            Top Pick
                          </Badge>
                        )
                      }
                      return null
                    })()}
                    {/* AI Insights Ready */}
                    {analysisCache.has(podcast.podcast_id) && (
                      <Badge className="bg-purple-600/90 hover:bg-purple-600/90 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI Ready
                      </Badge>
                    )}
                  </div>

                  {/* Bottom badges: Audience & Rating */}
                  <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 right-2 sm:right-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {podcast.audience_size && (
                        <Badge className="bg-black/70 hover:bg-black/70 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                          <Users className="h-3 w-3 mr-1" />
                          {formatNumber(podcast.audience_size)}
                        </Badge>
                      )}
                      {podcast.last_posted_at && (
                        <Badge className="bg-green-600/90 hover:bg-green-600/90 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                          <Clock className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    {/* Star Rating */}
                    {podcast.itunes_rating && (
                      <Badge className="bg-black/70 hover:bg-black/70 text-white border-0 backdrop-blur-sm text-xs px-2 py-0.5">
                        <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
                        {typeof podcast.itunes_rating === 'number' ? podcast.itunes_rating.toFixed(1) : podcast.itunes_rating}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                  <h3 className="font-semibold text-sm sm:text-base line-clamp-2 group-hover:text-primary transition-colors">
                    {podcast.podcast_name}
                  </h3>

                  {podcast.publisher_name && (
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      by {podcast.publisher_name}
                    </p>
                  )}

                  {/* Stats Row */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {podcast.audience_size && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium">{formatNumber(podcast.audience_size)}</span>
                      </div>
                    )}
                    {podcast.episode_count && (
                      <div className="flex items-center gap-1">
                        <Mic className="h-3.5 w-3.5" />
                        <span>{podcast.episode_count} eps</span>
                      </div>
                    )}
                    {podcast.last_posted_at && (
                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDistanceToNow(new Date(podcast.last_posted_at), { addSuffix: true })}</span>
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {Array.isArray(podcast.podcast_categories) && podcast.podcast_categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {podcast.podcast_categories.slice(0, 2).map((cat) => (
                        <span
                          key={cat.category_id}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] sm:text-xs rounded-full text-muted-foreground"
                        >
                          {cat.category_name}
                        </span>
                      ))}
                      {podcast.podcast_categories.length > 2 && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] sm:text-xs rounded-full text-muted-foreground">
                          +{podcast.podcast_categories.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick Actions & View Details */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    {/* Quick Approve/Reject Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const currentStatus = feedbackMap.get(podcast.podcast_id)?.status
                          saveFeedback(podcast.podcast_id, currentStatus === 'approved' ? null : 'approved')
                        }}
                        className={cn(
                          "p-1.5 rounded-full transition-all duration-200",
                          feedbackMap.get(podcast.podcast_id)?.status === 'approved'
                            ? "bg-green-500 text-white shadow-md"
                            : "hover:bg-green-100 dark:hover:bg-green-900/30 text-slate-400 hover:text-green-600"
                        )}
                        title={feedbackMap.get(podcast.podcast_id)?.status === 'approved' ? "Click to unselect" : "Approve"}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const currentStatus = feedbackMap.get(podcast.podcast_id)?.status
                          saveFeedback(podcast.podcast_id, currentStatus === 'rejected' ? null : 'rejected')
                        }}
                        className={cn(
                          "p-1.5 rounded-full transition-all duration-200",
                          feedbackMap.get(podcast.podcast_id)?.status === 'rejected'
                            ? "bg-red-500 text-white shadow-md"
                            : "hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600"
                        )}
                        title={feedbackMap.get(podcast.podcast_id)?.status === 'rejected' ? "Click to unselect" : "Reject"}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </button>
                    </div>

                    {/* View Details */}
                    <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Details
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8 pb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // Show first, last, current, and pages near current
                    if (page === 1 || page === totalPages) return true
                    if (Math.abs(page - currentPage) <= 1) return true
                    return false
                  })
                  .map((page, idx, arr) => {
                    // Add ellipsis between gaps
                    const showEllipsisBefore = idx > 0 && page - arr[idx - 1] > 1
                    return (
                      <div key={page} className="flex items-center gap-1">
                        {showEllipsisBefore && <span className="px-2 text-muted-foreground">...</span>}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="min-w-[40px]"
                        >
                          {page}
                        </Button>
                      </div>
                    )
                  })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
          </>
        )}
      </div>

      {dashboard?.show_pricing_section === false && dashboard.cta_type !== 'none' && (
        <section className="px-4 py-12 md:py-16">
          <div className="container mx-auto">
            <div className="mx-auto grid gap-6 rounded-[32px] border border-[#0d1b2a]/8 bg-[#0d1b2a] px-6 py-8 text-white shadow-[0_20px_42px_rgba(13,27,42,0.16)] md:px-8 md:py-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/60">Next step</p>
                <h2 className="mt-3 font-editorial text-4xl leading-[0.95] tracking-[-0.045em] sm:text-5xl">
                  Ready to turn your shortlist into conversations?
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-white/72">
                  Approve the shows that feel right, add any notes, and let us know when you are ready to move forward.
                </p>
              </div>

              {dashboard.cta_url && (dashboard.cta_type === 'book_call' || dashboard.cta_type === 'learn_more') ? (
                <Button
                  variant="secondary"
                  size="xl"
                  className="min-h-[52px] rounded-full bg-white px-7 text-[#0d1b2a] hover:bg-white/90"
                  onClick={() => openExternalUrl(dashboard.cta_url!)}
                >
                  {dashboard.cta_type === 'book_call' ? <Calendar className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                  {dashboard.cta_label}
                </Button>
              ) : bookingEmbedUrl ? null : bookingLink ? (
                // A booking link this build will not frame still gets a real
                // button, rather than being refused for not being Calendly.
                <Button
                  variant="secondary"
                  size="xl"
                  className="min-h-[52px] rounded-full bg-white px-7 text-[#0d1b2a] hover:bg-white/90"
                  onClick={() => openExternalUrl(bookingLink)}
                >
                  <Calendar className="mr-2 h-4 w-4" />Book a call
                </Button>
              ) : (
                <div className="flex max-w-sm items-start gap-3 rounded-[22px] border border-white/14 bg-white/8 px-5 py-4">
                  <MessageSquare className="mt-0.5 h-5 w-5 flex-shrink-0 text-white/80" />
                  <div>
                    <p className="font-semibold">{dashboard.cta_label || 'Reply to move forward'}</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">Reply to the email that brought you here and we will take care of the next step.</p>
                  </div>
                </div>
              )}

              {bookingEmbedUrl && (
                // Under the copy and across the section, because a scheduler
                // beside a paragraph is too narrow to pick a time in.
                <div className="lg:col-span-2">
                  <div className="overflow-hidden rounded-[22px] border border-white/14 bg-white">
                    <iframe
                      src={bookingEmbedUrl}
                      title={`Book a call${bookingProvider ? ` on ${bookingProvider}` : ''}`}
                      loading="lazy"
                      className="h-[640px] w-full border-0 sm:h-[700px]"
                      // Only what a scheduler needs: it may run and navigate
                      // itself, and nothing here can reach this page.
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                    />
                  </div>
                  <p className="mt-3 text-sm text-white/60">
                    Trouble loading?{' '}
                    <button
                      type="button"
                      onClick={() => openExternalUrl(bookingLink!)}
                      className="font-semibold text-white underline underline-offset-4"
                    >
                      Open the scheduler in a new tab
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      {dashboard?.show_pricing_section !== false && (
        <section className="px-4 py-12 md:py-16">
          <div className="container mx-auto">
            <div className="mx-auto overflow-hidden rounded-[32px] border border-[#0d1b2a]/8 bg-white shadow-[0_20px_42px_rgba(13,27,42,0.08)]">
              <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1.06fr_0.94fr] lg:gap-10">
                <div className="max-w-2xl">
                  <p className="section-kicker">Next step</p>
                  <h2 className="mt-4 font-editorial text-4xl leading-[0.92] tracking-[-0.05em] text-[#0d1b2a] sm:text-5xl">
                    Turn the approved rooms into real bookings.
                  </h2>

                  <p className="mt-5 max-w-xl text-base leading-8 text-[#4c5d73] md:text-lg">
                    Once you approve the podcasts that feel right, our team handles host outreach, follow-up, scheduling, and the booking workflow.
                  </p>

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="hero"
                      size="xl"
                      className="min-h-[48px] w-full rounded-full text-sm sm:min-h-[56px] sm:w-auto sm:text-base"
                      onClick={() => openExternalUrl('https://calendly.com/getonapodjg/30min')}
                    >
                      <Phone className="mr-2 h-4 w-4" />
                      Book a Call
                    </Button>
                    <Button
                      variant="outline"
                      size="xl"
                      className="min-h-[48px] w-full rounded-full border-[#0d1b2a]/10 bg-white text-sm text-[#0d1b2a] sm:min-h-[56px] sm:w-auto sm:text-base"
                      onClick={() => openExternalUrl(`${window.location.origin}/what-to-expect`)}
                    >
                      See What to Expect
                    </Button>
                  </div>

                  <p className="mt-5 text-sm text-[#5d7188]">
                    Month-to-month. Cancel anytime. Use the dashboard first, then decide how you want to move.
                  </p>
                </div>

                <div className="rounded-[28px] border border-[#0d1b2a]/8 bg-[#f8fbff] p-6">
                  <p className="section-kicker">Starter plan</p>
                  <div className="mt-4 flex items-end gap-2">
                    <span className="font-display text-6xl font-semibold tracking-[-0.06em] text-[#0d1b2a]">$749</span>
                    <span className="pb-2 text-sm text-[#5d7188]">/month</span>
                  </div>

                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-4 text-left transition-colors hover:bg-[#f2f7ff]"
                      onClick={() => setSelectedPricingFeature('2+ guaranteed podcast bookings every month')}
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                      <span className="flex-1 text-sm leading-7 text-[#4c5d73]">2+ guaranteed podcast bookings every month</span>
                      <Info className="mt-0.5 h-4 w-4 text-[#2d6df6]" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-4 text-left transition-colors hover:bg-[#f2f7ff]"
                      onClick={() => setSelectedPricingFeature('Podcast Command Center access')}
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                      <span className="flex-1 text-sm leading-7 text-[#4c5d73]">Podcast Command Center access</span>
                      <Info className="mt-0.5 h-4 w-4 text-[#2d6df6]" />
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-[20px] border border-[#0d1b2a]/8 bg-white px-4 py-4 text-left transition-colors hover:bg-[#f2f7ff]"
                      onClick={() => setSelectedPricingFeature('Reporting & analytics dashboard')}
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#2d6df6]" />
                      <span className="flex-1 text-sm leading-7 text-[#4c5d73]">Reporting and analytics dashboard</span>
                      <Info className="mt-0.5 h-4 w-4 text-[#2d6df6]" />
                    </button>
                  </div>

                  <div className="mt-6 rounded-[22px] border border-[#0d1b2a]/8 bg-white px-4 py-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#5d7188]">Best for</p>
                    <p className="mt-2 text-sm leading-7 text-[#4c5d73]">
                      Founders, operators, and experts who want steady guest appearances without managing the booking process themselves.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="my-12 sm:my-16">
              <SocialProofSection />
            </div>

            <div className="mt-10 rounded-[32px] border border-[#0d1b2a]/8 bg-white/84 p-5 text-[#0d1b2a] shadow-[0_20px_42px_rgba(13,27,42,0.08)] backdrop-blur-sm sm:p-6 lg:p-8">
              <div className="grid gap-8 lg:grid-cols-[0.34fr_0.66fr] lg:items-start">
                <div>
                  <p className="section-kicker">Q+A</p>
                  <h3 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[#0d1b2a] sm:text-4xl">
                    Common questions before you approve the shortlist.
                  </h3>
                  <p className="mt-4 max-w-md text-base leading-7 text-[#4c5d73]">
                    These cover how approvals work, what happens after you choose shows, and how the campaign moves into outreach.
                  </p>
                </div>

                <div className="min-w-0">
                  <PricingFAQ variant="compact" />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#0d1b2a]/8 bg-white/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 text-center">
          <p className="text-xs sm:text-sm text-[#5d7188]">
            Prepared by <span className="font-semibold text-[#0d1b2a]">{workspaceBrand?.brand_name || 'Get On A Pod'}</span>
          </p>
        </div>
      </footer>

      {/* Data Methodology Panel */}
      <Sheet open={showReviewPanel} onOpenChange={setShowReviewPanel}>
        <SheetContent side="right" className="!w-full sm:!max-w-lg p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b bg-gradient-to-r from-green-500/10 via-blue-500/10 to-purple-500/10">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-xl">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Understanding Our Data
                </SheetTitle>
              </SheetHeader>
              <p className="text-sm text-muted-foreground mt-2">
                How we estimate audience size and listener demographics
              </p>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Key Highlight */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-800 dark:text-green-300">Verified Estimates</p>
                      <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                        Our audience numbers are <span className="font-medium">per-episode listener estimates</span>, making them easily comparable across all podcasts.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Data Sources */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <Globe className="h-4 w-4 text-blue-500" />
                    Data Sources
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { icon: '📊', label: 'Chart Rankings' },
                      { icon: '⭐', label: 'Review Volume' },
                      { icon: '👥', label: 'Social Following' },
                      { icon: '📈', label: 'Engagement Metrics' },
                      { icon: '🎯', label: 'Category Performance' },
                      { icon: '📅', label: 'Publishing Frequency' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm">
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* How It Works */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    How It Works
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">1</div>
                      <p className="text-sm text-muted-foreground">We analyze chart rankings from Apple Podcasts, Spotify, and other major platforms</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">2</div>
                      <p className="text-sm text-muted-foreground">Our ML models process multiple data points to identify patterns and correlations</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">3</div>
                      <p className="text-sm text-muted-foreground">Estimates are validated against known audience sizes when available</p>
                    </div>
                  </div>
                </div>

                {/* Use Cases */}
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <Target className="h-4 w-4 text-orange-500" />
                    What These Numbers Help With
                  </h3>
                  <ul className="space-y-2">
                    {[
                      'Identify high-reach podcast opportunities',
                      'Compare shows within similar categories',
                      'Prioritize outreach based on audience size',
                      'Track growth trends over time',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Disclaimer */}
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <span className="font-semibold">Note:</span> While no third-party service can provide exact listener counts, our estimates consistently align with numbers reported by podcast hosts. Use these as reliable benchmarks for comparison.
                  </p>
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t bg-slate-50 dark:bg-slate-900">
              <Button
                className="w-full"
                onClick={() => setShowReviewPanel(false)}
              >
                Got It
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Side Panel */}
      <Sheet open={!!selectedPodcast} onOpenChange={() => setSelectedPodcast(null)}>
        <SheetContent className="!w-full sm:!max-w-xl p-0 overflow-hidden overflow-x-hidden border-l-0 shadow-2xl">
          {selectedPodcast && (
            <div className="flex flex-col h-[90vh] sm:h-full">
              {/* Hero Header with Image */}
              <div className="relative h-44 sm:h-64 overflow-hidden flex-shrink-0">
                {selectedPodcast.podcast_image_url ? (
                  <img
                    src={selectedPodcast.podcast_image_url}
                    alt={selectedPodcast.podcast_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                    <Mic className="h-16 w-16 sm:h-20 sm:w-20 text-white/30" />
                  </div>
                )}
                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

                {/* Drag handle for mobile */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/30 rounded-full sm:hidden" />

                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-3 right-3 sm:top-4 sm:right-4 h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm border border-white/20"
                  onClick={() => setSelectedPodcast(null)}
                >
                  <X className="h-5 w-5" />
                </Button>

                {/* Content on image */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    {selectedPodcast.itunes_rating && selectedPodcast.itunes_rating >= 4.5 && (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 text-xs">
                        <Award className="h-3 w-3 mr-1" />
                        Top Rated
                      </Badge>
                    )}
                    {selectedPodcast.audience_size && selectedPodcast.audience_size >= 50000 && (
                      <Badge className="bg-green-500 hover:bg-green-500 text-white border-0 text-xs">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        High Reach
                      </Badge>
                    )}
                    {selectedPodcast.episode_count && selectedPodcast.episode_count >= 100 && (
                      <Badge className="bg-purple-500 hover:bg-purple-500 text-white border-0 text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        Established
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-white line-clamp-2 mb-1">{selectedPodcast.podcast_name}</h2>
                  {selectedPodcast.publisher_name && (
                    <p className="text-white/70 text-xs sm:text-sm">by {selectedPodcast.publisher_name}</p>
                  )}
                </div>
              </div>

              {/* Quick Stats Bar */}
              <div className="flex-shrink-0 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="grid grid-cols-3 divide-x divide-white/10">
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-yellow-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.itunes_rating ? Number(selectedPodcast.itunes_rating).toFixed(1) : '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Rating</p>
                  </div>
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.audience_size ? formatNumber(selectedPodcast.audience_size) : '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Listeners</p>
                  </div>
                  <div className="p-2.5 sm:p-4 text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-purple-400" />
                      <span className="text-lg sm:text-2xl font-bold">
                        {selectedPodcast.episode_count || '-'}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Episodes</p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 pb-8 overflow-x-hidden">
                  {/* About Section */}
                  <div className="space-y-2 sm:space-y-3">
                    <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">About This Podcast</h3>
                    {isAnalyzing ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-full" />
                        <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
                        <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {fitAnalysis?.clean_description || selectedPodcast.podcast_description || 'No description available'}
                      </p>
                    )}
                  </div>

                  {/* Categories */}
                  {Array.isArray(selectedPodcast.podcast_categories) && selectedPodcast.podcast_categories.length > 0 && (
                    <div className="space-y-2 sm:space-y-3">
                      <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        <Tag className="h-3 w-3" />
                        Categories
                      </h3>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {selectedPodcast.podcast_categories.map((cat) => (
                          <Badge
                            key={cat.category_id}
                            variant="secondary"
                            className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-0"
                          >
                            {cat.category_name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Why It's a Great Fit */}
                  {dashboard.prospect_bio && (
                    <>
                      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-3.5 sm:p-5 border border-amber-200/50 dark:border-amber-800/50">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-amber-900 dark:text-amber-100">Why This Is Perfect For You</h3>
                            <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">AI-powered analysis</p>
                          </div>
                        </div>

                        {isAnalyzing ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div className="h-6 w-6 bg-amber-200 dark:bg-amber-800 rounded-full animate-pulse shrink-0" />
                                <div className="flex-1 h-4 bg-amber-200 dark:bg-amber-800 rounded animate-pulse" />
                              </div>
                            ))}
                          </div>
                        ) : fitAnalysis?.fit_reasons && fitAnalysis.fit_reasons.length > 0 ? (
                          <ul className="space-y-3">
                            {fitAnalysis.fit_reasons.map((reason, idx) => (
                              <li key={idx} className="flex items-start gap-3">
                                <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center shrink-0 mt-0.5">
                                  <CheckCircle2 className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-sm text-amber-900 dark:text-amber-100">{reason}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Analyzing fit...</span>
                          </div>
                        )}
                      </div>

                      {/* Pitch Angles */}
                      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 p-3.5 sm:p-5 border border-purple-200/50 dark:border-purple-800/50">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center shadow-lg">
                            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-purple-900 dark:text-purple-100">Suggested Pitch Angles</h3>
                            <p className="text-[10px] sm:text-xs text-purple-700 dark:text-purple-300">Ways to approach this podcast</p>
                          </div>
                        </div>

                        {isAnalyzing ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="p-4 bg-white/50 dark:bg-white/5 rounded-xl space-y-2">
                                <div className="h-4 bg-purple-200 dark:bg-purple-800 rounded animate-pulse w-2/3" />
                                <div className="h-3 bg-purple-100 dark:bg-purple-900 rounded animate-pulse w-full" />
                              </div>
                            ))}
                          </div>
                        ) : fitAnalysis?.pitch_angles && fitAnalysis.pitch_angles.length > 0 ? (
                          <div className="space-y-3">
                            {fitAnalysis.pitch_angles.map((angle, idx) => (
                              <div
                                key={idx}
                                className="p-4 bg-white/70 dark:bg-white/5 rounded-xl border border-purple-100 dark:border-purple-800/50 hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br from-purple-600 to-violet-600 text-white text-sm font-bold shrink-0 shadow">
                                    {idx + 1}
                                  </span>
                                  <div className="space-y-1">
                                    <h4 className="font-semibold text-purple-900 dark:text-purple-100">{angle.title}</h4>
                                    <p className="text-sm text-purple-700 dark:text-purple-300">{angle.description}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Generating pitch ideas...</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Demographics - Enhanced */}
                  {(isLoadingDemographics || demographics) && (
                    <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 p-3.5 sm:p-5 border border-blue-200/50 dark:border-blue-800/50">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-2.5 sm:gap-3">
                          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
                            <Users className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-blue-900 dark:text-blue-100">Audience Insights</h3>
                            <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300">
                              {demographics?.episodes_analyzed ? `Based on ${demographics.episodes_analyzed} episodes` : 'Know who you\'ll reach'}
                            </p>
                          </div>
                        </div>
                        {demographics && (
                          <button
                            onClick={() => setIsDemographicsExpanded(!isDemographicsExpanded)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors p-1"
                          >
                            {isDemographicsExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </button>
                        )}
                      </div>

                      {isLoadingDemographics ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="p-3 sm:p-4 bg-white/50 dark:bg-white/5 rounded-lg sm:rounded-xl space-y-2">
                                <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded animate-pulse w-1/2" />
                                <div className="h-5 bg-blue-100 dark:bg-blue-900 rounded animate-pulse w-3/4" />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : demographics && (
                        <div className="space-y-4">
                          {/* Core Stats - Always visible */}
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-blue-100 dark:border-blue-800/50">
                              <p className="text-[10px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1">Age Group</p>
                              <p className="font-bold text-sm sm:text-base text-blue-900 dark:text-blue-100">{demographics.age}</p>
                            </div>
                            <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-pink-100 dark:border-pink-800/50">
                              <p className="text-[10px] sm:text-xs font-medium text-pink-600 dark:text-pink-400 mb-0.5 sm:mb-1">Gender Split</p>
                              <p className="font-bold text-sm sm:text-base text-pink-900 dark:text-pink-100 capitalize">{demographics.gender_skew?.replace(/_/g, ' ')}</p>
                            </div>
                            <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-green-100 dark:border-green-800/50">
                              <p className="text-[10px] sm:text-xs font-medium text-green-600 dark:text-green-400 mb-0.5 sm:mb-1">Buying Power</p>
                              <p className="font-bold text-sm sm:text-base text-green-900 dark:text-green-100 capitalize">{demographics.purchasing_power}</p>
                            </div>
                            <div className="p-3 sm:p-4 bg-white/70 dark:bg-white/5 rounded-lg sm:rounded-xl border border-purple-100 dark:border-purple-800/50">
                              <p className="text-[10px] sm:text-xs font-medium text-purple-600 dark:text-purple-400 mb-0.5 sm:mb-1">Education</p>
                              <p className="font-bold text-sm sm:text-base text-purple-900 dark:text-purple-100 capitalize">{demographics.education_level}</p>
                            </div>
                          </div>

                          {/* Engagement Badge */}
                          {demographics.engagement_level && (
                            <div className="flex items-center gap-2 p-2.5 bg-white/50 dark:bg-white/5 rounded-lg border border-orange-200/50 dark:border-orange-800/30">
                              <Zap className="h-4 w-4 text-orange-500" />
                              <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                                Engagement: <span className="capitalize">{demographics.engagement_level}</span>
                              </span>
                            </div>
                          )}

                          {/* Expanded Details */}
                          {isDemographicsExpanded && (
                            <div className="space-y-4 pt-2 border-t border-blue-200/50 dark:border-blue-800/30">
                              {/* Age Distribution Chart - Recharts */}
                              {demographics.age_distribution && demographics.age_distribution.length > 0 && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-blue-100/50 dark:border-blue-800/30">
                                  <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-200 mb-3 flex items-center gap-1.5">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    Age Distribution
                                  </h4>
                                  <div className="h-36">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart
                                        data={demographics.age_distribution.map(item => ({
                                          name: item.age,
                                          value: item.percentage
                                        }))}
                                        layout="vertical"
                                        margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                                      >
                                        <XAxis type="number" domain={[0, 100]} hide />
                                        <YAxis
                                          type="category"
                                          dataKey="name"
                                          axisLine={false}
                                          tickLine={false}
                                          tick={{ fontSize: 10, fill: '#64748b' }}
                                          width={50}
                                        />
                                        <RechartsTooltip
                                          formatter={(value: number) => [`${value}%`, 'Audience']}
                                          contentStyle={{
                                            backgroundColor: 'rgba(255,255,255,0.95)',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            fontSize: '12px'
                                          }}
                                        />
                                        <Bar
                                          dataKey="value"
                                          fill="url(#blueGradient)"
                                          radius={[0, 4, 4, 0]}
                                          label={{ position: 'right', fontSize: 10, fill: '#3b82f6', formatter: (v: number) => `${v}%` }}
                                        />
                                        <defs>
                                          <linearGradient id="blueGradient" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#06b6d4" />
                                          </linearGradient>
                                        </defs>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              )}

                              {/* Professional Industries - Pie Chart with Legend */}
                              {demographics.professional_industry && demographics.professional_industry.length > 0 && (() => {
                                const INDUSTRY_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
                                const topIndustries = demographics.professional_industry.slice(0, 5)
                                return (
                                  <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-indigo-100/50 dark:border-indigo-800/30">
                                    <h4 className="text-xs font-semibold text-indigo-800 dark:text-indigo-200 mb-3 flex items-center gap-1.5">
                                      <Building2 className="h-3.5 w-3.5" />
                                      Top Industries
                                    </h4>
                                    <div className="flex items-center gap-4">
                                      <div className="w-24 h-24 shrink-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                          <PieChart>
                                            <Pie
                                              data={topIndustries.map((item, idx) => ({
                                                name: item.industry,
                                                value: item.percentage
                                              }))}
                                              cx="50%"
                                              cy="50%"
                                              innerRadius={20}
                                              outerRadius={40}
                                              paddingAngle={2}
                                              dataKey="value"
                                            >
                                              {topIndustries.map((_, idx) => (
                                                <Cell key={idx} fill={INDUSTRY_COLORS[idx]} />
                                              ))}
                                            </Pie>
                                          </PieChart>
                                        </ResponsiveContainer>
                                      </div>
                                      <div className="flex-1 space-y-1">
                                        {topIndustries.map((item, idx) => (
                                          <div key={idx} className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: INDUSTRY_COLORS[idx] }} />
                                            <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate flex-1">{item.industry}</span>
                                            <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{item.percentage}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })()}

                              {/* Geographic Distribution */}
                              {demographics.geographic_distribution && demographics.geographic_distribution.length > 0 && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-emerald-100/50 dark:border-emerald-800/30">
                                  <h4 className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-3 flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" />
                                    Geographic Reach
                                  </h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {demographics.geographic_distribution.slice(0, 6).map((item, idx) => (
                                      <div
                                        key={idx}
                                        className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/50 rounded-full text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                                      >
                                        {item.region} <span className="font-bold">{item.percentage}%</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Living Environment - Donut Chart */}
                              {demographics.living_environment && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-amber-100/50 dark:border-amber-800/30">
                                  <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-3 flex items-center gap-1.5">
                                    <Home className="h-3.5 w-3.5" />
                                    Living Environment
                                  </h4>
                                  <div className="flex items-center gap-4">
                                    <div className="w-24 h-24">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                          <Pie
                                            data={[
                                              { name: 'Urban', value: demographics.living_environment.urban, color: '#f59e0b' },
                                              { name: 'Suburban', value: demographics.living_environment.suburban, color: '#fbbf24' },
                                              { name: 'Rural', value: demographics.living_environment.rural, color: '#fcd34d' }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={25}
                                            outerRadius={40}
                                            paddingAngle={2}
                                            dataKey="value"
                                          >
                                            <Cell fill="#f59e0b" />
                                            <Cell fill="#fbbf24" />
                                            <Cell fill="#fcd34d" />
                                          </Pie>
                                        </PieChart>
                                      </ResponsiveContainer>
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                                        <span className="text-[10px] text-slate-600 dark:text-slate-400">Urban</span>
                                        <span className="text-xs font-bold text-amber-700 dark:text-amber-300 ml-auto">{demographics.living_environment.urban}%</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-amber-400" />
                                        <span className="text-[10px] text-slate-600 dark:text-slate-400">Suburban</span>
                                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 ml-auto">{demographics.living_environment.suburban}%</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-amber-300" />
                                        <span className="text-[10px] text-slate-600 dark:text-slate-400">Rural</span>
                                        <span className="text-xs font-bold text-amber-500 dark:text-amber-500 ml-auto">{demographics.living_environment.rural}%</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Content Habits */}
                              {demographics.content_habits && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-cyan-100/50 dark:border-cyan-800/30">
                                  <h4 className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 mb-3 flex items-center gap-1.5">
                                    <Smartphone className="h-3.5 w-3.5" />
                                    Content Habits
                                  </h4>
                                  <div className="space-y-2">
                                    {demographics.content_habits.primary_platforms && demographics.content_habits.primary_platforms.length > 0 && (
                                      <div>
                                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium">Platforms: </span>
                                        <span className="text-[10px] text-cyan-800 dark:text-cyan-200">{demographics.content_habits.primary_platforms.join(', ')}</span>
                                      </div>
                                    )}
                                    {demographics.content_habits.content_frequency && (
                                      <div>
                                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium">Frequency: </span>
                                        <span className="text-[10px] text-cyan-800 dark:text-cyan-200 capitalize">{demographics.content_habits.content_frequency}</span>
                                      </div>
                                    )}
                                    {demographics.content_habits.preferred_formats && demographics.content_habits.preferred_formats.length > 0 && (
                                      <div>
                                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium">Formats: </span>
                                        <span className="text-[10px] text-cyan-800 dark:text-cyan-200">{demographics.content_habits.preferred_formats.join(', ')}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Brand Relationship */}
                              {demographics.brand_relationship && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-rose-100/50 dark:border-rose-800/30">
                                  <h4 className="text-xs font-semibold text-rose-800 dark:text-rose-200 mb-3 flex items-center gap-1.5">
                                    <ShoppingBag className="h-3.5 w-3.5" />
                                    Brand Relationship
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="text-center p-2 bg-rose-100/50 dark:bg-rose-900/30 rounded-lg">
                                      <div className="text-[10px] text-rose-600 dark:text-rose-400">Loyalty</div>
                                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200 capitalize">{demographics.brand_relationship.loyalty_level}</div>
                                    </div>
                                    <div className="text-center p-2 bg-rose-100/50 dark:bg-rose-900/30 rounded-lg">
                                      <div className="text-[10px] text-rose-600 dark:text-rose-400">Price Sensitivity</div>
                                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200 capitalize">{demographics.brand_relationship.price_sensitivity}</div>
                                    </div>
                                    <div className="text-center p-2 bg-rose-100/50 dark:bg-rose-900/30 rounded-lg">
                                      <div className="text-[10px] text-rose-600 dark:text-rose-400">Switching</div>
                                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200 capitalize">{demographics.brand_relationship.brand_switching_frequency}</div>
                                    </div>
                                    <div className="text-center p-2 bg-rose-100/50 dark:bg-rose-900/30 rounded-lg">
                                      <div className="text-[10px] text-rose-600 dark:text-rose-400">Advocacy</div>
                                      <div className="text-xs font-bold text-rose-800 dark:text-rose-200 capitalize">{demographics.brand_relationship.advocacy_potential}</div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Technology Adoption */}
                              {demographics.technology_adoption && (
                                <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-violet-100/50 dark:border-violet-800/30">
                                  <h4 className="text-xs font-semibold text-violet-800 dark:text-violet-200 mb-2 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Tech Adoption: <span className="capitalize">{demographics.technology_adoption.profile}</span>
                                  </h4>
                                  {demographics.technology_adoption.reasoning && (
                                    <p className="text-[10px] text-violet-700 dark:text-violet-300 leading-relaxed">{demographics.technology_adoption.reasoning}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Expand prompt */}
                          {!isDemographicsExpanded && (demographics.age_distribution || demographics.professional_industry || demographics.living_environment) && (
                            <button
                              onClick={() => setIsDemographicsExpanded(true)}
                              className="w-full text-center py-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 font-medium transition-colors"
                            >
                              View detailed audience breakdown
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Feedback Section */}
                  <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h3 className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" />
                      Your Feedback
                    </h3>

                    {/* Current Status Display */}
                    {(() => {
                      const feedback = feedbackMap.get(selectedPodcast.podcast_id)
                      if (feedback?.status) {
                        return (
                          <div className={cn(
                            "mb-4 p-3 rounded-lg border",
                            feedback.status === 'approved'
                              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                          )}>
                            <div className="flex items-center gap-2">
                              {feedback.status === 'approved' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                              ) : (
                                <X className="h-4 w-4 text-red-600 dark:text-red-400" />
                              )}
                              <span className={cn(
                                "text-sm font-medium",
                                feedback.status === 'approved'
                                  ? "text-green-700 dark:text-green-300"
                                  : "text-red-700 dark:text-red-300"
                              )}>
                                {feedback.status === 'approved' ? 'You approved this podcast' : 'You rejected this podcast'}
                              </span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Approve/Reject Buttons */}
                    <div className="flex gap-3 mb-4">
                      <Button
                        variant={feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 gap-2",
                          feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved'
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "hover:bg-green-50 hover:text-green-700 hover:border-green-300 dark:hover:bg-green-950/30"
                        )}
                        onClick={() => {
                          const currentStatus = feedbackMap.get(selectedPodcast.podcast_id)?.status
                          saveFeedback(selectedPodcast.podcast_id, currentStatus === 'approved' ? null : 'approved')
                        }}
                        disabled={isSavingFeedback}
                      >
                        <ThumbsUp className="h-4 w-4" />
                        {feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved' ? 'Approved ✓' : 'Approve'}
                      </Button>
                      <Button
                        variant={feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 gap-2",
                          feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected'
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : "hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-950/30"
                        )}
                        onClick={() => {
                          const currentStatus = feedbackMap.get(selectedPodcast.podcast_id)?.status
                          saveFeedback(selectedPodcast.podcast_id, currentStatus === 'rejected' ? null : 'rejected')
                        }}
                        disabled={isSavingFeedback}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        {feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected' ? 'Rejected ✓' : 'Reject'}
                      </Button>
                    </div>

                    {/* Notes Section */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Add a note (optional)
                      </label>
                      <Textarea
                        placeholder="Any thoughts or questions about this podcast..."
                        value={currentNotes}
                        onChange={(e) => setCurrentNotes(e.target.value)}
                        className="min-h-[80px] resize-none text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => {
                          const existing = feedbackMap.get(selectedPodcast.podcast_id)
                          saveFeedback(selectedPodcast.podcast_id, existing?.status || null, currentNotes)
                        }}
                        disabled={isSavingFeedback || currentNotes === (feedbackMap.get(selectedPodcast.podcast_id)?.notes || '')}
                      >
                        {isSavingFeedback ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Save Note
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>

            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Help Button - Fixed position */}
      <button
        onClick={() => {
          setTutorialStep(0)
          setShowTutorial(true)
        }}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all hover:scale-105 flex items-center justify-center"
        title="How to use this dashboard"
      >
        <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      {/* Tutorial Stepper Modal */}
      <Dialog open={showTutorial} onOpenChange={(open) => !open && closeTutorial()}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg p-0 overflow-hidden rounded-2xl">
          <VisuallyHidden>
            <DialogTitle>How to Use Your Dashboard</DialogTitle>
          </VisuallyHidden>

          {/* Step Content */}
          <div className="relative">
            {/* Step 0: Welcome */}
            {tutorialStep === 0 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">Welcome to Your Dashboard!</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
                  We've hand-picked podcasts that are a perfect fit for your expertise and goals. Let us show you how to make the most of it.
                </p>
                <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>Takes about 1 minute</span>
                </div>
              </div>
            )}

            {/* Step 1: Browse Podcasts */}
            {tutorialStep === 1 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Search className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">Browse Your Podcasts</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Scroll through your curated list of podcasts. Each card shows key info like audience size, ratings, and categories.
                </p>
                <div className="bg-muted/50 rounded-xl p-3 sm:p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                    <span>Use the search bar to find specific podcasts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                    <span>Filter by category to narrow your selection</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: View AI Insights */}
            {tutorialStep === 2 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <MousePointerClick className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">Tap for AI Insights</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Click on any podcast card to open a detailed side panel with AI-powered analysis.
                </p>
                <div className="bg-muted/50 rounded-xl p-3 sm:p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                    <span><strong>Fit Score</strong> — How well you match this show</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
                    <span><strong>Pitch Angles</strong> — Topics to discuss</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 shrink-0" />
                    <span><strong>Audience Insights</strong> — Who you'll reach</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Approve or Reject */}
            {tutorialStep === 3 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <ListChecks className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">Share Your Feedback</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  For each podcast, let us know if it's a good fit for you.
                </p>
                <div className="flex justify-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <ThumbsUp className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base font-medium">Approve</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    <ThumbsDown className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base font-medium">Reject</span>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  You can also add notes to explain your preference — this helps us find even better matches!
                </p>
              </div>
            )}

            {/* Step 4: What's Next */}
            {tutorialStep === 4 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                  <Rocket className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">We'll Take It From Here!</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Once you've reviewed your podcasts, our team will start crafting personalized pitches for your approved shows.
                </p>
                <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-xl p-3 sm:p-4 border border-primary/20">
                  <p className="text-xs sm:text-sm font-medium text-primary">
                    Pro Tip: The more podcasts you review, the faster we can get you booked!
                  </p>
                </div>
              </div>
            )}

            {/* Progress Dots */}
            <div className="flex justify-center gap-2 pb-4">
              {[0, 1, 2, 3, 4].map((step) => (
                <button
                  key={step}
                  onClick={() => setTutorialStep(step)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    tutorialStep === step
                      ? "bg-primary w-6"
                      : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  )}
                />
              ))}
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between p-4 border-t bg-muted/30">
              <Button
                variant="ghost"
                onClick={() => setTutorialStep(Math.max(0, tutorialStep - 1))}
                disabled={tutorialStep === 0}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>

              {tutorialStep < 4 ? (
                <Button onClick={() => setTutorialStep(tutorialStep + 1)} className="gap-1">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={closeTutorial} className="gap-1 bg-green-600 hover:bg-green-700">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pricing Feature Detail Modal */}
      <FeatureDetailModal
        selectedFeature={selectedPricingFeature}
        onClose={() => setSelectedPricingFeature(null)}
      />

      {/* Loom Video Modal */}
      {loomEmbedUrl && (
        <Dialog
          open={showLoomVideo}
          onOpenChange={(open) => {
            setShowLoomVideo(open)
            if (open) {
              setLoomVideoLoading(true)
            }
          }}
        >
          <DialogContent className="max-w-4xl w-full p-0">
            <DialogTitle className="sr-only">Personal Video Message</DialogTitle>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              {/* Loading Spinner */}
              {loomVideoLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 rounded-lg z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading your video...</p>
                  </div>
                </div>
              )}

              <iframe
                src={loomEmbedUrl}
                frameBorder="0"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full rounded-lg"
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                onLoad={() => setLoomVideoLoading(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  )
}
