import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MinusCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { adjustWorkspaceCredits, getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface WorkspaceCreditAdjustmentProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * Take credits back off a workspace.
 *
 * Every other control adds — a grant, a purchase, the monthly allowance — so a
 * grant of the wrong size could only be undone by editing the database. This
 * is the correction, and it is deliberately plainer than the grant beside it:
 * removing someone's credit should feel like a decision, not a shortcut.
 */
export function WorkspaceCreditAdjustment({ workspaceId, workspaceName }: WorkspaceCreditAdjustmentProps) {
  const queryClient = useQueryClient()
  const queryKey = ['workspace-billing-overview', workspaceId]
  const overviewQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const balance = overviewQuery.data?.balance ?? null
  const [amountDraft, setAmountDraft] = useState('')
  const [reason, setReason] = useState('')

  /*
   * Digits only, like the grant form beside this one. parseInt accepted
   * "12abc" as 12 and "1e3" as 1 — an admin typing a thousand saved one, with
   * a success toast.
   */
  const amount = /^\d+$/u.test(amountDraft.trim()) ? Number.parseInt(amountDraft.trim(), 10) : Number.NaN
  const amountValid = Number.isSafeInteger(amount) && amount >= 1 && amount <= 10_000
  const overBalance = amountValid && typeof balance === 'number' && amount > balance
  const ready = amountValid && !overBalance && reason.trim().length > 0

  const adjustMutation = useMutation({
    mutationFn: () => adjustWorkspaceCredits(workspaceId, { amount, reason: reason.trim() }),
    onSuccess: async (result) => {
      /*
       * Every surface that shows this workspace's money, not just this
       * card's own query. The four surfaces key four different families, and
       * invalidating only one's own let the cards on a single screen
       * contradict each other — a grant the adjustment card could not see,
       * a removal the grant preview ignored, a portfolio that never moved.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-credit-grants', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      setAmountDraft('')
      setReason('')
      toast.success(`Removed ${result.removed} credits. Balance is now ${result.balance ?? 'updated'}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The adjustment could not be recorded.'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><MinusCircle className="h-5 w-5" />Remove credits</CardTitle>
        <CardDescription>
          Correct a grant that was too large, or given to the wrong workspace. Recorded in the ledger as an adjustment,
          against your name.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="adjust-amount">Credits to remove</Label>
            <Input
              id="adjust-amount"
              inputMode="numeric"
              value={amountDraft}
              disabled={adjustMutation.isPending}
              onChange={(event) => setAmountDraft(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Input
              id="adjust-reason"
              maxLength={200}
              value={reason}
              placeholder="Example: duplicate onboarding grant"
              disabled={adjustMutation.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        {/* Refused rather than clamped: asking to remove more than exists is a
            mistake about the number, and silently taking whatever happened to
            be there would hide it. */}
        <p className="text-xs leading-5 text-muted-foreground">
          {overBalance
            ? <span className="text-destructive">{workspaceName || 'This workspace'} only has {balance} credits. A balance cannot go below zero.</span>
            : amountDraft.trim() && !amountValid
              ? <span className="text-destructive">Enter a whole number between 1 and 10,000.</span>
              : typeof balance === 'number' && amountValid
                ? `Balance would go from ${balance} to ${balance - amount}.`
                : 'Credits are taken from the newest and longest-lived first, so the soonest to expire stay spendable.'}
        </p>

        <Button
          type="button"
          variant="outline"
          className="w-fit border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
          disabled={!ready || adjustMutation.isPending}
          onClick={() => adjustMutation.mutate()}
        >
          {adjustMutation.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <MinusCircle className="mr-2 h-4 w-4" />}
          Remove credits
        </Button>
      </CardContent>
    </Card>
  )
}
