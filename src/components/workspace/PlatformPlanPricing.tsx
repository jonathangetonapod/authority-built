import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { listBillingPlans, updateBillingPlanPrice, type BillingPlan } from '@/services/workspaceStaff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * What each plan costs, for everyone. Platform-admin only.
 *
 * A Stripe Price cannot be edited, so saving creates a new one and points the
 * plan at it. Anyone already subscribed stays on the price they signed up at
 * until they move themselves, which is Stripe's behaviour and not something
 * this screen can or should paper over — so it says so.
 */
export function PlatformPlanPricing() {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const plansQuery = useQuery({
    queryKey: ['platform-billing-plans'],
    queryFn: listBillingPlans,
    retry: false,
    staleTime: 60_000,
  })

  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({})

  const saveMutation = useMutation({
    mutationFn: ({ planKey, cents, allowance }: { planKey: string; cents: number; allowance: number }) =>
      updateBillingPlanPrice(planKey, cents, allowance),
    onSuccess: (plans, variables) => {
      queryClient.setQueryData(['platform-billing-plans'], plans)
      setDrafts((current) => {
        const next = { ...current }
        delete next[variables.planKey]
        return next
      })
      setAllowanceDrafts((current) => {
        const next = { ...current }
        delete next[variables.planKey]
        return next
      })
      toast.success('Plan updated. Workspaces take it on when their subscription next moves.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The price could not be updated.')
    },
  })

  const dollarsFor = (plan: BillingPlan) =>
    drafts[plan.plan_key] ?? (plan.base_price_cents / 100).toFixed(2)

  const allowanceFor = (plan: BillingPlan) =>
    allowanceDrafts[plan.plan_key] ?? String(plan.monthly_credit_allowance ?? 0)

  const creditsFrom = (value: string): number | null => {
    if (!/^\d+$/u.test(value.trim())) return null
    const credits = Number(value)
    return Number.isSafeInteger(credits) && credits >= 0 && credits <= 1_000_000 ? credits : null
  }

  const centsFrom = (value: string): number | null => {
    if (!/^\d+(\.\d{1,2})?$/u.test(value.trim())) return null
    const cents = Math.round(Number(value) * 100)
    return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1_000_000 ? cents : null
  }

  return (
    <section className="space-y-4" aria-labelledby="platform-plan-pricing-title">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg" id="platform-plan-pricing-title">Plan pricing</CardTitle>
          <CardDescription>
            What each plan costs, for every workspace. Saving creates a new Stripe price and points
            the plan at it — anyone already subscribed stays on the price they signed up at.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plansQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading plans…
            </p>
          ) : plansQuery.isError ? (
            <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm" role="alert">
              <p className="text-muted-foreground">The plans could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void plansQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            (plansQuery.data ?? []).map((plan) => {
              const draft = dollarsFor(plan)
              const cents = centsFrom(draft)
              const allowanceDraft = allowanceFor(plan)
              const credits = creditsFrom(allowanceDraft)
              // A plan that has never been priced has to be savable at the
              // amount it already shows. Comparing only the number disabled the
              // button in the one state where pressing it is the whole point:
              // the seeded amount is right, but no Stripe Price exists for it.
              const changed = cents !== null && credits !== null
                && (cents !== plan.base_price_cents
                  || credits !== plan.monthly_credit_allowance
                  || !plan.stripe_price_id)
              const saving = saveMutation.isPending && saveMutation.variables?.planKey === plan.plan_key
              return (
                <div key={plan.plan_key} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{plan.display_name}</p>
                      {!plan.is_purchasable && <Badge variant="secondary">Assigned, not sold</Badge>}
                      {plan.is_purchasable && !plan.stripe_price_id && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                          No Stripe price yet
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {plan.stripe_price_id
                        ? <><Tag className="mr-1 inline h-3 w-3" />{plan.stripe_price_id}</>
                        : 'Set a price to create one in Stripe.'}
                    </p>
                  </div>

                  {plan.is_purchasable && (
                    <div className="flex items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`plan-price-${plan.plan_key}`} className="text-xs">Per month (USD)</Label>
                        <Input
                          id={`plan-price-${plan.plan_key}`}
                          inputMode="decimal"
                          className="w-32"
                          value={draft}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [plan.plan_key]: event.target.value,
                          }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`plan-credits-${plan.plan_key}`} className="text-xs">Credits/month</Label>
                        <Input
                          id={`plan-credits-${plan.plan_key}`}
                          inputMode="numeric"
                          className="w-28"
                          value={allowanceDraft}
                          onChange={(event) => setAllowanceDrafts((current) => ({
                            ...current,
                            [plan.plan_key]: event.target.value,
                          }))}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!changed || saving}
                        onClick={() => cents !== null && credits !== null
                          && saveMutation.mutate({ planKey: plan.plan_key, cents, allowance: credits })}
                      >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </section>
  )
}
