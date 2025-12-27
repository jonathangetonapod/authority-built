import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  Plus,
  Edit,
  Calendar,
  Mail,
  User,
  Globe,
  Linkedin,
  CheckCircle2,
  Clock,
  Video,
  CheckCheck,
  ExternalLink,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Rocket
} from 'lucide-react'
import { getClientById, updateClient } from '@/services/clients'
import { getBookings, createBooking, updateBooking, deleteBooking } from '@/services/bookings'

type TimeRange = 30 | 60 | 90 | 180

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false)
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [upcomingTimeRange, setUpcomingTimeRange] = useState<TimeRange>(30)
  const [goingLiveTimeRange, setGoingLiveTimeRange] = useState<TimeRange>(30)
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
  const [newBookingForm, setNewBookingForm] = useState({
    podcast_name: '',
    host_name: '',
    podcast_url: '',
    scheduled_date: '',
    status: 'booked' as const,
    notes: ''
  })
  const [editClientForm, setEditClientForm] = useState({
    name: '',
    email: '',
    contact_person: '',
    linkedin_url: '',
    website: '',
    status: 'active' as const,
    notes: ''
  })

  const queryClient = useQueryClient()

  const selectedMonth = selectedDate.getMonth()
  const selectedYear = selectedDate.getFullYear()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Fetch client data
  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClientById(id!),
    enabled: !!id
  })

  // Fetch bookings for this client
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', 'client', id],
    queryFn: () => getBookings({ client_id: id }),
    enabled: !!id
  })

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'client', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'all'] })
      setIsAddBookingModalOpen(false)
      setNewBookingForm({
        podcast_name: '',
        host_name: '',
        podcast_url: '',
        scheduled_date: '',
        status: 'booked',
        notes: ''
      })
    }
  })

  const updateBookingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateBooking(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setEditingBooking(null)
    }
  })

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setDeletingBooking(null)
    }
  })

  const updateClientMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateClient(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setIsEditClientModalOpen(false)
    }
  })

  const bookings = bookingsData?.bookings || []

  // Filter bookings by selected month
  const bookingsInSelectedMonth = bookings.filter(booking => {
    if (!booking.scheduled_date) return false
    const bookingDate = new Date(booking.scheduled_date)
    return bookingDate.getMonth() === selectedMonth && bookingDate.getFullYear() === selectedYear
  })

  const filteredBookings = bookingsInSelectedMonth.filter(booking =>
    statusFilter === 'all' || booking.status === statusFilter
  )

  const bookedCount = bookingsInSelectedMonth.filter(b => b.status === 'booked').length
  const inProgressCount = bookingsInSelectedMonth.filter(b => b.status === 'in_progress').length
  const recordedCount = bookingsInSelectedMonth.filter(b => b.status === 'recorded').length
  const publishedCount = bookingsInSelectedMonth.filter(b => b.status === 'published').length
  const totalCount = bookingsInSelectedMonth.length
  const completionRate = totalCount > 0 ? (publishedCount / totalCount) * 100 : 0

  // Calculate upcoming recordings (filtered by time range)
  const now = new Date()
  const futureDateFromNow = new Date()
  futureDateFromNow.setDate(futureDateFromNow.getDate() + upcomingTimeRange)

  const upcomingRecordings = bookings
    .filter(booking => {
      if (!booking.recording_date) return false
      const recordingDate = new Date(booking.recording_date)
      return recordingDate >= now &&
             recordingDate <= futureDateFromNow &&
             (booking.status === 'conversation_started' ||
              booking.status === 'booked' ||
              booking.status === 'in_progress')
    })
    .sort((a, b) => new Date(a.recording_date!).getTime() - new Date(b.recording_date!).getTime())

  // Calculate upcoming going live (filtered by time range, all statuses with publish date)
  const goingLiveFutureDate = new Date()
  goingLiveFutureDate.setDate(goingLiveFutureDate.getDate() + goingLiveTimeRange)

  const upcomingGoingLive = bookings
    .filter(booking => {
      if (!booking.publish_date) return false
      const publishDate = new Date(booking.publish_date)
      return publishDate >= now &&
             publishDate <= goingLiveFutureDate
    })
    .sort((a, b) => new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime())

  const goToPreviousMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setSelectedDate(new Date(selectedYear, selectedMonth + 1, 1))
  }

  const goToThisMonth = () => {
    setSelectedDate(new Date())
  }

  const handleCreateBooking = () => {
    if (!newBookingForm.podcast_name || !id) return
    createBookingMutation.mutate({
      client_id: id,
      ...newBookingForm
    })
  }

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

  const handleEditClient = () => {
    if (client) {
      setEditClientForm({
        name: client.name,
        email: client.email || '',
        contact_person: client.contact_person || '',
        linkedin_url: client.linkedin_url || '',
        website: client.website || '',
        status: client.status,
        notes: client.notes || ''
      })
      setIsEditClientModalOpen(true)
    }
  }

  const handleUpdateClient = () => {
    if (!editClientForm.name || !id) return
    updateClientMutation.mutate({
      id,
      updates: editClientForm
    })
  }

  if (clientLoading || bookingsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <p className="text-muted-foreground">Client not found</p>
          <Link to="/admin/clients" className="text-primary hover:underline mt-2">
            Back to Clients
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      booked: { bg: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
      in_progress: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
      recorded: { bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Video },
      published: { bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: CheckCheck },
    }
    const config = styles[status as keyof typeof styles]
    const Icon = config.icon
    return (
      <Badge className={config.bg}>
        <Icon className="h-3 w-3 mr-1" />
        {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatUpcomingDate = (dateString: string) => {
    // Parse date in local timezone to avoid timezone shifts
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
      day: 'numeric'
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <Link to="/admin/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{client.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={
                client.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                client.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }>
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Joined {formatDate(client.created_at)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleEditClient}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Client
            </Button>
            <Button onClick={() => setIsAddBookingModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Booking
            </Button>
          </div>
        </div>

        {/* Info and Stats */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Client Info */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{client.email}</p>
                  </div>
                </div>
              )}
              {client.contact_person && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Contact Person</p>
                    <p className="text-sm text-muted-foreground">{client.contact_person}</p>
                  </div>
                </div>
              )}
              {client.linkedin_url && (
                <div className="flex items-center gap-3">
                  <Linkedin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LinkedIn</p>
                    <a
                      href={client.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View Profile
                    </a>
                  </div>
                </div>
              )}
              {client.website && (
                <div className="flex items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Visit Website
                    </a>
                  </div>
                </div>
              )}
              {client.calendar_link && (
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Calendar</p>
                    <a
                      href={client.calendar_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Book Time
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Progress Stats */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Progress Overview</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-center min-w-[150px]">
                    <p className="text-sm font-semibold">{monthNames[selectedMonth]} {selectedYear}</p>
                  </div>
                  <Button variant="outline" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={goToThisMonth}>
                    This Month
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{totalCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{bookedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Booked</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{inProgressCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">In Progress</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{recordedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Recorded</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{publishedCount}</div>
                  <div className="text-xs text-muted-foreground mt-1">Published</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{completionRate.toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        {client.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{client.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Recordings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Recordings</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant={upcomingTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(30)}
                >
                  1mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(60)}
                >
                  2mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(90)}
                >
                  3mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(180)}
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Next {upcomingTimeRange} days</p>
          </CardHeader>
          <CardContent>
            {upcomingRecordings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming recordings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingRecordings.map(booking => (
                  <div
                    key={booking.id}
                    className={`flex items-start gap-4 p-3 rounded-lg border ${
                      !booking.prep_sent ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' : 'bg-muted/30'
                    }`}
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[80px]">
                      <div className="text-sm font-bold">{formatUpcomingDate(booking.recording_date!)}</div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{booking.podcast_name}</p>
                      {booking.host_name && (
                        <p className="text-xs text-muted-foreground">Host: {booking.host_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(booking.status)}
                        {!booking.prep_sent && (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            <span>Prep not sent</span>
                          </div>
                        )}
                        {booking.prep_sent && (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Prep sent</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Going Live */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upcoming Going Live</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant={goingLiveTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(30)}
                >
                  1mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(60)}
                >
                  2mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(90)}
                >
                  3mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(180)}
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Next {goingLiveTimeRange} days</p>
          </CardHeader>
          <CardContent>
            {upcomingGoingLive.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Rocket className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming publications</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingGoingLive.map(booking => (
                  <div
                    key={booking.id}
                    className="flex items-start gap-4 p-3 rounded-lg border bg-muted/30"
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[80px]">
                      <div className="text-sm font-bold">{formatUpcomingDate(booking.publish_date!)}</div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{booking.podcast_name}</p>
                      {booking.host_name && (
                        <p className="text-xs text-muted-foreground">Host: {booking.host_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(booking.status)}
                        {booking.episode_url && (
                          <a
                            href={booking.episode_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Rocket className="h-3 w-3" />
                            Episode Link
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Timeline */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle>Booking Timeline</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Podcast</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Episode</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">
                        {formatDate(booking.scheduled_date)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{booking.podcast_name}</p>
                          {booking.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {booking.notes}
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
                        {booking.episode_url ? (
                          <a
                            href={booking.episode_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            Listen
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditBooking(booking)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
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

            {filteredBookings.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No bookings found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Booking Modal */}
      <Dialog open={isAddBookingModalOpen} onOpenChange={setIsAddBookingModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Booking for {client.name}</DialogTitle>
            <DialogDescription>Create a new podcast booking</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="podcastName">Podcast Name *</Label>
              <Input
                id="podcastName"
                placeholder="Enter podcast name"
                value={newBookingForm.podcast_name}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hostName">Host Name</Label>
              <Input
                id="hostName"
                placeholder="Enter host name"
                value={newBookingForm.host_name}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, host_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="podcastUrl">Podcast URL</Label>
              <Input
                id="podcastUrl"
                placeholder="https://..."
                value={newBookingForm.podcast_url}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input
                id="scheduledDate"
                type="date"
                value={newBookingForm.scheduled_date}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, scheduled_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newBookingForm.status}
                onValueChange={(value: 'booked' | 'in_progress' | 'recorded' | 'published' | 'cancelled') =>
                  setNewBookingForm({ ...newBookingForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="recorded">Recorded</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any notes about this booking..."
                value={newBookingForm.notes}
                onChange={(e) => setNewBookingForm({ ...newBookingForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsAddBookingModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateBooking}
                disabled={!newBookingForm.podcast_name || createBookingMutation.isPending}
              >
                {createBookingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Booking'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Client Modal */}
      <Dialog open={isEditClientModalOpen} onOpenChange={setIsEditClientModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Client Name *</Label>
              <Input
                id="edit-name"
                placeholder="Enter client name"
                value={editClientForm.name}
                onChange={(e) => setEditClientForm({ ...editClientForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="client@example.com"
                value={editClientForm.email}
                onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact">Contact Person</Label>
              <Input
                id="edit-contact"
                placeholder="John Doe"
                value={editClientForm.contact_person}
                onChange={(e) => setEditClientForm({ ...editClientForm, contact_person: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
              <Input
                id="edit-linkedin"
                placeholder="https://linkedin.com/in/..."
                value={editClientForm.linkedin_url}
                onChange={(e) => setEditClientForm({ ...editClientForm, linkedin_url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                placeholder="https://example.com"
                value={editClientForm.website}
                onChange={(e) => setEditClientForm({ ...editClientForm, website: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editClientForm.status}
                onValueChange={(value: 'active' | 'paused' | 'churned') =>
                  setEditClientForm({ ...editClientForm, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                placeholder="Any additional notes..."
                value={editClientForm.notes}
                onChange={(e) => setEditClientForm({ ...editClientForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsEditClientModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpdateClient}
                disabled={!editClientForm.name || updateClientMutation.isPending}
              >
                {updateClientMutation.isPending ? (
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
        </DialogContent>
      </Dialog>

      {/* Edit Booking Modal */}
      <Dialog open={!!editingBooking} onOpenChange={() => setEditingBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Podcast Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-podcast-name">Podcast Name *</Label>
              <Input
                id="edit-podcast-name"
                placeholder="Enter podcast name"
                value={editBookingForm.podcast_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-host-name">Host Name</Label>
              <Input
                id="edit-host-name"
                placeholder="Enter host name"
                value={editBookingForm.host_name}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, host_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-podcast-url">Podcast URL</Label>
              <Input
                id="edit-podcast-url"
                placeholder="https://example.com/podcast"
                value={editBookingForm.podcast_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, podcast_url: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-scheduled-date">Scheduled Date</Label>
                <Input
                  id="edit-scheduled-date"
                  type="date"
                  value={editBookingForm.scheduled_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, scheduled_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-recording-date">Recording Date</Label>
                <Input
                  id="edit-recording-date"
                  type="date"
                  value={editBookingForm.recording_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, recording_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-publish-date">Publish Date</Label>
                <Input
                  id="edit-publish-date"
                  type="date"
                  value={editBookingForm.publish_date}
                  onChange={(e) => setEditBookingForm({ ...editBookingForm, publish_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-episode-url">Episode URL</Label>
              <Input
                id="edit-episode-url"
                placeholder="https://example.com/episode"
                value={editBookingForm.episode_url}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, episode_url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
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
                id="edit-prep-sent"
                checked={editBookingForm.prep_sent}
                onChange={(e) => setEditBookingForm({ ...editBookingForm, prep_sent: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="edit-prep-sent" className="cursor-pointer">
                Prep materials sent
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
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
                <p className="text-sm text-muted-foreground">{client?.name}</p>
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
