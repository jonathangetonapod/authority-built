import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Download, Flame, Globe, Loader2, Plus, Search, X } from 'lucide-react'
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
}

export const MailboxInfraCard = ({ workspaceId }: MailboxInfraCardProps) => {
  const queryClient = useQueryClient()
  const overviewKey = ['mailbox-infra', workspaceId]
  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => getMailboxInfraOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
  const domains = overviewQuery.data?.domains ?? []
  const orders = overviewQuery.data?.orders ?? []
  const processingOrder = orders.find((order) => order.status === 'processing') ?? null

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

  const [baseName, setBaseName] = useState('')
  const [senderName, setSenderName] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<MailboxDomainSearchResult[]>([])
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [ordering, setOrdering] = useState(false)
  const [exporting, setExporting] = useState(false)

  const runSearch = async () => {
    const candidates = domainCandidates(baseName)
    if (candidates.length === 0) {
      toast.error('Enter a brand or agency name first.')
      return
    }
    setSearching(true)
    setSelectedDomains(new Set())
    try {
      setSearchResults(await searchMailboxDomains(workspaceId, candidates))
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
      window.open(result.download_url, '_blank', 'noopener')
      toast.success(`Instantly import file ready${result.user_count ? ` — ${result.user_count} mailboxes` : ''}. Import it in Instantly, then connect the account here.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The Instantly export could not be generated.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5 text-primary" />Sending infrastructure</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            No mailboxes yet? Buy dedicated sending domains with warmed mailboxes here — provisioning, DNS, and warmup are handled for you. Warm for 2–3 weeks, then export to Instantly.
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
        {processingOrder && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-950">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Provisioning {processingOrder.domains.map((entry) => entry.domain).join(', ')} — registration, DNS, and mailboxes usually take a few minutes.
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

        <div className="rounded-xl border border-dashed p-4">
          <p className="text-sm font-semibold">Buy new sending domains</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Never use your main domain for cold outreach. {CREDITS_PER_DOMAIN} credits per domain + {CREDITS_PER_MAILBOX} credits per mailbox — each domain gets {mailboxesPerDomain} warmed mailboxes.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="infra-base" className="text-xs text-muted-foreground">Brand or agency name</Label>
              <div className="mt-1 flex gap-2">
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
                <Button type="button" variant="outline" onClick={() => void runSearch()} disabled={searching || !baseName.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label htmlFor="infra-sender" className="text-xs text-muted-foreground">Sender name on the mailboxes</Label>
              <Input
                id="infra-sender"
                className="mt-1"
                placeholder="e.g. Jamie Rivera"
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
              />
            </div>
          </div>

          {searchResults.length > 0 && (
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
          )}

          {selectedDomains.size > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                {selectedDomains.size} domain{selectedDomains.size === 1 ? '' : 's'} · {selectedDomains.size * mailboxesPerDomain} warmed mailboxes ·{' '}
                <span className="font-semibold">{orderCredits} credits</span>
              </p>
              <Button onClick={() => void placeOrder()} disabled={ordering}>
                {ordering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                Buy and start warming
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
