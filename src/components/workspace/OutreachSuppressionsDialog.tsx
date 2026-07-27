import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Loader2, MailX, Plus, RotateCcw, Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { decodeHtmlEntities } from '@/lib/htmlEntities'
import {
  addOutreachSuppression,
  listOutreachSuppressions,
  removeOutreachSuppression,
  type OutreachSuppression,
  type OutreachSuppressionReason,
} from '@/services/hostRelationships'

/**
 * The workspace do-not-contact list.
 *
 * An opt-out is directed at the sender, not at one client's campaign, so a
 * single entry here silences the address for every client. Until now the list
 * had one writer — the inbox reply prefilter — and no way to read it, add to
 * it, or correct it, which meant a host who asked a person to stop had nowhere
 * to be recorded and a keyword false positive could never be undone.
 */

const REASON_VIEW: Record<OutreachSuppressionReason, { label: string; className: string }> = {
  opted_out: { label: 'Opted out', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
  bounced: { label: 'Bounced', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  manual: { label: 'Added by hand', className: 'border-muted bg-muted/50 text-foreground' },
}

const formatDate = (value: string): string => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? 'an unknown date'
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface OutreachSuppressionsDialogProps {
  workspaceId: string
  canManage: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const OutreachSuppressionsDialog = ({
  workspaceId,
  canManage,
  open,
  onOpenChange,
}: OutreachSuppressionsDialogProps) => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addReason, setAddReason] = useState<OutreachSuppressionReason>('opted_out')
  const [addNote, setAddNote] = useState('')
  const [reinstating, setReinstating] = useState<OutreachSuppression | null>(null)
  const [reinstateNote, setReinstateNote] = useState('')

  const suppressionsQuery = useQuery({
    queryKey: ['outreach-suppressions', workspaceId],
    queryFn: () => listOutreachSuppressions(workspaceId),
    enabled: open && Boolean(workspaceId),
    retry: false,
  })
  const suppressions = suppressionsQuery.data ?? []
  const term = search.trim().toLowerCase()
  const visible = suppressions.filter((row) => (
    !term
    || row.contact_email.includes(term)
    || decodeHtmlEntities(row.host_name ?? '').toLowerCase().includes(term)
    || decodeHtmlEntities(row.podcast_name ?? '').toLowerCase().includes(term)
  ))

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['outreach-suppressions', workspaceId] })
    // A suppression is the highest-severity relationship state, so the book and
    // any open prep dialog are stale the moment this changes.
    void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId] })
  }

  const addMutation = useMutation({
    mutationFn: () => addOutreachSuppression(workspaceId, {
      contactEmail: addEmail.trim(),
      reason: addReason,
      note: addNote.trim() || null,
    }),
    onSuccess: () => {
      setAddEmail('')
      setAddNote('')
      setAddReason('opted_out')
      toast.success('That address will not be contacted for any client.')
      refresh()
    },
    onError: (error) => toast.error(
      error instanceof Error ? error.message : 'The address could not be added.',
    ),
  })

  const removeMutation = useMutation({
    mutationFn: (input: { contactEmail: string; note: string }) => (
      removeOutreachSuppression(workspaceId, input)
    ),
    onSuccess: () => {
      setReinstating(null)
      setReinstateNote('')
      toast.success('Address reinstated. Outreach to it is possible again.')
      refresh()
    },
    onError: (error) => toast.error(
      error instanceof Error ? error.message : 'The address could not be removed.',
    ),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReinstating(null)
          setReinstateNote('')
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MailX className="h-5 w-5 text-destructive" />Do not contact
          </DialogTitle>
          <DialogDescription>
            An opt-out is directed at your agency, not at one campaign, so every address here is
            silenced for every client. Replies asking to stop are added automatically.
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <form
            className="mt-4 space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (addEmail.trim()) addMutation.mutate()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
              <div className="space-y-2">
                <Label htmlFor="suppression-email">Email address</Label>
                <Input
                  id="suppression-email"
                  type="email"
                  value={addEmail}
                  onChange={(event) => setAddEmail(event.target.value)}
                  placeholder="host@example.com"
                  maxLength={254}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="suppression-reason">Reason</Label>
                <Select
                  value={addReason}
                  onValueChange={(value) => setAddReason(value as OutreachSuppressionReason)}
                >
                  <SelectTrigger id="suppression-reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opted_out">Asked us to stop</SelectItem>
                    <SelectItem value="bounced">Address bounces</SelectItem>
                    <SelectItem value="manual">Our decision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="suppression-note">Note (optional)</Label>
              <Input
                id="suppression-note"
                value={addNote}
                onChange={(event) => setAddNote(event.target.value)}
                placeholder="Asked to stop on a call, 26 July"
                maxLength={1_000}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!addEmail.trim() || addMutation.isPending}>
                {addMutation.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Plus className="mr-2 h-4 w-4" />}
                Add to list
              </Button>
            </div>
          </form>
        )}

        {!canManage && (
          <div className="mt-4 flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>You can see who must not be contacted. Owners and admins change the list.</p>
          </div>
        )}

        {suppressions.length > 0 && (
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search the do-not-contact list"
              placeholder="Search addresses, hosts, or shows"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        )}

        <div className="mt-4 space-y-2">
          {suppressionsQuery.isLoading && (
            <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading the do-not-contact list…
            </div>
          )}
          {suppressionsQuery.error && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">The do-not-contact list could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void suppressionsQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!suppressionsQuery.isLoading && !suppressionsQuery.error && visible.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm font-medium">
                {suppressions.length === 0 ? 'Nobody is suppressed' : 'No addresses match that search'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {suppressions.length === 0
                  ? 'A reply asking to stop is added here automatically, and outreach to that address stops for every client.'
                  : 'Try a different address, host, or show.'}
              </p>
            </div>
          )}

          {visible.map((row) => {
            const reason = REASON_VIEW[row.reason] ?? REASON_VIEW.manual
            return (
              <div key={row.contact_email} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.contact_email}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.podcast_name || row.host_name
                        ? decodeHtmlEntities([row.host_name, row.podcast_name].filter(Boolean).join(' · '))
                        : 'Host not identified'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={reason.className}>
                      <Ban className="mr-1 h-3 w-3" />{reason.label}
                    </Badge>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReinstating(row)
                          setReinstateNote('')
                        }}
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reinstate
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.source === 'inbox_auto'
                    ? 'Detected in a reply'
                    : `Added by ${row.created_by_email ?? 'a workspace manager'}`}
                  {' on '}{formatDate(row.created_at)}
                  {row.touch_count > 0
                    ? ` · ${row.touch_count} ${row.touch_count === 1 ? 'pitch' : 'pitches'} sent before this`
                    : ''}
                </p>
                {row.note && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.note}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Reinstating means this platform will email someone recorded as not
            wanting to hear from us. It is the one action here worth making a
            person write down a reason for. */}
        <Dialog
          open={Boolean(reinstating)}
          onOpenChange={(next) => {
            if (!next) {
              setReinstating(null)
              setReinstateNote('')
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (reinstating && reinstateNote.trim().length >= 4) {
                  removeMutation.mutate({
                    contactEmail: reinstating.contact_email,
                    note: reinstateNote.trim(),
                  })
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Reinstate {reinstating?.contact_email}?</DialogTitle>
                <DialogDescription>
                  {reinstating?.source === 'inbox_auto'
                    ? 'This address was silenced because a reply from it asked to stop. Removing it lets your campaigns email this person again. Do this only if the detection was wrong.'
                    : 'Removing this address lets your campaigns email this person again.'}
                </DialogDescription>
              </DialogHeader>
              {reinstating?.note && (
                <p className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <span className="font-medium">Recorded at the time:</span> {reinstating.note}
                </p>
              )}
              <div className="mt-4 space-y-2">
                <Label htmlFor="suppression-reinstate-note">Why is this safe?</Label>
                <Textarea
                  id="suppression-reinstate-note"
                  value={reinstateNote}
                  onChange={(event) => setReinstateNote(event.target.value)}
                  placeholder="The reply said unsubscribe me from the newsletter, not from the show."
                  className="min-h-24 resize-y"
                  maxLength={1_000}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This is written to the audit log with the original suppression, so the decision
                  stays on record.
                </p>
              </div>
              <DialogFooter className="mt-5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReinstating(null)}
                  disabled={removeMutation.isPending}
                >
                  Keep suppressed
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={reinstateNote.trim().length < 4 || removeMutation.isPending}
                >
                  {removeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reinstate address
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}
