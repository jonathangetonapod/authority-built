import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, Globe, Loader2, RefreshCw, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { checkDomainInput, describeDomainStatus } from '@/lib/customDomain'
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

/**
 * The whole flow, stated before the form rather than discovered through it.
 *
 * This card is used rarely and by someone handing work to an agency who has
 * never seen it — so the sequence, who does which part, and how long the wait
 * is supposed to be all have to be readable without asking anyone.
 */
const steps = [
  {
    title: 'Add the hostname here',
    body: 'Pick the workspace and enter the address their clients will see. We register it with our host and get back the one DNS record it needs.',
  },
  {
    title: 'Send that record to the agency',
    body: 'Copy instructions writes the whole message — the record and what happens next — ready to forward to whoever runs their DNS. They add one record; nothing else on their side changes.',
  },
  {
    title: 'Wait for it to resolve',
    body: 'A waiting domain re-checks itself every minute, so there is nothing to sit and press. Once the record is visible the https certificate issues on its own, usually within the hour. Waiting for DNS, then Issuing certificate, then Serving.',
  },
  {
    title: 'Their links switch over',
    body: 'The first domain that serves becomes the address this workspace builds client links from. Every domain after that takes a deliberate Use for links click, so adding one can never quietly take links away from a working one.',
  },
]

export function WorkspaceDomainsCard({ workspaces }: Props) {
  const queryClient = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [hostname, setHostname] = useState('')
  // Removing a domain deletes it at Railway too. Recovery means a new
  // certificate, a new DNS value, and the agency redoing their DNS — so it
  // does not happen straight off a trash icon.
  const [pendingRemoval, setPendingRemoval] = useState<WorkspaceDomain | null>(null)

  const domainsQuery = useQuery({
    queryKey: ['workspace-domains'],
    queryFn: listWorkspaceDomains,
    retry: false,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-domains'] })

  // Checked as it is typed, and the normalized value is what gets sent — so a
  // pasted URL becomes a hostname here rather than a 400 from the server with
  // the wrong-looking value still sitting in the box.
  const check = checkDomainInput(hostname)

  const addMutation = useMutation({
    mutationFn: () => addWorkspaceDomain(workspaceId, check.hostname),
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

  /**
   * Check waiting domains on a timer, quietly.
   *
   * DNS propagation takes minutes to hours, and the manual flow was pressing
   * Check until it flipped — the admin as polling loop. While any domain is
   * waiting, each gets checked once a minute; the toast-and-refresh path stays
   * on the button, because sixty background toasts an hour is noise, and the
   * flip to Active is visible on the row the moment a check lands it.
   */
  const waitingIds = (domainsQuery.data || [])
    // Issuing the certificate is a wait too, and leaving it out meant a domain
    // that had cleared DNS sat on "Issuing certificate" until someone pressed
    // Check — the one status where the card promises it resolves on its own.
    .filter((domain: WorkspaceDomain) => domain.status === 'awaiting_dns' || domain.status === 'provisioning')
    .map((domain: WorkspaceDomain) => domain.id)
  const waitingKey = waitingIds.join(',')
  useEffect(() => {
    if (!waitingKey) return
    const timer = window.setInterval(() => {
      for (const domainId of waitingKey.split(',')) {
        void Promise.resolve(refreshWorkspaceDomain(domainId))
          .then(() => queryClient.invalidateQueries({ queryKey: ['workspace-domains'] }))
          .catch(() => {})
      }
    }, 60_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey])

  const busy = addMutation.isPending || refreshMutation.isPending
    || primaryMutation.isPending || removeMutation.isPending
  const domains = domainsQuery.data || []

  /**
   * The whole handoff in one copy. Composing the email was the manual step:
   * three values copied separately into prose that had to explain them. This
   * is written to be pasted to the agency — or forwarded straight to whoever
   * runs their DNS — without editing.
   */
  const copyInstructions = async (domain: WorkspaceDomain) => {
    const message = [
      `To serve your workspace on ${domain.hostname}, add one DNS record at your domain host:`,
      '',
      `  Type:  ${domain.dns_record_type ?? 'CNAME'}`,
      `  Name:  ${domain.dns_record_name ?? domain.hostname}`,
      `  Value: ${domain.dns_record_value ?? ''}`,
      '',
      'This is a new record on its own subdomain — it does not touch your website, your email, or any record you already have.',
      '',
      'If your DNS is on Cloudflare, leave this record set to DNS only rather than proxied. A proxied record hides the value we check for, and the certificate will not issue.',
      '',
      'Nothing else changes on your side. Once the record exists, the certificate issues automatically — usually within the hour — and your client links switch to your domain. Reply when it is in and we will confirm it is live.',
    ].join('\n')
    await copy(message)
  }

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
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-sm font-medium">How this works</p>
          <ol className="mt-3 space-y-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          {/*
            Both of these turn a ten-minute setup into a support thread, and
            both are invisible until they have already gone wrong: an apex
            record takes their marketing site down, and a proxied record fails
            in a way that just looks like waiting.
          */}
          <div className="mt-4 space-y-2 border-t pt-3">
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">Use a subdomain, not their root domain.</span> podcasts.theiragency.com
              leaves everything they already run untouched. theiragency.com repoints the whole domain and takes their
              marketing site with it.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">If they use Cloudflare, the record stays DNS only.</span> A proxied
              record hides the value our host checks for, so the certificate never issues and the domain sits on
              Waiting for DNS looking like slow propagation.
            </p>
          </div>
        </div>

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
              disabled={busy || !workspaceId || !check.ready}
            >
              {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add domain
            </Button>
          </div>
        </div>
        {/*
          One slot under the form, and it always says the most useful thing it
          can: what is wrong, or what is risky, or exactly what will be added.
          Nothing here is a surprise that arrives after pressing the button.
        */}
        <div className="-mt-2 space-y-2">
          {check.problem ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{check.problem}</span>
            </p>
          ) : check.warning ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="flex items-start gap-2 text-xs leading-5 text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{check.warning}</span>
              </p>
              {check.suggestion && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 bg-background text-xs"
                  disabled={busy}
                  onClick={() => setHostname(check.suggestion || '')}
                >
                  Use {check.suggestion} instead
                </Button>
              )}
            </div>
          ) : check.ready ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span>
                {check.cleaned
                  ? <>Will be added as <span className="font-mono">{check.hostname}</span> — the extra part of what you pasted is not needed.</>
                  : <>Ready to add as <span className="font-mono">{check.hostname}</span>.</>}
                {' '}Nothing changes for the agency until they create the record, and nothing for their clients until it is serving.
              </span>
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              The agency has to own this domain and be able to edit its DNS. A subdomain they are not already using is
              the safe choice — podcasts.theiragency.com.
            </p>
          )}
        </div>

        {domainsQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : domainsQuery.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {domainsQuery.error instanceof Error ? domainsQuery.error.message : 'Domains could not be loaded.'}
          </p>
        ) : domains.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            No custom domains yet. Every workspace serves from getonapod.com — dashboards, onboarding forms, and the
            links the platform emails — until one is added above.
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
                    {domain.status === 'awaiting_dns' && domain.dns_record_value && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void copyInstructions(domain)}>
                        <Copy className="mr-2 h-3.5 w-3.5" />Copy instructions
                      </Button>
                    )}
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
                      onClick={() => setPendingRemoval(domain)}
                      aria-label={`Remove ${domain.hostname}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* The badge names a state; this says whose turn it is. */}
                <p className={`flex items-start gap-2 text-xs leading-5 ${domain.status === 'active' ? 'text-emerald-800' : 'text-muted-foreground'}`}>
                  {domain.status === 'active' && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{describeDomainStatus(domain.status)}</span>
                </p>

                {domain.status === 'active' ? null : domain.dns_record_value ? (
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
                    {/* Restated where the waiting actually happens, because the
                        instinct on a pending row is to keep pressing Check. */}
                    <p className="mt-3 text-xs text-muted-foreground">
                      This re-checks itself every minute — Check is only there if you want an answer sooner. It flips to
                      Serving on its own once the record resolves and the certificate issues.
                    </p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={Boolean(pendingRemoval)} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemoval?.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the domain at Railway as well as here. Any link already sent on this address stops working,
              and getting it back means a new certificate and a new DNS record for {pendingRemoval?.workspace?.name || 'this workspace'} to create.
              {pendingRemoval?.is_primary && ' This is the domain their client links are built from — new links will go out on getonapod.com instead.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRemoval) removeMutation.mutate(pendingRemoval.id)
                setPendingRemoval(null)
              }}
            >
              Remove domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
