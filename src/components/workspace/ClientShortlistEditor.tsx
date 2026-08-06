import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  CheckCircle2,
  Database,
  Eye,
  ExternalLink,
  FileText,
  Library,
  ListPlus,
  Loader2,
  MailCheck,
  MoreHorizontal,
  PenLine,
  Radio,
  RotateCcw,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ClientCampaignPrepDialog } from '@/components/workspace/ClientCampaignPrepDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { isTargetInActiveOutreach, pitchActionLabel } from '@/lib/campaignTargetState'
import { safeExternalUrl } from '@/lib/externalUrl'
import { getWorkspaceCampaign } from '@/services/workspaceCampaigns'
import { cn } from '@/lib/utils'
import {
  addClientShortlistPodcasts,
  getClientAutopilot,
  getClientShortlist,
  setClientAutopilot,
  runClientShortlistEmailSearch,
  runClientShortlistResearch,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
  type ClientShortlistCatalogPodcast,
  type ClientShortlistPodcast,
  type ClientShortlistVisibility,
} from '@/services/clientShortlist'

type ListFilter = 'all' | 'not_reviewed' | 'approved' | 'rejected' | 'archived'
type ListSort = 'list_order' | 'audience_desc' | 'audience_asc' | 'rating_desc' | 'rating_asc' | 'recent_desc' | 'name_asc'

interface ClientShortlistEditorProps {
  workspaceId: string
  clientId: string
  clientName: string
  clientBio?: string | null
  viewerRole?: 'owner' | 'admin' | 'member' | 'platform_admin'
  databaseHref: string
  finderHref: string
  campaignHref: string
  relationshipsHref: string
  billingHref: string
  onChanged?: () => void
}

const PAGE_SIZE = 10

function compareOptionalNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: 'asc' | 'desc',
): number {
  const leftValue = typeof left === 'number' && Number.isFinite(left) ? left : null
  const rightValue = typeof right === 'number' && Number.isFinite(right) ? right : null
  if (leftValue === null && rightValue === null) return 0
  if (leftValue === null) return 1
  if (rightValue === null) return -1
  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function resultLabel(count: number): string {
  return `${count.toLocaleString()} podcast${count === 1 ? '' : 's'}`
}

function formattedDate(value: string | null | undefined): string {
  if (!value) return 'an earlier campaign'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'an earlier campaign'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function feedbackBadge(podcast: ClientShortlistPodcast) {
  if (podcast.feedback_status === 'approved') {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>
  }
  if (podcast.feedback_status === 'rejected') {
    return <Badge className="border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50"><ThumbsDown className="mr-1 h-3 w-3" />Passed</Badge>
  }
  return <Badge variant="outline" className="text-muted-foreground">To review</Badge>
}

function visibilityBadge(visibility: ClientShortlistVisibility) {
  if (visibility === 'archived') {
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700"><Archive className="mr-1 h-3 w-3" />Archived</Badge>
  }
  return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800"><Eye className="mr-1 h-3 w-3" />Visible</Badge>
}

function PodcastArtwork({ podcast }: { podcast: Pick<ClientShortlistPodcast, 'podcast_image_url' | 'podcast_name'> }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [podcast.podcast_image_url])
  if (!podcast.podcast_image_url || failed) {
    return <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted"><Radio className="h-5 w-5 text-muted-foreground" /></div>
  }
  return (
    <img
      src={podcast.podcast_image_url}
      alt=""
      className="h-12 w-12 shrink-0 rounded-xl object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function PodcastExternalLink({ url, name }: { url: string | null; name: string }) {
  const href = safeExternalUrl(url)
  if (!href) return null
  return <Button asChild variant="ghost" size="icon"><a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${name}`}><ExternalLink className="h-4 w-4" /></a></Button>
}

export function ClientShortlistEditor({
  workspaceId,
  clientId,
  clientName,
  clientBio,
  viewerRole,
  databaseHref,
  finderHref,
  campaignHref,
  relationshipsHref,
  billingHref,
  onChanged,
}: ClientShortlistEditorProps) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<ListFilter>('all')
  const [sort, setSort] = useState<ListSort>('list_order')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [addOpen, setAddOpen] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [debouncedCatalogQuery, setDebouncedCatalogQuery] = useState('')
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(new Set())
  const [pendingPodcastId, setPendingPodcastId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ClientShortlistPodcast | null>(null)
  const [detailPodcast, setDetailPodcast] = useState<ClientShortlistPodcast | null>(null)
  const [campaignPrepPodcast, setCampaignPrepPodcast] = useState<ClientShortlistPodcast | null>(null)
  const [operatorNotes, setOperatorNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)

  const shortlistQueryKey = ['client-shortlist', workspaceId, clientId] as const
  /**
   * Which of these podcasts are already out with the host.
   *
   * The row could not see it, so a podcast in active outreach still offered
   * "Write Pitch" — a button promising work the next screen opens locked and
   * refuses. Same query key as the pitch dialog, so this shares its cache
   * rather than fetching the campaign twice, and a failure leaves every label
   * exactly as it was.
   */
  const campaignTargetsQuery = useQuery({
    queryKey: ['client-campaign-preparation', workspaceId, clientId],
    queryFn: () => getWorkspaceCampaign(workspaceId, clientId),
    enabled: Boolean(workspaceId) && Boolean(clientId),
    retry: false,
    staleTime: 30_000,
  })
  const podcastsInActiveOutreach = useMemo(() => {
    const ids = new Set<string>()
    for (const target of campaignTargetsQuery.data?.targets ?? []) {
      if (isTargetInActiveOutreach(target)) ids.add(target.shortlist_podcast_id)
    }
    return ids
  }, [campaignTargetsQuery.data])

  const shortlistQuery = useQuery({
    queryKey: shortlistQueryKey,
    queryFn: () => getClientShortlist(workspaceId, clientId),
    retry: false,
    refetchInterval: (query) => {
      if (!campaignPrepPodcast) return false
      const currentPodcast = query.state.data?.podcasts.find((item) => item.id === campaignPrepPodcast.id)
      return currentPodcast?.research_progress?.status === 'queued'
        || currentPodcast?.research_progress?.status === 'running'
        ? 2_000
        : false
    },
  })
  const catalogSearchQuery = useQuery({
    queryKey: ['client-shortlist-catalog', workspaceId, clientId, debouncedCatalogQuery],
    queryFn: () => searchClientPodcastCatalog(workspaceId, clientId, debouncedCatalogQuery),
    enabled: addOpen && debouncedCatalogQuery.length >= 2,
    retry: false,
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedCatalogQuery(catalogQuery.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [catalogQuery])

  useEffect(() => setPage(1), [filter, searchQuery, sort])

  const podcasts = useMemo(() => shortlistQuery.data?.podcasts || [], [shortlistQuery.data?.podcasts])
  const activeCampaignPrepPodcast = useMemo(() => {
    if (!campaignPrepPodcast) return null
    return podcasts.find((podcast) => podcast.id === campaignPrepPodcast.id) || campaignPrepPodcast
  }, [campaignPrepPodcast, podcasts])
  const featured = useMemo(() => podcasts
    .filter((podcast) => podcast.visibility === 'visible' && podcast.is_featured)
    .sort((left, right) => (left.featured_order ?? 99) - (right.featured_order ?? 99)), [podcasts])
  const counts = useMemo(() => ({
    active: podcasts.filter((podcast) => podcast.visibility === 'visible').length,
    archived: podcasts.filter((podcast) => podcast.visibility === 'archived').length,
    approved: podcasts.filter((podcast) => podcast.visibility === 'visible' && podcast.feedback_status === 'approved').length,
    rejected: podcasts.filter((podcast) => podcast.visibility === 'visible' && podcast.feedback_status === 'rejected').length,
    notReviewed: podcasts.filter((podcast) => podcast.visibility === 'visible' && !podcast.feedback_status).length,
  }), [podcasts])
  const autopilotQuery = useQuery({
    queryKey: ['client-autopilot', workspaceId, clientId],
    queryFn: () => getClientAutopilot(workspaceId, clientId),
    enabled: viewerRole !== 'member',
    retry: false,
    staleTime: 60_000,
  })
  const autopilot = autopilotQuery.data ?? null
  const [autopilotSaving, setAutopilotSaving] = useState(false)
  const toggleAutopilot = async (enabled: boolean) => {
    if (autopilotSaving) return
    setAutopilotSaving(true)
    try {
      const saved = await setClientAutopilot(workspaceId, clientId, {
        enabled,
        max_weekly_adds: autopilot?.max_weekly_adds,
        min_score: autopilot?.min_score,
      })
      queryClient.setQueryData(['client-autopilot', workspaceId, clientId], saved)
      toast.success(enabled
        ? `Weekly autopilot is on — up to ${saved.max_weekly_adds} high-fit podcasts will be added automatically, starting within the next ten minutes.`
        : 'Weekly autopilot is off for this client.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Autopilot could not be updated.')
    } finally {
      setAutopilotSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const matching = podcasts.filter((podcast) => {
      if (query && !`${podcast.podcast_name} ${podcast.publisher_name || ''}`.toLowerCase().includes(query)) return false
      if (filter === 'all') return podcast.visibility === 'visible'
      if (filter === 'archived') return podcast.visibility === 'archived'
      if (podcast.visibility !== 'visible') return false
      if (filter === 'approved') return podcast.feedback_status === 'approved'
      if (filter === 'rejected') return podcast.feedback_status === 'rejected'
      return podcast.feedback_status === null
    })
    if (sort === 'list_order') return matching
    return [...matching].sort((left, right) => {
      if (sort === 'audience_desc') return compareOptionalNumbers(left.audience_size, right.audience_size, 'desc')
      if (sort === 'audience_asc') return compareOptionalNumbers(left.audience_size, right.audience_size, 'asc')
      if (sort === 'rating_desc') return compareOptionalNumbers(left.itunes_rating, right.itunes_rating, 'desc')
      if (sort === 'rating_asc') return compareOptionalNumbers(left.itunes_rating, right.itunes_rating, 'asc')
      if (sort === 'recent_desc') {
        const leftTimestamp = left.last_posted_at ? Date.parse(left.last_posted_at) : Number.NaN
        const rightTimestamp = right.last_posted_at ? Date.parse(right.last_posted_at) : Number.NaN
        return compareOptionalNumbers(
          Number.isFinite(leftTimestamp) ? leftTimestamp : null,
          Number.isFinite(rightTimestamp) ? rightTimestamp : null,
          'desc',
        )
      }
      return left.podcast_name.localeCompare(right.podcast_name, undefined, { sensitivity: 'base' })
    })
  }, [filter, podcasts, searchQuery, sort])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => setPage((current) => Math.min(current, totalPages)), [totalPages])
  const visiblePage = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const catalogResults = catalogSearchQuery.data || []
  const selectedCatalog = catalogResults.filter((podcast) => selectedCatalogIds.has(podcast.podcast_id) && !podcast.already_added)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
    onChanged?.()
  }

  const updatePodcast = async (
    podcast: ClientShortlistPodcast,
    changes: Parameters<typeof updateClientShortlistPodcast>[3],
    successMessage: string,
  ) => {
    setPendingPodcastId(podcast.podcast_id)
    try {
      await updateClientShortlistPodcast(workspaceId, clientId, podcast.podcast_id, changes)
      await refresh()
      toast.success(successMessage)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The podcast could not be updated.')
    } finally {
      setPendingPodcastId(null)
    }
  }

  const toggleFeatured = async (podcast: ClientShortlistPodcast) => {
    const nextFeatured = !podcast.is_featured
    if (nextFeatured && featured.length >= 6) {
      toast.error('You can feature up to six podcasts. Unfeature one first.')
      return
    }
    await updatePodcast(
      podcast,
      { is_featured: nextFeatured },
      nextFeatured ? `${podcast.podcast_name} added to featured recommendations.` : `${podcast.podcast_name} removed from featured recommendations.`,
    )
  }

  const addSelectedCatalog = async () => {
    if (selectedCatalog.length === 0) return
    setIsAdding(true)
    try {
      const result = await addClientShortlistPodcasts(workspaceId, clientId, selectedCatalog)
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ['client-shortlist-catalog', workspaceId, clientId] }),
      ])
      setSelectedCatalogIds(new Set())
      if (result.added === 0) {
        toast.info('Those podcasts are already in this client’s history.')
      } else if (result.skipped > 0) {
        toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} and skipped ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'}.`)
      } else {
        toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} to ${clientName}’s approval list.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Podcasts could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const confirmArchive = async () => {
    if (!archiveTarget) return
    const target = archiveTarget
    setArchiveTarget(null)
    await updatePodcast(
      target,
      { visibility: 'archived' },
      `${target.podcast_name} archived. Its history will still be used for dedupe.`,
    )
  }

  const openPodcastDetails = (podcast: ClientShortlistPodcast) => {
    setDetailPodcast(podcast)
    setOperatorNotes(podcast.operator_notes || '')
  }

  const saveOperatorNotes = async () => {
    if (!detailPodcast) return
    setIsSavingNotes(true)
    try {
      const updated = await updateClientShortlistPodcast(
        workspaceId,
        clientId,
        detailPodcast.podcast_id,
        { operator_notes: operatorNotes.trim() || null },
      )
      setDetailPodcast(updated)
      setOperatorNotes(updated.operator_notes || '')
      await refresh()
      toast.success('Internal podcast notes saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Internal notes could not be saved.')
    } finally {
      setIsSavingNotes(false)
    }
  }

  if (shortlistQuery.isLoading) {
    return <Card id="client-podcast-list"><CardContent className="flex min-h-56 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></CardContent></Card>
  }

  if (shortlistQuery.error) {
    return (
      <Card id="client-podcast-list" className="border-destructive/30">
        <CardHeader><CardTitle>Client podcast list unavailable</CardTitle><CardDescription>{shortlistQuery.error instanceof Error ? shortlistQuery.error.message : 'The podcast list could not be loaded.'}</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => void shortlistQuery.refetch()}>Try again</Button></CardContent>
      </Card>
    )
  }

  return (
    <section id="client-podcast-list" aria-labelledby="client-podcast-list-heading" className="scroll-mt-6 space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle id="client-podcast-list-heading" className="flex items-center gap-2 text-xl"><Library className="h-5 w-5 text-primary" />Client podcast list</CardTitle>
              <CardDescription className="mt-2 max-w-2xl">Control exactly what {clientName} sees without leaving the Approval Dashboard. Archived shows stay in campaign history and weekly dedupe.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={databaseHref}><Database className="mr-2 h-4 w-4" />Browse database</Link></Button>
              <Button onClick={() => setAddOpen(true)} variant="outline"><ListPlus className="mr-2 h-4 w-4" />Quick add</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visible to client</p><p className="mt-2 text-2xl font-bold">{counts.active}</p></div>
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Featured</p><p className="mt-2 text-2xl font-bold">{featured.length}<span className="text-sm font-normal text-muted-foreground"> / 6</span></p></div>
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client decisions</p><p className="mt-2 text-2xl font-bold">{counts.approved + counts.rejected}</p></div>
            <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Archived</p><p className="mt-2 text-2xl font-bold">{counts.archived}</p></div>
          </div>
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="space-y-4">
          <div><CardTitle>All podcasts</CardTitle><CardDescription>Search, filter, feature, hide, archive, or restore shows from one place.</CardDescription></div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto">
              <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search podcasts or publishers…" className="pl-9" /></div>
              <select
                aria-label="Sort podcasts"
                value={sort}
                onChange={(event) => setSort(event.target.value as ListSort)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-56"
              >
                <option value="list_order">Client list order</option>
                <option value="audience_desc">Audience: largest first</option>
                <option value="audience_asc">Audience: smallest first</option>
                <option value="rating_desc">Rating: highest first</option>
                <option value="rating_asc">Rating: lowest first</option>
                <option value="recent_desc">Recently published</option>
                <option value="name_asc">Name: A–Z</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ['all', `All ${counts.active}`],
                ['not_reviewed', `To review ${counts.notReviewed}`],
                ['approved', `Approved ${counts.approved}`],
                ['rejected', `Passed ${counts.rejected}`],
                ['archived', `Archived ${counts.archived}`],
              ] as Array<[ListFilter, string]>).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {visiblePage.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 font-medium">No podcasts match this view</p><p className="text-sm text-muted-foreground">Try a different filter or add podcasts from the catalog.</p></div>
          ) : (
            <div className="divide-y rounded-xl border">
              {visiblePage.map((podcast) => {
                const pitchLabel = pitchActionLabel({
                  inActiveOutreach: podcastsInActiveOutreach.has(podcast.id),
                  previouslyContacted: Boolean(podcast.prior_outreach_at),
                })
                return (
                <div key={podcast.podcast_id} className="flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-center">
                  <button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => openPodcastDetails(podcast)} aria-label={`View details for ${podcast.podcast_name}`}>
                    <PodcastArtwork podcast={podcast} />
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{podcast.podcast_name}</p>{podcast.is_featured && <Badge aria-label={`${podcast.podcast_name} is featured`} className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50"><Star className="mr-1 h-3 w-3 fill-current" />Featured</Badge>}{podcast.prior_outreach_at && <Badge aria-label={`${podcast.podcast_name} was previously contacted`} variant="outline" className="border-sky-200 bg-sky-50 text-sky-800"><MailCheck className="mr-1 h-3 w-3" />Previously contacted</Badge>}</div><p className="truncate text-sm text-muted-foreground">{podcast.publisher_name || 'Publisher unavailable'}</p>{podcast.feedback_notes && <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground">Client note: “{podcast.feedback_notes}”</p>}</div>
                  </button>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[500px] lg:items-center">
                    <div><p className="text-xs text-muted-foreground">Audience</p><p className="font-medium">{compactNumber(podcast.audience_size)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Rating</p><p className="font-medium">{podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—'}</p></div>
                    <div>{feedbackBadge(podcast)}</div>
                    <div>{visibilityBadge(podcast.visibility)}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 lg:shrink-0">
                    {podcast.visibility === 'visible' && podcast.feedback_status === 'approved' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={pitchLabel === 'Write Re-pitch' ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 hover:text-amber-950' : undefined}
                        aria-label={`${pitchLabel} for ${podcast.podcast_name}`}
                        onClick={() => setCampaignPrepPodcast(podcast)}
                      >
                        {pitchLabel === 'View Pitch'
                          ? <Eye className="mr-2 h-4 w-4 text-sky-600" />
                          : <PenLine className={`mr-2 h-4 w-4 ${pitchLabel === 'Write Re-pitch' ? 'text-amber-700' : 'text-primary'}`} />}
                        {pitchLabel}
                      </Button>
                    )}
                    <PodcastExternalLink url={podcast.podcast_url} name={podcast.podcast_name} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="outline" size="icon" disabled={pendingPodcastId === podcast.podcast_id}><span className="sr-only">Actions for {podcast.podcast_name}</span>{pendingPodcastId === podcast.podcast_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => openPodcastDetails(podcast)}><FileText className="mr-2 h-4 w-4" />View details &amp; notes</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {podcast.feedback_status !== 'approved' && <DropdownMenuItem onClick={() => void updatePodcast(podcast, { feedback_status: 'approved' }, `${podcast.podcast_name} marked approved.`)}><ThumbsUp className="mr-2 h-4 w-4 text-emerald-600" />Mark approved</DropdownMenuItem>}
                        {podcast.feedback_status !== 'rejected' && <DropdownMenuItem onClick={() => void updatePodcast(podcast, { feedback_status: 'rejected' }, `${podcast.podcast_name} marked passed.`)}><ThumbsDown className="mr-2 h-4 w-4 text-rose-600" />Mark passed</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        {podcast.visibility === 'visible' && <DropdownMenuItem onClick={() => void toggleFeatured(podcast)}><Star className="mr-2 h-4 w-4" />{podcast.is_featured ? 'Remove from featured' : 'Add to featured'}</DropdownMenuItem>}
                        {podcast.visibility === 'archived' ? (
                          <DropdownMenuItem onClick={() => void updatePodcast(podcast, { visibility: 'visible' }, `${podcast.podcast_name} restored to the client list.`)}><RotateCcw className="mr-2 h-4 w-4" />Restore to list</DropdownMenuItem>
                        ) : (
                          <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveTarget(podcast)}><Trash2 className="mr-2 h-4 w-4" />Archive podcast</DropdownMenuItem></>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                )
              })}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>Showing {visiblePage.length} of {resultLabel(filtered.length)}</p>
            {totalPages > 1 && <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div>}
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailPodcast)} onOpenChange={(open) => !open && setDetailPodcast(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {detailPodcast && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-start gap-3 pr-8 text-left">
                  <PodcastArtwork podcast={detailPodcast} />
                  <div className="min-w-0"><SheetTitle>{detailPodcast.podcast_name}</SheetTitle><SheetDescription>{detailPodcast.publisher_name || 'Publisher unavailable'}</SheetDescription></div>
                </div>
              </SheetHeader>
              <div className="flex flex-wrap gap-2">{feedbackBadge(detailPodcast)}{visibilityBadge(detailPodcast.visibility)}{detailPodcast.is_featured && <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50"><Star className="mr-1 h-3 w-3 fill-current" />Featured</Badge>}{detailPodcast.prior_outreach_at && <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-800"><MailCheck className="mr-1 h-3 w-3" />Previously contacted</Badge>}</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 font-semibold">{compactNumber(detailPodcast.audience_size)}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Rating</p><p className="mt-1 font-semibold">{detailPodcast.itunes_rating ? Number(detailPodcast.itunes_rating).toFixed(1) : '—'}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Episodes</p><p className="mt-1 font-semibold">{detailPodcast.episode_count?.toLocaleString() || '—'}</p></div>
              </div>
              <section><h4 className="text-sm font-semibold">About this podcast</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detailPodcast.ai_clean_description || detailPodcast.podcast_description || 'No podcast description is available yet.'}</p></section>
              <section className="rounded-xl border bg-muted/20 p-4"><h4 className="text-sm font-semibold">Client feedback</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{detailPodcast.feedback_notes || (detailPodcast.feedback_status ? 'The client left a decision without a note.' : 'The client has not reviewed this podcast yet.')}</p></section>
              {detailPodcast.prior_outreach_at && <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><MailCheck className="h-4 w-4" />Outreach history</h4><p className="mt-2 text-sm leading-6 text-amber-900/80">This podcast was already handed off for outreach for this client on {formattedDate(detailPodcast.prior_outreach_at)}. You can prepare a re-pitch, but the relationship warning must be reviewed first and any active campaign remains protected.</p></section>}
              <section className="space-y-2"><label htmlFor="podcast-operator-notes" className="text-sm font-semibold">Internal notes</label><Textarea id="podcast-operator-notes" value={operatorNotes} onChange={(event) => setOperatorNotes(event.target.value)} rows={5} maxLength={2_000} placeholder="Add workspace-only context, follow-up ideas, or research notes…" /><p className="text-xs text-muted-foreground">Only workspace managers can see these notes.</p></section>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" disabled={isSavingNotes || operatorNotes.trim() === (detailPodcast.operator_notes || '')} onClick={() => void saveOperatorNotes()}>{isSavingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save internal notes</Button>
                <PodcastExternalLink url={detailPodcast.podcast_url} name={detailPodcast.podcast_name} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader><SheetTitle>Add podcasts</SheetTitle><SheetDescription>Search the existing podcast catalog and add shows without leaving this client.</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-5">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search by podcast or publisher…" className="pl-9" /></div>
            {debouncedCatalogQuery.length < 2 ? (
              <div className="rounded-xl border border-dashed p-8 text-center"><Library className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">Search the shared podcast catalog</p><p className="text-sm text-muted-foreground">Enter at least two characters to find shows already researched by the platform.</p></div>
            ) : catalogSearchQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : catalogSearchQuery.error ? (
              <div className="rounded-xl border border-destructive/30 p-5"><p className="font-medium">Catalog search failed</p><p className="text-sm text-muted-foreground">{catalogSearchQuery.error instanceof Error ? catalogSearchQuery.error.message : 'Try again.'}</p></div>
            ) : catalogResults.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center"><Search className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-2 font-medium">No catalog matches</p><p className="text-sm text-muted-foreground">Run fresh discovery when the show is not already in the database.</p></div>
            ) : (
              <div className="space-y-2">
                {catalogResults.map((podcast: ClientShortlistCatalogPodcast) => (
                  <label key={podcast.podcast_id} className={cn('flex items-center gap-3 rounded-xl border p-3', podcast.already_added ? 'bg-muted/40 opacity-70' : 'cursor-pointer hover:bg-muted/30')}>
                    <Checkbox checked={selectedCatalogIds.has(podcast.podcast_id)} disabled={podcast.already_added} onCheckedChange={(checked) => setSelectedCatalogIds((current) => { const next = new Set(current); if (checked) next.add(podcast.podcast_id); else next.delete(podcast.podcast_id); return next })} aria-label={`Select ${podcast.podcast_name}`} />
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">{podcast.podcast_image_url ? <img src={podcast.podcast_image_url} alt="" className="h-full w-full object-cover" /> : <Radio className="h-5 w-5 text-muted-foreground" />}</div>
                    <div className="min-w-0 flex-1"><p className="truncate font-medium">{podcast.podcast_name}</p><p className="truncate text-xs text-muted-foreground">{podcast.publisher_name || 'Publisher unavailable'} · {compactNumber(podcast.audience_size)} estimated listeners</p></div>
                    {podcast.already_added && <Badge variant="outline">{podcast.existing_visibility === 'archived' ? 'Archived' : 'Already added'}</Badge>}
                  </label>
                ))}
              </div>
            )}
            <div className="sticky bottom-0 space-y-3 border-t bg-background pt-4">
              <Button className="w-full" disabled={selectedCatalog.length === 0 || isAdding} onClick={() => void addSelectedCatalog()}>{isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />}Add {selectedCatalog.length || ''} selected</Button>
              <Button asChild variant="outline" className="w-full"><Link to={databaseHref}>Browse with filters<Database className="ml-2 h-3.5 w-3.5" /></Link></Button>
              <Button asChild variant="outline" className="w-full"><Link to={finderHref}>Run fresh weekly discovery<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ClientCampaignPrepDialog
        open={Boolean(activeCampaignPrepPodcast)}
        onOpenChange={(open) => { if (!open) setCampaignPrepPodcast(null) }}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName}
        clientBio={clientBio}
        viewerRole={viewerRole}
        campaignHref={campaignHref}
        relationshipsHref={relationshipsHref}
        billingHref={billingHref}
        podcast={activeCampaignPrepPodcast}
        onArchive={() => {
          if (!activeCampaignPrepPodcast) return
          setArchiveTarget(activeCampaignPrepPodcast)
          setCampaignPrepPodcast(null)
        }}
      />

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Archive this podcast?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.podcast_name} will disappear from the client dashboard, but its decisions and campaign history remain available for dedupe. You can restore it later.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep podcast</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void confirmArchive()}>Archive podcast</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
