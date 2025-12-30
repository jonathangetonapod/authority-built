import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { AddonUpsellBanner } from '@/components/portal/AddonUpsellBanner'
import { UpgradeHeroBanner } from '@/components/portal/UpgradeHeroBanner'
import { getActiveAddonServices, getBookingAddons } from '@/services/addonServices'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { createCalendarEventFromBooking, openGoogleCalendar } from '@/lib/googleCalendar'
import { toast } from 'sonner'
import {
  Calendar,
  CalendarPlus,
  User,
  Globe,
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  Video,
  CheckCheck,
  XCircle,
  MessageSquare,
  AlertCircle,
  Loader2,
  TrendingUp,
  Users,
  Download,
  Star,
  BarChart3,
  ArrowUpDown,
  Trophy,
  ChevronLeft,
  ChevronRight,
  Target,
  Bell,
  Share2,
  FileText,
  ShoppingCart,
  Award,
  Filter,
  Mic,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  RefreshCw
} from 'lucide-react'
import { BarChart, Bar, LineChart, Line, ComposedChart, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getClientBookings } from '@/services/clientPortal'
import type { Booking } from '@/services/bookings'
import { getActivePremiumPodcasts, type PremiumPodcast } from '@/services/premiumPodcasts'
import { getClientOutreachPodcasts, type OutreachPodcast } from '@/services/googleSheets'
import { useCartStore } from '@/stores/cartStore'
import { toast as sonnerToast } from 'sonner'
import { CartButton } from '@/components/CartButton'
import { CartDrawer } from '@/components/CartDrawer'
import { PODCAST_CATEGORIES } from '@/lib/categories'

type TimeRange = 7 | 14 | 30 | 60 | 90 | 'all'

const AUDIENCE_TIERS = [
  { label: "All Sizes", value: "all", min: 0, max: Infinity },
  { label: "Small (0-25K)", value: "small", min: 0, max: 25000 },
  { label: "Medium (25K-50K)", value: "medium", min: 25000, max: 50000 },
  { label: "Large (50K-100K)", value: "large", min: 50000, max: 100000 },
  { label: "Mega (100K+)", value: "mega", min: 100000, max: Infinity },
]

const PRICE_RANGES = [
  { label: "All Prices", value: "all", min: 0, max: Infinity },
  { label: "Under $1,000", value: "under1k", min: 0, max: 1000 },
  { label: "$1,000 - $2,500", value: "1k-2.5k", min: 1000, max: 2500 },
  { label: "$2,500 - $5,000", value: "2.5k-5k", min: 2500, max: 5000 },
  { label: "$5,000 - $10,000", value: "5k-10k", min: 5000, max: 10000 },
  { label: "$10,000+", value: "10k+", min: 10000, max: Infinity },
]

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function PortalDashboard() {
  const { client } = useClientPortal()
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'audience' | 'rating' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showCharts, setShowCharts] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>(30)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set())
  const [viewingDayBookings, setViewingDayBookings] = useState<{ date: Date; bookings: Booking[] } | null>(null)
  const [viewingOutreachPodcast, setViewingOutreachPodcast] = useState<OutreachPodcast | null>(null)
  const [outreachPage, setOutreachPage] = useState(1)
  const outreachPerPage = 12

  // Premium Placements state
  const [premiumSearchQuery, setPremiumSearchQuery] = useState('')
  const [premiumSortBy, setPremiumSortBy] = useState('featured')
  const [expandedPremiumCards, setExpandedPremiumCards] = useState<Set<string>>(new Set())
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedAudienceTier, setSelectedAudienceTier] = useState('all')
  const [selectedPriceRange, setSelectedPriceRange] = useState('all')
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<'3months' | '6months' | '1year' | 'all'>('6months')
  const { addItem, isInCart } = useCartStore()

  // Fetch bookings
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['client-bookings', client?.id],
    queryFn: () => getClientBookings(client!.id),
    enabled: !!client,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true, // Refetch when user focuses the tab
    refetchOnMount: true // Refetch when component mounts
  })

  // Fetch active addon services
  const { data: addonServices } = useQuery({
    queryKey: ['addon-services'],
    queryFn: () => getActiveAddonServices(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })

  // Fetch all client addons
  const { data: clientAddons } = useQuery({
    queryKey: ['client-addons', client?.id],
    queryFn: async () => {
      const { supabase } = await import('@/lib/supabase')
      const { data, error } = await supabase
        .from('booking_addons')
        .select(`
          *,
          service:addon_services(*)
        `)
        .eq('client_id', client!.id)

      if (error) throw error
      return data || []
    },
    enabled: !!client,
    staleTime: 0,
  })

  // Fetch booking addons for the viewing booking
  const { data: bookingAddons } = useQuery({
    queryKey: ['booking-addons', viewingBooking?.id],
    queryFn: () => getBookingAddons(viewingBooking!.id),
    enabled: !!viewingBooking,
    staleTime: 0,
  })

  // Fetch premium podcasts
  const { data: premiumPodcasts, isLoading: premiumLoading } = useQuery({
    queryKey: ['premium-podcasts'],
    queryFn: () => getActivePremiumPodcasts(),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  })

  // Fetch outreach podcasts from Google Sheet
  const { data: outreachData, isLoading: outreachLoading, error: outreachError, refetch: refetchOutreach } = useQuery({
    queryKey: ['outreach-podcasts', client?.id],
    queryFn: () => {
      console.log('[Dashboard] Fetching outreach podcasts for client:', client?.id)
      console.log('[Dashboard] Client has google_sheet_url:', !!client?.google_sheet_url)
      console.log('[Dashboard] Google Sheet URL:', client?.google_sheet_url)
      return getClientOutreachPodcasts(client!.id)
    },
    enabled: !!client?.id && !!client?.google_sheet_url,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true
  })

  // Reset outreach pagination when data changes
  useEffect(() => {
    if (outreachData?.podcasts) {
      setOutreachPage(1)
    }
  }, [outreachData?.total])

  // Debug logging
  console.log('[Dashboard] Client object:', client)
  console.log('[Dashboard] Client ID:', client?.id)
  console.log('[Dashboard] Client google_sheet_url:', client?.google_sheet_url)
  console.log('[Dashboard] Outreach query enabled:', !!client?.id && !!client?.google_sheet_url)
  console.log('[Dashboard] Outreach data:', outreachData)
  console.log('[Dashboard] Outreach loading:', outreachLoading)
  console.log('[Dashboard] Outreach error:', outreachError)

  // Log debug info if available
  if (outreachData && 'debug' in outreachData) {
    console.log('[Dashboard] 🔍 Debug info from Edge Function:', outreachData.debug)
  }

  // Helper functions for date filtering
  const getDateRange = () => {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const start = new Date()
    start.setHours(0, 0, 0, 0)

    if (timeRange !== 'all') {
      start.setDate(start.getDate() - timeRange)
    }

    return { start, end }
  }

  const isBookingInRange = (booking: Booking) => {
    if (timeRange === 'all') return true

    const { start, end } = getDateRange()

    // Check if any relevant date falls in range
    const dates = [
      booking.scheduled_date,
      booking.recording_date,
      booking.publish_date,
      booking.created_at
    ].filter(Boolean)

    return dates.some(dateStr => {
      if (!dateStr) return false
      const date = new Date(dateStr)
      return date >= start && date <= end
    })
  }

  // Filter bookings by time range
  const filteredByTimeRange = useMemo(() => {
    if (!bookings) return []
    return bookings.filter(isBookingInRange)
  }, [bookings, timeRange])

  const getDisplayDate = () => {
    if (timeRange === 'all') return 'All Time'
    return `Last ${timeRange} Days`
  }

  // Enhanced stats and data calculations
  const enhancedStats = useMemo(() => {
    if (!filteredByTimeRange) return null

    const now = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    // Upcoming recordings (next 30 days) - always use all bookings for upcoming
    const upcomingRecordings = (bookings || [])
      .filter(b => {
        if (!b.recording_date) return false
        const recordingDate = new Date(b.recording_date)
        return recordingDate >= now &&
               recordingDate <= thirtyDaysFromNow &&
               (b.status === 'booked' || b.status === 'in_progress' || b.status === 'conversation_started')
      })
      .sort((a, b) => new Date(a.recording_date!).getTime() - new Date(b.recording_date!).getTime())
      .slice(0, 5)

    // Going live soon (next 30 days) - always use all bookings for upcoming
    const goingLiveSoon = (bookings || [])
      .filter(b => {
        if (!b.publish_date) return false
        const publishDate = new Date(b.publish_date)
        return publishDate >= now && publishDate <= thirtyDaysFromNow
      })
      .sort((a, b) => new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime())
      .slice(0, 5)

    const totalAudienceReach = filteredByTimeRange.reduce((sum, b) => sum + (b.audience_size || 0), 0)
    const publishedBookings = filteredByTimeRange.filter(b => b.status === 'published')
    const avgRating = filteredByTimeRange.filter(b => b.itunes_rating).reduce((sum, b, _, arr) =>
      sum + (b.itunes_rating || 0) / arr.length, 0)

    const topPodcasts = [...filteredByTimeRange]
      .filter(b => b.audience_size)
      .sort((a, b) => (b.audience_size || 0) - (a.audience_size || 0))
      .slice(0, 5)

    const statusDistribution = [
      { name: 'In Progress', value: filteredByTimeRange.filter(b => b.status === 'in_progress').length, color: '#eab308' },
      { name: 'Booked', value: filteredByTimeRange.filter(b => b.status === 'booked').length, color: '#10b981' },
      { name: 'Recorded', value: filteredByTimeRange.filter(b => b.status === 'recorded').length, color: '#3b82f6' },
      { name: 'Published', value: filteredByTimeRange.filter(b => b.status === 'published').length, color: '#8b5cf6' },
      { name: 'Other', value: filteredByTimeRange.filter(b => !['booked', 'recorded', 'published', 'in_progress'].includes(b.status)).length, color: '#6b7280' }
    ].filter(item => item.value > 0)

    const audienceByPodcast = topPodcasts.map(b => ({
      name: b.podcast_name.length > 20 ? b.podcast_name.substring(0, 20) + '...' : b.podcast_name,
      audience: b.audience_size || 0,
      fullName: b.podcast_name
    }))

    return {
      totalAudienceReach,
      publishedCount: publishedBookings.length,
      avgRating: avgRating || 0,
      topPodcasts,
      statusDistribution,
      audienceByPodcast,
      upcomingRecordings,
      goingLiveSoon
    }
  }, [filteredByTimeRange, bookings])

  // Filter and sort bookings
  const filteredBookings = useMemo(() => {
    if (!filteredByTimeRange) return []

    let filtered = filteredByTimeRange.filter(booking => {
      const matchesStatus = statusFilter === 'all' || booking.status === statusFilter
      const matchesSearch = !searchQuery || booking.podcast_name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    })

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.scheduled_date || 0).getTime() - new Date(b.scheduled_date || 0).getTime()
          break
        case 'audience':
          comparison = (a.audience_size || 0) - (b.audience_size || 0)
          break
        case 'rating':
          comparison = (a.itunes_rating || 0) - (b.itunes_rating || 0)
          break
        case 'name':
          comparison = a.podcast_name.localeCompare(b.podcast_name)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [filteredByTimeRange, statusFilter, searchQuery, sortBy, sortOrder])

  // Status badge helper
  const getStatusBadge = (status: string) => {
    const styles = {
      conversation_started: { bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', icon: MessageSquare },
      in_progress: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
      booked: { bg: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
      recorded: { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Video },
      published: { bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: CheckCheck },
      cancelled: { bg: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: XCircle },
    }
    const config = styles[status as keyof typeof styles] || { bg: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: AlertCircle }
    const Icon = config.icon
    return (
      <Badge className={config.bg}>
        <Icon className="h-3 w-3 mr-1" />
        {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not scheduled'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatUpcomingDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return `${months} ${months === 1 ? 'month' : 'months'} ago`
    }
    const years = Math.floor(diffDays / 365)
    return `${years} ${years === 1 ? 'year' : 'years'} ago`
  }

  // Generate activity timeline
  const activityTimeline = useMemo(() => {
    if (!filteredByTimeRange) return []

    const activities: Array<{
      id: string
      type: 'published' | 'recorded' | 'booked' | 'conversation'
      booking: Booking
      date: Date
      message: string
    }> = []

    filteredByTimeRange.forEach(booking => {
      // Published
      if (booking.status === 'published' && booking.publish_date) {
        activities.push({
          id: `${booking.id}-published`,
          type: 'published',
          booking,
          date: new Date(booking.publish_date),
          message: `Episode published on ${booking.podcast_name}`
        })
      }

      // Recorded
      if (booking.status === 'recorded' && booking.recording_date) {
        activities.push({
          id: `${booking.id}-recorded`,
          type: 'recorded',
          booking,
          date: new Date(booking.recording_date),
          message: `Recorded episode with ${booking.podcast_name}`
        })
      }

      // Booked
      if ((booking.status === 'booked' || booking.status === 'in_progress') && booking.scheduled_date) {
        activities.push({
          id: `${booking.id}-booked`,
          type: 'booked',
          booking,
          date: new Date(booking.scheduled_date),
          message: `Booked appearance on ${booking.podcast_name}`
        })
      }

      // Conversation started
      if (booking.status === 'conversation_started' && booking.created_at) {
        activities.push({
          id: `${booking.id}-conversation`,
          type: 'conversation',
          booking,
          date: new Date(booking.created_at),
          message: `Started conversation with ${booking.podcast_name}`
        })
      }
    })

    // Sort by date (most recent first) and limit to 10
    return activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 10)
  }, [filteredByTimeRange])

  // Next Steps / Action Items (using selected time range)
  const nextSteps = useMemo(() => {
    if (!bookings) return []

    const now = new Date()
    const futureDate = new Date()
    if (timeRange !== 'all') {
      futureDate.setDate(futureDate.getDate() + timeRange)
    } else {
      futureDate.setFullYear(futureDate.getFullYear() + 10) // Far future for 'all'
    }

    const actions: Array<{
      id: string
      type: 'recording-prep' | 'going-live' | 'share-episode'
      booking: Booking
      date: Date
      title: string
      description: string
      urgent: boolean
    }> = []

    bookings.forEach(booking => {
      // Recording coming up - prepare talking points
      if (booking.recording_date && (booking.status === 'booked' || booking.status === 'in_progress' || booking.status === 'conversation_started')) {
        const recordingDate = new Date(booking.recording_date)
        if (recordingDate >= now && recordingDate <= futureDate) {
          const daysUntil = Math.ceil((recordingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          actions.push({
            id: `recording-prep-${booking.id}`,
            type: 'recording-prep',
            booking,
            date: recordingDate,
            title: `Recording with ${booking.podcast_name} in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`,
            description: `Prepare talking points and review podcast format`,
            urgent: daysUntil <= 3
          })
        }
      }

      // Episode going live - share on social
      if (booking.publish_date && (booking.status === 'recorded' || booking.status === 'published')) {
        const publishDate = new Date(booking.publish_date)
        if (publishDate >= now && publishDate <= futureDate) {
          const daysUntil = Math.ceil((publishDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          actions.push({
            id: `going-live-${booking.id}`,
            type: 'going-live',
            booking,
            date: publishDate,
            title: daysUntil <= 1 ? `Episode going live on ${booking.podcast_name} ${daysUntil === 0 ? 'today' : 'tomorrow'}` : `Episode going live on ${booking.podcast_name} in ${daysUntil} days`,
            description: 'Prepare social media posts and promotional materials',
            urgent: daysUntil <= 2
          })
        }
      }

      // Episode published recently - share it (use same time range backwards)
      if (booking.publish_date && booking.status === 'published' && booking.episode_url) {
        const publishDate = new Date(booking.publish_date)
        const pastDate = new Date(now)
        if (timeRange !== 'all') {
          pastDate.setDate(pastDate.getDate() - timeRange)
        } else {
          pastDate.setFullYear(pastDate.getFullYear() - 10) // Far past for 'all'
        }
        if (publishDate >= pastDate && publishDate <= now) {
          actions.push({
            id: `share-episode-${booking.id}`,
            type: 'share-episode',
            booking,
            date: publishDate,
            title: `Share your episode on ${booking.podcast_name}`,
            description: 'Post to LinkedIn, Twitter, and your email list',
            urgent: false
          })
        }
      }
    })

    // Sort: uncompleted first (by date), then completed (by date)
    return actions
      .sort((a, b) => {
        const aCompleted = completedActions.has(a.id)
        const bCompleted = completedActions.has(b.id)

        // If one is completed and other isn't, uncompleted comes first
        if (aCompleted !== bCompleted) {
          return aCompleted ? 1 : -1
        }

        // Both same completion status, sort by date
        return a.date.getTime() - b.date.getTime()
      })
      .slice(0, 10) // Show up to 10 total (completed + uncompleted)
  }, [bookings, completedActions, timeRange])

  // Calendar functions
  const calendarYear = calendarDate.getFullYear()
  const calendarMonth = calendarDate.getMonth()

  const getBookingsForDate = (date: Date) => {
    if (!bookings) return []
    const dateStr = date.toISOString().split('T')[0]
    return bookings.filter(b => {
      const dates = [b.scheduled_date, b.recording_date, b.publish_date].filter(Boolean)
      return dates.some(d => d?.split('T')[0] === dateStr)
    })
  }

  const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1).getDay()
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate()

  const goToPreviousMonth = () => {
    setCalendarDate(new Date(calendarYear, calendarMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setCalendarDate(new Date(calendarYear, calendarMonth + 1, 1))
  }

  const goToToday = () => {
    setCalendarDate(new Date())
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  // Build calendar grid
  const calendarDays = []

  // Previous month's trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const date = new Date(calendarYear, calendarMonth - 1, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: false,
      bookings: getBookingsForDate(date)
    })
  }

  // Current month's days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calendarYear, calendarMonth, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: true,
      bookings: getBookingsForDate(date)
    })
  }

  // Next month's leading days
  const remainingDays = 42 - calendarDays.length
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(calendarYear, calendarMonth + 1, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: false,
      bookings: getBookingsForDate(date)
    })
  }

  const getStatusColor = (status: string) => {
    const colors = {
      conversation_started: 'bg-amber-500',
      booked: 'bg-green-500',
      in_progress: 'bg-yellow-500',
      recorded: 'bg-blue-500',
      published: 'bg-purple-500'
    }
    return colors[status as keyof typeof colors] || 'bg-gray-500'
  }

  const toggleActionComplete = (actionId: string) => {
    const newCompleted = new Set(completedActions)
    if (newCompleted.has(actionId)) {
      newCompleted.delete(actionId)
    } else {
      newCompleted.add(actionId)
    }
    setCompletedActions(newCompleted)
  }

  // Premium Placements functions
  const parsePrice = (priceString: string): number => {
    return parseFloat(priceString.replace(/[$,]/g, ''))
  }

  const parseAudience = (audienceString: string | undefined): number => {
    if (!audienceString) return 0
    return parseFloat(audienceString.replace(/,/g, ''))
  }

  const togglePremiumFeatures = (podcastId: string) => {
    setExpandedPremiumCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(podcastId)) {
        newSet.delete(podcastId)
      } else {
        newSet.add(podcastId)
      }
      return newSet
    })
  }

  const getPreviewText = (text: string): string => {
    if (text.length <= 50) return text
    const truncated = text.substring(0, 50)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated).trim() + '...'
  }

  const needsReadMore = (text: string): boolean => {
    return text.length > 50
  }

  const handleAddToCart = (podcast: PremiumPodcast) => {
    addItem(podcast)
    sonnerToast.success(`${podcast.podcast_name} added to cart!`, {
      description: 'View your cart to proceed to checkout',
    })
  }

  // Filter and sort premium podcasts
  const filteredPremiumPodcasts = useMemo(() => {
    if (!premiumPodcasts) return []

    let filtered = [...premiumPodcasts]

    // Search filter
    if (premiumSearchQuery.trim()) {
      const query = premiumSearchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.podcast_name.toLowerCase().includes(query) ||
        p.why_this_show?.toLowerCase().includes(query) ||
        p.category?.toLowerCase().includes(query)
      )
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter(p => p.category === selectedCategory)
    }

    // Audience tier filter
    if (selectedAudienceTier !== "all") {
      const tier = AUDIENCE_TIERS.find(t => t.value === selectedAudienceTier)
      if (tier) {
        filtered = filtered.filter(p => {
          const audience = parseAudience(p.audience_size)
          return audience >= tier.min && audience < tier.max
        })
      }
    }

    // Price range filter
    if (selectedPriceRange !== "all") {
      const range = PRICE_RANGES.find(r => r.value === selectedPriceRange)
      if (range) {
        filtered = filtered.filter(p => {
          const price = parsePrice(p.price)
          return price >= range.min && price < range.max
        })
      }
    }

    // Sort
    filtered.sort((a, b) => {
      switch (premiumSortBy) {
        case 'featured':
          if (a.is_featured !== b.is_featured) {
            return a.is_featured ? -1 : 1
          }
          return a.display_order - b.display_order

        case 'price-asc':
          return parsePrice(a.price) - parsePrice(b.price)

        case 'price-desc':
          return parsePrice(b.price) - parsePrice(a.price)

        case 'audience-desc':
          return parseAudience(b.audience_size) - parseAudience(a.audience_size)

        case 'audience-asc':
          return parseAudience(a.audience_size) - parseAudience(b.audience_size)

        case 'name-asc':
          return a.podcast_name.localeCompare(b.podcast_name)

        default:
          return 0
      }
    })

    return filtered
  }, [premiumPodcasts, premiumSearchQuery, premiumSortBy, selectedCategory, selectedAudienceTier, selectedPriceRange])

  // Check if any premium filters are active
  const hasPremiumFilters = premiumSearchQuery || selectedCategory || selectedAudienceTier !== "all" || selectedPriceRange !== "all" || premiumSortBy !== "featured"

  // Clear all premium filters
  const clearPremiumFilters = () => {
    setPremiumSearchQuery("")
    setSelectedCategory(null)
    setSelectedAudienceTier("all")
    setSelectedPriceRange("all")
    setPremiumSortBy("featured")
  }

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredBookings.length) return

    const headers = ['Podcast Name', 'Host', 'Status', 'Audience Size', 'Rating', 'Scheduled Date', 'Recording Date', 'Publish Date', 'Episode URL']
    const rows = filteredBookings.map(b => [
      b.podcast_name,
      b.host_name || '',
      b.status,
      b.audience_size || '',
      b.itunes_rating || '',
      b.scheduled_date || '',
      b.recording_date || '',
      b.publish_date || '',
      b.episode_url || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `podcast-bookings-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Calculate stats (based on filtered time range)
  const stats = {
    total: filteredByTimeRange?.length || 0,
    conversations: filteredByTimeRange?.filter(b => b.status === 'conversation_started').length || 0,
    inProgress: filteredByTimeRange?.filter(b => b.status === 'in_progress').length || 0,
    booked: filteredByTimeRange?.filter(b => b.status === 'booked').length || 0,
    recorded: filteredByTimeRange?.filter(b => b.status === 'recorded').length || 0,
    published: filteredByTimeRange?.filter(b => b.status === 'published').length || 0,
  }

  // Bookings that need attention - missing scheduled date (any status)
  const needsScheduledDate = useMemo(() => {
    if (!bookings) return []
    return bookings.filter(booking => {
      return !booking.scheduled_date
    })
  }, [bookings])

  // Bookings that need attention - missing recording date (any status)
  const needsRecordingDate = useMemo(() => {
    if (!bookings) return []
    return bookings.filter(booking => {
      return !booking.recording_date
    })
  }, [bookings])

  // Bookings that need attention - missing publish date (any status)
  const needsPublishDate = useMemo(() => {
    if (!bookings) return []
    return bookings.filter(booking => {
      return !booking.publish_date
    })
  }, [bookings])

  // Analytics calculations
  const analyticsData = useMemo(() => {
    if (!bookings || bookings.length === 0) return null

    // Filter by analytics time range
    const now = new Date()
    const cutoffDate = new Date()

    if (analyticsTimeRange === '3months') {
      cutoffDate.setMonth(now.getMonth() - 3)
    } else if (analyticsTimeRange === '6months') {
      cutoffDate.setMonth(now.getMonth() - 6)
    } else if (analyticsTimeRange === '1year') {
      cutoffDate.setFullYear(now.getFullYear() - 1)
    } else {
      // 'all' - no filter
      cutoffDate.setFullYear(2000) // far past
    }

    // Filter ALL bookings by created_at (to show booking trends)
    const allFilteredBookings = bookings.filter(b => {
      if (!b.created_at) return false
      const createdDate = new Date(b.created_at)
      return createdDate >= cutoffDate
    })

    // Filter published bookings with publish_date
    const publishedBookings = bookings.filter(b => b.status === 'published' && b.publish_date)
    const filteredPublishedBookings = publishedBookings.filter(b => {
      const publishDate = new Date(b.publish_date!)
      return publishDate >= cutoffDate
    })

    if (allFilteredBookings.length === 0) return null

    // Group by month - tracking BOTH all bookings and published episodes
    const monthlyData: Record<string, {
      month: string
      year: number
      monthNum: number
      totalBookings: number
      episodes: number
      totalReach: number
      ratings: number[]
      bookings: Booking[]
      allBookingsThisMonth: Booking[]
      audienceSizes: number[]
    }> = {}

    // First pass: track ALL bookings by created_at (for booking trends)
    allFilteredBookings.forEach(booking => {
      const createdDate = new Date(booking.created_at!)
      const monthKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[createdDate.getMonth()],
          year: createdDate.getFullYear(),
          monthNum: createdDate.getMonth(),
          totalBookings: 0,
          episodes: 0,
          totalReach: 0,
          ratings: [],
          bookings: [],
          allBookingsThisMonth: [],
          audienceSizes: []
        }
      }

      monthlyData[monthKey].totalBookings++
      monthlyData[monthKey].allBookingsThisMonth.push(booking)

      // Track audience size for quality metrics
      if (booking.audience_size && booking.audience_size > 0) {
        monthlyData[monthKey].audienceSizes.push(booking.audience_size)
      }
    })

    // Second pass: track published episodes by publish_date
    filteredPublishedBookings.forEach(booking => {
      const publishDate = new Date(booking.publish_date!)
      const monthKey = `${publishDate.getFullYear()}-${String(publishDate.getMonth() + 1).padStart(2, '0')}`

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthNames[publishDate.getMonth()],
          year: publishDate.getFullYear(),
          monthNum: publishDate.getMonth(),
          totalBookings: 0,
          episodes: 0,
          totalReach: 0,
          ratings: [],
          bookings: [],
          allBookingsThisMonth: [],
          audienceSizes: []
        }
      }

      monthlyData[monthKey].episodes++
      monthlyData[monthKey].totalReach += booking.audience_size || 0
      if (booking.itunes_rating && !isNaN(Number(booking.itunes_rating))) {
        monthlyData[monthKey].ratings.push(Number(booking.itunes_rating))
      }
      monthlyData[monthKey].bookings.push(booking)
    })

    // Convert to array and sort by date
    const monthlyArray = Object.entries(monthlyData)
      .map(([key, data]) => ({
        key,
        ...data,
        avgRating: data.ratings.length > 0
          ? data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
          : 0,
        avgAudiencePerBooking: data.audienceSizes.length > 0
          ? data.audienceSizes.reduce((sum, size) => sum + size, 0) / data.audienceSizes.length
          : 0
      }))
      .sort((a, b) => {
        const dateA = new Date(a.year, a.monthNum)
        const dateB = new Date(b.year, b.monthNum)
        return dateA.getTime() - dateB.getTime()
      })

    // Calculate growth rates
    const monthlyWithGrowth = monthlyArray.map((month, idx) => {
      if (idx === 0) {
        return { ...month, growth: 0 }
      }
      const prev = monthlyArray[idx - 1]
      const growth = prev.totalReach > 0
        ? ((month.totalReach - prev.totalReach) / prev.totalReach) * 100
        : 0
      return { ...month, growth }
    })

    // Find best month
    const bestMonth = [...monthlyArray].sort((a, b) => b.totalReach - a.totalReach)[0]

    // Calculate overall growth
    const firstMonth = monthlyArray[0]
    const lastMonth = monthlyArray[monthlyArray.length - 1]
    const overallGrowth = firstMonth.totalReach > 0
      ? ((lastMonth.totalReach - firstMonth.totalReach) / firstMonth.totalReach) * 100
      : 0

    // Calculate projections
    const avgMonthlyReach = monthlyArray.reduce((sum, m) => sum + m.totalReach, 0) / monthlyArray.length
    const monthsUntilEndOfYear = 12 - now.getMonth()
    const projectedYearEndReach = filteredBookings.reduce((sum, b) => sum + (b.audience_size || 0), 0) + (avgMonthlyReach * monthsUntilEndOfYear)

    // Period comparison (if we have enough data)
    let periodComparison = null
    const halfPoint = Math.floor(monthlyArray.length / 2)
    if (monthlyArray.length >= 4) {
      const firstHalf = monthlyArray.slice(0, halfPoint)
      const secondHalf = monthlyArray.slice(halfPoint)

      const firstHalfStats = {
        bookings: firstHalf.reduce((sum, m) => sum + m.totalBookings, 0),
        episodes: firstHalf.reduce((sum, m) => sum + m.episodes, 0),
        reach: firstHalf.reduce((sum, m) => sum + m.totalReach, 0),
        avgRating: firstHalf.reduce((sum, m) => sum + m.avgRating, 0) / firstHalf.length,
        avgAudience: firstHalf.reduce((sum, m) => sum + m.totalReach, 0) / firstHalf.reduce((sum, m) => sum + m.episodes, 0),
        avgAudiencePerBooking: firstHalf.reduce((sum, m) => sum + m.avgAudiencePerBooking, 0) / firstHalf.length
      }

      const secondHalfStats = {
        bookings: secondHalf.reduce((sum, m) => sum + m.totalBookings, 0),
        episodes: secondHalf.reduce((sum, m) => sum + m.episodes, 0),
        reach: secondHalf.reduce((sum, m) => sum + m.totalReach, 0),
        avgRating: secondHalf.reduce((sum, m) => sum + m.avgRating, 0) / secondHalf.length,
        avgAudience: secondHalf.reduce((sum, m) => sum + m.totalReach, 0) / secondHalf.reduce((sum, m) => sum + m.episodes, 0),
        avgAudiencePerBooking: secondHalf.reduce((sum, m) => sum + m.avgAudiencePerBooking, 0) / secondHalf.length
      }

      periodComparison = {
        bookings: {
          before: firstHalfStats.bookings,
          after: secondHalfStats.bookings,
          growth: firstHalfStats.bookings > 0 ? ((secondHalfStats.bookings - firstHalfStats.bookings) / firstHalfStats.bookings) * 100 : 0
        },
        episodes: {
          before: firstHalfStats.episodes,
          after: secondHalfStats.episodes,
          growth: firstHalfStats.episodes > 0 ? ((secondHalfStats.episodes - firstHalfStats.episodes) / firstHalfStats.episodes) * 100 : 0
        },
        reach: {
          before: firstHalfStats.reach,
          after: secondHalfStats.reach,
          growth: firstHalfStats.reach > 0 ? ((secondHalfStats.reach - firstHalfStats.reach) / firstHalfStats.reach) * 100 : 0
        },
        avgRating: {
          before: firstHalfStats.avgRating,
          after: secondHalfStats.avgRating,
          growth: firstHalfStats.avgRating > 0 ? ((secondHalfStats.avgRating - firstHalfStats.avgRating) / firstHalfStats.avgRating) * 100 : 0
        },
        avgAudience: {
          before: firstHalfStats.avgAudience,
          after: secondHalfStats.avgAudience,
          growth: firstHalfStats.avgAudience > 0 ? ((secondHalfStats.avgAudience - firstHalfStats.avgAudience) / firstHalfStats.avgAudience) * 100 : 0
        },
        avgAudiencePerBooking: {
          before: firstHalfStats.avgAudiencePerBooking,
          after: secondHalfStats.avgAudiencePerBooking,
          growth: firstHalfStats.avgAudiencePerBooking > 0 ? ((secondHalfStats.avgAudiencePerBooking - firstHalfStats.avgAudiencePerBooking) / firstHalfStats.avgAudiencePerBooking) * 100 : 0
        }
      }
    }

    return {
      monthlyData: monthlyWithGrowth,
      bestMonth,
      overallGrowth,
      totalBookings: allFilteredBookings.length,
      totalEpisodes: filteredPublishedBookings.length,
      totalReach: filteredPublishedBookings.reduce((sum, b) => sum + (b.audience_size || 0), 0),
      avgRating: monthlyArray.reduce((sum, m) => sum + m.avgRating, 0) / monthlyArray.length,
      avgAudiencePerBooking: monthlyArray.reduce((sum, m) => sum + m.avgAudiencePerBooking, 0) / monthlyArray.length,
      avgMonthlyReach,
      projectedYearEndReach,
      periodComparison,
      firstMonth,
      lastMonth
    }
  }, [bookings, analyticsTimeRange])

  // Get published bookings for upgrade opportunities
  const publishedBookings = useMemo(() => {
    return bookings?.filter(b => b.status === 'published') || []
  }, [bookings])

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Upgrade Hero Banner */}
        {addonServices && addonServices.length > 0 && publishedBookings.length > 0 && (
          <UpgradeHeroBanner
            publishedBookings={publishedBookings}
            services={addonServices}
            existingAddons={clientAddons || []}
            onPurchaseClick={(booking, service) => {
              setViewingBooking(booking)
              toast.info(`${service.name} checkout coming soon!`)
              // TODO: Implement Stripe checkout
            }}
          />
        )}

        {/* Welcome Header */}
        <div className="flex items-center gap-4">
          {client?.photo_url ? (
            <img
              src={client.photo_url}
              alt={client.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-primary/20"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
              <User className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Welcome back, {client?.contact_person || client?.name}!</h1>
            <p className="text-muted-foreground mt-1">
              Your podcast journey dashboard
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="podcast-list">Outreach List</TabsTrigger>
            <TabsTrigger value="premium">Premium Placements</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Time Range Selector */}
            <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={timeRange === 7 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(7)}
                  size="sm"
                >
                  7 Days
                </Button>
                <Button
                  variant={timeRange === 14 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(14)}
                  size="sm"
                >
                  14 Days
                </Button>
                <Button
                  variant={timeRange === 30 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(30)}
                  size="sm"
                >
                  30 Days
                </Button>
                <Button
                  variant={timeRange === 60 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(60)}
                  size="sm"
                >
                  60 Days
                </Button>
                <Button
                  variant={timeRange === 90 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(90)}
                  size="sm"
                >
                  90 Days
                </Button>
                <Button
                  variant={timeRange === 'all' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('all')}
                  size="sm"
                >
                  All Time
                </Button>
              </div>

              <div className="min-w-[150px] text-center font-semibold">
                {getDisplayDate()}
              </div>

              <div className="text-sm text-muted-foreground">
                Showing {stats.total} {stats.total === 1 ? 'booking' : 'bookings'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 border-purple-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100">Total Reach</CardTitle>
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                {enhancedStats?.totalAudienceReach.toLocaleString() || 0}
              </div>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                <TrendingUp className="h-3 w-3 inline mr-1" />
                Total listeners
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.conversations}</div>
              <p className="text-xs text-muted-foreground">Started conversations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">Being scheduled</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booked</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.booked}</div>
              <p className="text-xs text-muted-foreground">Confirmed episodes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recorded</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recorded}</div>
              <p className="text-xs text-muted-foreground">Episodes recorded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Live</CardTitle>
              <CheckCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.published}</div>
              <p className="text-xs text-muted-foreground">Episodes published</p>
            </CardContent>
          </Card>
        </div>

        {/* Impact Summary Card */}
        {enhancedStats && stats.total > 0 && (
          <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950 dark:via-indigo-950 dark:to-purple-950">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle className="text-2xl text-blue-900 dark:text-blue-100">Your Podcast Impact</CardTitle>
                  <CardDescription className="text-blue-800 dark:text-blue-200">
                    Real numbers showing the value of your podcast appearances
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Estimated Total Impressions */}
                <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-blue-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Estimated Reach</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {enhancedStats.totalAudienceReach.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total potential listeners</p>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      📈 Across {stats.published} published episodes
                    </p>
                  </div>
                </div>

                {/* Average Audience Per Episode */}
                <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                      <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Avg Audience</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {stats.total > 0 ? Math.round(enhancedStats.totalAudienceReach / stats.total).toLocaleString() : 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Listeners per episode</p>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      🎯 Per podcast placement
                    </p>
                  </div>
                </div>

                {/* Total Episodes */}
                <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-green-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <Video className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Total Episodes</p>
                  </div>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {stats.total}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Podcast appearances</p>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      {stats.published} live • {stats.recorded} recorded
                    </p>
                  </div>
                </div>

                {/* Quality Score */}
                <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 border-amber-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                      <Star className="h-5 w-5 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Quality Score</p>
                  </div>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {enhancedStats.avgRating > 0 ? enhancedStats.avgRating.toFixed(1) : 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Average podcast rating</p>
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      ⭐ Top-rated shows
                    </p>
                  </div>
                </div>
              </div>

              {/* Impact Statement */}
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 rounded-lg">
                <p className="text-center text-sm font-semibold text-blue-900 dark:text-blue-100">
                  🎉 You've reached an estimated{' '}
                  <span className="text-lg text-blue-600 dark:text-blue-400">
                    {enhancedStats.totalAudienceReach.toLocaleString()}
                  </span>{' '}
                  potential listeners through {stats.total} high-quality podcast{stats.total === 1 ? '' : 's'}!
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attention Needed Alert */}
        <Card className={
          needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0
            ? "border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700"
            : "border-2 border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-700"
        }>
          <CardHeader>
            <div className="flex items-center gap-2">
              {needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              <CardTitle className={
                needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0
                  ? "text-amber-900 dark:text-amber-100"
                  : "text-green-900 dark:text-green-100"
              }>
                Attention Needed
              </CardTitle>
              {needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0 ? (
                <Badge variant="destructive" className="ml-auto">
                  {needsScheduledDate.length + needsRecordingDate.length + needsPublishDate.length}
                </Badge>
              ) : (
                <Badge variant="outline" className="ml-auto bg-green-100 text-green-800 border-green-300">
                  All Clear ✓
                </Badge>
              )}
            </div>
            <CardDescription className={
              needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0
                ? "text-amber-800 dark:text-amber-200"
                : "text-green-800 dark:text-green-200"
            }>
              {needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0
                ? "Some of your bookings need scheduling information"
                : "All your bookings are up to date!"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {needsScheduledDate.length > 0 || needsRecordingDate.length > 0 || needsPublishDate.length > 0 ? (
              <>
                {needsScheduledDate.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      🗓️ Missing Scheduled Date ({needsScheduledDate.length})
                    </p>
                    <div className="space-y-1 pl-4">
                      {needsScheduledDate.map(booking => (
                        <div key={booking.id} className="flex items-center gap-2 text-sm">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                          <button
                            onClick={() => setViewingBooking(booking)}
                            className="text-amber-900 dark:text-amber-100 hover:underline cursor-pointer"
                          >
                            {booking.podcast_name}
                          </button>
                          <Badge variant="outline" className="text-xs">
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {needsRecordingDate.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      📅 Missing Recording Date ({needsRecordingDate.length})
                    </p>
                    <div className="space-y-1 pl-4">
                      {needsRecordingDate.map(booking => (
                        <div key={booking.id} className="flex items-center gap-2 text-sm">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                          <button
                            onClick={() => setViewingBooking(booking)}
                            className="text-amber-900 dark:text-amber-100 hover:underline cursor-pointer"
                          >
                            {booking.podcast_name}
                          </button>
                          <Badge variant="outline" className="text-xs">
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {needsPublishDate.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      📺 Missing Publish Date ({needsPublishDate.length})
                    </p>
                    <div className="space-y-1 pl-4">
                      {needsPublishDate.map(booking => (
                        <div key={booking.id} className="flex items-center gap-2 text-sm">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                          <button
                            onClick={() => setViewingBooking(booking)}
                            className="text-amber-900 dark:text-amber-100 hover:underline cursor-pointer"
                          >
                            {booking.podcast_name}
                          </button>
                          <Badge variant="outline" className="text-xs">
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-amber-200 dark:border-amber-700">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    💡 <strong>Tip:</strong> Click on a podcast name to view full details. Reach out to your account manager if you need help scheduling these episodes.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-green-800 dark:text-green-200">
                  🎉 Great work! All your bookings have the necessary scheduling information. We'll keep you updated as things progress.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Value Highlights Section */}
        {enhancedStats && enhancedStats.topPodcasts.length > 0 && (
          <Card className="border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-amber-900 dark:text-amber-100">Top Performing Podcasts</CardTitle>
              </div>
              <CardDescription className="text-amber-800 dark:text-amber-200">
                Your highest-reach placements showcasing your value
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {enhancedStats.topPodcasts.slice(0, 3).map((booking, idx) => (
                  <div
                    key={booking.id}
                    className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setViewingBooking(booking)}
                  >
                    {booking.podcast_image_url && (
                      <img
                        src={booking.podcast_image_url}
                        alt={booking.podcast_name}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{booking.podcast_name}</p>
                      <p className="text-xs text-muted-foreground">
                        👥 {booking.audience_size?.toLocaleString()} listeners
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                      #{idx + 1}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next Steps / Action Items */}
        <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950">
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Target className="h-6 w-6 text-emerald-600" />
                <div>
                  <CardTitle className="text-2xl text-emerald-900 dark:text-emerald-100">Next Steps</CardTitle>
                  <CardDescription className="text-emerald-800 dark:text-emerald-200">
                    Action items for the next {timeRange === 'all' ? 'all time' : `${timeRange} days`}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={timeRange === 7 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(7)}
                  size="sm"
                >
                  7d
                </Button>
                <Button
                  variant={timeRange === 14 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(14)}
                  size="sm"
                >
                  14d
                </Button>
                <Button
                  variant={timeRange === 30 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(30)}
                  size="sm"
                >
                  30d
                </Button>
                <Button
                  variant={timeRange === 60 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(60)}
                  size="sm"
                >
                  60d
                </Button>
                <Button
                  variant={timeRange === 90 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(90)}
                  size="sm"
                >
                  90d
                </Button>
                <Button
                  variant={timeRange === 'all' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('all')}
                  size="sm"
                >
                  All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {nextSteps.length > 0 ? (
              <div className="space-y-3">
                {nextSteps.map((action) => {
                  const iconConfig = {
                    'recording-prep': { icon: FileText, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900' },
                    'going-live': { icon: Bell, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900' },
                    'share-episode': { icon: Share2, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900' }
                  }
                  const config = iconConfig[action.type]
                  const Icon = config.icon

                  return (
                    <div
                      key={action.id}
                      className={`p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 transition-all ${
                        action.urgent ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
                      } ${completedActions.has(action.id) ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-start gap-3 flex-1">
                          <Checkbox
                            checked={completedActions.has(action.id)}
                            onCheckedChange={() => toggleActionComplete(action.id)}
                            className="mt-1"
                          />
                          <div className={`p-2 rounded-lg ${config.bg} flex-shrink-0`}>
                            <Icon className={`h-5 w-5 ${config.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <p className={`font-semibold ${completedActions.has(action.id) ? 'line-through text-muted-foreground' : ''}`}>
                                {action.title}
                              </p>
                              {action.urgent && (
                                <Badge variant="destructive" className="text-xs">
                                  Urgent
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {action.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{action.description}</p>
                            {action.booking.podcast_image_url && (
                              <div className="mt-2">
                                <img
                                  src={action.booking.podcast_image_url}
                                  alt={action.booking.podcast_name}
                                  className="w-12 h-12 rounded object-cover inline-block"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">You're all caught up! 🎉</p>
                <p className="text-sm">No urgent action items right now. New tasks will appear here when:</p>
                <ul className="text-sm mt-3 space-y-1 max-w-md mx-auto">
                  <li>• You have a recording coming up in the next 7 days</li>
                  <li>• An episode is scheduled to go live soon</li>
                  <li>• You have recently published episodes to share</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bookings Table - Overview */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Your Podcast Bookings</CardTitle>
                <CardDescription>
                  All your podcast placements at a glance
                </CardDescription>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col gap-3 mt-4">
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search podcasts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-10"
                  />
                </div>

                {/* Status Filter */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] h-10">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="conversation_started">Conversation Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="recorded">Recorded</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort By */}
                <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'date' | 'audience' | 'rating' | 'name')}>
                  <SelectTrigger className="w-full sm:w-[180px] h-10">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Sort by Date</SelectItem>
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="audience">Sort by Audience</SelectItem>
                    <SelectItem value="rating">Sort by Rating</SelectItem>
                  </SelectContent>
                </Select>

                {/* Sort Order */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Active Filters Display & Clear */}
              {(searchQuery || statusFilter !== 'all') && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Active filters:</span>
                  {searchQuery && (
                    <Badge variant="secondary" className="gap-1">
                      Search: {searchQuery}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchQuery('')} />
                    </Badge>
                  )}
                  {statusFilter !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      Status: {statusFilter.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter('all')} />
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              )}

              {/* Results Count */}
              <div className="text-xs text-muted-foreground">
                Showing {filteredBookings.length} of {bookings?.length || 0} bookings
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No bookings match your filters'
                    : 'No bookings found'}
                </p>
                {(searchQuery || statusFilter !== 'all') && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setSearchQuery('')
                      setStatusFilter('all')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {filteredBookings.map((booking) => (
                  <div
                    key={booking.id}
                    onClick={() => setViewingBooking(booking)}
                    className="flex items-center gap-4 p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {booking.podcast_image_url && (
                      <img
                        src={booking.podcast_image_url}
                        alt={booking.podcast_name}
                        className="w-16 h-16 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{booking.podcast_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.host_name || 'Host not specified'}
                      </p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1">
                        {booking.audience_size && (
                          <p className="text-xs text-muted-foreground">
                            👥 {booking.audience_size.toLocaleString()} listeners
                          </p>
                        )}
                        {booking.recording_date && (
                          <p className="text-xs text-muted-foreground">
                            📅 {formatDate(booking.recording_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(booking.recording_date || booking.scheduled_date) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            const calendarEvent = createCalendarEventFromBooking(booking)
                            if (calendarEvent) {
                              openGoogleCalendar(calendarEvent)
                              toast.success('Opening Google Calendar...')
                            } else {
                              toast.error('No date available for this booking')
                            }
                          }}
                          className="flex-shrink-0"
                        >
                          <CalendarPlus className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Add to Calendar</span>
                        </Button>
                      )}
                      {getStatusBadge(booking.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          {/* ANALYTICS TAB */}
          <TabsContent value="analytics" className="space-y-6">
            {/* Time Range Selector */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={analyticsTimeRange === '3months' ? 'default' : 'outline'}
                    onClick={() => setAnalyticsTimeRange('3months')}
                    size="sm"
                  >
                    Last 3 Months
                  </Button>
                  <Button
                    variant={analyticsTimeRange === '6months' ? 'default' : 'outline'}
                    onClick={() => setAnalyticsTimeRange('6months')}
                    size="sm"
                  >
                    Last 6 Months
                  </Button>
                  <Button
                    variant={analyticsTimeRange === '1year' ? 'default' : 'outline'}
                    onClick={() => setAnalyticsTimeRange('1year')}
                    size="sm"
                  >
                    Last Year
                  </Button>
                  <Button
                    variant={analyticsTimeRange === 'all' ? 'default' : 'outline'}
                    onClick={() => setAnalyticsTimeRange('all')}
                    size="sm"
                  >
                    All Time
                  </Button>
                </div>
              </CardContent>
            </Card>

            {analyticsData ? (
              <>
                {/* Top Stats Row */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{analyticsData.totalBookings}</div>
                      {analyticsData.periodComparison && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className={analyticsData.periodComparison.bookings.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {analyticsData.periodComparison.bookings.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.bookings.growth).toFixed(0)}%
                          </span> vs earlier period
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Episodes Published</CardTitle>
                      <Video className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{analyticsData.totalEpisodes}</div>
                      {analyticsData.periodComparison && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className={analyticsData.periodComparison.episodes.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {analyticsData.periodComparison.episodes.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.episodes.growth).toFixed(0)}%
                          </span> vs earlier period
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
                      <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {analyticsData.totalReach >= 1000000
                          ? `${(analyticsData.totalReach / 1000000).toFixed(1)}M`
                          : analyticsData.totalReach >= 1000
                          ? `${(analyticsData.totalReach / 1000).toFixed(0)}K`
                          : analyticsData.totalReach.toLocaleString()}
                      </div>
                      {analyticsData.periodComparison && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className={analyticsData.periodComparison.reach.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {analyticsData.periodComparison.reach.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.reach.growth).toFixed(0)}%
                          </span> vs earlier period
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Avg Podcast Rating</CardTitle>
                      <Star className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        ⭐ {analyticsData.avgRating.toFixed(1)}
                      </div>
                      {analyticsData.periodComparison && analyticsData.periodComparison.avgRating.before > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className={analyticsData.periodComparison.avgRating.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {analyticsData.periodComparison.avgRating.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgRating.growth).toFixed(1)}%
                          </span> vs earlier period
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${analyticsData.overallGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {analyticsData.overallGrowth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.overallGrowth).toFixed(0)}%
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Overall trend
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900 dark:to-teal-900 border-emerald-200">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Avg Audience / Booking</CardTitle>
                      <Award className="h-4 w-4 text-emerald-600" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                        {analyticsData.avgAudiencePerBooking >= 1000
                          ? `${(analyticsData.avgAudiencePerBooking / 1000).toFixed(0)}K`
                          : Math.round(analyticsData.avgAudiencePerBooking).toLocaleString()}
                      </div>
                      {analyticsData.periodComparison && analyticsData.periodComparison.avgAudiencePerBooking.before > 0 && (
                        <p className="text-xs text-emerald-800 dark:text-emerald-200 mt-1">
                          <span className={analyticsData.periodComparison.avgAudiencePerBooking.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {analyticsData.periodComparison.avgAudiencePerBooking.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgAudiencePerBooking.growth).toFixed(0)}%
                          </span> Quality improvement
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Main Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Episodes & Reach Over Time</CardTitle>
                    <CardDescription>Monthly performance showing episodes published and total reach</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={analyticsData.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value, index) => {
                            const item = analyticsData.monthlyData[index]
                            return `${value.substring(0, 3)} '${item.year.toString().substring(2)}`
                          }}
                        />
                        <YAxis
                          yAxisId="left"
                          label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          label={{ value: 'Reach', angle: 90, position: 'insideRight' }}
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => {
                            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                            return value
                          }}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
                          formatter={(value: any, name: string) => {
                            if (name === 'totalReach') return [value.toLocaleString(), 'Total Reach']
                            if (name === 'episodes') return [value, 'Episodes']
                            if (name === 'totalBookings') return [value, 'Total Bookings']
                            return value
                          }}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              const data = payload[0].payload
                              return `${data.month} ${data.year}`
                            }
                            return label
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="episodes" fill="#8b5cf6" name="Episodes Published" radius={[8, 8, 0, 0]} />
                        <Bar yAxisId="left" dataKey="totalBookings" fill="#10b981" name="Total Bookings" radius={[8, 8, 0, 0]} />
                        <Bar yAxisId="right" dataKey="totalReach" fill="#3b82f6" name="Total Reach" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Bookings Over Time Chart */}
                <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      Bookings Secured Month Over Month
                    </CardTitle>
                    <CardDescription>
                      Total podcast bookings secured each month showing our booking velocity
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={analyticsData.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value, index) => {
                            const item = analyticsData.monthlyData[index]
                            return `${value.substring(0, 3)} '${item.year.toString().substring(2)}`
                          }}
                        />
                        <YAxis
                          label={{ value: 'Number of Bookings', angle: -90, position: 'insideLeft' }}
                          tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
                          formatter={(value: any, name: string) => {
                            if (name === 'totalBookings') return [value, 'Bookings Secured']
                            return value
                          }}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              const data = payload[0].payload
                              return `${data.month} ${data.year}`
                            }
                            return label
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="totalBookings"
                          fill="#3b82f6"
                          name="Total Bookings"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                        📊 <strong>What this shows:</strong> Each bar represents the number of podcast bookings we secured for you that month.
                        Growing bars demonstrate our increasing momentum and effectiveness in getting you booked!
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Quality Improvement Chart */}
                <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 dark:from-emerald-950/20 dark:to-teal-950/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-emerald-600" />
                      Quality Improvement Over Time
                    </CardTitle>
                    <CardDescription>
                      Booking volume and average audience size trends showing quality growth
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={analyticsData.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="month"
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value, index) => {
                            const item = analyticsData.monthlyData[index]
                            return `${value.substring(0, 3)} '${item.year.toString().substring(2)}`
                          }}
                        />
                        <YAxis
                          label={{ value: 'Avg Audience Size', angle: -90, position: 'insideLeft' }}
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => {
                            if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                            if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                            return value
                          }}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #ccc' }}
                          formatter={(value: any, name: string) => {
                            if (name === 'avgAudiencePerBooking') return [Math.round(value).toLocaleString(), 'Avg Audience per Booking']
                            return value
                          }}
                          labelFormatter={(label, payload) => {
                            if (payload && payload[0]) {
                              const data = payload[0].payload
                              return `${data.month} ${data.year}`
                            }
                            return label
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="avgAudiencePerBooking"
                          fill="#059669"
                          name="Avg Audience per Booking"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 p-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <p className="text-sm text-emerald-900 dark:text-emerald-100 font-medium">
                        📊 <strong>What this shows:</strong> Each bar shows the average audience size per booking for that month.
                        Growing bars mean we're securing higher-quality placements over time!
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Month by Month Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Month-by-Month Performance</CardTitle>
                    <CardDescription>Detailed breakdown of your podcast growth</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Episodes</TableHead>
                          <TableHead className="text-right">Total Reach</TableHead>
                          <TableHead className="text-right">Avg Rating</TableHead>
                          <TableHead className="text-right">Growth</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsData.monthlyData.slice().reverse().map((month) => (
                          <TableRow key={month.key}>
                            <TableCell className="font-medium">
                              {month.month} {month.year}
                            </TableCell>
                            <TableCell className="text-right">{month.episodes}</TableCell>
                            <TableCell className="text-right">
                              {month.totalReach >= 1000000
                                ? `${(month.totalReach / 1000000).toFixed(1)}M`
                                : month.totalReach >= 1000
                                ? `${(month.totalReach / 1000).toFixed(0)}K`
                                : month.totalReach.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {month.avgRating > 0 ? `⭐ ${month.avgRating.toFixed(1)}` : 'N/A'}
                            </TableCell>
                            <TableCell className="text-right">
                              {month.growth !== 0 && (
                                <span className={month.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                                  {month.growth >= 0 ? '↑' : '↓'} {Math.abs(month.growth).toFixed(0)}%
                                </span>
                              )}
                              {month.growth === 0 && <span className="text-muted-foreground">-</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Key Insights */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 border-amber-200">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-600" />
                        <CardTitle className="text-amber-900 dark:text-amber-100">Best Month</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">
                        {analyticsData.bestMonth.month} {analyticsData.bestMonth.year}
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mt-2">
                        {analyticsData.bestMonth.episodes} episodes reaching{' '}
                        {analyticsData.bestMonth.totalReach >= 1000000
                          ? `${(analyticsData.bestMonth.totalReach / 1000000).toFixed(1)}M`
                          : analyticsData.bestMonth.totalReach >= 1000
                          ? `${(analyticsData.bestMonth.totalReach / 1000).toFixed(0)}K`
                          : analyticsData.bestMonth.totalReach.toLocaleString()}{' '}
                        listeners
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-200">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                        <CardTitle className="text-emerald-900 dark:text-emerald-100">Overall Growth</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
                        {analyticsData.overallGrowth >= 0 ? '+' : ''}{analyticsData.overallGrowth.toFixed(0)}% Growth
                      </p>
                      <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-2">
                        From {analyticsData.firstMonth.month} {analyticsData.firstMonth.year} to{' '}
                        {analyticsData.lastMonth.month} {analyticsData.lastMonth.year}
                      </p>
                    </CardContent>
                  </Card>

                  {analyticsData.avgRating >= 4.0 && (
                    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Star className="h-5 w-5 text-blue-600 fill-blue-600" />
                          <CardTitle className="text-blue-900 dark:text-blue-100">Quality Improvement</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                          ⭐ {analyticsData.avgRating.toFixed(1)} Average Rating
                        </p>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
                          You're consistently appearing on high-quality shows
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border-purple-200">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-purple-600" />
                        <CardTitle className="text-purple-900 dark:text-purple-100">Projected Year-End</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-semibold text-purple-900 dark:text-purple-100">
                        {analyticsData.projectedYearEndReach >= 1000000
                          ? `${(analyticsData.projectedYearEndReach / 1000000).toFixed(1)}M`
                          : analyticsData.projectedYearEndReach >= 1000
                          ? `${(analyticsData.projectedYearEndReach / 1000).toFixed(0)}K`
                          : analyticsData.projectedYearEndReach.toLocaleString()}{' '}
                        Total Reach
                      </p>
                      <p className="text-sm text-purple-800 dark:text-purple-200 mt-2">
                        At your current pace by end of {new Date().getFullYear()}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Period Comparison */}
                {analyticsData.periodComparison && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Period Comparison</CardTitle>
                      <CardDescription>Earlier vs later half of selected time range</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Total Bookings</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">{analyticsData.periodComparison.bookings.after}</p>
                            <span className="text-xs text-muted-foreground">from {analyticsData.periodComparison.bookings.before}</span>
                          </div>
                          <p className={`text-sm mt-1 ${analyticsData.periodComparison.bookings.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analyticsData.periodComparison.bookings.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.bookings.growth).toFixed(0)}%
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Episodes</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">{analyticsData.periodComparison.episodes.after}</p>
                            <span className="text-xs text-muted-foreground">from {analyticsData.periodComparison.episodes.before}</span>
                          </div>
                          <p className={`text-sm mt-1 ${analyticsData.periodComparison.episodes.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analyticsData.periodComparison.episodes.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.episodes.growth).toFixed(0)}%
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Total Reach</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">
                              {analyticsData.periodComparison.reach.after >= 1000000
                                ? `${(analyticsData.periodComparison.reach.after / 1000000).toFixed(1)}M`
                                : analyticsData.periodComparison.reach.after >= 1000
                                ? `${(analyticsData.periodComparison.reach.after / 1000).toFixed(0)}K`
                                : analyticsData.periodComparison.reach.after.toLocaleString()}
                            </p>
                          </div>
                          <p className={`text-sm mt-1 ${analyticsData.periodComparison.reach.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analyticsData.periodComparison.reach.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.reach.growth).toFixed(0)}%
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Avg Rating</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">⭐ {analyticsData.periodComparison.avgRating.after.toFixed(1)}</p>
                          </div>
                          {analyticsData.periodComparison.avgRating.before > 0 && (
                            <p className={`text-sm mt-1 ${analyticsData.periodComparison.avgRating.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {analyticsData.periodComparison.avgRating.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgRating.growth).toFixed(1)}%
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Avg Audience / Episode</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">
                              {analyticsData.periodComparison.avgAudience.after >= 1000
                                ? `${(analyticsData.periodComparison.avgAudience.after / 1000).toFixed(0)}K`
                                : Math.round(analyticsData.periodComparison.avgAudience.after).toLocaleString()}
                            </p>
                          </div>
                          <p className={`text-sm mt-1 ${analyticsData.periodComparison.avgAudience.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analyticsData.periodComparison.avgAudience.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgAudience.growth).toFixed(0)}%
                          </p>
                        </div>

                        <div className="md:col-span-2 lg:col-span-1">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Avg Audience / Booking</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold text-emerald-600">
                              {analyticsData.periodComparison.avgAudiencePerBooking.after >= 1000
                                ? `${(analyticsData.periodComparison.avgAudiencePerBooking.after / 1000).toFixed(0)}K`
                                : Math.round(analyticsData.periodComparison.avgAudiencePerBooking.after).toLocaleString()}
                            </p>
                          </div>
                          {analyticsData.periodComparison.avgAudiencePerBooking.before > 0 && (
                            <p className={`text-sm mt-1 ${analyticsData.periodComparison.avgAudiencePerBooking.growth >= 0 ? 'text-green-600 font-semibold' : 'text-red-600'}`}>
                              {analyticsData.periodComparison.avgAudiencePerBooking.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgAudiencePerBooking.growth).toFixed(0)}% Quality Improvement!
                            </p>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Total Reach</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">
                              {analyticsData.periodComparison.reach.after >= 1000000
                                ? `${(analyticsData.periodComparison.reach.after / 1000000).toFixed(1)}M`
                                : analyticsData.periodComparison.reach.after >= 1000
                                ? `${(analyticsData.periodComparison.reach.after / 1000).toFixed(0)}K`
                                : analyticsData.periodComparison.reach.after.toLocaleString()}
                            </p>
                          </div>
                          <p className={`text-sm mt-1 ${analyticsData.periodComparison.reach.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {analyticsData.periodComparison.reach.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.reach.growth).toFixed(0)}%
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">Avg Rating</p>
                          <div className="flex items-baseline gap-2">
                            <p className="text-2xl font-bold">⭐ {analyticsData.periodComparison.avgRating.after.toFixed(1)}</p>
                          </div>
                          {analyticsData.periodComparison.avgRating.before > 0 && (
                            <p className={`text-sm mt-1 ${analyticsData.periodComparison.avgRating.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {analyticsData.periodComparison.avgRating.growth >= 0 ? '↑' : '↓'} {Math.abs(analyticsData.periodComparison.avgRating.growth).toFixed(1)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-semibold text-muted-foreground">No Analytics Data Yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Analytics will appear once you have published episodes in the selected time range.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* CALENDAR TAB */}
          <TabsContent value="calendar" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <CardTitle className="text-2xl">
                    {monthNames[calendarMonth]} {calendarYear}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={goToToday}>
                      Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToNextMonth}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {/* Day headers */}
                  {daysOfWeek.map(day => (
                    <div key={day} className="text-center font-semibold text-sm py-2 text-muted-foreground">
                      {day}
                    </div>
                  ))}

                  {/* Calendar days */}
                  {calendarDays.map((dayData, index) => {
                    const hasBookings = dayData.bookings.length > 0
                    const isTodayDate = isToday(dayData.date)

                    return (
                      <div
                        key={index}
                        onClick={() => {
                          if (hasBookings) {
                            setViewingDayBookings({ date: dayData.date, bookings: dayData.bookings })
                          }
                        }}
                        className={`
                          min-h-[100px] p-2 border rounded-lg transition-colors
                          ${!dayData.isCurrentMonth ? 'bg-muted/30 text-muted-foreground' : 'bg-background'}
                          ${hasBookings ? 'cursor-pointer hover:border-primary hover:shadow-sm' : ''}
                          ${isTodayDate ? 'border-primary border-2 bg-primary/5' : 'border-border'}
                        `}
                      >
                        <div className={`text-sm font-medium mb-1 ${isTodayDate ? 'text-primary' : ''}`}>
                          {dayData.day}
                        </div>

                        {/* Bookings for this day */}
                        {dayData.bookings.length > 0 && (
                          <div className="space-y-1">
                            {dayData.bookings.slice(0, 2).map(booking => (
                              <div
                                key={booking.id}
                                className="text-xs p-1 rounded bg-muted cursor-pointer hover:bg-muted/80 group"
                                title={booking.podcast_name}
                              >
                                <div className="flex items-center gap-1 justify-between">
                                  <div
                                    className="flex items-center gap-1 flex-1 min-w-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setViewingBooking(booking)
                                    }}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${getStatusColor(booking.status)}`} />
                                    <span className="truncate font-medium">{booking.podcast_name}</span>
                                  </div>
                                  {(booking.recording_date || booking.scheduled_date) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const calendarEvent = createCalendarEventFromBooking(booking)
                                        if (calendarEvent) {
                                          openGoogleCalendar(calendarEvent)
                                          toast.success('Opening Google Calendar...')
                                        }
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:text-primary"
                                      title="Add to Google Calendar"
                                    >
                                      <CalendarPlus className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {dayData.bookings.length > 2 && (
                              <div className="text-xs text-muted-foreground text-center">
                                +{dayData.bookings.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm text-muted-foreground">Conversation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-muted-foreground">Booked</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-muted-foreground">Recorded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-sm text-muted-foreground">Published</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity" className="space-y-6">
        {/* Upcoming Recordings & Going Live Sections */}
        {enhancedStats && (enhancedStats.upcomingRecordings.length > 0 || enhancedStats.goingLiveSoon.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Upcoming Recordings */}
            {enhancedStats.upcomingRecordings.length > 0 && (
              <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-blue-900 dark:text-blue-100">Upcoming Recordings</CardTitle>
                  </div>
                  <CardDescription className="text-blue-800 dark:text-blue-200">
                    Your scheduled podcast recordings in the next 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {enhancedStats.upcomingRecordings.map((booking) => (
                      <div
                        key={booking.id}
                        onClick={() => setViewingBooking(booking)}
                        className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                      >
                        {booking.podcast_image_url && (
                          <img
                            src={booking.podcast_image_url}
                            alt={booking.podcast_name}
                            className="w-12 h-12 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{booking.podcast_name}</p>
                          <p className="text-xs text-muted-foreground">
                            📅 {formatUpcomingDate(booking.recording_date!)}
                          </p>
                          {booking.host_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              🎙️ Host: {booking.host_name}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {(booking.recording_date || booking.scheduled_date) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                const calendarEvent = createCalendarEventFromBooking(booking)
                                if (calendarEvent) {
                                  openGoogleCalendar(calendarEvent)
                                  toast.success('Opening Google Calendar...')
                                } else {
                                  toast.error('No date available for this booking')
                                }
                              }}
                              className="flex-shrink-0"
                            >
                              <CalendarPlus className="h-4 w-4 mr-1" />
                              <span className="hidden sm:inline">Add to Calendar</span>
                            </Button>
                          )}
                          {getStatusBadge(booking.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Going Live Soon */}
            {enhancedStats.goingLiveSoon.length > 0 && (
              <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Video className="h-5 w-5 text-green-600" />
                    <CardTitle className="text-green-900 dark:text-green-100">Going Live Soon</CardTitle>
                  </div>
                  <CardDescription className="text-green-800 dark:text-green-200">
                    Episodes publishing in the next 30 days
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {enhancedStats.goingLiveSoon.map((booking) => (
                      <div
                        key={booking.id}
                        onClick={() => setViewingBooking(booking)}
                        className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                      >
                        {booking.podcast_image_url && (
                          <img
                            src={booking.podcast_image_url}
                            alt={booking.podcast_name}
                            className="w-12 h-12 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{booking.podcast_name}</p>
                          <p className="text-xs text-muted-foreground">
                            🚀 Publishing {formatUpcomingDate(booking.publish_date!)}
                          </p>
                          {booking.audience_size && (
                            <p className="text-xs text-muted-foreground mt-1">
                              👥 {booking.audience_size.toLocaleString()} listeners
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {(booking.publish_date || booking.recording_date || booking.scheduled_date) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                const calendarEvent = createCalendarEventFromBooking(booking)
                                if (calendarEvent) {
                                  openGoogleCalendar(calendarEvent)
                                  toast.success('Opening Google Calendar...')
                                } else {
                                  toast.error('No date available for this booking')
                                }
                              }}
                              className="flex-shrink-0"
                            >
                              <CalendarPlus className="h-4 w-4 mr-1" />
                              <span className="hidden sm:inline">Add to Calendar</span>
                            </Button>
                          )}
                          {getStatusBadge(booking.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Activity Timeline */}
        {activityTimeline.length > 0 && (
          <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950 dark:to-purple-950">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-indigo-900 dark:text-indigo-100">Activity Timeline</CardTitle>
              </div>
              <CardDescription className="text-indigo-800 dark:text-indigo-200">
                Recent milestones and updates on your podcast journey
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-300 via-purple-300 to-pink-300 dark:from-indigo-700 dark:via-purple-700 dark:to-pink-700" />

                {/* Timeline items */}
                <div className="space-y-6">
                  {activityTimeline.map((activity, idx) => {
                    const iconConfig = {
                      published: { icon: CheckCheck, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900', border: 'border-purple-300 dark:border-purple-700' },
                      recorded: { icon: Video, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900', border: 'border-blue-300 dark:border-blue-700' },
                      booked: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900', border: 'border-green-300 dark:border-green-700' },
                      conversation: { icon: MessageSquare, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900', border: 'border-amber-300 dark:border-amber-700' }
                    }
                    const config = iconConfig[activity.type]
                    const Icon = config.icon

                    return (
                      <div
                        key={activity.id}
                        onClick={() => setViewingBooking(activity.booking)}
                        className="flex items-start gap-4 relative cursor-pointer group"
                      >
                        {/* Icon circle */}
                        <div className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full ${config.bg} ${config.border} border-2 shadow-sm group-hover:scale-110 transition-transform`}>
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>

                        {/* Content card */}
                        <div className="flex-1 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border group-hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm mb-1">{activity.message}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  {getRelativeTime(activity.date.toISOString())}
                                </span>
                                {activity.booking.audience_size && (
                                  <span className="text-xs text-muted-foreground">
                                    • 👥 {activity.booking.audience_size.toLocaleString()} listeners
                                  </span>
                                )}
                                {activity.booking.itunes_rating && (
                                  <span className="text-xs text-muted-foreground">
                                    • ⭐ {activity.booking.itunes_rating.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {activity.booking.podcast_image_url && (
                              <img
                                src={activity.booking.podcast_image_url}
                                alt={activity.booking.podcast_name}
                                className="w-12 h-12 rounded object-cover flex-shrink-0"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* View all hint */}
              {activityTimeline.length === 10 && (
                <div className="mt-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Showing your 10 most recent activities
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </TabsContent>

          {/* OUTREACH LIST TAB */}
          <TabsContent value="podcast-list" className="space-y-6">
            {client?.google_sheet_url ? (
              <>
                {/* Podcasts from Sheet */}
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle>Your Outreach Podcasts</CardTitle>
                        <CardDescription>
                          {outreachLoading ? 'Loading podcasts...' :
                           outreachData?.total ? `${outreachData.total} podcast${outreachData.total === 1 ? '' : 's'} in your outreach list` :
                           'Podcasts from your Google Sheet'}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchOutreach()}
                          disabled={outreachLoading}
                          className="flex-1 sm:flex-none"
                        >
                          <RefreshCw className={`h-4 w-4 sm:mr-2 ${outreachLoading ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">Refresh</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(client.google_sheet_url!, '_blank', 'noopener,noreferrer')}
                          className="flex-1 sm:flex-none"
                        >
                          <ExternalLink className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Open in Google Sheets</span>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {outreachLoading ? (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
                        <span className="text-muted-foreground">Loading podcasts from your outreach list...</span>
                      </div>
                    ) : outreachError ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <AlertCircle className="h-12 w-12 text-destructive mb-3" />
                        <h3 className="text-lg font-semibold mb-2">Failed to Load Podcasts</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                          There was an error loading your outreach list. Please try refreshing the page or contact support if the issue persists.
                        </p>
                      </div>
                    ) : outreachData?.podcasts && outreachData.podcasts.length > 0 ? (
                      <>
                        {/* Impact Stats */}
                        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-8">
                          {/* Total Potential Reach */}
                          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                            <CardContent className="pt-6">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Total Potential Reach</p>
                                <p className="text-3xl font-bold text-primary">
                                  {(() => {
                                    const totalReach = outreachData.podcasts.reduce((sum, p) => sum + (p.audience_size || 0), 0)
                                    if (totalReach >= 1000000) {
                                      return `${(totalReach / 1000000).toFixed(1)}M`
                                    } else if (totalReach >= 1000) {
                                      return `${(totalReach / 1000).toFixed(0)}K`
                                    }
                                    return totalReach.toLocaleString()
                                  })()}
                                </p>
                                <p className="text-xs text-muted-foreground">Combined audience</p>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Average Rating */}
                          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20">
                            <CardContent className="pt-6">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Average Rating</p>
                                <p className="text-3xl font-bold text-amber-600">
                                  {(() => {
                                    const rated = outreachData.podcasts.filter(p => {
                                      const rating = Number(p.itunes_rating)
                                      return !isNaN(rating) && rating > 0
                                    })
                                    if (rated.length === 0) return 'N/A'
                                    const avg = rated.reduce((sum, p) => sum + Number(p.itunes_rating), 0) / rated.length
                                    return `⭐ ${avg.toFixed(1)}`
                                  })()}
                                </p>
                                <p className="text-xs text-muted-foreground">Quality shows</p>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Total Podcasts */}
                          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                            <CardContent className="pt-6">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Total Podcasts</p>
                                <p className="text-3xl font-bold text-green-600">
                                  {outreachData.podcasts.length}
                                </p>
                                <p className="text-xs text-muted-foreground">In your outreach</p>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Total Episodes */}
                          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
                            <CardContent className="pt-6">
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Total Episodes</p>
                                <p className="text-3xl font-bold text-purple-600">
                                  {(() => {
                                    const totalEpisodes = outreachData.podcasts.reduce((sum, p) => sum + (p.episode_count || 0), 0)
                                    if (totalEpisodes >= 1000) {
                                      return `${(totalEpisodes / 1000).toFixed(1)}K`
                                    }
                                    return totalEpisodes.toLocaleString()
                                  })()}
                                </p>
                                <p className="text-xs text-muted-foreground">Content library</p>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                          {outreachData.podcasts
                            .slice((outreachPage - 1) * outreachPerPage, outreachPage * outreachPerPage)
                            .map((podcast) => (
                          <div
                            key={podcast.podcast_id}
                            className="flex flex-col gap-3 p-3 sm:p-4 sm:gap-4 rounded-lg border bg-card hover:shadow-lg transition-shadow cursor-pointer"
                            onClick={() => setViewingOutreachPodcast(podcast)}
                          >
                            {podcast.podcast_image_url && (
                              <img
                                src={podcast.podcast_image_url}
                                alt={podcast.podcast_name}
                                className="w-full h-40 sm:h-48 object-cover rounded-md"
                              />
                            )}
                            <div className="flex-1 space-y-2">
                              <h3 className="font-semibold text-lg line-clamp-2">{podcast.podcast_name}</h3>

                              {podcast.podcast_description && (
                                <p className="text-sm text-muted-foreground line-clamp-3">
                                  {podcast.podcast_description}
                                </p>
                              )}

                              <div className="flex flex-wrap gap-2 pt-2">
                                {podcast.audience_size && (
                                  <Badge variant="secondary" className="text-xs">
                                    👥 {podcast.audience_size.toLocaleString()}
                                  </Badge>
                                )}
                                {podcast.itunes_rating && (
                                  <Badge variant="secondary" className="text-xs">
                                    ⭐ {Number(podcast.itunes_rating).toFixed(1)}
                                  </Badge>
                                )}
                                {podcast.episode_count && (
                                  <Badge variant="secondary" className="text-xs">
                                    🎙️ {podcast.episode_count} eps
                                  </Badge>
                                )}
                              </div>

                              {podcast.publisher_name && (
                                <p className="text-xs text-muted-foreground">
                                  By {podcast.publisher_name}
                                </p>
                              )}
                            </div>

                            {podcast.podcast_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.open(podcast.podcast_url!, '_blank', 'noopener,noreferrer')
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Visit Podcast
                              </Button>
                            )}
                          </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {outreachData.podcasts.length > outreachPerPage && (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t">
                            <div className="text-sm text-muted-foreground text-center sm:text-left">
                              Showing {((outreachPage - 1) * outreachPerPage) + 1}-{Math.min(outreachPage * outreachPerPage, outreachData.podcasts.length)} of {outreachData.podcasts.length} podcasts
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOutreachPage(p => Math.max(1, p - 1))}
                                disabled={outreachPage === 1}
                                className="gap-1"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                <span className="hidden sm:inline">Previous</span>
                              </Button>
                              <div className="flex gap-1">
                                {Array.from({ length: Math.ceil(outreachData.podcasts.length / outreachPerPage) }, (_, i) => i + 1)
                                  .filter(page => {
                                    // Show first page, last page, current page, and pages adjacent to current
                                    const totalPages = Math.ceil(outreachData.podcasts.length / outreachPerPage)
                                    return page === 1 ||
                                           page === totalPages ||
                                           Math.abs(page - outreachPage) <= 1
                                  })
                                  .map((page, idx, arr) => {
                                    // Add ellipsis if there's a gap
                                    const prevPage = arr[idx - 1]
                                    const showEllipsis = prevPage && page - prevPage > 1

                                    return (
                                      <div key={page} className="flex gap-1">
                                        {showEllipsis && (
                                          <span className="px-3 py-1 text-sm text-muted-foreground">...</span>
                                        )}
                                        <Button
                                          variant={outreachPage === page ? "default" : "outline"}
                                          size="sm"
                                          onClick={() => setOutreachPage(page)}
                                          className="w-9"
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
                                onClick={() => setOutreachPage(p => Math.min(Math.ceil(outreachData.podcasts.length / outreachPerPage), p + 1))}
                                disabled={outreachPage === Math.ceil(outreachData.podcasts.length / outreachPerPage)}
                                className="gap-1"
                              >
                                <span className="hidden sm:inline">Next</span>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
                        <h3 className="text-lg font-semibold mb-2">No Podcasts Found</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                          No podcast IDs found in column E of your Google Sheet. Add podcast IDs to see them here!
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Outreach List Yet</h3>
                  <p className="text-muted-foreground max-w-md">
                    Your personalized outreach list hasn't been created yet. Contact your account manager to get started.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* PREMIUM PLACEMENTS TAB */}
          <TabsContent value="premium" className="space-y-6">
            {/* Header */}
            <Card className="bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
              <CardContent className="pt-6">
                <div className="text-center space-y-3">
                  <h2 className="text-2xl font-bold">Premium Podcast Placements</h2>
                  <p className="text-muted-foreground max-w-2xl mx-auto">
                    Browse our exclusive catalog of guaranteed podcast placements. Pick your shows, get booked, no pitching required.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Search and Sort */}
            <Card>
              <CardContent className="pt-4 sm:pt-6 space-y-4">
                {/* Search, Sort, and Mobile Filter Button */}
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search podcasts..."
                      value={premiumSearchQuery}
                      onChange={(e) => setPremiumSearchQuery(e.target.value)}
                      className="pl-10 pr-10 h-11"
                    />
                    {premiumSearchQuery && (
                      <button
                        onClick={() => setPremiumSearchQuery("")}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      >
                        <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    )}
                  </div>

                  <Select value={premiumSortBy} onValueChange={setPremiumSortBy}>
                    <SelectTrigger className="w-full sm:w-[200px] h-11">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="featured">Featured</SelectItem>
                      <SelectItem value="price-asc">Price: Low to High</SelectItem>
                      <SelectItem value="price-desc">Price: High to Low</SelectItem>
                      <SelectItem value="audience-desc">Audience: Large to Small</SelectItem>
                      <SelectItem value="audience-asc">Audience: Small to Large</SelectItem>
                      <SelectItem value="name-asc">Name: A-Z</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Mobile Filter Button */}
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="lg:hidden h-11">
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        Filters
                        {hasPremiumFilters && (
                          <Badge variant="destructive" className="ml-2 rounded-full px-2">
                            {[selectedCategory, selectedAudienceTier !== "all", selectedPriceRange !== "all"].filter(Boolean).length}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="right" className="w-[300px] overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Filters</SheetTitle>
                        <SheetDescription>
                          Refine your podcast search
                        </SheetDescription>
                      </SheetHeader>
                      <div className="space-y-6 mt-6">
                        {/* Mobile Category Filter */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Category</label>
                          <div className="space-y-2">
                            <Button
                              variant={selectedCategory === null ? "default" : "outline"}
                              size="sm"
                              onClick={() => setSelectedCategory(null)}
                              className="w-full justify-start h-10"
                            >
                              All Categories
                            </Button>
                            {PODCAST_CATEGORIES.map((category) => (
                              <Button
                                key={category}
                                variant={selectedCategory === category ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedCategory(category)}
                                className="w-full justify-start h-10"
                              >
                                {category}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Mobile Audience Filter */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Audience Size</label>
                          <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AUDIENCE_TIERS.map((tier) => (
                                <SelectItem key={tier.value} value={tier.value}>
                                  {tier.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Mobile Price Filter */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Price Range</label>
                          <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PRICE_RANGES.map((range) => (
                                <SelectItem key={range.value} value={range.value}>
                                  {range.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Clear Filters */}
                        {hasPremiumFilters && (
                          <Button onClick={clearPremiumFilters} variant="outline" className="w-full h-10">
                            <X className="h-4 w-4 mr-2" />
                            Clear All Filters
                          </Button>
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>

                {/* Desktop Category Pills - Hidden on Mobile */}
                <div className="hidden lg:flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Category:</span>
                  <Button
                    variant={selectedCategory === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                    className="h-8"
                  >
                    All
                  </Button>
                  {PODCAST_CATEGORIES.map((category) => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                      className="h-8 whitespace-nowrap"
                    >
                      {category}
                    </Button>
                  ))}
                </div>

                {/* Desktop Audience and Price Filters - Hidden on Mobile */}
                <div className="hidden lg:flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Audience:</span>
                    <Select value={selectedAudienceTier} onValueChange={setSelectedAudienceTier}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_TIERS.map((tier) => (
                          <SelectItem key={tier.value} value={tier.value}>
                            {tier.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Price:</span>
                    <Select value={selectedPriceRange} onValueChange={setSelectedPriceRange}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRICE_RANGES.map((range) => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {hasPremiumFilters && (
                    <Button onClick={clearPremiumFilters} variant="ghost" size="sm" className="h-9">
                      <X className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  )}
                </div>

                {/* Results Count */}
                <div className="text-xs sm:text-sm text-muted-foreground pt-2 border-t">
                  Showing <span className="font-semibold text-foreground">{filteredPremiumPodcasts.length}</span> of{' '}
                  <span className="font-semibold text-foreground">{premiumPodcasts?.length || 0}</span> podcasts
                </div>
              </CardContent>
            </Card>

            {/* Podcasts Grid */}
            {premiumLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground">Loading premium podcasts...</span>
              </div>
            ) : filteredPremiumPodcasts.length === 0 ? (
              <Card>
                <CardContent className="text-center py-20">
                  <Filter className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No podcasts found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search query
                  </p>
                  {premiumSearchQuery && (
                    <Button onClick={() => setPremiumSearchQuery("")} variant="outline">
                      <X className="h-4 w-4 mr-2" />
                      Clear Search
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPremiumPodcasts.map((podcast) => (
                  <Card key={podcast.id} className="overflow-hidden hover:shadow-lg transition-all">
                    {/* Podcast Image */}
                    <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5">
                      {podcast.podcast_image_url ? (
                        <img
                          src={podcast.podcast_image_url}
                          alt={podcast.podcast_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mic className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                      {podcast.is_featured && (
                        <Badge className="absolute top-4 right-4 bg-gradient-to-r from-primary to-purple-600">
                          ⭐ Featured
                        </Badge>
                      )}
                    </div>

                    <CardContent className="p-6">
                      {/* Podcast Name */}
                      <h3 className="text-xl font-bold mb-4 line-clamp-2 min-h-[3.5rem]">
                        {podcast.podcast_name}
                      </h3>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {podcast.audience_size && (
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Audience</p>
                              <p className="font-semibold text-sm">{podcast.audience_size}</p>
                            </div>
                          </div>
                        )}
                        {podcast.rating && (
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Rating</p>
                              <p className="font-semibold text-sm">{podcast.rating}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Why This Show */}
                      {podcast.why_this_show && (
                        <div className="mb-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="h-4 w-4 text-purple-500" />
                            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase">
                              Why This Show
                            </p>
                          </div>
                          <p className="text-sm">{getPreviewText(podcast.why_this_show)}</p>
                        </div>
                      )}

                      {/* Features - Collapsible */}
                      {podcast.whats_included && podcast.whats_included.length > 0 && (
                        <div className="mb-4">
                          <button
                            onClick={() => togglePremiumFeatures(podcast.id)}
                            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase py-2"
                          >
                            <span>What's Included</span>
                            {expandedPremiumCards.has(podcast.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          {expandedPremiumCards.has(podcast.id) && (
                            <div className="space-y-2 mt-2">
                              {podcast.whats_included.map((feature, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-sm">
                                  <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                  {feature}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Price & CTA */}
                      <div className="border-t pt-4">
                        <div className="mb-4">
                          <p className="text-xs text-muted-foreground uppercase">Investment</p>
                          <p className="text-3xl font-bold">{podcast.price}</p>
                          <p className="text-xs text-muted-foreground">One-time placement</p>
                        </div>
                        {isInCart(podcast.id) ? (
                          <Button className="w-full bg-green-600 hover:bg-green-700" size="lg" disabled>
                            <CheckCircle2 className="mr-2 h-5 w-5" />
                            Added to Cart
                          </Button>
                        ) : (
                          <Button
                            className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                            size="lg"
                            onClick={() => handleAddToCart(podcast)}
                          >
                            <ShoppingCart className="mr-2 h-5 w-5" />
                            Add to Cart
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Booking Detail Modal */}
      <Dialog open={!!viewingBooking} onOpenChange={() => setViewingBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Podcast Details</DialogTitle>
            <DialogDescription>
              Complete information about this booking
            </DialogDescription>
          </DialogHeader>
          {viewingBooking && (
            <div className="space-y-6">
              {/* Addon Upsell Banner - Show for published episodes */}
              {viewingBooking.status === 'published' && addonServices && addonServices[0] && (
                <AddonUpsellBanner
                  bookingId={viewingBooking.id}
                  service={addonServices[0]}
                  existingAddon={bookingAddons?.[0] || null}
                  onPurchaseClick={() => {
                    toast.info('Checkout coming soon!')
                    // TODO: Implement Stripe checkout
                  }}
                />
              )}

              {/* Podcast Header */}
              <div className="flex gap-4">
                {viewingBooking.podcast_image_url && (
                  <img
                    src={viewingBooking.podcast_image_url}
                    alt={viewingBooking.podcast_name}
                    className="w-24 h-24 rounded-lg object-cover shadow-md"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold">{viewingBooking.podcast_name}</h3>
                  {viewingBooking.host_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Host: {viewingBooking.host_name}</span>
                    </div>
                  )}
                  {viewingBooking.podcast_url && (
                    <a
                      href={viewingBooking.podcast_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      Visit Podcast
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Stats */}
              {(viewingBooking.audience_size || viewingBooking.episode_count || viewingBooking.itunes_rating) && (
                <div className="grid grid-cols-3 gap-4">
                  {viewingBooking.audience_size && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Audience</p>
                      <p className="text-xl font-bold">{viewingBooking.audience_size.toLocaleString()}</p>
                    </div>
                  )}
                  {viewingBooking.episode_count && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Episodes</p>
                      <p className="text-xl font-bold">{viewingBooking.episode_count}</p>
                    </div>
                  )}
                  {viewingBooking.itunes_rating && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Rating</p>
                      <p className="text-xl font-bold">{viewingBooking.itunes_rating.toFixed(1)} ⭐</p>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {viewingBooking.podcast_description && (
                <div>
                  <h4 className="font-semibold mb-2">About the Podcast</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {viewingBooking.podcast_description}
                  </p>
                </div>
              )}

              {/* Booking Info */}
              <div className="space-y-3">
                <h4 className="font-semibold">Booking Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="mt-1">{getStatusBadge(viewingBooking.status)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Scheduled:</span>
                    <p className="mt-1 font-medium">{formatDate(viewingBooking.scheduled_date)}</p>
                  </div>
                  {viewingBooking.recording_date && (
                    <div>
                      <span className="text-muted-foreground">Recording:</span>
                      <p className="mt-1 font-medium">{formatDate(viewingBooking.recording_date)}</p>
                    </div>
                  )}
                  {viewingBooking.publish_date && (
                    <div>
                      <span className="text-muted-foreground">Publish Date:</span>
                      <p className="mt-1 font-medium">{formatDate(viewingBooking.publish_date)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Episode Link */}
              {viewingBooking.episode_url && (
                <div>
                  <h4 className="font-semibold mb-2">Episode Link</h4>
                  <a
                    href={viewingBooking.episode_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Listen to your episode
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setViewingBooking(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Outreach Podcast Detail Modal */}
      <Dialog open={!!viewingOutreachPodcast} onOpenChange={() => setViewingOutreachPodcast(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Podcast Details</DialogTitle>
            <DialogDescription>
              Detailed information about this outreach podcast
            </DialogDescription>
          </DialogHeader>
          {viewingOutreachPodcast && (
            <div className="space-y-6">
              {/* Podcast Header */}
              <div className="flex flex-col sm:flex-row gap-4">
                {viewingOutreachPodcast.podcast_image_url && (
                  <img
                    src={viewingOutreachPodcast.podcast_image_url}
                    alt={viewingOutreachPodcast.podcast_name}
                    className="w-24 h-24 sm:w-24 sm:h-24 rounded-lg object-cover shadow-md mx-auto sm:mx-0"
                  />
                )}
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <h3 className="text-xl font-bold">{viewingOutreachPodcast.podcast_name}</h3>
                  {viewingOutreachPodcast.publisher_name && (
                    <div className="flex items-center justify-center sm:justify-start gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Publisher: {viewingOutreachPodcast.publisher_name}</span>
                    </div>
                  )}
                  {viewingOutreachPodcast.podcast_url && (
                    <a
                      href={viewingOutreachPodcast.podcast_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Globe className="h-4 w-4" />
                      Visit Podcast
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Stats */}
              {(viewingOutreachPodcast.audience_size || viewingOutreachPodcast.episode_count || viewingOutreachPodcast.itunes_rating) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {viewingOutreachPodcast.audience_size && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Audience Size</p>
                      <p className="text-xl font-bold">{viewingOutreachPodcast.audience_size.toLocaleString()}</p>
                    </div>
                  )}
                  {viewingOutreachPodcast.episode_count && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Episodes</p>
                      <p className="text-xl font-bold">{viewingOutreachPodcast.episode_count}</p>
                    </div>
                  )}
                  {viewingOutreachPodcast.itunes_rating && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Rating</p>
                      <p className="text-xl font-bold">{Number(viewingOutreachPodcast.itunes_rating).toFixed(1)} ⭐</p>
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {viewingOutreachPodcast.podcast_description && (
                <div>
                  <h4 className="font-semibold mb-2">About the Podcast</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {viewingOutreachPodcast.podcast_description}
                  </p>
                </div>
              )}

              {/* Podcast ID */}
              <div>
                <h4 className="font-semibold mb-2">Podcast ID</h4>
                <div className="p-3 bg-muted rounded-lg">
                  <code className="text-xs">{viewingOutreachPodcast.podcast_id}</code>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {viewingOutreachPodcast.podcast_url && (
                  <Button
                    variant="default"
                    onClick={() => window.open(viewingOutreachPodcast.podcast_url!, '_blank', 'noopener,noreferrer')}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visit Podcast Website
                  </Button>
                )}
                <Button variant="outline" onClick={() => setViewingOutreachPodcast(null)} className="sm:w-auto">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Day Bookings Modal */}
      <Dialog open={!!viewingDayBookings} onOpenChange={() => setViewingDayBookings(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Bookings for {viewingDayBookings?.date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </DialogTitle>
            <DialogDescription>
              {viewingDayBookings?.bookings.length} {viewingDayBookings?.bookings.length === 1 ? 'booking' : 'bookings'} scheduled for this day
            </DialogDescription>
          </DialogHeader>
          {viewingDayBookings && (
            <div className="space-y-3">
              {viewingDayBookings.bookings.map(booking => (
                <div
                  key={booking.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:shadow-md transition-shadow"
                >
                  {booking.podcast_image_url && (
                    <img
                      src={booking.podcast_image_url}
                      alt={booking.podcast_name}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <h4 className="font-semibold text-lg truncate">{booking.podcast_name}</h4>
                      {booking.host_name && (
                        <p className="text-sm text-muted-foreground">Host: {booking.host_name}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {booking.audience_size && (
                        <span className="text-muted-foreground">
                          👥 {booking.audience_size.toLocaleString()} listeners
                        </span>
                      )}
                      {booking.itunes_rating && (
                        <span className="text-muted-foreground">
                          ⭐ {booking.itunes_rating.toFixed(1)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(booking.status)}
                      {booking.recording_date && (
                        <span className="text-xs text-muted-foreground">
                          📅 Recording: {formatDate(booking.recording_date)}
                        </span>
                      )}
                    </div>

                    {booking.podcast_description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {booking.podcast_description}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {(booking.recording_date || booking.scheduled_date) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          const calendarEvent = createCalendarEventFromBooking(booking)
                          if (calendarEvent) {
                            openGoogleCalendar(calendarEvent)
                            toast.success('Opening Google Calendar...')
                          } else {
                            toast.error('No date available for this booking')
                          }
                        }}
                        className="w-full"
                      >
                        <CalendarPlus className="h-4 w-4 mr-2" />
                        Add to Calendar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setViewingDayBookings(null)
                        setViewingBooking(booking)
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

        {/* Cart Components */}
        <CartButton />
        <CartDrawer />
      </div>
    </PortalLayout>
  )
}
