import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { addClientShortlistPodcasts, type ClientShortlistPodcastInput } from '@/services/clientShortlist'
import {
  addWorkspaceProspectPodcasts,
  getWorkspaceProspects,
  type ProspectShortlistPodcastInput,
} from '@/services/prospectDashboards'
import { getWorkspaceClients } from '@/services/clients'
import {
  getWorkspacePodcastCatalog,
  type WorkspacePodcastCatalogActivityFilter,
  type WorkspacePodcastCatalogAudienceFilter,
  type WorkspacePodcastCatalogContactFilter,
  type WorkspacePodcastCatalogItem,
  type WorkspacePodcastCatalogSort,
} from '@/services/workspacePodcastCatalog'
import { safeExternalUrl } from '@/lib/externalUrl'
import { PodcastCatalogDetailsDialog } from '@/components/workspace/PodcastCatalogDetailsDialog'
import { relationshipBadge } from '@/lib/relationshipLabels'
import { listHostRelationships } from '@/services/hostRelationships'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'

const PAGE_SIZE = 24
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

interface WorkspacePodcastDatabaseProps {
  platformWorkspaceId?: string
}

function podcastInitials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
}

function categoryNames(podcast: WorkspacePodcastCatalogItem): string[] {
  if (!Array.isArray(podcast.podcast_categories)) return []
  return podcast.podcast_categories.flatMap((category) => {
    if (typeof category === 'string') return category.trim() ? [category.trim()] : []
    return category?.category_name?.trim() ? [category.category_name.trim()] : []
  })
}

function shortlistCategories(podcast: WorkspacePodcastCatalogItem) {
  return categoryNames(podcast).map((categoryName) => ({
    category_id: `catalog-${categoryName.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`.slice(0, 200),
    category_name: categoryName.slice(0, 200),
  }))
}

function toShortlistPodcast(podcast: WorkspacePodcastCatalogItem): ClientShortlistPodcastInput {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    itunes_rating: podcast.itunes_rating,
    episode_count: podcast.episode_count,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    podcast_categories: shortlistCategories(podcast),
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.free_podscan_email,
    rss_feed: podcast.rss_feed,
  }
}

/*
 * The prospect shortlist takes a narrower row than a client's: no contact
 * address, no feed, no language or region. That is the point of the two shapes
 * — a prospect dashboard is something you send to someone who has not signed
 * anything yet, so the things worth protecting are not gathered for it.
 */
function toProspectPodcast(podcast: WorkspacePodcastCatalogItem): ProspectShortlistPodcastInput {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    itunes_rating: podcast.itunes_rating,
    episode_count: podcast.episode_count,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    podcast_categories: shortlistCategories(podcast),
  }
}

function formattedDate(value: string | null) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

const WorkspacePodcastDatabase = ({ platformWorkspaceId }: WorkspacePodcastDatabaseProps) => {
  const [searchParams] = useSearchParams()
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const canAddToClient = isPlatformWorkspace
    || isPlatformAdmin
    || membership?.role === 'owner'
    || membership?.role === 'admin'
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const targetClientId = UUID_PATTERN.test(requestedClientId) ? requestedClientId : ''

  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [contact, setContact] = useState<WorkspacePodcastCatalogContactFilter>('all')
  const [activity, setActivity] = useState<WorkspacePodcastCatalogActivityFilter>('active')
  const [audience, setAudience] = useState<WorkspacePodcastCatalogAudienceFilter>('all')
  const [sort, setSort] = useState<WorkspacePodcastCatalogSort>('audience')
  const [page, setPage] = useState(1)
  const [selectedPodcasts, setSelectedPodcasts] = useState<Map<string, WorkspacePodcastCatalogItem>>(new Map())
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [detailsPodcast, setDetailsPodcast] = useState<WorkspacePodcastCatalogItem | null>(null)
  const [selectedClientId, setSelectedClientId] = useState(targetClientId)
  // Which kind of thing the selection is being added to. A prospect dashboard
  // is a pitch to someone who is not a client yet, and the same shows are
  // exactly what you want to put in front of them.
  const [addTarget, setAddTarget] = useState<'client' | 'prospect'>('client')
  const [selectedProspectId, setSelectedProspectId] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const catalogQuery = useQuery({
    queryKey: [
      'workspace-podcast-catalog',
      user?.id || 'unknown',
      workspaceId,
      search,
      category,
      contact,
      activity,
      audience,
      sort,
      page,
    ],
    queryFn: () => getWorkspacePodcastCatalog(workspaceId, {
      search,
      category: category === 'all' ? undefined : category,
      contact,
      activity,
      audience,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    enabled: validWorkspaceId,
    retry: false,
    // Catalogue rows change when somebody adds a show, not continuously, so a
    // few minutes of staleness costs nothing and makes going back to a page
    // already seen instant rather than another round trip.
    staleTime: 5 * 60_000,
    placeholderData: (previousData) => previousData,
  })

  /**
   * Fetch the next page while this one is being read.
   *
   * Paging is the one move an operator makes without thinking, and every Next
   * used to wait on a round trip. The request is identical to the one the click
   * would make, so it lands in the same cache slot and the click resolves from
   * memory. Skipped on the last page and while the current one is still in
   * flight, so it never competes with the request somebody is waiting on.
   */
  const totalPages = catalogQuery.data?.pagination.total_pages ?? 1
  useEffect(() => {
    if (!validWorkspaceId || catalogQuery.isFetching || page >= totalPages) return
    const nextPage = page + 1
    void queryClient.prefetchQuery({
      queryKey: [
        'workspace-podcast-catalog',
        user?.id || 'unknown',
        workspaceId,
        search,
        category,
        contact,
        activity,
        audience,
        sort,
        nextPage,
      ],
      queryFn: () => getWorkspacePodcastCatalog(workspaceId, {
        search,
        category: category === 'all' ? undefined : category,
        contact,
        activity,
        audience,
        sort,
        page: nextPage,
        pageSize: PAGE_SIZE,
      }),
      staleTime: 5 * 60_000,
    })
  }, [
    queryClient, validWorkspaceId, catalogQuery.isFetching, page, totalPages,
    user?.id, workspaceId, search, category, contact, activity, audience, sort,
  ])

  /**
   * History with these hosts, so the catalogue is not read cold.
   *
   * The same podcast is a row in the database and a relationship in the book,
   * keyed by the same podcast_id — but only the book knew that this host had
   * already passed, or was mid conversation, or had been marked do not
   * contact. Someone building a shortlist saw none of it and could pitch a
   * host the workspace had already burned.
   *
   * One list for the workspace rather than a lookup per card, and a failure
   * leaves the catalogue exactly as it was rather than blocking it.
   */
  const relationshipsQuery = useQuery({
    queryKey: ['workspace-host-relationships', workspaceId, 'catalog-labels'],
    queryFn: () => listHostRelationships(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
    retry: false,
  })
  const relationshipsByPodcastId = useMemo(() => {
    const index = new Map<string, ReturnType<typeof relationshipBadge>>()
    for (const row of relationshipsQuery.data ?? []) {
      const badge = relationshipBadge(row)
      if (badge) index.set(row.podcast_id, badge)
    }
    return index
  }, [relationshipsQuery.data])

  const clientsQuery = useQuery({
    queryKey: ['workspace-podcast-catalog', user?.id || 'unknown', workspaceId, 'clients'],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: validWorkspaceId && canAddToClient && (addDialogOpen || Boolean(targetClientId)),
    retry: false,
  })

  const prospectsQuery = useQuery({
    queryKey: ['workspace-podcast-catalog', user?.id || 'unknown', workspaceId, 'prospects'],
    queryFn: () => getWorkspaceProspects(workspaceId),
    enabled: validWorkspaceId && canAddToClient && addDialogOpen && addTarget === 'prospect',
    retry: false,
  })

  const addMutation = useMutation({
    mutationFn: async () => {
      const podcasts = Array.from(selectedPodcasts.values())
      if (addTarget === 'prospect') {
        if (!selectedProspectId) throw new Error('Choose a prospect first.')
        return await addWorkspaceProspectPodcasts(
          workspaceId,
          selectedProspectId,
          podcasts.map(toProspectPodcast),
        )
      }
      if (!selectedClientId) throw new Error('Choose a client first.')
      return await addClientShortlistPodcasts(
        workspaceId,
        selectedClientId,
        podcasts.map(toShortlistPodcast),
      )
    },
    onSuccess: (result) => {
      if (addTarget === 'prospect') {
        const prospect = availableProspects.find((candidate) => candidate.id === selectedProspectId)
        if (result.added > 0) {
          toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} to ${prospect?.prospect_name || 'the prospect dashboard'}.`)
        } else {
          toast.info('Those podcasts are already on this prospect dashboard.')
        }
        // Adding to a published dashboard takes it back to review rather than
        // changing what a prospect is looking at while they look at it.
        if ('unpublished_for_review' in result && result.unpublished_for_review) {
          toast.info('The dashboard was unpublished so you can review it before sending again.')
        }
      } else {
        const client = clientsQuery.data?.find((candidate) => candidate.id === selectedClientId)
        if (result.added > 0) {
          toast.success(`Added ${result.added} podcast${result.added === 1 ? '' : 's'} to ${client?.name || 'the client shortlist'}.`)
        } else {
          toast.info('Those podcasts are already on this client shortlist.')
        }
      }
      setSelectedPodcasts(new Map())
      setSelectedClientId(targetClientId)
      setAddDialogOpen(false)
      void catalogQuery.refetch()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The podcasts could not be added.')
    },
  })

  const catalog = catalogQuery.data
  const podcasts = catalog?.items || []
  const activeClients = (clientsQuery.data || []).filter((client) => client.status === 'active')
  // Archived dashboards are not somewhere anything should be added to.
  const availableProspects = (prospectsQuery.data?.dashboards || [])
    .filter((prospect) => prospect.lifecycle_status !== 'archived')
  const targetClient = activeClients.find((client) => client.id === targetClientId) || null
  const pagePodcastIds = podcasts.map((podcast) => podcast.podcast_id)
  const allPageSelected = pagePodcastIds.length > 0
    && pagePodcastIds.every((podcastId) => selectedPodcasts.has(podcastId))
  const filtersActive = Boolean(
    search
    || category !== 'all'
    || contact !== 'all'
    || activity !== 'active'
    || audience !== 'all'
  )

  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceName: catalog?.workspace.name || 'Client workspace',
        logoUrl: null,
        baseHref,
      }
    : undefined

  const togglePodcast = (podcast: WorkspacePodcastCatalogItem, checked: boolean) => {
    setSelectedPodcasts((current) => {
      const next = new Map(current)
      if (checked) next.set(podcast.podcast_id, podcast)
      else next.delete(podcast.podcast_id)
      return next
    })
  }

  const togglePage = (checked: boolean) => {
    setSelectedPodcasts((current) => {
      const next = new Map(current)
      podcasts.forEach((podcast) => {
        if (checked) next.set(podcast.podcast_id, podcast)
        else next.delete(podcast.podcast_id)
      })
      return next
    })
  }

  const resetFilters = () => {
    setSearchInput('')
    setSearch('')
    setCategory('all')
    setContact('all')
    setActivity('active')
    setAudience('all')
    setSort('audience')
    setPage(1)
  }

  useEffect(() => {
    if (!addDialogOpen || clientsQuery.isLoading) return
    if (selectedClientId && !activeClients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId('')
    }
  }, [activeClients, addDialogOpen, clientsQuery.isLoading, selectedClientId])

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email)
      toast.success('Email copied.')
    } catch {
      toast.error('The email could not be copied.')
    }
  }

  if (!validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>Your account does not have an active workspace.</CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        {/* A banner explaining the page every time it is opened is a cost paid
            by the people who already know — which, after the first visit, is
            everyone. The title and the badge carry it; the sentence that used
            to sit under them is on the badge instead. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Podcast Database</h1>
            <Badge
              variant="outline"
              className="border-sky-200 bg-sky-50 text-sky-900"
              title="One catalog for every client. A show added to any client or prospect shortlist becomes reusable across the Database."
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />Shared across every workspace
            </Badge>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to={`${baseHref}/podcast-finder`}>
              <Plus className="mr-2 h-4 w-4" />Find and contribute podcasts
            </Link>
          </Button>
        </div>

        {targetClient && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Browsing for {targetClient.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">Select podcasts here and they’ll be ready to add to this client’s approval list.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={`${baseHref}/clients/${encodeURIComponent(targetClient.id)}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to client</Link>
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Search the shared catalog</CardTitle>
            <CardDescription>Search show details, topics, audiences, or conversation ideas. Scout uses semantic matching when available and always falls back safely to catalog keywords; workspace client data remains private.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(5,minmax(140px,180px))]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search podcasts"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search a show, host, topic, or ideal conversation"
                  className="pl-9"
                />
              </div>
              <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1) }}>
                <SelectTrigger aria-label="Category"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="all">All categories</SelectItem>
                  {(catalog?.categories || []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={contact} onValueChange={(value: WorkspacePodcastCatalogContactFilter) => { setContact(value); setPage(1) }}>
                <SelectTrigger aria-label="Email availability"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  <SelectItem value="any">Has an email</SelectItem>
                  <SelectItem value="free">Free email</SelectItem>
                  <SelectItem value="direct">👑 Verified direct email</SelectItem>
                  <SelectItem value="none">No email yet</SelectItem>
                </SelectContent>
              </Select>
              <Select value={activity} onValueChange={(value: WorkspacePodcastCatalogActivityFilter) => { setActivity(value); setPage(1) }}>
                <SelectTrigger aria-label="Publishing recency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active shows</SelectItem>
                  <SelectItem value="last_30_days">Published in 30 days</SelectItem>
                  <SelectItem value="last_90_days">Published in 90 days</SelectItem>
                  <SelectItem value="last_180_days">Published in 6 months</SelectItem>
                  <SelectItem value="last_year">Published in 1 year</SelectItem>
                  <SelectItem value="all">All shows</SelectItem>
                </SelectContent>
              </Select>
              <Select value={audience} onValueChange={(value: WorkspacePodcastCatalogAudienceFilter) => { setAudience(value); setPage(1) }}>
                <SelectTrigger aria-label="Audience size"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any audience size</SelectItem>
                  <SelectItem value="under_10k">Under 10K</SelectItem>
                  <SelectItem value="10k_50k">10K–50K</SelectItem>
                  <SelectItem value="50k_250k">50K–250K</SelectItem>
                  <SelectItem value="250k_plus">250K+</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(value: WorkspacePodcastCatalogSort) => { setSort(value); setPage(1) }}>
                <SelectTrigger aria-label="Sort podcasts"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="audience">Largest audience</SelectItem>
                  <SelectItem value="community">Most used</SelectItem>
                  <SelectItem value="recent">Most recently active</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                {canAddToClient && (
                  <>
                    <Checkbox
                      id="select-catalog-page"
                      checked={allPageSelected}
                      onCheckedChange={(checked) => togglePage(checked === true)}
                      disabled={podcasts.length === 0}
                    />
                    <Label htmlFor="select-catalog-page" className="text-sm">Select this page</Label>
                  </>
                )}
                {filtersActive && <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {catalog?.pagination.total.toLocaleString() || 0} result{catalog?.pagination.total === 1 ? '' : 's'}
                </p>
                <Button variant="ghost" size="icon" aria-label="Refresh podcast database" onClick={() => void catalogQuery.refetch()} disabled={catalogQuery.isFetching}>
                  <RefreshCw className={`h-4 w-4 ${catalogQuery.isFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedPodcasts.size > 0 && (
          <div className="sticky top-24 z-20 flex flex-col gap-3 rounded-xl border border-primary/20 bg-background/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{selectedPodcasts.size} podcast{selectedPodcasts.size === 1 ? '' : 's'} selected</p>
              <p className="text-xs text-muted-foreground">Add the selection to one client shortlist. Existing entries are skipped safely.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSelectedPodcasts(new Map())}>Clear</Button>
              <Button onClick={() => { setSelectedClientId(targetClientId); setAddDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Add to client</Button>
            </div>
          </div>
        )}

        {catalogQuery.isLoading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-72 rounded-xl" />)}
          </div>
        ) : catalogQuery.error ? (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
              <Database className="h-10 w-10 text-muted-foreground" />
              <div><p className="font-semibold">Podcast Database could not be loaded</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{catalogQuery.error instanceof Error ? catalogQuery.error.message : 'Check your connection and try again.'}</p></div>
              <Button variant="outline" onClick={() => void catalogQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : podcasts.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
              <Search className="h-10 w-10 text-muted-foreground" />
              <div><p className="font-semibold">No podcasts match these filters</p><p className="mt-1 text-sm text-muted-foreground">Reset the filters or use Podcast Finder to discover a new show.</p></div>
              <div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={resetFilters}>Reset filters</Button><Button asChild><Link to={`${baseHref}/podcast-finder`}>Open Podcast Finder</Link></Button></div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {podcasts.map((podcast) => {
              const categories = categoryNames(podcast)
              const publicUrl = safeExternalUrl(podcast.podcast_url || podcast.website || '')
              const primaryEmail = podcast.direct_email || podcast.free_podscan_email
              const selected = selectedPodcasts.has(podcast.podcast_id)
              const relationshipBadgeFor = relationshipsByPodcastId.get(podcast.podcast_id)
              return (
                <Card key={podcast.podcast_id} className={`overflow-hidden transition-colors ${selected ? 'border-primary/50 bg-primary/[0.025]' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      {canAddToClient && (
                        <Checkbox
                          aria-label={`Select ${podcast.podcast_name}`}
                          checked={selected}
                          onCheckedChange={(checked) => togglePodcast(podcast, checked === true)}
                          className="mt-1"
                        />
                      )}
                      <Avatar className="h-16 w-16 shrink-0 rounded-xl border">
                        {podcast.podcast_image_url && <AvatarImage src={podcast.podcast_image_url} alt="" className="object-cover" />}
                        <AvatarFallback className="rounded-xl text-lg font-bold">{podcastInitials(podcast.podcast_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="truncate text-lg font-semibold">{podcast.podcast_name}</h2>
                            <p className="truncate text-sm text-muted-foreground">{podcast.host_name || podcast.publisher_name || 'Publisher not listed'}</p>
                            {relationshipBadgeFor && (
                              <Badge variant="outline" className={`mt-1.5 font-normal ${relationshipBadgeFor.className}`}>
                                {relationshipBadgeFor.label}
                              </Badge>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setDetailsPodcast(podcast)}
                            >
                              See details
                            </Button>
                            {publicUrl && <Button asChild variant="ghost" size="icon" className="shrink-0"><a href={publicUrl} target="_blank" rel="noreferrer" aria-label={`Open ${podcast.podcast_name}`}><ExternalLink className="h-4 w-4" /></a></Button>}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {categories.slice(0, 3).map((name) => <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>)}
                          {categories.length > 3 && <Badge variant="outline">+{categories.length - 3}</Badge>}
                        </div>
                      </div>
                    </div>

                    <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{podcast.podcast_description || 'No public show description is available yet.'}</p>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Audience</p><p className="mt-1 text-sm font-semibold">{podcast.audience_size === null ? '—' : compactNumber.format(podcast.audience_size)}</p></div>
                      <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Episodes</p><p className="mt-1 text-sm font-semibold">{podcast.episode_count?.toLocaleString() || '—'}</p></div>
                      <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rating</p><p className="mt-1 text-sm font-semibold">{podcast.itunes_rating ? `${Number(podcast.itunes_rating).toFixed(1)} / 5` : '—'}</p></div>
                      <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Community</p><p className="mt-1 text-sm font-semibold">{podcast.shortlist_uses.toLocaleString()} use{podcast.shortlist_uses === 1 ? '' : 's'}</p></div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        {podcast.direct_email ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className="border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100">👑 Verified direct</Badge>
                            <span className="truncate text-sm">{podcast.direct_email}</span>
                            {/* When somebody confirmed it. A direct address
                                that was checked two years ago is a different
                                proposition from one checked last week. */}
                            <span className="text-xs text-muted-foreground">
                              {podcast.direct_verified_at ? `Paid for and confirmed ${formattedDate(podcast.direct_verified_at)}` : 'Paid for, not yet confirmed'}
                            </span>
                          </div>
                        ) : podcast.free_podscan_email ? (
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Free email</Badge>
                            <span className="truncate text-sm">{podcast.free_podscan_email}</span>
                            <span className="text-xs text-muted-foreground">Free, published by the show and not confirmed</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No usable public email yet</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {primaryEmail && <Button variant="outline" size="sm" onClick={() => void copyEmail(primaryEmail)}><Copy className="mr-2 h-3.5 w-3.5" />Copy</Button>}
                        {canAddToClient && <Button size="sm" variant={selected ? 'secondary' : 'outline'} onClick={() => togglePodcast(podcast, !selected)}>{selected ? <><Check className="mr-2 h-3.5 w-3.5" />Selected</> : <><Plus className="mr-2 h-3.5 w-3.5" />Select</>}</Button>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {catalog && catalog.pagination.total_pages > 1 && (
          <div className="flex flex-col items-center justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">Page {catalog.pagination.page.toLocaleString()} of {catalog.pagination.total_pages.toLocaleString()}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1 || catalogQuery.isFetching} onClick={() => { setPage((current) => Math.max(1, current - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
              <Button variant="outline" disabled={page >= catalog.pagination.total_pages || catalogQuery.isFetching} onClick={() => { setPage((current) => current + 1); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </div>
        )}

        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">How the database grows</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Every show anyone adds to a shortlist stays here, so the next person searching finds it already researched. Public show details and listed inboxes are shared across the workspace. What you write about a client — their profile, your notes, their campaign activity — is never shared.</p>
            </div>
            <Button asChild variant="outline" className="shrink-0"><Link to={`${baseHref}/podcast-finder`}>Open Finder<ExternalLink className="ml-2 h-4 w-4" /></Link></Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!addMutation.isPending) setAddDialogOpen(open) }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add {selectedPodcasts.size} podcast{selectedPodcasts.size === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>{addTarget === 'prospect'
              ? 'The selected shows will be added to the prospect’s dashboard. Existing entries are skipped.'
              : 'The selected shows will be added to the client’s review shortlist. Existing entries are skipped.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* The same shows serve both: a client shortlist is work already
                sold, a prospect dashboard is the pitch for work that is not. */}
            <div className="space-y-2">
              <Label>Add to</Label>
              {/* secondary and outline read almost the same here, so the chosen
                  side did not look chosen. Filled plus a tick, the way selecting
                  a podcast already looks on this page. */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={addTarget === 'client' ? 'default' : 'outline'}
                  aria-pressed={addTarget === 'client'}
                  onClick={() => setAddTarget('client')}
                >
                  {addTarget === 'client' && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                  A client
                </Button>
                <Button
                  type="button"
                  variant={addTarget === 'prospect' ? 'default' : 'outline'}
                  aria-pressed={addTarget === 'prospect'}
                  onClick={() => setAddTarget('prospect')}
                >
                  {addTarget === 'prospect' && <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
                  A prospect
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {addTarget === 'prospect'
                  ? 'Adding to a prospect dashboard — a pitch for someone who is not a client yet.'
                  : 'Adding to a client’s review shortlist.'}
              </p>
            </div>
            {addTarget === 'prospect' ? (
              <div className="space-y-2">
                <Label htmlFor="podcast-database-prospect">Prospect</Label>
                {prospectsQuery.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : prospectsQuery.error ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{prospectsQuery.error instanceof Error ? prospectsQuery.error.message : 'Prospects could not be loaded.'}</div>
                ) : availableProspects.length === 0 ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">No prospect dashboards are available in this workspace.</div>
                ) : (
                  <Select value={selectedProspectId} onValueChange={setSelectedProspectId}>
                    <SelectTrigger id="podcast-database-prospect" aria-label="Prospect"><SelectValue placeholder="Choose a prospect" /></SelectTrigger>
                    <SelectContent>{availableProspects.map((prospect) => <SelectItem key={prospect.id} value={prospect.id}>{prospect.prospect_name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            ) : (
            <div className="space-y-2">
              <Label htmlFor="podcast-database-client">Client</Label>
              {clientsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : clientsQuery.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{clientsQuery.error instanceof Error ? clientsQuery.error.message : 'Clients could not be loaded.'}</div>
              ) : activeClients.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">No active clients are available in this workspace.</div>
              ) : (
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger id="podcast-database-client" aria-label="Client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                  <SelectContent>{activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            )}
            <div className="rounded-xl bg-muted/50 p-4">
              <p className="text-sm font-medium">What happens next</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{addTarget === 'prospect'
                ? 'The shows appear on the prospect’s dashboard for you to review and order before it is sent. A published dashboard is unpublished so the change is not made under the reader.'
                : 'The shows appear in the client’s Podcasts section for review, research, contact selection, and campaign preparation. This action does not send outreach.'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={addMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || (addTarget === 'prospect'
                ? !selectedProspectId || availableProspects.length === 0
                : !selectedClientId || activeClients.length === 0)}
            >{addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{addTarget === 'prospect' ? 'Add to dashboard' : 'Add to shortlist'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PodcastCatalogDetailsDialog
        podcast={detailsPodcast}
        relationship={detailsPodcast ? relationshipsByPodcastId.get(detailsPodcast.podcast_id) ?? null : null}
        onClose={() => setDetailsPodcast(null)}
      />
    </WorkspaceLayout>
  )
}

export default WorkspacePodcastDatabase
