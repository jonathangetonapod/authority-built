import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteWorkspaceClientBooking,
  saveWorkspaceClientBooking,
  type WorkspaceClientBooking,
} from '@/services/clients'
import { getClientShortlist } from '@/services/clientShortlist'

type Status = WorkspaceClientBooking['status']
type DateField = 'scheduled_date' | 'recording_date' | 'publish_date'

// One entry per real stage of a placement. `dates` lists only the dates that
// mean something at that stage — everything else stays out of the way.
const STAGES: Array<{ value: Status; label: string; hint: string; dates: DateField[] }> = [
  {
    value: 'conversation_started',
    label: 'Conversation',
    hint: 'The host replied and you are talking. No dates needed yet.',
    dates: [],
  },
  {
    value: 'in_progress',
    label: 'Scheduling',
    hint: 'Working out a date — add a target if you have one.',
    dates: ['scheduled_date'],
  },
  {
    value: 'booked',
    label: 'Booked',
    hint: 'The recording is confirmed. This date shows on the client’s calendar.',
    dates: ['recording_date'],
  },
  {
    value: 'recorded',
    label: 'Recorded',
    hint: 'The interview happened. Add the release date once the host shares it.',
    dates: ['recording_date', 'publish_date'],
  },
  {
    value: 'published',
    label: 'Published',
    hint: 'The episode is live — add the link so the client can listen and share it.',
    dates: ['recording_date', 'publish_date'],
  },
  { value: 'cancelled', label: 'Cancelled', hint: 'It is not happening.', dates: [] },
]

const DATE_LABELS: Record<DateField, string> = {
  scheduled_date: 'Target date',
  recording_date: 'Recording date',
  publish_date: 'Episode goes live',
}

interface BookingForm {
  podcast_name: string
  host_name: string
  podcast_url: string
  status: Status
  scheduled_date: string
  recording_date: string
  publish_date: string
  episode_url: string
  notes: string
  prep_sent: boolean
  // Set when the show came from this client's shortlist, so the placement
  // stays joinable to its research, campaign and portal artwork.
  shortlist_podcast_id: string | null
}

const emptyForm: BookingForm = {
  podcast_name: '',
  host_name: '',
  podcast_url: '',
  status: 'conversation_started',
  scheduled_date: '',
  recording_date: '',
  publish_date: '',
  episode_url: '',
  notes: '',
  prep_sent: false,
  shortlist_podcast_id: null,
}

interface ClientBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  clientId: string
  clientName: string
  booking: WorkspaceClientBooking | null
  onSaved: () => void
}

export const ClientBookingDialog = ({
  open,
  onOpenChange,
  workspaceId,
  clientId,
  clientName,
  booking,
  onSaved,
}: ClientBookingDialogProps) => {
  const [form, setForm] = useState<BookingForm>(emptyForm)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [podcastQuery, setPodcastQuery] = useState('')

  /*
   * Existing means it has an id. The Command Center seeds this dialog with a
   * booking-shaped object whose id is '' so the form opens prefilled, and
   * branching on the object's truthiness treated that seed as a placement that
   * already exists: it offered a Remove whose delete sent the empty id and
   * 400'd, hid the shortlist autocomplete, and titled a first-time log as an
   * edit with a "Save" button.
   */
  const isExisting = Boolean(booking?.id)

  // Picking a show the client already approved beats retyping its name, and
  // keeps the booking spelled the same as the shortlist row it came from.
  const shortlistQuery = useQuery({
    queryKey: ['client-shortlist', workspaceId, clientId],
    queryFn: () => getClientShortlist(workspaceId, clientId),
    enabled: open && !isExisting,
    retry: false,
    staleTime: 5 * 60_000,
  })
  const query = podcastQuery.trim().toLowerCase()
  const suggestions = (shortlistQuery.data?.podcasts ?? [])
    .filter((podcast) => query
      && podcast.podcast_name.toLowerCase().includes(query)
      && podcast.podcast_name.toLowerCase() !== query)
    .slice(0, 5)

  useEffect(() => {
    if (!open) return
    setConfirmingDelete(false)
    setPodcastQuery('')
    setShowMore(false)
    setForm(booking
      ? {
        podcast_name: booking.podcast_name,
        host_name: booking.host_name || '',
        podcast_url: booking.podcast_url || '',
        status: booking.status,
        scheduled_date: booking.scheduled_date || '',
        recording_date: booking.recording_date || '',
        publish_date: booking.publish_date || '',
        episode_url: booking.episode_url || '',
        notes: booking.notes || '',
        prep_sent: booking.prep_sent,
        shortlist_podcast_id: booking.shortlist_podcast_id ?? null,
      }
      : emptyForm)
  }, [open, booking])

  const saveMutation = useMutation({
    mutationFn: () => saveWorkspaceClientBooking(
      workspaceId,
      clientId,
      {
        podcast_name: form.podcast_name.trim(),
        host_name: form.host_name.trim() || null,
        podcast_url: form.podcast_url.trim() || null,
        status: form.status,
        scheduled_date: form.scheduled_date || null,
        recording_date: form.recording_date || null,
        publish_date: form.publish_date || null,
        episode_url: form.episode_url.trim() || null,
        notes: form.notes.trim() || null,
        prep_sent: form.prep_sent,
        shortlist_podcast_id: form.shortlist_podcast_id,
      },
      booking?.id,
    ),
    onSuccess: () => {
      toast.success(isExisting ? 'Placement updated.' : `Logged for ${clientName}.`)
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The placement could not be saved.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceClientBooking(workspaceId, clientId, booking!.id),
    onSuccess: () => {
      toast.success('Placement removed.')
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The placement could not be removed.')
    },
  })

  const busy = saveMutation.isPending || deleteMutation.isPending
  const stage = STAGES.find((option) => option.value === form.status) ?? STAGES[0]
  const stageIndex = STAGES.findIndex((option) => option.value === form.status)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isExisting ? form.podcast_name || 'Edit placement' : `Log a podcast for ${clientName}`}
          </DialogTitle>
          <DialogDescription>
            Dates you add appear on {clientName}’s calendar, so leave one blank until it is real.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="booking-podcast">Which podcast?</Label>
            <Input
              id="booking-podcast"
              value={form.podcast_name}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  podcast_name: event.target.value,
                  shortlist_podcast_id: null,
                }))
                setPodcastQuery(event.target.value)
              }}
              placeholder="Start typing — shows on this client’s list appear"
              autoComplete="off"
              maxLength={300}
            />
            {suggestions.length > 0 && (
              <ul className="rounded-lg border bg-popover p-1 shadow-sm" aria-label="Shows on this client’s list">
                {suggestions.map((podcast) => (
                  <li key={podcast.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setForm((current) => ({
                          ...current,
                          podcast_name: podcast.podcast_name,
                          podcast_url: podcast.podcast_url || current.podcast_url,
                          shortlist_podcast_id: podcast.id,
                        }))
                        setPodcastQuery('')
                      }}
                    >
                      <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{podcast.podcast_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label>Where is it now?</Label>
            <div role="radiogroup" aria-label="Placement stage" className="flex flex-wrap gap-1.5">
              {STAGES.map((option, index) => {
                const selected = form.status === option.value
                const passed = stageIndex >= 0
                  && index < stageIndex
                  && option.value !== 'cancelled'
                  && form.status !== 'cancelled'
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setForm((current) => ({ ...current, status: option.value }))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? option.value === 'cancelled'
                          ? 'border-destructive bg-destructive text-destructive-foreground'
                          : 'border-primary bg-primary text-primary-foreground'
                        : passed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">{stage.hint}</p>
          </div>

          {stage.dates.length > 0 && (
            <div className={`grid gap-4 ${stage.dates.length > 1 ? 'sm:grid-cols-2' : ''}`}>
              {stage.dates.map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`booking-${field}`}>{DATE_LABELS[field]}</Label>
                  <Input
                    id={`booking-${field}`}
                    type="date"
                    value={form[field]}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {form.status === 'published' && (
            <div className="space-y-2">
              <Label htmlFor="booking-episode">Episode link</Label>
              <Input
                id="booking-episode"
                value={form.episode_url}
                onChange={(event) => setForm((current) => ({ ...current, episode_url: event.target.value }))}
                placeholder="https://… — the client listens and shares from here"
                maxLength={2048}
              />
            </div>
          )}

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 text-muted-foreground"
              aria-expanded={showMore}
              onClick={() => setShowMore((current) => !current)}
            >
              {showMore ? <ChevronUp className="mr-1.5 h-4 w-4" /> : <ChevronDown className="mr-1.5 h-4 w-4" />}
              {showMore ? 'Fewer details' : 'Host, link, notes'}
            </Button>
            {showMore && (
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="booking-host">Host</Label>
                    <Input
                      id="booking-host"
                      value={form.host_name}
                      onChange={(event) => setForm((current) => ({ ...current, host_name: event.target.value }))}
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="booking-url">Podcast link</Label>
                    <Input
                      id="booking-url"
                      value={form.podcast_url}
                      onChange={(event) => setForm((current) => ({ ...current, podcast_url: event.target.value }))}
                      placeholder="https://…"
                      maxLength={2048}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-notes">Notes</Label>
                  <Textarea
                    id="booking-notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Internal only — not shown to the client."
                    className="min-h-20"
                    maxLength={10_000}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={form.prep_sent}
                    onChange={(event) => setForm((current) => ({ ...current, prep_sent: event.target.checked }))}
                  />
                  Prep sent to {clientName}
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isExisting ? (
            <Button
              type="button"
              variant={confirmingDelete ? 'destructive' : 'ghost'}
              size="sm"
              disabled={busy}
              onClick={() => (confirmingDelete ? deleteMutation.mutate() : setConfirmingDelete(true))}
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {confirmingDelete ? 'Confirm remove' : 'Remove'}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={busy || !form.podcast_name.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isExisting ? 'Save' : 'Log it'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
