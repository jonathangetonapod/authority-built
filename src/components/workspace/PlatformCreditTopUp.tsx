import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Loader2 } from 'lucide-react'
import { listAdminWorkspaces } from '@/services/adminWorkspaces'
import { listWorkspaceStaff } from '@/services/workspaceStaff'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkspaceCreditGrantPreview } from '@/components/workspace/WorkspaceCreditGrantPreview'

interface PlatformCreditTopUpProps {
  actorEmail: string
}

/**
 * Topping up a sub-agency from the platform's own billing page. The grant
 * itself is the same one the tenant settings page has always offered — this
 * only chooses which workspace it applies to, so an owner can be topped up
 * without first navigating into their workspace.
 *
 * The workspace list is the one the platform admin surfaces already use, which
 * carries active tenants holding a reachable owner. The default workspace is
 * not among them: it buys its own credits through checkout on this same page.
 */
export function PlatformCreditTopUp({ actorEmail }: PlatformCreditTopUpProps) {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')

  const workspacesQuery = useQuery({
    queryKey: ['platform-credit-topup', 'workspaces'],
    queryFn: listAdminWorkspaces,
    staleTime: 60_000,
  })

  // The owner's name and email come from the roster the grant card shows them
  // in, rather than a second source that could disagree with it.
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

      {/* The grant needs an owner to name as the recipient. A workspace whose
          owner cannot be read says so rather than offering a grant addressed to
          nobody. */}
      {selectedWorkspaceId && !staffQuery.isLoading && !owner && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Building2 className="mr-2 inline h-4 w-4" />
          {staffQuery.isError
            ? 'This workspace could not be loaded, so no grant can be addressed to its owner.'
            : 'This workspace has no reachable owner to credit.'}
        </p>
      )}

      {selectedWorkspaceId && owner && (
        <WorkspaceCreditGrantPreview
          key={selectedWorkspaceId}
          workspaceId={selectedWorkspaceId}
          workspaceName={selectedName}
          ownerName={owner.full_name || owner.email}
          ownerEmail={owner.email}
          actorEmail={actorEmail}
        />
      )}
    </section>
  )
}
