import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Coins } from 'lucide-react'

import { creditHealth } from '@/lib/creditHealth'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface CreditBalanceChipProps {
  workspaceId: string
  /**
   * Who may read the number. A manager of this workspace, and a platform admin
   * looking at a tenant — the backend allows owner, admin and platform_admin on
   * billing-overview, and this is the client half of that same rule.
   *
   * Reading and acting were one flag while only managers ever saw the chip. A
   * platform admin supporting an agency needs the number without inheriting the
   * agency's billing screen, so the two are now separate: this decides whether
   * the request happens, billingHref decides where it leads.
   */
  canViewBalance: boolean
  /** Where the number leads — a platform admin acts from the platform screen. */
  billingHref: string
}

/**
 * The balance, where it can be seen without going to look for it.
 *
 * It lived on the billing page alone, so the number that decides whether the
 * next research run happens was two navigations away from the work that spends
 * it. An owner had to already suspect a problem to find out they had one.
 *
 * Shares the billing query with the low-balance warning, so putting it in the
 * header costs no extra request.
 */
export function CreditBalanceChip({ workspaceId, canViewBalance, billingHref }: CreditBalanceChipProps) {
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId) && canViewBalance,
    retry: false,
    staleTime: 120_000,
  })

  const overview = overviewQuery.data
  // Nothing is being charged, so a balance would be a number about nothing.
  if (!overview || overview.enforcement_enabled === false) return null

  const health = creditHealth(overview.balance, overview.monthly_credit_allowance ?? 0)
  const tone = health.level === 'ok'
    ? 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
    : health.className

  return (
    <Link
      to={billingHref}
      aria-label={`${overview.balance.toLocaleString()} credits remaining — open billing`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${tone}`}
    >
      <Coins className="h-3.5 w-3.5" />
      <span>{overview.balance.toLocaleString()}</span>
      {/* The word only appears where there is room for it; the coin and the
          number carry it on a phone. */}
      <span className="hidden sm:inline">credits</span>
    </Link>
  )
}
