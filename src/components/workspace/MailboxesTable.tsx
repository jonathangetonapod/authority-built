import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Link2, Loader2, RefreshCw, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { WorkspaceClient } from '@/services/clients'
import {
  setWorkspaceMailboxClient,
  type WorkspaceMailboxAccount,
  type WorkspaceMailboxesResponse,
} from '@/services/workspaceCampaigns'

/**
 * Every sending mailbox, worst first, and who it sends for.
 *
 * The list used to render in whatever order the provider returned, which put a
 * mailbox with a hard sending error somewhere below the fold among healthy
 * ones, with its actual SMTP failure hidden in a hover title. What an operator
 * comes here to find is the broken one and whose outreach it just stopped.
 */

const MAILBOX_PAGE_SIZE = 25

type StatusFilter = 'all' | 'problem' | 'active' | 'unassigned'

function mailboxStatus(status: number): { label: string; className: string } | null {
  if (status === 1) return null
  if (status === 2) return { label: 'Paused', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50' }
  if (status === 3) return { label: 'Maintenance', className: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50' }
  if (status === -1) return { label: 'Connection error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  if (status === -2) return { label: 'Soft bounce error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  if (status === -3) return { label: 'Sending error', className: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-50' }
  return { label: 'Account issue', className: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50' }
}

function mailboxLabel(account: WorkspaceMailboxAccount): string {
  if (account.tags?.[0]?.label) return account.tags[0].label
  const name = [account.first_name, account.last_name].filter(Boolean).join(' ').trim()
  return name || 'No account tag'
}

function healthDot(score: number | null): string {
  if (score === null) return 'bg-muted-foreground/40'
  if (score >= 95) return 'bg-emerald-500'
  if (score >= 80) return 'bg-amber-500'
  return 'bg-red-500'
}

/**
 * Problems first, then quiet mailboxes, then everything healthy. Within a
 * band, alphabetical, so a row does not move under the cursor between loads.
 */
function severity(account: WorkspaceMailboxAccount): number {
  if (account.status < 0) return 0
  if (account.status !== 1) return 1
  if ((account.health_score ?? 100) < 80) return 2
  if ((account.campaigns?.length ?? 0) === 0) return 3
  return 4
}

const SPARK_HEIGHT = 18

function Sparkline({ account }: { account: WorkspaceMailboxAccount }) {
  const history = account.send_history ?? []
  if (history.length < 2) return null
  const peak = Math.max(...history.map((day) => day.sent), 1)
  const total = history.reduce((sum, day) => sum + day.sent, 0)
  return (
    <span
      className="mt-2 flex h-[18px] items-end gap-[3px]"
      title={history.map((day) => `${day.date}: ${day.sent}`).join('\n')}
      aria-label={`${total} sent over the last ${history.length} days`}
      role="img"
    >
      {history.map((day) => (
        <span
          key={day.date}
          className={`w-1.5 rounded-sm ${day.sent > 0 ? 'bg-primary/60' : 'bg-muted'}`}
          style={{ height: `${Math.max((day.sent / peak) * SPARK_HEIGHT, 2)}px` }}
        />
      ))}
    </span>
  )
}

interface MailboxesTableProps {
  workspaceId: string
  data?: WorkspaceMailboxesResponse
  loading: boolean
  error: Error | null
  onRetry: () => void
  canManage: boolean
  clients: WorkspaceClient[]
  /**
   * Whether the client list actually loaded. Without these, a failed load
   * arrived as clients=[] and every row silently dropped its connect-to-client
   * picker — indistinguishable from a workspace with no clients. The two
   * sibling modules already surface this; Mailboxes was the odd one out.
   */
  clientsError: Error | null
  onRetryClients: () => void
}

export const MailboxesTable = ({
  workspaceId,
  data,
  loading,
  error,
  onRetry,
  canManage,
  clients,
  clientsError,
  onRetryClients,
}: MailboxesTableProps) => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [visibleCount, setVisibleCount] = useState(MAILBOX_PAGE_SIZE)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  const allAccounts = useMemo(() => data?.accounts || [], [data?.accounts])
  const connected = Boolean(data?.connected)
  const query = search.trim().toLowerCase()

  const assignMutation = useMutation({
    mutationFn: setWorkspaceMailboxClient,
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['tenant'] })
      await queryClient.invalidateQueries({ queryKey: ['platform'] })
      await queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] })
      toast.success(variables.assigned
        ? 'Mailbox connected. It sends that client’s outreach whenever their campaign is active.'
        : 'Mailbox removed from that client’s campaign.')
    },
    onError: (mutationError) => toast.error(
      mutationError instanceof Error ? mutationError.message : 'The mailbox assignment could not be saved.',
    ),
    // Cleared only for the row that settled: two rows can have writes in
    // flight, and a global clear let row A's finish switch off row B's spinner
    // while B was still saving.
    onSettled: (_result, _mutationError, variables) => {
      setPendingEmail((current) => (current === variables.email ? null : current))
    },
  })

  const accounts = useMemo(() => {
    const filtered = allAccounts.filter((account) => {
      if (statusFilter === 'problem' && account.status >= 0) return false
      if (statusFilter === 'active' && account.status !== 1) return false
      if (statusFilter === 'unassigned' && (account.campaigns?.length ?? 0) > 0) return false
      if (!query) return true
      return account.email.toLowerCase().includes(query)
        || mailboxLabel(account).toLowerCase().includes(query)
        || (account.campaigns || []).some((link) => (link.client_name || '').toLowerCase().includes(query))
    })
    return [...filtered].sort((left, right) => (
      severity(left) - severity(right) || left.email.localeCompare(right.email)
    ))
  }, [allAccounts, query, statusFilter])

  const visibleAccounts = accounts.slice(0, visibleCount)
  const problemCount = allAccounts.filter((account) => account.status < 0).length
  const unassignedCount = allAccounts.filter((account) => (account.campaigns?.length ?? 0) === 0).length
  const capacity = allAccounts.reduce((total, account) => (
    account.status === 1 ? total + (account.daily_limit ?? 0) : total
  ), 0)
  const sentToday = allAccounts.reduce((total, account) => total + (account.sent_today ?? 0), 0)

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:px-5">
        <div>
          <CardTitle className="text-lg">Sending accounts</CardTitle>
          <CardDescription className="mt-1">
            {data?.provider_workspace_name
              ? `Live from ${data.provider_workspace_name}.`
              : 'Daily sends, warmup activity, and health for every mailbox.'}
            {/* Parse-checked: an unparseable timestamp rendered "Synced Invalid
                Date." — better to say nothing than that. */}
            {data?.last_synced_at && Number.isFinite(Date.parse(data.last_synced_at)) && (
              <span className="ml-1">
                Synced {new Date(data.last_synced_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
              </span>
            )}
          </CardDescription>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
          {connected && (
            <>
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setVisibleCount(MAILBOX_PAGE_SIZE)
                }}
                placeholder="Search mailboxes…"
                aria-label="Search mailboxes"
                className="h-8 w-44 bg-background"
              />
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as StatusFilter)
                  setVisibleCount(MAILBOX_PAGE_SIZE)
                }}
              >
                <SelectTrigger aria-label="Filter mailboxes" className="h-8 w-40 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All mailboxes</SelectItem>
                  <SelectItem value="problem">Needs attention{problemCount ? ` (${problemCount})` : ''}</SelectItem>
                  <SelectItem value="active">Sending</SelectItem>
                  <SelectItem value="unassigned">No client{unassignedCount ? ` (${unassignedCount})` : ''}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={onRetry} disabled={loading}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
              </Button>
            </>
          )}
          <Badge variant="outline" className="w-fit bg-background text-muted-foreground">
            {loading
              ? 'Loading mailboxes'
              : error || !data
                ? 'Unavailable'
                : connected
                  ? query || statusFilter !== 'all'
                    ? `${accounts.length} of ${allAccounts.length}`
                    : `${allAccounts.length} mailboxes`
                  : 'Not connected'}
          </Badge>
        </div>
      </CardHeader>

      {connected && !loading && !error && allAccounts.length > 0 && (
        <div data-testid="mailbox-capacity" className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b bg-background px-5 py-3 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold tabular-nums text-foreground">{sentToday}</span> of{' '}
            <span className="font-semibold tabular-nums text-foreground">{capacity}</span> daily capacity used
            {data?.send_day_timezone ? ` (${data.send_day_timezone})` : ''}
          </span>
          {problemCount > 0 && (
            <span className="font-medium text-red-700">{problemCount} mailbox{problemCount === 1 ? '' : 'es'} cannot send</span>
          )}
          {unassignedCount > 0 && (
            <span>{unassignedCount} not connected to any client</span>
          )}
        </div>
      )}

      {/* Named rather than swallowed: without this a failed client load simply
          removed every connect-to-client picker, exactly as a clientless
          workspace would look. The table stays useful either way. */}
      {clientsError && !loading && !error ? (
        <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Clients could not be loaded, so mailboxes cannot be connected to one right now: {clientsError.message}{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={onRetryClients}>Try again</button>
          </span>
        </div>
      ) : null}

      {data?.analytics_errors?.length ? (
        <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs leading-5 text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Account details are current, but some analytics could not be refreshed:{' '}
            {data.analytics_errors.join(' ')} Sending and warmup figures below may be incomplete.
          </span>
        </div>
      ) : null}

      <CardContent className="p-0">
        <Table aria-label="Mailbox accounts" className="min-w-[900px]">
          <caption className="sr-only">Sending volume, warmup activity, health, and client assignment by mailbox.</caption>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[38%] px-5">Email</TableHead>
              <TableHead className="w-[16%]">Sent today</TableHead>
              <TableHead className="w-[14%]">Warmup emails</TableHead>
              <TableHead className="w-[12%]">Health score</TableHead>
              <TableHead className="w-[20%] pr-5">Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-52 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading mailboxes
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading && error && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-52 text-center">
                  <div className="mx-auto max-w-md">
                    <AlertCircle className="mx-auto h-6 w-6 text-amber-600" />
                    <h2 className="mt-3 font-semibold">Mailbox data unavailable</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {/* No data at all is not "disconnected" — it is a request that
                never ran or never answered, and claiming disconnection here
                fabricated a fact about workspaces that were connected fine.
                Only a payload that says connected: false may say it. */}
            {!loading && !error && !data && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-52 text-center">
                  <div className="mx-auto max-w-md">
                    <AlertCircle className="mx-auto h-6 w-6 text-amber-600" />
                    <h2 className="mt-3 font-semibold">Mailbox data unavailable</h2>
                    <p className="mt-1 text-sm text-muted-foreground">The mailboxes for this workspace could not be read.</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && data && !connected && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-52 text-center">
                  <h2 className="font-semibold">
                    {data?.reason ? 'Instantly declined the connected key' : 'Instantly is not connected'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {data?.reason === 'key_rejected'
                      ? 'Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.'
                      : data?.reason === 'scope_missing'
                        ? 'The saved API key cannot read accounts. Reconnect Instantly with a key that has all scopes enabled.'
                        : 'Connect this workspace to load its sending accounts.'}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && connected && accounts.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-52 text-center">
                  <h2 className="font-semibold">
                    {allAccounts.length === 0 ? 'No mailboxes found' : 'No mailboxes match this view'}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {allAccounts.length === 0
                      ? 'This Instantly workspace has no sending accounts.'
                      : 'Clear the search or filter to see the rest.'}
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && connected && visibleAccounts.map((account) => {
              const status = mailboxStatus(account.status)
              const sendingError = account.status < 0
              const sendProgress = account.daily_limit && account.sent_today !== null
                ? Math.min((account.sent_today / account.daily_limit) * 100, 100)
                : 0
              // Number check, not a null check: undefined slipped past `=== null`
              // into Math.round and a missing score rendered as NaN% with the
              // red dot, reading as a flagged mailbox instead of an unknown.
              const healthScore = typeof account.health_score === 'number' && Number.isFinite(account.health_score)
                ? Math.round(account.health_score)
                : null
              const links = account.campaigns || []
              const assignedClientIds = new Set(links.map((link) => link.client_id))
              const unassignedClients = clients.filter((client) => !assignedClientIds.has(client.id))
              const busy = pendingEmail === account.email && assignMutation.isPending
              return (
                <TableRow key={account.email} className={sendingError ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-muted/30'}>
                  <TableCell className="px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{account.email}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{mailboxLabel(account)}</span>
                        {/* This is the account-health screen, and a mailbox
                            with no signature sends outreach ending in no name —
                            the warning was plumbed to the row but only shown in
                            the smaller picker. Surface it here too. */}
                        {account.has_signature === false && (
                          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">No signature</span>
                        )}
                        {(account.tags?.length ?? 0) > 1 && <span className="text-[10px] text-muted-foreground">+{account.tags.length - 1}</span>}
                        {status && (
                          <Badge variant="outline" className={`px-2 py-0 text-[10px] font-semibold ${status.className}`}>
                            {status.label}
                          </Badge>
                        )}
                      </div>
                      {account.status_message && (
                        // Stated where it sits. This was a title attribute, so
                        // the one field that says what to fix was invisible
                        // without a mouse.
                        <p className="mt-1.5 text-xs leading-5 text-red-700">{account.status_message}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top">
                    <div className="w-24">
                      <p className="font-semibold tabular-nums">
                        {account.sent_today ?? '—'} of {account.daily_limit ?? '—'}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${sendProgress}%` }} />
                      </div>
                      <Sparkline account={account} />
                    </div>
                  </TableCell>
                  <TableCell className="py-4 align-top">
                    <span className={`font-semibold tabular-nums ${sendingError ? 'text-red-700' : 'text-foreground'}`}>
                      {account.warmup_emails ?? '—'}
                    </span>
                    {account.warmup_limit ? (
                      <span className="text-xs text-muted-foreground"> of {account.warmup_limit}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-4 align-top">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${healthDot(healthScore)}`} aria-hidden="true" />
                      <span className="font-semibold tabular-nums">{healthScore === null ? '—' : `${healthScore}%`}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 pr-5 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {links.map((link) => (
                        <Badge key={link.campaign_id} variant="outline" className="gap-1 bg-background font-normal">
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          {link.client_name || 'Unknown client'}
                          {canManage && (
                            <button
                              type="button"
                              aria-label={`Disconnect ${link.client_name || 'client'} from ${account.email}`}
                              disabled={assignMutation.isPending}
                              onClick={() => {
                                setPendingEmail(account.email)
                                assignMutation.mutate({
                                  workspaceId,
                                  clientId: link.client_id,
                                  email: account.email,
                                  assigned: false,
                                })
                              }}
                              className="ml-0.5 rounded-full text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                      {links.length === 0 && (
                        <span className="text-xs text-muted-foreground">Not connected</span>
                      )}
                      {canManage && unassignedClients.length > 0 && (
                        <Select
                          value=""
                          disabled={busy}
                          onValueChange={(clientId) => {
                            setPendingEmail(account.email)
                            assignMutation.mutate({ workspaceId, clientId, email: account.email, assigned: true })
                          }}
                        >
                          <SelectTrigger
                            aria-label={`Connect ${account.email} to a client`}
                            className="h-7 w-auto gap-1 border-dashed px-2 text-xs"
                          >
                            {busy
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <UserPlus className="h-3.5 w-3.5" />}
                          </SelectTrigger>
                          <SelectContent>
                            {unassignedClients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {!loading && !error && connected && accounts.length > visibleCount && (
          <div className="border-t px-5 py-3 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setVisibleCount((current) => current + 50)}
            >
              Show more ({accounts.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
