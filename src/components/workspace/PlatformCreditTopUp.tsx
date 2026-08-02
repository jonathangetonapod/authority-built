import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { listGrantableWorkspaces } from '@/services/adminWorkspaces'
import { listWorkspaceStaff } from '@/services/workspaceStaff'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkspaceCreditGrantPreview } from '@/components/workspace/WorkspaceCreditGrantPreview'
import { WorkspaceMonthlyAllowance } from '@/components/workspace/WorkspaceMonthlyAllowance'

interface PlatformCreditTopUpProps {
  actorEmail: string
}

/**
 * Topping up a sub-agency from the platform's own billing page. The grant
 * itself is the same one the tenant settings page has always offered — this
 * only chooses which workspace it applies to, so an agency can be topped up
 * without first navigating into their workspace.
 *
 * Every active tenant is listed, including one whose owner has not accepted
 * their invite yet: the credit goes to the workspace ledger, so the owner is a
 * name to show rather than a condition to meet. The default workspace is not
 * among them — it buys its own credits through checkout on this same page.
 */
export function PlatformCreditTopUp({ actorEmail }: PlatformCreditTopUpProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')

  const workspacesQuery = useQuery({
    queryKey: ['platform-credit-topup', 'workspaces'],
    queryFn: listGrantableWorkspaces,
    staleTime: 60_000,
  })

  // The owner's name and email come from the roster the grant card shows them
  // in, rather than a second source that could disagree with it. A workspace
  // without one is still creditable, so this only decides what is displayed.
  const staffQuery = useQuery({
    queryKey: ['platform-credit-topup', selectedWorkspaceId, 'staff'],
    queryFn: () => listWorkspaceStaff(selectedWorkspaceId),
    enabled: Boolean(selectedWorkspaceId),
    retry: false,
  })

  const workspaces = workspacesQuery.data ?? []
  const owner = useMemo(
    () => staffQuery.data?.members.find(
      (member) => member.role === 'owner' && member.status !== 'revoked',
    ),
    [staffQuery.data],
  )
  const selectedName = staffQuery.data?.workspace.name
    || workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name
    || ''

  return (
    <section className="space-y-4" aria-labelledby="platform-credit-topup-title">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg" id="platform-credit-topup-title">Top up a workspace</CardTitle>
          <CardDescription>
            Add credits to an agency&rsquo;s balance. The grant is recorded on their ledger and in the audit log against your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="platform-credit-topup-workspace">Workspace</Label>
          {workspacesQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading workspaces…
            </p>
          ) : workspacesQuery.isError ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              The workspace list could not be loaded.
            </p>
          ) : workspaces.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No active agency workspaces yet.
            </p>
          ) : (
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger id="platform-credit-topup-workspace">
                <SelectValue placeholder="Choose a workspace to top up" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedWorkspaceId && staffQuery.isLoading && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Loading {selectedName || 'workspace'}…
        </p>
      )}

      {selectedWorkspaceId && !staffQuery.isLoading && (
        <div className="space-y-4">
          <WorkspaceCreditGrantPreview
            key={selectedWorkspaceId}
            workspaceId={selectedWorkspaceId}
            workspaceName={selectedName}
            ownerName={owner ? owner.full_name || owner.email : null}
            ownerEmail={owner?.email ?? null}
            actorEmail={actorEmail}
          />
          {/* A grant is a one-off; this is what arrives every month without
              anyone doing anything. Both belong to the workspace already
              selected above. */}
          <WorkspaceMonthlyAllowance
            key={`allowance-${selectedWorkspaceId}`}
            workspaceId={selectedWorkspaceId}
            workspaceName={selectedName}
          />
        </div>
      )}
    </section>
  )
}
