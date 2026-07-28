import { ArrowRight, CalendarPlus, Download, ExternalLink, Headphones } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  activityCalendarEvent,
  DAY_LABEL,
  formatDay,
  KIND_VIEW,
  type CalendarActivity,
} from '@/components/workspace/clientActivity'
import { googleCalendarUrl, icsDownloadHref, icsFileName } from '@/lib/calendarLinks'
import { safeExternalUrl } from '@/lib/externalUrl'

/**
 * One day on the client calendar, opened.
 *
 * The grid can only carry a client name in a cell, so the day itself was
 * unreadable: which show, whose recording, and whether it is still happening
 * all lived behind a hover title. This states them, offers the event to the
 * operator's own calendar, and hands off to the placement record for
 * everything that is not about the date.
 */

const compactNumber = (value: number | null): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** 'conversation_started' reads as a column name; nobody says that out loud. */
const humanize = (value: string): string => {
  const words = value.replace(/_/gu, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{value}</dd>
    </div>
  )
}

interface ActivityDetailDialogProps {
  activity: CalendarActivity | null
  /** Everything else happening the same day, so a busy day can be walked. */
  sameDay: CalendarActivity[]
  onSelect: (activity: CalendarActivity) => void
  onOpenChange: (open: boolean) => void
  onOpenPlacement?: (itemId: string) => void
}

export const ActivityDetailDialog = ({
  activity,
  sameDay,
  onSelect,
  onOpenChange,
  onOpenPlacement,
}: ActivityDetailDialogProps) => {
  const view = activity ? KIND_VIEW[activity.kind] : null
  const event = activity ? activityCalendarEvent(activity) : null
  // A cancelled recording is still worth reading; putting it in a calendar is
  // an event the operator then has to delete by hand.
  const exportable = event && activity && !activity.cancelled
  const googleUrl = exportable ? googleCalendarUrl(event) : null
  const icsHref = exportable ? icsDownloadHref(event) : null
  const showUrl = safeExternalUrl(activity?.podcastUrl)
  const episodeUrl = safeExternalUrl(activity?.episodeUrl)
  const audience = compactNumber(activity?.audienceSize ?? null)
  const others = activity ? sameDay.filter((entry) => entry.id !== activity.id) : []

  return (
    <Dialog open={Boolean(activity)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        {activity && view && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                {activity.podcastImage ? (
                  <img src={activity.podcastImage} alt="" className="h-12 w-12 shrink-0 rounded-lg border object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                    <Headphones className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <DialogTitle className="text-left">{activity.podcastName}</DialogTitle>
                  <DialogDescription className="mt-1 text-left">
                    {activity.hostName ? `Hosted by ${activity.hostName}` : 'Podcast placement'}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className={view.className}>
                  <view.Icon className="mr-1 h-3 w-3" />{view.label}
                </Badge>
                {activity.cancelled && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">Cancelled</Badge>
                )}
              </div>
            </DialogHeader>

            <p className="text-sm font-medium">{formatDay(activity.day)}</p>

            <dl className="rounded-xl border px-3 py-1">
              <DetailRow label="Client" value={activity.clientName} />
              <DetailRow label="Stage" value={humanize(activity.stage)} />
              {activity.bookingStatus && <DetailRow label="Placement" value={humanize(activity.bookingStatus)} />}
              {audience && <DetailRow label="Audience" value={`${audience} listeners`} />}
              {activity.kind === 'outreach' && activity.campaign && (
                <DetailRow
                  label="Campaign"
                  value={`${humanize(activity.campaign.status)} · ${activity.campaign.openCount} opens · ${activity.campaign.replyCount} replies`}
                />
              )}
              {activity.nextAction && <DetailRow label="Next action" value={activity.nextAction} />}
            </dl>

            {activity.notes && (
              <p className="max-h-28 overflow-y-auto whitespace-pre-line rounded-xl bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
                {activity.notes}
              </p>
            )}

            {(googleUrl || icsHref) && (
              <div className="rounded-xl border bg-muted/10 p-3">
                <p className="text-xs font-medium text-muted-foreground">Add to your calendar</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {googleUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={googleUrl} target="_blank" rel="noreferrer">
                        <CalendarPlus className="mr-2 h-3.5 w-3.5" />Google Calendar
                      </a>
                    </Button>
                  )}
                  {icsHref && (
                    <Button asChild variant="outline" size="sm">
                      <a href={icsHref} download={icsFileName(event!.title, activity.day)}>
                        <Download className="mr-2 h-3.5 w-3.5" />Download .ics
                      </a>
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  An all-day event. The .ics file opens in Apple Calendar, Outlook, and anything else that reads invitations.
                </p>
              </div>
            )}

            {activity.cancelled && (
              <p className="text-xs text-muted-foreground">
                This placement was cancelled, so the date is kept for the record rather than offered to a calendar.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {onOpenPlacement && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onOpenPlacement(activity.itemId)
                    onOpenChange(false)
                  }}
                >
                  Open placement<ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              )}
              {episodeUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={episodeUrl} target="_blank" rel="noreferrer">
                    Listen<ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              {showUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={showUrl} target="_blank" rel="noreferrer">
                    Visit show<ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>

            {others.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Also on {formatDay(activity.day, DAY_LABEL)}
                </p>
                <div className="mt-2 divide-y rounded-xl border">
                  {others.map((entry) => {
                    const entryView = KIND_VIEW[entry.kind]
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => onSelect(entry)}
                        className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-muted/30"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${entryView.dot}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{entry.podcastName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entryView.label} · {entry.clientName}
                          </span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
