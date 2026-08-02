import { CheckCircle2, ExternalLink, Mail, Rss } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { RelationshipBadge } from '@/lib/relationshipLabels'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

interface PodcastCatalogDetailsDialogProps {
  podcast: WorkspacePodcastCatalogItem | null
  relationship: RelationshipBadge | null
  onClose: () => void
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function initials(name: string) {
  return name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'
}

function categoryNames(podcast: WorkspacePodcastCatalogItem): string[] {
  if (!Array.isArray(podcast.podcast_categories)) return []
  return podcast.podcast_categories.flatMap((category) => {
    if (typeof category === 'string') return category.trim() ? [category.trim()] : []
    const name = category?.category_name
    return typeof name === 'string' && name.trim() ? [name.trim()] : []
  })
}

/**
 * Everything the catalogue already knows about one show.
 *
 * The row has to stay scannable, so it shows a description clipped to two
 * lines and four numbers. Everything else the catalogue holds — the feed, the
 * language, when it last published, how many shortlists already use it — was
 * fetched, carried to the browser and then never displayed, so the only way to
 * judge a show properly was to open it somewhere else entirely.
 *
 * No request of its own: every field here arrived with the row.
 */
export function PodcastCatalogDetailsDialog({
  podcast,
  relationship,
  onClose,
}: PodcastCatalogDetailsDialogProps) {
  if (!podcast) return null

  const categories = categoryNames(podcast)
  const publicUrl = safeExternalUrl(podcast.podcast_url || podcast.website || '')
  const feedUrl = safeExternalUrl(podcast.rss_feed || '')
  const stats: Array<{ label: string; value: string }> = [
    { label: 'Audience', value: podcast.audience_size ? compact.format(podcast.audience_size) : '—' },
    { label: 'Episodes', value: podcast.episode_count ? compact.format(podcast.episode_count) : '—' },
    { label: 'Apple rating', value: podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—' },
    { label: 'Spotify rating', value: podcast.spotify_rating ? Number(podcast.spotify_rating).toFixed(1) : '—' },
    { label: 'Reach score', value: podcast.podcast_reach_score ? String(podcast.podcast_reach_score) : '—' },
    { label: 'Last published', value: day(podcast.last_posted_at) },
    { label: 'Language', value: podcast.language || '—' },
    { label: 'Region', value: podcast.region || '—' },
  ]

  return (
    <Dialog open={Boolean(podcast)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <Avatar className="h-14 w-14 shrink-0 rounded-xl border">
              {podcast.podcast_image_url && <AvatarImage src={podcast.podcast_image_url} alt="" className="object-cover" />}
              <AvatarFallback className="rounded-xl font-bold">{initials(podcast.podcast_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="text-left text-xl">{podcast.podcast_name}</DialogTitle>
              <DialogDescription className="text-left">
                {podcast.host_name || podcast.publisher_name || 'Publisher not listed'}
              </DialogDescription>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* The same words the relationship book uses, so a host this
                    workspace has already burned reads the same here. */}
                {relationship && (
                  <Badge variant="outline" className={relationship.className}>{relationship.label}</Badge>
                )}
                {!podcast.is_active && <Badge variant="outline" className="border-muted bg-muted/40">Inactive</Badge>}
                {categories.map((name) => (
                  <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {podcast.podcast_description || 'No public show description is available yet.'}
          </p>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-muted/20 p-2.5">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-0.5 text-sm font-medium">{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-medium">Contact</p>
            {podcast.direct_email ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Verified</Badge>
                <span className="break-all">{podcast.direct_email}</span>
                {podcast.direct_verified_at && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />checked {day(podcast.direct_verified_at)}
                  </span>
                )}
              </p>
            ) : podcast.free_podscan_email ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Free email</Badge>
                <span className="break-all">{podcast.free_podscan_email}</span>
                <span className="text-xs text-muted-foreground">published by the show and not confirmed</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No usable public email yet.</p>
            )}
          </div>

          {/* Why this row is in a shared catalogue at all: somebody's shortlist
              put it there, and that is worth knowing before adding it again. */}
          <p className="text-xs leading-5 text-muted-foreground">
            Used on {podcast.shortlist_uses.toLocaleString()} client {podcast.shortlist_uses === 1 ? 'shortlist' : 'shortlists'}
            {podcast.workspace_uses > 0 && ` across ${podcast.workspace_uses.toLocaleString()} ${podcast.workspace_uses === 1 ? 'workspace' : 'workspaces'}`}.
            {podcast.catalog_updated_at && ` Catalog data refreshed ${day(podcast.catalog_updated_at)}.`}
          </p>

          <div className="flex flex-wrap gap-2">
            {publicUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />Open the show
                </a>
              </Button>
            )}
            {feedUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={feedUrl} target="_blank" rel="noreferrer">
                  <Rss className="mr-2 h-4 w-4" />RSS feed
                </a>
              </Button>
            )}
            {(podcast.direct_email || podcast.free_podscan_email) && (
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${podcast.direct_email || podcast.free_podscan_email}`}>
                  <Mail className="mr-2 h-4 w-4" />Email the show
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
