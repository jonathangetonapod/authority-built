import { useState, useEffect, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { formatDistanceToNow } from 'date-fns'
import confetti from 'canvas-confetti'
import {
  Mic,
  Users,
  Star,
  ExternalLink,
  FileText,
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
  SlidersHorizontal,
  LayoutGrid,
  Library,
  Play,
  Send,
  CalendarCheck,
  Share2,
  Copy,
  RotateCcw,
  ArrowUpRight,
  WandSparkles,
  LineChart
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { PodcastDemographics } from '@/services/podscan'
import { cn } from '@/lib/utils'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { toast } from 'sonner'
import PageSEO from '@/components/seo/PageSEO'
import { openExternalUrl } from '@/lib/externalUrl'
import { onboardingWorkspaceInitials } from '@/lib/onboardingBrand'
import { currentHostname } from '@/lib/workspaceHost'

export default function ClientApprovalView() {
  return <ClientApprovalViewContent />
}

interface ClientDashboard {
  id: string
  name: string
  bio: string | null
  photo_url: string | null
  media_kit_url: string | null
  dashboard_tagline: string | null
  dashboard_view_count: number
  dashboard_last_viewed_at: string | null
  workspace?: {
    name?: string | null
    logo_url?: string | null
    primary_color?: string | null
    accent_color?: string | null
  } | null
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
  is_featured?: boolean
  featured_order?: number | null
  display_order?: number
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
  client_id: string
  podcast_id: string
  podcast_name: string | null
  status: 'approved' | 'rejected' | null
  notes: string | null
  created_at: string
  updated_at: string
}

type FeedbackFilter = 'all' | 'approved' | 'rejected' | 'not_reviewed'
type DashboardView = 'top' | 'all' | 'picks'

const SHORTLIST_GOAL = 10
const TOP_MATCH_COUNT = 12
const CARDS_PER_PAGE = 10

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function normalizedBrandColor(value: string | null | undefined, fallback: string): string {
  const color = value?.trim().toUpperCase() || ''
  return /^#[0-9A-F]{6}$/u.test(color) ? color : fallback
}

function readableBrandColor(background: string): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(background.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722)
  return luminance > 0.42 ? '#102033' : '#FFFFFF'
}

async function invokePublicClientDashboard<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/public-client-dashboard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ...body, hostname: currentHostname() }),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Dashboard request failed')
  return payload as T
}

function decodePodcastEntities(value: string | null | undefined) {
  if (!value) return value
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#0*39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#x([0-9a-f]+);/giu, (entity, codePoint: string) => {
      const value = Number.parseInt(codePoint, 16)
      return Number.isSafeInteger(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity
    })
    .replace(/&#([0-9]+);/gu, (entity, codePoint: string) => {
      const value = Number.parseInt(codePoint, 10)
      return Number.isSafeInteger(value) && value <= 0x10ffff ? String.fromCodePoint(value) : entity
    })
}

function PodcastArtwork({
  podcast,
  className,
  decorative = false,
}: {
  podcast: OutreachPodcast
  className?: string
  decorative?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className={cn('relative overflow-hidden bg-[#e8e0d3]', className)}>
      {podcast.podcast_image_url && !imageFailed ? (
        <img
          src={podcast.podcast_image_url}
          alt={decorative ? '' : `${podcast.podcast_name} cover`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#f7f1e8,transparent_36%),linear-gradient(145deg,#d8c6af,#8ca096)]">
          <div className="flex h-1/2 w-1/2 items-center justify-center rounded-full border border-white/60 bg-[#0d1b2a]/90 shadow-lg">
            <Mic className="h-1/2 w-1/2 text-[#e9b18f]" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  )
}

function ClientApprovalViewContent() {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const forceTour = searchParams.get('tour') === '1'
  const isAdminPreview = searchParams.get('preview') === '1'
  const queryClient = useQueryClient()

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [episodeFilter, setEpisodeFilter] = useState<string>('any')
  const [audienceFilter, setAudienceFilter] = useState<string>('any')
  const [sortBy, setSortBy] = useState<'default' | 'audience_desc' | 'audience_asc'>('default')
  const [dashboardView, setDashboardView] = useState<DashboardView>('top')
  const [showFilters, setShowFilters] = useState(false)
  const [showFocusedReview, setShowFocusedReview] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [focusedReviewIds, setFocusedReviewIds] = useState<string[]>([])
  const [focusedReviewPendingOnly, setFocusedReviewPendingOnly] = useState(true)
  const [brandLogoUnavailable, setBrandLogoUnavailable] = useState(false)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)

  // Side panel state
  const [selectedPodcast, setSelectedPodcast] = useState<OutreachPodcast | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [fitAnalysis, setFitAnalysis] = useState<PodcastFitAnalysis | null>(null)
  const [isLoadingDemographics, setIsLoadingDemographics] = useState(false)
  const [demographics, setDemographics] = useState<PodcastDemographics | null>(null)
  const [isDemographicsExpanded, setIsDemographicsExpanded] = useState(false)

  // Feedback state (for saving)
  const [currentNotes, setCurrentNotes] = useState('')
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  // Cache for analyses and demographics
  const [analysisCache, setAnalysisCache] = useState<Map<string, PodcastFitAnalysis>>(new Map())
  const [demographicsCache, setDemographicsCache] = useState<Map<string, PodcastDemographics | null>>(new Map())

  // Personalized tagline state
  const [personalizedTagline, setPersonalizedTagline] = useState<string | null>(null)

  // Tutorial modal state
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)

  // Review panel state
  const [showReviewPanel, setShowReviewPanel] = useState(false)

  // React Query: Fetch dashboard (cached for 5 minutes)
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery({
    queryKey: ['client-dashboard', slug],
    queryFn: async () => {
      if (!slug) throw new Error('Invalid dashboard link')

      const data = await invokePublicClientDashboard<{ dashboard: ClientDashboard }>({
        action: 'get',
        slug,
      })
      return data.dashboard
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!slug,
  })

  // React Query: Fetch podcasts (enabled when dashboard is ready)
  const { data: podcasts = [], isLoading: podcastsLoading, error: podcastsError, refetch: refetchPodcasts } = useQuery({
    queryKey: ['client-podcasts', dashboard?.id],
    queryFn: async () => {
      if (!dashboard?.id || !slug) return []

      const response = await fetch(`${SUPABASE_URL}/functions/v1/get-client-podcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          clientId: dashboard?.id,
          clientName: dashboard?.name,
          clientBio: dashboard?.bio,
          dashboardSlug: slug,
          cacheOnly: true,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error || 'Podcasts could not be loaded')
      }
      const data = await response.json()
      console.log(`[Dashboard] Loaded ${data.podcasts?.length || 0} podcasts from the curated database list`)
      return (data.podcasts || []).map((podcast: OutreachPodcast) => ({
        ...podcast,
        podcast_name: decodePodcastEntities(podcast.podcast_name) || podcast.podcast_name,
        publisher_name: decodePodcastEntities(podcast.publisher_name),
        podcast_description: decodePodcastEntities(podcast.podcast_description),
        ai_clean_description: decodePodcastEntities(podcast.ai_clean_description),
      }))
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!dashboard?.id && !!slug,
  })

  // React Query: Fetch feedback (refreshes more often)
  const { data: feedbackData = [], error: feedbackError } = useQuery({
    queryKey: ['client-feedback', dashboard?.id],
    queryFn: async () => {
      if (!dashboard?.id || !slug) return []
      const data = await invokePublicClientDashboard<{ feedback: PodcastFeedback[] }>({
        action: 'feedback_list',
        slug,
      })
      return data.feedback || []
    },
    staleTime: 30 * 1000, // 30 seconds - feedback changes more often
    enabled: !!dashboard?.id,
  })

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
  // Only the dashboard itself can take over the page. A podcast or feedback
  // query that fails is shown in place, with a way to retry — losing the whole
  // page because a secondary list failed leaves the client staring at a red
  // card about a page that actually loaded.
  const error = dashboardError?.message || null
  const secondaryError = podcastsError?.message || feedbackError?.message || null

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
  }, [selectedCategories, debouncedSearch, feedbackFilter, episodeFilter, audienceFilter, sortBy, dashboardView])

  // Public dashboards only display precomputed enrichment. Fresh paid AI work
  // is restricted to the platform-admin pipeline.
  useEffect(() => {
    if (!dashboard) return
    if (dashboard.dashboard_tagline) {
      setPersonalizedTagline(dashboard.dashboard_tagline)
    } else {
      setPersonalizedTagline(null)
    }
  }, [dashboard])

  useEffect(() => {
    setBrandLogoUnavailable(false)
  }, [dashboard?.workspace?.logo_url])

  // Show tutorial on first visit or if ?tour=1 is in URL
  useEffect(() => {
    if (!dashboard || loading) return

    // Workspace previews should open directly to the approval experience.
    // Genuine first-time client visits still receive the guided tutorial.
    if (isAdminPreview) {
      setShowTutorial(false)
      return
    }

    // If ?tour=1 is in URL, always show the tutorial
    if (forceTour) {
      const timer = setTimeout(() => {
        setShowTutorial(true)
      }, 500)
      return () => clearTimeout(timer)
    }

    // Otherwise, check localStorage for first-time visitors
    let hasSeenTutorial: string | null = null
    try {
      hasSeenTutorial = window.localStorage.getItem('client-tutorial-seen-v1')
    } catch {
      // Continue with an in-memory tutorial when persistent storage is denied.
    }
    if (!hasSeenTutorial) {
      const timer = setTimeout(() => {
        setShowTutorial(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [dashboard, loading, forceTour, isAdminPreview])

  // Mark tutorial as seen when closed
  const closeTutorial = () => {
    setShowTutorial(false)
    setTutorialStep(0)
    if (dashboard) {
      try {
        window.localStorage.setItem('client-tutorial-seen-v1', 'true')
      } catch {
        // Closing the tutorial must still work in hardened/private browsers.
      }
    }
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
    if (!selectedPodcast || !dashboard?.bio) {
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
  const saveFeedback = async (podcastId: string, status: 'approved' | 'rejected' | null, notes?: string, podcastName?: string) => {
    if (!dashboard) return false

    // Check if this is a new approval (not already approved)
    const existingFeedback = feedbackMap.get(podcastId)
    const isNewApproval = status === 'approved' && existingFeedback?.status !== 'approved'
    const approvedBefore = Array.from(feedbackMap.values()).filter((feedback) => feedback.status === 'approved').length

    setIsSavingFeedback(true)
    try {
      if (!slug) throw new Error('Dashboard link is invalid')
      const feedbackData = {
        action: 'feedback_upsert',
        slug,
        podcast_id: podcastId,
        podcast_name: podcastName || selectedPodcast?.podcast_name || null,
        status,
        notes: notes !== undefined ? notes : (currentNotes || null),
      }

      const response = await invokePublicClientDashboard<{ feedback: PodcastFeedback }>(feedbackData)

      queryClient.setQueryData<PodcastFeedback[]>(['client-feedback', dashboard.id], (current = []) => {
        const next = current.filter((feedback) => feedback.podcast_id !== podcastId)
        return [...next, response.feedback]
      })

      // Invalidate feedback cache to refresh the data
      queryClient.invalidateQueries({ queryKey: ['client-feedback', dashboard.id] })

      // Celebrate the meaningful milestone, not every individual click.
      if (isNewApproval && approvedBefore < SHORTLIST_GOAL && approvedBefore + 1 >= SHORTLIST_GOAL) {
        triggerConfetti()
      }
      return true
    } catch (err) {
      console.error('Error saving feedback:', err)
      toast.error(err instanceof Error ? err.message : 'Feedback could not be saved.')
      return false
    } finally {
      setIsSavingFeedback(false)
    }
  }

  // Loading state - show skeleton UI for snappier feel
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {/* Skeleton Header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <div className="text-center space-y-4">
              {/* Badge skeleton */}
              <div className="h-8 w-48 bg-white/60 rounded-full mx-auto animate-pulse" />
              {/* Title skeleton */}
              <div className="h-10 w-80 bg-slate-200/60 rounded-lg mx-auto animate-pulse" />
              {/* Subtitle skeleton */}
              <div className="h-6 w-96 bg-slate-100/60 rounded-lg mx-auto animate-pulse" />
              {/* Stats skeleton */}
              <div className="flex justify-center gap-6 pt-4">
                <div className="h-8 w-24 bg-white/60 rounded-lg animate-pulse" />
                <div className="h-8 w-24 bg-white/60 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        </div>

        {/* Skeleton Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Search skeleton */}
          <div className="h-12 w-full max-w-md bg-white rounded-xl shadow-sm animate-pulse mb-6" />

          {/* Filter tabs skeleton */}
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-9 w-24 bg-white rounded-full animate-pulse" />
            ))}
          </div>

          {/* Podcast grid skeleton */}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden animate-pulse">
                <div className="aspect-[16/10] bg-slate-200" />
                <div className="p-4 space-y-3">
                  <div className="h-5 w-3/4 bg-slate-200 rounded" />
                  <div className="h-4 w-1/2 bg-slate-100 rounded" />
                  <div className="flex gap-2">
                    <div className="h-6 w-16 bg-slate-100 rounded-full" />
                    <div className="h-6 w-16 bg-slate-100 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
              <X className="h-8 w-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Dashboard Not Available</h2>
              <p className="text-muted-foreground">{error || 'This dashboard could not be found.'}</p>
            </div>
            <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const brandName = dashboard.workspace?.name?.trim() || 'Your podcast team'
  const brandLogoUrl = dashboard.workspace?.logo_url && !brandLogoUnavailable
    ? dashboard.workspace.logo_url
    : null
  const brandPrimaryColor = normalizedBrandColor(dashboard.workspace?.primary_color, '#0D1B2A')
  const brandAccentColor = normalizedBrandColor(dashboard.workspace?.accent_color, '#C7794F')
  const brandPrimaryForeground = readableBrandColor(brandPrimaryColor)
  const brandAccentForeground = readableBrandColor(brandAccentColor)
  const campaignStyle = {
    '--campaign-primary': brandPrimaryColor,
    '--campaign-primary-foreground': brandPrimaryForeground,
    '--campaign-accent': brandAccentColor,
    '--campaign-accent-foreground': brandAccentForeground,
  } as CSSProperties

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
    return num.toLocaleString()
  }

  // Keep the public experience grounded in the curated database order and
  // remove accidental duplicates before calculating any visible totals.
  const uniquePodcasts = podcasts.filter((podcast, index, self) =>
    index === self.findIndex((candidate) => candidate.podcast_id === podcast.podcast_id)
  )

  const totalReach = uniquePodcasts.reduce((sum, podcast) => sum + (podcast.audience_size || 0), 0)
  const ratings = uniquePodcasts.filter((podcast) => podcast.itunes_rating).map((podcast) => podcast.itunes_rating!)
  const avgRating = ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0

  const topMatches = [...uniquePodcasts]
    .sort((left, right) => {
      if (Boolean(left.is_featured) !== Boolean(right.is_featured)) return left.is_featured ? -1 : 1
      if ((left.featured_order ?? 999) !== (right.featured_order ?? 999)) {
        return (left.featured_order ?? 999) - (right.featured_order ?? 999)
      }
      const leftHasFit = Boolean(left.ai_fit_reasons?.length)
      const rightHasFit = Boolean(right.ai_fit_reasons?.length)
      if (leftHasFit !== rightHasFit) return leftHasFit ? -1 : 1
      if ((left.display_order ?? 9999) !== (right.display_order ?? 9999)) {
        return (left.display_order ?? 9999) - (right.display_order ?? 9999)
      }
      return (right.audience_size || 0) - (left.audience_size || 0)
    })
    .slice(0, TOP_MATCH_COUNT)

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

  const approvedPodcasts = uniquePodcasts.filter((podcast) => feedbackMap.get(podcast.podcast_id)?.status === 'approved')
  const reviewedTopMatches = topMatches.filter((podcast) => Boolean(feedbackMap.get(podcast.podcast_id)?.status)).length
  const firstBatchApproved = Math.min(feedbackStats.approved, SHORTLIST_GOAL)
  const shortlistProgress = Math.min(100, Math.round((firstBatchApproved / SHORTLIST_GOAL) * 100))
  const viewPodcasts = dashboardView === 'top'
    ? topMatches
    : dashboardView === 'picks'
      ? approvedPodcasts
      : uniquePodcasts

  const filteredPodcasts = viewPodcasts.filter(podcast => {
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

  const activeFilterCount = selectedCategories.length
    + (feedbackFilter === 'all' ? 0 : 1)
    + (episodeFilter === 'any' ? 0 : 1)
    + (audienceFilter === 'any' ? 0 : 1)
  const hasActiveFilters = activeFilterCount > 0 || Boolean(searchQuery)

  // Pagination
  const totalPages = Math.ceil(sortedPodcasts.length / CARDS_PER_PAGE)
  const startIndex = (currentPage - 1) * CARDS_PER_PAGE
  const paginatedPodcasts = sortedPodcasts.slice(startIndex, startIndex + CARDS_PER_PAGE)
  const focusedReviewPodcasts = focusedReviewIds
    .map((podcastId) => uniquePodcasts.find((podcast) => podcast.podcast_id === podcastId))
    .filter((podcast): podcast is OutreachPodcast => Boolean(podcast))
  const focusedPodcast = focusedReviewPodcasts[
    Math.min(reviewIndex, Math.max(focusedReviewPodcasts.length - 1, 0))
  ]
  const focusedReviewedCount = focusedReviewPodcasts.filter((podcast) => (
    Boolean(feedbackMap.get(podcast.podcast_id)?.status)
  )).length
  const focusedReviewViewLabel = dashboardView === 'top'
    ? 'Top matches'
    : dashboardView === 'picks'
      ? 'My picks'
      : 'Explore all'

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedCategories([])
    setFeedbackFilter('all')
    setEpisodeFilter('any')
    setAudienceFilter('any')
    setSortBy('default')
  }

  const startFocusedReview = () => {
    if (sortedPodcasts.length === 0) return
    const firstPendingIndex = sortedPodcasts.findIndex((podcast) => (
      !feedbackMap.get(podcast.podcast_id)?.status
    ))
    setFocusedReviewIds(sortedPodcasts.map((podcast) => podcast.podcast_id))
    setFocusedReviewPendingOnly(firstPendingIndex >= 0)
    setReviewIndex(firstPendingIndex >= 0 ? firstPendingIndex : 0)
    setShowFocusedReview(true)
  }

  const handleFocusedDecision = async (status: 'approved' | 'rejected') => {
    if (!focusedPodcast) return
    const saved = await saveFeedback(
      focusedPodcast.podcast_id,
      status,
      undefined,
      focusedPodcast.podcast_name,
    )
    if (!saved) return

    if (focusedReviewPendingOnly) {
      const nextPendingIndex = focusedReviewPodcasts.findIndex((podcast, index) => (
        index > reviewIndex
        && podcast.podcast_id !== focusedPodcast.podcast_id
        && !feedbackMap.get(podcast.podcast_id)?.status
      ))
      if (nextPendingIndex >= 0) {
        setReviewIndex(nextPendingIndex)
        return
      }

      const earlierPendingIndex = focusedReviewPodcasts.findIndex((podcast, index) => (
        index < reviewIndex
        && podcast.podcast_id !== focusedPodcast.podcast_id
        && !feedbackMap.get(podcast.podcast_id)?.status
      ))
      if (earlierPendingIndex >= 0) {
        setReviewIndex(earlierPendingIndex)
        return
      }
    } else if (reviewIndex < focusedReviewPodcasts.length - 1) {
      setReviewIndex((index) => index + 1)
      return
    }

    setShowFocusedReview(false)
    toast.success(`${focusedReviewViewLabel} review complete. Your choices will guide outreach.`)
  }

  const shareDashboard = async () => {
    const shareData = {
      title: `${dashboard.name}'s podcast opportunities`,
      text: `A curated podcast shortlist prepared for ${dashboard.name}.`,
      url: window.location.href,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
      await navigator.clipboard.writeText(shareData.url)
      toast.success('Share link copied')
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      toast.error('The link could not be shared. Copy it from your address bar instead.')
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f1e9] text-[#102033]" style={campaignStyle}>
      <PageSEO
        title={dashboard.name + "'s podcast opportunities | " + brandName}
        description={"A curated podcast shortlist prepared for " + dashboard.name + ". Review the best-fit shows and choose where you would like to be featured."}
        path={"/client/" + (slug || '') + (isAdminPreview ? '?preview=1' : '')}
        image="/client-dashboard-share.png"
        imageAlt={"A curated podcast campaign prepared by " + brandName}
        noindex
        whiteLabel
        brandName={brandName}
        favicon={brandLogoUrl}
        themeColor={brandPrimaryColor}
      />

      <header
        className="relative overflow-hidden text-white"
        style={{ background: `linear-gradient(rgba(7,18,31,.58), rgba(7,18,31,.72)), ${brandPrimaryColor}` }}
      >
        <div
          className="absolute inset-0 opacity-70"
          style={{ background: `radial-gradient(circle at 84% 10%, ${brandAccentColor}55, transparent 30%), radial-gradient(circle at 8% 100%, ${brandPrimaryColor}66, transparent 33%)` }}
        />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#fff_0.7px,transparent_0.7px)] [background-size:7px_7px]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex min-h-16 items-center justify-between border-b border-white/10 py-3" aria-label="Client dashboard">
            <div className="flex items-center gap-3">
              <span className={cn('flex h-10 items-center justify-center rounded-xl bg-white shadow-sm', brandLogoUrl ? 'w-16 px-2' : 'w-10')}>
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt={`${brandName} logo`}
                    className="max-h-7 max-w-full object-contain"
                    onError={() => setBrandLogoUnavailable(true)}
                  />
                ) : (
                  <span className="text-xs font-black" style={{ color: brandPrimaryColor }}>{onboardingWorkspaceInitials(brandName)}</span>
                )}
              </span>
              <div>
                <p className="font-editorial text-lg leading-none">{brandName}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/50">Private campaign</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdminPreview ? (
                <span className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 sm:inline-flex">
                  Share preview
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTutorialStep(0)
                  setShowTutorial(true)
                }}
                className="hidden min-h-11 gap-2 text-white/70 hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                <HelpCircle className="h-4 w-4" />
                How it works
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={shareDashboard}
                className="min-h-11 gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            </div>
          </nav>

          <div className="grid gap-8 py-9 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:gap-14 lg:py-16">
            <div>
              <div className="mb-5 flex items-center gap-4">
                {dashboard.photo_url ? (
                  <img
                    src={dashboard.photo_url}
                    alt={dashboard.name}
                    className="h-16 w-16 rounded-2xl border border-white/20 object-cover shadow-2xl sm:h-20 sm:w-20"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 sm:h-20 sm:w-20">
                    <Mic className="h-8 w-8 text-[var(--campaign-accent)]" />
                  </div>
                )}
                <div>
                  <p className="section-kicker !text-[var(--campaign-accent)]">Prepared for {dashboard.name}</p>
                  <p className="mt-1 text-sm text-white/55">Your private podcast campaign</p>
                </div>
              </div>

              <h1 className="max-w-3xl font-editorial text-4xl leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
                The right rooms for your next big ideas.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/68 sm:text-lg">
                {personalizedTagline || `${brandName} matched your expertise with active podcasts whose listeners are likely to care about what you have to say.`}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  size="lg"
                  onClick={startFocusedReview}
                  disabled={sortedPodcasts.length === 0}
                  className="min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 font-semibold text-[var(--campaign-accent-foreground)] shadow-[0_12px_36px_rgba(0,0,0,.2)] hover:brightness-95"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Start focused review
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setDashboardView('picks')
                    document.getElementById('podcast-shortlist')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="min-h-12 gap-2 rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"
                >
                  <ThumbsUp className="h-4 w-4" />
                  View my picks
                  {feedbackStats.approved > 0 ? <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{feedbackStats.approved}</span> : null}
                </Button>
                {dashboard.media_kit_url ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="ghost"
                    onClick={() => openExternalUrl(dashboard.media_kit_url!)}
                    className="min-h-12 gap-2 rounded-full px-5 text-white/65 hover:bg-white/10 hover:text-white"
                  >
                    <FileText className="h-4 w-4" />
                    See how hosts see me
                  </Button>
                ) : null}
              </div>

              <dl className="mt-9 grid max-w-2xl grid-cols-3 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] py-4">
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Est. combined reach</dt>
                  <dd className="mt-1 font-editorial text-2xl text-white sm:text-3xl">{formatNumber(totalReach)}</dd>
                </div>
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Avg. Apple rating</dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-editorial text-2xl text-white sm:text-3xl">
                    {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                    {avgRating > 0 ? <Star className="h-4 w-4 fill-[var(--campaign-accent)] text-[var(--campaign-accent)]" /> : null}
                  </dd>
                </div>
                <div className="px-3 sm:px-5">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-white/45 sm:text-xs">Curated matches</dt>
                  <dd className="mt-1 font-editorial text-2xl text-white sm:text-3xl">{uniquePodcasts.length}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setShowReviewPanel(true)}
                className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs text-white/48 transition hover:text-white/80"
              >
                <Info className="h-3.5 w-3.5" />
                How audience estimates work
              </button>
            </div>

            <aside className="rounded-[28px] border border-white/10 bg-white/[0.075] p-5 shadow-2xl backdrop-blur-md sm:p-6" aria-label="First shortlist goal">
              <div className="flex items-start justify-between">
                <div>
                  <p className="section-kicker !text-[var(--campaign-accent)]">Your first batch</p>
                  <h2 className="mt-2 font-editorial text-3xl text-white">Choose 10 shows</h2>
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#789486]/20 text-[#b8d0c4]">
                  <Target className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">
                Start with the shows you would genuinely enjoy. Your choices help us sharpen every pitch that follows.
              </p>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <span className="font-editorial text-5xl text-white">{firstBatchApproved}</span>
                  <span className="ml-1 text-lg text-white/40">/ {SHORTLIST_GOAL}</span>
                </div>
                <span className="pb-1 text-sm font-semibold text-[#b8d0c4]">
                  {Math.max(0, SHORTLIST_GOAL - firstBatchApproved)} to go
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#789486] to-[var(--campaign-accent)] transition-all duration-500"
                  style={{ width: shortlistProgress + '%' }}
                />
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/48">
                <span>{reviewedTopMatches} of {topMatches.length} top matches reviewed</span>
                {feedbackStats.rejected > 0 ? <span>{feedbackStats.rejected} not a fit</span> : null}
              </div>
            </aside>
          </div>

          <div className="grid grid-cols-2 border-t border-white/10 sm:grid-cols-4">
            {[
              { icon: ThumbsUp, label: 'Choose shows', detail: 'You stay in control' },
              { icon: Send, label: 'Your team pitches hosts', detail: 'Personalized outreach' },
              { icon: CalendarCheck, label: 'Approve dates', detail: 'No calendar chaos' },
              { icon: Radio, label: 'Episodes go live', detail: 'Track every result' },
            ].map((step, index) => (
              <div key={step.label} className={cn('flex gap-3 px-3 py-5 sm:px-5', index > 0 && 'border-l border-white/10')}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8 text-[var(--campaign-accent)]">
                  <step.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-0.5 hidden text-xs text-white/40 lg:block">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main id="podcast-shortlist" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <section aria-labelledby="shortlist-heading">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="section-kicker text-[var(--campaign-accent)]">Curated for your voice</p>
              <h2 id="shortlist-heading" className="mt-2 font-editorial text-3xl tracking-tight text-[#102033] sm:text-4xl">
                {dashboardView === 'top' ? 'Start with your strongest matches' : dashboardView === 'picks' ? 'Shows you are interested in' : 'Explore every opportunity'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b76] sm:text-base">
                {dashboardView === 'top'
                  ? 'A focused first pass, ordered around relevance and the quality of the opportunity.'
                  : dashboardView === 'picks'
                    ? 'Your positive choices in one place. These become the starting point for outreach.'
                    : 'Search the complete curated library when you want to go beyond the recommended first batch.'}
              </p>
            </div>
            <Button
              type="button"
              onClick={startFocusedReview}
              disabled={sortedPodcasts.length === 0}
              className="min-h-11 shrink-0 gap-2 rounded-full bg-[var(--campaign-primary)] px-5 text-[var(--campaign-primary-foreground)] hover:brightness-95"
            >
              <Play className="h-4 w-4 fill-current" />
              Focused review · {focusedReviewViewLabel}
            </Button>
          </div>

          <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-[#d9d0c4] bg-white p-1.5 shadow-sm" role="tablist" aria-label="Podcast views">
            {[
              { value: 'top' as DashboardView, label: 'Top matches', count: topMatches.length, icon: Sparkles },
              { value: 'all' as DashboardView, label: 'Explore all', count: uniquePodcasts.length, icon: Library },
              { value: 'picks' as DashboardView, label: 'My picks', count: feedbackStats.approved, icon: ThumbsUp },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={dashboardView === tab.value}
                onClick={() => {
                  setDashboardView(tab.value)
                  setFeedbackFilter('all')
                }}
                className={cn(
                  'flex min-h-11 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 text-[11px] font-semibold transition sm:gap-2 sm:px-5 sm:text-sm',
                  dashboardView === tab.value
                    ? 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] shadow-sm'
                    : 'text-[#66727c] hover:bg-[#f5f0e9] hover:text-[#102033]',
                )}
              >
                <tab.icon className="hidden h-4 w-4 sm:block" />
                {tab.label}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-[11px]', dashboardView === tab.value ? 'bg-white/12' : 'bg-[#eee8df]')}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search podcasts</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a858e]" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search shows, hosts, or topics"
                className="h-12 rounded-xl border-[#d9d0c4] bg-white pl-11 text-base shadow-sm focus-visible:ring-[var(--campaign-accent)]"
              />
            </label>
            <label className="relative w-full sm:w-auto">
              <span className="sr-only">Sort podcasts</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                className="h-12 w-full appearance-none rounded-xl border border-[#d9d0c4] bg-white py-2 pl-4 pr-10 text-sm font-medium text-[#344455] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--campaign-accent)] sm:min-w-[190px]"
              >
                <option value="default">Recommended order</option>
                <option value="audience_desc">Largest audience</option>
                <option value="audience_asc">Emerging shows first</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a858e]" />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(true)}
              className="h-12 gap-2 rounded-xl border-[#d9d0c4] bg-white px-5 text-[#344455] shadow-sm hover:bg-[#fbf8f3]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 ? <span className="rounded-full bg-[var(--campaign-primary)] px-2 py-0.5 text-[11px] text-[var(--campaign-primary-foreground)]">{activeFilterCount}</span> : null}
            </Button>
          </div>

          {hasActiveFilters ? (
            <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[#66727c]">
              <p>{sortedPodcasts.length} result{sortedPodcasts.length === 1 ? '' : 's'} in this view</p>
              <button type="button" onClick={clearFilters} className="min-h-10 font-semibold text-[var(--campaign-accent)] hover:brightness-75">
                Clear filters
              </button>
            </div>
          ) : null}

          {secondaryError && !loadingPodcasts && (
            <div className="mt-7 flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p>Your shows could not be loaded just now. Everything you have already approved is safe.</p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => { void refetchPodcasts() }}
              >
                Try again
              </Button>
            </div>
          )}

          {loadingPodcasts ? (
            <div className="mt-7 grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-64 animate-pulse rounded-3xl border border-[#ded5ca] bg-white" />
              ))}
            </div>
          ) : sortedPodcasts.length === 0 ? (
            <Card className="mt-7 border-[#ded5ca] bg-white shadow-sm">
              <CardContent className="px-6 py-14 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0ebe3] text-[#8d6a55]">
                  {dashboardView === 'picks' ? <ThumbsUp className="h-6 w-6" /> : <Search className="h-6 w-6" />}
                </span>
                <h3 className="mt-4 font-editorial text-2xl text-[#102033]">
                  {dashboardView === 'picks' ? 'Your picks will appear here' : 'No matching podcasts'}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#66727c]">
                  {dashboardView === 'picks'
                    ? 'Mark a show as Interested and it will become part of your outreach shortlist.'
                    : 'Try removing a filter or searching for a broader topic.'}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    clearFilters()
                    setDashboardView('top')
                  }}
                  className="mt-5 min-h-11 rounded-full bg-[var(--campaign-primary)] px-5 text-[var(--campaign-primary-foreground)] hover:brightness-95"
                >
                  Browse top matches
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mt-7 grid gap-4 lg:grid-cols-2">
                {paginatedPodcasts.map((podcast) => {
                  const feedback = feedbackMap.get(podcast.podcast_id)
                  const fitReason = podcast.ai_fit_reasons?.[0]
                    || analysisCache.get(podcast.podcast_id)?.fit_reasons?.[0]
                    || 'Selected for the overlap between your expertise and this show’s audience.'
                  const topMatchIndex = topMatches.findIndex((candidate) => candidate.podcast_id === podcast.podcast_id)
                  const lastPostedDate = podcast.last_posted_at ? new Date(podcast.last_posted_at) : null
                  const lastPostedLabel = lastPostedDate && !Number.isNaN(lastPostedDate.getTime())
                    ? formatDistanceToNow(lastPostedDate, { addSuffix: true })
                    : null

                  return (
                    <Card
                      key={podcast.podcast_id}
                      className={cn(
                        'overflow-hidden rounded-3xl border-[#ded5ca] bg-white shadow-[0_14px_40px_rgba(16,32,51,.06)] transition duration-300 hover:-translate-y-0.5 hover:border-[#c6b8a8] hover:shadow-[0_18px_46px_rgba(16,32,51,.1)]',
                        feedback?.status === 'approved' && 'border-[#9ab4a7] ring-1 ring-[#9ab4a7]/50',
                      )}
                    >
                      <CardContent className="p-0">
                        <button
                          type="button"
                          onClick={() => setSelectedPodcast(podcast)}
                          className="group flex w-full gap-4 p-4 text-left sm:gap-5 sm:p-5"
                          aria-label={'View details for ' + podcast.podcast_name}
                        >
                          <PodcastArtwork podcast={podcast} className="h-24 w-24 shrink-0 rounded-2xl shadow-md sm:h-32 sm:w-32" decorative />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                {topMatchIndex >= 0 ? (
                                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--campaign-accent)]">Top match #{topMatchIndex + 1}</p>
                                ) : null}
                                <h3 className="mt-1 line-clamp-2 font-editorial text-xl leading-tight text-[#102033] transition group-hover:text-[var(--campaign-accent)] sm:text-2xl">
                                  {podcast.podcast_name}
                                </h3>
                              </div>
                              {feedback?.status ? (
                                <span className={cn(
                                  'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                                  feedback.status === 'approved'
                                    ? 'bg-[#e5efe9] text-[#476b59]'
                                    : 'bg-[#f1ece6] text-[#74675f]',
                                )}>
                                  {feedback.status === 'approved' ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                                  <span className="hidden sm:inline">{feedback.status === 'approved' ? 'Interested' : 'Not a fit'}</span>
                                </span>
                              ) : null}
                            </div>
                            {podcast.publisher_name ? <p className="mt-1 truncate text-xs text-[#78828a]">with {podcast.publisher_name}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-[#53616d]">
                              {podcast.audience_size ? <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-[#789486]" />{formatNumber(podcast.audience_size)} est. listeners</span> : null}
                              {podcast.itunes_rating ? <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 fill-[#d69b52] text-[#d69b52]" />{Number(podcast.itunes_rating).toFixed(1)}</span> : null}
                              {lastPostedLabel ? <span className="hidden items-center gap-1.5 sm:flex"><Clock className="h-3.5 w-3.5" />Active {lastPostedLabel}</span> : null}
                            </div>
                          </div>
                        </button>

                        <div className="border-t border-[#eee8e0] px-4 py-3 sm:px-5">
                          <div className="mb-3 flex items-start gap-2 text-xs leading-5 text-[#5e6c77]">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--campaign-accent)]" />
                            <p className="line-clamp-2">{fitReason}</p>
                          </div>
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isSavingFeedback}
                              onClick={() => saveFeedback(podcast.podcast_id, 'approved', undefined, podcast.podcast_name)}
                              className={cn(
                                'min-h-11 gap-2 rounded-xl border-[#d8dfda] text-xs font-bold sm:text-sm',
                                feedback?.status === 'approved'
                                  ? 'border-[#668b78] bg-[#668b78] text-white hover:bg-[#587765] hover:text-white'
                                  : 'bg-[#f4f8f5] text-[#476b59] hover:border-[#789486] hover:bg-[#e7f0ea]',
                              )}
                            >
                              <ThumbsUp className="h-4 w-4" />
                              Interested
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={isSavingFeedback}
                              onClick={() => saveFeedback(podcast.podcast_id, 'rejected', undefined, podcast.podcast_name)}
                              className={cn(
                                'min-h-11 gap-2 rounded-xl border-[#ddd5cd] text-xs font-bold sm:text-sm',
                                feedback?.status === 'rejected'
                                  ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                                  : 'bg-[#fbf8f4] text-[#6c625c] hover:border-[#a99588] hover:bg-[#f1ebe4]',
                              )}
                            >
                              <ThumbsDown className="h-4 w-4" />
                              Not a fit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setSelectedPodcast(podcast)}
                              className="min-h-11 rounded-xl px-3 text-[#62707c] hover:bg-[#f2ede6] hover:text-[#102033]"
                              aria-label={'Why ' + podcast.podcast_name + ' fits'}
                            >
                              <ChevronRight className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {totalPages > 1 ? (
                <nav className="mt-8 flex items-center justify-between rounded-2xl border border-[#ded5ca] bg-white p-2 shadow-sm" aria-label="Podcast pages">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    className="min-h-11 gap-2 rounded-xl"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <p className="text-sm font-medium text-[#66727c]">Page <span className="text-[#102033]">{currentPage}</span> of {totalPages}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    className="min-h-11 gap-2 rounded-xl"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </section>

        <section
          className="mt-16 overflow-hidden rounded-[32px] text-white shadow-[0_24px_70px_rgba(16,32,51,.14)]"
          style={{ background: `linear-gradient(rgba(7,18,31,.58), rgba(7,18,31,.72)), ${brandPrimaryColor}` }}
        >
          <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative overflow-hidden border-b border-white/10 p-7 sm:p-9 lg:border-b-0 lg:border-r">
              <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--campaign-accent)] opacity-20 blur-3xl" />
              <p className="section-kicker !text-[var(--campaign-accent)]">{isAdminPreview ? 'A campaign built around you' : 'What happens next'}</p>
              <h2 className="relative mt-3 max-w-lg font-editorial text-3xl leading-tight sm:text-4xl">
                Your picks become a campaign—not another spreadsheet.
              </h2>
              <p className="relative mt-4 max-w-lg text-sm leading-6 text-white/60 sm:text-base">
                {brandName} researches the host, writes the angle, manages outreach, coordinates dates, and keeps every opportunity visible from pitch to published episode.
              </p>
              {isAdminPreview ? (
                <Button
                  type="button"
                  onClick={() => {
                    setTutorialStep(0)
                    setShowTutorial(true)
                  }}
                  className="relative mt-6 min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 text-[var(--campaign-accent-foreground)] hover:brightness-95"
                >
                  Preview the client walkthrough
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setDashboardView('picks')
                    document.getElementById('podcast-shortlist')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="relative mt-6 min-h-12 gap-2 rounded-full bg-[var(--campaign-accent)] px-6 text-[var(--campaign-accent-foreground)] hover:brightness-95"
                >
                  Review my picks
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-px bg-white/10 sm:grid-cols-3">
              {[
                { icon: WandSparkles, title: 'Personalized outreach', text: 'Every pitch is written for the show and host—not sprayed from a template.' },
                { icon: CalendarCheck, title: 'Booking visibility', text: 'See upcoming recordings, scheduled appearances, and what is going live next.' },
                { icon: LineChart, title: 'Clips & analytics', text: 'Turn appearances into content and track campaign impact as optional add-ons.' },
              ].map((feature, index) => (
                <div key={feature.title} className="bg-black/10 p-6 sm:p-7">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-[var(--campaign-accent)]">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <p className="mt-5 font-editorial text-xl">{feature.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/52">{feature.text}</p>
                  {index === 2 ? <span className="mt-4 inline-flex rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/45">Available add-on</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#d9d0c4] bg-[#ede6dc]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#344455]">
            {brandLogoUrl ? (
              <img src={brandLogoUrl} alt="" className="h-7 w-10 object-contain" onError={() => setBrandLogoUnavailable(true)} />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black text-white" style={{ backgroundColor: brandPrimaryColor }}>
                {onboardingWorkspaceInitials(brandName)}
              </span>
            )}
            {brandName}
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6f7a83]">
            <button type="button" onClick={() => setShowReviewPanel(true)} className="min-h-10 hover:text-[#102033]">About the data</button>
            <button
              type="button"
              onClick={() => {
                setTutorialStep(0)
                setShowTutorial(true)
              }}
              className="min-h-10 hover:text-[#102033]"
            >
              How it works
            </button>
            <button type="button" onClick={shareDashboard} className="min-h-10 hover:text-[#102033]">Share dashboard</button>
            {slug && (
              <a href={`/portal/login?b=${encodeURIComponent(slug)}`} className="min-h-10 leading-10 hover:text-[#102033]">
                Client portal sign-in
              </a>
            )}
          </div>
        </div>
      </footer>

      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l-[#ded5ca] bg-[#fbf8f3] sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle className="font-editorial text-3xl text-[#102033]">Refine the list</SheetTitle>
            <p className="text-sm leading-6 text-[#66727c]">Use only what helps. Your top matches remain the recommended place to begin.</p>
          </SheetHeader>

          <div className="mt-7 space-y-7">
            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Your decision</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { value: 'all' as FeedbackFilter, label: 'Any status', count: uniquePodcasts.length },
                  { value: 'not_reviewed' as FeedbackFilter, label: 'To review', count: feedbackStats.notReviewed },
                  { value: 'approved' as FeedbackFilter, label: 'Interested', count: feedbackStats.approved },
                  { value: 'rejected' as FeedbackFilter, label: 'Not a fit', count: feedbackStats.rejected },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFeedbackFilter(option.value)}
                    className={cn(
                      'flex min-h-12 items-center justify-between rounded-xl border px-3 text-left text-sm font-semibold transition',
                      feedbackFilter === option.value
                        ? 'border-[var(--campaign-primary)] bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)]'
                        : 'border-[#d9d0c4] bg-white text-[#52616d] hover:border-[#bcae9e]',
                    )}
                  >
                    {option.label}
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px]', feedbackFilter === option.value ? 'bg-white/12' : 'bg-[#f0ebe4]')}>{option.count}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Audience size</legend>
              <select
                value={audienceFilter}
                onChange={(event) => setAudienceFilter(event.target.value)}
                className="mt-3 h-12 w-full rounded-xl border border-[#d9d0c4] bg-white px-3 text-sm text-[#344455] focus:outline-none focus:ring-2 focus:ring-[var(--campaign-accent)]"
              >
                <option value="any">Any audience estimate</option>
                <option value="under1k">Under 1K</option>
                <option value="1kto5k">1K–5K</option>
                <option value="5kto10k">5K–10K</option>
                <option value="10kto25k">10K–25K</option>
                <option value="25kto50k">25K–50K</option>
                <option value="50kto100k">50K–100K</option>
                <option value="100kplus">100K+</option>
              </select>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Show depth</legend>
              <select
                value={episodeFilter}
                onChange={(event) => setEpisodeFilter(event.target.value)}
                className="mt-3 h-12 w-full rounded-xl border border-[#d9d0c4] bg-white px-3 text-sm text-[#344455] focus:outline-none focus:ring-2 focus:ring-[var(--campaign-accent)]"
              >
                <option value="any">Any episode count</option>
                <option value="under50">Under 50 episodes</option>
                <option value="50to100">50–100 episodes</option>
                <option value="100to200">100–200 episodes</option>
                <option value="200plus">200+ episodes</option>
              </select>
            </fieldset>

            {allCategories.length > 0 ? (
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b685a]">Topics</legend>
                <div className="mt-3 flex max-h-56 flex-wrap content-start gap-2 overflow-y-auto pr-1">
                  {allCategories.map((category) => {
                    const selected = selectedCategories.includes(category.category_id)
                    return (
                      <button
                        key={category.category_id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedCategories((current) => (
                          selected
                            ? current.filter((categoryId) => categoryId !== category.category_id)
                            : [...current, category.category_id]
                        ))}
                        className={cn(
                          'min-h-10 rounded-full border px-3 text-xs font-semibold transition',
                          selected
                            ? 'border-[var(--campaign-accent)] bg-white text-[var(--campaign-accent)]'
                            : 'border-[#d9d0c4] bg-white text-[#596772] hover:border-[#bcae9e]',
                        )}
                      >
                        {category.category_name}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}
          </div>

          <div className="sticky bottom-0 mt-8 grid grid-cols-2 gap-2 border-t border-[#ded5ca] bg-[#fbf8f3] py-4">
            <Button type="button" variant="outline" onClick={clearFilters} className="min-h-12 rounded-xl border-[#d9d0c4] bg-white">
              Reset
            </Button>
            <Button type="button" onClick={() => setShowFilters(false)} className="min-h-12 rounded-xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95">
              Show {sortedPodcasts.length} results
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showFocusedReview} onOpenChange={setShowFocusedReview}>
        <DialogContent
          className="max-h-[94vh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-[28px] border-0 bg-[#fbf8f3] p-0 pb-32 shadow-2xl sm:w-[calc(100%-2rem)] sm:pb-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const content = event.currentTarget as HTMLElement
            window.requestAnimationFrame(() => {
              content.scrollTop = 0
              content.focus({ preventScroll: true })
            })
          }}
        >
          {focusedPodcast ? (
            <div>
              <div className="flex items-center justify-between border-b border-[#e2d9ce] px-5 py-4 pr-14 sm:px-7">
                <div>
                  <DialogTitle className="font-editorial text-2xl text-[#102033]">Focused review</DialogTitle>
                  <DialogDescription className="sr-only">Review one podcast at a time from {focusedReviewViewLabel} and mark whether you are interested.</DialogDescription>
                  <p className="mt-0.5 text-xs text-[#74808a]">{focusedReviewViewLabel} · Match {reviewIndex + 1} of {focusedReviewPodcasts.length} · {focusedReviewedCount} reviewed</p>
                </div>
                <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-[#e6ded4] sm:block">
                  <div className="h-full rounded-full bg-[var(--campaign-accent)]" style={{ width: ((reviewIndex + 1) / Math.max(focusedReviewPodcasts.length, 1)) * 100 + '%' }} />
                </div>
              </div>

              <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b border-[#e2d9ce] p-5 sm:p-7 lg:border-b-0 lg:border-r">
                  <PodcastArtwork podcast={focusedPodcast} className="aspect-[16/10] w-full rounded-3xl shadow-[0_18px_50px_rgba(16,32,51,.16)] lg:aspect-square" />
                  <dl className="mt-5 grid grid-cols-3 divide-x divide-[#e2d9ce] rounded-2xl border border-[#e2d9ce] bg-white py-3 text-center">
                    <div className="px-2">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[#7b858d]">Listeners</dt>
                      <dd className="mt-1 font-editorial text-xl text-[#102033]">{focusedPodcast.audience_size ? formatNumber(focusedPodcast.audience_size) : '—'}</dd>
                    </div>
                    <div className="px-2">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[#7b858d]">Rating</dt>
                      <dd className="mt-1 font-editorial text-xl text-[#102033]">{focusedPodcast.itunes_rating ? Number(focusedPodcast.itunes_rating).toFixed(1) : '—'}</dd>
                    </div>
                    <div className="px-2">
                      <dt className="text-[9px] font-bold uppercase tracking-wider text-[#7b858d]">Episodes</dt>
                      <dd className="mt-1 font-editorial text-xl text-[#102033]">{focusedPodcast.episode_count || '—'}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-col p-5 sm:p-7">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--campaign-accent)]">Recommended for {dashboard.name}</p>
                  <h2 className="mt-2 font-editorial text-3xl leading-tight text-[#102033] sm:text-4xl">{focusedPodcast.podcast_name}</h2>
                  {focusedPodcast.publisher_name ? <p className="mt-1 text-sm text-[#74808a]">with {focusedPodcast.publisher_name}</p> : null}

                  <div className="mt-6 rounded-2xl border border-[#ead8cc] bg-[#f8eade] p-4 sm:p-5">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#8d4b2f]">
                      <Sparkles className="h-4 w-4" />
                      Why it fits
                    </p>
                    <ul className="mt-3 space-y-3">
                      {(focusedPodcast.ai_fit_reasons?.length
                        ? focusedPodcast.ai_fit_reasons
                        : ['The show aligns with your expertise and gives you room for a useful, credible conversation.'])
                        .slice(0, 2)
                        .map((reason) => (
                          <li key={reason} className="flex gap-3 text-sm leading-6 text-[#5d514a]">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#668b78]" />
                            <span className="line-clamp-3">{reason}</span>
                          </li>
                        ))}
                    </ul>
                  </div>

                  <p className="mt-5 hidden text-sm leading-6 text-[#66727c] sm:line-clamp-3">
                    {focusedPodcast.ai_clean_description || focusedPodcast.podcast_description || 'Open the full show profile for audience details, topics, and pitch angles.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFocusedReview(false)
                      setSelectedPodcast(focusedPodcast)
                    }}
                    className="mt-3 hidden min-h-11 items-center gap-1 self-start text-sm font-bold text-[var(--campaign-accent)] hover:brightness-75 sm:inline-flex"
                  >
                    Open full show profile
                    <ArrowUpRight className="h-4 w-4" />
                  </button>

                  <div className="absolute inset-x-0 bottom-0 z-20 mt-auto border-t border-[#ded5ca] bg-white p-3 shadow-[0_-12px_28px_rgba(16,32,51,.08)] sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:pt-5 sm:shadow-none">
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSavingFeedback}
                        onClick={() => handleFocusedDecision('rejected')}
                        className={cn(
                          'min-h-14 gap-2 rounded-2xl border-[#d8cec4] text-sm font-bold',
                          feedbackMap.get(focusedPodcast.podcast_id)?.status === 'rejected'
                            ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                            : 'bg-white text-[#665d57] hover:bg-[#f2ece5]',
                        )}
                      >
                        <ThumbsDown className="h-5 w-5" />
                        Not a fit
                      </Button>
                      <Button
                        type="button"
                        disabled={isSavingFeedback}
                        onClick={() => handleFocusedDecision('approved')}
                        className={cn(
                          'min-h-14 gap-2 rounded-2xl text-sm font-bold',
                          feedbackMap.get(focusedPodcast.podcast_id)?.status === 'approved'
                            ? 'bg-[#668b78] text-white hover:bg-[#587765]'
                            : 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95',
                        )}
                      >
                        {isSavingFeedback ? <Loader2 className="h-5 w-5 animate-spin" /> : <ThumbsUp className="h-5 w-5" />}
                        Interested
                      </Button>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={reviewIndex === 0}
                        onClick={() => setReviewIndex((index) => Math.max(0, index - 1))}
                        className="min-h-10 gap-1 text-[#6e7982]"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </Button>
                      {feedbackMap.get(focusedPodcast.podcast_id)?.status ? (
                        <button
                          type="button"
                          disabled={isSavingFeedback}
                          onClick={() => saveFeedback(focusedPodcast.podcast_id, null, undefined, focusedPodcast.podcast_name)}
                          className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#7b858d] hover:text-[#102033]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Clear choice
                        </button>
                      ) : <span />}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={reviewIndex >= focusedReviewPodcasts.length - 1}
                        onClick={() => setReviewIndex((index) => Math.min(focusedReviewPodcasts.length - 1, index + 1))}
                        className="min-h-10 gap-1 text-[#6e7982]"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-10 text-center">
              <DialogTitle className="font-editorial text-2xl text-[#102033]">No podcasts match this view yet</DialogTitle>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Data Methodology Panel */}
      <Sheet open={showReviewPanel} onOpenChange={setShowReviewPanel}>
        <SheetContent side="right" className="!w-full overflow-hidden border-l-[#ded5ca] bg-[#fbf8f3] p-0 sm:!max-w-lg">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b border-[#ded5ca] bg-[var(--campaign-primary)] p-6 text-[var(--campaign-primary-foreground)]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-editorial text-2xl text-white">
                  <BarChart3 className="h-5 w-5 text-[var(--campaign-accent)]" />
                  Understanding the estimates
                </SheetTitle>
              </SheetHeader>
              <p className="mt-2 text-sm text-white/55">
                What the numbers mean, where they come from, and how to use them.
              </p>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Key Highlight */}
                <div className="rounded-2xl border border-[#d8dfda] bg-[#edf4ef] p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-[#668b78]/15 p-2">
                      <Info className="h-5 w-5 text-[#476b59]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#355745]">Directional, responsibly labeled</p>
                      <p className="mt-1 text-sm leading-6 text-[#557164]">
                        Audience numbers are <span className="font-medium">estimated listeners per episode</span>. They are most useful for comparing opportunities—not as exact download counts.
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
                      { icon: BarChart3, label: 'Chart rankings' },
                      { icon: Star, label: 'Review volume' },
                      { icon: Users, label: 'Social following' },
                      { icon: TrendingUp, label: 'Engagement signals' },
                      { icon: Target, label: 'Category performance' },
                      { icon: CalendarCheck, label: 'Publishing frequency' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-[#e5ded5] bg-white p-2.5 text-sm">
                        <item.icon className="h-4 w-4 shrink-0 text-[var(--campaign-accent)]" />
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
                      <p className="text-sm text-muted-foreground">Audience estimates combine public chart, review, social, and publishing signals from major podcast platforms.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">2</div>
                      <p className="text-sm text-muted-foreground">Our models compare those signals with shows whose performance is already known.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600">3</div>
                      <p className="text-sm text-muted-foreground">Known audience figures are used as benchmarks whenever they are available.</p>
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
                      'Balance audience relevance with potential reach',
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
                    <span className="font-semibold">Important:</span> Only a podcast publisher can see exact downloads. Treat these figures as directional benchmarks alongside topic fit, host style, and guest quality.
                  </p>
                </div>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t bg-slate-50 dark:bg-slate-900">
              <Button
                className="min-h-12 w-full rounded-xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95"
                onClick={() => setShowReviewPanel(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Side Panel */}
      <Sheet open={!!selectedPodcast} onOpenChange={() => setSelectedPodcast(null)}>
        <SheetContent className="!w-full overflow-hidden overflow-x-hidden border-l-0 bg-[#fbf8f3] p-0 shadow-2xl sm:!max-w-xl">
          {selectedPodcast && (
            <div className="flex h-full flex-col">
              {/* Hero Header with Image */}
              <div className="relative h-44 sm:h-64 overflow-hidden flex-shrink-0">
                <PodcastArtwork podcast={selectedPodcast} className="h-full w-full" />
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
                  aria-label="Close show profile"
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

                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f1bc9e]">Full show profile</p>
                  <h2 className="mb-1 line-clamp-2 font-editorial text-2xl text-white sm:text-3xl">{selectedPodcast.podcast_name}</h2>
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
                    <p className="text-[10px] sm:text-xs text-white/60 uppercase tracking-wide">Est. listeners</p>
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
                  {dashboard.bio && (
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

                  <div className="mt-6 border-t border-[#e3dbd2] pt-6">
                    <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#71808b] sm:text-xs">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Note for your campaign team
                    </h3>
                    <Textarea
                      aria-label="Note for your campaign team"
                      placeholder="Questions, preferences, or context your team should know..."
                      value={currentNotes}
                      onChange={(event) => setCurrentNotes(event.target.value)}
                      className="min-h-[92px] resize-none rounded-xl border-[#d9d0c4] bg-white text-sm focus-visible:ring-[var(--campaign-accent)]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-[#7b858d]">Private to you and your campaign team.</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const existing = feedbackMap.get(selectedPodcast.podcast_id)
                          saveFeedback(selectedPodcast.podcast_id, existing?.status || null, currentNotes)
                        }}
                        disabled={isSavingFeedback || currentNotes === (feedbackMap.get(selectedPodcast.podcast_id)?.notes || '')}
                        className="min-h-10 gap-2 rounded-xl border-[#d9d0c4] bg-white"
                      >
                        {isSavingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save note
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex-shrink-0 border-t border-[#ded5ca] bg-white p-3 shadow-[0_-12px_28px_rgba(16,32,51,.06)] sm:p-4">
                <div className="mb-2 flex min-h-6 items-center justify-between px-1 text-xs">
                  <span className="font-semibold text-[#66727c]">Would you want to be a guest?</span>
                  {feedbackMap.get(selectedPodcast.podcast_id)?.status ? (
                    <button
                      type="button"
                      disabled={isSavingFeedback}
                      onClick={() => saveFeedback(selectedPodcast.podcast_id, null, undefined, selectedPodcast.podcast_name)}
                      className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-[#7b858d] hover:text-[#102033]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Clear choice
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSavingFeedback}
                    onClick={() => saveFeedback(selectedPodcast.podcast_id, 'rejected', undefined, selectedPodcast.podcast_name)}
                    className={cn(
                      'min-h-12 gap-2 rounded-xl border-[#d8cec4] font-bold',
                      feedbackMap.get(selectedPodcast.podcast_id)?.status === 'rejected'
                        ? 'border-[#78685f] bg-[#78685f] text-white hover:bg-[#665850] hover:text-white'
                        : 'bg-[#fbf8f4] text-[#665d57] hover:bg-[#f2ece5]',
                    )}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Not a fit
                  </Button>
                  <Button
                    type="button"
                    disabled={isSavingFeedback}
                    onClick={() => saveFeedback(selectedPodcast.podcast_id, 'approved', undefined, selectedPodcast.podcast_name)}
                    className={cn(
                      'min-h-12 gap-2 rounded-xl font-bold',
                      feedbackMap.get(selectedPodcast.podcast_id)?.status === 'approved'
                        ? 'bg-[#668b78] text-white hover:bg-[#587765]'
                        : 'bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95',
                    )}
                  >
                    {isSavingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                    Interested
                  </Button>
                </div>
              </div>

            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Tutorial Stepper Modal */}
      <Dialog open={showTutorial} onOpenChange={(open) => !open && closeTutorial()}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-[28px] border-[#ded5ca] bg-[#fbf8f3] p-0">
          <VisuallyHidden>
            <DialogTitle>How to Use Your Dashboard</DialogTitle>
            <DialogDescription>A short introduction to reviewing and choosing podcast opportunities.</DialogDescription>
          </VisuallyHidden>

          {/* Step Content */}
          <div className="relative">
            {/* Step 0: Welcome */}
            {tutorialStep === 0 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] sm:mb-4 sm:h-16 sm:w-16">
                  <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">Your podcast campaign</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
                  {brandName} curated these shows around your expertise, audience, and goals. You choose where you would feel excited to appear.
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
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#668b78] sm:mb-4 sm:h-16 sm:w-16">
                  <Search className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">Start with top matches</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Review a manageable first batch, then explore the full library whenever you want more options.
                </p>
                <div className="bg-muted/50 rounded-xl p-3 sm:p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                    <span>Use Focused review to make one clear choice at a time</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
                    <span>Search and filters are available for deeper exploration</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: View AI Insights */}
            {tutorialStep === 2 && (
              <div className="p-5 sm:p-8 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--campaign-accent)] text-[var(--campaign-accent-foreground)] sm:mb-4 sm:h-16 sm:w-16">
                  <MousePointerClick className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">See why each show fits</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Open a show profile for the recommendation rationale, audience signals, possible angles, and show history.
                </p>
                <div className="bg-muted/50 rounded-xl p-3 sm:p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs sm:text-sm">
                    <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 shrink-0" />
                    <span><strong>Why it fits</strong> — The real overlap with your expertise</span>
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
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#789486] sm:mb-4 sm:h-16 sm:w-16">
                  <ListChecks className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">Make a simple choice</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  For each podcast, let us know if it's a good fit for you.
                </p>
                <div className="flex justify-center gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                    <ThumbsUp className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base font-medium">Interested</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    <ThumbsDown className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-sm sm:text-base font-medium">Not a fit</span>
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
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] sm:mb-4 sm:h-16 sm:w-16">
                  <Rocket className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <h2 className="mb-2 font-editorial text-2xl text-[#102033] sm:text-3xl">Your team takes it from here</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                  Your interested shows become the foundation for personalized outreach, booking coordination, and campaign tracking.
                </p>
                <div className="bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-xl p-3 sm:p-4 border border-primary/20">
                  <p className="text-xs sm:text-sm font-medium text-primary">
                    Start with 10 strong choices. Quality signals help us pitch you more convincingly.
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
                <Button onClick={() => setTutorialStep(tutorialStep + 1)} className="gap-1 bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95">
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={closeTutorial} className="gap-1 bg-[var(--campaign-primary)] text-[var(--campaign-primary-foreground)] hover:brightness-95">
                  Start reviewing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
