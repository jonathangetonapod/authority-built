import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PortalLayout } from '@/components/portal/PortalLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { isPortalAuthError } from '@/hooks/usePortalExperience'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  BookOpen,
  Video,
  Download,
  ExternalLink,
  Search,
  Star,
  Clock,
  Loader2,
  FileText,
  Mic,
  TrendingUp,
  Share2,
  Grid3x3,
  List,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { getPortalGuestResources, type PortalGuestResource, type ResourceCategory } from '@/services/guestResources'
import { openExternalUrl } from '@/lib/externalUrl'
import { sanitizePortalResourceContent } from '@/lib/portalResourceContent'

const categoryInfo = {
  preparation: {
    label: 'Preparation',
    icon: BookOpen,
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  technical_setup: {
    label: 'Technical Setup',
    icon: Mic,
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  },
  best_practices: {
    label: 'Best Practices',
    icon: Star,
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  promotion: {
    label: 'Promotion',
    icon: TrendingUp,
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
  examples: {
    label: 'Examples',
    icon: Video,
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  },
  templates: {
    label: 'Templates',
    icon: FileText,
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
}

const typeInfo = {
  article: { icon: FileText, label: 'Article' },
  video: { icon: Video, label: 'Video' },
  download: { icon: Download, label: 'Download' },
  link: { icon: ExternalLink, label: 'External Link' },
}

export default function PortalResources() {
  const { isPlatformAdmin } = useAuth()
  const { client, session, isImpersonating, logout } = useClientPortal()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [viewingResource, setViewingResource] = useState<PortalGuestResource | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const platformAdminImpersonation = isImpersonating && isPlatformAdmin
  const sessionIdentity = platformAdminImpersonation
    ? 'platform-admin-impersonation'
    : session
      ? `${session.client_id}:${session.expires_at}`
      : 'missing-session'

  useEffect(() => {
    setViewingResource(null)
  }, [client?.id, sessionIdentity])

  const { data: resources, isLoading, error, refetch } = useQuery({
    queryKey: ['portal', client?.id || 'missing-client', 'guest-resources', sessionIdentity],
    queryFn: () => {
      if (!client) throw new Error('Portal client access is required.')
      if (session && session.client_id !== client.id) {
        throw new Error('Portal session does not match the requested client.')
      }
      return getPortalGuestResources({
        clientId: client.id,
        sessionToken: session?.session_token,
        platformAdminImpersonation,
      })
    },
    enabled: Boolean(client && (session || platformAdminImpersonation)),
    retry: false,
    gcTime: 0,
  })

  // A rejected token here is a dead session, not a "try again" — convert it
  // to a logout so the client is sent back to the portal login instead of
  // looping on an error. Impersonation is a platform-admin view, not a portal
  // session, so it is left alone.
  useEffect(() => {
    if (!isImpersonating && isPortalAuthError(error)) void logout()
  }, [error, isImpersonating, logout])

  // Filter resources
  const filteredResources = (resources || []).filter(resource => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = categoryFilter === 'all' || resource.category === categoryFilter

    return matchesSearch && matchesCategory
  })

  // Separate featured and regular resources
  const featuredResources = filteredResources.filter(r => r.featured)
  const regularResources = filteredResources.filter(r => !r.featured)

  const handleViewResource = (resource: PortalGuestResource) => {
    setViewingResource(resource)
  }

  const handleResourceAction = (resource: PortalGuestResource) => {
    if (resource.type === 'video' && resource.url) {
      openExternalUrl(resource.url)
    } else if (resource.type === 'download' && resource.file_url) {
      openExternalUrl(resource.file_url)
    } else if (resource.type === 'link' && resource.url) {
      openExternalUrl(resource.url)
    } else if (resource.type === 'article') {
      handleViewResource(resource)
    }
  }

  const ResourceCard = ({ resource }: { resource: PortalGuestResource }) => {
    const CategoryIcon = categoryInfo[resource.category].icon
    const TypeIcon = typeInfo[resource.type].icon

    return (
      <Card
        className="hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => handleResourceAction(resource)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleResourceAction(resource)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`${typeInfo[resource.type].label}: ${resource.title}`}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={categoryInfo[resource.category].color}>
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryInfo[resource.category].label}
                </Badge>
                {resource.featured && (
                  <Badge variant="secondary">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Featured
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg line-clamp-2">{resource.title}</CardTitle>
            </div>
            <TypeIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <CardDescription className="line-clamp-3 flex-1">
            {resource.description}
          </CardDescription>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(resource.published_at).toLocaleDateString()}
            </span>
            <span className="font-medium text-primary">
              {resource.type === 'article' ? 'Read More' :
               resource.type === 'video' ? 'Watch' :
               resource.type === 'download' ? 'Download' : 'Visit'}
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const ResourceListItem = ({ resource }: { resource: PortalGuestResource }) => {
    const CategoryIcon = categoryInfo[resource.category].icon
    const TypeIcon = typeInfo[resource.type].icon

    return (
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => handleResourceAction(resource)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleResourceAction(resource)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`${typeInfo[resource.type].label}: ${resource.title}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
              <TypeIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${categoryInfo[resource.category].color} text-xs`}>
                  <CategoryIcon className="h-3 w-3 mr-1" />
                  {categoryInfo[resource.category].label}
                </Badge>
                {resource.featured && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Featured
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-base mb-1">{resource.title}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">{resource.description}</p>
            </div>
            <div className="flex-shrink-0 text-sm text-primary font-medium">
              {resource.type === 'article' ? 'Read' :
               resource.type === 'video' ? 'Watch' :
               resource.type === 'download' ? 'Download' : 'Visit'}
              <ExternalLink className="h-3 w-3 inline ml-1" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    )
  }

  if (error) {
    return (
      <PortalLayout>
        <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="font-medium">Resources could not be loaded.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </div>
      </PortalLayout>
    )
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Guest Resources</h1>
          <p className="text-muted-foreground mt-2">
            Everything you need to be a successful podcast guest
          </p>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Search guest resources"
                  placeholder="Search resources..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[200px]" aria-label="Filter guest resources by category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(categoryInfo).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  aria-label="Show resources in a grid"
                  aria-pressed={viewMode === 'grid'}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  aria-label="Show resources in a list"
                  aria-pressed={viewMode === 'list'}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Featured Resources */}
        {featuredResources.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-5 w-5 text-amber-500 fill-current" />
              <h2 className="text-2xl font-bold">Featured Resources</h2>
            </div>
            {viewMode === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {featuredResources.map(resource => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {featuredResources.map(resource => (
                  <ResourceListItem key={resource.id} resource={resource} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Resources */}
        {regularResources.length > 0 && (
          <div>
            {featuredResources.length > 0 && (
              <h2 className="text-2xl font-bold mb-4">All Resources</h2>
            )}
            {viewMode === 'grid' ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularResources.map(resource => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {regularResources.map(resource => (
                  <ResourceListItem key={resource.id} resource={resource} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {filteredResources.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No resources found</h3>
              <p className="text-muted-foreground">
                {(resources || []).length === 0
                  ? 'No guest resources have been shared with you yet.'
                  : 'Try adjusting your search or filters.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Resource Detail Modal */}
      <Dialog open={!!viewingResource} onOpenChange={() => setViewingResource(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <DialogTitle className="text-2xl mb-3">{viewingResource?.title}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {viewingResource && (
                    <>
                      <Badge className={categoryInfo[viewingResource.category].color}>
                        {categoryInfo[viewingResource.category].label}
                      </Badge>
                      <Badge variant="outline">
                        {typeInfo[viewingResource.type].label}
                      </Badge>
                      {viewingResource.featured && (
                        <Badge variant="secondary">
                          <Star className="h-3 w-3 mr-1 fill-current" />
                          Featured
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <DialogDescription className="text-muted-foreground">
                  {viewingResource?.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewingResource?.content && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none [&_blockquote]:bg-blue-50 [&_blockquote]:dark:bg-blue-950 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:p-4 [&_blockquote]:my-4 [&_blockquote]:rounded-r-lg [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_ul]:my-3 [&_ol]:my-3 [&_li]:my-1 [&_p]:my-3"
              dangerouslySetInnerHTML={{
                __html: sanitizePortalResourceContent(
                  viewingResource.content
                    // Fix corrupted UTF-8 sequences
                    .replace(/â€"/g, '-')
                    .replace(/â€"/g, '-')
                    .replace(/â€™/g, "'")
                    .replace(/â€˜/g, "'")
                    .replace(/â€œ/g, '"')
                    .replace(/â€/g, '"')
                    .replace(/â€¦/g, '...')
                    .replace(/â€¢/g, '-')
                )
              }}
            />
          )}

          {viewingResource?.url && (
            <div className="pt-4 border-t">
              <Button
                onClick={() => openExternalUrl(viewingResource.url!)}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {viewingResource.type === 'video' ? 'Watch Video' : 'Visit Link'}
              </Button>
            </div>
          )}

          {viewingResource?.file_url && (
            <div className="pt-4 border-t">
              <Button
                onClick={() => openExternalUrl(viewingResource.file_url!)}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  )
}
