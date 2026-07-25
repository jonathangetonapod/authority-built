import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CalendarCheck2,
  Inbox,
  Loader2,
  MailOpen,
  Megaphone,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waypoints,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  type ClientSdrProfile,
} from '@/lib/clientSdrProfile'
import {
  getWorkspaceClientSdrContext,
  type WorkspaceClient,
  type WorkspaceClientSdrContext,
} from '@/services/clients'

type InboxScope = 'all' | 'interested' | 'other'
type InboxFilter = 'all' | 'attention' | 'needs-reply' | 'review' | 'sent' | 'ai' | 'booked' | 'ended'

const inboxFilters: Array<{ value: InboxFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'Show every conversation in this reply scope' },
  { value: 'attention', label: 'Attention', title: 'Replies and issues that need immediate attention' },
  { value: 'needs-reply', label: 'Needs reply', title: 'The host sent the newest message' },
  { value: 'review', label: 'Review', title: 'A response draft is ready to review' },
  { value: 'sent', label: 'Replied', title: 'The workspace has replied' },
  { value: 'ai', label: 'AI handling', title: 'Conversations currently being handled by a client AI SDR' },
  { value: 'booked', label: 'Booked', title: 'Conversations with a confirmed podcast booking' },
  { value: 'ended', label: 'Ended', title: 'Conversations that are no longer active' },
]

const interestedWorkflowFilters: InboxFilter[] = ['attention', 'needs-reply', 'review', 'sent']

const aiRoutingSteps = [
  {
    title: 'Reply received',
    detail: 'Keep the Instantly thread and sender identity intact.',
    icon: MailOpen,
  },
  {
    title: 'Client resolved',
    detail: 'Campaign and podcast records identify the exact client.',
    icon: Waypoints,
  },
  {
    title: 'Client AI SDR loaded',
    detail: 'Use that client’s approved positioning, topics, proof, listener value, and booking details.',
    icon: Bot,
  },
  {
    title: 'Review or act',
    detail: 'Draft, reply, or help book according to the approved policy.',
    icon: CalendarCheck2,
  },
] as const

interface MasterInboxPreviewProps {
  workspaceId: string
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: Error | null
  baseHref: string
}

function ClientSdrContextPanel({
  context,
  loading,
  error,
  client,
  baseHref,
  onRetry,
}: {
  context?: WorkspaceClientSdrContext
  loading: boolean
  error: Error | null
  client: WorkspaceClient
  baseHref: string
  onRetry: () => void
}) {
  if (loading) {
    return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }
  if (error || !context) {
    return (
      <div className="mx-auto flex min-h-96 max-w-lg flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="h-8 w-8 text-amber-600" />
        <h2 className="mt-4 text-lg font-semibold">AI SDR context unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{error?.message || 'This client context could not be loaded.'}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-5 lg:p-7">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{context.client_name} AI SDR context</h2>
              <Badge
                variant="outline"
                className={context.safe_to_draft
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'}
              >
                {context.client_status !== 'active'
                  ? `${context.client_status[0].toUpperCase()}${context.client_status.slice(1)} — drafting off`
                  : context.safe_to_draft
                    ? 'Ready for review drafts'
                    : `${context.readiness.completed_fields} of ${context.readiness.total_fields}`}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              This is the exact client-scoped context Master Inbox will attach after a mapped reply resolves to {context.client_name}.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={`${baseHref}/clients/${encodeURIComponent(client.id)}?tab=ai-sdr`}><Bot className="mr-2 h-4 w-4" />Edit AI SDR Profile</Link>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.map((field) => {
          const value = context.ai_sdr_profile[field.id as keyof ClientSdrProfile]
          return (
            <div key={field.id} className={`rounded-xl border p-3.5 text-left ${value ? 'bg-muted/10' : 'border-dashed bg-background'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{field.shortLabel}</p>
                {field.core && <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Core</span>}
              </div>
              <p className={`mt-2 line-clamp-3 text-xs leading-5 ${value ? 'text-foreground/80' : 'italic text-muted-foreground'}`}>{value || 'Not set yet.'}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-left">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Delivery authority is off.</span>{' '}
          Loading this profile is read-only. Sending still requires a separate workspace-authorized action after a real conversation is connected.
        </p>
      </div>
    </div>
  )
}

const MasterInboxPreview = ({ workspaceId, clients, clientsLoading, clientsError, baseHref }: MasterInboxPreviewProps) => {
  const [scope, setScope] = useState<InboxScope>('all')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedClientId = searchParams.get('client') || ''
  const selectedClient = clients.find((client) => client.id === requestedClientId) || null
  const selectedClientId = selectedClient?.id || 'all-clients'
  const activeClients = clients.filter((client) => client.status === 'active')
  const readyClientCount = activeClients.filter((client) => client.ai_sdr_profile_ready).length
  const sdrContextQuery = useQuery({
    queryKey: ['workspace-client-sdr-context', workspaceId, selectedClient?.id || 'none'],
    queryFn: () => getWorkspaceClientSdrContext(workspaceId, selectedClient!.id),
    enabled: Boolean(workspaceId && selectedClient),
    retry: false,
  })

  const selectClient = (clientId: string) => {
    const next = new URLSearchParams(searchParams)
    if (clientId === 'all-clients') next.delete('client')
    else next.set('client', clientId)
    setSearchParams(next, { replace: true })
  }

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="border-b bg-background">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label="Inbox scope" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'all'}
                onClick={() => setScope('all')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                All replies <span className="ml-1 text-muted-foreground">0</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'interested'}
                onClick={() => setScope('interested')}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'interested' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Interested <span className="ml-1 text-muted-foreground">0</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'other'}
                onClick={() => {
                  setScope('other')
                  if (interestedWorkflowFilters.includes(filter)) setFilter('all')
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  scope === 'other' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Other replies <span className="ml-1 text-muted-foreground">0</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
                placeholder="Search conversations"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <Badge variant="outline" className="w-fit gap-2 text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {clientsLoading
              ? 'Loading client AI SDR profiles'
              : clientsError
                ? 'Client AI SDR profiles unavailable'
                : activeClients.length === 0
                  ? 'Add a client to create an AI SDR profile'
                  : `${readyClientCount} of ${activeClients.length} client AI SDR${activeClients.length === 1 ? '' : 's'} ready`}
          </Badge>
        </div>

        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto border-t bg-muted/10 px-3 py-2 lg:px-4" aria-label="Conversation filters">
          <Select value={selectedClientId} onValueChange={selectClient} disabled={clientsLoading || Boolean(clientsError)}>
            <SelectTrigger aria-label="Filter by client" className="h-7 w-36 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-clients">All clients</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  <span className="flex items-center gap-2">
                    <span>{client.name}</span>
                    <span className={client.ai_sdr_profile_ready ? 'text-emerald-700' : 'text-amber-700'}>
                      {client.ai_sdr_profile_ready ? 'Ready' : `${client.ai_sdr_profile_completed_fields || 0}/${client.ai_sdr_profile_total_fields || 6}`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select defaultValue="all-campaigns">
            <SelectTrigger aria-label="Filter by client campaign" className="h-7 w-40 shrink-0 gap-1.5 bg-background px-2.5 text-xs">
              <Megaphone className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-campaigns">All campaigns</SelectItem>
            </SelectContent>
          </Select>
          <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
          {scope === 'other' && (
            <span className="mr-1 shrink-0 self-center text-[11px] text-muted-foreground">
              Workflow stages apply to interested replies.
            </span>
          )}
          {inboxFilters
            .filter((item) => scope !== 'other' || !interestedWorkflowFilters.includes(item.value))
            .map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                title={item.title}
                onClick={() => setFilter(item.value)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === item.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label} <span className="ml-1 opacity-70">0</span>
              </button>
            ))}
        </div>
      </div>

      <div className="grid min-h-[620px] md:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className={cn('min-h-0 flex-col border-r bg-muted/10', selectedClient ? 'hidden md:flex' : 'flex')}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversations</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Client and campaign shown on every reply</p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">0</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-background text-muted-foreground">
              <Inbox className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{search.trim() ? 'No matching conversations' : 'No conversations yet'}</h3>
            <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
              {search.trim() ? 'Try another name, podcast, client, or campaign.' : 'Replies from mapped client campaigns will appear here automatically.'}
            </p>
          </div>
        </aside>

        <section className={cn('min-w-0 flex-col bg-background', selectedClient ? 'flex' : 'hidden md:flex')}>
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">{selectedClient ? 'Client AI SDR profile' : 'Conversation thread'}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedClient ? 'Preview the exact context available to mapped inbox replies.' : 'Open a reply to see its history and client AI SDR state.'}</p>
            </div>
            <Badge variant="outline" className="text-muted-foreground">{selectedClient?.name || 'No conversation selected'}</Badge>
          </div>

          <div className="flex flex-1 items-center justify-center">
            {selectedClient ? (
              <ClientSdrContextPanel
                context={sdrContextQuery.data}
                loading={sdrContextQuery.isLoading}
                error={sdrContextQuery.error instanceof Error ? sdrContextQuery.error : null}
                client={selectedClient}
                baseHref={baseHref}
                onRetry={() => void sdrContextQuery.refetch()}
              />
            ) : (
            <div className="w-full max-w-4xl p-5 text-center lg:p-8">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquare className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-lg font-semibold">Every reply reaches the right client AI SDR</h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                The Master Inbox resolves the outreach owner before any AI work begins, then loads only that client’s approved context and response policy.
              </p>

              <div role="list" aria-label="AI SDR reply routing" className="mt-7 grid gap-2 text-left sm:grid-cols-2 xl:grid-cols-4">
                {aiRoutingSteps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div key={step.title} role="listitem" className="relative min-w-0">
                      <div className="h-full rounded-xl border bg-muted/15 p-3.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-primary shadow-sm">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">0{index + 1}</span>
                        </div>
                        <p className="mt-3 text-xs font-semibold">{step.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                      </div>
                      {index < aiRoutingSteps.length - 1 && (
                        <div className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground xl:flex" aria-hidden="true">
                          <ArrowRight className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mx-auto mt-4 flex max-w-2xl items-start gap-2.5 rounded-xl border border-dashed bg-background px-4 py-3 text-left">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  <span className="font-semibold text-foreground">No client match, no AI response.</span>{' '}
                  Ambiguous replies stop for routing review instead of borrowing another client’s identity or context.
                </p>
              </div>
            </div>
            )}
          </div>

          <div className="border-t bg-muted/10 p-3">
            <div className="flex items-center justify-between rounded-lg border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground">
              <span>{selectedClient ? 'Choose All clients to return to inbox routing, or open this client to edit its approved context.' : 'AI draft, review, reply, and booking controls appear with a selected conversation.'}</span>
              <Send className="h-4 w-4" />
            </div>
          </div>
        </section>

      </div>
    </Card>
  )
}

export default MasterInboxPreview
