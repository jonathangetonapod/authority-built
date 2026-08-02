import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AutoRefillCard } from '@/components/workspace/AutoRefillCard'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getWorkspaceBillingOverview,
  createWorkspaceBillingPortal,
  createWorkspaceCreditCheckout,
  createWorkspaceSubscriptionCheckout,
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

// A workspace in past_due or suspended used to be told nothing at all: the
// status was fetched and never rendered, so the first sign of trouble was a
// feature refusing to run.
const BILLING_STATUS: Record<string, { label: string; className: string }> = {
  trialing: { label: 'Trial', className: 'border-sky-300 bg-sky-50 text-sky-900' },
  active: { label: 'Active', className: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  past_due: { label: 'Payment overdue', className: 'border-red-300 bg-red-50 text-red-900' },
  comped: { label: 'Complimentary', className: 'border-violet-300 bg-violet-50 text-violet-900' },
  suspended: { label: 'Suspended', className: 'border-red-300 bg-red-50 text-red-900' },
}

const CREDIT_PACKS = [
  { key: 'starter' as const, credits: 100, price: 29, note: 'Top-up' },
  { key: 'growth' as const, credits: 300, price: 69, note: 'Most popular' },
  { key: 'scale' as const, credits: 800, price: 149, note: 'Best value' },
]

function formatShortDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

// How long a purchased balance is given to arrive before the page stops
// claiming it is on its way. The webhook is normally seconds; a minute means
// something is wrong with it rather than slow.
const CREDIT_ARRIVAL_TIMEOUT_MS = 60_000

const WorkspaceBilling = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, user, workspace } = useAuth()
  const workspaceId = workspace?.id || ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [checkoutPack, setCheckoutPack] = useState<string | null>(null)
  const [openingPlan, setOpeningPlan] = useState(false)
  const [awaitingCredits, setAwaitingCredits] = useState(false)
  const [balanceBeforeCheckout, setBalanceBeforeCheckout] = useState<number | null>(null)

  useEffect(() => {
    const outcome = searchParams.get('checkout')
    const planOutcome = searchParams.get('plan')
    if (!outcome && !planOutcome) return
    if (outcome === 'success') {
      toast.success('Payment received — your credits will appear within a minute.')
      // Credits are granted by the Stripe webhook, not by the redirect. If the
      // webhook is not wired up the payment still succeeds and the balance
      // never moves, so this watches for it rather than leaving the operator
      // to notice on their own.
      setAwaitingCredits(true)
    } else if (outcome === 'cancelled') {
      toast.info('Checkout cancelled. No charge was made.')
    } else if (planOutcome === 'updated') {
      toast.success('Plan updated. It may take a moment to appear here.')
    } else if (planOutcome === 'cancelled') {
      toast.info('No plan change was made.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    next.delete('plan')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // A workspace with a subscription manages it in the portal. One without has
  // nothing there to change, so it goes to checkout to start a plan instead.
  const openPlanManagement = async (hasSubscription: boolean) => {
    if (openingPlan) return
    setOpeningPlan(true)
    try {
      const url = hasSubscription
        ? await createWorkspaceBillingPortal(workspaceId)
        : await createWorkspaceSubscriptionCheckout(workspaceId, 'founding_member')
      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Plan management could not be opened.')
      setOpeningPlan(false)
    }
  }

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
    refetchInterval: awaitingCredits ? 4_000 : false,
    staleTime: awaitingCredits ? 0 : 30_000,
  })
  const overview = overviewQuery.data

  const balance = overview?.balance ?? null
  useEffect(() => {
    if (!awaitingCredits || balance === null) return
    if (balanceBeforeCheckout === null) {
      setBalanceBeforeCheckout(balance)
      return
    }
    if (balance > balanceBeforeCheckout) {
      setAwaitingCredits(false)
      setBalanceBeforeCheckout(null)
      toast.success('Credits added to your balance.')
      return
    }
    const timer = window.setTimeout(() => setAwaitingCredits(false), CREDIT_ARRIVAL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [awaitingCredits, balance, balanceBeforeCheckout])

  if (!canManageWorkspaceStaff && !isPlatformAdmin) return <Navigate to="/app/clients" replace />

  const prices = overview?.prices ?? {}
  // Counts alone cannot be reconciled against a balance. Each operation is
  // priced, and runs on the workspace's own API keys are free, so what is
  // charged is the metered runs times the price of that operation.
  const usageRows = Object.entries(overview?.usage_this_month ?? {})
    .map(([type, counts]) => {
      const charged = Math.max(0, counts.total - counts.byo)
      const unitCost = prices[type] ?? 0
      return { type, total: counts.total, byo: counts.byo, charged, unitCost, credits: charged * unitCost }
    })
    .sort((left, right) => right.credits - left.credits || right.total - left.total)
  // The meter reports what the ledger took, not what the run counts imply. A
  // price that changed mid-month makes those two disagree, and only one of them
  // matches the balance above it.
  const estimatedSpend = usageRows.reduce((sum, row) => sum + row.credits, 0)
  const creditsSpent = overview?.credits_spent_this_month ?? estimatedSpend
  const allowance = overview?.monthly_credit_allowance ?? 0
  const spentPercent = allowance > 0 ? Math.min(100, Math.round((creditsSpent / allowance) * 100)) : 0
  const status = overview ? BILLING_STATUS[overview.billing_status] : undefined
  // Purchases are hidden until credits are actually being spent. Selling a pack
  // while the page says the balance will not move is asking for money for
  // something the product has just admitted it is not doing yet.
  const canBuyCredits = Boolean(overview?.enforcement_enabled)

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-12">
        <header className="space-y-5 border-b border-border/70 pb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
            <Link to="/app/settings"><ArrowLeft className="mr-2 h-4 w-4" />Back to settings</Link>
          </Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge variant="secondary"><CreditCard className="mr-1.5 h-3.5 w-3.5" />Settings</Badge>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; credits</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Your plan, and the credits your workspace spends on research, outreach and email lookups.
              </p>
            </div>
            {/* Pricing the product and crediting another agency are platform
                administration, not this workspace's billing. */}
            {isPlatformAdmin && (
              <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
                <Link to="/app/platform/billing">
                  <ShieldCheck className="mr-2 h-4 w-4" />Billing administration
                </Link>
              </Button>
            )}
          </div>
        </header>

        {overviewQuery.isLoading ? (
          <Card><CardContent className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your billing…</CardContent></Card>
        ) : !overview ? (
          <Card>
            <CardContent className="space-y-3 p-6 text-sm" role="alert">
              <p className="font-medium">Your billing could not be loaded.</p>
              <p className="text-muted-foreground">Nothing has been charged. This is a problem reading your account, not a problem with it.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 1. The plan, first: what you are on, and whether it is healthy. */}
            <section aria-labelledby="plan-title" className="space-y-3">
              <h2 id="plan-title" className="text-lg font-semibold">Plan</h2>
              <Card>
                <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-2xl font-semibold">{PLAN_LABELS[overview.plan_key] || overview.plan_key}</p>
                      {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${(overview.base_price_cents / 100).toFixed(0)}/month
                      {overview.per_client_price_cents > 0 && <> · ${(overview.per_client_price_cents / 100).toFixed(0)}/month per active client beyond the first {overview.included_active_clients ?? 1}</>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Includes {allowance.toLocaleString()} credits each month.
                    </p>
                    {/* Cancelled from the portal, but still running. The status
                        stays active through this window, so without saying so
                        the plan looks like one that is staying. */}
                    {overview.cancel_at_period_end && overview.billing_status !== 'suspended' && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                        This plan is set to end on {formatShortDate(overview.current_period_end ?? null)} and will not
                        renew. Reopen Manage plan to keep it.
                      </p>
                    )}
                    {overview.billing_status === 'past_due' && (
                      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                        A payment did not go through. Update your card to keep your workspace running.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      type="button"
                      disabled={openingPlan}
                      onClick={() => void openPlanManagement(Boolean(overview.has_subscription))}
                    >
                      {openingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {overview.has_subscription ? 'Manage plan' : 'Choose a plan'}
                    </Button>
                    {/* Invoices, receipts and card details are Stripe's pages.
                        The portal is where they live, so the link goes there
                        rather than rebuilding any of it here. */}
                    {overview.has_subscription && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={openingPlan}
                        onClick={() => void openPlanManagement(true)}
                      >
                        Invoices &amp; receipts<ExternalLink className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 2. Credits: what is left, and how fast it is going. */}
            <section aria-labelledby="credits-title" className="space-y-3">
              <h2 id="credits-title" className="text-lg font-semibold">Credits</h2>

              {!overview.enforcement_enabled && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" role="status">
                  Usage is being recorded, but credits are not being charged yet. Your balance will not
                  move, and there is nothing to buy until credit billing is switched on.
                </p>
              )}

              {awaitingCredits && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <span>
                    <span className="font-semibold">Waiting for your credits.</span> Stripe confirms the payment to us
                    separately from this page. If the balance has not moved in a minute, the payment went through
                    but the credits did not — contact support rather than paying again.
                  </span>
                </div>
              )}

              <Card>
                <CardContent className="space-y-5 p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Balance</p>
                      <p className="text-4xl font-semibold tracking-tight">{overview.balance.toLocaleString()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {overview.expiring_credits > 0
                          ? `${overview.expiring_credits.toLocaleString()} expire ${formatShortDate(overview.next_expiry_at)}`
                          : 'No expiring credits'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Used this month</p>
                      <p className="text-2xl font-semibold">
                        {creditsSpent.toLocaleString()}
                        <span className="text-base font-normal text-muted-foreground"> / {allowance.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>

                  {/* Consumption against the included allowance, rather than a
                      bare number nobody can place. */}
                  <div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={spentPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Monthly allowance used"
                    >
                      <div
                        className={`h-full rounded-full ${spentPercent >= 90 ? 'bg-red-500' : spentPercent >= 70 ? 'bg-amber-500' : 'bg-violet-600'}`}
                        style={{ width: `${spentPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {allowance === 0
                        ? 'This plan includes no monthly credits.'
                        : `${spentPercent}% of this month's included credits used.`}
                    </p>
                  </div>

                  {overview.enforcement_enabled && overview.balance === 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                      You have no credits left. Metered work will stop until your allowance renews or you top up.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Beside buying a pack by hand, because it is the same decision
                  made once instead of every time. */}
              {canBuyCredits && (
                <AutoRefillCard workspaceId={workspaceId} overview={overview} />
              )}

              {canBuyCredits && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Buy credits</CardTitle>
                    <CardDescription>One-time packs. Purchased credits never expire and are used after your monthly allowance.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    {CREDIT_PACKS.map((pack) => (
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
              )}
            </section>

            {/* 3. Usage, priced — so the number above can be checked. */}
            <section aria-labelledby="usage-title" className="space-y-3">
              <h2 id="usage-title" className="text-lg font-semibold">Usage this month</h2>
              <Card>
                <CardContent className="p-0">
                  {usageRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">No metered operations yet this month.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-5 py-2.5 text-left font-medium">Operation</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-medium">Runs</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-medium">Each</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-medium">Credits</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {usageRows.map((row) => (
                            <tr key={row.type}>
                              <td className="px-5 py-2.5">
                                {OPERATION_LABELS[row.type] || row.type}
                                {row.byo > 0 && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {row.byo.toLocaleString()} on your own key, free
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums">{row.total.toLocaleString()}</td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{row.unitCost.toLocaleString()}</td>
                              <td className="px-5 py-2.5 text-right font-medium tabular-nums">{row.credits.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t bg-muted/20">
                          <tr>
                            <td className="px-5 py-2.5 font-medium" colSpan={3}>Total at today&rsquo;s rates</td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{estimatedSpend.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 4. The ledger, with the balance each entry left behind. */}
            {overview.recent_activity.length > 0 && (
              <section aria-labelledby="activity-title" className="space-y-3">
                <h2 id="activity-title" className="text-lg font-semibold">Recent activity</h2>
                <Card>
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {overview.recent_activity.slice(0, 10).map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate">
                              {entry.entry_type === 'grant'
                                ? 'Credits added'
                                : entry.operation_type
                                  ? OPERATION_LABELS[entry.operation_type] || entry.operation_type
                                  : entry.entry_type}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatShortDate(entry.created_at)}</span>
                          </span>
                          <span className={`shrink-0 font-medium tabular-nums ${entry.amount > 0 ? 'text-emerald-700' : ''}`}>
                            {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceBilling
