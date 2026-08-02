import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { creditHealth } from '@/lib/creditHealth'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface CreditBalanceWarningProps {
  workspaceId: string
  /** Only a manager can act on this, and only they can see the billing page. */
  canManageBilling: boolean
}

/**
 * Tell an agency they are running out before something refuses to run.
 *
 * The only signal was a progress bar on the billing page, which nobody opens
 * unless they are already thinking about money. So the first anyone learned of
 * an empty balance was a feature failing mid-action — clicking Write Pitch and
 * being told there were not enough credits *after* deciding to do the work.
 *
 * Silent while the balance is healthy. A banner that is always there is one
 * nobody reads on the day it matters.
 */
export function CreditBalanceWarning({ workspaceId, canManageBilling }: CreditBalanceWarningProps) {
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId) && canManageBilling,
    retry: false,
    staleTime: 120_000,
  })

  const overview = overviewQuery.data
  // Nothing is being charged, so there is nothing to warn about.
  if (!overview || overview.enforcement_enabled === false) return null

  const health = creditHealth(overview.balance, overview.monthly_credit_allowance ?? 0)
  if (health.level === 'ok') return null

  const empty = health.level === 'empty'
  return (
    <div
      role="status"
      className={`flex flex-col gap-2 border-b px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
        empty
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <p className="flex items-start gap-2 leading-5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {empty
            ? 'Your workspace is out of credits. Research, contact finding and dashboard builds will not run until it is topped up.'
            : `${overview.balance.toLocaleString()} credits left. Research, contact finding and dashboard builds stop when this reaches zero.`}
        </span>
      </p>
      <Button asChild size="sm" variant={empty ? 'default' : 'outline'} className="w-fit shrink-0">
        <Link to="/app/settings/billing">Top up</Link>
      </Button>
    </div>
  )
}
