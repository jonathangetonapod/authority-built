import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getBookings } from '@/services/bookings'
import { useState } from 'react'

type TimeRange = 30 | 60 | 90 | 180

export default function UpcomingRecordings() {
  const [timeRange, setTimeRange] = useState<TimeRange>(30)
  const navigate = useNavigate()

  // Fetch all bookings
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['bookings', 'all'],
    queryFn: () => getBookings()
  })

  const allBookings = bookingsData?.bookings || []

  // Calculate date range
  const now = new Date()
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + timeRange)

  // Filter upcoming bookings
  const upcomingBookings = allBookings
    .filter(booking => {
      if (!booking.recording_date) return false
      const recordingDate = new Date(booking.recording_date)
      return recordingDate >= now &&
             recordingDate <= futureDate &&
             (booking.status === 'conversation_started' ||
              booking.status === 'booked' ||
              booking.status === 'in_progress')
    })
    .sort((a, b) => new Date(a.recording_date!).getTime() - new Date(b.recording_date!).getTime())

  // Stats
  const totalUpcoming = upcomingBookings.length
  const prepNotSent = upcomingBookings.filter(b => !b.prep_sent).length
  const prepSent = upcomingBookings.filter(b => b.prep_sent).length

  const getStatusBadge = (status: string) => {
    const styles = {
      conversation_started: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      booked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      recorded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      published: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
    return (
      <Badge className={styles[status as keyof typeof styles]}>
        {status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
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
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Upcoming Recordings</h1>
          <p className="text-muted-foreground">Scheduled podcast recordings and conversations</p>
        </div>

        {/* Time Range Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={timeRange === 30 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(30)}
                >
                  1 Month
                </Button>
                <Button
                  variant={timeRange === 60 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(60)}
                >
                  2 Months
                </Button>
                <Button
                  variant={timeRange === 90 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(90)}
                >
                  3 Months
                </Button>
                <Button
                  variant={timeRange === 180 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(180)}
                >
                  6 Months
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                Showing {totalUpcoming} upcoming {totalUpcoming === 1 ? 'recording' : 'recordings'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Upcoming</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUpcoming}</div>
              <p className="text-xs text-muted-foreground">In next {timeRange} days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prep Not Sent</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{prepNotSent}</div>
              <p className="text-xs text-muted-foreground">Needs attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prep Sent</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{prepSent}</div>
              <p className="text-xs text-muted-foreground">Ready to go</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Recordings List */}
        <Card>
          <CardHeader>
            <CardTitle>All Upcoming Recordings</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click any row to view client details
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Loading...</p>
              </div>
            ) : upcomingBookings.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No Upcoming Recordings</p>
                <p className="text-sm">No podcasts scheduled in the next {timeRange} days</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map(booking => (
                  <div
                    key={booking.id}
                    onClick={() => navigate(`/admin/clients/${booking.client_id}`)}
                    className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${
                      !booking.prep_sent ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' : 'bg-muted/30'
                    }`}
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[100px]">
                      <div className="text-lg font-bold">{formatDate(booking.recording_date!)}</div>
                      {booking.recording_date && (
                        <div className="text-xs text-muted-foreground">{formatTime(booking.recording_date)}</div>
                      )}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Client:</span>
                            <Link
                              to={`/admin/clients/${booking.client_id}`}
                              className="text-lg font-semibold hover:text-primary hover:underline truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {booking.client.name}
                            </Link>
                          </div>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-sm font-medium text-muted-foreground">Podcast:</span>
                            <p className="text-base text-muted-foreground truncate">
                              {booking.podcast_name}
                            </p>
                          </div>
                        </div>
                        {!booking.prep_sent && (
                          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-1" title="Prep not sent" />
                        )}
                      </div>

                      {/* Additional Details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {booking.host_name && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Host:</span>
                            <span>{booking.host_name}</span>
                          </div>
                        )}
                        {booking.podcast_url && (
                          <a
                            href={booking.podcast_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Podcast Link
                          </a>
                        )}
                        {booking.prep_sent && (
                          <div className="flex items-center gap-1 text-green-600">
                            <span>✓ Prep Sent</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex-shrink-0">
                      {getStatusBadge(booking.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
