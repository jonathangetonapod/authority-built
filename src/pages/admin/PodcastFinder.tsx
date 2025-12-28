import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Search,
  Sparkles,
  RefreshCw,
  Loader2,
  Star,
  ExternalLink,
  Filter,
  ChevronDown,
  ChevronUp,
  Users,
  TrendingUp,
  Globe,
  Calendar,
  X,
  Trash2,
  FileText
} from 'lucide-react'
import { getClients } from '@/services/clients'
import { generatePodcastQueries, regenerateQuery } from '@/services/queryGeneration'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { searchPodcasts, getPodcastById, type PodcastData } from '@/services/podscan'
import { deduplicatePodcasts } from '@/services/podcastSearchUtils'
import { exportPodcastsToGoogleSheets, type PodcastExportData } from '@/services/googleSheets'
import { toast } from 'sonner'

interface GeneratedQuery {
  id: string
  text: string
  isEditing: boolean
  isSearching: boolean
  results: PodcastData[]
  isScoring: boolean
  compatibilityScores: Record<string, number | null>
  scoreReasonings: Record<string, string | undefined>
  regenerateAttempts: number
}

export default function PodcastFinder() {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [queries, setQueries] = useState<GeneratedQuery[]>([])
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [scoreModalOpen, setScoreModalOpen] = useState(false)
  const [selectedPodcastForScore, setSelectedPodcastForScore] = useState<{
    podcast: PodcastData
    score: number
    reasoning?: string
  } | null>(null)
  const [podcastDetailsModalOpen, setPodcastDetailsModalOpen] = useState(false)
  const [selectedPodcastDetails, setSelectedPodcastDetails] = useState<PodcastData | null>(null)
  const [loadingPodcastDetails, setLoadingPodcastDetails] = useState(false)

  // Google Sheets Export
  const [selectedPodcasts, setSelectedPodcasts] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)

  // Filters
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [minEpisodes, setMinEpisodes] = useState('')
  const [region, setRegion] = useState('US')
  const [hasGuests, setHasGuests] = useState('true') // Default to only podcasts with guests
  const [hasSponsors, setHasSponsors] = useState('any')
  const [searchFields, setSearchFields] = useState('name,description')
  const [activeOnly, setActiveOnly] = useState(false)

  // Fetch clients
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients()
  })

  const clients = clientsData?.clients || []
  const selectedClientData = clients.find(c => c.id === selectedClient)

  const handleGenerateQueries = async () => {
    if (!selectedClient || !selectedClientData) {
      toast.error('Please select a client first')
      return
    }

    if (!selectedClientData.bio) {
      toast.error('Please add a bio for this client first')
      return
    }

    setIsGenerating(true)

    try {
      const generatedQueries = await generatePodcastQueries({
        clientName: selectedClientData.name,
        clientBio: selectedClientData.bio,
        clientEmail: selectedClientData.email || undefined,
      })

      const queries: GeneratedQuery[] = generatedQueries.map((query, index) => ({
        id: `query-${Date.now()}-${index}`,
        text: query,
        isEditing: false,
        isSearching: false,
        results: [],
        isScoring: false,
        compatibilityScores: {},
        scoreReasonings: {},
        regenerateAttempts: 0
      }))

      setQueries(queries)
      toast.success('Generated 5 AI-powered search queries!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate queries')
      console.error(error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateQuery = async (queryId: string, isAutomatic = false) => {
    if (!selectedClientData || !selectedClientData.bio) return

    const query = queries.find(q => q.id === queryId)
    if (!query) return

    console.log(`handleRegenerateQuery called: queryId=${queryId}, isAutomatic=${isAutomatic}, currentAttempts=${query.regenerateAttempts}`)

    // Limit automatic regenerations to 1 attempt per query (2 total searches)
    if (isAutomatic && query.regenerateAttempts >= 1) {
      console.log(`Query ${queryId} has reached max regeneration attempts (${query.regenerateAttempts}), STOPPING`)
      return
    }

    try {
      if (!isAutomatic) {
        toast.info('Regenerating query...')
      }

      console.log(`Query ${queryId}: Calling AI to regenerate query...`)

      const newQueryText = await regenerateQuery(
        {
          clientName: selectedClientData.name,
          clientBio: selectedClientData.bio,
          clientEmail: selectedClientData.email || undefined,
        },
        query.text
      )

      setQueries(prev => {
        const updated = prev.map(q =>
          q.id === queryId
            ? {
                ...q,
                text: newQueryText,
                results: [],
                compatibilityScores: {},
                scoreReasonings: {},
                regenerateAttempts: isAutomatic ? q.regenerateAttempts + 1 : 0
              }
            : q
        )
        const updatedQuery = updated.find(q => q.id === queryId)
        console.log(`Query ${queryId}: State updated, new regenerateAttempts=${updatedQuery?.regenerateAttempts}`)
        return updated
      })

      if (!isAutomatic) {
        toast.success('Query regenerated!')
      }

      // If automatic, search with the new query after delay
      if (isAutomatic) {
        console.log(`Query ${queryId}: Scheduling next search in 700ms`)
        // Delay to ensure state is updated and respect rate limits
        setTimeout(() => {
          console.log(`Query ${queryId}: Executing scheduled search`)
          handleSearchQuery(queryId)
        }, 700)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate query')
      console.error(error)
    }
  }

  const handleSearchQuery = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query) return

    // HARD STOP: Prevent infinite loops - max 2 total searches per query
    if (query.regenerateAttempts >= 2) {
      console.log(`STOPPED: Query ${queryId} has already been regenerated ${query.regenerateAttempts} times`)
      toast.error(`Query has reached maximum retry limit`)
      return
    }

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isSearching: true } : q
    ))

    try {
      // Build search filters
      const filters: any = {
        query: query.text,
        per_page: 50,
        order_by: 'audience_size',
        order_dir: 'desc',
        language: 'en',
        search_fields: searchFields, // New: Limit search to specific fields
      }

      // Apply optional filters
      if (minAudience) filters.min_audience_size = parseInt(minAudience)
      if (maxAudience) filters.max_audience_size = parseInt(maxAudience)
      if (minEpisodes) filters.min_episode_count = parseInt(minEpisodes)
      if (region !== 'US') filters.region = region
      if (hasGuests === 'true') filters.has_guests = true
      else if (hasGuests === 'false') filters.has_guests = false

      // New: Filter for podcasts with sponsors (professional/monetized)
      if (hasSponsors === 'true') filters.has_sponsors = true
      else if (hasSponsors === 'false') filters.has_sponsors = false

      // New: Filter for active podcasts only (posted in last 6 months)
      if (activeOnly) {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        filters.min_last_episode_posted_at = sixMonthsAgo.toISOString().split('T')[0]
      }

      const response = await searchPodcasts(filters)
      const results = response.podcasts || []

      // Get the current regenerate attempts from state BEFORE updating
      const currentQuery = queries.find(q => q.id === queryId)
      const currentAttempts = currentQuery?.regenerateAttempts || 0

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, results, isSearching: false }
          : q
      ))

      setExpandedQueryId(queryId)

      // Check if we should auto-regenerate due to zero results
      // Use the attempts value we captured BEFORE the state update
      console.log(`Query ${queryId}: Found ${results.length} results, currentAttempts=${currentAttempts}`)

      if (results.length === 0 && currentAttempts < 1) {
        console.log(`Query ${queryId}: Triggering auto-regeneration`)
        toast.warning(`No podcasts found. Trying a different query...`)
        // Add delay to respect rate limits (120/min = ~500ms between requests)
        await new Promise(resolve => setTimeout(resolve, 600))
        // Automatically regenerate and search with new query
        await handleRegenerateQuery(queryId, true)
      } else {
        if (results.length === 0) {
          console.log(`Query ${queryId}: Max attempts reached, stopping`)
          toast.error(`No podcasts found after ${currentAttempts + 1} attempts`)
        } else {
          toast.success(`Found ${results.length} podcasts!`)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Search failed')
      console.error(error)
      setQueries(prev => prev.map(q =>
        q.id === queryId ? { ...q, isSearching: false } : q
      ))
    }
  }

  const handleScanCompatibility = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query || !query.results.length || !selectedClientData) return

    if (!selectedClientData.bio) {
      toast.error('Client bio is required for compatibility scoring')
      return
    }

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isScoring: true } : q
    ))

    try {
      // Map PodcastData to PodcastForScoring format
      const podcastsForScoring = query.results.map(p => ({
        podcast_id: p.podcast_id,
        podcast_name: p.podcast_name,
        podcast_description: p.podcast_description,
        publisher_name: p.publisher_name,
        podcast_categories: p.podcast_categories,
        audience_size: p.reach?.audience_size,
        episode_count: p.episode_count,
      }))

      // Score with progress callback
      const scores = await scoreCompatibilityBatch(
        selectedClientData.bio,
        podcastsForScoring,
        10,
        (completed, total) => {
          // Could add progress indicator in UI here
          console.log(`Scoring progress: ${completed}/${total}`)
        }
      )

      // Build score and reasoning maps
      const scoreMap: Record<string, number | null> = {}
      const reasoningMap: Record<string, string | undefined> = {}
      scores.forEach(s => {
        scoreMap[s.podcast_id] = s.score
        reasoningMap[s.podcast_id] = s.reasoning
      })

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, compatibilityScores: scoreMap, scoreReasonings: reasoningMap, isScoring: false }
          : q
      ))

      // Calculate average score
      const validScores = scores.filter(s => s.score !== null).map(s => s.score!)
      const avgScore = validScores.length > 0
        ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
        : 0

      const highScoreCount = validScores.filter(s => s >= 8).length

      toast.success(
        `Scored ${scores.length} podcasts! Average: ${avgScore.toFixed(1)}/10 • ${highScoreCount} highly compatible (8+)`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to calculate compatibility scores')
      console.error(error)
      setQueries(prev => prev.map(q =>
        q.id === queryId ? { ...q, isScoring: false } : q
      ))
    }
  }

  const handleEditQuery = (queryId: string, newText: string) => {
    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, text: newText } : q
    ))
  }

  const toggleQueryExpanded = (queryId: string) => {
    setExpandedQueryId(prev => prev === queryId ? null : queryId)
  }

  const handleScoreClick = (podcast: PodcastData, query: GeneratedQuery) => {
    const score = query.compatibilityScores[podcast.podcast_id]
    const reasoning = query.scoreReasonings[podcast.podcast_id]

    if (score !== null && score !== undefined) {
      setSelectedPodcastForScore({
        podcast,
        score,
        reasoning
      })
      setScoreModalOpen(true)
    }
  }

  const handleDeletePodcast = (queryId: string, podcastId: string, podcastName: string) => {
    setQueries(prev => prev.map(q => {
      if (q.id === queryId) {
        // Remove the podcast from results
        const updatedResults = q.results.filter(p => p.podcast_id !== podcastId)

        // Remove from scores and reasonings too
        const updatedScores = { ...q.compatibilityScores }
        const updatedReasonings = { ...q.scoreReasonings }
        delete updatedScores[podcastId]
        delete updatedReasonings[podcastId]

        return {
          ...q,
          results: updatedResults,
          compatibilityScores: updatedScores,
          scoreReasonings: updatedReasonings
        }
      }
      return q
    }))

    toast.success(`Removed "${podcastName}" from results`)
  }

  const handlePodcastRowClick = async (podcastId: string) => {
    setLoadingPodcastDetails(true)
    setPodcastDetailsModalOpen(true)

    try {
      const details = await getPodcastById(podcastId)
      setSelectedPodcastDetails(details)
    } catch (error) {
      console.error('Error fetching podcast details:', error)
      toast.error('Failed to load podcast details')
      setPodcastDetailsModalOpen(false)
    } finally {
      setLoadingPodcastDetails(false)
    }
  }

  const handleReset = () => {
    setQueries([])
    setExpandedQueryId(null)
    setSelectedPodcasts(new Set())
    toast.success('Queries cleared')
  }

  // Checkbox selection handlers
  const handleTogglePodcastSelection = (podcastId: string) => {
    setSelectedPodcasts(prev => {
      const newSet = new Set(prev)
      if (newSet.has(podcastId)) {
        newSet.delete(podcastId)
      } else {
        newSet.add(podcastId)
      }
      return newSet
    })
  }

  const handleToggleAllInQuery = (query: GeneratedQuery) => {
    const queryPodcastIds = query.results.map(p => p.podcast_id)
    const allSelected = queryPodcastIds.every(id => selectedPodcasts.has(id))

    setSelectedPodcasts(prev => {
      const newSet = new Set(prev)
      if (allSelected) {
        // Deselect all in this query
        queryPodcastIds.forEach(id => newSet.delete(id))
      } else {
        // Select all in this query
        queryPodcastIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }

  const handleExportToGoogleSheets = async () => {
    if (!selectedClient) {
      toast.error('Please select a client first')
      return
    }

    if (selectedPodcasts.size === 0) {
      toast.error('Please select at least one podcast to export')
      return
    }

    setIsExporting(true)

    try {
      // Collect all selected podcasts from all queries
      const podcastsToExport: PodcastExportData[] = []

      queries.forEach(query => {
        query.results.forEach(podcast => {
          if (selectedPodcasts.has(podcast.podcast_id)) {
            podcastsToExport.push({
              podcast_name: podcast.podcast_name,
              publisher_name: podcast.publisher_name,
              podcast_description: podcast.podcast_description,
              audience_size: podcast.reach?.audience_size,
              episode_count: podcast.episode_count,
              itunes_rating: podcast.itunes_rating,
              podcast_url: podcast.podcast_url,
              podcast_email: podcast.podcast_email,
              rss_feed: podcast.rss_url,
              compatibility_score: query.compatibilityScores[podcast.podcast_id],
              compatibility_reasoning: query.scoreReasonings[podcast.podcast_id],
            })
          }
        })
      })

      const result = await exportPodcastsToGoogleSheets(selectedClient, podcastsToExport)

      toast.success(`Successfully exported ${result.rowsAdded} podcasts to Google Sheets!`)
      setSelectedPodcasts(new Set()) // Clear selection after successful export
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export to Google Sheets')
      console.error('Export error:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSearchAllQueries = async () => {
    if (queries.length === 0) return

    toast.info(`Searching ${queries.length} queries with rate limit delays...`)

    for (const query of queries) {
      if (!query.isSearching && query.text) {
        await handleSearchQuery(query.id)
        // Delay between searches to respect rate limits (120/min = ~600ms)
        await new Promise(resolve => setTimeout(resolve, 700))
      }
    }
  }

  const handleScoreAllResults = async () => {
    const queriesToScore = queries.filter(q => q.results.length > 0 && Object.keys(q.compatibilityScores).length === 0)

    if (queriesToScore.length === 0) {
      toast.error('No unscored results to score')
      return
    }

    for (const query of queriesToScore) {
      await handleScanCompatibility(query.id)
      // Small delay between scoring batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  // Calculate aggregate statistics
  const aggregateStats = () => {
    const allResults = queries.flatMap(q => q.results)
    const uniquePodcasts = deduplicatePodcasts(allResults)

    const allScores = queries.flatMap(q =>
      Object.values(q.compatibilityScores).filter((score): score is number => score !== null)
    )

    const avgScore = allScores.length > 0
      ? allScores.reduce((sum, score) => sum + score, 0) / allScores.length
      : 0

    const highScoreCount = allScores.filter(s => s >= 8).length
    const mediumScoreCount = allScores.filter(s => s >= 5 && s < 8).length

    return {
      totalResults: allResults.length,
      uniquePodcasts: uniquePodcasts.length,
      scoredPodcasts: allScores.length,
      avgScore,
      highScoreCount,
      mediumScoreCount,
    }
  }

  const stats = aggregateStats()

  // Sort results by compatibility score (if available) or audience size
  const getSortedResults = (query: GeneratedQuery) => {
    const hasScores = Object.keys(query.compatibilityScores).length > 0

    if (hasScores) {
      return [...query.results].sort((a, b) => {
        const scoreA = query.compatibilityScores[a.podcast_id] || 0
        const scoreB = query.compatibilityScores[b.podcast_id] || 0
        if (scoreB !== scoreA) return scoreB - scoreA // Sort by score descending
        return (b.reach?.audience_size || 0) - (a.reach?.audience_size || 0) // Then by audience
      })
    }

    return query.results // Return unsorted if no scores
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Podcast Finder</h1>
              <p className="text-lg text-muted-foreground">
                AI-powered podcast discovery with compatibility scoring
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Podscan API Rate Limit</p>
              <p className="text-sm font-semibold text-primary">120 req/min · 2000 req/day</p>
            </div>
          </div>
        </div>

        {/* Export to Google Sheets */}
        {selectedPodcasts.size > 0 && (
          <Card className="border-2 border-green-200 dark:border-green-800 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {selectedPodcasts.size} podcast{selectedPodcasts.size !== 1 ? 's' : ''} selected
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Ready to export to Google Sheets
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPodcasts(new Set())}
                    disabled={isExporting}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={handleExportToGoogleSheets}
                    disabled={isExporting || !selectedClient}
                    size="lg"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FileText className="h-5 w-5 mr-2" />
                        Export to Google Sheets
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Client Selection & Query Generation */}
        <Card className="border-2 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                1
              </div>
              <div>
                <CardTitle className="text-xl">Select Client & Generate Queries</CardTitle>
                <CardDescription className="text-base mt-1">
                  Choose a client and let AI generate optimized podcast search queries
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client-select">Select Client</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger id="client-select">
                    <SelectValue placeholder="Choose a client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  onClick={handleGenerateQueries}
                  disabled={!selectedClient || isGenerating}
                  className="flex-1"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2" />
                      Generate 5 AI Queries
                    </>
                  )}
                </Button>
                {queries.length > 0 && (
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    size="lg"
                    title="Clear all queries and start over"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>

            {selectedClientData && (
              <div className="p-5 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border-2 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-primary">Selected Client</p>
                </div>
                <div className="space-y-2">
                  <p className="text-base">
                    <span className="font-semibold">Name:</span> <span className="text-muted-foreground">{selectedClientData.name}</span>
                  </p>
                  {selectedClientData.email && (
                    <p className="text-base">
                      <span className="font-semibold">Email:</span> <span className="text-muted-foreground">{selectedClientData.email}</span>
                    </p>
                  )}
                </div>
                {selectedClientData.bio ? (
                  <div className="pt-3 border-t-2 border-border/50 mt-3">
                    <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                      Client Bio
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-background/50 p-3 rounded-lg">
                      {selectedClientData.bio}
                    </p>
                  </div>
                ) : (
                  <div className="pt-3 border-t-2 border-border/50 mt-3">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                      <span className="text-lg">⚠️</span>
                      <div>
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">
                          No bio added yet
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-500">
                          Add a bio in the client details page for better AI query generation.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Filters */}
        {queries.length > 0 && (
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    2
                  </div>
                  <div>
                    <CardTitle className="text-xl">Search Filters (Optional)</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Refine your podcast search criteria
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {showFilters ? 'Hide' : 'Show'} Filters
                  {showFilters ? (
                    <ChevronUp className="h-4 w-4 ml-2" />
                  ) : (
                    <ChevronDown className="h-4 w-4 ml-2" />
                  )}
                </Button>
              </div>
            </CardHeader>
            {showFilters && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="min-audience" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Min Audience Size
                    </Label>
                    <Input
                      id="min-audience"
                      type="number"
                      placeholder="e.g., 1000"
                      value={minAudience}
                      onChange={(e) => setMinAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-audience" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Max Audience Size
                    </Label>
                    <Input
                      id="max-audience"
                      type="number"
                      placeholder="e.g., 50000"
                      value={maxAudience}
                      onChange={(e) => setMaxAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min-episodes" className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Min Episodes
                    </Label>
                    <Input
                      id="min-episodes"
                      type="number"
                      placeholder="e.g., 10"
                      value={minEpisodes}
                      onChange={(e) => setMinEpisodes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region" className="text-sm font-semibold flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Region
                    </Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger id="region">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="has-guests" className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-600" />
                      Guest Format ⭐ (Default: Has Guests Only)
                    </Label>
                    <Select value={hasGuests} onValueChange={setHasGuests}>
                      <SelectTrigger id="has-guests" className="border-green-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Format</SelectItem>
                        <SelectItem value="true">✅ Has Guests Only (Recommended)</SelectItem>
                        <SelectItem value="false">No Guests</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="has-sponsors" className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Monetization
                    </Label>
                    <Select value={hasSponsors} onValueChange={setHasSponsors}>
                      <SelectTrigger id="has-sponsors">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="true">Has Sponsors</SelectItem>
                        <SelectItem value="false">No Sponsors</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="search-fields" className="text-sm font-semibold flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Search In
                    </Label>
                    <Select value={searchFields} onValueChange={setSearchFields}>
                      <SelectTrigger id="search-fields">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Podcast Name Only</SelectItem>
                        <SelectItem value="name,description">Name + Description</SelectItem>
                        <SelectItem value="name,description,publisher_name">All Fields</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="active-only" className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Active Podcasts Only
                    </Label>
                    <div className="flex items-center space-x-2 h-10 px-3 border rounded-md bg-background">
                      <input
                        type="checkbox"
                        id="active-only"
                        checked={activeOnly}
                        onChange={(e) => setActiveOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      />
                      <Label htmlFor="active-only" className="text-sm text-muted-foreground cursor-pointer font-normal">
                        Posted in last 6 months
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Aggregate Statistics */}
        {queries.length > 0 && stats.totalResults > 0 && (
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-2 border-blue-200 dark:border-blue-800 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-xl">
                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                Search Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Results</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalResults}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unique Podcasts</p>
                  <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats.uniquePodcasts}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scored</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.scoredPodcasts}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg Score</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {stats.avgScore > 0 ? stats.avgScore.toFixed(1) : '-'}
                  </p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">High Fit (8+)</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.highScoreCount}</p>
                </div>
                <div className="space-y-2 text-center p-3 rounded-lg bg-white/50 dark:bg-black/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medium Fit (5-7)</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.mediumScoreCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Queries */}
        {queries.length > 0 && (
          <Card className="border-2 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg">
                    3
                  </div>
                  <div>
                    <CardTitle className="text-xl">Search Queries & Results</CardTitle>
                    <CardDescription className="text-base mt-1">
                      Edit, regenerate, or search each query. Click "Scan Compatibility" to get AI scores.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSearchAllQueries}
                    disabled={queries.some(q => q.isSearching)}
                    variant="outline"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search All
                  </Button>
                  <Button
                    onClick={handleScoreAllResults}
                    disabled={queries.some(q => q.isScoring) || queries.every(q => q.results.length === 0)}
                    variant="default"
                  >
                    <Star className="h-4 w-4 mr-2" />
                    Score All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {queries.map((query, index) => (
                <div key={query.id} className="border-2 rounded-xl p-5 space-y-4 bg-muted/30">
                  {/* Query Header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" className="font-semibold px-3 py-1 text-sm">
                      Query {index + 1}
                    </Badge>
                    {query.results.length > 0 && (
                      <Badge variant="secondary" className="px-3 py-1">
                        {query.results.length} results
                      </Badge>
                    )}
                    {Object.keys(query.compatibilityScores).length > 0 && (
                      <Badge variant="outline" className="px-3 py-1 border-green-500 text-green-700 dark:text-green-400">
                        <Star className="h-3 w-3 mr-1 fill-green-500" />
                        Scored
                      </Badge>
                    )}
                    {query.regenerateAttempts > 0 && (
                      <Badge variant="outline" className="px-3 py-1 border-amber-500 text-amber-700 dark:text-amber-400">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Auto-refined {query.regenerateAttempts}x
                      </Badge>
                    )}
                  </div>

                  {/* Query Input & Actions */}
                  <div className="flex gap-2">
                    <Input
                      value={query.text}
                      onChange={(e) => handleEditQuery(query.id, e.target.value)}
                      className="flex-1 font-mono text-sm"
                      placeholder="Enter search query..."
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleRegenerateQuery(query.id)}
                      title="Regenerate this query"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => handleSearchQuery(query.id)}
                      disabled={query.isSearching || !query.text}
                      className="flex-1 min-w-[140px]"
                    >
                      {query.isSearching ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4 mr-2" />
                          Search Podcasts
                        </>
                      )}
                    </Button>

                    {query.results.length > 0 && (
                      <>
                        <Button
                          onClick={() => handleScanCompatibility(query.id)}
                          disabled={query.isScoring}
                          variant="secondary"
                          className="flex-1 min-w-[160px]"
                        >
                          {query.isScoring ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Scoring...
                            </>
                          ) : (
                            <>
                              <Star className="h-4 w-4 mr-2" />
                              Scan Compatibility
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={() => toggleQueryExpanded(query.id)}
                          variant="outline"
                          className="min-w-[130px]"
                        >
                          {expandedQueryId === query.id ? (
                            <>
                              <ChevronUp className="h-4 w-4 mr-2" />
                              Hide Results
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4 mr-2" />
                              Show Results
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Results Table */}
                  {expandedQueryId === query.id && query.results.length > 0 && (
                    <div className="border-2 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-3 border-b-2">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          {Object.keys(query.compatibilityScores).length > 0 ? (
                            <>
                              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                              Sorted by compatibility score (highest first)
                            </>
                          ) : (
                            <>
                              <Users className="h-4 w-4" />
                              Sorted by audience size (largest first)
                            </>
                          )}
                        </p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[50px]">
                              <input
                                type="checkbox"
                                className="w-4 h-4 cursor-pointer"
                                checked={query.results.length > 0 && query.results.every(p => selectedPodcasts.has(p.podcast_id))}
                                onChange={() => handleToggleAllInQuery(query)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </TableHead>
                            <TableHead className="font-semibold">Podcast</TableHead>
                            <TableHead className="font-semibold">Has Guests</TableHead>
                            <TableHead className="font-semibold">Audience</TableHead>
                            <TableHead className="font-semibold">Episodes</TableHead>
                            <TableHead className="font-semibold">Rating</TableHead>
                            <TableHead className="font-semibold">Fit Score</TableHead>
                            <TableHead className="w-[120px] font-semibold">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getSortedResults(query).map((podcast) => (
                            <TableRow
                              key={podcast.podcast_id}
                              className="hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => handlePodcastRowClick(podcast.podcast_id)}
                            >
                              <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 cursor-pointer"
                                  checked={selectedPodcasts.has(podcast.podcast_id)}
                                  onChange={() => handleTogglePodcastSelection(podcast.podcast_id)}
                                />
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="max-w-md">
                                  <p className="font-semibold text-base mb-1">{podcast.podcast_name}</p>
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {podcast.podcast_description}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {podcast.podcast_has_guests ? (
                                  <Badge className="bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1">
                                    <Users className="h-4 w-4 mr-1" />
                                    Yes
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="font-semibold px-3 py-1">
                                    <X className="h-4 w-4 mr-1" />
                                    No
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">
                                    {podcast.reach?.audience_size?.toLocaleString() || 'N/A'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <span className="font-medium">{podcast.episode_count}</span>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                  <span className="font-medium">
                                    {podcast.reach?.itunes?.itunes_rating_average || 'N/A'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                {query.compatibilityScores[podcast.podcast_id] !== undefined ? (
                                  <Badge
                                    variant={
                                      (query.compatibilityScores[podcast.podcast_id] || 0) >= 9
                                        ? 'default'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className={`text-base px-3 py-1 cursor-pointer transition-transform hover:scale-105 ${
                                      (query.compatibilityScores[podcast.podcast_id] || 0) >= 9
                                        ? 'bg-emerald-600 hover:bg-emerald-700 font-bold'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8
                                        ? 'bg-blue-600 hover:bg-blue-700 font-bold'
                                        : (query.compatibilityScores[podcast.podcast_id] || 0) >= 7
                                        ? 'bg-amber-600 hover:bg-amber-700 font-bold text-white'
                                        : 'font-bold'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleScoreClick(podcast, query)
                                    }}
                                    title="Click to see why"
                                  >
                                    {(query.compatibilityScores[podcast.podcast_id] || 0) >= 9 ? '🎯' : (query.compatibilityScores[podcast.podcast_id] || 0) >= 8 ? '⭐' : '📊'} {query.compatibilityScores[podcast.podcast_id]}/10
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground font-medium">Not scored</span>
                                )}
                              </TableCell>
                              <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    asChild
                                    title="View on Podscan"
                                  >
                                    <a href={podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-5 w-5" />
                                    </a>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeletePodcast(query.id, podcast.podcast_id, podcast.podcast_name)}
                                    title="Remove from results"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {queries.length === 0 && (
          <Card className="border-2 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-primary/10 p-6 mb-6">
                <Sparkles className="h-16 w-16 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Ready to Find Podcasts</h3>
              <p className="text-muted-foreground text-center max-w-lg text-base mb-8">
                Select a client above and click "Generate 5 AI Queries" to get started with AI-powered podcast discovery
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span>AI-Powered Queries</span>
                </div>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  <span>Advanced Filters</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  <span>Compatibility Scoring</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Score Details Modal */}
        <Dialog open={scoreModalOpen} onOpenChange={setScoreModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                Compatibility Score Details
              </DialogTitle>
              <DialogDescription>
                AI analysis of podcast fit for your client
              </DialogDescription>
            </DialogHeader>

            {selectedPodcastForScore && (
              <div className="space-y-4">
                {/* Podcast Info */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold text-lg mb-2">
                    {selectedPodcastForScore.podcast.podcast_name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {selectedPodcastForScore.podcast.podcast_description}
                  </p>
                  <div className="flex gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedPodcastForScore.podcast.reach?.audience_size?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedPodcastForScore.podcast.episode_count} episodes</span>
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
                  <p className="text-sm text-muted-foreground mb-2">Compatibility Score</p>
                  <div className="text-5xl font-bold text-primary mb-2">
                    {selectedPodcastForScore.score}
                    <span className="text-2xl text-muted-foreground">/10</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-sm px-3 py-1 ${
                      selectedPodcastForScore.score >= 9
                        ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400'
                        : selectedPodcastForScore.score >= 8
                        ? 'border-blue-500 text-blue-700 dark:text-blue-400'
                        : selectedPodcastForScore.score >= 7
                        ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                        : 'border-gray-500 text-gray-700 dark:text-gray-400'
                    }`}
                  >
                    {selectedPodcastForScore.score >= 9
                      ? '🎯 Perfect Fit'
                      : selectedPodcastForScore.score >= 8
                      ? '⭐ Great Fit'
                      : selectedPodcastForScore.score >= 7
                      ? '📊 Good Fit'
                      : '📉 Moderate Fit'}
                  </Badge>
                </div>

                {/* Reasoning */}
                <div className="space-y-2">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Why This Score?
                  </h4>
                  {selectedPodcastForScore.reasoning ? (
                    <div className="p-4 bg-background border rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPodcastForScore.reasoning}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/30 border border-dashed rounded-lg text-sm text-muted-foreground text-center">
                      No detailed reasoning available for this score.
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <a href={selectedPodcastForScore.podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Podscan
                    </a>
                  </Button>
                  <Button
                    onClick={() => setScoreModalOpen(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Podcast Details Modal */}
        <Dialog open={podcastDetailsModalOpen} onOpenChange={setPodcastDetailsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary" />
                Podcast Details
              </DialogTitle>
              <DialogDescription>
                Full information about this podcast
              </DialogDescription>
            </DialogHeader>

            {loadingPodcastDetails ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : selectedPodcastDetails ? (
              <div className="space-y-6">
                {/* Header with Image */}
                <div className="flex gap-4">
                  {selectedPodcastDetails.podcast_image_url && (
                    <img
                      src={selectedPodcastDetails.podcast_image_url}
                      alt={selectedPodcastDetails.podcast_name}
                      className="w-32 h-32 rounded-lg object-cover shadow-lg"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2">{selectedPodcastDetails.podcast_name}</h2>
                    {selectedPodcastDetails.publisher_name && (
                      <p className="text-muted-foreground mb-2">
                        by {selectedPodcastDetails.publisher_name}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selectedPodcastDetails.podcast_categories?.map((cat) => (
                        <Badge key={cat.category_id} variant="secondary">
                          {cat.category_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {selectedPodcastDetails.podcast_description && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Description</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {selectedPodcastDetails.podcast_description}
                    </p>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Users className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">
                      {selectedPodcastDetails.reach?.audience_size?.toLocaleString() || 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">Audience Size</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{selectedPodcastDetails.episode_count || 0}</p>
                    <p className="text-xs text-muted-foreground">Episodes</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Star className="h-5 w-5 mx-auto mb-2 text-yellow-500 fill-yellow-500" />
                    <p className="text-2xl font-bold">
                      {selectedPodcastDetails.reach?.itunes?.itunes_rating_average || 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">iTunes Rating</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <Globe className="h-5 w-5 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{selectedPodcastDetails.language?.toUpperCase() || 'EN'}</p>
                    <p className="text-xs text-muted-foreground">Language</p>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPodcastDetails.reach?.website && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Website</p>
                      <a
                        href={selectedPodcastDetails.reach.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        {selectedPodcastDetails.reach.website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.reach?.email && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Email</p>
                      <a
                        href={`mailto:${selectedPodcastDetails.reach.email}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {selectedPodcastDetails.reach.email}
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.rss_url && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">RSS Feed</p>
                      <a
                        href={selectedPodcastDetails.rss_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                      >
                        {selectedPodcastDetails.rss_url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {selectedPodcastDetails.last_posted_at && (
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Last Episode</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedPodcastDetails.last_posted_at).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Social Links */}
                {selectedPodcastDetails.reach?.social_links && selectedPodcastDetails.reach.social_links.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Social Media</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPodcastDetails.reach.social_links.map((link, idx) => (
                        <Button
                          key={idx}
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href={link.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {link.platform}
                          </a>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Podcast Features */}
                <div className="flex flex-wrap gap-2 py-2">
                  {selectedPodcastDetails.podcast_has_guests && (
                    <Badge variant="outline" className="px-3 py-1">
                      <Users className="h-3 w-3 mr-1" />
                      Has Guests
                    </Badge>
                  )}
                  {selectedPodcastDetails.podcast_has_sponsors && (
                    <Badge variant="outline" className="px-3 py-1">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Has Sponsors
                    </Badge>
                  )}
                  {selectedPodcastDetails.is_active && (
                    <Badge variant="outline" className="px-3 py-1 border-green-500 text-green-700 dark:text-green-400">
                      Active
                    </Badge>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <a href={selectedPodcastDetails.podcast_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View on Podscan
                    </a>
                  </Button>
                  <Button
                    onClick={() => setPodcastDetailsModalOpen(false)}
                    className="flex-1"
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No podcast details available
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
