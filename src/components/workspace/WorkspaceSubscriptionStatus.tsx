import { useQuery } from '@tanstack/react-query'
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface WorkspaceSubscriptionStatusProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * What this workspace is subscribed to, read from the platform side.
 *
 * The overview already carried the plan, the status and the renewal date; the
 * admin page showed none of it, so the only way to know whether an agency was
 * paying, trialling or cancelled was to open Stripe and search for them.
 */
const STATUS_VIEW: Record<string, { label: string; className: string; note: string }> = {
  active: {
    label: 'Active',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    note: 'Paying, and renewing on schedule.',
  },
  trialing: {
    label: 'Trialing',
    className: 'border-sky-200 bg-sky-50 text-sky-900',
    note: 'On trial — no subscription is being charged yet.',
  },
  comped: {
    label: 'Comped',
    className: 'border-violet-200 bg-violet-50 text-violet-900',
    note: 'Given the plan without charge. Still receives its monthly allowance.',
  },
  past_due: {
    label: 'Past due',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    note: 'A payment failed. Stripe will retry, then cancel if it keeps failing.',
  },
  paused: {
    label: 'Paused',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    note: 'Collection is paused at Stripe. No allowance is granted while paused.',
  },
  canceled: {
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/5 text-destructive',
    note: 'No longer subscribed. The monthly allowance has stopped.',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/5 text-destructive',
    note: 'No longer subscribed. The monthly allowance has stopped.',
  },
}

const money = (cents: number | undefined) =>
  typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : '—'

const day = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

export function WorkspaceSubscriptionStatus({ workspaceId, workspaceName }: WorkspaceSubscriptionStatusProps) {
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const billing = overviewQuery.data
  const status = String(billing?.billing_status ?? 'trialing')
  const view = STATUS_VIEW[status] ?? {
    label: status,
    className: 'border-muted bg-muted/40 text-muted-foreground',
    note: 'Reported by Stripe. Nothing in the product knows this one by name.',
  }
  const renews = day(billing?.current_period_end)
  const customerId = billing?.stripe_customer_id ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5" />Subscription</CardTitle>
        <CardDescription>
          What {workspaceName || 'this workspace'} is on, and whether it is being charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overviewQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Reading the subscription…
          </p>
        ) : overviewQuery.error ? (
          <p className="text-sm text-destructive">
            {overviewQuery.error instanceof Error ? overviewQuery.error.message : 'The subscription could not be read.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={view.className}>{view.label}</Badge>
              {billing?.cancel_at_period_end && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                  Ends {renews || 'at period end'}
                </Badge>
              )}
              {billing?.has_subscription === false && (
                <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">
                  No Stripe subscription
                </Badge>
              )}
            </div>
            {/* A status word on its own tells an operator nothing about what
                happens next, which is the only reason they are looking. */}
            <p className="text-sm leading-6 text-muted-foreground">{view.note}</p>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Plan</dt>
                <dd className="mt-0.5 font-medium capitalize">{String(billing?.plan_key ?? '—').replace(/_/gu, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Base price</dt>
                <dd className="mt-0.5 font-medium">{money(billing?.base_price_cents)}/mo</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {billing?.cancel_at_period_end ? 'Access until' : 'Renews'}
                </dt>
                <dd className="mt-0.5 font-medium">{renews || '—'}</dd>
              </div>
            </dl>

            {customerId ? (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a
                  href={`https://dashboard.stripe.com/customers/${customerId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />Open in Stripe
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                No Stripe customer yet — one is created the first time this workspace subscribes or buys credits.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
