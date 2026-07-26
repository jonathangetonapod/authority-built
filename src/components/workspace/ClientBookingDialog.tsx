import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteWorkspaceClientBooking,
  saveWorkspaceClientBooking,
  type WorkspaceClientBooking,
} from '@/services/clients'

// The placement lifecycle, in the order a conversation actually moves.
const STATUS_OPTIONS: Array<{ value: WorkspaceClientBooking['status']; label: string; hint: string }> = [
  { value: 'conversation_started', label: 'Conversation started', hint: 'The host replied and you are talking' },
  { value: 'in_progress', label: 'In progress', hint: 'Working out details or scheduling' },
  { value: 'booked', label: 'Booked', hint: 'A recording date is confirmed' },
  { value: 'recorded', label: 'Recorded', hint: 'The interview happened' },
  { value: 'published', label: 'Published', hint: 'The episode is live' },
  { value: 'cancelled', label: 'Cancelled', hint: 'It is not happening' },
]

interface BookingForm {
  podcast_name: string
  host_name: string
  podcast_url: string
  status: WorkspaceClientBooking['status']
  scheduled_date: string
  recording_date: string
  publish_date: string
  episode_url: string
  notes: string
  prep_sent: boolean
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

  useEffect(() => {
    if (!open) return
    setConfirmingDelete(false)
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
      },
      booking?.id,
    ),
    onSuccess: () => {
      toast.success(booking ? 'Placement updated.' : `Logged for ${clientName}.`)
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
  const activeStatus = STATUS_OPTIONS.find((option) => option.value === form.status)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booking ? 'Edit placement' : `Log a podcast conversation for ${clientName}`}</DialogTitle>
          <DialogDescription>
            Track a show from the first reply through to a published episode. Dates are optional
            until they are known.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="booking-podcast">Podcast<span className="text-destructive"> *</span></Label>
              <Input
                id="booking-podcast"
                value={form.podcast_name}
                onChange={(event) => setForm((current) => ({ ...current, podcast_name: event.target.value }))}
                placeholder="Founder Stories"
                maxLength={300}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-host">Host</Label>
              <Input
                id="booking-host"
                value={form.host_name}
                onChange={(event) => setForm((current) => ({ ...current, host_name: event.target.value }))}
                placeholder="Jamie Rivera"
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
            <Label htmlFor="booking-status">Stage</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setForm((current) => ({ ...current, status: value as BookingForm['status'] }))}
            >
              <SelectTrigger id="booking-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeStatus && <p className="text-xs text-muted-foreground">{activeStatus.hint}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="booking-scheduled">Scheduled</Label>
              <Input
                id="booking-scheduled"
                type="date"
                value={form.scheduled_date}
                onChange={(event) => setForm((current) => ({ ...current, scheduled_date: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-recording">Recording</Label>
              <Input
                id="booking-recording"
                type="date"
                value={form.recording_date}
                onChange={(event) => setForm((current) => ({ ...current, recording_date: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-publish">Episode live</Label>
              <Input
                id="booking-publish"
                type="date"
                value={form.publish_date}
                onChange={(event) => setForm((current) => ({ ...current, publish_date: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-episode">Episode link</Label>
            <Input
              id="booking-episode"
              value={form.episode_url}
              onChange={(event) => setForm((current) => ({ ...current, episode_url: event.target.value }))}
              placeholder="https://… (once the episode is live)"
              maxLength={2048}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-notes">Notes</Label>
            <Textarea
              id="booking-notes"
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="What the host asked for, scheduling constraints, anything the client should know."
              className="min-h-24"
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

        <DialogFooter className="gap-2 sm:justify-between">
          {booking ? (
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
            <Button
              type="button"
              disabled={busy || !form.podcast_name.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {booking ? 'Save changes' : 'Log placement'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
