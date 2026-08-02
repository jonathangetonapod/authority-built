import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Wallet } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { billingNeedsAttention, creditHealth, creditHealthRank } from '@/lib/creditHealth'
import { getBillingPortfolio, type BillingPortfolioRow } from '@/services/workspaceStaff'

interface BillingPortfolioProps {
  /** The signed-in admin's own workspace, which authorizes the read. */
  workspaceId: string
  selectedWorkspaceId: string
  onSelect: (workspaceId: string) => void
}

/**
 * Every workspace's money on one screen.
 *
 * The per-workspace cards answer "how is this agency doing". Nothing answered
 * "which agency needs me" — so the questions an owner actually has, who is
 * nearly out and whose card has failed, meant opening each workspace in turn.
 * Nobody does that, which means nobody asked, which means the first anyone
 * heard of an empty balance was the agency complaining.
 */
export function BillingPortfolio({ workspaceId, selectedWorkspaceId, onSelect }: BillingPortfolioProps) {
  const portfolioQuery = useQuery({
    queryKey: ['billing-portfolio', workspaceId],
    queryFn: () => getBillingPortfolio(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
    staleTime: 30_000,
  })

  const rows = useMemo(() => {
    const list = [...(portfolioQuery.data?.workspaces ?? [])]
    // Worst first. A list sorted by name makes an owner read all of it to find
    // the one row that needed them.
    return list.sort((left, right) => {
      const leftHealth = creditHealthRank(creditHealth(left.balance, left.monthly_credit_allowance).level)
      const rightHealth = creditHealthRank(creditHealth(right.balance, right.monthly_credit_allowance).level)
      if (leftHealth !== rightHealth) return leftHealth - rightHealth
      const leftBilling = billingNeedsAttention(left.billing_status) ? 0 : 1
      const rightBilling = billingNeedsAttention(right.billing_status) ? 0 : 1
      if (leftBilling !== rightBilling) return leftBilling - rightBilling
      return left.name.localeCompare(right.name)
    })
  }, [portfolioQuery.data])

  const totals = useMemo(() => ({
    balance: rows.reduce((sum, row) => sum + row.balance, 0),
    spent: rows.reduce((sum, row) => sum + row.credits_spent_this_month, 0),
    attention: rows.filter((row) => (
      creditHealth(row.balance, row.monthly_credit_allowance).level !== 'ok'
      || billingNeedsAttention(row.billing_status)
    )).length,
  }), [rows])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Wallet className="h-5 w-5" />All workspaces</CardTitle>
        <CardDescription>
          Credit health and billing status across the platform, worst first. Pick a row to work on that workspace below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {portfolioQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Reading every workspace…
          </p>
        ) : portfolioQuery.error ? (
          <p className="text-sm text-destructive">
            {portfolioQuery.error instanceof Error ? portfolioQuery.error.message : 'The portfolio could not be loaded.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active workspaces yet.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Credits outstanding</p>
                <p className="mt-0.5 text-xl font-semibold">{totals.balance.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Spent this month</p>
                <p className="mt-0.5 text-xl font-semibold">{totals.spent.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Need attention</p>
                <p className="mt-0.5 text-xl font-semibold">{totals.attention}</p>
              </div>
            </div>

            {/* A table that scrolls itself rather than one that widens the
                page: the row count grows with the business. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Workspace</th>
                    <th className="py-2 pr-3 font-medium">Credits</th>
                    <th className="py-2 pr-3 font-medium">Allowance</th>
                    <th className="py-2 pr-3 font-medium">Spent this month</th>
                    <th className="py-2 pr-3 font-medium">Billing</th>
                    <th className="py-2 font-medium sr-only">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: BillingPortfolioRow) => {
                    const health = creditHealth(row.balance, row.monthly_credit_allowance)
                    const billingFlag = billingNeedsAttention(row.billing_status)
                    const selected = row.workspace_id === selectedWorkspaceId
                    return (
                      <tr
                        key={row.workspace_id}
                        className={`border-b last:border-0 ${selected ? 'bg-primary/[0.04]' : ''}`}
                      >
                        <td className="py-2.5 pr-3 font-medium">{row.name}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <span>{row.balance.toLocaleString()}</span>
                            {health.level !== 'ok' && (
                              <Badge variant="outline" className={health.className}>{health.label}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{row.monthly_credit_allowance.toLocaleString()}/mo</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{row.credits_spent_this_month.toLocaleString()}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-1.5">
                            {billingFlag && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            <span className={billingFlag ? 'text-destructive' : 'text-muted-foreground'}>
                              {row.billing_status.replace(/_/gu, ' ')}
                            </span>
                            {row.cancel_at_period_end && (
                              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">Ending</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={selected ? 'secondary' : 'outline'}
                            onClick={() => onSelect(row.workspace_id)}
                          >
                            {selected ? 'Selected' : 'Manage'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!portfolioQuery.data?.enforcementEnabled && (
              // Every number above is a balance nothing is drawing from.
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                Credit enforcement is off, so nothing is being charged. These balances are being kept, not spent.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
