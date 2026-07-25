import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, CheckCircle2, Loader2, Mic2, Radio, RefreshCw } from 'lucide-react'

import { PortalLayout } from '@/components/portal/PortalLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getClientBookings } from '@/services/clientPortal'

const statusLabel = (status: string) => status.replace(/_/g, ' ')

const displayDate = (value: string | null | undefined) => {
  if (!value) return 'Date not scheduled'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? 'Date not scheduled'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const bookingDate = (booking: {
  status: string
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
}) => {
  if (booking.status === 'published') {
    return booking.publish_date || booking.recording_date || booking.scheduled_date
  }
  if (booking.status === 'recorded') {
    return booking.recording_date || booking.scheduled_date || booking.publish_date
  }
  return booking.scheduled_date || booking.recording_date || booking.publish_date
}

export default function PortalDashboardMvp() {
  const { client } = useClientPortal()
  const bookingsQuery = useQuery({
    queryKey: ['portal-bookings', client?.id],
    queryFn: () => getClientBookings(client!.id),
    enabled: Boolean(client?.id),
    retry: 1,
  })

  const bookings = bookingsQuery.data?.bookings ?? []
  const published = bookings.filter((booking) => booking.status === 'published').length
  const upcoming = bookings.filter((booking) =>
    !['published', 'cancelled'].includes(booking.status),
  ).length

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome{client?.name ? `, ${client.name}` : ''}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Review your podcast booking progress and published appearances.
          </p>
        </div>

        {client?.dashboard_slug && (
          <Card className="border-primary/20">
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Podcasts waiting for your review</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Approve or pass on the shows your team has shortlisted for you.
                </p>
              </div>
              <Button asChild>
                <a href={`/client/${encodeURIComponent(client.dashboard_slug)}`}>
                  Review shortlist
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total bookings</CardDescription>
              <CardTitle className="text-3xl">{bookings.length}</CardTitle>
            </CardHeader>
            <CardContent><Mic2 className="h-5 w-5 text-muted-foreground" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Upcoming / in progress</CardDescription>
              <CardTitle className="text-3xl">{upcoming}</CardTitle>
            </CardHeader>
            <CardContent><CalendarDays className="h-5 w-5 text-muted-foreground" /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Published</CardDescription>
              <CardTitle className="text-3xl">{published}</CardTitle>
            </CardHeader>
            <CardContent><Radio className="h-5 w-5 text-muted-foreground" /></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Podcast placements</CardTitle>
            <CardDescription>Your current booking timeline.</CardDescription>
          </CardHeader>
          <CardContent>
            {bookingsQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading bookings…
              </div>
            ) : bookingsQuery.error ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-destructive">
                  We could not load your bookings. Your session may have expired.
                </p>
                <Button variant="outline" onClick={() => bookingsQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Try again
                </Button>
              </div>
            ) : bookings.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <CheckCircle2 className="h-9 w-9" />
                <p className="font-medium text-foreground">No bookings yet</p>
                <p className="text-sm">Your placements will appear here when they are added.</p>
              </div>
            ) : (
              <div className="divide-y">
                {bookings.map((booking) => (
                  <div key={booking.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{booking.podcast_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.host_name ? `Hosted by ${booking.host_name} · ` : ''}
                        {displayDate(bookingDate(booking))}
                      </p>
                    </div>
                    <Badge variant={booking.status === 'published' ? 'default' : 'secondary'} className="w-fit capitalize">
                      {statusLabel(booking.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  )
}
