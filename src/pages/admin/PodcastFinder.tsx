import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Layers3,
  ListPlus,
  Loader2,
  Mail,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { repairableExternalUrl } from '@/lib/externalUrl'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  calculateOutreachPriority,
  compositeResearchScore,
  DISCOVERY_STRATEGIES,
  getResearchTier,
  mergeResearchResults,
  normalizePodscanQuery,
  tierLabel,
  type DiscoveryStrategy,
  type ResearchResult,
  type ResearchTier,
} from '@/lib/podcastResearch'
import { cn } from '@/lib/utils'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref, workspaceModuleHref } from '@/lib/workspaceRoutes'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'
import {
  getClients,
  getWorkspaceClients,
  getWorkspaceResearchContext,
  type WorkspaceResearchContext,
} from '@/services/clients'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { addClientShortlistPodcasts, type ClientShortlistPodcastInput } from '@/services/clientShortlist'
import {
  addWorkspaceProspectPodcasts,
  getWorkspaceProspect,
  type ProspectShortlistPodcastInput,
} from '@/services/prospectDashboards'
import {
  getChartCategories,
  getChartCountries,
  getPodcastById,
  getTopChartPodcasts,
  searchPodcastsWithMeta,
  type ChartCategory,
  type ChartCountry,
  type PodcastData,
  type PodscanRateLimit,
  type SearchOptions,
} from '@/services/podscan'
import { generatePodcastQueries } from '@/services/queryGeneration'
import { toast } from 'sonner'

const SCOPE_STORAGE_KEY = 'podcast-finder-client-scope-v3'
const RESULTS_PER_PAGE = 50

type ResultTab = 'all' | ResearchTier
type ResultSort = 'priority' | 'relevance' | 'audience' | 'recent'
type GuestFilter = 'true' | 'any'

interface DiscoveryProgress {
  completed: number
  total: number
  message: string
}

interface RunScope {
  id: string
  workspaceId: string
  clientId: string
  strategy: DiscoveryStrategy
  startedAt: string
  completedAt?: string
  rawResults: number
  apiCalls: number
  errors: number
}

interface StoredScope {
  workspaceId?: string
  clientId?: string
  strategy?: DiscoveryStrategy
}

interface FinderResearchContext extends WorkspaceResearchContext {
  current_shortlist_count?: number
}

function readStoredScope(): StoredScope {
  try {
    const value = window.sessionStorage.getItem(SCOPE_STORAGE_KEY)
    if (!value) return {}
    return JSON.parse(value) as StoredScope
  } catch {
    return {}
  }
}

function compactNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function tierClasses(tier: ResearchTier): string {
  if (tier === 'a') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (tier === 'b') return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
  if (tier === 'c') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
  if (tier === 'excluded') return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
  return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
}

function resultReason(result: ResearchResult): string {
  if (result.relevanceReasoning) return result.relevanceReasoning
  if (result.matchedQueries.length > 0) return `Matched ${result.matchedQueries[0]}`
  return `Discovered through ${result.sources.join(', ')}`
}

function toShortlistPodcast(result: ResearchResult): ClientShortlistPodcastInput {
  const podcast = result.podcast
  return {
    podcast_id: podcast.podcast_id,
    podscan_podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    episode_count: podcast.episode_count,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average
      ? Number.parseFloat(podcast.reach.itunes.itunes_rating_average)
      : undefined,
    audience_size: podcast.reach?.audience_size,
    last_posted_at: podcast.last_posted_at,
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.reach?.email,
    rss_feed: podcast.rss_url,
    podcast_categories: podcast.podcast_categories,
    compatibility_score: result.relevanceScore === null ? null : result.relevanceScore / 10,
    compatibility_reasoning: result.relevanceReasoning,
  }
}

function toProspectShortlistPodcast(result: ResearchResult): ProspectShortlistPodcastInput {
  const podcast = result.podcast
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    // The prospect endpoint validates these, because the dashboard it builds is
    // published. Podscan returns websites typed without a scheme, so passing
    // them through refused the whole batch over one result's untidy address.
    // The client mapper above deliberately keeps the raw value: that endpoint
    // stores what it is given, and a shortlist is not published to anyone.
    podcast_image_url: repairableExternalUrl(podcast.podcast_image_url),
    podcast_url: repairableExternalUrl(podcast.podcast_url),
    publisher_name: podcast.publisher_name,
    episode_count: podcast.episode_count,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average
      ? Number.parseFloat(podcast.reach.itunes.itunes_rating_average)
      : undefined,
    audience_size: podcast.reach?.audience_size,
    last_posted_at: podcast.last_posted_at,
    podcast_categories: podcast.podcast_categories,
    relevance_score: result.relevanceScore,
    relevance_reason: result.relevanceReasoning,
  }
}

interface PodcastFinderProps {
  fixedClientId?: string
  initialClientId?: string
  initialProspectId?: string
  platformWorkspaceId?: string
  workspaceScoped?: boolean
}

export default function PodcastFinder({
  fixedClientId,
  initialClientId,
  initialProspectId,
  platformWorkspaceId,
  workspaceScoped = false,
}: PodcastFinderProps = {}) {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const storedScope = useMemo(readStoredScope, [])
  const isClientBound = fixedClientId !== undefined
  const isProspectBound = initialProspectId !== undefined
  const isTargetBound = isClientBound || isProspectBound
  const isWorkspaceScoped = isTargetBound || workspaceScoped || platformWorkspaceId !== undefined
  const isClientSelectable = isWorkspaceScoped && !isTargetBound
  const fixedWorkspaceId = (platformWorkspaceId || workspace?.id || '').toLowerCase()
  const canonicalFixedClientId = (fixedClientId || '').toLowerCase()
  const canonicalProspectId = (initialProspectId || '').toLowerCase()
  const fixedTargetId = isProspectBound ? canonicalProspectId : canonicalFixedClientId
  const requestedClientId = (initialClientId || '').toLowerCase()
  const storedScopedClientId = storedScope.workspaceId?.toLowerCase() === fixedWorkspaceId
    ? storedScope.clientId || ''
    : ''
  const [workspaceId, setWorkspaceId] = useState(isWorkspaceScoped ? fixedWorkspaceId : storedScope.workspaceId || '')
  const [clientId, setClientId] = useState(
    isTargetBound
      ? fixedTargetId
      : isClientSelectable
        ? requestedClientId || storedScopedClientId
        : storedScope.clientId || '',
  )
  const [strategy, setStrategy] = useState<DiscoveryStrategy>(storedScope.strategy || 'balanced')
  const [language, setLanguage] = useState('en')
  const [region, setRegion] = useState('US')
  const [activityWindow, setActivityWindow] = useState('180')
  const [guestFilter, setGuestFilter] = useState<GuestFilter>('true')
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [minEpisodes, setMinEpisodes] = useState('10')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [queries, setQueries] = useState<string[]>([])
  const [customQuery, setCustomQuery] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null)
  const [runScope, setRunScope] = useState<RunScope | null>(null)
  const [results, setResults] = useState<ResearchResult[]>([])
  const [rateLimit, setRateLimit] = useState<PodscanRateLimit | null>(null)
  const [isScoring, setIsScoring] = useState(false)
  const [scoringProgress, setScoringProgress] = useState<DiscoveryProgress | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tierOverrides, setTierOverrides] = useState<Record<string, Exclude<ResearchTier, 'excluded'>>>({})
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<ResultTab>('all')
  const [resultSearch, setResultSearch] = useState('')
  const [resultSort, setResultSort] = useState<ResultSort>('priority')
  const [contactableOnly, setContactableOnly] = useState(false)
  const [hideExisting, setHideExisting] = useState(true)
  const [addedPodcastIds, setAddedPodcastIds] = useState<Set<string>>(new Set())
  const [resultPage, setResultPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [isEnriching, setIsEnriching] = useState(false)
  const [scopeResetOpen, setScopeResetOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [showChartDiscovery, setShowChartDiscovery] = useState(false)
  const [chartCountries, setChartCountries] = useState<ChartCountry[]>([])
  const [chartCategories, setChartCategories] = useState<ChartCategory[]>([])
  const [chartPlatform, setChartPlatform] = useState<'apple' | 'spotify'>('apple')
  const [chartCountry, setChartCountry] = useState('us')
  const [chartCategory, setChartCategory] = useState('')
  const [isLoadingChartOptions, setIsLoadingChartOptions] = useState(false)
  const [isAddingChartResults, setIsAddingChartResults] = useState(false)

  const workspacesQuery = useQuery({
    queryKey: ['podcast-research', user?.id || 'unknown', 'workspaces'],
    queryFn: listPodcastResearchWorkspaces,
    enabled: !isWorkspaceScoped,
    staleTime: 30_000,
  })

  const clientsQuery = useQuery({
    queryKey: ['podcast-research', user?.id || 'unknown', 'workspace', workspaceId, 'clients'],
    queryFn: () => getClients({ workspaceId, status: 'active' }),
    enabled: !isWorkspaceScoped && Boolean(workspaceId),
    staleTime: 30_000,
  })

  const scopedClientsQuery = useQuery({
    queryKey: ['podcast-research', user?.id || 'unknown', 'workspace', fixedWorkspaceId, 'client-options'],
    queryFn: () => getWorkspaceClients(fixedWorkspaceId),
    enabled: isClientSelectable && Boolean(fixedWorkspaceId),
    staleTime: 30_000,
    retry: false,
  })

  const researchContextQueryKey = [
    'podcast-research',
    user?.id || 'unknown',
    'workspace',
    workspaceId,
    isProspectBound ? 'prospect' : 'client',
    clientId,
  ] as const
  const researchContextQuery = useQuery({
    queryKey: researchContextQueryKey,
    queryFn: async (): Promise<FinderResearchContext> => {
      if (!isProspectBound) return getWorkspaceResearchContext(workspaceId, clientId)
      const detail = await getWorkspaceProspect(workspaceId, clientId)
      if (!detail.workspace || detail.dashboard.workspace_id !== workspaceId) {
        throw new Error('The podcast research context did not match the workspace prospect address.')
      }
      return {
        workspace: {
          id: detail.workspace.id,
          name: detail.workspace.name,
          slug: null,
          status: detail.workspace.status,
          is_default: detail.workspace.is_default,
          logo_path: detail.workspace.logo_path,
          logo_updated_at: detail.workspace.logo_updated_at,
        },
        client: {
          id: detail.dashboard.id,
          workspace_id: detail.dashboard.workspace_id,
          name: detail.dashboard.prospect_name,
          email: detail.dashboard.prospect_email,
          website: detail.dashboard.prospect_website,
          status: 'active',
          bio: detail.dashboard.prospect_bio,
          photo_url: detail.dashboard.prospect_image_url,
          updated_at: detail.dashboard.updated_at,
        },
        existing_podcast_ids: detail.podcasts.map((podcast) => podcast.podcast_id),
        current_shortlist_count: detail.podcasts.filter((podcast) => podcast.visibility === 'visible').length,
      }
    },
    enabled: isWorkspaceScoped && Boolean(workspaceId && clientId),
    staleTime: 30_000,
    retry: false,
  })

  const workspaces = useMemo(() => workspacesQuery.data || [], [workspacesQuery.data])
  const clients = useMemo(() => clientsQuery.data?.clients || [], [clientsQuery.data?.clients])
  const scopedClientOptions = useMemo(
    () => (scopedClientsQuery.data || []).filter((client) => client.status === 'active'),
    [scopedClientsQuery.data],
  )
  const selectedWorkspace = isWorkspaceScoped
    ? researchContextQuery.data?.workspace
      || (workspace?.id.toLowerCase() === fixedWorkspaceId ? workspace : undefined)
    : workspaces.find((candidate) => candidate.id === workspaceId)
  const selectedClient = isWorkspaceScoped
    ? researchContextQuery.data?.client?.id === clientId
      ? researchContextQuery.data.client
      : undefined
    : clients.find((client) => client.id === clientId)
  const targetLabel = isProspectBound ? 'prospect' : 'client'
  const targetLabelTitle = isProspectBound ? 'Prospect' : 'Client'
  const scopeLocked = Boolean(runScope || results.length > 0 || isDiscovering)

  useEffect(() => {
    if (isWorkspaceScoped) return
    if (workspaces.length === 0) return
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) {
      setWorkspaceId((workspaces.find((workspace) => workspace.is_default) || workspaces[0]).id)
      setClientId('')
    }
  }, [isWorkspaceScoped, workspaceId, workspaces])

  useEffect(() => {
    if (isWorkspaceScoped) return
    if (!clientId || clientsQuery.isLoading) return
    if (!clients.some((client) => client.id === clientId)) setClientId('')
  }, [clientId, clients, clientsQuery.isLoading, isWorkspaceScoped])

  useEffect(() => {
    if (!isWorkspaceScoped) return
    if (
      workspaceId === fixedWorkspaceId
      && (!isTargetBound || clientId === fixedTargetId)
    ) return
    resetResearch()
    setWorkspaceId(fixedWorkspaceId)
    if (isTargetBound) setClientId(fixedTargetId)
  }, [clientId, fixedTargetId, fixedWorkspaceId, isTargetBound, isWorkspaceScoped, workspaceId])

  useEffect(() => {
    if (!isClientSelectable || scopedClientsQuery.isLoading) return
    if (scopedClientOptions.some((client) => client.id === clientId)) return
    resetResearch()
    setAddedPodcastIds(new Set())
    setClientId(scopedClientOptions[0]?.id || '')
  }, [clientId, isClientSelectable, scopedClientOptions, scopedClientsQuery.isLoading])

  useEffect(() => {
    if (isTargetBound) return
    try {
      window.sessionStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify({ workspaceId, clientId, strategy }))
    } catch {
      // The selected scope remains usable in memory when browser storage is unavailable.
    }
  }, [workspaceId, clientId, isTargetBound, strategy])

  useEffect(() => {
    setResultPage(1)
  }, [activeTab, resultSearch, resultSort, contactableOnly, hideExisting])

  useEffect(() => {
    if (!showChartDiscovery || chartCountries.length > 0) return
    let active = true
    setIsLoadingChartOptions(true)
    void getChartCountries(workspaceId)
      .then((countries) => {
        if (!active) return
        setChartCountries(countries)
        if (countries.length > 0 && !countries.some((country) => country.code === chartCountry)) {
          setChartCountry(countries[0].code)
        }
      })
      .catch(() => toast.error('Available chart countries could not be loaded.'))
      .finally(() => active && setIsLoadingChartOptions(false))
    return () => { active = false }
  }, [chartCountries.length, chartCountry, showChartDiscovery, workspaceId])

  useEffect(() => {
    if (!showChartDiscovery || !chartCountry) return
    let active = true
    setIsLoadingChartOptions(true)
    setChartCategory('')
    void getChartCategories(chartPlatform, chartCountry, workspaceId)
      .then((categories) => {
        if (!active) return
        setChartCategories(categories)
        if (categories.length > 0) setChartCategory(categories[0].id)
      })
      .catch(() => toast.error('Chart categories could not be loaded.'))
      .finally(() => active && setIsLoadingChartOptions(false))
    return () => { active = false }
  }, [chartCountry, chartPlatform, showChartDiscovery, workspaceId])

  const existingPodcastIds = useMemo(() => new Set([
    ...(researchContextQuery.data?.existing_podcast_ids || []),
    ...addedPodcastIds,
  ].map((podcastId) => podcastId.toLowerCase())), [addedPodcastIds, researchContextQuery.data?.existing_podcast_ids])
  const currentShortlistCount = researchContextQuery.data?.current_shortlist_count ?? existingPodcastIds.size

  const rows = useMemo(() => results.map((result) => {
    const outreach = calculateOutreachPriority(result.podcast)
    const tier = getResearchTier(
      result.relevanceScore,
      outreach.score,
      tierOverrides[result.podcast.podcast_id],
      excludedIds.has(result.podcast.podcast_id),
    )
    return {
      ...result,
      outreach,
      tier,
      existing: existingPodcastIds.has(result.podcast.podcast_id.toLowerCase()),
      compositeScore: compositeResearchScore(result.relevanceScore, outreach.score),
    }
  }), [excludedIds, existingPodcastIds, results, tierOverrides])

  const tierCounts = useMemo(() => rows.reduce<Record<ResearchTier, number>>((counts, row) => {
    counts[row.tier] += 1
    return counts
  }, { a: 0, b: 0, c: 0, review: 0, excluded: 0 }), [rows])

  const newTierCounts = useMemo(() => rows.reduce<Record<ResearchTier, number>>((counts, row) => {
    if (!row.existing) counts[row.tier] += 1
    return counts
  }, { a: 0, b: 0, c: 0, review: 0, excluded: 0 }), [rows])
  const displayedTierCounts = hideExisting ? newTierCounts : tierCounts

  const filteredRows = useMemo(() => {
    const needle = resultSearch.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (hideExisting && row.existing) return false
      if (activeTab !== 'all' && row.tier !== activeTab) return false
      if (contactableOnly && !row.podcast.reach?.email) return false
      if (!needle) return true
      const categories = row.podcast.podcast_categories?.map((category) => category.category_name).join(' ') || ''
      return [row.podcast.podcast_name, row.podcast.publisher_name, row.podcast.podcast_description, categories]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    })

    return filtered.sort((left, right) => {
      if (resultSort === 'relevance') return (right.relevanceScore ?? -1) - (left.relevanceScore ?? -1)
      if (resultSort === 'audience') return (right.podcast.reach?.audience_size || 0) - (left.podcast.reach?.audience_size || 0)
      if (resultSort === 'recent') {
        return Date.parse(right.podcast.last_posted_at || '1970-01-01') - Date.parse(left.podcast.last_posted_at || '1970-01-01')
      }
      return right.compositeScore - left.compositeScore
    })
  }, [activeTab, contactableOnly, hideExisting, resultSearch, resultSort, rows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RESULTS_PER_PAGE))
  const visibleRows = filteredRows.slice((resultPage - 1) * RESULTS_PER_PAGE, resultPage * RESULTS_PER_PAGE)
  const visibleSelectableRows = visibleRows.filter((row) => !row.existing)
  const selectedDetail = rows.find((row) => row.podcast.podcast_id === detailId)
  const existingResultCount = rows.filter((row) => row.existing).length
  const newResultCount = rows.length - existingResultCount
  const qualifiedCount = rows.filter((row) => !row.existing && ['a', 'b', 'c'].includes(row.tier)).length
  const selectedResults = results.filter((result) => (
    selectedIds.has(result.podcast.podcast_id)
    && !excludedIds.has(result.podcast.podcast_id)
    && !existingPodcastIds.has(result.podcast.podcast_id.toLowerCase())
  ))
  const selectedContactableCount = selectedResults.filter((result) => Boolean(result.podcast.reach?.email)).length
  const unscoredCount = results.filter((result) => (
    result.relevanceScore === null
    && !excludedIds.has(result.podcast.podcast_id)
    && !existingPodcastIds.has(result.podcast.podcast_id.toLowerCase())
  )).length

  function resetResearch() {
    setQueries([])
    setResults([])
    setRunScope(null)
    setProgress(null)
    setScoringProgress(null)
    setSelectedIds(new Set())
    setTierOverrides({})
    setExcludedIds(new Set())
    setActiveTab('all')
    setResultSearch('')
    setHideExisting(true)
    setDetailId(null)
  }

  const handleWorkspaceChange = (nextWorkspaceId: string) => {
    resetResearch()
    setAddedPodcastIds(new Set())
    setWorkspaceId(nextWorkspaceId)
    setClientId('')
  }

  const handleClientChange = (nextClientId: string) => {
    resetResearch()
    setAddedPodcastIds(new Set())
    setClientId(nextClientId)
  }

  const handleGenerateQueries = async (): Promise<string[]> => {
    if (!selectedWorkspace || !selectedClient?.bio) {
      toast.error(`Add an approved ${targetLabel} profile before generating a search strategy.`)
      return []
    }

    setIsGenerating(true)
    try {
      const generated = await generatePodcastQueries({
        workspaceId: selectedWorkspace.id,
        ...(isProspectBound
          ? { prospectDashboardId: selectedClient.id }
          : { clientId: selectedClient.id }),
      })
      const normalized = generated.map(normalizePodscanQuery).filter(Boolean)
      setQueries(normalized)
      toast.success(`${targetLabelTitle} search strategy is ready.`)
      return normalized
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search strategy could not be generated.')
      return []
    } finally {
      setIsGenerating(false)
    }
  }

  const handleAddCustomQuery = () => {
    const normalized = normalizePodscanQuery(customQuery)
    if (!normalized) return
    if (queries.includes(normalized)) {
      toast.info('That query is already in the strategy.')
      return
    }
    setQueries((current) => [...current, normalized])
    setCustomQuery('')
  }

  const buildSearchOptions = (query: string, page: number): SearchOptions => {
    const options: SearchOptions = {
      query,
      page,
      per_page: 50,
      order_by: 'best_match',
      order_dir: 'desc',
      search_fields: 'name,description,publisher_name',
    }
    if (language !== 'any') options.language = language
    if (region !== 'any') options.region = region
    if (guestFilter === 'true') options.has_guests = true
    if (minAudience) options.min_audience_size = Number.parseInt(minAudience, 10)
    if (maxAudience) options.max_audience_size = Number.parseInt(maxAudience, 10)
    if (minEpisodes) options.min_episode_count = Number.parseInt(minEpisodes, 10)
    if (activityWindow !== 'any') {
      const minimumDate = new Date()
      minimumDate.setDate(minimumDate.getDate() - Number.parseInt(activityWindow, 10))
      options.min_last_episode_posted_at = minimumDate.toISOString().slice(0, 10)
    }
    return options
  }

  const handleRunDiscovery = async () => {
    if (!selectedWorkspace || !selectedClient) {
      toast.error(`Select a workspace and ${targetLabel} first.`)
      return
    }
    if (!selectedClient.bio) {
      toast.error(`This ${targetLabel} needs an approved profile before discovery can run.`)
      return
    }

    let searchQueries = queries
    if (searchQueries.length === 0) searchQueries = await handleGenerateQueries()
    if (searchQueries.length === 0) return

    const normalizedQueries = Array.from(new Set(searchQueries.map(normalizePodscanQuery).filter(Boolean)))
    const config = DISCOVERY_STRATEGIES[strategy]
    const totalRequests = normalizedQueries.length * config.pagesPerQuery
    const startedAt = new Date().toISOString()
    const nextRun: RunScope = {
      id: crypto.randomUUID(),
      workspaceId: selectedWorkspace.id,
      clientId: selectedClient.id,
      strategy,
      startedAt,
      rawResults: 0,
      apiCalls: 0,
      errors: 0,
    }

    setQueries(normalizedQueries)
    setResults([])
    setSelectedIds(new Set())
    setTierOverrides({})
    setExcludedIds(new Set())
    setRunScope(nextRun)
    setIsDiscovering(true)
    setProgress({ completed: 0, total: totalRequests, message: `Starting ${targetLabel} discovery…` })

    let collected: ResearchResult[] = []
    let completed = 0
    let rawResults = 0
    let apiCalls = 0
    let errors = 0

    try {
      for (let queryIndex = 0; queryIndex < normalizedQueries.length; queryIndex += 1) {
        const query = normalizedQueries[queryIndex]
        for (let page = 1; page <= config.pagesPerQuery; page += 1) {
          setProgress({
            completed,
            total: totalRequests,
            message: `Searching strategy ${queryIndex + 1} of ${normalizedQueries.length}, page ${page}…`,
          })
          try {
            let response: Awaited<ReturnType<typeof searchPodcastsWithMeta>> | null = null
            for (let attempt = 0; attempt < 2; attempt += 1) {
              try {
                response = await searchPodcastsWithMeta(buildSearchOptions(query, page), selectedWorkspace.id)
                break
              } catch (error) {
                const requestError = error as Error & { status?: number; retryAfterSeconds?: number }
                const throttled = requestError.status === 429
                  || requestError.name === 'PODSCAN_RATE_LIMIT'
                  || requestError.name === 'PODSCAN_CONCURRENCY_LIMIT'
                if (!throttled || attempt === 1) throw error
                const retrySeconds = Math.min(30, Math.max(1, requestError.retryAfterSeconds || 5))
                setProgress({
                  completed,
                  total: totalRequests,
                  message: `Podscan is busy. Retrying this page in ${retrySeconds} seconds…`,
                })
                await new Promise((resolve) => window.setTimeout(resolve, retrySeconds * 1000))
              }
            }
            if (!response) throw new Error('Podscan did not return a search response.')
            apiCalls += 1
            if (response.rateLimit) setRateLimit(response.rateLimit)
            const podcasts = response.data.podcasts || []
            rawResults += podcasts.length
            collected = mergeResearchResults(collected, podcasts, 'AI search', query)
            setResults(collected)

            const lastPage = Number.parseInt(response.data.pagination?.last_page || String(config.pagesPerQuery), 10)
            if (podcasts.length === 0 || page >= lastPage) {
              completed += config.pagesPerQuery - page + 1
              break
            }
          } catch (error) {
            errors += 1
            console.error('Podcast discovery page failed:', error)
          }
          completed += 1
          setProgress({
            completed,
            total: totalRequests,
            message: `${collected.length.toLocaleString()} unique podcasts found so far`,
          })
          if (completed < totalRequests) await new Promise((resolve) => window.setTimeout(resolve, 525))
        }
      }

      const completedAt = new Date().toISOString()
      setRunScope({ ...nextRun, completedAt, rawResults, apiCalls, errors })
      setProgress({
        completed: totalRequests,
        total: totalRequests,
        message: `${collected.length.toLocaleString()} unique podcasts ready for review`,
      })
      if (errors > 0) {
        toast.warning(`Discovery completed with ${errors} failed request${errors === 1 ? '' : 's'}.`)
      } else {
        toast.success(`Found ${collected.length.toLocaleString()} unique podcasts for ${selectedClient.name}.`)
      }
    } finally {
      setIsDiscovering(false)
    }
  }

  const handleScoreResults = async () => {
    if (!selectedWorkspace || !selectedClient?.bio || !runScope) {
      toast.error(`A ${targetLabel}-bound discovery run is required before scoring.`)
      return
    }
    if (runScope.workspaceId !== workspaceId || runScope.clientId !== clientId) {
      toast.error(`This run belongs to a different workspace or ${targetLabel}. Start a new run.`)
      return
    }

    const selectedUnscored = results.filter((result) => (
      selectedIds.has(result.podcast.podcast_id)
      && result.relevanceScore === null
      && !existingPodcastIds.has(result.podcast.podcast_id.toLowerCase())
    ))
    const candidates = selectedUnscored.length > 0
      ? selectedUnscored
      : results.filter((result) => (
          result.relevanceScore === null
          && !excludedIds.has(result.podcast.podcast_id)
          && !existingPodcastIds.has(result.podcast.podcast_id.toLowerCase())
        ))
    if (candidates.length === 0) {
      toast.info('There are no unscored podcasts in this selection.')
      return
    }

    setIsScoring(true)
    setScoringProgress({ completed: 0, total: candidates.length, message: `Scoring ${candidates.length} podcasts…` })
    try {
      const scores = await scoreCompatibilityBatch(
        selectedClient.bio,
        candidates.map((result) => ({
          podcast_id: result.podcast.podcast_id,
          podcast_name: result.podcast.podcast_name,
          podcast_description: result.podcast.podcast_description,
          publisher_name: result.podcast.publisher_name,
          podcast_categories: result.podcast.podcast_categories,
          audience_size: result.podcast.reach?.audience_size,
          episode_count: result.podcast.episode_count,
        })),
        10,
        (completed, total) => setScoringProgress({
          completed,
          total,
          message: `Scored ${completed} of ${total} podcasts`,
        }),
        isProspectBound,
        isProspectBound
          ? { workspaceId: selectedWorkspace.id, prospectDashboardId: selectedClient.id }
          : { workspaceId: selectedWorkspace.id, clientId: selectedClient.id },
      )

      const byId = new Map(scores.map((score) => [score.podcast_id, score]))
      setResults((current) => current.map((result) => {
        const score = byId.get(result.podcast.podcast_id)
        if (!score || score.score === null) return result
        return {
          ...result,
          relevanceScore: Math.round(score.score * 10),
          relevanceReasoning: score.reasoning,
        }
      }))
      toast.success(`Relevance scoring completed for ${candidates.length} podcasts.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Relevance scoring failed.')
    } finally {
      setIsScoring(false)
    }
  }

  const handleAddChartResults = async () => {
    if (!selectedWorkspace || !selectedClient || !chartCategory) return
    if (runScope && (runScope.workspaceId !== workspaceId || runScope.clientId !== clientId)) {
      toast.error(`Chart discoveries cannot be mixed across ${targetLabel}s.`)
      return
    }

    setIsAddingChartResults(true)
    try {
      const limit = chartPlatform === 'apple' ? 100 : 50
      const podcasts = await getTopChartPodcasts(chartPlatform, chartCountry, chartCategory, limit, selectedWorkspace.id)
      const source = `${chartPlatform === 'apple' ? 'Apple' : 'Spotify'} charts`
      setResults((current) => mergeResearchResults(current, podcasts, source))
      setRunScope((current) => current
        ? {
            ...current,
            completedAt: new Date().toISOString(),
            rawResults: current.rawResults + podcasts.length,
            apiCalls: current.apiCalls + 1,
          }
        : {
            id: crypto.randomUUID(),
            workspaceId,
            clientId,
            strategy,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            rawResults: podcasts.length,
            apiCalls: 1,
            errors: 0,
          })
      toast.success(`Added ${podcasts.length} chart podcasts to this ${targetLabel} run.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chart podcasts could not be added.')
    } finally {
      setIsAddingChartResults(false)
    }
  }

  const handleToggleSelection = (podcastId: string) => {
    if (existingPodcastIds.has(podcastId.toLowerCase())) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(podcastId)) next.delete(podcastId)
      else next.add(podcastId)
      return next
    })
  }

  const handleToggleVisible = () => {
    const visibleIds = visibleRows
      .filter((row) => !row.existing)
      .map((row) => row.podcast.podcast_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleIds.forEach((id) => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  const applyTierToIds = (ids: Iterable<string>, tier: Exclude<ResearchTier, 'excluded'>) => {
    const targetIds = Array.from(ids)
    if (targetIds.length === 0) return
    setTierOverrides((current) => {
      const next = { ...current }
      targetIds.forEach((id) => { next[id] = tier })
      return next
    })
    setExcludedIds((current) => {
      const next = new Set(current)
      targetIds.forEach((id) => next.delete(id))
      return next
    })
    toast.success(`${targetIds.length} podcast${targetIds.length === 1 ? '' : 's'} moved to ${tierLabel(tier)}.`)
  }

  const handleBulkTier = (tier: Exclude<ResearchTier, 'excluded'>) => {
    applyTierToIds(selectedIds, tier)
  }

  const handleBulkExclude = () => {
    if (selectedIds.size === 0) return
    setExcludedIds((current) => new Set([...current, ...selectedIds]))
    toast.success(`${selectedIds.size} podcast${selectedIds.size === 1 ? '' : 's'} excluded.`)
    setSelectedIds(new Set())
  }

  const handleEnrichDetail = async () => {
    if (!detailId) return
    setIsEnriching(true)
    try {
      const podcast = await getPodcastById(detailId, selectedWorkspace?.id)
      setResults((current) => mergeResearchResults(current, [podcast], 'Podscan profile'))
      toast.success('Full Podscan profile loaded.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Podcast profile could not be loaded.')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleAddToShortlist = async () => {
    if (!selectedWorkspace || !selectedClient || !runScope || selectedResults.length === 0) return
    if (runScope.workspaceId !== selectedWorkspace.id || runScope.clientId !== selectedClient.id) {
      toast.error('Add stopped because the active workspace does not match this discovery run.')
      return
    }

    setIsAdding(true)
    try {
      const response = isProspectBound
        ? await addWorkspaceProspectPodcasts(
            selectedWorkspace.id,
            selectedClient.id,
            selectedResults.map(toProspectShortlistPodcast),
          )
        : await addClientShortlistPodcasts(
            selectedWorkspace.id,
            selectedClient.id,
            selectedResults.map(toShortlistPodcast),
          )
      const handledPodcastIds = selectedResults.map((result) => result.podcast.podcast_id)
      setAddedPodcastIds((current) => new Set([...current, ...handledPodcastIds]))
      if (isWorkspaceScoped) {
        queryClient.setQueryData<FinderResearchContext>(researchContextQueryKey, (current) => current
          ? {
              ...current,
              existing_podcast_ids: Array.from(new Set([
                ...current.existing_podcast_ids,
                ...handledPodcastIds,
              ])),
              ...(isProspectBound
                ? { current_shortlist_count: (current.current_shortlist_count || 0) + response.added }
                : {}),
            }
          : current)
      }
      const duplicatesSkipped = response.skipped || 0
      if (response.added === 0) {
        toast.info(`Nothing new to add for ${selectedClient.name}. These podcasts are already on the ${targetLabel} shortlist.`)
      } else if ('unpublished_for_review' in response && response.unpublished_for_review) {
        // Older function, still taking the page down. Name the consequence.
        toast.warning(
          `Added ${response.added} podcast${response.added === 1 ? '' : 's'}. This ${targetLabel}'s public link is offline until you publish again.`,
          { duration: 8000 },
        )
      } else if ('hidden_pending_review' in response && response.hidden_pending_review) {
        toast.success(
          `Added ${response.added} podcast${response.added === 1 ? '' : 's'}, hidden until you review them. The live page is unchanged.`,
          { duration: 8000 },
        )
      } else if (duplicatesSkipped > 0) {
        toast.success(`Added ${response.added} new podcasts and skipped ${duplicatesSkipped} already on the ${targetLabel} shortlist.`)
      } else {
        toast.success(`Added ${response.added} new podcasts to ${selectedClient.name}’s shortlist.`)
      }
      setSelectedIds(new Set())
      setAddDialogOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Podcasts could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const runProgress = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0
  const scoreProgressValue = scoringProgress && scoringProgress.total > 0
    ? Math.round((scoringProgress.completed / scoringProgress.total) * 100)
    : 0

  const clientBaseHref = platformWorkspaceId
    ? selectedWorkspaceBaseHref(fixedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const clientsHref = `${clientBaseHref}/clients`
  const onboardingHref = `${clientBaseHref}/onboarding`
  const prospectStudioHref = `${clientBaseHref}/prospects?prospect=${encodeURIComponent(canonicalProspectId)}&view=all`
  const platformWorkspaceConfig: PlatformWorkspaceConfig | undefined = platformWorkspaceId
    ? {
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref: clientBaseHref,
      }
    : undefined

  if (isTargetBound && researchContextQuery.isLoading && Boolean(fixedWorkspaceId && fixedTargetId)) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspaceConfig}>
        <Card>
          <CardContent className="flex min-h-56 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Loading {targetLabel} podcast research…</p>
            </div>
          </CardContent>
        </Card>
      </WorkspaceLayout>
    )
  }

  if (isTargetBound && (
    !fixedWorkspaceId
    || !fixedTargetId
    || researchContextQuery.error
    || !selectedWorkspace
    || !selectedClient
  )) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspaceConfig}>
        <Card>
          <CardHeader>
            <CardTitle>Podcast research unavailable</CardTitle>
            <CardDescription>
              {researchContextQuery.error instanceof Error
                ? researchContextQuery.error.message
                : `This active ${targetLabel} does not belong to the selected workspace.`}
            </CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline"><Link to={isProspectBound ? prospectStudioHref : clientsHref}>Back to {isProspectBound ? 'Prospect Studio' : 'clients'}</Link></Button></CardContent>
        </Card>
      </WorkspaceLayout>
    )
  }

  const pageContent = (
    <>
      <div className="mx-auto w-full max-w-[1560px] space-y-5 pb-24">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Podcast Finder</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              {isProspectBound
                ? `Research and score new shows for ${selectedClient?.name || 'this prospect'}, then add the strongest matches to their lead magnet.`
                : 'Discover new podcasts for any client. Existing opportunities are filtered automatically.'}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
            {isClientSelectable && (scopedClientsQuery.isLoading || scopedClientOptions.length > 0) && (
              <div className="min-w-64 space-y-1.5">
                <Label htmlFor="finder-client-select">Client</Label>
                <div className="flex gap-2">
                  <Select
                    value={clientId}
                    onValueChange={handleClientChange}
                    disabled={scopeLocked || scopedClientsQuery.isLoading || scopedClientOptions.length === 0}
                  >
                    <SelectTrigger id="finder-client-select" className="h-10 bg-card">
                      <SelectValue placeholder="Loading clients…" />
                    </SelectTrigger>
                    <SelectContent>
                      {scopedClientOptions.map((client) => (
                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scopeLocked && (
                    <Button variant="outline" className="shrink-0" onClick={() => setScopeResetOpen(true)}>
                      Change
                    </Button>
                  )}
                </div>
                {!researchContextQuery.isLoading && existingPodcastIds.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Filtering {existingPodcastIds.size.toLocaleString()} previously used podcast{existingPodcastIds.size === 1 ? '' : 's'}
                  </p>
                )}
              </div>
            )}
            {isClientBound && <Button asChild variant="outline"><Link to={clientsHref}>Back to clients</Link></Button>}
            {rateLimit?.remaining !== undefined && <div className="rounded-lg border bg-card px-3 py-2 text-left lg:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Podscan quota</p>
              <p className="text-sm font-semibold">{rateLimit.remaining.toLocaleString()}{rateLimit.limit !== undefined ? ` of ${rateLimit.limit.toLocaleString()}` : ''} remaining</p>
            </div>}
          </div>
        </div>

        {isProspectBound && selectedClient && (
          <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 p-4 dark:border-violet-900 dark:from-violet-950/30 dark:to-blue-950/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Target className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Prospect research</p>
                <p className="truncate font-semibold">Adding to {selectedClient.name}</p>
                <p className="text-sm text-muted-foreground">{currentShortlistCount} currently shortlisted · {existingPodcastIds.size} already reviewed · new selections return to Studio</p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0 bg-background/80"><Link to={prospectStudioHref}><ChevronLeft className="mr-2 h-4 w-4" />Back to Studio</Link></Button>
          </div>
        )}

        {isClientSelectable && scopedClientsQuery.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Clients could not be loaded. <button className="underline" onClick={() => void scopedClientsQuery.refetch()}>Try again</button>
          </div>
        )}

        {isClientSelectable && !scopedClientsQuery.isLoading && !scopedClientsQuery.error && scopedClientOptions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
              <Users className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="font-medium">No active clients</p>
                <p className="text-sm text-muted-foreground">Add or reactivate a client to start finding podcasts.</p>
              </div>
              <Button asChild variant="outline"><Link to={clientsHref}>Open clients</Link></Button>
            </CardContent>
          </Card>
        )}

        {isWorkspaceScoped && researchContextQuery.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {researchContextQuery.error instanceof Error
              ? researchContextQuery.error.message
              : `The selected ${targetLabel} profile and podcast history could not be loaded.`}{' '}
            <button className="underline" onClick={() => void researchContextQuery.refetch()}>Try again</button>
          </div>
        )}

        {isWorkspaceScoped && selectedClient && !selectedClient.bio && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{targetLabelTitle} profile required</p>
              <p className="text-sm text-muted-foreground">Add an approved {targetLabel} profile before running discovery.</p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={isProspectBound ? prospectStudioHref : isClientBound ? onboardingHref : clientsHref}>{isProspectBound ? 'Back to Studio' : isClientBound ? 'Open onboarding' : 'Open clients'}</Link>
            </Button>
          </div>
        )}

        {!isWorkspaceScoped && <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">1. Choose the client workspace</CardTitle>
                <CardDescription>Workspace first, then an active client. Lead magnets stay in Prospect Studio.</CardDescription>
              </div>
              {scopeLocked && (
                <Button variant="outline" size="sm" onClick={() => setScopeResetOpen(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Start another client
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="workspace-select">Workspace</Label>
                <Select value={workspaceId} onValueChange={handleWorkspaceChange} disabled={scopeLocked || workspacesQuery.isLoading}>
                  <SelectTrigger id="workspace-select" className="h-10">
                    <SelectValue placeholder={workspacesQuery.isLoading ? 'Loading workspaces…' : 'Select workspace'} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        <span className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {workspace.name}{workspace.is_default ? ' — My workspace' : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-select">Client</Label>
                <Select value={clientId} onValueChange={handleClientChange} disabled={!workspaceId || scopeLocked || clientsQuery.isLoading}>
                  <SelectTrigger id="client-select" className="h-10">
                    <SelectValue placeholder={clientsQuery.isLoading ? 'Loading clients…' : clients.length ? 'Select active client' : 'No active clients'} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {workspacesQuery.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                Workspaces could not be loaded. <button className="underline" onClick={() => void workspacesQuery.refetch()}>Try again</button>
              </div>
            )}

            {selectedClient && (
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/25 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{selectedClient.name}</p>
                    <Badge variant={selectedClient.bio ? 'secondary' : 'destructive'}>
                      {selectedClient.bio ? 'Profile ready' : 'Profile required'}
                    </Badge>
                    {selectedClient.email && <span className="text-xs text-muted-foreground">{selectedClient.email}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-4xl text-sm text-muted-foreground">
                    {selectedClient.bio || 'Add the approved onboarding answers or client bio before running discovery.'}
                  </p>
                </div>
                {!selectedClient.bio && (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link to={isClientBound
                      ? onboardingHref
                      : selectedWorkspace?.is_default
                        ? workspaceModuleHref(MY_WORKSPACE_BASE_HREF, 'clients')
                        : workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'clients')}>
                      {isClientBound ? 'Open onboarding' : 'Open clients'}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>}

        <Card className={cn(!selectedClient && 'opacity-60')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{isWorkspaceScoped ? '1.' : '2.'} Set the discovery balance</CardTitle>
            <CardDescription>All modes keep relevant podcasts; the preset controls how broadly and deeply Podscan is searched.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(DISCOVERY_STRATEGIES) as DiscoveryStrategy[]).map((strategyId) => {
                const option = DISCOVERY_STRATEGIES[strategyId]
                const selected = strategy === strategyId
                return (
                  <button
                    key={strategyId}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selectedClient || scopeLocked}
                    onClick={() => setStrategy(strategyId)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed',
                      selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{option.label}</span>
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{option.description.replace(/\bclient\b/gu, targetLabel)}</p>
                    <p className="mt-3 text-xs font-medium text-foreground">
                      Up to {option.estimatedMaximum.toLocaleString()} raw matches from five AI strategies
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={scopeLocked}>
                  <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="any">Any language</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="region">Region</Label>
                <Select value={region} onValueChange={setRegion} disabled={scopeLocked}>
                  <SelectTrigger id="region"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="GB">United Kingdom</SelectItem>
                    <SelectItem value="CA">Canada</SelectItem>
                    <SelectItem value="AU">Australia</SelectItem>
                    <SelectItem value="any">Any region</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity">Recent activity</Label>
                <Select value={activityWindow} onValueChange={setActivityWindow} disabled={scopeLocked}>
                  <SelectTrigger id="activity"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">Active within 90 days</SelectItem>
                    <SelectItem value="180">Active within 180 days</SelectItem>
                    <SelectItem value="365">Active within one year</SelectItem>
                    <SelectItem value="any">Any activity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-format">Format</Label>
                <Select value={guestFilter} onValueChange={(value) => setGuestFilter(value as GuestFilter)} disabled={scopeLocked}>
                  <SelectTrigger id="guest-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Guest shows only</SelectItem>
                    <SelectItem value="any">Any format</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((value) => !value)}>
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Advanced strategy
                <ChevronDown className={cn('ml-2 h-4 w-4 transition-transform', showAdvanced && 'rotate-180')} />
              </Button>
              <Button
                size="lg"
                className="sm:min-w-56"
                onClick={() => void handleRunDiscovery()}
                disabled={!selectedClient?.bio || isGenerating || isDiscovering || scopeLocked}
              >
                {isGenerating || isDiscovering ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {isGenerating ? 'Building strategy…' : 'Discovering…'}</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" /> Run {DISCOVERY_STRATEGIES[strategy].label.toLowerCase()} discovery</>
                )}
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="min-audience">Minimum audience</Label>
                    <Input id="min-audience" type="number" value={minAudience} onChange={(event) => setMinAudience(event.target.value)} disabled={scopeLocked} placeholder="No minimum" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="max-audience">Maximum audience</Label>
                    <Input id="max-audience" type="number" value={maxAudience} onChange={(event) => setMaxAudience(event.target.value)} disabled={scopeLocked} placeholder="No maximum" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="min-episodes">Minimum episodes</Label>
                    <Input id="min-episodes" type="number" value={minEpisodes} onChange={(event) => setMinEpisodes(event.target.value)} disabled={scopeLocked} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label>Podscan query strategy</Label>
                      <p className="text-xs text-muted-foreground">Exact phrases use Podscan’s documented double-quote syntax.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void handleGenerateQueries()} disabled={!selectedClient?.bio || isGenerating || scopeLocked}>
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {queries.length ? 'Regenerate' : 'Generate five queries'}
                    </Button>
                  </div>
                  {queries.map((query, index) => (
                    <div key={`${index}-${query}`} className="flex gap-2">
                      <Input
                        aria-label={`Search query ${index + 1}`}
                        value={query}
                        disabled={scopeLocked}
                        onChange={(event) => setQueries((current) => current.map((value, queryIndex) => queryIndex === index ? event.target.value : value))}
                      />
                      <Button variant="ghost" size="icon" disabled={scopeLocked} onClick={() => setQueries((current) => current.filter((_, queryIndex) => queryIndex !== index))}>
                        <X className="h-4 w-4" /><span className="sr-only">Remove query {index + 1}</span>
                      </Button>
                    </div>
                  ))}
                  {!scopeLocked && (
                    <div className="flex gap-2">
                      <Input
                        value={customQuery}
                        onChange={(event) => setCustomQuery(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleAddCustomQuery()}
                        placeholder='Add a custom query, e.g. "founder * stories"'
                      />
                      <Button variant="outline" onClick={handleAddCustomQuery} disabled={!customQuery.trim()}>
                        <Plus className="mr-2 h-4 w-4" /> Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {(isDiscovering || progress) && (
          <Card>
            <CardContent className="pt-5" role="status" aria-atomic="true">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{progress?.message}</span>
                <span className="text-muted-foreground">{runProgress}%</span>
              </div>
              <Progress value={runProgress} className="h-2" />
              {isDiscovering && results.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Partial results are available below while discovery continues.</p>
              )}
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <>
            <Card>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-8">
                  {[
                    { label: 'Raw found', value: runScope?.rawResults || results.length, tone: 'text-foreground' },
                    { label: 'Unique run', value: results.length, tone: 'text-foreground' },
                    { label: `New for ${targetLabel}`, value: newResultCount, tone: 'text-emerald-600' },
                    { label: 'Already used', value: existingResultCount, tone: 'text-slate-500' },
                    { label: 'Tier A', value: newTierCounts.a, tone: 'text-emerald-600' },
                    { label: 'Tier B', value: newTierCounts.b, tone: 'text-blue-600' },
                    { label: 'Tier C', value: newTierCounts.c, tone: 'text-amber-600' },
                    { label: 'Needs review', value: newTierCounts.review, tone: 'text-violet-600' },
                  ].map((stat, index, list) => (
                    <div key={stat.label} className="relative rounded-lg border bg-muted/15 px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                      <p className={cn('mt-1 text-2xl font-semibold', stat.tone)}>{stat.value.toLocaleString()}</p>
                      {index < list.length - 1 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block" />}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {qualifiedCount.toLocaleString()} new outreach-ready · {existingResultCount.toLocaleString()} from {targetLabel} history hidden ·{' '}
                    {Math.max(0, (runScope?.rawResults || results.length) - results.length).toLocaleString()} within-run duplicates removed
                  </span>
                  {runScope?.completedAt && <span>Run completed {formatDate(runScope.completedAt)} · {runScope.apiCalls} Podscan calls</span>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-3 pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-lg">{isWorkspaceScoped ? '2.' : '3.'} Review and route the list</CardTitle>
                    <CardDescription>New podcasts appear first. {targetLabelTitle} history stays available for reference and cannot be added twice.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void handleScoreResults()} disabled={isScoring || isDiscovering}>
                      {isScoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
                      {selectedIds.size > 0 ? `Score selection (${selectedIds.size})` : `Score unscored (${unscoredCount})`}
                    </Button>
                    <Button variant="outline" onClick={() => setShowChartDiscovery((value) => !value)} disabled={isDiscovering}>
                      <TrendingUp className="mr-2 h-4 w-4" /> Add from charts
                    </Button>
                  </div>
                </div>

                {isScoring && scoringProgress && (
                  <div role="status" aria-atomic="true" className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-2 flex justify-between text-sm"><span>{scoringProgress.message}</span><span>{scoreProgressValue}%</span></div>
                    <Progress value={scoreProgressValue} className="h-2" />
                  </div>
                )}

                {showChartDiscovery && (
                  <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Platform</Label>
                      <Select value={chartPlatform} onValueChange={(value) => setChartPlatform(value as 'apple' | 'spotify')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="apple">Apple Podcasts</SelectItem><SelectItem value="spotify">Spotify</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Available country</Label>
                      <Select value={chartCountry} onValueChange={setChartCountry} disabled={isLoadingChartOptions}>
                        <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                        <SelectContent>{chartCountries.map((country) => <SelectItem key={country.code} value={country.code}>{country.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Chart category</Label>
                      <Select value={chartCategory} onValueChange={setChartCategory} disabled={isLoadingChartOptions || chartCategories.length === 0}>
                        <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>{chartCategories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button className="w-full" onClick={() => void handleAddChartResults()} disabled={!chartCategory || isAddingChartResults}>
                        {isAddingChartResults ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Add chart results
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center lg:justify-between">
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ResultTab)}>
                    <TabsList className="h-auto flex-wrap justify-start">
                      <TabsTrigger value="all">All {hideExisting ? newResultCount : rows.length}</TabsTrigger>
                      <TabsTrigger value="a">Tier A {displayedTierCounts.a}</TabsTrigger>
                      <TabsTrigger value="b">Tier B {displayedTierCounts.b}</TabsTrigger>
                      <TabsTrigger value="c">Tier C {displayedTierCounts.c}</TabsTrigger>
                      <TabsTrigger value="review">Review {displayedTierCounts.review}</TabsTrigger>
                      <TabsTrigger value="excluded">Excluded {displayedTierCounts.excluded}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative sm:w-64">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={resultSearch} onChange={(event) => setResultSearch(event.target.value)} placeholder="Search results" className="pl-9" />
                    </div>
                    <Select value={resultSort} onValueChange={(value) => setResultSort(value as ResultSort)}>
                      <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Outreach priority</SelectItem>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="audience">Audience size</SelectItem>
                        <SelectItem value="recent">Most recent</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant={contactableOnly ? 'secondary' : 'outline'} onClick={() => setContactableOnly((value) => !value)}>
                      <Mail className="mr-2 h-4 w-4" /> Has email
                    </Button>
                    <Button
                      variant={hideExisting ? 'secondary' : 'outline'}
                      aria-pressed={hideExisting}
                      onClick={() => setHideExisting((value) => !value)}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {hideExisting ? `New only (${newResultCount})` : `Hide existing (${existingResultCount})`}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto border-t">
                  <Table>
                    <caption className="sr-only">Podcast research results for {selectedClient?.name}</caption>
                    <TableHeader>
                      <TableRow className="bg-muted/35">
                        <TableHead className="w-11 pl-4">
                          <Checkbox
                            aria-label="Select all visible podcasts"
                            disabled={visibleSelectableRows.length === 0}
                            checked={visibleSelectableRows.length > 0 && visibleSelectableRows.every((row) => selectedIds.has(row.podcast.podcast_id))
                              ? true
                              : visibleSelectableRows.some((row) => selectedIds.has(row.podcast.podcast_id)) ? 'indeterminate' : false}
                            onCheckedChange={handleToggleVisible}
                          />
                        </TableHead>
                        <TableHead className="min-w-[330px]">Podcast</TableHead>
                        <TableHead className="w-28">Tier</TableHead>
                        <TableHead className="w-28">Relevance</TableHead>
                        <TableHead className="w-32">Outreach</TableHead>
                        <TableHead className="w-28">Audience</TableHead>
                        <TableHead className="w-32">Last episode</TableHead>
                        <TableHead className="w-24">Contact</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => {
                        const podcast = row.podcast
                        const selected = selectedIds.has(podcast.podcast_id)
                        return (
                          <TableRow
                            key={podcast.podcast_id}
                            className={cn(
                              'cursor-pointer',
                              selected && 'bg-primary/[0.04]',
                              row.existing && 'bg-muted/25 text-muted-foreground',
                            )}
                            onClick={() => setDetailId(podcast.podcast_id)}
                          >
                            <TableCell className="py-2 pl-4" onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                aria-label={`Select ${podcast.podcast_name}`}
                                checked={selected}
                                disabled={row.existing}
                                onCheckedChange={() => handleToggleSelection(podcast.podcast_id)}
                              />
                            </TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex min-w-0 items-center gap-3">
                                {podcast.podcast_image_url ? (
                                  <img src={podcast.podcast_image_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" />
                                ) : (
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted"><BarChart3 className="h-4 w-4 text-muted-foreground" /></div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <p className="truncate font-medium">{podcast.podcast_name}</p>
                                    {row.existing && <Badge variant="outline" className="shrink-0">Already used</Badge>}
                                  </div>
                                  <p className="truncate text-xs text-muted-foreground">{podcast.publisher_name || resultReason(row)}</p>
                                  <p className="mt-0.5 line-clamp-1 max-w-xl text-xs text-muted-foreground/80">{resultReason(row)}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5"><Badge variant="outline" className={tierClasses(row.tier)}>{tierLabel(row.tier)}</Badge></TableCell>
                            <TableCell className="py-2.5">
                              {row.relevanceScore === null ? <span className="text-xs text-muted-foreground">Not scored</span> : <span className="font-semibold">{row.relevanceScore}</span>}
                            </TableCell>
                            <TableCell className="py-2.5"><span className="font-semibold">{row.outreach.score}</span><span className="text-xs text-muted-foreground"> / 100</span></TableCell>
                            <TableCell className="py-2.5">{compactNumber(podcast.reach?.audience_size)}</TableCell>
                            <TableCell className="py-2.5 text-sm text-muted-foreground">{formatDate(podcast.last_posted_at)}</TableCell>
                            <TableCell className="py-2.5">
                              {podcast.reach?.email ? <Badge variant="secondary" className="gap-1"><Mail className="h-3 w-3" /> Email</Badge> : <span className="text-xs text-muted-foreground">No email</span>}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="h-36 text-center text-muted-foreground">
                            {hideExisting && newResultCount === 0 && existingResultCount > 0 ? (
                              <div className="flex flex-col items-center gap-3">
                                <span>Every podcast in this run already exists in the {targetLabel}’s history.</span>
                                <Button variant="outline" size="sm" onClick={() => setHideExisting(false)}>Review existing podcasts</Button>
                              </div>
                            ) : 'No podcasts match this view.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-col gap-2 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-muted-foreground">
                    {filteredRows.length === 0 ? '0 results' : `${((resultPage - 1) * RESULTS_PER_PAGE) + 1}–${Math.min(resultPage * RESULTS_PER_PAGE, filteredRows.length)} of ${filteredRows.length}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={resultPage <= 1} onClick={() => setResultPage((page) => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous page</span></Button>
                    <span>Page {resultPage} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={resultPage >= totalPages} onClick={() => setResultPage((page) => Math.min(totalPages, page + 1))}><ChevronRight className="h-4 w-4" /><span className="sr-only">Next page</span></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {!isDiscovering && results.length === 0 && selectedClient && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 rounded-full bg-primary/10 p-4"><Layers3 className="h-7 w-7 text-primary" /></div>
              <h2 className="text-lg font-semibold">Ready for {selectedClient.name}’s weekly discovery</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Each run gathers broad matches, removes duplicates within the search, and hides podcasts already saved for this {targetLabel}.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-3 bottom-3 z-40 lg:left-[268px]">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-2xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{selectedIds.size}</div>
              <div><p className="text-sm font-semibold">{selectedIds.size === 1 ? 'Podcast' : 'Podcasts'} selected for {selectedClient?.name}</p><p className="text-xs text-muted-foreground">{selectedContactableCount} include a direct email</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleBulkTier('a')}>Tier A</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkTier('b')}>Tier B</Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkTier('c')}>Tier C</Button>
              <Button variant="outline" size="sm" onClick={handleBulkExclude}><Archive className="mr-2 h-4 w-4" /> Exclude</Button>
              <Button size="sm" onClick={() => setAddDialogOpen(true)} disabled={selectedResults.length === 0}><ListPlus className="mr-2 h-4 w-4" /> Add {selectedResults.length} to shortlist</Button>
              <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4" /><span className="sr-only">Clear selection</span></Button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={Boolean(detailId)} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedDetail && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-start gap-3 pr-8">
                  {selectedDetail.podcast.podcast_image_url ? <img src={selectedDetail.podcast.podcast_image_url} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <div className="h-14 w-14 rounded-lg bg-muted" />}
                  <div className="min-w-0"><SheetTitle>{selectedDetail.podcast.podcast_name}</SheetTitle><SheetDescription>{selectedDetail.podcast.publisher_name || 'Publisher unavailable'}</SheetDescription></div>
                </div>
              </SheetHeader>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={tierClasses(selectedDetail.tier)}>{tierLabel(selectedDetail.tier)}</Badge>
                {selectedDetail.existing && <Badge variant="secondary">Already used for this {targetLabel}</Badge>}
                {selectedDetail.sources.map((source) => <Badge key={source} variant="secondary">{source}</Badge>)}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Relevance</p><p className="mt-1 text-xl font-semibold">{selectedDetail.relevanceScore ?? '—'}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Outreach</p><p className="mt-1 text-xl font-semibold">{selectedDetail.outreach.score}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-1 text-xl font-semibold">{compactNumber(selectedDetail.podcast.reach?.audience_size)}</p></div>
              </div>

              <section>
                <h3 className="text-sm font-semibold">Why it fits</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{resultReason(selectedDetail)}</p>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Outreach priority breakdown</h3>
                <div className="mt-2 divide-y rounded-lg border">
                  {selectedDetail.outreach.factors.map((factor) => (
                    <div key={factor.label} className="flex items-start justify-between gap-4 p-3 text-sm">
                      <div><p className="font-medium">{factor.label}</p><p className="text-xs text-muted-foreground">{factor.detail}</p></div>
                      <span className="font-semibold">+{factor.points}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Podcast profile</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedDetail.podcast.podcast_description || 'No description available.'}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Last episode</dt><dd>{formatDate(selectedDetail.podcast.last_posted_at)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Episodes</dt><dd>{selectedDetail.podcast.episode_count?.toLocaleString() || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Guest format</dt><dd>{selectedDetail.podcast.podcast_has_guests === true ? 'Confirmed' : selectedDetail.podcast.podcast_has_guests === false ? 'Not detected' : 'Unknown'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="truncate">{selectedDetail.podcast.reach?.email || 'Unavailable'}</dd></div>
                </dl>
              </section>

              {selectedDetail.matchedQueries.length > 0 && (
                <section><h3 className="text-sm font-semibold">Matched searches</h3><div className="mt-2 space-y-2">{selectedDetail.matchedQueries.map((query) => <code key={query} className="block rounded bg-muted px-3 py-2 text-xs">{query}</code>)}</div></section>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => void handleEnrichDetail()} disabled={isEnriching}>{isEnriching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Load full profile</Button>
                <Button asChild disabled={!safeExternalUrl(selectedDetail.podcast.podcast_url)}><a href={safeExternalUrl(selectedDetail.podcast.podcast_url) ?? undefined} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Open Podscan</a></Button>
              </div>

              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={selectedDetail.existing} onClick={() => applyTierToIds([selectedDetail.podcast.podcast_id], 'a')}>Tier A</Button>
                <Button size="sm" variant="outline" disabled={selectedDetail.existing} onClick={() => applyTierToIds([selectedDetail.podcast.podcast_id], 'b')}>Tier B</Button>
                <Button size="sm" variant="outline" disabled={selectedDetail.existing} onClick={() => applyTierToIds([selectedDetail.podcast.podcast_id], 'c')}>Tier C</Button>
                <Button size="sm" variant="destructive" disabled={selectedDetail.existing} onClick={() => { setExcludedIds((current) => new Set([...current, selectedDetail.podcast.podcast_id])); setDetailId(null) }}><Trash2 className="mr-2 h-4 w-4" /> Exclude</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={scopeResetOpen} onOpenChange={setScopeResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isTargetBound ? 'Start a new search?' : isClientSelectable ? 'Change client?' : 'Start research for another client?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isTargetBound
                ? `This clears the current tab’s queries, results, scores, tiers, and selection for ${selectedClient?.name}. The workspace and ${targetLabel} stay fixed.`
                : isClientSelectable
                  ? 'This clears the current queries, results, scores, tiers, and selection. The client selector will become editable again.'
                  : 'This clears the current tab’s queries, results, scores, tiers, and selection. The workspace and client will become editable again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this run</AlertDialogCancel>
            <AlertDialogAction onClick={() => { resetResearch(); setScopeResetOpen(false) }}>
              {isTargetBound ? 'Clear and restart' : 'Clear and switch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {selectedResults.length} podcasts to the shortlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This list is locked to {selectedClient?.name} in {selectedWorkspace?.name}. {selectedContactableCount} selected podcasts include a direct email.
              {isProspectBound ? ' If the dashboard is live, it will return to Review before these changes become public.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-muted/25 p-3 text-sm"><p className="font-medium">Destination</p><p className="text-muted-foreground">{selectedClient?.name}’s {isProspectBound ? 'Prospect Studio shortlist' : 'private approval shortlist'}</p></div>
          <AlertDialogFooter><AlertDialogCancel disabled={isAdding}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void handleAddToShortlist() }} disabled={isAdding}>{isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListPlus className="mr-2 h-4 w-4" />} Add to shortlist</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return isWorkspaceScoped
    ? <WorkspaceLayout platformWorkspace={platformWorkspaceConfig}>{pageContent}</WorkspaceLayout>
    : <DashboardLayout>{pageContent}</DashboardLayout>
}
