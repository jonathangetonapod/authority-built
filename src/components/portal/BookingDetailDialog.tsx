import { CheckCircle2, Circle, ExternalLink, Headphones, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { PortalExperienceBooking } from '@/services/clientPortal'

const displayDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

const compactNumber = (value: number | null): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

interface TimelineStep {
  label: string
  date: string | null
  done: boolean
}

const timelineSteps = (booking: PortalExperienceBooking): TimelineStep[] => {
  const reached = (statuses: string[]) => statuses.includes(booking.status)
  return [
    { label: 'Booked', date: booking.scheduled_date, done: reached(['booked', 'recorded', 'published']) },
    { label: 'Recording', date: booking.recording_date, done: reached(['recorded', 'published']) },
    { label: 'Episode live', date: booking.publish_date, done: reached(['published']) },
  ]
}

interface BookingDetailDialogProps {
  booking: PortalExperienceBooking | null
  onOpenChange: (open: boolean) => void
}

export function BookingDetailDialog({ booking, onOpenChange }: BookingDetailDialogProps) {
  const podcastUrl = booking?.podcast_url ? safeExternalUrl(booking.podcast_url) : null
  const episodeUrl = booking?.episode_url ? safeExternalUrl(booking.episode_url) : null
  const audience = booking ? compactNumber(booking.audience_size) : null

  return (
    <Dialog open={Boolean(booking)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {booking && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                {booking.podcast_image_url ? (
                  <img src={booking.podcast_image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg border object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                    <Headphones className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <DialogTitle className="text-left">{booking.podcast_name}</DialogTitle>
                  <DialogDescription className="mt-1 text-left">
                    {booking.host_name ? `Hosted by ${booking.host_name}` : 'Your placement details'}
                  </DialogDescription>
                  {booking.status === 'cancelled' && (
                    <Badge variant="outline" className="mt-2 bg-muted text-muted-foreground">Cancelled</Badge>
                  )}
                </div>
              </div>
            </DialogHeader>

            {(audience || booking.itunes_rating || booking.episode_count) && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {audience && <span className="inline-flex items-center gap-1"><Headphones className="h-3.5 w-3.5" />{audience} listeners</span>}
                {booking.itunes_rating && (
                  <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" />{Number(booking.itunes_rating).toFixed(1)} rating</span>
                )}
                {booking.episode_count ? <span>{booking.episode_count} episodes</span> : null}
              </div>
            )}

            {booking.status !== 'cancelled' && (
              <ol aria-label="Placement timeline" className="space-y-3">
                {timelineSteps(booking).map((step) => (
                  <li key={step.label} className="flex items-start gap-3">
                    {step.done
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />}
                    <div>
                      <p className={`text-sm font-medium ${step.done ? '' : 'text-muted-foreground'}`}>{step.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {displayDate(step.date) ?? (step.done ? 'Date not recorded' : 'Date coming soon')}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {booking.podcast_description && (
              <p className="max-h-32 overflow-y-auto text-sm leading-6 text-muted-foreground">{booking.podcast_description}</p>
            )}

            {(episodeUrl || podcastUrl) && (
              <div className="flex flex-wrap gap-2">
                {episodeUrl && (
                  <Button asChild size="sm">
                    <a href={episodeUrl} target="_blank" rel="noreferrer">Listen to your episode<ExternalLink className="ml-2 h-3.5 w-3.5" /></a>
                  </Button>
                )}
                {podcastUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={podcastUrl} target="_blank" rel="noreferrer">Visit the podcast<ExternalLink className="ml-2 h-3.5 w-3.5" /></a>
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
