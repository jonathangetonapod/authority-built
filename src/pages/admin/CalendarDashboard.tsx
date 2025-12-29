import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Users, Calendar as CalendarIcon, CheckCircle2, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Filter, CheckCheck, Loader2, Video, Trash2, CalendarPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getClients } from '@/services/clients'
import { getBookings, getBookingsByMonth, updateBooking, deleteBooking } from '@/services/bookings'
import { createCalendarEventFromBooking, openGoogleCalendar } from '@/lib/googleCalendar'
import { toast } from 'sonner'

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


export default function CalendarDashboard() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 1)) // January 2025
  const [selectedDay, setSelectedDay] = useState<{ date: Date; bookings: any[] } | null>(null)
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [bookingsStatusFilter, setBookingsStatusFilter] = useState('all')
  const [bookingsSearchTerm, setBookingsSearchTerm] = useState('')
  const [bookingsDateFrom, setBookingsDateFrom] = useState('')
  const [bookingsDateTo, setBookingsDateTo] = useState('')
  const [calendarStatusFilter, setCalendarStatusFilter] = useState('all')
  const [calendarClientFilter, setCalendarClientFilter] = useState('all')
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [clientsPerPage] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [editingBooking, setEditingBooking] = useState<any>(null)
  const [deletingBooking, setDeletingBooking] = useState<any>(null)
  const [editBookingForm, setEditBookingForm] = useState({
    podcast_name: '',
    host_name: '',
    podcast_url: '',
    scheduled_date: '',
    recording_date: '',
    publish_date: '',
    episode_url: '',
    status: 'booked' as const,
    notes: '',
    prep_sent: false
  })

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const queryClient = useQueryClient()

  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients({ status: 'active' })
  })

  // Fetch all bookings for the "All Bookings" tab
  const { data: allBookingsData, isLoading: allBookingsLoading } = useQuery({
    queryKey: ['bookings', 'all'],
    queryFn: () => getBookings()
  })

  // Fetch bookings for current month (for calendar view)
  const { data: monthBookingsData, isLoading: monthBookingsLoading } = useQuery({
    queryKey: ['bookings', 'month', year, month],
    queryFn: () => getBookingsByMonth(year, month)
  })

  const clients = clientsData?.clients || []
  const allBookings = allBookingsData?.bookings || []
  const monthBookings = monthBookingsData || []

  // Update booking mutation
  const updateBookingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateBooking(id, updates),
    onSuccess: () => {
      // Invalidate all booking queries to refresh all views
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setEditingBooking(null)
    }
  })

  // Delete booking mutation
  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: () => {
      // Invalidate all booking queries to refresh all views
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setDeletingBooking(null)
      setSelectedDay(null)
      setEditingBooking(null)
    }
  })

  const handleEditBooking = (booking: any) => {
    setEditingBooking(booking)
    setEditBookingForm({
      podcast_name: booking.podcast_name,
      host_name: booking.host_name || '',
      podcast_url: booking.podcast_url || '',
      scheduled_date: booking.scheduled_date || '',
      recording_date: booking.recording_date || '',
      publish_date: booking.publish_date || '',
      episode_url: booking.episode_url || '',
      status: booking.status,
      notes: booking.notes || '',
      prep_sent: booking.prep_sent || false
    })
  }

  const handleSaveBooking = () => {
    if (editingBooking && editBookingForm.podcast_name) {
      updateBookingMutation.mutate({
        id: editingBooking.id,
        updates: editBookingForm
      })
    }
  }

  const handleDeleteBooking = (booking: any) => {
    setDeletingBooking(booking)
  }

  const confirmDelete = () => {
    if (deletingBooking) {
      deleteBookingMutation.mutate(deletingBooking.id)
    }
  }

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  // Navigate months
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get bookings for a specific date (show conversation_started, booked, recorded, published - not in_progress)
  const getBookingsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return monthBookings.filter(b => {
      const matchesDate = b.scheduled_date === dateStr
      const isVisibleStatus = b.status === 'conversation_started' || b.status === 'booked' || b.status === 'recorded' || b.status === 'published'
      const matchesStatusFilter = calendarStatusFilter === 'all' || b.status === calendarStatusFilter
      const matchesClientFilter = calendarClientFilter === 'all' || b.client_id === calendarClientFilter
      return matchesDate && isVisibleStatus && matchesStatusFilter && matchesClientFilter
    })
  }

  // Build calendar grid
  const calendarDays = []

  // Previous month's trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const date = new Date(year, month - 1, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: false,
      bookings: getBookingsForDate(date)
    })
  }

  // Current month's days
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: true,
      bookings: getBookingsForDate(date)
    })
  }

  // Next month's leading days
  const remainingDays = 42 - calendarDays.length // 6 rows * 7 days
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(year, month + 1, day)
    calendarDays.push({
      day,
      date,
      isCurrentMonth: false,
      bookings: getBookingsForDate(date)
    })
  }

  // Get today's date for highlighting
  const today = new Date()
  const isToday = (date: Date) => {
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  // Calculate stats for current month (count conversation_started, booked, recorded, published)
  const visibleMonthBookings = monthBookings.filter(b => {
    const isVisibleStatus = b.status === 'conversation_started' || b.status === 'booked' || b.status === 'recorded' || b.status === 'published'
    const matchesStatusFilter = calendarStatusFilter === 'all' || b.status === calendarStatusFilter
    const matchesClientFilter = calendarClientFilter === 'all' || b.client_id === calendarClientFilter
    return isVisibleStatus && matchesStatusFilter && matchesClientFilter
  })
  const conversationStartedCount = visibleMonthBookings.filter(b => b.status === 'conversation_started').length
  const bookedCount = visibleMonthBookings.filter(b => b.status === 'booked').length
  const recordedCount = visibleMonthBookings.filter(b => b.status === 'recorded').length
  const publishedCount = visibleMonthBookings.filter(b => b.status === 'published').length
  const uniqueClients = new Set(visibleMonthBookings.map(b => b.client_id)).size

  const handleDayClick = (dayData: any) => {
    if (dayData.bookings.length > 0) {
      setSelectedDay(dayData)
    }
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

  const getStatusBadge = (status: string) => {
    const styles = {
      conversation_started: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      booked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      recorded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      published: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    }
    return (
      <Badge className={styles[status as keyof typeof styles]}>
        {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </Badge>
    )
  }

  // Client tracking functions
  const toggleClientExpanded = (clientId: string) => {
    const newExpanded = new Set(expandedClients)
    if (newExpanded.has(clientId)) {
      newExpanded.delete(clientId)
    } else {
      newExpanded.add(clientId)
    }
    setExpandedClients(newExpanded)
  }

  const getClientStats = (clientId: string) => {
    const clientBookings = allBookings.filter(b => b.client_id === clientId)
    return {
      total: clientBookings.length,
      booked: clientBookings.filter(b => b.status === 'booked').length,
      inProgress: clientBookings.filter(b => b.status === 'in_progress').length,
      recorded: clientBookings.filter(b => b.status === 'recorded').length,
      published: clientBookings.filter(b => b.status === 'published').length,
    }
  }

  // Show loading state
  if (clientsLoading || allBookingsLoading || monthBookingsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Podcast Calendar</h1>
          <p className="text-muted-foreground">Track client bookings and progress</p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="clients">Client Tracking</TabsTrigger>
            <TabsTrigger value="all-bookings">All Podcasts</TabsTrigger>
          </TabsList>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{visibleMonthBookings.length}</div>
              <p className="text-xs text-muted-foreground">Total bookings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversation Started</CardTitle>
              <Users className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{conversationStartedCount}</div>
              <p className="text-xs text-muted-foreground">Initial contact</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Booked</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
              <p className="text-xs text-muted-foreground">Confirmed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recorded</CardTitle>
              <Video className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{recordedCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting publish</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCheck className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{publishedCount}</div>
              <p className="text-xs text-muted-foreground">Live episodes</p>
            </CardContent>
          </Card>
        </div>

        {/* Calendar */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="text-2xl">
                {monthNames[month]} {year}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={calendarClientFilter} onValueChange={setCalendarClientFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Clients</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={calendarStatusFilter} onValueChange={setCalendarStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="conversation_started">Conversation Started</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="recorded">Recorded</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
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
                    onClick={() => handleDayClick(dayData)}
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
                        {dayData.bookings.slice(0, 3).map(booking => (
                          <div
                            key={booking.id}
                            className="text-xs p-1 rounded bg-muted truncate"
                            title={`${booking.client.name} - ${booking.podcast_name}`}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${getStatusColor(booking.status)}`} />
                              <span className="truncate font-medium">{booking.client.name}</span>
                            </div>
                          </div>
                        ))}
                        {dayData.bookings.length > 3 && (
                          <div className="text-xs text-muted-foreground text-center">
                            +{dayData.bookings.length - 3} more
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
                <span className="text-sm text-muted-foreground">Conversation Started</span>
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

          {/* Client Tracking Tab */}
          <TabsContent value="clients" className="space-y-6">
            {/* Stats Cards for Client View */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{clients.length}</div>
                  <p className="text-xs text-muted-foreground">Active clients</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{allBookings.length}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {allBookings.filter(b => b.status === 'in_progress').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Coordinating</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Booked</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {allBookings.filter(b => b.status === 'booked').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Confirmed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recorded</CardTitle>
                  <Video className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {allBookings.filter(b => b.status === 'recorded').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Awaiting publish</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Live</CardTitle>
                  <CheckCheck className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {allBookings.filter(b => b.status === 'published').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Published</p>
                </CardContent>
              </Card>
            </div>

            {/* Search Bar */}
            <Card>
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients..."
                    value={clientSearchTerm}
                    onChange={(e) => {
                      setClientSearchTerm(e.target.value)
                      setCurrentPage(1) // Reset to first page on search
                    }}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Client Cards */}
            <div className="space-y-4">
              {clients
                .filter(client =>
                  client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                  (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                )
                .slice((currentPage - 1) * clientsPerPage, currentPage * clientsPerPage)
                .map(client => {
                const stats = getClientStats(client.id)
                const isExpanded = expandedClients.has(client.id)
                const clientBookings = allBookings
                  .filter(b => b.client_id === client.id)
                  .sort((a, b) => new Date(b.scheduled_date || '').getTime() - new Date(a.scheduled_date || '').getTime())
                const completionRate = stats.total > 0 ? (stats.published / stats.total) * 100 : 0

                return (
                  <Card key={client.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <Link
                              to={`/admin/clients/${client.id}`}
                              className="text-xl font-bold hover:text-primary hover:underline"
                            >
                              {client.name}
                            </Link>
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{client.email}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleClientExpanded(client.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Progress Overview */}
                      <div className="space-y-4">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-5 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold">{stats.total}</div>
                            <div className="text-xs text-muted-foreground">Total</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-600">{stats.booked}</div>
                            <div className="text-xs text-muted-foreground">Booked</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
                            <div className="text-xs text-muted-foreground">In Progress</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-blue-600">{stats.recorded}</div>
                            <div className="text-xs text-muted-foreground">Recorded</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-purple-600">{stats.published}</div>
                            <div className="text-xs text-muted-foreground">Published</div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-muted-foreground">Completion Rate</span>
                            <span className="font-medium">{completionRate.toFixed(0)}%</span>
                          </div>
                          <Progress value={completionRate} className="h-2" />
                        </div>

                        {/* Visual Pipeline */}
                        <div className="flex items-center gap-2 pt-2">
                          {stats.booked > 0 && (
                            <div className="flex-1 bg-green-500 h-8 rounded flex items-center justify-center text-white text-sm font-medium">
                              {stats.booked} Booked
                            </div>
                          )}
                          {stats.inProgress > 0 && (
                            <div className="flex-1 bg-yellow-500 h-8 rounded flex items-center justify-center text-white text-sm font-medium">
                              {stats.inProgress} In Progress
                            </div>
                          )}
                          {stats.recorded > 0 && (
                            <div className="flex-1 bg-blue-500 h-8 rounded flex items-center justify-center text-white text-sm font-medium">
                              {stats.recorded} Recorded
                            </div>
                          )}
                          {stats.published > 0 && (
                            <div className="flex-1 bg-purple-500 h-8 rounded flex items-center justify-center text-white text-sm font-medium">
                              {stats.published} Published
                            </div>
                          )}
                        </div>

                        {/* Expanded Bookings List */}
                        {isExpanded && (
                          <div className="mt-6 space-y-2 border-t pt-4">
                            <h4 className="font-semibold text-sm mb-3">All Bookings</h4>
                            {clientBookings.map(booking => (
                              <div
                                key={booking.id}
                                className="flex items-center justify-between p-3 bg-muted rounded-lg gap-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{booking.podcast_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {booking.scheduled_date ? new Date(booking.scheduled_date).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    }) : 'No date set'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {(booking.recording_date || booking.scheduled_date) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
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
                                      title="Add to Google Calendar"
                                    >
                                      <CalendarPlus className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {getStatusBadge(booking.status)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Pagination */}
            {(() => {
              const filteredClients = clients.filter(client =>
                client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase()))
              )
              const totalPages = Math.ceil(filteredClients.length / clientsPerPage)

              if (totalPages <= 1) return null

              return (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * clientsPerPage) + 1} to {Math.min(currentPage * clientsPerPage, filteredClients.length)} of {filteredClients.length} clients
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <Button
                              key={page}
                              variant={page === currentPage ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(page)}
                              className="w-10"
                            >
                              {page}
                            </Button>
                          ))}
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
                    </div>
                  </CardContent>
                </Card>
              )
            })()}
          </TabsContent>

          {/* All Podcasts Tab */}
          <TabsContent value="all-bookings" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Podcasts</CardTitle>
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{allBookings.length}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">
                    {allBookings.filter(b => b.status === 'in_progress').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Coordinating</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Booked</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {allBookings.filter(b => b.status === 'booked').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Confirmed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recorded</CardTitle>
                  <Video className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {allBookings.filter(b => b.status === 'recorded').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Awaiting publish</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Published</CardTitle>
                  <CheckCheck className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {allBookings.filter(b => b.status === 'published').length}
                  </div>
                  <p className="text-xs text-muted-foreground">Live episodes</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4">
                  <CardTitle>All Podcasts</CardTitle>
                  <div className="flex flex-col sm:flex-row gap-2 w-full">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search client or podcast..."
                        value={bookingsSearchTerm}
                        onChange={(e) => setBookingsSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select value={bookingsStatusFilter} onValueChange={setBookingsStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="recorded">Recorded</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      placeholder="From date"
                      value={bookingsDateFrom}
                      onChange={(e) => setBookingsDateFrom(e.target.value)}
                      className="w-full sm:w-[180px]"
                    />
                    <Input
                      type="date"
                      placeholder="To date"
                      value={bookingsDateTo}
                      onChange={(e) => setBookingsDateTo(e.target.value)}
                      className="w-full sm:w-[180px]"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date Added</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Podcast</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allBookings
                        .filter(booking => {
                          const matchesStatus = bookingsStatusFilter === 'all' || booking.status === bookingsStatusFilter
                          const matchesSearch = bookingsSearchTerm === '' ||
                            booking.client.name.toLowerCase().includes(bookingsSearchTerm.toLowerCase()) ||
                            booking.podcast_name.toLowerCase().includes(bookingsSearchTerm.toLowerCase())

                          // Date filtering
                          let matchesDate = true
                          if (bookingsDateFrom) {
                            const createdDate = new Date(booking.created_at).toISOString().split('T')[0]
                            matchesDate = matchesDate && createdDate >= bookingsDateFrom
                          }
                          if (bookingsDateTo) {
                            const createdDate = new Date(booking.created_at).toISOString().split('T')[0]
                            matchesDate = matchesDate && createdDate <= bookingsDateTo
                          }

                          return matchesStatus && matchesSearch && matchesDate
                        })
                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                        .map(booking => (
                          <TableRow key={booking.id}>
                            <TableCell className="font-medium">
                              {new Date(booking.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </TableCell>
                            <TableCell>
                              <Link
                                to={`/admin/clients/${booking.client_id}`}
                                className="hover:text-primary hover:underline"
                              >
                                {booking.client.name}
                              </Link>
                            </TableCell>
                            <TableCell>{booking.podcast_name}</TableCell>
                            <TableCell className="text-center">
                              {getStatusBadge(booking.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditBooking(booking)}
                                >
                                  Edit
                                </Button>
                                {(booking.recording_date || booking.scheduled_date) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const calendarEvent = createCalendarEventFromBooking(booking)
                                      if (calendarEvent) {
                                        openGoogleCalendar(calendarEvent)
                                        toast.success('Opening Google Calendar...')
                                      } else {
                                        toast.error('No date available for this booking')
                                      }
                                    }}
                                    title="Add to Google Calendar"
                                  >
                                    <CalendarPlus className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteBooking(booking)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>

                {allBookings.filter(booking => {
                  const matchesStatus = bookingsStatusFilter === 'all' || booking.status === bookingsStatusFilter
                  const matchesSearch = bookingsSearchTerm === '' ||
                    booking.client.name.toLowerCase().includes(bookingsSearchTerm.toLowerCase()) ||
                    booking.podcast_name.toLowerCase().includes(bookingsSearchTerm.toLowerCase())

                  let matchesDate = true
                  if (bookingsDateFrom) {
                    const createdDate = new Date(booking.created_at).toISOString().split('T')[0]
                    matchesDate = matchesDate && createdDate >= bookingsDateFrom
                  }
                  if (bookingsDateTo) {
                    const createdDate = new Date(booking.created_at).toISOString().split('T')[0]
                    matchesDate = matchesDate && createdDate <= bookingsDateTo
                  }

                  return matchesStatus && matchesSearch && matchesDate
                }).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No podcasts found</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Day Detail Modal */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && selectedDay.date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDay?.bookings.map(booking => (
              <div key={booking.id} className="p-4 border rounded-lg space-y-3">
                {/* Header with Client and Status */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Link
                      to={`/admin/clients/${booking.client_id}`}
                      className="text-lg font-semibold hover:text-primary hover:underline"
                    >
                      {booking.client.name}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1">
                      {booking.client.email}
                      {booking.client.phone && ` • ${booking.client.phone}`}
                    </p>
                  </div>
                  {getStatusBadge(booking.status)}
                </div>

                {/* Podcast Information */}
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Podcast</p>
                    <p className="font-medium">{booking.podcast_name}</p>
                  </div>

                  {booking.host_name && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Host</p>
                      <p>{booking.host_name}</p>
                    </div>
                  )}

                  {booking.podcast_url && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Podcast URL</p>
                      <a
                        href={booking.podcast_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline text-sm break-all"
                      >
                        {booking.podcast_url}
                      </a>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Recording Date</p>
                    <p className="text-sm">
                      {booking.recording_date
                        ? new Date(booking.recording_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Publish Date</p>
                    <p className="text-sm">
                      {booking.publish_date
                        ? new Date(booking.publish_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Prep Sent</p>
                    <p className="text-sm">
                      {booking.prep_sent ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Episode URL (if published) */}
                {booking.episode_url && (
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium text-muted-foreground">Episode URL</p>
                    <a
                      href={booking.episode_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm break-all"
                    >
                      {booking.episode_url}
                    </a>
                  </div>
                )}

                {/* Notes */}
                {booking.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{booking.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditBooking(booking)}
                  >
                    Edit Status
                  </Button>
                  {(booking.recording_date || booking.scheduled_date) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const calendarEvent = createCalendarEventFromBooking(booking)
                        if (calendarEvent) {
                          openGoogleCalendar(calendarEvent)
                          toast.success('Opening Google Calendar...')
                        } else {
                          toast.error('No date available for this booking')
                        }
                      }}
                    >
                      <CalendarPlus className="h-4 w-4 mr-2" />
                      Add to Calendar
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteBooking(booking)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Booking Modal */}
      <Dialog open={!!editingBooking} onOpenChange={() => setEditingBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Podcast Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Client</p>
              <p className="text-sm text-muted-foreground">{editingBooking?.client?.name}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-podcast-name">Podcast Name *</Label>
              <Input
                id="calendar-edit-podcast-name"
                placeholder="Enter podcast name"
                value={editBookingForm.podcast_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-host-name">Host Name</Label>
              <Input
                id="calendar-edit-host-name"
                placeholder="Enter host name"
                value={editBookingForm.host_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, host_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-podcast-url">Podcast URL</Label>
              <Input
                id="calendar-edit-podcast-url"
                placeholder="https://example.com/podcast"
                value={editBookingForm.podcast_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_url: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="calendar-edit-scheduled-date">Scheduled Date</Label>
                <Input
                  id="calendar-edit-scheduled-date"
                  type="date"
                  value={editBookingForm.scheduled_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, scheduled_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="calendar-edit-recording-date">Recording Date</Label>
                <Input
                  id="calendar-edit-recording-date"
                  type="date"
                  value={editBookingForm.recording_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, recording_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="calendar-edit-publish-date">Publish Date</Label>
                <Input
                  id="calendar-edit-publish-date"
                  type="date"
                  value={editBookingForm.publish_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, publish_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-episode-url">Episode URL</Label>
              <Input
                id="calendar-edit-episode-url"
                placeholder="https://example.com/episode"
                value={editBookingForm.episode_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, episode_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-status">Status</Label>
              <Select
                value={editBookingForm.status}
                onValueChange={(value: any) => setEditBookingForm({ ...editBookingForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversation_started">Conversation Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="calendar-edit-prep-sent"
                checked={editBookingForm.prep_sent}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, prep_sent: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="calendar-edit-prep-sent" className="cursor-pointer">
                Prep materials sent
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calendar-edit-notes">Notes</Label>
              <Textarea
                id="calendar-edit-notes"
                placeholder="Any additional notes..."
                value={editBookingForm.notes}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, notes: e.target.value })}
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button
                variant="destructive"
                onClick={() => {
                  handleDeleteBooking(editingBooking)
                  setEditingBooking(null)
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingBooking(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveBooking}
                  disabled={!editBookingForm.podcast_name || updateBookingMutation.isPending}
                >
                  {updateBookingMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingBooking} onOpenChange={() => setDeletingBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Podcast</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this podcast booking? This action cannot be undone.
            </p>
            {deletingBooking && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{deletingBooking.podcast_name}</p>
                <p className="text-sm text-muted-foreground">{deletingBooking.client?.name}</p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDeletingBooking(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteBookingMutation.isPending}
              >
                {deleteBookingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
