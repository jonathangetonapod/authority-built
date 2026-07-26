import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { generatePodcastQueries } from '@/services/queryGeneration'
import { searchPodcastsWithMeta, type PodcastData } from '@/services/podscan'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { addClientShortlistPodcasts, type ClientShortlistPodcastInput } from '@/services/clientShortlist'
import { safeExternalUrl } from '@/lib/externalUrl'

interface ScanResult {
  podcast: PodcastData
  score: number | null
  reasoning: string | null
}

type ScanPhase = 'idle' | 'strategy' | 'search' | 'score' | 'done'

const MAX_QUERIES = 6
const PAGES_PER_QUERY = 2
const MAX_SCORED = 60
const SEARCH_SPACING_MS = 525

const phaseSteps: Array<{ id: Exclude<ScanPhase, 'idle' | 'done'>; label: string }> = [
  { id: 'strategy', label: 'Building the search strategy from the client profile' },
  { id: 'search', label: 'Searching active guest-interview podcasts' },
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
    compatibility_score: result.score === null ? null : result.score / 10,
    compatibility_reasoning: result.reasoning ?? undefined,
  }
}

function scoreBadgeClass(score: number | null): string {
  if (score === null) return 'border-border bg-muted text-muted-foreground'
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-border bg-muted text-muted-foreground'
}

const WorkspaceSmartPodcastFinder = () => {
  const { workspace } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const workspaceId = (workspace?.id || '').toLowerCase()
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

  const scanning = phase !== 'idle' && phase !== 'done'

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
      setStatusMessage(`Reading ${selectedClient.name}’s profile and drafting search angles…`)
      const queries = (await generatePodcastQueries({ workspaceId, clientId })).slice(0, MAX_QUERIES)
      if (queries.length === 0) throw new Error('No search strategy could be generated for this client.')

      setPhase('search')
      const minPostedAt = new Date()
      minPostedAt.setDate(minPostedAt.getDate() - 90)
      const collected = new Map<string, PodcastData>()
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
              has_guests: true,
              min_last_episode_posted_at: minPostedAt.toISOString().slice(0, 10),
            }, workspaceId)
            const podcasts = response.data.podcasts || []
            for (const podcast of podcasts) {
              const key = podcast.podcast_id.toLowerCase()
              if (!collected.has(key)) collected.set(key, podcast)
            }
            if (podcasts.length === 0) {
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
      const candidates = [...collected.values()]
        .filter((podcast) => !existingPodcastIds.has(podcast.podcast_id.toLowerCase()))
        .slice(0, MAX_SCORED)
      if (candidates.length === 0) {
        setPhase('done')
        setStatusMessage('')
        toast.info('No new podcasts were found. Everything discovered is already on this client’s list.')
        return
      }

      setPhase('score')
      setProgress({ completed: 0, total: candidates.length })
      setStatusMessage(`Comparing ${candidates.length} podcasts against ${selectedClient.name}’s profile…`)
      const scores = await scoreCompatibilityBatch(
        clientBio,
        candidates.map((podcast) => ({
          podcast_id: podcast.podcast_id,
          podcast_name: podcast.podcast_name,
          podcast_description: podcast.podcast_description,
          publisher_name: podcast.publisher_name,
          podcast_categories: podcast.podcast_categories,
          audience_size: podcast.reach?.audience_size,
          episode_count: podcast.episode_count,
        })),
        10,
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
      toast.success(`${ranked.length} podcasts ranked for ${selectedClient.name}.`)
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
    <WorkspaceLayout>
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
                No active clients yet. <Link className="font-medium underline underline-offset-2" to="/app/clients">Add your first client</Link>.
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
                            podcast.reach?.audience_size ? `${Number(podcast.reach.audience_size).toLocaleString()} listeners` : null,
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
                or use the <Link className="font-medium underline underline-offset-2" to="/app/podcast-finder/advanced">advanced finder</Link> for a wider net.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceSmartPodcastFinder
