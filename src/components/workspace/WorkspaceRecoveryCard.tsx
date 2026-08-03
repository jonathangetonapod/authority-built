import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listDeletedWorkspaces, type DeletedAdminWorkspace } from '@/services/adminWorkspaces'
import { restoreWorkspace } from '@/services/workspaceDeletion'

/** Whole days left, floored — "0 days left" is honest about today being the last one. */
function daysLeft(purgeAfter: string | null): number | null {
  if (!purgeAfter) return null
  const remaining = new Date(purgeAfter).getTime() - Date.now()
  if (!Number.isFinite(remaining)) return null
  return Math.max(0, Math.floor(remaining / 86_400_000))
}

function formattedDate(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Closed workspaces, and the only way to bring one back.
 *
 * Closing revokes the owner's access in the same statement that marks the
 * workspace, so the person who did it cannot sign in to undo it. Every recovery
 * request therefore arrives here, by email, from somebody who cannot show you
 * the thing they are asking about — which is why this lists what is still
 * recoverable and how long is left, rather than waiting to be asked.
 *
 * An empty list is the normal state and says so; a queue of rows here would be
 * the unusual thing.
 */
export function WorkspaceRecoveryCard() {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<DeletedAdminWorkspace | null>(null)

  const deletedQuery = useQuery({
    queryKey: ['platform', 'deleted-workspaces'],
    queryFn: listDeletedWorkspaces,
    retry: false,
  })

  const restore = useMutation({
    mutationFn: (workspace: DeletedAdminWorkspace) => restoreWorkspace(workspace.id),
    onSuccess: async (_result, workspace) => {
      await queryClient.invalidateQueries({ queryKey: ['platform', 'deleted-workspaces'] })
      await queryClient.invalidateQueries({ queryKey: ['platform', 'workspace-users'] })
      setConfirming(null)
      toast.success(`${workspace.name} is open again. Its owner can sign in.`)
    },
    onError: (error) => {
      // Worth showing as given: past the window the answer is a flat no, and
      // saying so plainly is better than a generic failure the reader will
      // assume is retryable.
      toast.error(error instanceof Error ? error.message : 'The workspace could not be restored.')
    },
  })

  const rows = useMemo(
    () => (deletedQuery.data || []).slice().sort((left, right) => {
      const leftDue = left.purge_after || ''
      const rightDue = right.purge_after || ''
      return leftDue.localeCompare(rightDue)
    }),
    [deletedQuery.data],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5" aria-hidden="true" />
          Closed workspaces
        </CardTitle>
        <CardDescription>
          A closed workspace keeps its data for 30 days, then it is deleted for good. Only you
          can bring one back — closing removes the owner's access, so they cannot sign in to
          undo it themselves.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deletedQuery.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading closed workspaces…
          </p>
        ) : deletedQuery.isError ? (
          <p className="py-6 text-sm text-destructive" role="alert">
            {deletedQuery.error instanceof Error
              ? deletedQuery.error.message
              : 'Closed workspaces could not be loaded.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No workspace has been closed. Any that are will appear here until their 30 days run out.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead>Deleted for good</TableHead>
                  <TableHead>Reason given</TableHead>
                  <TableHead className="text-right">Bring back</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((workspace) => {
                  const remaining = daysLeft(workspace.purge_after)
                  const urgent = remaining !== null && remaining <= 3
                  return (
                    <TableRow key={workspace.id}>
                      <TableCell className="align-top">
                        <p className="font-medium">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">{workspace.slug}</p>
                      </TableCell>
                      <TableCell className="align-top text-sm tabular-nums">
                        {formattedDate(workspace.deleted_at)}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="tabular-nums">{formattedDate(workspace.purge_after)}</span>
                          {remaining !== null && (
                            <Badge
                              variant="outline"
                              className={urgent
                                ? 'w-fit border-destructive/30 bg-destructive/5 text-destructive'
                                : 'w-fit'}
                            >
                              {remaining === 0 ? 'Last day' : `${remaining} day${remaining === 1 ? '' : 's'} left`}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {workspace.deletion_reason || '—'}
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restore.isPending}
                          onClick={() => setConfirming(workspace)}
                        >
                          <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />Bring back
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog
        open={Boolean(confirming)}
        onOpenChange={(open) => { if (!open && !restore.isPending) setConfirming(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bring back {confirming?.name}?</DialogTitle>
            <DialogDescription>
              The workspace opens again and its owner can sign in. Its subscription and its
              sending accounts were closed when it was, so those have to be set up again —
              restoring the data does not restore those.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={restore.isPending}>
              Cancel
            </Button>
            <Button
              disabled={restore.isPending}
              onClick={() => confirming && restore.mutate(confirming)}
            >
              {restore.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Bring it back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
