import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, Globe, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  refreshWorkspaceDomain,
  removeWorkspaceDomain,
  setPrimaryWorkspaceDomain,
  type WorkspaceDomain,
  type WorkspaceDomainStatus,
} from '@/services/workspaceDomains'

interface Props {
  workspaces: Array<{ id: string; name: string }>
}

const statusLabels: Record<WorkspaceDomainStatus, string> = {
  awaiting_dns: 'Waiting for DNS',
  provisioning: 'Issuing certificate',
  active: 'Serving',
  failed: 'Failed',
  disabled: 'Disabled',
}

const statusStyles: Record<WorkspaceDomainStatus, string> = {
  awaiting_dns: 'border-amber-200 bg-amber-50 text-amber-800',
  provisioning: 'border-blue-200 bg-blue-50 text-blue-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  disabled: 'border-border bg-muted text-muted-foreground',
}

export function WorkspaceDomainsCard({ workspaces }: Props) {
  const queryClient = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [hostname, setHostname] = useState('')

  const domainsQuery = useQuery({
    queryKey: ['workspace-domains'],
    queryFn: listWorkspaceDomains,
    retry: false,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-domains'] })

  const addMutation = useMutation({
    mutationFn: () => addWorkspaceDomain(workspaceId, hostname),
    onSuccess: async (domain) => {
      setHostname('')
      await refresh()
      toast.success(`${domain.hostname} added. Create the DNS record below, then check again.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The domain could not be added.'),
  })

  const refreshMutation = useMutation({
    mutationFn: (domainId: string) => refreshWorkspaceDomain(domainId),
    onSuccess: async (status) => {
      await refresh()
      toast[status === 'active' ? 'success' : 'info'](
        status === 'active'
          ? 'The certificate has issued. This domain is serving.'
          : 'Not serving yet. The reason is shown on the domain.',
      )
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The status could not be checked.'),
  })

  const primaryMutation = useMutation({
    mutationFn: (domainId: string) => setPrimaryWorkspaceDomain(domainId),
    onSuccess: async () => {
      await refresh()
      toast.success('Client links will now use this domain.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The primary domain could not be set.'),
  })

  const removeMutation = useMutation({
    mutationFn: (domainId: string) => removeWorkspaceDomain(domainId),
    onSuccess: async () => {
      await refresh()
      toast.success('Domain removed from Railway and from this workspace.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The domain could not be removed.'),
  })

  const busy = addMutation.isPending || refreshMutation.isPending
    || primaryMutation.isPending || removeMutation.isPending
  const domains = domainsQuery.data || []

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied.')
    } catch {
      toast.error('Copying was blocked. Select the value and copy it manually.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Custom domains</CardTitle>
        <CardDescription>
          A workspace serving its own hostname is what makes the white label complete — its clients see the agency's
          address rather than ours, on the dashboards, the onboarding form, and every link the platform emails them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="domain-workspace">Workspace</Label>
            <Select value={workspaceId} onValueChange={setWorkspaceId} disabled={busy}>
              <SelectTrigger id="domain-workspace"><SelectValue placeholder="Choose a workspace" /></SelectTrigger>
              <SelectContent>
                {workspaces.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domain-hostname">Hostname</Label>
            <Input
              id="domain-hostname"
              placeholder="podcasts.theiragency.com"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => addMutation.mutate()}
              disabled={busy || !workspaceId || hostname.trim().length < 4}
            >
              {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add domain
            </Button>
          </div>
        </div>

        {domainsQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : domainsQuery.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {domainsQuery.error instanceof Error ? domainsQuery.error.message : 'Domains could not be loaded.'}
          </p>
        ) : domains.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No custom domains yet. Every workspace serves from getonapod.com until one is added.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {domains.map((domain: WorkspaceDomain) => (
              <li key={domain.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{domain.hostname}</span>
                      <Badge variant="outline" className={statusStyles[domain.status]}>{statusLabels[domain.status]}</Badge>
                      {domain.is_primary && (
                        <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Links use this</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{domain.workspace?.name || 'Unknown workspace'}</p>
                    {domain.last_error && domain.status !== 'active' && (
                      <p className="mt-1 text-xs text-amber-800">{domain.last_error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => refreshMutation.mutate(domain.id)}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />Check
                    </Button>
                    {domain.status === 'active' && !domain.is_primary && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => primaryMutation.mutate(domain.id)}>
                        Use for links
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => removeMutation.mutate(domain.id)}
                      aria-label={`Remove ${domain.hostname}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {domain.status === 'active' ? (
                  <p className="flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />Serving over https. Their clients never see our address.
                  </p>
                ) : domain.dns_record_value ? (
                  // Printed rather than described: this is the exact record the
                  // agency types into their DNS host, and a paraphrase of it is
                  // a support ticket waiting to happen.
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs font-medium">The agency creates this record at their DNS host:</p>
                    <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                      <div><dt className="text-muted-foreground">Type</dt><dd className="mt-0.5 font-mono">{domain.dns_record_type}</dd></div>
                      <div className="min-w-0"><dt className="text-muted-foreground">Name</dt><dd className="mt-0.5 truncate font-mono">{domain.dns_record_name}</dd></div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Value</dt>
                        <dd className="mt-0.5 flex items-center gap-1">
                          <span className="truncate font-mono">{domain.dns_record_value}</span>
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => void copy(domain.dns_record_value || '')}
                            aria-label={`Copy the DNS value for ${domain.hostname}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
