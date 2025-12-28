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
import { Switch } from '@/components/ui/switch'
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
  Rocket,
  Download,
  MessageSquare,
  XCircle,
  Lock,
  Unlock,
  Copy,
  Send,
  Upload,
  Image,
  X,
  FileText
} from 'lucide-react'
import { getClientById, updateClient, uploadClientPhoto, removeClientPhoto } from '@/services/clients'
import { getBookings, createBooking, updateBooking, deleteBooking } from '@/services/bookings'
import { getPodcastById } from '@/services/podscan'
import { updatePortalAccess, sendPortalInvitation } from '@/services/clientPortal'
import { useToast } from '@/hooks/use-toast'

type TimeRange = 30 | 60 | 90 | 180

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [isAddBookingModalOpen, setIsAddBookingModalOpen] = useState(false)
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false)
  const [isPodcastDetailsModalOpen, setIsPodcastDetailsModalOpen] = useState(false)
  const [viewingPodcast, setViewingPodcast] = useState<any>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [upcomingTimeRange, setUpcomingTimeRange] = useState<TimeRange>(30)
  const [goingLiveTimeRange, setGoingLiveTimeRange] = useState<TimeRange>(30)
  const [editingBooking, setEditingBooking] = useState<any>(null)
  const [deletingBooking, setDeletingBooking] = useState<any>(null)
  const [fetchingPodcast, setFetchingPodcast] = useState(false)
  const [sendingInvitation, setSendingInvitation] = useState(false)
  const [togglingPortalAccess, setTogglingPortalAccess] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
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
    podcast_id: '',
    podcast_name: '',
    host_name: '',
    podcast_url: '',
    scheduled_date: '',
    status: 'booked' as const,
    notes: '',
    audience_size: null as number | null,
    podcast_description: '',
    itunes_rating: null as number | null,
    itunes_rating_count: null as number | null,
    episode_count: null as number | null,
    podcast_image_url: '',
    rss_url: ''
  })
  const [editClientForm, setEditClientForm] = useState({
    name: '',
    email: '',
    contact_person: '',
    linkedin_url: '',
    website: '',
    status: 'active' as const,
    notes: '',
    bio: '',
    google_sheet_url: ''
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
      toast({
        title: 'Booking Created',
        description: 'Successfully created podcast booking',
      })
      setIsAddBookingModalOpen(false)
      setNewBookingForm({
        podcast_id: '',
        podcast_name: '',
        host_name: '',
        podcast_url: '',
        scheduled_date: '',
        status: 'booked',
        notes: '',
        audience_size: null,
        podcast_description: '',
        itunes_rating: null,
        itunes_rating_count: null,
        episode_count: null,
        podcast_image_url: '',
        rss_url: ''
      })
    },
    onError: (error) => {
      console.error('Failed to create booking:', error)
      toast({
        title: 'Failed to Create Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
    }
  })

  const updateBookingMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string, updates: any }) => updateBooking(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      toast({
        title: 'Booking Updated',
        description: 'Successfully updated booking',
      })
      setEditingBooking(null)
    },
    onError: (error) => {
      console.error('Failed to update booking:', error)
      toast({
        title: 'Failed to Update Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
    }
  })

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'client', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'all'] })
      toast({
        title: 'Booking Deleted',
        description: 'Successfully deleted booking',
      })
      setDeletingBooking(null)
    },
    onError: (error) => {
      console.error('Failed to delete booking:', error)
      toast({
        title: 'Failed to Delete Booking',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      })
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

  // Show all bookings in timeline regardless of date
  const filteredBookings = bookings.filter(booking =>
    statusFilter === 'all' || booking.status === statusFilter
  )

  // For stats, only count bookings with scheduled dates in the selected month
  const bookingsInSelectedMonth = bookings.filter(booking => {
    if (!booking.scheduled_date) return false
    const bookingDate = new Date(booking.scheduled_date)
    return bookingDate.getMonth() === selectedMonth && bookingDate.getFullYear() === selectedYear
  })

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
    console.log('handleCreateBooking called', { podcast_name: newBookingForm.podcast_name, id })
    if (!newBookingForm.podcast_name || !id) {
      console.log('Validation failed', { podcast_name: newBookingForm.podcast_name, id })
      toast({
        title: 'Validation Error',
        description: 'Podcast name is required',
        variant: 'destructive'
      })
      return
    }

    // Clean up form data - convert empty strings to undefined for date fields
    const cleanedData = {
      ...newBookingForm,
      scheduled_date: newBookingForm.scheduled_date || undefined,
      recording_date: undefined,
      publish_date: undefined,
    }

    console.log('Creating booking with data:', cleanedData)
    createBookingMutation.mutate({
      client_id: id,
      ...cleanedData
    })
  }

  const handleFetchPodcastDetails = async () => {
    if (!newBookingForm.podcast_id) {
      toast({
        title: 'Podcast ID Required',
        description: 'Please enter a podcast ID first',
        variant: 'destructive'
      })
      return
    }

    try {
      setFetchingPodcast(true)
      const podcastData = await getPodcastById(newBookingForm.podcast_id)

      // Extract host/publisher name
      const hostName = podcastData.publisher_name || ''

      // Parse ratings
      const itunesRating = podcastData.reach?.itunes?.itunes_rating_average
        ? parseFloat(podcastData.reach.itunes.itunes_rating_average)
        : null

      const itunesRatingCount = podcastData.reach?.itunes?.itunes_rating_count
        ? parseInt(podcastData.reach.itunes.itunes_rating_count)
        : null

      // Auto-fill form with ALL podcast data (except notes - keep user's notes)
      setNewBookingForm(prev => ({
        ...prev,
        podcast_name: prev.podcast_name || podcastData.podcast_name,
        host_name: prev.host_name || hostName,
        podcast_url: prev.podcast_url || podcastData.podcast_url || '',
        audience_size: podcastData.reach?.audience_size || null,
        podcast_description: podcastData.podcast_description || '',
        itunes_rating: itunesRating,
        itunes_rating_count: itunesRatingCount,
        episode_count: podcastData.episode_count || null,
        podcast_image_url: podcastData.podcast_image_url || '',
        rss_url: podcastData.rss_url || ''
      }))

      toast({
        title: 'Podcast Details Loaded',
        description: `Successfully fetched details for "${podcastData.podcast_name}" (${podcastData.reach?.audience_size?.toLocaleString() || 'N/A'} audience)`,
      })
    } catch (error) {
      console.error('Error fetching podcast:', error)
      toast({
        title: 'Fetch Failed',
        description: error instanceof Error ? error.message : 'Failed to fetch podcast details',
        variant: 'destructive'
      })
    } finally {
      setFetchingPodcast(false)
    }
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
      // Clean up form data - convert empty strings to undefined for date fields
      const cleanedUpdates = {
        ...editBookingForm,
        scheduled_date: editBookingForm.scheduled_date || undefined,
        recording_date: editBookingForm.recording_date || undefined,
        publish_date: editBookingForm.publish_date || undefined,
      }

      updateBookingMutation.mutate({
        id: editingBooking.id,
        updates: cleanedUpdates
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

  const handleViewPodcast = (booking: any) => {
    setViewingPodcast(booking)
    setIsPodcastDetailsModalOpen(true)
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
        notes: client.notes || '',
        bio: client.bio || '',
        google_sheet_url: client.google_sheet_url || ''
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select an image file',
        variant: 'destructive'
      })
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Please select an image under 5MB',
        variant: 'destructive'
      })
      return
    }

    setPhotoFile(file)

    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handlePhotoUpload = async () => {
    if (!photoFile || !id) return

    setUploadingPhoto(true)
    try {
      await uploadClientPhoto(id, photoFile)
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      toast({
        title: 'Photo Uploaded',
        description: 'Client photo updated successfully'
      })
      setPhotoFile(null)
      setPhotoPreview(null)
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload photo',
        variant: 'destructive'
      })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handlePhotoRemove = async () => {
    if (!client?.photo_url || !id) return

    setUploadingPhoto(true)
    try {
      await removeClientPhoto(id, client.photo_url)
      queryClient.invalidateQueries({ queryKey: ['client', id] })
      toast({
        title: 'Photo Removed',
        description: 'Client photo removed successfully'
      })
    } catch (error) {
      toast({
        title: 'Removal Failed',
        description: error instanceof Error ? error.message : 'Failed to remove photo',
        variant: 'destructive'
      })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleTogglePortalAccess = async (enabled: boolean) => {
    if (!client) return
    setTogglingPortalAccess(true)
    try {
      await updatePortalAccess(client.id, enabled)
      toast({
        title: enabled ? 'Portal Access Enabled' : 'Portal Access Disabled',
        description: enabled
          ? 'Client can now access their portal'
          : 'Client can no longer access their portal'
      })
      // Refresh client data
      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update portal access',
        variant: 'destructive'
      })
    } finally {
      setTogglingPortalAccess(false)
    }
  }

  const handleSendInvitation = async () => {
    if (!client) return

    if (!client.email) {
      toast({
        title: 'No Email Address',
        description: 'Please add an email address to this client first',
        variant: 'destructive'
      })
      return
    }

    setSendingInvitation(true)
    try {
      await sendPortalInvitation(client.id)
      toast({
        title: 'Invitation Sent',
        description: `Portal invitation sent to ${client.email}`
      })
      // Refresh client data to update invitation_sent_at
      queryClient.invalidateQueries({ queryKey: ['client', id] })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send invitation',
        variant: 'destructive'
      })
    } finally {
      setSendingInvitation(false)
    }
  }

  const handleCopyPortalUrl = () => {
    // Always use production URL, not localhost
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
    const portalUrl = `${baseUrl}/portal/login`
    navigator.clipboard.writeText(portalUrl)
    toast({
      title: 'Copied!',
      description: 'Portal login URL copied to clipboard'
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
            <h1 className="text-2xl sm:text-3xl font-bold">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
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
              {/* Client Photo */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <div className="relative">
                  {client.photo_url ? (
                    <img
                      src={client.photo_url}
                      alt={client.name}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium mb-2">Client Photo</p>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      id="photo-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('photo-upload')?.click()}
                      disabled={uploadingPhoto}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {client.photo_url ? 'Change' : 'Upload'}
                    </Button>
                    {client.photo_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePhotoRemove}
                        disabled={uploadingPhoto}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                  {photoFile && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-2">
                        Selected: {photoFile.name}
                      </p>
                      <Button
                        size="sm"
                        onClick={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      >
                        {uploadingPhoto ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          'Save Photo'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

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
              {client.google_sheet_url && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Google Sheet (Podcast Export)</p>
                    <a
                      href={client.google_sheet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      Open Sheet
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Client Bio */}
              {client.bio && (
                <div className="pt-4 border-t">
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground mt-1" />
                    <div className="flex-1">
                      <p className="text-sm font-medium mb-2">Client Bio (for AI Podcast Search)</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.bio}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client Portal Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {client.portal_access_enabled ? (
                  <Unlock className="h-5 w-5 text-green-600" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
                Client Portal Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle Portal Access */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="portal-access">Enable Portal Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow client to view their bookings
                  </p>
                </div>
                <Switch
                  id="portal-access"
                  checked={client.portal_access_enabled || false}
                  onCheckedChange={handleTogglePortalAccess}
                  disabled={togglingPortalAccess}
                />
              </div>

              {/* Portal Actions */}
              {client.portal_access_enabled && (
                <div className="space-y-3 pt-3 border-t">
                  <Button
                    onClick={handleSendInvitation}
                    disabled={!client.email || sendingInvitation}
                    className="w-full"
                  >
                    {sendingInvitation ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Portal Invitation
                      </>
                    )}
                  </Button>

                  {!client.email && (
                    <p className="text-xs text-muted-foreground text-center">
                      Add email address to send invitation
                    </p>
                  )}

                  <Button
                    variant="outline"
                    onClick={handleCopyPortalUrl}
                    className="w-full"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Portal URL
                  </Button>

                  {/* Portal Info */}
                  <div className="space-y-2 text-xs text-muted-foreground pt-2">
                    {client.portal_last_login_at && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          Last login:{' '}
                          {new Date(client.portal_last_login_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    )}
                    {client.portal_invitation_sent_at && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <span>
                          Invitation sent:{' '}
                          {new Date(client.portal_invitation_sent_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg sm:text-xl">Upcoming Recordings</CardTitle>
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant={upcomingTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(30)}
                  className="text-xs"
                >
                  1mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(60)}
                  className="text-xs"
                >
                  2mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(90)}
                  className="text-xs"
                >
                  3mo
                </Button>
                <Button
                  variant={upcomingTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUpcomingTimeRange(180)}
                  className="text-xs"
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Next {upcomingTimeRange} days</p>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg sm:text-xl">Upcoming Going Live</CardTitle>
              <div className="flex items-center gap-1 flex-wrap">
                <Button
                  variant={goingLiveTimeRange === 30 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(30)}
                  className="text-xs"
                >
                  1mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 60 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(60)}
                  className="text-xs"
                >
                  2mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 90 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(90)}
                  className="text-xs"
                >
                  3mo
                </Button>
                <Button
                  variant={goingLiveTimeRange === 180 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGoingLiveTimeRange(180)}
                  className="text-xs"
                >
                  6mo
                </Button>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Next {goingLiveTimeRange} days</p>
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
              <div>
                <CardTitle>All Bookings</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete list of podcast bookings - scheduled and unscheduled
                </p>
              </div>
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
                        {booking.scheduled_date ? formatDate(booking.scheduled_date) : (
                          <span className="text-muted-foreground text-sm">Unscheduled</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewPodcast(booking)}
                              className="font-medium text-primary hover:underline text-left"
                            >
                              {booking.podcast_name}
                            </button>
                            {booking.audience_size && (
                              <span className="text-xs text-muted-foreground">
                                👥 {booking.audience_size.toLocaleString()}
                              </span>
                            )}
                          </div>
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
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Booking for {client.name}</DialogTitle>
            <DialogDescription>Create a new podcast booking</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            {/* Podcast ID Fetcher */}
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg border">
              <Label htmlFor="podcast_id" className="text-sm font-semibold">
                Podcast ID (Podscan)
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                Enter a Podscan podcast ID to auto-fill booking details
              </p>
              <div className="flex gap-2">
                <Input
                  id="podcast_id"
                  placeholder="e.g., 12345"
                  value={newBookingForm.podcast_id}
                  onChange={(e) => setNewBookingForm({ ...newBookingForm, podcast_id: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleFetchPodcastDetails()
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={handleFetchPodcastDetails}
                  disabled={!newBookingForm.podcast_id || fetchingPodcast}
                  variant="secondary"
                >
                  {fetchingPodcast ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Fetch
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Fetched Data Summary */}
            {newBookingForm.audience_size && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                <h4 className="text-sm font-semibold mb-3 text-green-900 dark:text-green-100">Podcast Details Fetched ✓</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Audience:</span>
                    <div className="font-semibold">{newBookingForm.audience_size.toLocaleString()}</div>
                  </div>
                  {newBookingForm.episode_count && (
                    <div>
                      <span className="text-muted-foreground">Episodes:</span>
                      <div className="font-semibold">{newBookingForm.episode_count}</div>
                    </div>
                  )}
                  {newBookingForm.itunes_rating && (
                    <div>
                      <span className="text-muted-foreground">Rating:</span>
                      <div className="font-semibold">
                        ⭐ {newBookingForm.itunes_rating} ({newBookingForm.itunes_rating_count || 0} reviews)
                      </div>
                    </div>
                  )}
                  {newBookingForm.podcast_image_url && (
                    <div className="col-span-2">
                      <img
                        src={newBookingForm.podcast_image_url}
                        alt="Podcast cover"
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

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
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
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
        </DialogContent>
      </Dialog>

      {/* Edit Client Modal */}
      <Dialog open={isEditClientModalOpen} onOpenChange={setIsEditClientModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update client information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
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
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bio">Client Bio (for AI Podcast Search)</Label>
              <Textarea
                id="edit-bio"
                placeholder="Describe the client's expertise, industry, target audience, and ideal podcast topics..."
                value={editClientForm.bio}
                onChange={(e) => setEditClientForm({ ...editClientForm, bio: e.target.value })}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                This bio is used by AI to generate relevant podcast search queries in the Podcast Finder
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-google-sheet" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Google Sheet URL (for Podcast Export)
              </Label>
              <Input
                id="edit-google-sheet"
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
                value={editClientForm.google_sheet_url}
                onChange={(e) => setEditClientForm({ ...editClientForm, google_sheet_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Podcast Finder results will be exported to this Google Sheet. Make sure to share the sheet with the service account.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
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
        </DialogContent>
      </Dialog>

      {/* Edit Booking Modal */}
      <Dialog open={!!editingBooking} onOpenChange={() => setEditingBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Podcast Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
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
          </div>
          <div className="flex justify-between pt-4 border-t mt-4">
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

      {/* Podcast Details Modal */}
      <Dialog open={isPodcastDetailsModalOpen} onOpenChange={setIsPodcastDetailsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Podcast Details</DialogTitle>
            <DialogDescription>
              Information from Podscan API
            </DialogDescription>
          </DialogHeader>
          {viewingPodcast && (
            <div className="space-y-6">
              {/* Podcast Header with Image */}
              <div className="flex gap-4">
                {viewingPodcast.podcast_image_url && (
                  <img
                    src={viewingPodcast.podcast_image_url}
                    alt={viewingPodcast.podcast_name}
                    className="w-32 h-32 rounded-lg object-cover shadow-md"
                  />
                )}
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-bold">{viewingPodcast.podcast_name}</h3>
                  {viewingPodcast.host_name && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Host: {viewingPodcast.host_name}</span>
                    </div>
                  )}
                  {viewingPodcast.podcast_url && (
                    <a
                      href={viewingPodcast.podcast_url}
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

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {viewingPodcast.audience_size && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Audience Size</p>
                    <p className="text-2xl font-bold">{viewingPodcast.audience_size.toLocaleString()}</p>
                  </div>
                )}
                {viewingPodcast.episode_count && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Episodes</p>
                    <p className="text-2xl font-bold">{viewingPodcast.episode_count.toLocaleString()}</p>
                  </div>
                )}
                {viewingPodcast.itunes_rating && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">iTunes Rating</p>
                    <p className="text-2xl font-bold">{viewingPodcast.itunes_rating.toFixed(1)} ⭐</p>
                  </div>
                )}
                {viewingPodcast.itunes_rating_count && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Ratings Count</p>
                    <p className="text-2xl font-bold">{viewingPodcast.itunes_rating_count.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {viewingPodcast.podcast_description && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Description</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {viewingPodcast.podcast_description}
                  </p>
                </div>
              )}

              {/* Technical Details */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">Technical Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {viewingPodcast.podcast_id && (
                    <div>
                      <span className="text-muted-foreground">Podcast ID:</span>
                      <span className="ml-2 font-mono">{viewingPodcast.podcast_id}</span>
                    </div>
                  )}
                  {viewingPodcast.rss_url && (
                    <div className="col-span-full">
                      <span className="text-muted-foreground">RSS Feed:</span>
                      <a
                        href={viewingPodcast.rss_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline break-all"
                      >
                        {viewingPodcast.rss_url}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Booking Status */}
              <div className="space-y-2">
                <h4 className="font-semibold">Booking Status</h4>
                <div className="flex items-center gap-3">
                  {getStatusBadge(viewingPodcast.status)}
                  {viewingPodcast.scheduled_date && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Scheduled: {formatDate(viewingPodcast.scheduled_date)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {viewingPodcast.notes && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Notes</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {viewingPodcast.notes}
                  </p>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setIsPodcastDetailsModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
