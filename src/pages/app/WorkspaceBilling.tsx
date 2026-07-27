import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, CreditCard, Loader2, Sparkles, Wallet } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getWorkspaceBillingOverview,
  createWorkspaceCreditCheckout,
} from '@/services/workspaceStaff'

const OPERATION_LABELS: Record<string, string> = {
  research_run: 'AI research runs',
  email_unlock_identify: 'Email unlock · identify',
  email_unlock_find: 'Email unlock · find',
  email_unlock_verify: 'Email unlock · verify',
  dashboard_build: 'Prospect dashboard builds',
  query_generation: 'Search query generation',
  compatibility_scoring: 'Compatibility scoring',
  podscan_lookup: 'Podcast data lookups',
  semantic_search: 'Semantic catalog search',
  pitch_profile: 'AI pitch profiles',
  other: 'Other operations',
}

const PLAN_LABELS: Record<string, string> = {
  founding_member: 'Founding member',
  standard: 'Standard',
  comped: 'Complimentary',
}

function formatShortDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

const WorkspaceBilling = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, user, workspace } = useAuth()
  const workspaceId = workspace?.id || ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [checkoutPack, setCheckoutPack] = useState<string | null>(null)
  useEffect(() => {
    const outcome = searchParams.get('checkout')
    if (!outcome) return
    if (outcome === 'success') {
      toast.success('Payment received — your credits will appear within a minute.')
    } else if (outcome === 'cancelled') {
      toast.info('Checkout cancelled. No charge was made.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const buyPack = async (pack: 'starter' | 'growth' | 'scale') => {
    if (checkoutPack) return
    setCheckoutPack(pack)
    try {
      const url = await createWorkspaceCreditCheckout(workspaceId, pack)
      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The checkout could not be started.')
      setCheckoutPack(null)
    }
  }

  const overviewQuery = useQuery({
    queryKey: ['tenant', user?.id || 'unknown', workspaceId, 'billing-overview'],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId) && (canManageWorkspaceStaff || isPlatformAdmin),
    retry: false,
    staleTime: 30_000,
  })
  const overview = overviewQuery.data

  if (!canManageWorkspaceStaff && !isPlatformAdmin) return <Navigate to="/app/clients" replace />

  const usageEntries = Object.entries(overview?.usage_this_month ?? {})
    .sort((left, right) => right[1].total - left[1].total)
  const priceEntries = Object.entries(overview?.prices ?? {})
    .filter(([type]) => type !== 'other')
    .sort((left, right) => (OPERATION_LABELS[left[0]] || left[0]).localeCompare(OPERATION_LABELS[right[0]] || right[0]))

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
        <header className="space-y-5 border-b border-border/70 pb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit"><Link to="/app/settings"><ArrowLeft className="mr-2 h-4 w-4" />Back to settings</Link></Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary"><CreditCard className="mr-1.5 h-3.5 w-3.5" />Settings</Badge><Badge className="border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100">Available on Solo</Badge></div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing & credits</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">Manage Waterfall email credits without changing your workspace plan.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1.5">One-time top-ups</Badge>
          </div>
        </header>

        {overviewQuery.isLoading ? (
          <Card><CardContent className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your credit balance…</CardContent></Card>
        ) : overview ? (
          <section aria-labelledby="credit-balance-title" className="space-y-4">
            <h2 id="credit-balance-title" className="sr-only">Credit balance</h2>
            {!overview.enforcement_enabled && (
              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" role="status">
                Usage is being recorded, but credits are not being charged yet. Your balance will only
                start moving once credit billing is switched on.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />Current balance</CardDescription><CardTitle className="text-3xl">{overview.balance.toLocaleString()}</CardTitle></CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  {overview.expiring_credits > 0
                    ? `${overview.expiring_credits.toLocaleString()} expire ${formatShortDate(overview.next_expiry_at)}`
                    : 'No expiring credits'}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>Monthly allowance</CardDescription><CardTitle className="text-3xl">{overview.monthly_credit_allowance.toLocaleString()}</CardTitle></CardHeader>
                <CardContent className="text-xs text-muted-foreground">Included credits, granted automatically each month</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>Plan</CardDescription><CardTitle className="text-2xl">{PLAN_LABELS[overview.plan_key] || overview.plan_key}</CardTitle></CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  ${(overview.base_price_cents / 100).toFixed(0)}/mo base · ${(overview.per_client_price_cents / 100).toFixed(0)}/mo per additional active client
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Buy credits</CardTitle>
                <CardDescription>One-time packs. Purchased credits never expire and are used after your monthly allowance.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {([
                  // Mirrors CREDIT_PACKS in workspace-credit-checkout. These
                  // are the prices actually charged; showing anything else is
                  // how the page ended up advertising two different rates.
                  { key: 'starter' as const, credits: 100, price: 29, note: 'Top-up' },
                  { key: 'growth' as const, credits: 300, price: 69, note: 'Most popular' },
                  { key: 'scale' as const, credits: 800, price: 149, note: 'Best value' },
                ]).map((pack) => (
                  <div key={pack.key} className="flex flex-col rounded-xl border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{pack.note}</p>
                    <p className="mt-2 text-2xl font-bold">{pack.credits} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
                    <p className="mt-1 text-sm text-muted-foreground">${pack.price} · ${(pack.price / pack.credits).toFixed(2)}/credit</p>
                    <Button
                      type="button"
                      className="mt-4"
                      variant={pack.key === 'growth' ? 'default' : 'outline'}
                      disabled={checkoutPack !== null}
                      onClick={() => void buyPack(pack.key)}
                    >
                      {checkoutPack === pack.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {checkoutPack === pack.key ? 'Opening checkout…' : `Buy for $${pack.price}`}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-lg">Usage this month</CardTitle><CardDescription>Operations recorded across your workspace. Runs on your own API keys are free.</CardDescription></CardHeader>
                <CardContent>
                  {usageEntries.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No metered operations yet this month.</p>
                  ) : (
                    <ul className="divide-y">
                      {usageEntries.map(([type, counts]) => (
                        <li key={type} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span>{OPERATION_LABELS[type] || type}</span>
                          <span className="text-muted-foreground">
                            {counts.total.toLocaleString()}
                            {counts.byo > 0 && ` (${counts.byo.toLocaleString()} on your key)`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Credit prices</CardTitle><CardDescription>What each operation costs when it runs on platform keys.</CardDescription></CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {priceEntries.map(([type, cost]) => (
                      <li key={type} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span>{OPERATION_LABELS[type] || type}</span>
                        <span className="font-medium">{cost === 0 ? 'Free' : `${cost} ${cost === 1 ? 'credit' : 'credits'}`}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {overview.recent_activity.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-lg">Recent credit activity</CardTitle><CardDescription>Grants and charges on your credit balance.</CardDescription></CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {overview.recent_activity.slice(0, 10).map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span>
                          {entry.entry_type === 'grant'
                            ? 'Credits added'
                            : entry.operation_type
                              ? OPERATION_LABELS[entry.operation_type] || entry.operation_type
                              : entry.entry_type}
                          <span className="ml-2 text-xs text-muted-foreground">{formatShortDate(entry.created_at)}</span>
                        </span>
                        <span className={entry.amount > 0 ? 'font-medium text-emerald-700' : 'font-medium'}>
                          {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </section>
        ) : null}

        <ol aria-label="Credit purchase steps" className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3">
          <li className="flex items-center gap-3 border-b bg-violet-50/60 px-4 py-3.5 sm:border-b-0 sm:border-r">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-semibold text-white">1</span>
            <span><span className="block text-sm font-semibold">Select credits</span><span className="block text-xs text-muted-foreground">Choose the right pack</span></span>
          </li>
          <li className="flex items-center gap-3 border-b px-4 py-3.5 sm:border-b-0 sm:border-r">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">2</span>
            <span><span className="block text-sm font-semibold">Review checkout</span><span className="block text-xs text-muted-foreground">Confirm payment details</span></span>
          </li>
          <li className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">3</span>
            <span><span className="block text-sm font-semibold">Credits added</span><span className="block text-xs text-muted-foreground">Return to your pitch</span></span>
          </li>
        </ol>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceBilling
