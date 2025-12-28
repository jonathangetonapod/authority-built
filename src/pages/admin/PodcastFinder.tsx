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
  X
} from 'lucide-react'
import { getClients } from '@/services/clients'
import { toast } from 'sonner'

interface GeneratedQuery {
  id: string
  text: string
  isEditing: boolean
  isSearching: boolean
  results: any[]
  isScoring: boolean
  compatibilityScores: Record<string, number | null>
}

export default function PodcastFinder() {
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [queries, setQueries] = useState<GeneratedQuery[]>([])
  const [expandedQueryId, setExpandedQueryId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [minAudience, setMinAudience] = useState('')
  const [maxAudience, setMaxAudience] = useState('')
  const [minEpisodes, setMinEpisodes] = useState('')
  const [region, setRegion] = useState('US')
  const [hasGuests, setHasGuests] = useState('any')

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

    setIsGenerating(true)

    try {
      // TODO: Call AI query generation API
      // For now, simulate with dummy data
      await new Promise(resolve => setTimeout(resolve, 2000))

      const dummyQueries: GeneratedQuery[] = [
        {
          id: '1',
          text: '"business leadership" OR "executive coaching"',
          isEditing: false,
          isSearching: false,
          results: [],
          isScoring: false,
          compatibilityScores: {}
        },
        {
          id: '2',
          text: '"startup * founder" OR "entrepreneur stories"',
          isEditing: false,
          isSearching: false,
          results: [],
          isScoring: false,
          compatibilityScores: {}
        },
        {
          id: '3',
          text: '"B2B SaaS" OR "software startups"',
          isEditing: false,
          isSearching: false,
          results: [],
          isScoring: false,
          compatibilityScores: {}
        },
        {
          id: '4',
          text: '"digital marketing" OR "growth hacking"',
          isEditing: false,
          isSearching: false,
          results: [],
          isScoring: false,
          compatibilityScores: {}
        },
        {
          id: '5',
          text: '"sales * podcast" OR "revenue leaders"',
          isEditing: false,
          isSearching: false,
          results: [],
          isScoring: false,
          compatibilityScores: {}
        },
      ]

      setQueries(dummyQueries)
      toast.success('Generated 5 AI-powered search queries!')
    } catch (error) {
      toast.error('Failed to generate queries')
      console.error(error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateQuery = async (queryId: string) => {
    if (!selectedClientData) return

    try {
      // TODO: Call AI regenerate API
      await new Promise(resolve => setTimeout(resolve, 1500))

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, text: '"leadership development" OR "executive coaching"' }
          : q
      ))

      toast.success('Query regenerated!')
    } catch (error) {
      toast.error('Failed to regenerate query')
    }
  }

  const handleSearchQuery = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query) return

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isSearching: true } : q
    ))

    try {
      // TODO: Call Podscan API with filters
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Dummy results
      const dummyResults = [
        {
          podcast_id: '1',
          podcast_name: 'The Business Leadership Podcast',
          podcast_description: 'Interviews with top executives and business leaders',
          audience_size: 25000,
          episode_count: 120,
          itunes_rating: 4.7,
          podcast_url: 'https://example.com/podcast1'
        },
        {
          podcast_id: '2',
          podcast_name: 'Startup Stories',
          podcast_description: 'Real stories from successful founders',
          audience_size: 35000,
          episode_count: 85,
          itunes_rating: 4.8,
          podcast_url: 'https://example.com/podcast2'
        },
        {
          podcast_id: '3',
          podcast_name: 'Executive Insights',
          podcast_description: 'Deep dives into leadership strategies',
          audience_size: 18000,
          episode_count: 95,
          itunes_rating: 4.5,
          podcast_url: 'https://example.com/podcast3'
        },
      ]

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, results: dummyResults, isSearching: false }
          : q
      ))

      setExpandedQueryId(queryId)
      toast.success(`Found ${dummyResults.length} podcasts!`)
    } catch (error) {
      toast.error('Search failed')
      setQueries(prev => prev.map(q =>
        q.id === queryId ? { ...q, isSearching: false } : q
      ))
    }
  }

  const handleScanCompatibility = async (queryId: string) => {
    const query = queries.find(q => q.id === queryId)
    if (!query || !query.results.length || !selectedClientData) return

    setQueries(prev => prev.map(q =>
      q.id === queryId ? { ...q, isScoring: true } : q
    ))

    try {
      // TODO: Call AI compatibility scoring API
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Dummy scores
      const scores: Record<string, number> = {}
      query.results.forEach(podcast => {
        scores[podcast.podcast_id] = Math.floor(Math.random() * 4) + 7 // 7-10 range
      })

      setQueries(prev => prev.map(q =>
        q.id === queryId
          ? { ...q, compatibilityScores: scores, isScoring: false }
          : q
      ))

      toast.success('Compatibility scores calculated!')
    } catch (error) {
      toast.error('Failed to calculate scores')
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Podcast Finder</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered podcast discovery with compatibility scoring
          </p>
        </div>

        {/* Client Selection & Query Generation */}
        <Card>
          <CardHeader>
            <CardTitle>1. Select Client & Generate Queries</CardTitle>
            <CardDescription>
              Choose a client and let AI generate optimized podcast search queries
            </CardDescription>
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

              <div className="flex items-end">
                <Button
                  onClick={handleGenerateQueries}
                  disabled={!selectedClient || isGenerating}
                  className="w-full"
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
              </div>
            </div>

            {selectedClientData && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Selected Client Info:</p>
                <p className="text-sm text-muted-foreground">
                  <strong>Name:</strong> {selectedClientData.name}
                </p>
                {selectedClientData.email && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Email:</strong> {selectedClientData.email}
                  </p>
                )}
                {selectedClientData.bio ? (
                  <div className="pt-2 border-t border-border/50 mt-2">
                    <p className="text-xs font-medium mb-1">Client Bio:</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selectedClientData.bio}</p>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-border/50 mt-2">
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      ⚠️ No bio added yet. Add a bio in the client details page for better AI query generation.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search Filters */}
        {queries.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>2. Search Filters (Optional)</CardTitle>
                  <CardDescription>
                    Refine your podcast search criteria
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
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
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="min-audience">Min Audience Size</Label>
                    <Input
                      id="min-audience"
                      type="number"
                      placeholder="e.g., 1000"
                      value={minAudience}
                      onChange={(e) => setMinAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-audience">Max Audience Size</Label>
                    <Input
                      id="max-audience"
                      type="number"
                      placeholder="e.g., 50000"
                      value={maxAudience}
                      onChange={(e) => setMaxAudience(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="min-episodes">Min Episodes</Label>
                    <Input
                      id="min-episodes"
                      type="number"
                      placeholder="e.g., 10"
                      value={minEpisodes}
                      onChange={(e) => setMinEpisodes(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">Region</Label>
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
                    <Label htmlFor="has-guests">Guest Format</Label>
                    <Select value={hasGuests} onValueChange={setHasGuests}>
                      <SelectTrigger id="has-guests">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Format</SelectItem>
                        <SelectItem value="true">Has Guests Only</SelectItem>
                        <SelectItem value="false">No Guests</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Generated Queries */}
        {queries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>3. Search Queries & Results</CardTitle>
              <CardDescription>
                Edit, regenerate, or search each query. Click "Scan Compatibility" to get AI scores.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {queries.map((query, index) => (
                <div key={query.id} className="border rounded-lg p-4 space-y-3">
                  {/* Query Header */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      Query {index + 1}
                    </Badge>
                    {query.results.length > 0 && (
                      <Badge variant="secondary">
                        {query.results.length} results
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
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleSearchQuery(query.id)}
                      disabled={query.isSearching || !query.text}
                      size="sm"
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
                          size="sm"
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
                          size="sm"
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
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Podcast</TableHead>
                            <TableHead>Audience</TableHead>
                            <TableHead>Episodes</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Fit Score</TableHead>
                            <TableHead className="w-[100px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {query.results.map((podcast) => (
                            <TableRow key={podcast.podcast_id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{podcast.podcast_name}</p>
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {podcast.podcast_description}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-sm">
                                    {podcast.audience_size?.toLocaleString() || 'N/A'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{podcast.episode_count}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                  <span className="text-sm">{podcast.itunes_rating || 'N/A'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {query.compatibilityScores[podcast.podcast_id] !== undefined ? (
                                  <Badge
                                    variant={
                                      (query.compatibilityScores[podcast.podcast_id] || 0) >= 8
                                        ? 'default'
                                        : 'secondary'
                                    }
                                    className="font-bold"
                                  >
                                    ⭐ {query.compatibilityScores[podcast.podcast_id]}/10
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  asChild
                                >
                                  <a href={podcast.podcast_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
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
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Search className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No queries generated yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Select a client above and click "Generate 5 AI Queries" to get started with AI-powered podcast discovery
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}
