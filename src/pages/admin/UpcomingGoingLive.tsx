import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Rocket } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getBookings } from '@/services/bookings'
import { useState } from 'react'

type TimeRange = 7 | 14 | 30 | 60 | 90 | 180

export default function UpcomingGoingLive() {
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

  // Filter upcoming publications (all statuses with publish date)
  const upcomingPublications = allBookings
    .filter(booking => {
      if (!booking.publish_date) return false
      const publishDate = new Date(booking.publish_date)
      return publishDate >= now &&
             publishDate <= futureDate
    })
    .sort((a, b) => new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime())

  // Stats
  const totalUpcoming = upcomingPublications.length
  const recorded = upcomingPublications.filter(b => b.status === 'recorded').length
  const published = upcomingPublications.filter(b => b.status === 'published').length

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
    const date = new Date(dateString)
    const today = new Date()
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
          <h1 className="text-3xl font-bold">Upcoming Going Live</h1>
          <p className="text-muted-foreground">Track when podcast episodes are scheduled to publish</p>
        </div>

        {/* Time Range Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={timeRange === 7 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(7)}
                >
                  7 Days
                </Button>
                <Button
                  variant={timeRange === 14 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(14)}
                >
                  14 Days
                </Button>
                <Button
                  variant={timeRange === 30 ? 'default' : 'outline'}
                  onClick={() => setTimeRange(30)}
                >
                  30 Days
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
                Showing {totalUpcoming} upcoming {totalUpcoming === 1 ? 'publication' : 'publications'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Going Live</CardTitle>
              <Rocket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUpcoming}</div>
              <p className="text-xs text-muted-foreground">In next {timeRange} days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Awaiting Publish</CardTitle>
              <Calendar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{recorded}</div>
              <p className="text-xs text-muted-foreground">Recorded, ready to go</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Already Published</CardTitle>
              <Rocket className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{published}</div>
              <p className="text-xs text-muted-foreground">Live episodes</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Publications List */}
        <Card>
          <CardHeader>
            <CardTitle>All Upcoming Publications</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click any row to view client details
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Loading...</p>
              </div>
            ) : upcomingPublications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Rocket className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No Upcoming Publications</p>
                <p className="text-sm">No podcasts scheduled to go live in the next {timeRange} days</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingPublications.map(booking => (
                  <div
                    key={booking.id}
                    onClick={() => navigate(`/admin/clients/${booking.client_id}`)}
                    className="flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 bg-muted/30"
                  >
                    {/* Date Column */}
                    <div className="flex-shrink-0 text-center min-w-[100px]">
                      <div className="text-lg font-bold">{formatDate(booking.publish_date!)}</div>
                      {booking.publish_date && (
                        <div className="text-xs text-muted-foreground">{formatTime(booking.publish_date)}</div>
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
                      </div>

                      {/* Additional Details */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        {booking.host_name && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Host:</span>
                            <span>{booking.host_name}</span>
                          </div>
                        )}
                        {booking.recording_date && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Recorded:</span>
                            <span>{formatDate(booking.recording_date)}</span>
                          </div>
                        )}
                        {booking.episode_url && (
                          <a
                            href={booking.episode_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Episode Link
                          </a>
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
