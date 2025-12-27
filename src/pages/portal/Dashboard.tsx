import { useState } from 'react'
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
  Loader2
} from 'lucide-react'
import { getClientBookings } from '@/services/clientPortal'
import type { Booking } from '@/services/bookings'

export default function PortalDashboard() {
  const { client } = useClientPortal()
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null)

  // Fetch bookings
  const { data: bookings, isLoading } = useQuery({
    queryKey: ['client-bookings', client?.id],
    queryFn: () => getClientBookings(client!.id),
    enabled: !!client
  })

  // Filter bookings
  const filteredBookings = bookings?.filter(booking => {
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter
    const matchesSearch = !searchQuery || booking.podcast_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  }) || []

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

  // Calculate stats
  const stats = {
    total: bookings?.length || 0,
    booked: bookings?.filter(b => b.status === 'booked').length || 0,
    recorded: bookings?.filter(b => b.status === 'recorded').length || 0,
    published: bookings?.filter(b => b.status === 'published').length || 0,
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {client?.contact_person || client?.name}!</h1>
          <p className="text-muted-foreground mt-1">
            View all your podcast bookings and episodes
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">All podcast placements</p>
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
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.published}</div>
              <p className="text-xs text-muted-foreground">Episodes live</p>
            </CardContent>
          </Card>
        </div>

        {/* Bookings Table */}
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
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="recorded">Recorded</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
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
      </div>

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
    </PortalLayout>
  )
}
