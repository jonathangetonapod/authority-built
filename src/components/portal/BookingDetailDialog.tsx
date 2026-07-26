import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Circle, ExternalLink, Headphones, Loader2, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import { removePortalCalendarEvent, type PortalExperienceBooking } from '@/services/clientPortal'

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
  // The journey starts when the host replies, not when a date is set — a
  // conversation in progress should read as real progress, not an empty row.
  return [
    {
      label: 'Conversation started',
      date: null,
      done: reached(['conversation_started', 'in_progress', 'booked', 'recorded', 'published']),
    },
    { label: 'Booked', date: booking.scheduled_date, done: reached(['booked', 'recorded', 'published']) },
    { label: 'Recording', date: booking.recording_date, done: reached(['recorded', 'published']) },
    { label: 'Episode live', date: booking.publish_date, done: reached(['published']) },
  ]
}

interface BookingDetailDialogProps {
  booking: PortalExperienceBooking | null
  onOpenChange: (open: boolean) => void
  onRemoved?: () => void
}

export function BookingDetailDialog({ booking, onOpenChange, onRemoved }: BookingDetailDialogProps) {
  const { client } = useClientPortal()
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const removeMutation = useMutation({
    mutationFn: () => removePortalCalendarEvent(client!.id, booking!.id),
    onSuccess: () => {
      toast.success('Removed from your calendar.')
      setConfirmingRemove(false)
      onRemoved?.()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'That event could not be removed.')
    },
  })
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
                        {displayDate(step.date)
                          ?? (step.label === 'Conversation started'
                            ? (step.done ? 'Your team is talking with this show' : 'Not started yet')
                            : step.done ? 'Date not recorded' : 'Date coming soon')}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {booking.podcast_description && (
              <p className="max-h-32 overflow-y-auto text-sm leading-6 text-muted-foreground">{booking.podcast_description}</p>
            )}

            {booking.created_by_client && client?.id && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">You added this event.</p>
                <Button
                  type="button"
                  size="sm"
                  variant={confirmingRemove ? 'destructive' : 'ghost'}
                  disabled={removeMutation.isPending}
                  onClick={() => (confirmingRemove ? removeMutation.mutate() : setConfirmingRemove(true))}
                >
                  {removeMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                  {confirmingRemove ? 'Confirm remove' : 'Remove'}
                </Button>
              </div>
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
