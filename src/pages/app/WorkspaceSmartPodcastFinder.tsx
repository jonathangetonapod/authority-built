import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { normalizePodscanQuery } from '@/lib/podcastResearch'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { generatePodcastQueries } from '@/services/queryGeneration'
import { searchPodcastsWithMeta, type PodcastData } from '@/services/podscan'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import {
  addClientShortlistPodcasts,
  searchClientPodcastCatalog,
  type ClientShortlistCatalogPodcast,
  type ClientShortlistPodcastInput,
} from '@/services/clientShortlist'
import { safeExternalUrl } from '@/lib/externalUrl'

// One normalized shape for both discovery sources: the shared internal
// catalog and live Podscan search.
interface ScanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  podcast_image_url?: string | null
  podcast_url?: string | null
  publisher_name?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  audience_size?: number | null
  last_posted_at?: string | null
  language?: string | null
  region?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  podcast_categories?: Array<{ category_id: string; category_name: string }> | null
  source: 'database' | 'podscan'
}

interface ScanResult {
  podcast: ScanPodcast
  score: number | null
  reasoning: string | null
}

type ScanPhase = 'idle' | 'strategy' | 'search' | 'score' | 'done'

const MAX_QUERIES = 6
const PAGES_PER_QUERY = 3
const MAX_SCORED = 100
// Matches the server's per-request cap; anything smaller costs extra credits.
const SCORING_BATCH_SIZE = 20
const SEARCH_SPACING_MS = 525

function fromPodscan(podcast: PodcastData): ScanPodcast {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description ?? null,
    podcast_image_url: podcast.podcast_image_url ?? null,
    podcast_url: podcast.podcast_url ?? null,
    publisher_name: podcast.publisher_name ?? null,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average
      ? Number.parseFloat(podcast.reach.itunes.itunes_rating_average)
      : null,
    episode_count: podcast.episode_count ?? null,
    audience_size: podcast.reach?.audience_size ?? null,
    last_posted_at: podcast.last_posted_at ?? null,
    language: podcast.language ?? null,
    region: podcast.region ?? null,
    podcast_email: podcast.reach?.email ?? null,
    rss_feed: podcast.rss_url ?? null,
    podcast_categories: podcast.podcast_categories ?? null,
    source: 'podscan',
  }
}

function fromCatalog(podcast: ClientShortlistCatalogPodcast): ScanPodcast {
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
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.podcast_email,
    rss_feed: podcast.rss_feed,
    podcast_categories: podcast.podcast_categories,
    source: 'database',
  }
}

const LANGUAGE_OPTIONS = [
  { value: 'any', label: 'Any language' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
]
const REGION_OPTIONS = [
  { value: 'any', label: 'Any region' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
]
const ACTIVITY_OPTIONS = [
  { value: '30', label: 'Active in last 30 days' },
  { value: '90', label: 'Active in last 90 days' },
  { value: '180', label: 'Active in last 6 months' },
  { value: '365', label: 'Active in last year' },
  { value: 'any', label: 'Any activity' },
]

const phaseSteps: Array<{ id: Exclude<ScanPhase, 'idle' | 'done'>; label: string }> = [
  { id: 'strategy', label: 'Building the search strategy from the client profile' },
  { id: 'search', label: 'Searching the shared database and Podscan' },
  { id: 'score', label: 'Scoring every match against the client with AI' },
]

function toShortlistInput(result: ScanResult): ClientShortlistPodcastInput {
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
    itunes_rating: podcast.itunes_rating ?? undefined,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.podcast_email,
    rss_feed: podcast.rss_feed,
    podcast_categories: podcast.podcast_categories,
    compatibility_score: result.score === null ? null : result.score / 10,
    compatibility_reasoning: result.reasoning ?? undefined,
  }
}

const FieldHint = ({ text }: { text: string }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={text} className="inline-flex cursor-help text-muted-foreground/70 hover:text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-5">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

function scoreBadgeClass(score: number | null): string {
  if (score === null) return 'border-border bg-muted text-muted-foreground'
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-border bg-muted text-muted-foreground'
}

interface WorkspaceSmartPodcastFinderProps {
  /**
   * Set when a platform admin is viewing a tenant. The Smart Finder used to be
   * unreachable in that view — the platform address resolved to the advanced
   * finder instead — so the same sidebar item opened a different page depending
   * on who clicked it.
   */
  platformWorkspaceId?: string
}

const WorkspaceSmartPodcastFinder = ({ platformWorkspaceId }: WorkspaceSmartPodcastFinderProps) => {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(workspaceId) : '/app'

  // The shell names and brands the workspace on screen, which in the platform
  // view is not the one in AuthContext.
  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', workspaceId, 'smart-finder'],
    queryFn: ({ signal }) => getAdminWorkspaceView(workspaceId, signal),
    enabled: isPlatformWorkspace && Boolean(workspaceId),
    retry: false,
    gcTime: 0,
  })
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined
  const [clientId, setClientId] = useState((searchParams.get('client') || '').toLowerCase())

  const clientsQuery = useQuery({
    queryKey: ['workspace-clients', workspaceId],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: Boolean(workspaceId),
  })
  const activeClients = useMemo(
    () => (clientsQuery.data || []).filter((client) => client.status === 'active'),
    [clientsQuery.data],
  )
  const selectedClient = activeClients.find((client) => client.id.toLowerCase() === clientId) || null

  const contextQuery = useQuery({
    queryKey: ['workspace-research-context', workspaceId, clientId],
    queryFn: () => getWorkspaceResearchContext(workspaceId, clientId),
    enabled: Boolean(workspaceId && clientId),
    retry: false,
  })
  const clientBio = contextQuery.data?.client.bio || null
  const existingPodcastIds = useMemo(
    () => new Set((contextQuery.data?.existing_podcast_ids || []).map((id) => id.toLowerCase())),
    [contextQuery.data?.existing_podcast_ids],
  )

  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const [results, setResults] = useState<ScanResult[]>([])
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [isAdding, setIsAdding] = useState(false)
  const scanRunId = useRef(0)

  const [customKeywords, setCustomKeywords] = useState<string[]>([])
  const [keywordDraft, setKeywordDraft] = useState('')
  const [aiQueries, setAiQueries] = useState<string[]>([])
  const [aiStrategyLoaded, setAiStrategyLoaded] = useState(false)
  const [includeAiStrategy, setIncludeAiStrategy] = useState(true)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [language, setLanguage] = useState('en')
  const [region, setRegion] = useState('any')
  const [activityDays, setActivityDays] = useState('90')
  const [guestsOnly, setGuestsOnly] = useState(true)
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [minEpisodes, setMinEpisodes] = useState('')

  const scanning = phase !== 'idle' && phase !== 'done'
  const activeFilterCount = [
    language !== 'en',
    region !== 'any',
    activityDays !== '90',
    !guestsOnly,
    minAudience !== '',
    maxAudience !== '',
    minEpisodes !== '',
    customKeywords.length > 0,
    !includeAiStrategy,
  ].filter(Boolean).length

  const addKeyword = () => {
    const normalized = normalizePodscanQuery(keywordDraft)
    if (!normalized) return
    if (customKeywords.includes(normalized)) {
      toast.info('That keyword is already in the search.')
      return
    }
    setCustomKeywords((current) => [...current, normalized])
    setKeywordDraft('')
  }

  const regenerateStrategy = async () => {
    if (!workspaceId || !clientId || !clientBio || isRegenerating) return
    setIsRegenerating(true)
    try {
      // Regenerating should look somewhere else, not draft the same angles
      // again. The advanced finder already asks this way.
      const generated = (await generatePodcastQueries({
        workspaceId,
        clientId,
        ...(aiQueries.length > 0 ? { avoidQueries: aiQueries } : {}),
      }))
        .map(normalizePodscanQuery)
        .filter(Boolean)
        .slice(0, MAX_QUERIES)
      setAiQueries(generated)
      setAiStrategyLoaded(true)
      toast.success('Fresh AI search strategy is ready — edit it below before scanning.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The search strategy could not be generated.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const runScan = async () => {
    if (!workspaceId || !clientId || !selectedClient || scanning) return
    if (!clientBio) {
      toast.error('Add a client profile (bio) before scanning — the AI needs it to judge relevancy.')
      return
    }
    const runId = scanRunId.current + 1
    scanRunId.current = runId
    setResults([])
    setAddedIds(new Set())
    setProgress(null)

    try {
      setPhase('strategy')
      let strategyQueries = aiQueries
      // A previewed-then-edited strategy is authoritative, even if the owner
      // removed every query — only draft one when none was ever loaded.
      if (includeAiStrategy && strategyQueries.length === 0 && !aiStrategyLoaded) {
        setStatusMessage(`Reading ${selectedClient.name}’s profile and drafting search angles…`)
        strategyQueries = (await generatePodcastQueries({ workspaceId, clientId }))
          .map(normalizePodscanQuery)
          .filter(Boolean)
          .slice(0, MAX_QUERIES)
        setAiQueries(strategyQueries)
        setAiStrategyLoaded(true)
      }
      const queries = Array.from(new Set([
        ...customKeywords,
        ...(includeAiStrategy ? strategyQueries : []),
      ])).slice(0, MAX_QUERIES + customKeywords.length)
      if (queries.length === 0) {
        throw new Error('Add at least one keyword or turn the AI search strategy back on.')
      }

      setPhase('search')
      const minPostedAt = new Date()
      if (activityDays !== 'any') minPostedAt.setDate(minPostedAt.getDate() - Number.parseInt(activityDays, 10))
      const collected = new Map<string, ScanPodcast>()
      const collect = (podcast: ScanPodcast) => {
        const key = podcast.podcast_id.toLowerCase()
        if (!collected.has(key)) collected.set(key, podcast)
      }
      const matchesFilters = (podcast: ScanPodcast) => {
        if (minAudience && (podcast.audience_size ?? 0) < Number.parseInt(minAudience, 10)) return false
        if (maxAudience && (podcast.audience_size ?? 0) > Number.parseInt(maxAudience, 10)) return false
        if (minEpisodes && (podcast.episode_count ?? 0) < Number.parseInt(minEpisodes, 10)) return false
        if (language !== 'any' && podcast.language && podcast.language !== language) return false
        if (region !== 'any' && podcast.region && podcast.region !== region) return false
        if (activityDays !== 'any' && podcast.last_posted_at
          && Date.parse(podcast.last_posted_at) < minPostedAt.getTime()) return false
        return true
      }

      // The shared internal database first — instant, free of Podscan rate
      // limits, and already enriched by every workspace on the platform.
      setStatusMessage('Checking the shared podcast database…')
      for (const query of queries) {
        if (scanRunId.current !== runId) return
        try {
          const catalogPodcasts = await searchClientPodcastCatalog(workspaceId, clientId, query)
          for (const podcast of catalogPodcasts) {
            const normalized = fromCatalog(podcast)
            if (matchesFilters(normalized)) collect(normalized)
          }
        } catch (error) {
          console.error('Smart scan catalog search failed:', error)
        }
      }
      if (collected.size > 0) {
        setStatusMessage(`${collected.size.toLocaleString()} matches in the shared database — expanding with Podscan…`)
      }

      const totalRequests = queries.length * PAGES_PER_QUERY
      let completedRequests = 0
      for (const query of queries) {
        for (let page = 1; page <= PAGES_PER_QUERY; page += 1) {
          if (scanRunId.current !== runId) return
          try {
            const response = await searchPodcastsWithMeta({
              query,
              page,
              per_page: 50,
              order_by: 'best_match',
              order_dir: 'desc',
              search_fields: 'name,description,publisher_name',
              ...(guestsOnly ? { has_guests: true } : {}),
              ...(language !== 'any' ? { language } : {}),
              ...(region !== 'any' ? { region } : {}),
              ...(activityDays !== 'any' ? { min_last_episode_posted_at: minPostedAt.toISOString().slice(0, 10) } : {}),
              ...(minAudience ? { min_audience_size: Number.parseInt(minAudience, 10) } : {}),
              ...(maxAudience ? { max_audience_size: Number.parseInt(maxAudience, 10) } : {}),
              ...(minEpisodes ? { min_episode_count: Number.parseInt(minEpisodes, 10) } : {}),
            }, workspaceId)
            const podcasts = response.data.podcasts || []
            for (const podcast of podcasts) collect(fromPodscan(podcast))
            const lastPage = Number.parseInt(String(response.data.pagination?.last_page ?? PAGES_PER_QUERY), 10)
            if (podcasts.length === 0 || page >= lastPage) {
              completedRequests += PAGES_PER_QUERY - page + 1
              break
            }
          } catch (error) {
            console.error('Smart scan search page failed:', error)
          }
          completedRequests += 1
          setProgress({ completed: completedRequests, total: totalRequests })
          setStatusMessage(`${collected.size.toLocaleString()} unique podcasts found so far…`)
          if (completedRequests < totalRequests) {
            await new Promise((resolve) => window.setTimeout(resolve, SEARCH_SPACING_MS))
          }
        }
      }
      if (scanRunId.current !== runId) return
      const fresh = [...collected.values()]
        .filter((podcast) => !existingPodcastIds.has(podcast.podcast_id.toLowerCase()))
      const candidates = fresh.slice(0, MAX_SCORED)
      const droppedCount = fresh.length - candidates.length
      if (candidates.length === 0) {
        setPhase('done')
        setStatusMessage('')
        toast.info('No new podcasts were found. Everything discovered is already on this client’s list.')
        return
      }

      setPhase('score')
      setProgress({ completed: 0, total: candidates.length })
      setStatusMessage(droppedCount > 0
        ? `Comparing the first ${candidates.length} of ${fresh.length} new podcasts against ${selectedClient.name}’s profile…`
        : `Comparing ${candidates.length} podcasts against ${selectedClient.name}’s profile…`)
      const scores = await scoreCompatibilityBatch(
        clientBio,
        candidates.map((podcast) => ({
          podcast_id: podcast.podcast_id,
          podcast_name: podcast.podcast_name,
          podcast_description: podcast.podcast_description ?? undefined,
          publisher_name: podcast.publisher_name ?? undefined,
          podcast_categories: podcast.podcast_categories ?? undefined,
          audience_size: podcast.audience_size ?? undefined,
          episode_count: podcast.episode_count ?? undefined,
        })),
        // The endpoint scores up to 20 per request and charges one credit per
        // request, so sending tens paid twice for the same work.
        SCORING_BATCH_SIZE,
        (completed, total) => {
          setProgress({ completed, total })
          setStatusMessage(`Scored ${completed} of ${total} podcasts…`)
        },
        false,
        { workspaceId, clientId },
      )
      if (scanRunId.current !== runId) return
      const scoreById = new Map(scores.map((score) => [score.podcast_id, score]))
      const ranked = candidates
        .map((podcast): ScanResult => {
          const score = scoreById.get(podcast.podcast_id)
          return {
            podcast,
            score: score?.score ?? null,
            reasoning: score?.reasoning ?? null,
          }
        })
        .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
      setResults(ranked)
      setPhase('done')
      setStatusMessage('')
      // An unscored row is not a low score, and a truncated list is not the
      // whole market. Saying "ranked" for either would be a claim the scan
      // did not earn.
      const unscored = ranked.filter((result) => result.score === null).length
      const notes = [
        unscored > 0 ? `${unscored} could not be scored` : null,
        droppedCount > 0 ? `${droppedCount} more found but not scored` : null,
      ].filter(Boolean).join(', ')
      if (notes) toast.warning(`${ranked.length - unscored} ranked for ${selectedClient.name} — ${notes}.`)
      else toast.success(`${ranked.length} podcasts ranked for ${selectedClient.name}.`)
    } catch (error) {
      setPhase('idle')
      setStatusMessage('')
      toast.error(error instanceof Error ? error.message : 'The scan could not be completed.')
    }
  }

  const addPodcasts = async (toAdd: ScanResult[]) => {
    if (!workspaceId || !clientId || toAdd.length === 0 || isAdding) return
    setIsAdding(true)
    try {
      const response = await addClientShortlistPodcasts(workspaceId, clientId, toAdd.map(toShortlistInput))
      setAddedIds((current) => new Set([...current, ...toAdd.map((result) => result.podcast.podcast_id)]))
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-context', workspaceId, clientId] })
      const skippedNote = response.skipped > 0 ? ` (${response.skipped} already on the list)` : ''
      toast.success(`${response.added} podcast${response.added === 1 ? '' : 's'} added to ${selectedClient?.name || 'the client'}’s list${skippedNote}.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The podcasts could not be added.')
    } finally {
      setIsAdding(false)
    }
  }

  const pendingTop = results.filter((result) => !addedIds.has(result.podcast.podcast_id)).slice(0, 10)
  const currentStepIndex = phaseSteps.findIndex((step) => step.id === phase)

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Podcast Finder</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One scan finds active guest-interview podcasts and ranks every match against your client with AI.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="w-fit text-muted-foreground">
            <Link to={`/app/podcast-finder/advanced${clientId ? `?client=${encodeURIComponent(clientId)}` : ''}`}>
              Advanced finder
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Who are we booking?</CardTitle>
            <CardDescription>Pick a client — their profile drives the whole scan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Select
                value={clientId || undefined}
                onValueChange={(value) => {
                  setClientId(value.toLowerCase())
                  setResults([])
                  setAiQueries([])
                  setAiStrategyLoaded(false)
                  setPhase('idle')
                }}
                disabled={scanning}
              >
                <SelectTrigger className="sm:max-w-sm" aria-label="Client">
                  <SelectValue placeholder={clientsQuery.isLoading ? 'Loading clients…' : 'Choose a client'} />
                </SelectTrigger>
                <SelectContent>
                  {activeClients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => void runScan()}
                disabled={!selectedClient || scanning || contextQuery.isLoading}
                className="sm:w-auto"
              >
                {scanning
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Sparkles className="mr-2 h-4 w-4" />}
                {scanning
                  ? 'Scanning…'
                  : results.length > 0
                    ? 'Scan again'
                    : selectedClient
                      ? `Scan podcasts for ${selectedClient.name}`
                      : 'Scan podcasts'}
              </Button>
            </div>
              <div className="space-y-5 rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  Refine the search{activeFilterCount > 0 ? ` · ${activeFilterCount} setting${activeFilterCount === 1 ? '' : 's'} changed` : ''}
                </p>
                <div>
                  <span className="flex items-center gap-1.5">
                    <Label htmlFor="finder-keyword" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your keywords</Label>
                    <FieldHint text='Search terms you choose yourself, searched in addition to the AI strategy. Quotes match exact phrases ("founder led sales"), and AND / OR / NOT combine terms.' />
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">Run alongside the AI strategy. Quotes match exact phrases, AND/OR/NOT work too.</p>
                  {customKeywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {customKeywords.map((keyword) => (
                        <Badge key={keyword} variant="secondary" className="gap-1 pr-1 font-normal">
                          {keyword}
                          <button
                            type="button"
                            aria-label={`Remove keyword ${keyword}`}
                            className="rounded-full p-0.5 hover:bg-background/80"
                            onClick={() => setCustomKeywords((current) => current.filter((entry) => entry !== keyword))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="finder-keyword"
                      value={keywordDraft}
                      placeholder='e.g. "founder led sales" OR bootstrapping'
                      className="sm:max-w-md"
                      onChange={(event) => setKeywordDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addKeyword()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addKeyword} disabled={!keywordDraft.trim()}>Add</Button>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch id="finder-ai-strategy" checked={includeAiStrategy} onCheckedChange={setIncludeAiStrategy} />
                      <Label htmlFor="finder-ai-strategy" className="text-sm font-medium">AI search strategy</Label>
                      <FieldHint text="The AI reads the client profile and drafts search angles automatically. Preview it to see and edit the queries before the scan runs, or switch it off to search only your own keywords." />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void regenerateStrategy()}
                      disabled={!clientBio || isRegenerating || !includeAiStrategy || scanning}
                    >
                      {isRegenerating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
                      {aiQueries.length > 0 ? 'Regenerate' : 'Preview strategy'}
                    </Button>
                  </div>
                  {includeAiStrategy && aiQueries.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {aiQueries.map((query) => (
                        <Badge key={query} variant="outline" className="gap-1 pr-1 font-normal">
                          <Sparkles className="h-3 w-3 text-violet-500" />
                          {query}
                          <button
                            type="button"
                            aria-label={`Remove AI query ${query}`}
                            className="rounded-full p-0.5 hover:bg-muted"
                            onClick={() => setAiQueries((current) => current.filter((entry) => entry !== query))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {includeAiStrategy && aiQueries.length === 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Drafted from the client profile when the scan starts — preview it to edit first.</p>
                  )}
                  {!includeAiStrategy && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Off — only your keywords above will be searched.</p>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">Language</Label>
                      <FieldHint text="Only include podcasts published in this language." />
                    </span>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger aria-label="Language" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">Region</Label>
                      <FieldHint text="Where the show is based. Useful when the client wants audiences in a specific market." />
                    </span>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger aria-label="Region" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REGION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">Recency</Label>
                      <FieldHint text="How recently the show must have published an episode. Inactive shows rarely book guests." />
                    </span>
                    <Select value={activityDays} onValueChange={setActivityDays}>
                      <SelectTrigger aria-label="Recency" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label htmlFor="finder-min-audience" className="text-xs text-muted-foreground">Min audience</Label>
                      <FieldHint text="Skip shows with fewer estimated listeners per episode than this." />
                    </span>
                    <Input
                      id="finder-min-audience"
                      type="number"
                      min="0"
                      className="mt-1"
                      placeholder="Any"
                      value={minAudience}
                      onChange={(event) => setMinAudience(event.target.value)}
                    />
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label htmlFor="finder-max-audience" className="text-xs text-muted-foreground">Max audience</Label>
                      <FieldHint text="Cap the audience size — smaller shows reply more often and are easier to land early wins on." />
                    </span>
                    <Input
                      id="finder-max-audience"
                      type="number"
                      min="0"
                      className="mt-1"
                      placeholder="Any"
                      value={maxAudience}
                      onChange={(event) => setMaxAudience(event.target.value)}
                    />
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5">
                      <Label htmlFor="finder-min-episodes" className="text-xs text-muted-foreground">Min episodes</Label>
                      <FieldHint text="Filters out brand-new shows. 10+ episodes signals the podcast is here to stay." />
                    </span>
                    <Input
                      id="finder-min-episodes"
                      type="number"
                      min="0"
                      className="mt-1"
                      placeholder="Any"
                      value={minEpisodes}
                      onChange={(event) => setMinEpisodes(event.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch id="finder-guests-only" checked={guestsOnly} onCheckedChange={setGuestsOnly} />
                    <Label htmlFor="finder-guests-only" className="text-sm">Guest-interview shows only</Label>
                    <FieldHint text="Only shows that actually host guests. Turn off to include solo and narrative formats too." />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => {
                      setCustomKeywords([])
                      setKeywordDraft('')
                      setAiQueries([])
                      setAiStrategyLoaded(false)
                      setIncludeAiStrategy(true)
                      setLanguage('en')
                      setRegion('any')
                      setActivityDays('90')
                      setGuestsOnly(true)
                      setMinAudience('')
                      setMaxAudience('')
                      setMinEpisodes('')
                    }}
                  >
                    Reset to defaults
                  </Button>
                </div>
              </div>
            {selectedClient && !contextQuery.isLoading && !clientBio && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
                {selectedClient.name} has no profile bio yet, so the AI has nothing to match against.{' '}
                <Link className="font-semibold underline underline-offset-2" to={`/app/clients/${selectedClient.id}`}>
                  Add their profile first
                </Link>.
              </p>
            )}
            {activeClients.length === 0 && !clientsQuery.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                No active clients yet. <Link className="font-medium underline underline-offset-2" to={`${baseHref}/clients`}>Add your first client</Link>.
              </p>
            )}
          </CardContent>
        </Card>

        {scanning && (
          <Card role="status" aria-label="Scan progress">
            <CardContent className="space-y-4 pt-6">
              <ol className="space-y-2.5">
                {phaseSteps.map((step, index) => {
                  const state = index < currentStepIndex ? 'complete' : index === currentStepIndex ? 'active' : 'queued'
                  return (
                    <li key={step.id} className="flex items-center gap-2.5 text-sm">
                      {state === 'complete' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                      {state === 'active' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                      {state === 'queued' && <span className="h-4 w-4 shrink-0 rounded-full border border-border" />}
                      <span className={state === 'queued' ? 'text-muted-foreground' : ''}>{step.label}</span>
                    </li>
                  )
                })}
              </ol>
              {progress && progress.total > 0 && (
                <Progress value={Math.round((progress.completed / progress.total) * 100)} />
              )}
              {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
            </CardContent>
          </Card>
        )}

        {phase === 'done' && results.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Ranked by fit for {selectedClient?.name}</CardTitle>
                <CardDescription>Highest AI relevancy first. Adding sends them to the client’s podcast list.</CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void addPodcasts(pendingTop)}
                  disabled={pendingTop.length === 0 || isAdding}
                >
                  {isAdding ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                  Add top {pendingTop.length}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/app/clients/${clientId}`}>Open client list</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/70">
                {results.map((result, index) => {
                  const podcast = result.podcast
                  const added = addedIds.has(podcast.podcast_id)
                  const websiteUrl = safeExternalUrl(podcast.podcast_url)
                  return (
                    <li key={podcast.podcast_id} className="flex items-start gap-4 py-4">
                      <span className="mt-0.5 w-6 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{podcast.podcast_name}</span>
                          <Badge variant="outline" className={scoreBadgeClass(result.score)}>
                            {result.score === null ? 'Unscored' : `${result.score} fit`}
                          </Badge>
                          {podcast.source === 'database' && (
                            <Badge variant="secondary" className="font-normal text-muted-foreground">In your database</Badge>
                          )}
                          {websiteUrl && (
                            <a
                              href={websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label={`Open ${podcast.podcast_name} website`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        {result.reasoning && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{result.reasoning}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            podcast.audience_size ? `${Number(podcast.audience_size).toLocaleString()} listeners` : null,
                            podcast.episode_count ? `${podcast.episode_count.toLocaleString()} episodes` : null,
                            podcast.podcast_categories?.[0]?.category_name || null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={added ? 'ghost' : 'outline'}
                        className="shrink-0"
                        disabled={added || isAdding}
                        onClick={() => void addPodcasts([result])}
                      >
                        {added ? <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-emerald-600" />Added</> : <><Plus className="mr-2 h-3.5 w-3.5" />Add</>}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {phase === 'done' && results.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <RefreshCw className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nothing new this time — every podcast found is already on the list. Try again after updating the client profile,
                or use the <Link className="font-medium underline underline-offset-2" to={`${baseHref}/podcast-finder/advanced`}>advanced finder</Link> for a wider net.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceSmartPodcastFinder
