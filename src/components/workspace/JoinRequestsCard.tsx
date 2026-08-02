import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Inbox, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  listJoinRequests,
  setJoinRequestStatus,
  type AccessRequestStatus,
  type JoinRequest,
} from '@/services/accessRequests'

/** The words the landing page uses, so the queue reads the same as the form. */
const AUDIENCE_LABEL: Record<string, string> = {
  agency: 'Podcast agency',
  pr: 'PR / comms agency',
  freelancer: 'Freelancer',
  starting_out: 'Starting out',
  other: 'Other',
}

const STATUS_STYLE: Record<AccessRequestStatus, { label: string; className: string }> = {
  new: { label: 'Waiting', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  contacted: { label: 'Contacted', className: 'border-sky-200 bg-sky-50 text-sky-900' },
  invited: { label: 'Invited', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  declined: { label: 'Declined', className: 'border-muted bg-muted/40 text-muted-foreground' },
}

/** What each status can become. 'new' is always available, to undo a misclick. */
const NEXT: Record<AccessRequestStatus, AccessRequestStatus[]> = {
  new: ['contacted', 'invited', 'declined'],
  contacted: ['invited', 'declined', 'new'],
  invited: ['declined', 'new'],
  declined: ['new'],
}

const ACTION_LABEL: Record<AccessRequestStatus, string> = {
  new: 'Move back to waiting',
  contacted: 'Mark contacted',
  invited: 'Mark invited',
  declined: 'Decline',
}

function waitedFor(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

/**
 * The queue of people asking to join.
 *
 * The landing page has always been able to take a request; until now nothing
 * showed one to a human. They arrived in Postgres and the only signal was an
 * email, which is a bad place for a queue — nothing to sort, nothing to mark
 * handled, and no way to tell what is still waiting.
 *
 * Whoever has waited longest is the one at risk of being forgotten, so the
 * waiting ones come first and carry how long it has been.
 */
export function JoinRequestsCard() {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const requestsQuery = useQuery({
    queryKey: ['join-requests'],
    queryFn: listJoinRequests,
  })

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccessRequestStatus }) =>
      setJoinRequestStatus(id, status),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['join-requests'] })
      // The bubble in the app shell counts what is still waiting; clearing a
      // request should clear it now, not at the next two-minute poll.
      await queryClient.invalidateQueries({ queryKey: ['join-requests-waiting'] })
      toast.success(`Marked ${STATUS_STYLE[variables.status].label.toLowerCase()}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'That request could not be updated.'),
  })

  const requests = requestsQuery.data ?? []
  // Waiting first, then longest-waiting within each group.
  const ordered = [...requests].sort((a, b) => {
    if ((a.status === 'new') !== (b.status === 'new')) return a.status === 'new' ? -1 : 1
    return a.created_at.localeCompare(b.created_at) * (a.status === 'new' ? 1 : -1)
  })
  const waiting = requests.filter((request) => request.status === 'new').length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          Requests to join
          {waiting > 0 && (
            <Badge className="border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-100">
              {waiting} waiting
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          People who asked to join from the landing page. Nothing here has an account — issue an
          invitation from Owner accounts above once you have decided.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requestsQuery.isLoading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading requests…
          </p>
        ) : requestsQuery.isError ? (
          <p className="py-6 text-sm text-destructive" role="alert">
            {requestsQuery.error instanceof Error ? requestsQuery.error.message : 'Requests could not be loaded.'}
          </p>
        ) : ordered.length === 0 ? (
          // An empty queue is the normal state, not a fault.
          <p className="py-6 text-sm text-muted-foreground">
            No one has asked to join yet. Requests from the landing page arrive here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Who</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Clients</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Move to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    expanded={expanded === request.id}
                    busy={move.isPending && move.variables?.id === request.id}
                    onToggle={() => setExpanded((current) => (current === request.id ? null : request.id))}
                    onMove={(status) => move.mutate({ id: request.id, status })}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface RequestRowProps {
  request: JoinRequest
  expanded: boolean
  busy: boolean
  onToggle: () => void
  onMove: (status: AccessRequestStatus) => void
}

const RequestRow = ({ request, expanded, busy, onToggle, onMove }: RequestRowProps) => {
  const website = safeExternalUrl(request.website || '')
  const status = STATUS_STYLE[request.status]

  return (
    <>
      <TableRow>
        <TableCell className="align-top">
          <button type="button" className="text-left font-medium hover:underline" onClick={onToggle}>
            {request.full_name}
          </button>
          <p className="text-xs text-muted-foreground">{request.email}</p>
          {request.company && <p className="text-xs text-muted-foreground">{request.company}</p>}
        </TableCell>
        <TableCell className="align-top text-sm">
          {AUDIENCE_LABEL[request.audience] ?? request.audience}
        </TableCell>
        <TableCell className="align-top text-sm">{request.clients_now || '—'}</TableCell>
        <TableCell className="align-top text-sm tabular-nums">
          {request.status === 'new' ? waitedFor(request.created_at) : '—'}
        </TableCell>
        <TableCell className="align-top">
          <Badge variant="outline" className={status.className}>{status.label}</Badge>
        </TableCell>
        <TableCell className="align-top text-right">
          <div className="flex flex-wrap justify-end gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {NEXT[request.status].map((next) => (
              <Button
                key={next}
                type="button"
                size="sm"
                variant={next === 'invited' ? 'default' : 'outline'}
                disabled={busy}
                onClick={() => onMove(next)}
              >
                {ACTION_LABEL[next]}
              </Button>
            ))}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="space-y-2 py-1 text-sm">
              <p className="whitespace-pre-wrap">
                {request.notes || 'They did not say what they are using now.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={`mailto:${request.email}?subject=Get%20On%20A%20Pod`}>
                    <Mail className="mr-2 h-4 w-4" />Reply
                  </a>
                </Button>
                {website && (
                  <Button asChild size="sm" variant="outline">
                    <a href={website} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />Their site
                    </a>
                  </Button>
                )}
              </div>
              {request.handled_at && (
                <p className="text-xs text-muted-foreground">
                  Last moved {new Date(request.handled_at).toLocaleDateString(undefined, {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}.
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
