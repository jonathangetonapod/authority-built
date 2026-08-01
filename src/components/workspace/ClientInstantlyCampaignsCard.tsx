import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Link2, Loader2, Plus, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { InstantlyAccountPicker } from '@/components/workspace/InstantlyAccountPicker'
import {
  createClientInstantlyCampaign,
  getClientInstantlyCampaignLinks,
  getWorkspaceMailboxes,
  setClientInstantlyCampaignLinks,
} from '@/services/workspaceCampaigns'

// Instantly campaign_status values that read as "running" to operators.
const campaignStatusLabel = (status: number | null): string => {
  if (status === 1) return 'Active'
  if (status === 2) return 'Paused'
  if (status === 3) return 'Completed'
  if (status === 0) return 'Draft'
  return 'In Instantly'
}

interface ClientInstantlyCampaignsCardProps {
  workspaceId: string
  clientId: string
  clientName: string
  canManage: boolean
}

export const ClientInstantlyCampaignsCard = ({
  workspaceId,
  clientId,
  clientName,
  canManage,
}: ClientInstantlyCampaignsCardProps) => {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null)
  const [search, setSearch] = useState('')

  const linksQueryKey = ['client-instantly-campaign-links', workspaceId, clientId] as const
  const linksQuery = useQuery({
    queryKey: linksQueryKey,
    queryFn: () => getClientInstantlyCampaignLinks(workspaceId, clientId),
    retry: false,
    staleTime: 30_000,
  })
  const data = linksQuery.data ?? null
  const savedIds = useMemo(
    () => new Set((data?.links ?? []).map((link) => link.instantly_campaign_id)),
    [data],
  )
  // Reset the working selection only when the SAVED set actually changes —
  // a background refetch with reshuffled provider data must not wipe
  // in-progress checkbox toggles.
  const savedFingerprint = useMemo(() => [...savedIds].sort().join(','), [savedIds])
  const lastFingerprint = useRef<string | null>(null)
  useEffect(() => {
    if (!data) return
    if (lastFingerprint.current === savedFingerprint) return
    lastFingerprint.current = savedFingerprint
    setSelectedIds(new Set(savedIds))
  }, [data, savedIds, savedFingerprint])
  const selection = selectedIds ?? savedIds
  const dirty = selection.size !== savedIds.size
    || [...selection].some((id) => !savedIds.has(id))

  const saveMutation = useMutation({
    mutationFn: () => setClientInstantlyCampaignLinks(workspaceId, clientId, [...selection]),
    onSuccess: (links) => {
      queryClient.setQueryData(linksQueryKey, (current: typeof data) => (
        current ? { ...current, links } : current
      ))
      void queryClient.invalidateQueries({ queryKey: linksQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['workspace-inbox-threads'] })
      toast.success(`Instantly campaigns linked to ${clientName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The linked campaigns could not be saved.')
    },
  })

  // Which links can receive a pitch. A campaign built by hand in Instantly
  // carries its own sequence and none of the goap* variables, so a pitch staged
  // into it would go out as that copy — it is linked for replies only.
  const sendableIds = useMemo(
    () => new Set((data?.links ?? []).filter((link) => link.sendable).map((link) => link.instantly_campaign_id)),
    [data],
  )

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSenders, setNewSenders] = useState<Set<string>>(new Set())
  const mailboxesQuery = useQuery({
    queryKey: ['workspace-mailboxes', workspaceId],
    queryFn: () => getWorkspaceMailboxes(workspaceId),
    enabled: createOpen,
    retry: false,
    staleTime: 30_000,
  })
  const createMutation = useMutation({
    mutationFn: () => createClientInstantlyCampaign({
      workspaceId,
      clientId,
      name: newName.trim(),
      senderAccounts: [...newSenders],
    }),
    onSuccess: (link) => {
      setCreateOpen(false)
      setNewName('')
      setNewSenders(new Set())
      void queryClient.invalidateQueries({ queryKey: linksQueryKey })
      toast.success(`${link.campaign_name || 'The campaign'} was created and linked to ${clientName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The campaign could not be created.')
    },
  })

  const toggle = (campaignId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current ?? savedIds)
      if (next.has(campaignId)) next.delete(campaignId)
      else next.add(campaignId)
      return next
    })
  }

  return (
    <Card aria-labelledby="client-instantly-campaigns-heading" className="overflow-hidden">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle id="client-instantly-campaigns-heading" className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />Instantly campaigns
          </CardTitle>
          <CardDescription>
            Link the Instantly campaigns that belong to {clientName}. The Master Inbox
            attributes every reply from a linked campaign to this client. Pitches can
            only be sent into campaigns created here, because a campaign built in
            Instantly carries copy of its own.
          </CardDescription>
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />Create campaign
            </Button>
            <Button
              size="sm"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save campaigns
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {linksQuery.isLoading ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading Instantly campaigns…
          </div>
        ) : linksQuery.isError ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-destructive">
              {linksQuery.error instanceof Error
                ? linksQuery.error.message
                : 'Linked campaigns could not be loaded.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void linksQuery.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />Try again
            </Button>
          </div>
        ) : !data?.connected ? (
          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {savedIds.size > 0
                ? `${savedIds.size} campaign${savedIds.size === 1 ? ' is' : 's are'} linked, but Instantly is not reachable right now — connect Instantly in Client Campaigns to manage the list.`
                : 'Connect Instantly in Client Campaigns to load this workspace’s campaigns and link them to the client.'}
            </p>
          </div>
        ) : data.provider_campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No campaigns exist in this Instantly workspace yet.
          </p>
        ) : (() => {
          const query = search.trim().toLowerCase()
          // Saved links surface first so the client's own list is always in
          // view. Ordering follows what is SAVED, not the in-progress
          // selection — resorting on every checkbox toggle would make rows
          // jump around under the cursor.
          const providerIds = new Set(data.provider_campaigns.map((campaign) => campaign.id))
          // Saved links whose campaign vanished from Instantly still need a
          // row, or they could never be unlinked.
          const missingLinks = (data.links ?? [])
            .filter((link) => !providerIds.has(link.instantly_campaign_id))
            .map((link) => ({
              id: link.instantly_campaign_id,
              name: link.campaign_name || 'Campaign removed from Instantly',
              status: null as number | null,
              linked_client_id: clientId,
              linked_client_name: null,
              managed_client_id: null,
              missing_from_provider: true,
            }))
          const campaigns = [...data.provider_campaigns.map((campaign) => ({ ...campaign, missing_from_provider: false })), ...missingLinks]
            .filter((campaign) => !query || campaign.name.toLowerCase().includes(query))
            .sort((a, b) => {
              const aLinked = savedIds.has(a.id) ? 0 : 1
              const bLinked = savedIds.has(b.id) ? 0 : 1
              return aLinked - bLinked || a.name.localeCompare(b.name)
            })
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search campaigns…"
                  aria-label="Search Instantly campaigns"
                  className="h-8 w-full sm:w-64"
                />
                <p className="text-xs text-muted-foreground">
                  {selection.size} linked · {data.provider_campaigns.length} campaign{data.provider_campaigns.length === 1 ? '' : 's'} in Instantly
                </p>
              </div>
              {campaigns.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No campaigns match “{search.trim()}”.</p>
              ) : (
                <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border px-3" aria-label="Instantly campaigns">
                  {campaigns.map((campaign) => {
              const linkedElsewhere = Boolean(
                (campaign.linked_client_id && campaign.linked_client_id !== clientId)
                || (campaign.managed_client_id && campaign.managed_client_id !== clientId),
              )
              const checked = selection.has(campaign.id)
              return (
                <li key={campaign.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox
                    id={`instantly-campaign-${campaign.id}`}
                    checked={checked}
                    disabled={!canManage || linkedElsewhere}
                    onCheckedChange={() => toggle(campaign.id)}
                    aria-label={`Link ${campaign.name}`}
                  />
                  <label
                    htmlFor={`instantly-campaign-${campaign.id}`}
                    className={`min-w-0 flex-1 ${linkedElsewhere ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                  >
                    <span className="block truncate text-sm font-medium">{campaign.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {campaign.missing_from_provider ? 'No longer in Instantly — uncheck to remove' : campaignStatusLabel(campaign.status)}
                      {campaign.managed_client_id === clientId ? ' · Managed by this client’s app campaign' : ''}
                    </span>
                  </label>
                  {/* The distinction that decides whether a pitch can go here
                      at all, stated on the row rather than discovered at send
                      time by a refusal. */}
                  {checked && savedIds.has(campaign.id) && (
                    <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {sendableIds.has(campaign.id) ? (
                          <Badge variant="outline" className="shrink-0 cursor-help border-emerald-300 bg-emerald-50 text-emerald-800">
                            <Send className="mr-1 h-3 w-3" />Sendable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0 cursor-help bg-muted text-muted-foreground">
                            Replies only
                          </Badge>
                        )}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {sendableIds.has(campaign.id)
                          ? 'Built here, so its emails read the pitch written for each podcast. Pitches can be sent into it.'
                          : 'Built in Instantly, so it carries its own copy. Replies still get attributed to this client, but a pitch sent into it would go out as that copy instead — use Create campaign to make one that can receive pitches.'}
                      </TooltipContent>
                    </Tooltip>
                    </TooltipProvider>
                  )}
                  {linkedElsewhere && (
                    <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground">
                      {campaign.linked_client_name
                        ? `Linked to ${campaign.linked_client_name}`
                        : 'Assigned to another client'}
                    </Badge>
                  )}
                </li>
              )
            })}
                </ul>
              )}
            </div>
          )
        })()}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(next) => !createMutation.isPending && setCreateOpen(next)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a campaign for {clientName}</DialogTitle>
            <DialogDescription>
              This builds the campaign in Instantly with the three-step sequence pitches
              are written into, and links it to {clientName}. It starts paused, so nothing
              sends until you approve outreach.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-campaign-name">Campaign name</Label>
              <Input
                id="new-campaign-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={`${clientName} podcast outreach`}
                maxLength={180}
              />
            </div>
            <div className="space-y-2">
              <Label>Sending accounts</Label>
              <InstantlyAccountPicker
                accounts={mailboxesQuery.data?.accounts ?? []}
                connected={Boolean(mailboxesQuery.data?.connected)}
                selected={newSenders}
                onChange={setNewSenders}
                disabled={createMutation.isPending}
                defaultClientId={clientId}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || newSenders.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
