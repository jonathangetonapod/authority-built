import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Calendar, TrendingUp, CheckCircle2, Clock, Video, CheckCheck, Plus, ArrowRight, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getClients } from '@/services/clients'
import { getBookings } from '@/services/bookings'

type TimeRange = 7 | 14 | 30 | 60 | 90 | 180

export default function Dashboard() {
  const [upcomingTimeRange, setUpcomingTimeRange] = useState<TimeRange>(30)
  // Fetch clients
  const { data: clientsData, isLoading: clientsLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients()
  })

  // Fetch all bookings
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', 'all'],
    queryFn: () => getBookings()
  })

  const clients = clientsData?.clients || []
  const allBookings = bookingsData?.bookings || []

  // Calculate stats
  const activeClients = clients.filter(c => c.status === 'active').length

  // This month's bookings
  const now = new Date()
  const thisMonthBookings = allBookings.filter(booking => {
    if (!booking.scheduled_date) return false
    const bookingDate = new Date(booking.scheduled_date)
    return bookingDate.getMonth() === now.getMonth() && bookingDate.getFullYear() === now.getFullYear()
  })

  const totalThisMonth = thisMonthBookings.length
  const bookedThisMonth = thisMonthBookings.filter(b => b.status === 'booked').length
  const inProgressThisMonth = thisMonthBookings.filter(b => b.status === 'in_progress').length
  const publishedThisMonth = thisMonthBookings.filter(b => b.status === 'published').length
  const completionRate = totalThisMonth > 0 ? (publishedThisMonth / totalThisMonth) * 100 : 0

  // Upcoming recordings (filtered by time range)
  const futureDateFromNow = new Date()
  futureDateFromNow.setDate(futureDateFromNow.getDate() + upcomingTimeRange)

  const upcomingRecordings = allBookings
    .filter(booking => {
      if (!booking.recording_date) return false
      const recordingDate = new Date(booking.recording_date)
      return recordingDate >= now && recordingDate <= futureDateFromNow &&
             (booking.status === 'booked' || booking.status === 'in_progress')
    })
    .sort((a, b) => new Date(a.recording_date!).getTime() - new Date(b.recording_date!).getTime())
    .slice(0, 5)

  // Recent activity (last 10 bookings created or updated)
  const recentActivity = [...allBookings]
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 8)

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
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  const isLoading = clientsLoading || bookingsLoading

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your podcast placement overview</p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/admin/clients">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/calendar">
              <Calendar className="h-4 w-4 mr-2" />
              View Calendar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/admin/upcoming">
              <Clock className="h-4 w-4 mr-2" />
              Upcoming Recordings
            </Link>
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeClients}</div>
              <p className="text-xs text-muted-foreground">Currently servicing</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalThisMonth}</div>
              <p className="text-xs text-muted-foreground">Total bookings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{inProgressThisMonth}</div>
              <p className="text-xs text-muted-foreground">Coordinating</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completionRate.toFixed(0)}%</div>
              <p className="text-xs text-muted-foreground">Published this month</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Upcoming Recordings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Upcoming Recordings</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin/upcoming">
                    View All
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1 flex-wrap">
                  <Button
                    variant={upcomingTimeRange === 7 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(7)}
                  >
                    7 days
                  </Button>
                  <Button
                    variant={upcomingTimeRange === 14 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(14)}
                  >
                    14 days
                  </Button>
                  <Button
                    variant={upcomingTimeRange === 30 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(30)}
                  >
                    30 days
                  </Button>
                  <Button
                    variant={upcomingTimeRange === 60 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(60)}
                  >
                    2 months
                  </Button>
                  <Button
                    variant={upcomingTimeRange === 90 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(90)}
                  >
                    3 months
                  </Button>
                  <Button
                    variant={upcomingTimeRange === 180 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUpcomingTimeRange(180)}
                  >
                    6 months
                  </Button>
                </div>
              </div>
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
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        !booking.prep_sent
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                          : 'bg-muted border-border'
                      }`}
                    >
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            to={`/admin/clients/${booking.client_id}`}
                            className="font-semibold hover:text-primary hover:underline truncate"
                          >
                            {booking.client.name}
                          </Link>
                          {getStatusBadge(booking.status)}
                        </div>
                        <p className="text-sm font-medium truncate">{booking.podcast_name}</p>
                        {booking.host_name && (
                          <p className="text-xs text-muted-foreground">Host: {booking.host_name}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {booking.scheduled_date && (
                            <span>Scheduled: {formatDate(booking.scheduled_date)}</span>
                          )}
                          <span className="font-medium">Recording: {formatDate(booking.recording_date!)}</span>
                        </div>
                        {!booking.prep_sent ? (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>Prep Not Sent - Action Required</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500">
                            <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                            <span>Prep sent</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Latest updates</p>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent activity</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map(booking => (
                    <div key={booking.id} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/admin/clients/${booking.client_id}`}
                          className="font-medium hover:text-primary hover:underline truncate block"
                        >
                          {booking.client.name}
                        </Link>
                        <p className="text-sm text-muted-foreground truncate">{booking.podcast_name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Updated {new Date(booking.updated_at || booking.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      {getStatusBadge(booking.status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Monthly Pipeline Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>This Month's Pipeline</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalThisMonth} total bookings • {completionRate.toFixed(0)}% completion rate
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pipeline Progress</span>
                  <span className="font-medium">{publishedThisMonth} of {totalThisMonth} published</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{bookedThisMonth}</div>
                    <div className="text-xs text-muted-foreground">Booked</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{inProgressThisMonth}</div>
                    <div className="text-xs text-muted-foreground">In Progress</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Video className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">
                      {thisMonthBookings.filter(b => b.status === 'recorded').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Recorded</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <CheckCheck className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{publishedThisMonth}</div>
                    <div className="text-xs text-muted-foreground">Published</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
