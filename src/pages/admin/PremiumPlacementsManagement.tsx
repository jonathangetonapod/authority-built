import { useState } from 'react'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, Star, Eye, EyeOff, Loader2, Sparkles, Download, Users, BarChart3, TrendingUp, Award, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAllPremiumPodcasts,
  createPremiumPodcast,
  updatePremiumPodcast,
  deletePremiumPodcast,
  togglePodcastFeatured,
  togglePodcastActive,
  type PremiumPodcast,
  type CreatePremiumPodcastInput
} from '@/services/premiumPodcasts'
import { getPodcastById } from '@/services/podscan'
import { generatePodcastSummary, generatePodcastFeatures } from '@/services/ai'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const PremiumPlacementsManagement = () => {
  const queryClient = useQueryClient()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingPodcast, setEditingPodcast] = useState<PremiumPodcast | null>(null)
  const [isFetchingDetails, setIsFetchingDetails] = useState(false)
  const [formData, setFormData] = useState<CreatePremiumPodcastInput>({
    podscan_id: '',
    podcast_name: '',
    podcast_image_url: '',
    audience_size: '',
    episode_count: '',
    rating: '',
    reach_score: '',
    why_this_show: '',
    whats_included: [],
    price: '$3,500',
    my_cost: '',
    notes: '',
    is_featured: false,
    display_order: 0
  })

  // Fetch premium podcasts
  const { data: podcasts = [], isLoading } = useQuery({
    queryKey: ['premium-podcasts-admin'],
    queryFn: getAllPremiumPodcasts
  })

  // Create podcast mutation
  const createMutation = useMutation({
    mutationFn: createPremiumPodcast,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['premium-podcasts-admin'] })
      toast.success('Podcast added successfully!')
      handleCloseDialog()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create podcast')
    }
  })

  // Update podcast mutation
  const updateMutation = useMutation({
    mutationFn: updatePremiumPodcast,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['premium-podcasts-admin'] })
      toast.success('Podcast updated successfully!')
      handleCloseDialog()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update podcast')
    }
  })

  // Delete podcast mutation
  const deleteMutation = useMutation({
    mutationFn: deletePremiumPodcast,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['premium-podcasts-admin'] })
      toast.success('Podcast deleted successfully!')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete podcast')
    }
  })

  // Toggle featured mutation
  const toggleFeaturedMutation = useMutation({
    mutationFn: ({ id, isFeatured }: { id: string; isFeatured: boolean }) =>
      togglePodcastFeatured(id, isFeatured),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['premium-podcasts-admin'] })
    }
  })

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      togglePodcastActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['premium-podcasts-admin'] })
    }
  })

  const handleFetchPodcastDetails = async () => {
    if (!formData.podscan_id.trim()) {
      toast.error('Please enter a Podscan Podcast ID first')
      return
    }

    setIsFetchingDetails(true)
    try {
      // Clean up the ID - remove leading slash if present
      const cleanId = formData.podscan_id.trim().replace(/^\//, '')
      const podcast = await getPodcastById(cleanId)

      console.log('📦 Podscan API Response:', podcast)

      // Extract data from Podscan API - handle both direct response and nested data
      const podcastData = podcast.podcast || podcast

      const audienceSize = podcastData.reach?.audience_size || 0
      const episodeCount = podcastData.episode_count || 0
      const reachScore = podcastData.podcast_reach_score || 0
      const rating = podcastData.reach?.itunes?.itunes_rating_average || '0'

      // Format audience size
      const formatAudience = (size: number): string => {
        if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`
        if (size >= 1000) return `${Math.round(size / 1000)}K`
        return size.toString()
      }

      // Suggest price based on audience
      const suggestedPrice = audienceSize >= 100000 ? '$5,000' :
                            audienceSize >= 50000 ? '$3,500' :
                            audienceSize >= 20000 ? '$2,500' : '$1,500'

      // Generate AI-powered features based on audience size
      const defaultInclusions = await generatePodcastFeatures(audienceSize)

      // Generate AI-powered "Why This Show" summary
      toast.info('🤖 Generating AI summary with Claude...')
      const whyThisShow = await generatePodcastSummary({
        podcast_name: podcastData.podcast_name,
        audience_size: formatAudience(audienceSize),
        episode_count: episodeCount.toString(),
        rating: rating ? `${rating}/5` : '0/5',
        reach_score: reachScore.toString(),
        description: podcastData.podcast_description,
        categories: podcastData.podcast_categories?.map(c => c.category_name),
        publisher_name: podcastData.publisher_name,
      })

      setFormData({
        ...formData,
        podcast_name: podcastData.podcast_name || 'Unknown Podcast',
        podcast_image_url: podcastData.podcast_image_url || '',
        audience_size: formatAudience(audienceSize),
        episode_count: episodeCount.toString(),
        rating: rating ? `${rating}/5` : '',
        reach_score: reachScore.toString(),
        why_this_show: whyThisShow,
        whats_included: defaultInclusions,
        price: suggestedPrice,
        notes: `Host: ${podcastData.publisher_name || 'N/A'}\nCategories: ${podcastData.podcast_categories?.map(c => c.category_name).join(', ') || 'N/A'}`
      })

      toast.success(`✨ AI summary generated for "${podcastData.podcast_name}"`)
    } catch (error: any) {
      console.error('❌ Failed to fetch podcast:', error)
      toast.error(error.message || 'Failed to fetch podcast details. Check console for details.')
    } finally {
      setIsFetchingDetails(false)
    }
  }

  const handleOpenDialog = (podcast?: PremiumPodcast) => {
    if (podcast) {
      setEditingPodcast(podcast)
      setFormData({
        podscan_id: podcast.podscan_id,
        podcast_name: podcast.podcast_name,
        podcast_image_url: podcast.podcast_image_url || '',
        audience_size: podcast.audience_size || '',
        episode_count: podcast.episode_count || '',
        rating: podcast.rating || '',
        reach_score: podcast.reach_score || '',
        why_this_show: podcast.why_this_show || '',
        whats_included: podcast.whats_included,
        price: podcast.price,
        my_cost: podcast.my_cost || '',
        notes: podcast.notes || '',
        is_featured: podcast.is_featured,
        display_order: podcast.display_order
      })
    } else {
      setEditingPodcast(null)
      setFormData({
        podscan_id: '',
        podcast_name: '',
        podcast_image_url: '',
        audience_size: '',
        episode_count: '',
        rating: '',
        reach_score: '',
        why_this_show: '',
        whats_included: [
          'Pre-interview strategy call',
          'Professional audio editing',
          'Show notes included',
          'Social media promotion'
        ],
        price: '$3,500',
        notes: '',
        is_featured: false,
        display_order: podcasts.length
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingPodcast(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingPodcast) {
      updateMutation.mutate({ id: editingPodcast.id, ...formData })
    } else {
      createMutation.mutate(formData)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this podcast placement?')) {
      deleteMutation.mutate(id)
    }
  }

  const activeCount = podcasts.filter(p => p.is_active).length
  const featuredCount = podcasts.filter(p => p.is_featured && p.is_active).length

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Premium Placements</h1>
              <p className="text-muted-foreground mt-2">
                Manage your curated premium podcast inventory
              </p>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Podcast
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Podcasts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{podcasts.length}</div>
                <p className="text-xs text-muted-foreground">
                  In inventory
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeCount}</div>
                <p className="text-xs text-muted-foreground">
                  Visible on website
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Featured</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{featuredCount}</div>
                <p className="text-xs text-muted-foreground">
                  Highlighted placements
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Podcasts List */}
          <Card>
            <CardHeader>
              <CardTitle>All Premium Podcasts</CardTitle>
              <CardDescription>
                Manage your premium podcast placements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : podcasts.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No podcasts yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add your first premium podcast placement
                  </p>
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Podcast
                  </Button>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {podcasts.map((podcast) => (
                    <div
                      key={podcast.id}
                      className={`bg-card rounded-xl border-2 hover:border-primary/50 transition-all duration-300 hover:shadow-xl relative overflow-hidden group ${
                        !podcast.is_active ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Featured/Inactive Badges */}
                      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                        {podcast.is_featured && (
                          <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1 shadow-lg">
                            <Star className="h-3 w-3 fill-white" />
                            Featured
                          </div>
                        )}
                        {!podcast.is_active && (
                          <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-md shadow-lg">
                            Inactive
                          </div>
                        )}
                      </div>

                      {/* Podcast Artwork */}
                      <div className="relative h-48 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                        {podcast.podcast_image_url ? (
                          <img
                            src={podcast.podcast_image_url}
                            alt={podcast.podcast_name}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Sparkles className="h-16 w-16 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                      </div>

                      <div className="p-5">
                        {/* Podcast Name */}
                        <h3 className="text-xl font-bold mb-4 line-clamp-2">{podcast.podcast_name}</h3>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {podcast.audience_size && (
                            <div className="flex items-center gap-2 text-sm">
                              <Users className="h-4 w-4 text-primary flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Audience</p>
                                <p className="font-semibold">{podcast.audience_size}</p>
                              </div>
                            </div>
                          )}
                          {podcast.episode_count && (
                            <div className="flex items-center gap-2 text-sm">
                              <BarChart3 className="h-4 w-4 text-primary flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Episodes</p>
                                <p className="font-semibold">{podcast.episode_count}</p>
                              </div>
                            </div>
                          )}
                          {podcast.rating && (
                            <div className="flex items-center gap-2 text-sm">
                              <Star className="h-4 w-4 text-primary flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Rating</p>
                                <p className="font-semibold">{podcast.rating}</p>
                              </div>
                            </div>
                          )}
                          {podcast.reach_score && (
                            <div className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Reach Score</p>
                                <p className="font-semibold">{podcast.reach_score}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Why This Show */}
                        {podcast.why_this_show && (
                          <div className="mb-4 p-3 bg-gradient-to-br from-purple-500/10 to-primary/10 rounded-lg border border-purple-500/20">
                            <div className="flex items-center gap-2 mb-1">
                              <Award className="h-3 w-3 text-purple-500" />
                              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                                Why This Show
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {podcast.why_this_show}
                            </p>
                          </div>
                        )}

                        {/* Investment */}
                        <div className="mb-4 pb-4 border-b">
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Investment</p>
                          <p className="text-3xl font-bold text-primary">{podcast.price}</p>
                          <p className="text-xs text-muted-foreground">One-time placement</p>
                        </div>

                        {/* What's Included */}
                        {podcast.whats_included && podcast.whats_included.length > 0 && (
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">What's Included:</p>
                            <div className="space-y-1">
                              {podcast.whats_included.slice(0, 3).map((item, idx) => (
                                <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span className="line-clamp-1">{item}</span>
                                </div>
                              ))}
                              {podcast.whats_included.length > 3 && (
                                <p className="text-xs text-muted-foreground pl-5">+ {podcast.whats_included.length - 3} more</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-4 border-t">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleFeaturedMutation.mutate({
                                  id: podcast.id,
                                  isFeatured: !podcast.is_featured
                                })
                              }
                            >
                              <Star className={`h-4 w-4 ${podcast.is_featured ? 'fill-current' : ''}`} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{podcast.is_featured ? 'Unfeature' : 'Feature'} podcast</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                toggleActiveMutation.mutate({
                                  id: podcast.id,
                                  isActive: !podcast.is_active
                                })
                              }
                            >
                              {podcast.is_active ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{podcast.is_active ? 'Hide' : 'Show'} podcast</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDialog(podcast)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit podcast</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(podcast.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete podcast</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>
                  {editingPodcast ? 'Edit Podcast' : 'Add Premium Podcast'}
                </DialogTitle>
                <DialogDescription>
                  Add a podcast by its Podscan ID and customize pricing
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="podscan_id">Podscan Podcast ID *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="podscan_id"
                      placeholder="e.g., podcast_12345"
                      value={formData.podscan_id}
                      onChange={(e) => setFormData({ ...formData, podscan_id: e.target.value })}
                      required
                      disabled={!!editingPodcast}
                      className="flex-1"
                    />
                    {!editingPodcast && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleFetchPodcastDetails}
                        disabled={isFetchingDetails || !formData.podscan_id.trim()}
                      >
                        {isFetchingDetails ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paste the Podscan podcast ID and click the button to fetch details
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="podcast_name">Podcast Name *</Label>
                  <Input
                    id="podcast_name"
                    placeholder="e.g., Dear Shandy"
                    value={formData.podcast_name}
                    onChange={(e) => setFormData({ ...formData, podcast_name: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="audience_size">Audience</Label>
                    <Input
                      id="audience_size"
                      placeholder="152K"
                      value={formData.audience_size}
                      onChange={(e) => setFormData({ ...formData, audience_size: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="episode_count">Episodes</Label>
                    <Input
                      id="episode_count"
                      placeholder="431"
                      value={formData.episode_count}
                      onChange={(e) => setFormData({ ...formData, episode_count: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rating">Rating</Label>
                    <Input
                      id="rating"
                      placeholder="4.9/5"
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reach_score">Reach Score</Label>
                    <Input
                      id="reach_score"
                      placeholder="96"
                      value={formData.reach_score}
                      onChange={(e) => setFormData({ ...formData, reach_score: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="why_this_show">Why This Show</Label>
                  <Textarea
                    id="why_this_show"
                    placeholder="Ideal positioning for thought leaders in society. Elite audience with strong conversion rates..."
                    value={formData.why_this_show}
                    onChange={(e) => setFormData({ ...formData, why_this_show: e.target.value })}
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whats_included">What's Included (one per line)</Label>
                  <Textarea
                    id="whats_included"
                    placeholder="Pre-interview strategy call&#10;Professional audio editing&#10;Show notes included"
                    value={formData.whats_included?.join('\n') || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      whats_included: e.target.value.split('\n').filter(Boolean)
                    })}
                    rows={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Investment *</Label>
                  <Input
                    id="price"
                    placeholder="$3,500"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">One-time placement fee (public)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="my_cost">My Cost (optional)</Label>
                  <Input
                    id="my_cost"
                    placeholder="$2,000"
                    value={formData.my_cost}
                    onChange={(e) => setFormData({ ...formData, my_cost: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Your cost to purchase this placement (admin-only, not shown on frontend)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Internal Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any internal notes about this podcast placement..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm">Feature this podcast</span>
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingPodcast ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </TooltipProvider>
  )
}

export default PremiumPlacementsManagement
