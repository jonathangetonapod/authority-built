import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  Loader2,
  Mail,
  Mic2,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Target,
  UserRound,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { openExternalUrl } from '@/lib/externalUrl'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { cn } from '@/lib/utils'
import {
  archiveWorkspaceProspect,
  buildWorkspaceProspect,
  createWorkspaceProspect,
  getWorkspaceProspect,
  getWorkspaceProspects,
  setWorkspaceProspectPublished,
  updateWorkspaceProspect,
  updateWorkspaceProspectPodcast,
  type ProspectCtaType,
  type ProspectLifecycleStatus,
  type ProspectReadiness,
  type ProspectShortlistPodcast,
  type WorkspaceProspect,
  type WorkspaceProspectDetail,
  type WorkspaceProspectProfileInput,
} from '@/services/prospectDashboards'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceProspectDashboardsProps {
  platformWorkspaceId?: string
}

interface ProspectProfileForm {
  name: string
  email: string
  company: string
  title: string
  bio: string
  imageUrl: string
  linkedinUrl: string
  website: string
  industry: string
  expertise: string
  topics: string
  targetAudience: string
  ctaType: ProspectCtaType
  ctaLabel: string
  ctaUrl: string
}

const emptyProfileForm: ProspectProfileForm = {
  name: '',
  email: '',
  company: '',
  title: '',
  bio: '',
  imageUrl: '',
  linkedinUrl: '',
  website: '',
  industry: '',
  expertise: '',
  topics: '',
  targetAudience: '',
  ctaType: 'reply',
  ctaLabel: 'Reply to this email',
  ctaUrl: '',
}

function profileFormFor(prospect: WorkspaceProspect): ProspectProfileForm {
  return {
    name: prospect.prospect_name,
    email: prospect.prospect_email || '',
    company: prospect.prospect_company || '',
    title: prospect.prospect_title || '',
    bio: prospect.prospect_bio || '',
    imageUrl: prospect.prospect_image_url || '',
    linkedinUrl: prospect.prospect_linkedin_url || '',
    website: prospect.prospect_website || '',
    industry: prospect.prospect_industry || '',
    expertise: prospect.prospect_expertise?.join(', ') || '',
    topics: prospect.prospect_topics?.join(', ') || '',
    targetAudience: prospect.prospect_target_audience || '',
    ctaType: prospect.cta_type,
    ctaLabel: prospect.cta_label,
    ctaUrl: prospect.cta_url || '',
  }
}

function profileInputFor(form: ProspectProfileForm): WorkspaceProspectProfileInput {
  const commaList = (value: string) => value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return {
    name: form.name,
    email: form.email,
    company: form.company,
    title: form.title,
    bio: form.bio,
    image_url: form.imageUrl,
    linkedin_url: form.linkedinUrl,
    website: form.website,
    industry: form.industry,
    expertise: commaList(form.expertise),
    topics: commaList(form.topics),
    target_audience: form.targetAudience,
    cta_type: form.ctaType,
    cta_label: form.ctaLabel,
    cta_url: form.ctaUrl,
  }
}

function lifecycleLabel(status: ProspectLifecycleStatus): string {
  const labels: Record<ProspectLifecycleStatus, string> = {
    draft: 'Draft',
    researching: 'Researching',
    matching: 'Matching',
    analyzing: 'Analyzing',
    review: 'Needs review',
    ready: 'Live',
    sent: 'Sent',
    viewed: 'Viewed',
    engaged: 'Engaged',
    converted: 'Converted',
    failed: 'Build failed',
    archived: 'Archived',
  }
  return labels[status]
}

function lifecycleClass(status: ProspectLifecycleStatus): string {
  if (['ready', 'sent', 'viewed', 'engaged', 'converted'].includes(status)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (['matching', 'analyzing', 'researching'].includes(status)) {
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'review') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatNumber(value: number | null): string {
  if (!value) return '—'
  return new Intl.NumberFormat(undefined, { notation: value >= 1_000 ? 'compact' : 'standard' }).format(value)
}

function readinessPercent(readiness: ProspectReadiness): number {
  return Math.round(([
    readiness.profile_ready,
    readiness.visible_count >= 5,
    readiness.analyzed_count >= 5,
    readiness.cta_ready,
  ].filter(Boolean).length / 4) * 100)
}

function publicProspectUrl(slug: string): string {
  return `${window.location.origin}/prospect/${encodeURIComponent(slug)}`
}

function ReadinessItem({ complete, children }: { complete: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {complete
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={complete ? 'text-foreground' : 'text-muted-foreground'}>{children}</span>
    </div>
  )
}

function ProspectProfileDialog({
  open,
  editing,
  form,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean
  editing: boolean
  form: ProspectProfileForm
  saving: boolean
  onOpenChange: (open: boolean) => void
  onChange: (form: ProspectProfileForm) => void
  onSubmit: () => void
}) {
  const linkedCta = form.ctaType === 'book_call' || form.ctaType === 'learn_more'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{editing ? 'Edit prospect profile' : 'Create a prospect dashboard'}</DialogTitle>
          <DialogDescription>
            Give Scout enough context to find a focused, credible set of podcast opportunities. You can save an incomplete draft.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
          <ScrollArea className="max-h-[calc(92vh-180px)] px-6">
            <div className="space-y-6 pb-6">
              <section className="space-y-4">
                <div>
                  <h3 className="font-medium">The person</h3>
                  <p className="text-sm text-muted-foreground">Start with the details a host would use to understand the guest.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="prospect-name">Name</Label>
                    <Input id="prospect-name" required autoFocus value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Dallas Fontaine" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-email">Email</Label>
                    <Input id="prospect-email" type="email" value={form.email} onChange={(event) => onChange({ ...form, email: event.target.value })} placeholder="dallas@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-title">Title</Label>
                    <Input id="prospect-title" value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} placeholder="Founder & CEO" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-company">Company</Label>
                    <Input id="prospect-company" value={form.company} onChange={(event) => onChange({ ...form, company: event.target.value })} placeholder="ScaleLabs" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-industry">Industry</Label>
                    <Input id="prospect-industry" value={form.industry} onChange={(event) => onChange({ ...form, industry: event.target.value })} placeholder="B2B SaaS" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="prospect-bio">Guest profile</Label>
                      <span className={cn('text-xs', form.bio.trim().length >= 80 ? 'text-emerald-600' : 'text-muted-foreground')}>
                        {form.bio.trim().length}/80 minimum to build
                      </span>
                    </div>
                    <Textarea id="prospect-bio" rows={8} value={form.bio} onChange={(event) => onChange({ ...form, bio: event.target.value })} placeholder="Include their credibility, strongest outcomes, point of view, and the stories they can tell on a podcast." />
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-4">
                <div>
                  <h3 className="font-medium">Matching direction</h3>
                  <p className="text-sm text-muted-foreground">Specific inputs produce a tighter shortlist and stronger episode angles.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prospect-topics">Speaking topics</Label>
                    <Input id="prospect-topics" value={form.topics} onChange={(event) => onChange({ ...form, topics: event.target.value })} placeholder="AI implementation, B2B sales" />
                    <p className="text-xs text-muted-foreground">Separate topics with commas.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-expertise">Expertise</Label>
                    <Input id="prospect-expertise" value={form.expertise} onChange={(event) => onChange({ ...form, expertise: event.target.value })} placeholder="SaaS growth, acquisitions" />
                    <p className="text-xs text-muted-foreground">Separate areas with commas.</p>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="prospect-audience">Ideal audience</Label>
                    <Textarea id="prospect-audience" rows={3} value={form.targetAudience} onChange={(event) => onChange({ ...form, targetAudience: event.target.value })} placeholder="Founders and revenue leaders at growing B2B software companies." />
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-4">
                <div>
                  <h3 className="font-medium">Links and next step</h3>
                  <p className="text-sm text-muted-foreground">Choose what the prospect should do after reviewing the shortlist.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prospect-linkedin">LinkedIn</Label>
                    <Input id="prospect-linkedin" type="url" value={form.linkedinUrl} onChange={(event) => onChange({ ...form, linkedinUrl: event.target.value })} placeholder="https://linkedin.com/in/..." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-website">Website</Label>
                    <Input id="prospect-website" type="url" value={form.website} onChange={(event) => onChange({ ...form, website: event.target.value })} placeholder="https://company.com" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="prospect-image">Profile image URL</Label>
                    <Input id="prospect-image" type="url" value={form.imageUrl} onChange={(event) => onChange({ ...form, imageUrl: event.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Call to action</Label>
                    <Select value={form.ctaType} onValueChange={(ctaType: ProspectCtaType) => onChange({
                      ...form,
                      ctaType,
                      ctaLabel: ctaType === 'book_call'
                        ? 'Book a strategy call'
                        : ctaType === 'learn_more'
                          ? 'Learn more'
                          : ctaType === 'none'
                            ? 'No next step'
                            : 'Reply to this email',
                    })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reply">Reply to the email</SelectItem>
                        <SelectItem value="book_call">Book a call</SelectItem>
                        <SelectItem value="learn_more">Open a link</SelectItem>
                        <SelectItem value="none">No call to action</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-cta-label">Button or prompt label</Label>
                    <Input id="prospect-cta-label" value={form.ctaLabel} onChange={(event) => onChange({ ...form, ctaLabel: event.target.value })} disabled={form.ctaType === 'none'} />
                  </div>
                  {linkedCta && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="prospect-cta-url">Call-to-action URL</Label>
                      <Input id="prospect-cta-url" type="url" required value={form.ctaUrl} onChange={(event) => onChange({ ...form, ctaUrl: event.target.value })} placeholder="https://cal.com/..." />
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>
          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save profile' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProspectListCard({
  prospect,
  selected,
  onSelect,
}: {
  prospect: WorkspaceProspect
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border p-4 text-left transition-all',
        selected
          ? 'border-primary bg-primary/[0.04] shadow-sm ring-1 ring-primary/20'
          : 'border-border bg-background hover:border-primary/40 hover:bg-muted/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{prospect.prospect_name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[prospect.prospect_title, prospect.prospect_company].filter(Boolean).join(' · ') || 'Profile draft'}
          </p>
        </div>
        <Badge variant="outline" className={cn('shrink-0 font-normal', lifecycleClass(prospect.lifecycle_status))}>
          {lifecycleLabel(prospect.lifecycle_status)}
        </Badge>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{prospect.readiness.visible_count} matches</span>
        <span>{prospect.view_count || 0} views</span>
        <span>{readinessPercent(prospect.readiness)}% ready</span>
      </div>
      <Progress value={readinessPercent(prospect.readiness)} className="mt-2 h-1.5" />
    </button>
  )
}

function ShortlistRow({
  podcast,
  disabled,
  onFeature,
  onVisibility,
}: {
  podcast: ProspectShortlistPodcast
  disabled: boolean
  onFeature: () => void
  onVisibility: () => void
}) {
  const description = podcast.relevance_reason
    || podcast.ai_fit_reasons?.[0]
    || podcast.ai_clean_description
    || podcast.podcast_description
  return (
    <div className={cn('rounded-2xl border bg-background p-4', podcast.visibility === 'archived' && 'opacity-65')}>
      <div className="flex gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
          {podcast.podcast_image_url
            ? <img src={podcast.podcast_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <div className="flex h-full w-full items-center justify-center"><Mic2 className="h-6 w-6 text-muted-foreground" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold leading-tight">{podcast.podcast_name}</h4>
                {podcast.is_featured && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100"><Star className="mr-1 h-3 w-3 fill-current" />Featured</Badge>}
                {podcast.relevance_score !== null && <Badge variant="secondary">{Number(podcast.relevance_score).toFixed(1)} fit</Badge>}
              </div>
              {podcast.publisher_name && <p className="mt-1 text-xs text-muted-foreground">{podcast.publisher_name}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {podcast.podcast_url && (
                <Button type="button" size="icon" variant="ghost" aria-label={`Open ${podcast.podcast_name}`} onClick={() => openExternalUrl(podcast.podcast_url!)}>
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              )}
              {podcast.visibility === 'visible' && (
                <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={podcast.is_featured ? `Unfeature ${podcast.podcast_name}` : `Feature ${podcast.podcast_name}`} onClick={onFeature}>
                  <Star className={cn('h-4 w-4', podcast.is_featured && 'fill-amber-400 text-amber-500')} />
                </Button>
              )}
              <Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label={podcast.visibility === 'visible' ? `Remove ${podcast.podcast_name}` : `Restore ${podcast.podcast_name}`} onClick={onVisibility}>
                {podcast.visibility === 'visible' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {description && <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{formatNumber(podcast.audience_size)} listeners</span>
            <span>{podcast.episode_count || '—'} episodes</span>
            {podcast.itunes_rating && <span>{Number(podcast.itunes_rating).toFixed(1)} rating</span>}
            <span className="capitalize">{podcast.match_source.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const WorkspaceProspectDashboards = ({ platformWorkspaceId }: WorkspaceProspectDashboardsProps) => {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState<ProspectProfileForm>(emptyProfileForm)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [showRemoved, setShowRemoved] = useState(false)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || ''
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const listQueryKey = ['workspace-prospects', user?.id || 'unknown', workspaceId] as const

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: () => getWorkspaceProspects(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
  })

  const prospects = useMemo(() => listQuery.data?.dashboards || [], [listQuery.data?.dashboards])
  useEffect(() => {
    if (prospects.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !prospects.some((prospect) => prospect.id === selectedId)) {
      setSelectedId(prospects[0].id)
    }
  }, [prospects, selectedId])

  const detailQueryKey = ['workspace-prospect', user?.id || 'unknown', workspaceId, selectedId] as const
  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => getWorkspaceProspect(workspaceId, selectedId!),
    enabled: validWorkspaceId && Boolean(selectedId),
    retry: false,
  })
  const detail = detailQuery.data
  const selected = detail?.dashboard || prospects.find((prospect) => prospect.id === selectedId) || null
  const canManage = Boolean(listQuery.data?.can_manage)

  const refreshAfterMutation = async (nextDetail?: WorkspaceProspectDetail) => {
    if (nextDetail && selectedId) queryClient.setQueryData(detailQueryKey, nextDetail)
    await queryClient.invalidateQueries({ queryKey: listQueryKey })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!canManage) throw new Error('Workspace manager access is required.')
      if (!profileForm.name.trim()) throw new Error('Prospect name is required.')
      if (editingProfile && selected) {
        return {
          created: false,
          detail: await updateWorkspaceProspect(
            workspaceId,
            selected.id,
            profileInputFor(profileForm),
            selected.updated_at,
          ),
        }
      }
      return {
        created: true,
        prospect: await createWorkspaceProspect(workspaceId, profileInputFor(profileForm)),
      }
    },
    onSuccess: async (result) => {
      setProfileDialogOpen(false)
      if (result.created && result.prospect) setSelectedId(result.prospect.id)
      if (!result.created && result.detail) {
        queryClient.setQueryData(detailQueryKey, result.detail)
      }
      await queryClient.invalidateQueries({ queryKey: listQueryKey })
      toast.success(result.created ? 'Prospect draft created.' : 'Prospect profile updated.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The prospect profile could not be saved.'),
  })

  const buildMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Choose a prospect first.')
      return buildWorkspaceProspect(workspaceId, selected.id)
    },
    onSuccess: async (nextDetail) => {
      await refreshAfterMutation(nextDetail)
      toast.success('Shortlist built. Review the matches before publishing.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The shortlist could not be built.'),
  })

  const publicationMutation = useMutation({
    mutationFn: (published: boolean) => {
      if (!selected) throw new Error('Choose a prospect first.')
      return setWorkspaceProspectPublished(workspaceId, selected.id, published)
    },
    onSuccess: async (nextDetail, published) => {
      await refreshAfterMutation(nextDetail)
      toast.success(published ? 'Dashboard is live and ready to share.' : 'Dashboard unpublished.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Publication could not be changed.'),
  })

  const podcastMutation = useMutation({
    mutationFn: ({ podcast, changes }: {
      podcast: ProspectShortlistPodcast
      changes: { visibility?: 'visible' | 'archived'; is_featured?: boolean }
    }) => {
      if (!selected) throw new Error('Choose a prospect first.')
      return updateWorkspaceProspectPodcast(workspaceId, selected.id, podcast.podcast_id, changes)
    },
    onSuccess: async (nextDetail) => refreshAfterMutation(nextDetail),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The shortlist could not be updated.'),
  })

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Choose a prospect first.')
      await archiveWorkspaceProspect(workspaceId, selected.id)
    },
    onSuccess: async () => {
      setArchiveDialogOpen(false)
      setSelectedId(null)
      await queryClient.invalidateQueries({ queryKey: listQueryKey })
      toast.success('Prospect dashboard archived.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The prospect could not be archived.'),
  })

  const filteredProspects = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return prospects
    return prospects.filter((prospect) => [
      prospect.prospect_name,
      prospect.prospect_email,
      prospect.prospect_company,
      prospect.prospect_title,
    ].some((value) => value?.toLowerCase().includes(query)))
  }, [prospects, search])

  const workspaceSummary = listQuery.data?.workspace
  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceName: workspaceSummary?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(workspaceSummary?.id, workspaceSummary?.logo_path, workspaceSummary?.logo_updated_at),
        baseHref: selectedWorkspaceBaseHref(selectedWorkspaceId),
      }
    : undefined

  const openCreate = () => {
    setEditingProfile(false)
    setProfileForm(emptyProfileForm)
    setProfileDialogOpen(true)
  }
  const openEdit = () => {
    if (!selected) return
    setEditingProfile(true)
    setProfileForm(profileFormFor(selected))
    setProfileDialogOpen(true)
  }
  const copyLiveLink = async () => {
    if (!selected?.published_at) return
    try {
      await navigator.clipboard.writeText(publicProspectUrl(selected.slug))
      toast.success('Private dashboard link copied.')
    } catch {
      toast.error('The link could not be copied. Open it and copy it from the address bar.')
    }
  }

  const visiblePodcasts = detail?.podcasts.filter((podcast) => podcast.visibility === 'visible') || []
  const removedPodcasts = detail?.podcasts.filter((podcast) => podcast.visibility === 'archived') || []
  const publishedCount = prospects.filter((prospect) => prospect.published_at).length
  const reviewCount = prospects.filter((prospect) => ['review', 'failed'].includes(prospect.lifecycle_status)).length
  const totalViews = prospects.reduce((total, prospect) => total + (prospect.view_count || 0), 0)
  const building = buildMutation.isPending || ['matching', 'analyzing'].includes(selected?.lifecycle_status || '')
  const mutating = building || publicationMutation.isPending || podcastMutation.isPending || archiveMutation.isPending
  const stage = selected?.published_at
    ? 3
    : selected && selected.readiness.visible_count > 0
      ? 2
      : building
        ? 1
        : 0

  if (!workspaceId || !validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Lead magnet workspace
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Prospect Studio</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              Turn a strong guest profile into a focused, share-ready podcast shortlist in minutes.
            </p>
          </div>
          {canManage && <Button size="lg" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New prospect</Button>}
        </div>

        {listQuery.isLoading ? (
          <Card><CardContent className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>
        ) : listQuery.error ? (
          <Card><CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center"><p className="font-semibold text-destructive">Prospect Studio could not be loaded</p><p className="max-w-md text-sm text-muted-foreground">{listQuery.error instanceof Error ? listQuery.error.message : 'Check your connection and try again.'}</p><Button variant="outline" onClick={() => void listQuery.refetch()}>Try again</Button></CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-blue-50 p-3 text-blue-700"><Users className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{prospects.length}</p><p className="text-sm text-muted-foreground">Active prospects</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Globe2 className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{publishedCount}</p><p className="text-sm text-muted-foreground">Live dashboards</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Eye className="h-5 w-5" /></div><div><p className="text-2xl font-bold">{totalViews}</p><p className="text-sm text-muted-foreground">Prospect views{reviewCount > 0 ? ` · ${reviewCount} to review` : ''}</p></div></CardContent></Card>
            </div>

            <div className="grid min-h-[680px] gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <Card className="h-fit xl:sticky xl:top-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Prospects</CardTitle>
                  <CardDescription>Choose a prospect to build or review.</CardDescription>
                  <div className="relative pt-2">
                    <Search className="absolute left-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search prospects" className="pl-9" />
                  </div>
                </CardHeader>
                <CardContent>
                  {prospects.length === 0 ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-6 text-center">
                      <div className="rounded-full bg-primary/10 p-4 text-primary"><Target className="h-7 w-7" /></div>
                      <div><p className="font-semibold">Create your first lead magnet</p><p className="mt-1 text-sm text-muted-foreground">Add a profile, let Scout build the shortlist, review it, and publish.</p></div>
                      {canManage && <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New prospect</Button>}
                    </div>
                  ) : filteredProspects.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">No prospects match “{search}”.</div>
                  ) : (
                    <div className="space-y-3">
                      {filteredProspects.map((prospect) => <ProspectListCard key={prospect.id} prospect={prospect} selected={prospect.id === selectedId} onSelect={() => { setSelectedId(prospect.id); setShowRemoved(false) }} />)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {!selected ? (
                <Card><CardContent className="flex min-h-[520px] items-center justify-center text-center text-muted-foreground">Choose a prospect to get started.</CardContent></Card>
              ) : detailQuery.isLoading ? (
                <Card><CardContent className="flex min-h-[520px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>
              ) : detailQuery.error || !detail ? (
                <Card><CardContent className="flex min-h-[520px] flex-col items-center justify-center gap-3 text-center"><p className="font-semibold text-destructive">This prospect could not be loaded</p><p className="max-w-md text-sm text-muted-foreground">{detailQuery.error instanceof Error ? detailQuery.error.message : 'Refresh and try again.'}</p><Button variant="outline" onClick={() => void detailQuery.refetch()}>Try again</Button></CardContent></Card>
              ) : (
                <div className="space-y-5">
                  <Card className="overflow-hidden">
                    <div className="border-b bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white sm:p-8">
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                            {selected.prospect_image_url
                              ? <img src={selected.prospect_image_url} alt={selected.prospect_name} className="h-full w-full object-cover" />
                              : <UserRound className="h-7 w-7 text-white/70" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={cn('border-white/20 bg-white/10 text-white', selected.published_at && 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100')}>{lifecycleLabel(selected.lifecycle_status)}</Badge>
                              {selected.prospect_company && <span className="text-sm text-white/60">{selected.prospect_company}</span>}
                            </div>
                            <h2 className="mt-2 truncate text-2xl font-bold sm:text-3xl">{selected.prospect_name}</h2>
                            <p className="mt-1 text-sm text-white/65">{selected.prospect_title || 'Prospect dashboard'} · Updated {formatDate(selected.updated_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {canManage && <Button variant="secondary" onClick={openEdit}><Pencil className="mr-2 h-4 w-4" />Edit profile</Button>}
                          {selected.published_at && <Button variant="secondary" onClick={() => openExternalUrl(publicProspectUrl(selected.slug))}><Eye className="mr-2 h-4 w-4" />Open live</Button>}
                          {selected.published_at && <Button variant="secondary" onClick={() => void copyLiveLink()}><Copy className="mr-2 h-4 w-4" />Copy link</Button>}
                        </div>
                      </div>

                      <div className="mt-7 grid grid-cols-4 gap-2">
                        {['Profile', 'Build', 'Review', 'Live'].map((label, index) => (
                          <div key={label}>
                            <div className={cn('h-1.5 rounded-full', index <= stage ? 'bg-blue-400' : 'bg-white/15')} />
                            <p className={cn('mt-2 text-xs', index <= stage ? 'text-white' : 'text-white/45')}>{index + 1}. {label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                      <div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold">Next best action</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {!selected.readiness.profile_ready
                                ? 'Strengthen the guest profile before matching.'
                                : selected.readiness.visible_count < 5
                                  ? 'Build a focused shortlist from the approved profile.'
                                  : !selected.readiness.publishable
                                    ? 'Review the matches and complete the readiness checks.'
                                    : selected.published_at
                                      ? 'Share the private link and watch for feedback.'
                                      : 'Everything is ready. Publish when the shortlist feels right.'}
                            </p>
                          </div>
                          {canManage && (
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button variant="outline" disabled={mutating || !selected.readiness.profile_ready} onClick={() => buildMutation.mutate()}>
                                {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                {selected.readiness.visible_count > 0 ? 'Rebuild matches' : 'Build shortlist'}
                              </Button>
                              {selected.published_at
                                ? <Button variant="outline" disabled={mutating} onClick={() => publicationMutation.mutate(false)}><EyeOff className="mr-2 h-4 w-4" />Unpublish</Button>
                                : <Button disabled={mutating || !selected.readiness.publishable} onClick={() => publicationMutation.mutate(true)}><Send className="mr-2 h-4 w-4" />Publish dashboard</Button>}
                            </div>
                          )}
                        </div>
                        {selected.build_error && <Alert variant="destructive" className="mt-4"><AlertTitle>Build needs attention</AlertTitle><AlertDescription>{selected.build_error}</AlertDescription></Alert>}
                      </div>

                      <div className="rounded-2xl border bg-muted/30 p-4">
                        <div className="flex items-center justify-between"><p className="font-medium">Publish readiness</p><span className="text-sm font-semibold">{readinessPercent(selected.readiness)}%</span></div>
                        <Progress value={readinessPercent(selected.readiness)} className="my-3 h-2" />
                        <div className="space-y-2">
                          <ReadinessItem complete={selected.readiness.profile_ready}>Focused profile (80+ characters)</ReadinessItem>
                          <ReadinessItem complete={selected.readiness.visible_count >= 5}>{selected.readiness.visible_count}/5 visible matches</ReadinessItem>
                          <ReadinessItem complete={selected.readiness.analyzed_count >= 5}>{selected.readiness.analyzed_count}/5 explained matches</ReadinessItem>
                          <ReadinessItem complete={selected.readiness.cta_ready}>Next step configured</ReadinessItem>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-5 lg:grid-cols-3">
                    <Card className="lg:col-span-2">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div><CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-5 w-5" />Guest profile</CardTitle><CardDescription>The approved positioning used to match and rank shows.</CardDescription></div>
                          {canManage && <Button size="sm" variant="ghost" onClick={openEdit}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{selected.prospect_bio || 'No guest profile yet. Add the person’s credibility, outcomes, point of view, and strongest stories.'}</p>
                        {(selected.prospect_topics?.length || selected.prospect_expertise?.length) && (
                          <div className="flex flex-wrap gap-2">{[...(selected.prospect_topics || []), ...(selected.prospect_expertise || [])].map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                        )}
                        <div className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                          <div className="flex gap-2"><Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{selected.prospect_target_audience || 'Ideal audience not specified'}</span></div>
                          <div className="flex gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{[selected.prospect_industry, selected.prospect_company].filter(Boolean).join(' · ') || 'Industry not specified'}</span></div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-lg">Share details</CardTitle><CardDescription>The link remains private until published.</CardDescription></CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p><p className="mt-1 font-medium">{selected.published_at ? `Published ${formatDate(selected.published_at)}` : 'Not published'}</p></div>
                        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Views</p><p className="mt-1 font-medium">{selected.view_count || 0}{selected.last_viewed_at ? ` · Last ${formatDate(selected.last_viewed_at)}` : ''}</p></div>
                        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p><p className="mt-1 font-medium">{selected.cta_label}</p>{selected.cta_url && <p className="mt-1 truncate text-xs text-muted-foreground">{selected.cta_url}</p>}</div>
                        {selected.prospect_email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /><span className="truncate">{selected.prospect_email}</span></div>}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><CardTitle className="flex items-center gap-2"><Mic2 className="h-5 w-5" />Podcast shortlist</CardTitle><CardDescription>{visiblePodcasts.length > 0 ? `${visiblePodcasts.length} visible opportunities. Feature up to six to lead the public experience.` : 'Build the shortlist once the profile is ready.'}</CardDescription></div>
                        {removedPodcasts.length > 0 && <Button variant="ghost" size="sm" onClick={() => setShowRemoved((current) => !current)}>{showRemoved ? 'Show shortlist' : `Removed (${removedPodcasts.length})`}</Button>}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(showRemoved ? removedPodcasts : visiblePodcasts).length === 0 ? (
                        <div className="flex min-h-60 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-8 text-center">
                          <div className="rounded-full bg-primary/10 p-4 text-primary"><Mic2 className="h-7 w-7" /></div>
                          <div><p className="font-semibold">{showRemoved ? 'No removed podcasts' : 'No matches yet'}</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{showRemoved ? 'Removed matches will appear here and can be restored.' : 'A focused profile lets Scout find and explain the strongest 8–12 opportunities.'}</p></div>
                          {!showRemoved && canManage && <Button disabled={mutating || !selected.readiness.profile_ready} onClick={() => buildMutation.mutate()}>{building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Build shortlist</Button>}
                        </div>
                      ) : (
                        <div className="space-y-3">{(showRemoved ? removedPodcasts : visiblePodcasts).map((podcast) => <ShortlistRow key={podcast.id} podcast={podcast} disabled={!canManage || podcastMutation.isPending} onFeature={() => podcastMutation.mutate({ podcast, changes: { is_featured: !podcast.is_featured } })} onVisibility={() => podcastMutation.mutate({ podcast, changes: { visibility: podcast.visibility === 'visible' ? 'archived' : 'visible' } })} />)}</div>
                      )}
                    </CardContent>
                  </Card>

                  {canManage && <div className="flex justify-end"><Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setArchiveDialogOpen(true)}><Archive className="mr-2 h-4 w-4" />Archive prospect</Button></div>}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ProspectProfileDialog open={profileDialogOpen} editing={editingProfile} form={profileForm} saving={saveMutation.isPending} onOpenChange={setProfileDialogOpen} onChange={setProfileForm} onSubmit={() => saveMutation.mutate()} />

      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Archive {selected?.prospect_name}?</DialogTitle><DialogDescription>The private link will stop working immediately. The prospect and shortlist stay in the database for historical reporting.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>Cancel</Button><Button variant="destructive" disabled={archiveMutation.isPending} onClick={() => archiveMutation.mutate()}>{archiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Archive dashboard</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceProspectDashboards
