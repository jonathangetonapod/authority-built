import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getWorkspaceBillingOverview, setWorkspaceMonthlyAllowance } from '@/services/workspaceStaff'

interface WorkspaceMonthlyAllowanceProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * What a workspace is granted every month, editable where an admin already is.
 *
 * The plan ladder carries an allowance, and editing it there looked like the
 * answer — but that number is only copied onto a workspace when a subscription
 * event fires. A workspace that has never been billed has no profile at all,
 * so it fell through to a literal in the granting code and no amount of plan
 * editing would ever change what it received.
 *
 * This writes the number the renewal actually reads.
 */
export function WorkspaceMonthlyAllowance({ workspaceId, workspaceName }: WorkspaceMonthlyAllowanceProps) {
  const queryClient = useQueryClient()
  const queryKey = ['workspace-billing-overview', workspaceId]
  const overviewQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const current = overviewQuery.data?.monthly_credit_allowance ?? null
  const [draft, setDraft] = useState('')
  useEffect(() => {
    if (typeof current === 'number') setDraft(String(current))
  }, [current])

  const parsed = Number.parseInt(draft.trim(), 10)
  const valid = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000
  const dirty = valid && parsed !== current

  const saveMutation = useMutation({
    mutationFn: () => setWorkspaceMonthlyAllowance(workspaceId, parsed),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(`${workspaceName || 'This workspace'} will be granted ${saved} credits a month.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The monthly allowance could not be saved.'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><RefreshCw className="h-5 w-5" />Monthly allowance</CardTitle>
        <CardDescription>
          Credits granted to {workspaceName || 'this workspace'} at the start of every month, on top of anything bought
          or granted by hand. Unspent credits from the allowance expire at the end of the following month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-56">
            <Label htmlFor="monthly-allowance">Credits per month</Label>
            <Input
              id="monthly-allowance"
              inputMode="numeric"
              value={draft}
              disabled={overviewQuery.isLoading || saveMutation.isPending}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Save allowance
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={saveMutation.isPending}
                onClick={() => setDraft(String(current ?? ''))}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
        {/* Said plainly, because the obvious expectation is that saving a
            bigger number puts the difference in the balance today. */}
        <p className="text-xs leading-5 text-muted-foreground">
          {draft.trim() && !valid
            ? <span className="text-destructive">Enter a whole number of credits between 0 and 1,000,000.</span>
            : 'Takes effect at the next monthly grant — this month has already been granted at the current figure. To add credits now, use the grant above.'}
        </p>
      </CardContent>
    </Card>
  )
}
