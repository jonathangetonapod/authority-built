import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { PortalLayout } from '@/components/portal/PortalLayout'
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
import {
  Calendar,
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
  FileText
} from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getClientBookings } from '@/services/clientPortal'
import type { Booking } from '@/services/bookings'

type TimeRange = 'all' | 'month' | 'quarter' | 'year'

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
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set())

  // Fetch bookings
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['client-bookings', client?.id],
    queryFn: () => getClientBookings(client!.id),
    enabled: !!client
  })

  // Helper functions for date filtering
  const getDateRange = () => {
    const start = new Date(selectedDate)
    const end = new Date(selectedDate)

    if (timeRange === 'month') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(end.getMonth() + 1)
      end.setDate(0)
      end.setHours(23, 59, 59, 999)
    } else if (timeRange === 'quarter') {
      const quarter = Math.floor(selectedDate.getMonth() / 3)
      start.setMonth(quarter * 3, 1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(quarter * 3 + 3, 0)
      end.setHours(23, 59, 59, 999)
    } else if (timeRange === 'year') {
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
      end.setMonth(11, 31)
      end.setHours(23, 59, 59, 999)
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
  }, [bookings, timeRange, selectedDate])

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (timeRange === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    } else if (timeRange === 'quarter') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 3 : -3))
    } else if (timeRange === 'year') {
      newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
    }
    setSelectedDate(newDate)
  }

  const getDisplayDate = () => {
    if (timeRange === 'all') return 'All Time'
    if (timeRange === 'month') {
      return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    if (timeRange === 'quarter') {
      const quarter = Math.floor(selectedDate.getMonth() / 3) + 1
      return `Q${quarter} ${selectedDate.getFullYear()}`
    }
    if (timeRange === 'year') {
      return selectedDate.getFullYear().toString()
    }
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
      { name: 'Booked', value: filteredByTimeRange.filter(b => b.status === 'booked').length, color: '#10b981' },
      { name: 'Recorded', value: filteredByTimeRange.filter(b => b.status === 'recorded').length, color: '#3b82f6' },
      { name: 'Published', value: filteredByTimeRange.filter(b => b.status === 'published').length, color: '#8b5cf6' },
      { name: 'In Progress', value: filteredByTimeRange.filter(b => b.status === 'in_progress').length, color: '#eab308' },
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

  // Next Steps / Action Items
  const nextSteps = useMemo(() => {
    if (!bookings) return []

    const now = new Date()
    const sevenDaysFromNow = new Date()
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const fourteenDaysFromNow = new Date()
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)

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
      // Recording coming up in next 7 days - prepare talking points
      if (booking.recording_date && (booking.status === 'booked' || booking.status === 'in_progress' || booking.status === 'conversation_started')) {
        const recordingDate = new Date(booking.recording_date)
        if (recordingDate >= now && recordingDate <= sevenDaysFromNow) {
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

      // Episode going live in next 7 days - share on social
      if (booking.publish_date && (booking.status === 'recorded' || booking.status === 'published')) {
        const publishDate = new Date(booking.publish_date)
        if (publishDate >= now && publishDate <= sevenDaysFromNow) {
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

      // Episode published in last 14 days - share it
      if (booking.publish_date && booking.status === 'published' && booking.episode_url) {
        const publishDate = new Date(booking.publish_date)
        const fourteenDaysAgo = new Date(now)
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
        if (publishDate >= fourteenDaysAgo && publishDate <= now) {
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
  }, [bookings, completedActions])

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
    booked: filteredByTimeRange?.filter(b => b.status === 'booked').length || 0,
    recorded: filteredByTimeRange?.filter(b => b.status === 'recorded').length || 0,
    published: filteredByTimeRange?.filter(b => b.status === 'published').length || 0,
    conversations: filteredByTimeRange?.filter(b => b.status === 'conversation_started').length || 0,
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {client?.contact_person || client?.name}!</h1>
          <p className="text-muted-foreground mt-1">
            Your podcast journey dashboard
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Time Range Selector */}
            <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant={timeRange === 'all' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('all')}
                  size="sm"
                >
                  All Time
                </Button>
                <Button
                  variant={timeRange === 'month' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('month')}
                  size="sm"
                >
                  Month
                </Button>
                <Button
                  variant={timeRange === 'quarter' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('quarter')}
                  size="sm"
                >
                  Quarter
                </Button>
                <Button
                  variant={timeRange === 'year' ? 'default' : 'outline'}
                  onClick={() => setTimeRange('year')}
                  size="sm"
                >
                  Year
                </Button>
              </div>

              {timeRange !== 'all' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateMonth('prev')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[150px] text-center font-semibold">
                    {getDisplayDate()}
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigateMonth('next')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

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
            <div className="flex items-center gap-2">
              <Target className="h-6 w-6 text-emerald-600" />
              <div>
                <CardTitle className="text-2xl text-emerald-900 dark:text-emerald-100">Next Steps</CardTitle>
                <CardDescription className="text-emerald-800 dark:text-emerald-200">
                  Action items to maximize your podcast impact
                </CardDescription>
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
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No bookings found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.slice(0, 5).map((booking) => (
                  <div
                    key={booking.id}
                    onClick={() => setViewingBooking(booking)}
                    className="flex items-center gap-4 p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {booking.podcast_image_url && (
                      <img
                        src={booking.podcast_image_url}
                        alt={booking.podcast_name}
                        className="w-16 h-16 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{booking.podcast_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.host_name || 'Host not specified'}
                      </p>
                      {booking.audience_size && (
                        <p className="text-xs text-muted-foreground mt-1">
                          👥 {booking.audience_size.toLocaleString()} listeners
                        </p>
                      )}
                    </div>
                    {getStatusBadge(booking.status)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
                                onClick={() => setViewingBooking(booking)}
                                className="text-xs p-1 rounded bg-muted truncate cursor-pointer hover:bg-muted/80"
                                title={booking.podcast_name}
                              >
                                <div className="flex items-center gap-1">
                                  <span className={`w-2 h-2 rounded-full ${getStatusColor(booking.status)}`} />
                                  <span className="truncate font-medium">{booking.podcast_name}</span>
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
                        {getStatusBadge(booking.status)}
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
                        {getStatusBadge(booking.status)}
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
        </Tabs>

        {/* Full Bookings Table - Outside Tabs */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Your Podcast Bookings</CardTitle>
                <CardDescription>
                  Track the status of all your podcast placements
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-[200px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search podcasts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="conversation_started">Conversation Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="recorded">Recorded</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="audience">Audience Size</SelectItem>
                    <SelectItem value="rating">Rating</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="w-full sm:w-auto"
                >
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  {sortOrder === 'asc' ? 'Asc' : 'Desc'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  disabled={filteredBookings.length === 0}
                  className="w-full sm:w-auto"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
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
                <p className="text-sm">No bookings found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Podcast</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Episode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((booking) => (
                      <TableRow key={booking.id} className="cursor-pointer" onClick={() => setViewingBooking(booking)}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-primary hover:underline">{booking.podcast_name}</p>
                            {booking.audience_size && (
                              <p className="text-xs text-muted-foreground">
                                👥 {booking.audience_size.toLocaleString()} listeners
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {booking.host_name || '-'}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(booking.status)}
                        </TableCell>
                        <TableCell>
                          {booking.itunes_rating ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-sm font-medium">{booking.itunes_rating.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(booking.scheduled_date)}
                        </TableCell>
                        <TableCell>
                          {booking.episode_url ? (
                            <a
                              href={booking.episode_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Listen
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </PortalLayout>
  )
}
