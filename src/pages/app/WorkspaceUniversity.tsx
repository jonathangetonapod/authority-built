import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  GraduationCap,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

import {
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import {
  deleteUniversityLesson,
  getUniversityLessons,
  reorderUniversityLessons,
  saveUniversityLesson,
  setUniversityLessonWatched,
  universityEmbedUrl,
  universityThumbnailUrl,
  type UniversityCategory,
  type UniversityLesson,
  type UniversityLessonsResponse,
} from '@/services/universityLessons'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
} from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Categories mirror the sidebar so a lesson maps onto the screen it teaches.
 * `segment` is where "Open the module" jumps; null for categories that are
 * about the platform rather than one page. Only categories with lessons
 * render, so the page never looks empty while content is still being made.
 * Billing's segment only exists on the tenant's own tree — the platform
 * view has no workspace-scoped billing route, so the link is dropped there
 * (the sidebar hides its billing item for the same reason).
 */
const CATEGORY_META: Array<{ id: UniversityCategory; label: string; segment: string | null }> = [
  { id: 'getting_started', label: 'Getting started', segment: null },
  { id: 'onboarding', label: 'Onboarding', segment: 'onboarding' },
  { id: 'clients', label: 'Clients', segment: 'clients' },
  { id: 'podcast_finder', label: 'Podcast Finder', segment: 'podcast-finder' },
  { id: 'podcast_database', label: 'Podcast Database', segment: 'podcast-database' },
  { id: 'client_podcast_system', label: 'Client Command Center', segment: 'client-podcast-system' },
  { id: 'prospects', label: 'Prospect Studio', segment: 'prospects' },
  { id: 'client_campaigns', label: 'Client Campaigns', segment: 'client-campaigns' },
  { id: 'relationships', label: 'Relationships', segment: 'relationships' },
  { id: 'master_inbox', label: 'Master Inbox', segment: 'master-inbox' },
  { id: 'mailboxes', label: 'Mailboxes', segment: 'mailboxes' },
  { id: 'billing', label: 'Billing & credits', segment: 'settings/billing' },
  { id: 'settings', label: 'Settings', segment: 'settings' },
  { id: 'other', label: 'More', segment: null },
]

interface LessonDraft {
  id: string | null
  category: UniversityCategory
  title: string
  description: string
  video_url: string
  published: boolean
}

const blankDraft = (): LessonDraft => ({
  id: null,
  category: 'getting_started',
  title: '',
  description: '',
  video_url: '',
  published: true,
})

interface Props {
  platformWorkspaceId?: string
}

const WorkspaceUniversity = ({ platformWorkspaceId }: Props) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)

  const [search, setSearch] = useState('')
  const [playing, setPlaying] = useState<UniversityLesson | null>(null)
  const [editing, setEditing] = useState<LessonDraft | null>(null)
  const [deleting, setDeleting] = useState<UniversityLesson | null>(null)

  // University content is platform-global — every workspace sees the same
  // lessons — so the key carries no workspace id on purpose.
  const lessonsKey = ['university-lessons', user?.id || 'unknown'] as const
  const lessonsQuery = useQuery({
    queryKey: lessonsKey,
    queryFn: getUniversityLessons,
    staleTime: 60_000,
    retry: false,
  })
  const lessons = lessonsQuery.data?.lessons ?? []
  const canManage = lessonsQuery.data?.can_manage === true
  const watchedIds = useMemo(
    () => new Set(lessonsQuery.data?.watched_lesson_ids ?? []),
    [lessonsQuery.data?.watched_lesson_ids],
  )
  // "New": recent and not yet watched. No last-visit bookkeeping — a badge
  // that clears itself the moment the lesson is actually watched.
  const isNew = (lesson: UniversityLesson) =>
    !watchedIds.has(lesson.id) && Date.now() - Date.parse(lesson.created_at) < 14 * 24 * 60 * 60 * 1000

  const watchMutation = useMutation({
    mutationFn: ({ lessonId, watched }: { lessonId: string; watched: boolean }) =>
      setUniversityLessonWatched(lessonId, watched),
    // A refetch started BEFORE the mark (a save or reorder invalidation)
    // resolves with pre-mark data and would overwrite the patch below,
    // visually reverting a watched check the server already holds.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: lessonsKey })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The watched mark could not be saved.'),
    // The mark is the cheapest possible write; patch the cache directly so
    // the check appears without refetching the whole library.
    onSuccess: (_result, { lessonId, watched }) => {
      queryClient.setQueryData(lessonsKey, (current: UniversityLessonsResponse | undefined) => (current
        ? {
          ...current,
          watched_lesson_ids: watched
            ? [...new Set([...current.watched_lesson_ids, lessonId])]
            : current.watched_lesson_ids.filter((id) => id !== lessonId),
        }
        : current))
    },
  })

  // Lessons this person explicitly un-watched in this visit. Without it the
  // undo was unkeepable: reopening the lesson — even to peek — instantly
  // re-marked it watched, clobbering the explicit choice.
  const unwatchedByHandRef = useRef<Set<string>>(new Set())

  const openPlayer = (lesson: UniversityLesson) => {
    setPlaying(lesson)
    // Opening the player is the watch signal; the dialog offers the undo.
    if (lesson.published && !watchedIds.has(lesson.id) && !unwatchedByHandRef.current.has(lesson.id)) {
      watchMutation.mutate({ lessonId: lesson.id, watched: true })
    }
  }

  const toggleWatched = (lesson: UniversityLesson) => {
    const next = !watchedIds.has(lesson.id)
    if (next) unwatchedByHandRef.current.delete(lesson.id)
    else unwatchedByHandRef.current.add(lesson.id)
    watchMutation.mutate({ lessonId: lesson.id, watched: next })
  }

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'university'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isPlatformWorkspace && validWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId: selectedWorkspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const visibleByCategory = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = lessons.filter((lesson) => !query
      || lesson.title.toLowerCase().includes(query)
      || lesson.description.toLowerCase().includes(query))
    const grouped = new Map<UniversityCategory, UniversityLesson[]>()
    const knownCategories = new Set(CATEGORY_META.map((meta) => meta.id))
    for (const lesson of filtered) {
      // A category this page does not know renders under "More" instead of
      // nowhere — the render loop iterates CATEGORY_META, so an unknown
      // key would make the lesson silently invisible.
      const category = knownCategories.has(lesson.category) ? lesson.category : 'other'
      const list = grouped.get(category) ?? []
      list.push(lesson)
      grouped.set(category, list)
    }
    return grouped
  }, [lessons, search])

  const saveMutation = useMutation({
    mutationFn: (draft: LessonDraft) => saveUniversityLesson({
      id: draft.id,
      category: draft.category,
      title: draft.title.trim(),
      description: draft.description.trim(),
      video_url: draft.video_url.trim(),
      published: draft.published,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lessonsKey })
      setEditing(null)
      toast.success('Lesson saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The lesson could not be saved.'),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUniversityLesson(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: lessonsKey })
      setDeleting(null)
      toast.success('Lesson deleted.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The lesson could not be deleted.'),
  })
  const reorderMutation = useMutation({
    mutationFn: ({ category, orderedIds }: { category: UniversityCategory; orderedIds: string[] }) =>
      reorderUniversityLessons(category, orderedIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: lessonsKey }),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The order could not be saved.'),
  })

  const moveLesson = (category: UniversityCategory, lessonId: string, direction: -1 | 1) => {
    // Reorder over the category's FULL list, not the filtered view — moving
    // an item while searching must not discard the hidden lessons' order.
    const ids = lessons.filter((lesson) => lesson.category === category).map((lesson) => lesson.id)
    const index = ids.indexOf(lessonId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderMutation.mutate({ category, orderedIds: ids })
  }

  const totalVisible = [...visibleByCategory.values()].reduce((sum, list) => sum + list.length, 0)

  // Billing has no workspace-scoped route; in the platform view its module
  // link would 404, so it renders as no link at all there.
  const moduleSegment = (metaId: UniversityCategory, segment: string | null): string | null =>
    isPlatformWorkspace && metaId === 'billing' ? null : segment

  if (isPlatformWorkspace && !validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Workspace unavailable — check the address and try again.
          </CardContent>
        </Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <GraduationCap className="h-6 w-6 text-primary" />University
            </h1>
            <p className="mt-1 max-w-2xl leading-6 text-muted-foreground">
              Learn the platform, one short video at a time. Each lesson maps to the screen it teaches.
            </p>
          </div>
          {canManage && (
            <Button type="button" onClick={() => setEditing(blankDraft())}>
              <Plus className="mr-2 h-4 w-4" />Add lesson
            </Button>
          )}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search lessons…"
            className="pl-9"
            aria-label="Search lessons"
          />
        </div>

        {lessonsQuery.isLoading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading lessons…
          </div>
        ) : lessonsQuery.isError ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6 text-sm">
              <span>The lessons could not be loaded.</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void lessonsQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : totalVisible === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {search.trim()
                ? 'No lessons match that search.'
                : canManage
                  ? 'No lessons yet. Record a walkthrough and add its Loom or YouTube link here.'
                  : 'Lessons are on their way — check back soon.'}
            </CardContent>
          </Card>
        ) : (
          CATEGORY_META.map(({ id, label, segment }) => {
            const categoryLessons = visibleByCategory.get(id) ?? []
            if (categoryLessons.length === 0) return null
            return (
              <section key={id} aria-labelledby={`university-${id}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 id={`university-${id}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const published = categoryLessons.filter((item) => item.published)
                      const watched = published.filter((item) => watchedIds.has(item.id)).length
                      return published.length > 0
                        ? `${watched} of ${published.length} watched`
                        : `${categoryLessons.length} lesson${categoryLessons.length === 1 ? '' : 's'}`
                    })()}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryLessons.map((lesson) => {
                    const thumbnail = universityThumbnailUrl(lesson)
                    /*
                     * Arrow positions come from the FULL category list — the
                     * same list moveLesson swaps in. Using the filtered index
                     * let an arrow look enabled while a search hid neighbors:
                     * clicking it swapped with an invisible lesson and the
                     * visible order never moved. While a search is active the
                     * arrows are disabled outright; a reorder you cannot see
                     * is not a reorder.
                     */
                    const fullCategoryIds = lessons.filter((item) => item.category === id).map((item) => item.id)
                    const fullIndex = fullCategoryIds.indexOf(lesson.id)
                    const searching = search.trim().length > 0
                    return (
                      <Card key={lesson.id} className="overflow-hidden">
                        <button
                          type="button"
                          className="group relative block aspect-video w-full bg-gradient-to-br from-primary/15 via-violet-500/10 to-fuchsia-400/10"
                          onClick={() => openPlayer(lesson)}
                          aria-label={`Play ${lesson.title}`}
                        >
                          {thumbnail && (
                            <img
                              src={thumbnail}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(event) => { event.currentTarget.style.display = 'none' }}
                            />
                          )}
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="rounded-full bg-background/90 p-3 shadow transition-transform group-hover:scale-110">
                              <Play className="h-5 w-5 text-primary" />
                            </span>
                          </span>
                          {!lesson.published && (
                            <Badge className="absolute left-2 top-2 border-amber-200 bg-amber-50 text-amber-800" variant="outline">Draft</Badge>
                          )}
                          {lesson.published && isNew(lesson) && (
                            <Badge className="absolute left-2 top-2 border-primary/30 bg-primary/10 text-primary" variant="outline">New</Badge>
                          )}
                          {watchedIds.has(lesson.id) && (
                            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-medium text-white">
                              <Check className="h-3 w-3" />Watched
                            </span>
                          )}
                        </button>
                        <CardContent className="space-y-1.5 p-4">
                          <p className="text-sm font-semibold leading-5">{lesson.title}</p>
                          {lesson.description && (
                            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{lesson.description}</p>
                          )}
                          <div className="flex items-center justify-between pt-1">
                            {moduleSegment(id, segment) ? (
                              <Link
                                to={`${baseHref}/${moduleSegment(id, segment)}`}
                                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                              >
                                Open the module
                              </Link>
                            ) : <span />}
                            {canManage && (
                              <span className="flex items-center gap-0.5">
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={searching ? 'Clear the search to reorder' : undefined} disabled={searching || fullIndex <= 0 || reorderMutation.isPending} onClick={() => moveLesson(id, lesson.id, -1)} aria-label={`Move ${lesson.title} up`}>
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title={searching ? 'Clear the search to reorder' : undefined} disabled={searching || fullIndex === fullCategoryIds.length - 1 || reorderMutation.isPending} onClick={() => moveLesson(id, lesson.id, 1)} aria-label={`Move ${lesson.title} down`}>
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  aria-label={`Edit ${lesson.title}`}
                                  onClick={() => setEditing({
                                    id: lesson.id,
                                    category: lesson.category,
                                    title: lesson.title,
                                    description: lesson.description,
                                    video_url: lesson.video_url,
                                    published: lesson.published,
                                  })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Delete ${lesson.title}`} onClick={() => setDeleting(lesson)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </div>

      <Dialog open={Boolean(playing)} onOpenChange={(open) => { if (!open) setPlaying(null) }}>
        <DialogContent className="max-w-3xl">
          {playing && (
            <>
              <DialogHeader>
                <DialogTitle>{playing.title}</DialogTitle>
                {playing.description && <DialogDescription>{playing.description}</DialogDescription>}
              </DialogHeader>
              <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
                <iframe
                  src={universityEmbedUrl(playing)}
                  title={playing.title}
                  className="h-full w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {(() => {
                  const segment = moduleSegment(playing.category, CATEGORY_META.find((meta) => meta.id === playing.category)?.segment ?? null)
                  return segment ? (
                    <Button asChild variant="outline">
                      <Link to={`${baseHref}/${segment}`}>
                        <ExternalLink className="mr-2 h-4 w-4" />Open the module this teaches
                      </Link>
                    </Button>
                  ) : <span />
                })()}
                {playing.published && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={watchMutation.isPending}
                    onClick={() => toggleWatched(playing)}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {watchedIds.has(playing.id) ? 'Mark as unwatched' : 'Mark as watched'}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !saveMutation.isPending) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? 'Edit lesson' : 'Add lesson'}</DialogTitle>
                <DialogDescription>
                  Paste a Loom share link or a YouTube link. Published lessons appear to every workspace immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="university-title">Title</Label>
                  <Input
                    id="university-title"
                    value={editing.title}
                    maxLength={200}
                    onChange={(event) => setEditing((current) => current && ({ ...current, title: event.target.value }))}
                    placeholder="Add your first client"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="university-url">Video link</Label>
                  <Input
                    id="university-url"
                    value={editing.video_url}
                    maxLength={500}
                    onChange={(event) => setEditing((current) => current && ({ ...current, video_url: event.target.value }))}
                    placeholder="https://www.loom.com/share/…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="university-category">Category</Label>
                  <select
                    id="university-category"
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={editing.category}
                    onChange={(event) => setEditing((current) => current && ({ ...current, category: event.target.value as UniversityCategory }))}
                  >
                    {CATEGORY_META.map((meta) => (
                      <option key={meta.id} value={meta.id}>{meta.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="university-description">Description</Label>
                  <Textarea
                    id="university-description"
                    value={editing.description}
                    maxLength={2000}
                    rows={3}
                    onChange={(event) => setEditing((current) => current && ({ ...current, description: event.target.value }))}
                    placeholder="What this lesson covers, in a sentence or two."
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={editing.published}
                    onCheckedChange={(checked) => setEditing((current) => current && ({ ...current, published: checked === true }))}
                  />
                  <span>Published — visible to every workspace</span>
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={saveMutation.isPending} onClick={() => setEditing(null)}>Cancel</Button>
                <Button
                  type="button"
                  disabled={saveMutation.isPending || !editing.title.trim() || !editing.video_url.trim()}
                  onClick={() => saveMutation.mutate(editing)}
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing.id ? 'Save lesson' : 'Add lesson'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” disappears from every workspace. The video itself stays on {deleting?.provider === 'loom' ? 'Loom' : 'YouTube'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => { event.preventDefault(); if (deleting) deleteMutation.mutate(deleting.id) }}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete lesson'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceUniversity
