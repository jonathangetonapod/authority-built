import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Link2, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  getClientInstantlyCampaignLinks,
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
  useEffect(() => {
    if (data) setSelectedIds(new Set(savedIds))
  }, [data, savedIds])
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
            attributes every reply from a linked campaign to this client.
          </CardDescription>
        </div>
        {canManage && (
          <Button
            size="sm"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save campaigns
          </Button>
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
          const campaigns = [...data.provider_campaigns]
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
                      {campaignStatusLabel(campaign.status)}
                      {campaign.managed_client_id === clientId ? ' · Managed by this client’s app campaign' : ''}
                    </span>
                  </label>
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
    </Card>
  )
}
