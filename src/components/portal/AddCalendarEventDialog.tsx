import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
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
import { addPortalCalendarEvent } from '@/services/clientPortal'

type EventKind = 'recording' | 'release'

interface AddCalendarEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  onAdded: () => void
}

export function AddCalendarEventDialog({ open, onOpenChange, clientId, onAdded }: AddCalendarEventDialogProps) {
  const [kind, setKind] = useState<EventKind>('recording')
  const [podcastName, setPodcastName] = useState('')
  const [hostName, setHostName] = useState('')
  const [date, setDate] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open) return
    setKind('recording')
    setPodcastName('')
    setHostName('')
    setDate('')
    setLink('')
    setNotes('')
  }, [open])

  const addMutation = useMutation({
    mutationFn: () => addPortalCalendarEvent(clientId, {
      podcast_name: podcastName.trim(),
      kind,
      date,
      host_name: hostName.trim() || null,
      podcast_url: kind === 'recording' ? link.trim() || null : null,
      episode_url: kind === 'release' ? link.trim() || null : null,
      notes: notes.trim() || null,
    }),
    onSuccess: () => {
      toast.success(kind === 'recording' ? 'Recording added to your calendar.' : 'Episode release added to your calendar.')
      onAdded()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'That event could not be added.')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!addMutation.isPending) onOpenChange(next) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to your calendar</DialogTitle>
          <DialogDescription>
            Booked a show yourself, or know when an episode goes live? Add it here so your
            calendar stays complete. Your team sees it too.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">What are you adding?</Label>
            <div role="radiogroup" aria-label="Event type" className="mt-2 grid grid-cols-2 gap-2">
              {([
                { value: 'recording' as const, label: 'A recording', hint: 'The day you record' },
                { value: 'release' as const, label: 'An episode going live', hint: 'The day it publishes' },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.value}
                  onClick={() => setKind(option.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${kind === option.value ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/30'}`}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-podcast">Podcast<span className="text-destructive"> *</span></Label>
            <Input
              id="event-podcast"
              value={podcastName}
              onChange={(event) => setPodcastName(event.target.value)}
              placeholder="The show’s name"
              maxLength={300}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-date">Date<span className="text-destructive"> *</span></Label>
              <Input id="event-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-host">Host</Label>
              <Input
                id="event-host"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
                placeholder="Optional"
                maxLength={200}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-link">{kind === 'release' ? 'Episode link' : 'Podcast link'}</Label>
            <Input
              id="event-link"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://… (optional)"
              maxLength={2000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-notes">Notes</Label>
            <Textarea
              id="event-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything your team should know (optional)"
              className="min-h-20"
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={addMutation.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={addMutation.isPending || !podcastName.trim() || !date}
            onClick={() => addMutation.mutate()}
          >
            {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
