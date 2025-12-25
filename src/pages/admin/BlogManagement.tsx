import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardLayout } from '@/components/admin/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  Plus, Edit, Trash2, Eye, Globe, RefreshCw, Loader2, Search, ExternalLink
} from 'lucide-react'
import {
  getAllPosts,
  getAllCategories,
  deletePost,
  publishPost,
  unpublishPost,
  type BlogPost,
  type BlogCategory,
  type BlogFilters,
} from '@/services/blog'
import {
  submitToGoogleIndexing,
  checkGoogleIndexingStatus,
  buildPostUrl,
  getIndexingStatusBadge
} from '@/services/indexing'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const BlogManagement = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  // State
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [postToDelete, setPostToDelete] = useState<string | null>(null)
  const [checkingStatus, setCheckingStatus] = useState<Record<string, boolean>>({})

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Load data on mount
  useEffect(() => {
    loadData()
  }, [statusFilter, categoryFilter, searchQuery])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [postsData, categoriesData] = await Promise.all([
        getAllPosts({
          status: statusFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          search: searchQuery || undefined,
        } as BlogFilters),
        getAllCategories(),
      ])
      setPosts(postsData)
      setCategories(categoriesData)
    } catch (error) {
      console.error('Failed to load data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load blog posts',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!postToDelete) return

    try {
      await deletePost(postToDelete)
      toast({ title: 'Post deleted', description: 'Blog post has been deleted.' })
      loadData()
    } catch (error) {
      console.error('Failed to delete post:', error)
      toast({
        title: 'Delete failed',
        description: 'Failed to delete blog post',
        variant: 'destructive',
      })
    } finally {
      setDeleteDialogOpen(false)
      setPostToDelete(null)
    }
  }

  const handleTogglePublish = async (post: BlogPost) => {
    try {
      if (post.status === 'published') {
        await unpublishPost(post.id)
        toast({ title: 'Post unpublished', description: 'Post moved to drafts.' })
      } else {
        await publishPost(post.id)
        const postUrl = buildPostUrl(post.slug)

        // Try to submit to Google
        try {
          await submitToGoogleIndexing(postUrl, post.id)
          toast({
            title: 'Post published & submitted!',
            description: 'Post is live and submitted to Google.'
          })
        } catch {
          toast({
            title: 'Post published',
            description: 'Post is live. Indexing submission failed.'
          })
        }
      }
      loadData()
    } catch (error) {
      console.error('Failed to toggle publish status:', error)
      toast({
        title: 'Operation failed',
        description: 'Failed to update post status',
        variant: 'destructive',
      })
    }
  }

  const handleResubmitToGoogle = async (post: BlogPost) => {
    try {
      const postUrl = buildPostUrl(post.slug)
      await submitToGoogleIndexing(postUrl, post.id)
      toast({ title: 'Resubmitted', description: 'Post submitted to Google Indexing API.' })
      loadData()
    } catch (error) {
      console.error('Resubmission failed:', error)
      toast({
        title: 'Submission failed',
        description: 'Failed to submit to Google',
        variant: 'destructive',
      })
    }
  }

  const handleCheckIndexingStatus = async (post: BlogPost) => {
    setCheckingStatus(prev => ({ ...prev, [post.id]: true }))

    try {
      const postUrl = buildPostUrl(post.slug)
      const result = await checkGoogleIndexingStatus(postUrl, post.id)

      if (result.success && result.data?.isIndexed) {
        const indexedDate = result.data.lastCrawlTime
          ? new Date(result.data.lastCrawlTime).toLocaleDateString()
          : 'recently'

        toast({
          title: 'Indexed!',
          description: `Post was indexed on ${indexedDate}`,
        })
      } else if (result.success && !result.data?.isIndexed) {
        toast({
          title: 'Not Indexed Yet',
          description: result.data?.coverageState || "Google hasn't indexed this post yet.",
        })
      } else {
        throw new Error(result.error || 'Check failed')
      }

      loadData()
    } catch (error) {
      console.error('Status check failed:', error)
      toast({
        title: 'Check Failed',
        description: error instanceof Error ? error.message : 'Could not verify indexing status',
        variant: 'destructive',
      })
    } finally {
      setCheckingStatus(prev => ({ ...prev, [post.id]: false }))
    }
  }

  // Calculate stats
  const totalPosts = posts.length
  const publishedPosts = posts.filter(p => p.status === 'published').length
  const draftPosts = posts.filter(p => p.status === 'draft').length
  const totalViews = posts.reduce((sum, p) => sum + p.view_count, 0)

  return (
    <TooltipProvider>
      <DashboardLayout>
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Blog Posts</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage your blog content with AI assistance
            </p>
          </div>
          <Button onClick={() => navigate('/admin/blog/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Posts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPosts}</div>
              <p className="text-xs text-muted-foreground">
                All blog articles
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{publishedPosts}</div>
              <p className="text-xs text-muted-foreground">
                Live on website
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{draftPosts}</div>
              <p className="text-xs text-muted-foreground">
                Work in progress
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalViews.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                All time views
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search posts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Drafts</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={loadData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Blog Posts List */}
        <Card>
          <CardHeader>
            <CardTitle>All Posts ({posts.length})</CardTitle>
            <CardDescription>
              Manage your blog articles
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No blog posts yet</p>
                <Button onClick={() => navigate('/admin/blog/new')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Post
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => {
                  const indexingBadge = getIndexingStatusBadge(post)
                  return (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium truncate">{post.title}</h3>
                          <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>
                            {post.status}
                          </Badge>
                          {post.status === 'published' && (
                            <Badge
                              variant="outline"
                              className={
                                indexingBadge.color === 'green'
                                  ? 'border-green-500 text-green-700'
                                  : indexingBadge.color === 'blue'
                                  ? 'border-blue-500 text-blue-700'
                                  : indexingBadge.color === 'yellow'
                                  ? 'border-yellow-500 text-yellow-700'
                                  : indexingBadge.color === 'red'
                                  ? 'border-red-500 text-red-700'
                                  : indexingBadge.color === 'orange'
                                  ? 'border-orange-500 text-orange-700'
                                  : 'border-gray-500 text-gray-700'
                              }
                            >
                              {indexingBadge.label}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {post.blog_categories && (
                            <span>{post.blog_categories.name}</span>
                          )}
                          <span>
                            {post.published_at
                              ? new Date(post.published_at).toLocaleDateString()
                              : new Date(post.created_at).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {post.view_count} views
                          </span>
                          <span>{post.read_time_minutes} min read</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {post.status === 'published' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(`/blog/${post.slug}`, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>View on site</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {post.status === 'published' && !post.indexed_by_google_at && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleResubmitToGoogle(post)}
                              >
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Resubmit to Google Indexing API</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {post.status === 'published' && post.submitted_to_google_at && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCheckIndexingStatus(post)}
                                disabled={checkingStatus[post.id]}
                              >
                                {checkingStatus[post.id] ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Search className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Check indexing status with Google</p>
                            </TooltipContent>
                          </Tooltip>
                        )}

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTogglePublish(post)}
                            >
                              <Globe className={`h-4 w-4 ${post.status === 'published' ? 'text-green-600' : ''}`} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{post.status === 'published' ? 'Unpublish post' : 'Publish post'}</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/blog/${post.id}/edit`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit post</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPostToDelete(post.id)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete post</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the blog post.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </DashboardLayout>
    </TooltipProvider>
  )
}

export default BlogManagement
