import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { deleteWorkspace } from '@/services/workspaceDeletion'

interface WorkspaceDeletionCardProps {
  workspaceId: string
  workspaceName: string
}

/**
 * The way out.
 *
 * There was none: an owner who wanted to close their account had to email, and
 * the subscription kept charging until somebody cancelled it by hand.
 *
 * Two things about this are worth knowing before pressing it, so both are said
 * on the screen rather than in a help article. The subscription ends now, not
 * at the end of the period — the workspace stops working the moment this
 * returns, so billing the rest of the month would be for nothing. And access
 * goes with it, including this session, which is why there is no undo button
 * here afterwards: by then you cannot sign in to press it.
 */
export function WorkspaceDeletionCard({ workspaceId, workspaceName }: WorkspaceDeletionCardProps) {
  const { signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')

  // Typing the name, not "DELETE". A fixed word is muscle memory; the name is
  // the one thing that cannot be typed by someone who has the wrong workspace
  // open.
  const confirmed = confirmation.trim().toLowerCase() === workspaceName.trim().toLowerCase()

  const close = useMutation({
    mutationFn: () => deleteWorkspace(workspaceId, reason),
    onSuccess: async (result) => {
      if (result.stranded_domains?.length) {
        // Said out loud because nothing else will notice: these still exist at
        // the provider and still cost money.
        toast.warning(
          `Closed, but ${result.stranded_domains.length} custom domain${result.stranded_domains.length === 1 ? '' : 's'} could not be removed automatically. We have a record and will clear them.`,
        )
      } else {
        toast.success('Your workspace is closed. Your subscription has ended.')
      }
      setOpen(false)
      await signOut()
    },
    onError: (error) => {
      // Worth showing verbatim: the function refuses rather than half-closing,
      // and the reason it gives — a subscription that would not cancel, sending
      // that would not stop — is the thing to act on.
      toast.error(error instanceof Error ? error.message : 'The workspace could not be closed.')
    },
  })

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
          Close this workspace
        </CardTitle>
        <CardDescription>
          Ends your subscription immediately, stops any outreach still sending, and removes
          access for everyone on the team. Your data is kept for 30 days in case you change
          your mind, then permanently deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
          Close workspace
        </Button>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(next) => { if (!close.isPending) { setOpen(next); if (!next) setConfirmation('') } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {workspaceName}?</DialogTitle>
            <DialogDescription>
              This ends your subscription now — not at the end of the billing period — and
              signs everyone out. Campaigns still sending are stopped first.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">You will not be able to undo this yourself.</p>
              <p className="mt-1 text-muted-foreground">
                Closing removes your access straight away, so there is nothing to sign in to
                afterwards. Your data is recoverable for 30 days — email
                {' '}
                <a className="underline" href="mailto:jonathan@getonapod.com">jonathan@getonapod.com</a>
                {' '}
                and we can bring it back within that window.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-close-reason">Anything we should know? (optional)</Label>
              <Textarea
                id="workspace-close-reason"
                value={reason}
                maxLength={500}
                disabled={close.isPending}
                onChange={(event) => setReason(event.target.value)}
                placeholder="What made you decide to close?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspace-close-confirm">
                Type <span className="font-semibold">{workspaceName}</span> to confirm
              </Label>
              <Input
                id="workspace-close-confirm"
                value={confirmation}
                autoComplete="off"
                disabled={close.isPending}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={close.isPending}>
              Keep my workspace
            </Button>
            <Button
              variant="destructive"
              disabled={!confirmed || close.isPending}
              onClick={() => close.mutate()}
            >
              {close.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Close workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
