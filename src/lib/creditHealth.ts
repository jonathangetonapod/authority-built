/**
 * How close a workspace is to being stopped.
 *
 * A balance on its own does not say whether it is a problem: 40 credits is
 * comfortable on an allowance of 100 and nearly gone on an allowance of 500.
 * The ratio is what an operator is actually reading for, on the portfolio and
 * in the warning an agency sees, and it has to mean the same thing in both.
 */

export type CreditHealth = 'empty' | 'critical' | 'low' | 'ok'

export interface CreditHealthView {
  level: CreditHealth
  label: string
  className: string
}

const VIEW: Record<CreditHealth, CreditHealthView> = {
  empty: { level: 'empty', label: 'Out of credits', className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  critical: { level: 'critical', label: 'Nearly out', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
  low: { level: 'low', label: 'Running low', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  ok: { level: 'ok', label: 'Healthy', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
}

/**
 * Thresholds are of a month's allowance, not of what the workspace happens to
 * hold — a workspace sitting on three months of credit is not "low" the moment
 * it drops below its own peak.
 */
export function creditHealth(balance: number, monthlyAllowance: number): CreditHealthView {
  if (balance <= 0) return VIEW.empty
  // Without an allowance there is nothing to be a fraction of, so the only
  // honest answer is whether there is anything left at all.
  if (monthlyAllowance <= 0) return VIEW.ok
  const share = balance / monthlyAllowance
  if (share <= 0.1) return VIEW.critical
  if (share <= 0.25) return VIEW.low
  return VIEW.ok
}

/** Worst first: the point of the list is what needs attention. */
export function creditHealthRank(level: CreditHealth): number {
  return { empty: 0, critical: 1, low: 2, ok: 3 }[level]
}

/**
 * Statuses that mean money is not arriving. Kept apart from credit health
 * because a workspace can be fully funded and still have a failed card.
 */
export function billingNeedsAttention(billingStatus: string): boolean {
  return ['past_due', 'paused', 'canceled', 'cancelled', 'unpaid', 'incomplete'].includes(billingStatus)
}
