import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Download, Flame, Globe, Loader2, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createMailboxOrder,
  exportMailboxesForInstantly,
  getMailboxInfraOverview,
  getMailboxOrderStatus,
  retryMailboxWarming,
  searchMailboxDomains,
  type MailboxDomainSearchResult,
  type MailboxOrderInput,
} from '@/services/mailboxInfra'

const DOMAIN_PREFIXES = ['get', 'try', 'use', 'hey', 'with']
const CREDITS_PER_DOMAIN = 20
const CREDITS_PER_MAILBOX = 5

function domainCandidates(base: string): string[] {
  const cleaned = base.toLowerCase().replace(/^https?:\/\//u, '').replace(/[^a-z0-9-]/gu, '')
  if (!cleaned) return []
  return [
    `${cleaned}.com`,
    ...DOMAIN_PREFIXES.map((prefix) => `${prefix}${cleaned}.com`),
    `${cleaned}hq.com`,
    `${cleaned}team.com`,
  ].slice(0, 8)
}

function usernameFromName(name: string): string {
  const parts = name.toLowerCase().replace(/[^a-z\s]/gu, '').trim().split(/\s+/u)
  return parts[0] || 'outreach'
}

interface MailboxInfraCardProps {
  workspaceId: string
  /** Buying domains is manager-only at the edge; the wizard follows it. */
  canManage: boolean
  /** Addresses already sending in Instantly, to reconcile the two lists. */
  instantlyAddresses?: string[]
}

export const MailboxInfraCard = ({ workspaceId, canManage, instantlyAddresses = [] }: MailboxInfraCardProps) => {
  const queryClient = useQueryClient()
  const overviewKey = ['mailbox-infra', workspaceId]
  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => getMailboxInfraOverview(workspaceId),
    enabled: Boolean(workspaceId) && canManage,
    retry: false,
    staleTime: 30_000,
  })
  const domains = overviewQuery.data?.domains ?? []
  const orders = overviewQuery.data?.orders ?? []
  // undefined while loading or on an older function build — only an explicit
  // false means "no Winnr account connected".
  const winnrConnected = overviewQuery.data?.winnr_connected
  const processingOrder = orders.find((order) => order.status === 'processing') ?? null
  const failedOrder = orders.find((order) => order.status === 'failed') ?? null
  // Provisioned but never warmed: the provider accepted the mailboxes and the
  // warmup call did not land. Three silent weeks unless it is said out loud.
  const warmingStalled = orders.find((order) => order.status === 'warming' && !order.warming_enabled_at) ?? null
  const liveInInstantly = new Set(instantlyAddresses.map((address) => address.trim().toLowerCase()))

  useQuery({
    queryKey: ['mailbox-infra-order', workspaceId, processingOrder?.id ?? 'none'],
    queryFn: async () => {
      if (!processingOrder) return null
      const result = await getMailboxOrderStatus(workspaceId, processingOrder.id)
      if (result.order.status !== 'processing') {
        void queryClient.invalidateQueries({ queryKey: overviewKey })
        if (result.order.status === 'warming') {
          toast.success('Your domains are live and every mailbox is now warming.')
        }
      }
      return result
    },
    enabled: Boolean(processingOrder),
    refetchInterval: 15_000,
    retry: false,
  })

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [baseName, setBaseName] = useState('')
  const [senderName, setSenderName] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<MailboxDomainSearchResult[]>([])
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [ordering, setOrdering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [retryingWarmup, setRetryingWarmup] = useState(false)

  const retryWarmup = async (orderId: string) => {
    if (retryingWarmup) return
    setRetryingWarmup(true)
    try {
      await retryMailboxWarming(workspaceId, orderId)
      void queryClient.invalidateQueries({ queryKey: overviewKey })
      toast.success('Warmup started. Give these mailboxes 2-3 weeks before they send anything real.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Warmup could not be started.')
    } finally {
      setRetryingWarmup(false)
    }
  }

  const runSearch = async () => {
    const candidates = domainCandidates(baseName)
    if (candidates.length === 0) {
      toast.error('Enter a brand or agency name first.')
      return
    }
    setSearching(true)
    setSelectedDomains(new Set())
    try {
      const results = await searchMailboxDomains(workspaceId, candidates)
      setSearchResults(results)
      if (results.some((result) => result.available)) {
        setStep(2)
      } else {
        toast.info('None of those variations are available — try a different name.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Domain availability could not be checked.')
    } finally {
      setSearching(false)
    }
  }

  const toggleDomain = (domain: string) => {
    setSelectedDomains((current) => {
      const next = new Set(current)
      if (next.has(domain)) next.delete(domain)
      else if (next.size < 3) next.add(domain)
      else toast.info('Three domains per order keeps deliverability healthy.')
      return next
    })
  }

  const mailboxesPerDomain = 2
  const orderCredits = selectedDomains.size * CREDITS_PER_DOMAIN
    + selectedDomains.size * mailboxesPerDomain * CREDITS_PER_MAILBOX

  const placeOrder = async () => {
    if (selectedDomains.size === 0 || ordering) return
    const sender = senderName.trim()
    if (!sender) {
      toast.error('Add the sender name that should appear on these mailboxes.')
      return
    }
    const username = usernameFromName(sender)
    const orderInputs: MailboxOrderInput[] = [...selectedDomains].map((domain) => ({
      domain,
      mailboxes: [
        { name: sender, username },
        { name: sender, username: `${username}.${domain.split('.')[0]}`.slice(0, 30) },
      ],
    }))
    setOrdering(true)
    try {
      await createMailboxOrder(workspaceId, orderInputs)
      setSearchResults([])
      setSelectedDomains(new Set())
      setBaseName('')
      setSenderName('')
      setStep(1)
      void queryClient.invalidateQueries({ queryKey: overviewKey })
      toast.success('Order placed. Domains and mailboxes are being provisioned — warming starts automatically.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The mailbox order could not be placed.')
    } finally {
      setOrdering(false)
    }
  }

  const runExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const result = await exportMailboxesForInstantly(workspaceId)
      // A window.open after an await is not a user gesture any more, so popup
      // blockers ate the file silently. An anchor click is still a download.
      const link = document.createElement('a')
      link.href = result.download_url
      link.rel = 'noopener'
      link.target = '_blank'
      link.download = 'instantly-mailboxes.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(`Instantly import file ready${result.user_count ? ` — ${result.user_count} mailboxes` : ''}. Import it in Instantly, then connect the account here.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The Instantly export could not be generated.')
    } finally {
      setExporting(false)
    }
  }

  if (!canManage) {
    // Buying is manager-only at the edge. Rendering the wizard to everyone
    // else offered a purchase flow that failed on its first request.
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5 text-primary" />Sending infrastructure</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            Sending domains and mailboxes are bought and warmed through Winnr. A workspace owner or admin manages them.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5 text-primary" />Sending infrastructure</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            Dedicated sending domains with warmed mailboxes, bought and provisioned through <span className="font-medium text-foreground">Winnr</span> — this section needs a connected Winnr account. Registration, DNS, and warmup are handled there. Warm for 2–3 weeks, then export to Instantly.
          </CardDescription>
        </div>
        {domains.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => void runExport()} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
            Export for Instantly
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {overviewQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading your sending infrastructure
          </div>
        )}

        {overviewQuery.error && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {overviewQuery.error instanceof Error
                ? overviewQuery.error.message
                : 'Your sending infrastructure could not be loaded.'}
            </span>
            <Button size="sm" variant="outline" className="border-amber-300 bg-background" onClick={() => void overviewQuery.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {failedOrder && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-900">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">
                  Order failed for {failedOrder.domains.map((entry) => entry.domain).join(', ')}.
                </span>{' '}
                {failedOrder.error_message || 'The provider could not complete provisioning.'} Any credits charged were returned.
              </span>
            </span>
          </div>
        )}

        {warmingStalled && (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <span className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Mailboxes are live but not warming.</span>{' '}
                {warmingStalled.error_message || 'Warmup could not be started at the provider.'} Sending from a mailbox that never warmed is how a domain gets burned.
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 bg-background"
              disabled={retryingWarmup}
              onClick={() => void retryWarmup(warmingStalled.id)}
            >
              {retryingWarmup ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Flame className="mr-2 h-3.5 w-3.5" />}
              Start warmup
            </Button>
          </div>
        )}

        {processingOrder && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Provisioning {processingOrder.domains.map((entry) => entry.domain).join(', ')} — registration, DNS, and mailboxes usually take a few minutes. This continues if you leave the page.
          </div>
        )}

        {domains.length > 0 && (
          <ul className="space-y-3">
            {domains.map((domain) => (
              <li key={domain.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{domain.name}</span>
                  <Badge variant="outline" className={domain.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'text-muted-foreground'}>
                    {domain.status === 'complete' ? 'Live' : domain.status}
                  </Badge>
                  {domain.dns_health && domain.dns_health !== 'healthy' && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">DNS {domain.dns_health}</Badge>
                  )}
                </div>
                {domain.mailboxes.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {domain.mailboxes.map((mailbox) => (
                      <li key={mailbox.full_address} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-mono text-xs">{mailbox.full_address}</span>
                        {/* Bought here, sending there — or not yet imported. */}
                        {liveInInstantly.has(mailbox.full_address.toLowerCase()) ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />In Instantly</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Not in Instantly</Badge>
                        )}
                        {mailbox.warming_status === 'active' && (
                          <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-800"><Flame className="mr-1 h-3 w-3" />Warming</Badge>
                        )}
                        {typeof mailbox.warming_health_score === 'number' && (
                          <span className="text-xs text-muted-foreground">health {Math.round(mailbox.warming_health_score)}</span>
                        )}
                        {typeof mailbox.warming_inbox_rate === 'number' && (
                          <span className="text-xs text-muted-foreground">inbox {Math.round(mailbox.warming_inbox_rate * 100)}%</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {winnrConnected === false ? (
          // Stated instead of the wizard, not above it. The wizard used to
          // render anyway and fail on its first request.
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              <AlertCircle className="h-4 w-4" />A Winnr account is required to buy sending domains
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
              Winnr is the provider that registers the domain, configures DNS, creates each mailbox, and runs
              warmup. Get On A Pod does not resell mailboxes — it drives your Winnr account. Connect a Winnr
              API key in workspace settings and this section becomes a buy-and-warm flow.
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              Already have mailboxes elsewhere? You do not need Winnr at all — connect Instantly instead, and
              they appear in Sending accounts above.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/app/settings">Connect Winnr</Link>
            </Button>
          </div>
        ) : (
        <div className="rounded-xl border border-dashed p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Buy new sending domains</p>
            <ol className="flex items-center gap-1" aria-label="Purchase steps">
              {(['Name', 'Domains', 'Mailboxes', 'Review'] as const).map((label, index) => {
                const stepNumber = (index + 1) as 1 | 2 | 3 | 4
                const state = stepNumber < step ? 'done' : stepNumber === step ? 'active' : 'todo'
                return (
                  <li key={label} className="flex items-center gap-1">
                    {index > 0 && <span className="h-px w-4 bg-border" aria-hidden="true" />}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        state === 'active'
                          ? 'bg-primary text-primary-foreground'
                          : state === 'done'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {state === 'done' ? <CheckCircle2 className="h-3 w-3" /> : <span className="tabular-nums">{stepNumber}</span>}
                      {label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          {step === 1 && (
            <div className="mt-4 max-w-md">
              <Label htmlFor="infra-base" className="text-sm">What is the client-facing brand or agency name?</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                We will check close variations — never your main domain, which stays protected from cold outreach.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  id="infra-base"
                  placeholder="e.g. bookedco"
                  value={baseName}
                  onChange={(event) => setBaseName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void runSearch()
                    }
                  }}
                />
                <Button type="button" onClick={() => void runSearch()} disabled={searching || !baseName.trim()}>
                  {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  {searching ? 'Checking…' : 'Check availability'}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-4">
              <p className="text-sm">Pick up to 3 available domains.</p>
              <p className="mt-1 text-xs text-muted-foreground">Two or three domains spread sending volume and protect deliverability.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {searchResults.map((result) => {
                  const selected = selectedDomains.has(result.domain)
                  return (
                    <button
                      key={result.domain}
                      type="button"
                      disabled={!result.available}
                      onClick={() => toggleDomain(result.domain)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        !result.available
                          ? 'cursor-not-allowed border-border text-muted-foreground/50 line-through'
                          : selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50'
                      }`}
                      aria-pressed={selected}
                    >
                      {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : result.available ? <Plus className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      {result.domain}
                      {result.available && typeof result.price_usd === 'number' && (
                        <span className="text-muted-foreground">${result.price_usd.toFixed(0)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>Back</Button>
                <Button type="button" size="sm" disabled={selectedDomains.size === 0} onClick={() => setStep(3)}>
                  Continue with {selectedDomains.size || 'no'} domain{selectedDomains.size === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-4 max-w-lg">
              <Label htmlFor="infra-sender" className="text-sm">Who is sending from these mailboxes?</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                The name recipients see in their inbox — usually the person running outreach.
              </p>
              <Input
                id="infra-sender"
                className="mt-3"
                placeholder="e.g. Jamie Rivera"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
              />
              {senderName.trim() && (
                <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Mailboxes that will be created and warmed:</p>
                  <ul className="mt-1.5 space-y-1">
                    {[...selectedDomains].flatMap((domain) => {
                      const username = usernameFromName(senderName)
                      return [
                        `${username}@${domain}`,
                        `${`${username}.${domain.split('.')[0]}`.slice(0, 30)}@${domain}`,
                      ]
                    }).map((address) => (
                      <li key={address} className="font-mono text-xs">{address}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>Back</Button>
                <Button type="button" size="sm" disabled={!senderName.trim()} onClick={() => setStep(4)}>Review order</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-4 max-w-lg">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-semibold">Order summary</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {[...selectedDomains].map((domain) => (
                    <li key={domain} className="flex items-center justify-between gap-2">
                      <span>{domain} · {mailboxesPerDomain} mailboxes</span>
                      <span className="text-muted-foreground">{CREDITS_PER_DOMAIN + mailboxesPerDomain * CREDITS_PER_MAILBOX} credits</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-semibold">
                  <span>Total</span>
                  <span>{orderCredits} credits</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Registration, DNS, mailbox creation, and warmup all start automatically. Warm 2–3 weeks before sending.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => setStep(3)}>Back</Button>
                <Button type="button" onClick={() => void placeOrder()} disabled={ordering}>
                  {ordering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                  {ordering ? 'Placing order…' : 'Buy and start warming'}
                </Button>
              </div>
            </div>
          )}
        </div>
        )}
      </CardContent>
    </Card>
  )
}
