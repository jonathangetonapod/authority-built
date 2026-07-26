import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bot,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  Linkedin,
  Loader2,
  Sparkles,
  Mail,
  Megaphone,
  Mic2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { ClientBookingDialog } from '@/components/workspace/ClientBookingDialog'
import { ClientInstantlyCampaignsCard } from '@/components/workspace/ClientInstantlyCampaignsCard'
import { ClientSdrPromptsCard } from '@/components/workspace/ClientSdrPromptsCard'
import { ClientShortlistEditor } from '@/components/workspace/ClientShortlistEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  getWorkspaceClientDetail,
  generatePassword,
  rotateWorkspaceClientDashboardSlug,
  createWorkspaceClientPortalPreview,
  createWorkspaceClientPortalSetupLink,
  draftWorkspaceClientSdrProfile,
  setWorkspaceClientPassword,
  updateWorkspaceClient,
  updateWorkspaceClientProfile,
  setWorkspaceClientSdrMode,
  type WorkspaceClientSdrMode,
  updateWorkspaceClientSdrProfile,
  type WorkspaceClientBooking,
  type WorkspaceClientOnboardingSummary,
} from '@/services/clients'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  CLIENT_SDR_PROFILE_FIELD_DEFINITIONS,
  CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH,
  clientSdrProfileReadiness,
  clientSdrProfilesEqual,
  normalizeClientSdrProfile,
  type ClientSdrProfile,
} from '@/lib/clientSdrProfile'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLIENT_DETAIL_TABS = new Set(['overview', 'ai-sdr', 'approval', 'portal', 'podcasts', 'files'])

interface WorkspaceClientDetailProps {
  platformWorkspaceId?: string
}

const bookingStatusStyles: Record<WorkspaceClientBooking['status'], string> = {
  conversation_started: 'border-amber-200 bg-amber-50 text-amber-800',
  in_progress: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  booked: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  recorded: 'border-blue-200 bg-blue-50 text-blue-800',
  published: 'border-violet-200 bg-violet-50 text-violet-800',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
}

const onboardingStatusStyles: Record<WorkspaceClientOnboardingSummary['status'], string> = {
  invited: 'border-sky-200 bg-sky-50 text-sky-800',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-800',
  submitted: 'border-violet-200 bg-violet-50 text-violet-800',
  changes_requested: 'border-orange-200 bg-orange-50 text-orange-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  expired: 'border-slate-200 bg-slate-50 text-slate-600',
  revoked: 'border-red-200 bg-red-50 text-red-800',
}

function labelForStatus(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function scheduledDate(booking: WorkspaceClientBooking): string | null {
  return booking.recording_date || booking.scheduled_date
}

function isFutureDate(value: string | null | undefined): boolean {
  if (!value) return false
  const date = new Date(`${value.slice(0, 10)}T23:59:59`)
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now()
}

function isUpcomingRecording(booking: WorkspaceClientBooking): boolean {
  if (!['conversation_started', 'in_progress', 'booked'].includes(booking.status)) return false
  return isFutureDate(scheduledDate(booking))
}

function isUpcomingRelease(booking: WorkspaceClientBooking): boolean {
  return !['cancelled', 'published'].includes(booking.status) && isFutureDate(booking.publish_date)
}

function ConnectedResource({
  icon: Icon,
  title,
  description,
  status,
  statusClassName,
  children,
}: {
  icon: typeof BookOpenCheck
  title: string
  description: string
  status: string
  statusClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
          <div className="min-w-0">
            <p className="font-medium leading-6">{title}</p>
            <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusClassName || ''}`}>{status}</Badge>
      </div>
      <div className="mt-3 pl-11">{children}</div>
    </div>
  )
}

function normalizedText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function textPreview(value: string, maxLength: number): string {
  const normalized = normalizedText(value)
  if (normalized.length <= maxLength) return normalized

  const candidate = normalized.slice(0, maxLength + 1)
  const lastWordBoundary = candidate.lastIndexOf(' ')
  const end = lastWordBoundary >= Math.floor(maxLength * 0.75) ? lastWordBoundary : maxLength
  return `${candidate.slice(0, end).trimEnd()}…`
}

function wordCount(value: string): number {
  const normalized = normalizedText(value)
  return normalized ? normalized.split(/\s+/u).length : 0
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClassName,
}: {
  icon: typeof BookOpenCheck
  label: string
  value: number | string
  detail?: string
  iconClassName: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <div className={`shrink-0 rounded-xl p-3 ${iconClassName}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[65%] break-words text-right text-sm font-medium">{value}</span>
    </div>
  )
}

function MilestoneList({
  bookings,
  icon: Icon,
  emptyTitle,
  emptyDescription,
  detail,
}: {
  bookings: WorkspaceClientBooking[]
  icon: typeof CalendarDays
  emptyTitle: string
  emptyDescription: string
  detail: (booking: WorkspaceClientBooking) => string
}) {
  if (bookings.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center text-center">
        <Icon className="mb-3 h-9 w-9 text-muted-foreground/50" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="text-sm text-muted-foreground">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <div key={booking.id} className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{booking.podcast_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail(booking)}</p>
          </div>
          <Badge variant="outline" className={bookingStatusStyles[booking.status]}>{labelForStatus(booking.status)}</Badge>
        </div>
      ))}
    </div>
  )
}

const WorkspaceClientDetail = ({ platformWorkspaceId }: WorkspaceClientDetailProps) => {
  const { clientId = '' } = useParams<{ clientId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, workspace } = useAuth()
  const [portalPasswordOpen, setPortalPasswordOpen] = useState(false)
  const [portalPassword, setPortalPassword] = useState('')
  const [sdrModeBusy, setSdrModeBusy] = useState(false)
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<WorkspaceClientBooking | null>(null)
  const [portalPasswordConfirm, setPortalPasswordConfirm] = useState('')
  const [portalPasswordVisible, setPortalPasswordVisible] = useState(false)
  const [portalPasswordCommitted, setPortalPasswordCommitted] = useState(false)
  const [portalPasswordCopied, setPortalPasswordCopied] = useState(false)
  const [portalPasswordSaved, setPortalPasswordSaved] = useState(false)
  const [portalPasswordError, setPortalPasswordError] = useState<string | null>(null)
  const [portalPasswordBusy, setPortalPasswordBusy] = useState(false)
  const [slugRotateOpen, setSlugRotateOpen] = useState(false)
  const [slugRotateBusy, setSlugRotateBusy] = useState(false)
  const [portalInviteBusy, setPortalInviteBusy] = useState(false)
  const [portalPreviewBusy, setPortalPreviewBusy] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileEditorOpen, setProfileEditorOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState('')
  const [profileExpectedUpdatedAt, setProfileExpectedUpdatedAt] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [sdrEditorFieldId, setSdrEditorFieldId] = useState<keyof ClientSdrProfile | null>(null)
  const [sdrDraft, setSdrDraft] = useState<ClientSdrProfile>(() => normalizeClientSdrProfile({}))
  const [sdrExpectedUpdatedAt, setSdrExpectedUpdatedAt] = useState<string | null>(null)
  const [sdrBusy, setSdrBusy] = useState(false)
  const [sdrDrafting, setSdrDrafting] = useState(false)
  const [sdrError, setSdrError] = useState<string | null>(null)
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesBusy, setNotesBusy] = useState(false)
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const validAddress = UUID_PATTERN.test(workspaceId) && UUID_PATTERN.test(canonicalClientId)
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(workspaceId)
    : MY_WORKSPACE_BASE_HREF

  const detailQuery = useQuery({
    queryKey: [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'client', canonicalClientId],
    queryFn: () => getWorkspaceClientDetail(workspaceId, canonicalClientId),
    enabled: validAddress,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  const detail = detailQuery.data
  const client = detail?.client
  const bookings = useMemo(() => detail?.bookings || [], [detail?.bookings])
  const onboarding = detail?.onboarding || null
  const upcomingRecordings = useMemo(
    () => bookings.filter(isUpcomingRecording).sort((left, right) => (
      new Date(scheduledDate(left) || '').getTime() - new Date(scheduledDate(right) || '').getTime()
    )).slice(0, 4),
    [bookings],
  )
  const upcomingReleases = useMemo(
    () => bookings.filter(isUpcomingRelease).sort((left, right) => (
      new Date(left.publish_date || '').getTime() - new Date(right.publish_date || '').getTime()
    )).slice(0, 4),
    [bookings],
  )
  const progress = useMemo(() => ({
    booked: bookings.filter((booking) => booking.status === 'booked').length,
    inProgress: bookings.filter((booking) => ['conversation_started', 'in_progress'].includes(booking.status)).length,
    recorded: bookings.filter((booking) => booking.status === 'recorded').length,
    published: bookings.filter((booking) => booking.status === 'published').length,
  }), [bookings])

  const effectiveWorkspace = detail?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          effectiveWorkspace?.id,
          effectiveWorkspace?.logo_path,
          effectiveWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  if (!validAddress) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Client unavailable</CardTitle><CardDescription>The client address is invalid.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (detailQuery.isLoading) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></WorkspaceLayout>
  }

  if (detailQuery.error || !detail || !client) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Client unavailable</CardTitle><CardDescription>{detailQuery.error instanceof Error ? detailQuery.error.message : 'This client could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button><Button variant="outline" onClick={() => void detailQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  const canManage = detail.can_manage
  const dashboard = detail.dashboard
  const mediaKitUrl = client.media_kit_url ? safeExternalUrl(client.media_kit_url) : null
  const websiteUrl = client.website ? safeExternalUrl(client.website) : null
  const linkedInUrl = client.linkedin_url ? safeExternalUrl(client.linkedin_url) : null
  const calendarUrl = client.calendar_link ? safeExternalUrl(client.calendar_link) : null
  const dashboardPreviewHref = client.dashboard_slug
    ? `/client/${encodeURIComponent(client.dashboard_slug)}`
    : null
  const dashboardHref = dashboardPreviewHref
  const dashboardAdminPreviewHref = dashboardHref
    ? `${dashboardHref}?preview=1`
    : null
  const prospectDashboardHref = client.prospect_dashboard_slug
    ? `/prospect/${encodeURIComponent(client.prospect_dashboard_slug)}`
    : null
  const onboardingHref = `${baseHref}/onboarding?client=${encodeURIComponent(client.id)}${onboarding ? `&instance=${encodeURIComponent(onboarding.id)}` : ''}`
  const finderHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const databaseHref = `${baseHref}/podcast-database?client=${encodeURIComponent(client.id)}`
  const podcastSystemHref = `${baseHref}/client-podcast-system?client=${encodeURIComponent(client.id)}`
  const campaignHref = `${baseHref}/client-campaigns/${encodeURIComponent(client.id)}`
  const masterInboxHref = `${baseHref}/master-inbox?client=${encodeURIComponent(client.id)}`
  const sdrProfile = normalizeClientSdrProfile(client.ai_sdr_profile)
  const sdrReadiness = clientSdrProfileReadiness(sdrProfile)
  const sdrDraftReadiness = clientSdrProfileReadiness(sdrDraft)
  const sdrDraftChanged = !clientSdrProfilesEqual(sdrDraft, sdrProfile)
  const activeSdrField = sdrEditorFieldId
    ? CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.find((field) => field.id === sdrEditorFieldId) || null
    : null
  const nextSdrField = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.find(
    (field) => field.core && !sdrProfile[field.id],
  ) || CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.find(
    (field) => !sdrProfile[field.id],
  ) || CLIENT_SDR_PROFILE_FIELD_DEFINITIONS[0]
  const missingSdrCoreLabels = CLIENT_SDR_PROFILE_FIELD_DEFINITIONS
    .filter((field) => sdrReadiness.missing_core_fields.includes(field.id))
    .map((field) => field.shortLabel)
  const profilePreview = client.bio ? textPreview(client.bio, 420) : ''
  const profileWordCount = client.bio ? wordCount(client.bio) : 0
  const profileWordLabel = `${profileWordCount.toLocaleString()} ${profileWordCount === 1 ? 'word' : 'words'}`
  const profileDraftWordCount = wordCount(profileDraft)
  const profileDraftChanged = profileDraft.trim() !== (client.bio || '').trim()
  const normalizedNotes = client.notes ? normalizedText(client.notes) : ''
  const notesPreview = client.notes ? textPreview(client.notes, 320) : ''
  const notesAreTruncated = normalizedNotes.length > 320
  const clientInitials = client.name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
  const dashboardStatus = dashboard.configured
    ? 'Live'
    : 'Needs setup'
  const dashboardStatusClassName = dashboard.configured
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : undefined
  const canManageCredentials = detail.viewer_role === 'owner'
    || detail.viewer_role === 'platform_admin'
  const portalPasswordValid = portalPassword.length >= 12
    && portalPassword.length <= 72
    && portalPassword === portalPasswordConfirm
  const requestedTab = searchParams.get('tab') || 'overview'
  const activeTab = CLIENT_DETAIL_TABS.has(requestedTab) ? requestedTab : 'overview'

  const selectClientDetailTab = (nextTab: string) => {
    const next = new URLSearchParams(searchParams)
    if (nextTab === 'overview') next.delete('tab')
    else next.set('tab', nextTab)
    setSearchParams(next, { replace: true })
  }

  const clearPortalPasswordDialog = () => {
    setPortalPasswordOpen(false)
    setPortalPassword('')
    setPortalPasswordConfirm('')
    setPortalPasswordVisible(false)
    setPortalPasswordCommitted(false)
    setPortalPasswordCopied(false)
    setPortalPasswordSaved(false)
    setPortalPasswordError(null)
    setPortalPasswordBusy(false)
  }

  const generatePortalPassword = () => {
    const generated = generatePassword(18)
    setPortalPassword(generated)
    setPortalPasswordConfirm(generated)
    setPortalPasswordVisible(true)
    setPortalPasswordCopied(false)
    setPortalPasswordError(null)
  }

  const openPortalPasswordDialog = () => {
    clearPortalPasswordDialog()
    const generated = generatePassword(18)
    setPortalPassword(generated)
    setPortalPasswordConfirm(generated)
    setPortalPasswordVisible(true)
    setPortalPasswordOpen(true)
  }

  const copyPortalPassword = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(portalPassword)
      setPortalPasswordCopied(true)
      setPortalPasswordError(null)
    } catch {
      setPortalPasswordError('Copy failed. Reveal the password and copy it manually.')
    }
  }

  // Keep the plaintext only in component state. Using a React Query mutation
  // here would retain it as a cached mutation variable after the request.
  const savePortalPassword = async () => {
    if (!portalPasswordValid || portalPasswordBusy) return
    setPortalPasswordBusy(true)
    setPortalPasswordError(null)
    try {
      await setWorkspaceClientPassword(workspaceId, canonicalClientId, portalPassword)
      setPortalPasswordCommitted(true)
      setPortalPasswordCopied(false)
      setPortalPasswordSaved(false)
      await detailQuery.refetch()
      toast.success('Client portal password updated.')
    } catch (error) {
      setPortalPasswordError(
        error instanceof Error ? error.message : 'The client portal password could not be set.',
      )
    } finally {
      setPortalPasswordBusy(false)
    }
  }

  const copyPortalSetupLink = async () => {
    if (portalInviteBusy) return
    setPortalInviteBusy(true)
    try {
      const setup = await createWorkspaceClientPortalSetupLink(workspaceId, canonicalClientId)
      await navigator.clipboard.writeText(setup.url)
      await detailQuery.refetch()
      toast.success('Setup link copied. Share it with the client — they set their own password. Expires in 7 days.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The setup link could not be created.')
    } finally {
      setPortalInviteBusy(false)
    }
  }

  const openPortalPreview = async () => {
    if (portalPreviewBusy) return
    setPortalPreviewBusy(true)
    try {
      const preview = await createWorkspaceClientPortalPreview(workspaceId, canonicalClientId)
      const clientPayload = btoa(JSON.stringify(preview.client))
      const hash = `#session=${encodeURIComponent(preview.session_token)}&expires=${encodeURIComponent(preview.expires_at)}&client=${encodeURIComponent(clientPayload)}`
      window.open(`/portal/preview${hash}`, '_blank', 'noopener')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The portal preview could not be started.')
    } finally {
      setPortalPreviewBusy(false)
    }
  }

  const rotateDashboardLink = async () => {
    if (slugRotateBusy) return
    setSlugRotateBusy(true)
    try {
      await rotateWorkspaceClientDashboardSlug(workspaceId, canonicalClientId)
      await detailQuery.refetch()
      toast.success('New dashboard link generated. The old link no longer works.')
      setSlugRotateOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The dashboard link could not be regenerated.')
    } finally {
      setSlugRotateBusy(false)
    }
  }

  const changeSdrMode = async (mode: WorkspaceClientSdrMode) => {
    if (!client || client.ai_sdr_mode === mode || sdrModeBusy) return
    setSdrModeBusy(true)
    try {
      await setWorkspaceClientSdrMode(workspaceId, client.id, mode)
      toast.success(mode === 'auto_draft'
        ? 'Auto-draft is on — every new reply gets a staged review package. Nothing sends.'
        : 'Automation is off — drafts run when you ask for them.')
      await detailQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The AI SDR mode could not be saved.')
    } finally {
      setSdrModeBusy(false)
    }
  }
  const copyPublicLink = async (path: string, label: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable')
      const appOrigin = import.meta.env.VITE_APP_URL || window.location.origin
      await navigator.clipboard.writeText(new URL(path, appOrigin).toString())
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Copy failed. Open the page and copy the address manually.')
    }
  }

  const openProfileEditor = () => {
    if (!canManage) return
    setProfileDraft(client.bio || '')
    setProfileExpectedUpdatedAt(client.updated_at)
    setProfileError(null)
    setProfileOpen(false)
    setProfileEditorOpen(true)
  }

  const closeProfileEditor = () => {
    if (profileBusy) return
    setProfileEditorOpen(false)
    setProfileError(null)
  }

  const saveClientProfile = async () => {
    if (!canManage || profileBusy || !profileDraftChanged || !profileExpectedUpdatedAt) return
    setProfileBusy(true)
    setProfileError(null)
    try {
      await updateWorkspaceClientProfile(
        workspaceId,
        canonicalClientId,
        profileDraft,
        profileExpectedUpdatedAt,
      )
      await detailQuery.refetch()
      setProfileEditorOpen(false)
      toast.success(profileDraft.trim() ? 'Approved client profile updated.' : 'Approved client profile removed.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The approved client profile could not be updated.'
      setProfileError(message)
      if (/changed since you opened/i.test(message)) await detailQuery.refetch()
    } finally {
      setProfileBusy(false)
    }
  }

  const openSdrFieldEditor = (fieldId: keyof ClientSdrProfile) => {
    if (!canManage) return
    setSdrDraft(normalizeClientSdrProfile(client.ai_sdr_profile))
    setSdrExpectedUpdatedAt(client.ai_sdr_profile_updated_at)
    setSdrError(null)
    setSdrEditorFieldId(fieldId)
  }

  const closeSdrFieldEditor = () => {
    if (sdrBusy) return
    setSdrDraft(normalizeClientSdrProfile(client.ai_sdr_profile))
    setSdrExpectedUpdatedAt(client.ai_sdr_profile_updated_at)
    setSdrError(null)
    setSdrEditorFieldId(null)
  }

  const draftSdrProfileWithAi = async () => {
    if (!canManage || sdrDrafting) return
    setSdrDrafting(true)
    try {
      const result = await draftWorkspaceClientSdrProfile(workspaceId, canonicalClientId)
      let filled = 0
      // AI fills only what the owner has not written — hand-edited fields win.
      setSdrDraft((current) => {
        const next = { ...current }
        for (const [field, value] of Object.entries(result.draft)) {
          const key = field as keyof ClientSdrProfile
          if (!String(next[key] ?? '').trim() && typeof value === 'string' && value.trim()) {
            next[key] = value
            filled += 1
          }
        }
        return next
      })
      if (filled === 0) {
        toast.info('Every field already has content — clear a field first if you want it redrafted.')
      } else {
        toast.success(`Drafted ${filled} field${filled === 1 ? '' : 's'} from the client profile${result.evidence_shows > 0 ? ` and ${result.evidence_shows} researched shows` : ''}. Review and save.`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The profile draft could not be generated.')
    } finally {
      setSdrDrafting(false)
    }
  }

  const saveSdrProfile = async () => {
    if (!canManage || sdrBusy || !sdrDraftChanged) return
    setSdrBusy(true)
    setSdrError(null)
    try {
      const updated = await updateWorkspaceClientSdrProfile(
        workspaceId,
        canonicalClientId,
        sdrDraft,
        sdrExpectedUpdatedAt,
      )
      await detailQuery.refetch()
      setSdrDraft(updated.ai_sdr_profile)
      setSdrExpectedUpdatedAt(updated.ai_sdr_profile_updated_at)
      setSdrEditorFieldId(null)
      toast.success(updated.ai_sdr_readiness.ready
        ? 'AI SDR profile saved and ready for Master Inbox drafts.'
        : 'AI SDR profile draft saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The AI SDR profile could not be updated.'
      setSdrError(message)
      if (/changed since you opened/i.test(message)) await detailQuery.refetch()
    } finally {
      setSdrBusy(false)
    }
  }

  const beginEditingNotes = () => {
    setNotesDraft(client.notes || '')
    setNotesExpanded(false)
    setNotesEditing(true)
  }

  const saveInternalNotes = async () => {
    if (!canManage || notesBusy) return
    setNotesBusy(true)
    try {
      await updateWorkspaceClient(workspaceId, canonicalClientId, {
        name: client.name,
        email: client.email || '',
        contact_person: client.contact_person || '',
        linkedin_url: client.linkedin_url || '',
        website: client.website || '',
        status: client.status,
        notes: notesDraft,
      })
      await detailQuery.refetch()
      setNotesEditing(false)
      toast.success('Internal notes updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Internal notes could not be updated.')
    } finally {
      setNotesBusy(false)
    }
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-16">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to={`${baseHref}/clients`}><ArrowLeft className="mr-2 h-4 w-4" />Back to clients</Link>
        </Button>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-400" />
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              {client.photo_url ? (
                <img src={client.photo_url} alt={client.name} className="h-16 w-16 shrink-0 rounded-2xl border object-cover sm:h-20 sm:w-20" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">{clientInitials}</div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{client.name}</h1>
                  <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize">{client.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Client command center · {detail.workspace.name}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {client.contact_person && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{client.contact_person}</span>}
                  {client.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
                  <span>Added {formatDate(client.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={onboardingHref}><BookOpenCheck className="mr-2 h-4 w-4" />Onboarding</Link></Button>
              <Button asChild variant="outline"><Link to={podcastSystemHref}><Activity className="mr-2 h-4 w-4" />Command Center</Link></Button>
              <Button asChild variant="outline"><Link to={campaignHref}><Megaphone className="mr-2 h-4 w-4" />Client Campaign</Link></Button>
              <Button asChild><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Podcast Finder</Link></Button>
            </div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={selectClientDetailTab} className="space-y-5">
          <div className="overflow-x-auto pb-1">
            <TabsList aria-label="Client command center sections" className="h-auto min-w-max justify-start gap-1 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="ai-sdr"><Bot className="mr-1.5 h-4 w-4" />AI SDR Profile</TabsTrigger>
              <TabsTrigger value="approval">Approval dashboard</TabsTrigger>
              <TabsTrigger value="portal">Client portal</TabsTrigger>
              <TabsTrigger value="podcasts">Podcast activity</TabsTrigger>
              <TabsTrigger value="files">Onboarding &amp; files</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 space-y-6">
            <section aria-labelledby="podcast-progress-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="podcast-progress-heading" className="text-xl font-semibold">Campaign snapshot</h2>
                  <p className="text-sm text-muted-foreground">Confirmed booking, recording, and publication stages for this client.</p>
                </div>
                <Badge variant="outline">{bookings.length} total</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={CalendarDays} label="Booked" value={progress.booked} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={Clock3} label="In progress" value={progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
                <MetricCard icon={Video} label="Recorded" value={progress.recorded} iconClassName="bg-blue-50 text-blue-600" />
                <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
              </div>
            </section>

            <section aria-labelledby="outreach-activity-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="outreach-activity-heading" className="text-xl font-semibold">Outreach activity</h2>
                  <p className="text-sm text-muted-foreground">Verified campaign work completed for this client.</p>
                </div>
                <Badge variant="outline">{detail.outreach.initial_emails_sent} sent</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={Mail}
                  label="Initial emails sent"
                  value={detail.outreach.initial_emails_sent}
                  detail="Does not include automated follow-ups yet"
                  iconClassName="bg-sky-50 text-sky-600"
                />
                <MetricCard
                  icon={Mic2}
                  label="Podcasts contacted"
                  value={detail.outreach.podcasts_contacted}
                  detail="Unique shows with sent outreach"
                  iconClassName="bg-indigo-50 text-indigo-600"
                />
                <MetricCard
                  icon={Clock3}
                  label="Awaiting review"
                  value={detail.outreach.pending_review_count}
                  detail={`${detail.outreach.approved_count} approved and ready`}
                  iconClassName="bg-amber-50 text-amber-600"
                />
                <MetricCard
                  icon={Activity}
                  label="Last outreach"
                  value={detail.outreach.last_sent_at ? formatDate(detail.outreach.last_sent_at) : 'Not yet'}
                  detail={detail.outreach.failed_count > 0 ? `${detail.outreach.failed_count} delivery issue${detail.outreach.failed_count === 1 ? '' : 's'}` : 'No delivery issues'}
                  iconClassName="bg-emerald-50 text-emerald-600"
                />
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Upcoming recordings</CardTitle><CardDescription>Podcast conversations scheduled to be recorded next.</CardDescription></CardHeader>
                <CardContent>
                  <MilestoneList
                    bookings={upcomingRecordings}
                    icon={Mic2}
                    emptyTitle="No upcoming recordings"
                    emptyDescription="Scheduled recording dates will appear here automatically."
                    detail={(booking) => `${booking.host_name ? `Hosted by ${booking.host_name} · ` : ''}${formatDate(scheduledDate(booking))}`}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Upcoming episode releases</CardTitle><CardDescription>Recorded episodes scheduled to go live next.</CardDescription></CardHeader>
                <CardContent>
                  <MilestoneList
                    bookings={upcomingReleases}
                    icon={Radio}
                    emptyTitle="No upcoming releases"
                    emptyDescription="Episodes with a scheduled publish date will appear here."
                    detail={(booking) => `Goes live ${formatDate(booking.publish_date)}`}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Client readiness</CardTitle><CardDescription>The systems needed to run this account.</CardDescription></CardHeader>
                <CardContent>
                  <DetailRow label="Approval dashboard" value={<Badge variant="outline" className={dashboardStatusClassName}>{dashboardStatus}</Badge>} />
                  <DetailRow label="AI SDR profile" value={<Badge variant="outline" className={sdrReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{sdrReadiness.ready ? 'Context ready' : `${sdrReadiness.completed_fields} of ${sdrReadiness.total_fields}`}</Badge>} />
                  <DetailRow label="Client portal" value={<Badge variant="outline" className={client.portal_access_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{client.portal_access_enabled ? 'Enabled' : 'Disabled'}</Badge>} />
                  <DetailRow label="Onboarding" value={onboarding ? labelForStatus(onboarding.status) : 'Not started'} />
                  <DetailRow label="Podcast review" value={dashboard.podcast_count > 0 ? `${dashboard.reviewed_count} of ${dashboard.podcast_count}` : 'No shortlist yet'} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ai-sdr" className="mt-0 space-y-5">
            <Card className="overflow-hidden border-primary/20">
              <div className="bg-gradient-to-br from-primary/10 via-violet-500/5 to-fuchsia-400/10 p-5 sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Bot className="h-5 w-5" /></div>
                      <Badge
                        variant="outline"
                        className={sdrReadiness.ready
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800'}
                      >
                        {sdrReadiness.ready ? 'Context ready' : `Draft · ${sdrReadiness.completed_fields} of ${sdrReadiness.total_fields}`}
                      </Badge>
                      {client.ai_sdr_profile_updated_at && <Badge variant="secondary">Updated {formatDate(client.ai_sdr_profile_updated_at)}</Badge>}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">{client.name} AI SDR Profile</h2>
                    <p className="mt-2 max-w-2xl leading-6 text-muted-foreground">
                      The host-ready context Master Inbox loads after a reply is resolved to this client. It explains why they are a compelling guest, what they can discuss, what listeners gain, and how to book them.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="outline"><Link to={masterInboxHref}><Mail className="mr-2 h-4 w-4" />Open Master Inbox</Link></Button>
                    {canManage && !sdrReadiness.ready && (
                      <Button type="button" variant="outline" disabled={sdrDrafting || !client.bio} onClick={() => void draftSdrProfileWithAi()}>
                        {sdrDrafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {sdrDrafting ? 'Drafting…' : 'Draft with AI'}
                      </Button>
                    )}
                    {canManage && (
                      <Button type="button" onClick={() => openSdrFieldEditor(nextSdrField.id)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {sdrReadiness.ready ? 'Edit profile' : sdrReadiness.completed_fields > 0 ? 'Continue profile' : 'Start profile'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.42fr)]">
                  <div className="rounded-xl border bg-background/80 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">Profile coverage</span>
                      <span className="tabular-nums text-muted-foreground">{sdrReadiness.completed_fields} / {sdrReadiness.total_fields}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${Math.round((sdrReadiness.completed_fields / sdrReadiness.total_fields) * 100)}%` }}
                      />
                    </div>
                    {!sdrReadiness.ready && (
                      <p className="mt-3 text-xs leading-5 text-amber-800">
                        Add the core {missingSdrCoreLabels.join(', ')} context before inbox drafting is considered ready.
                      </p>
                    )}
                    {sdrReadiness.ready && (
                      <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Core context is ready for review drafts.</p>
                    )}
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl border border-dashed bg-background/80 p-4">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs leading-5 text-muted-foreground"><span className="font-semibold text-foreground">Draft context only.</span> Saving this profile never sends a message or enables automation. Inbox delivery remains a separate, explicit action.</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">SDR mode</CardTitle>
                <CardDescription>
                  Choose how replies for {client.name} are handled. Every reply is sent by a
                  person — the AI only classifies and drafts.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {([
                  {
                    id: 'manual' as const,
                    title: 'Manual',
                    detail: 'The team classifies and drafts on demand with Draft with AI.',
                  },
                  {
                    id: 'auto_draft' as const,
                    title: 'Auto-draft',
                    detail: 'Replies marked Interested in Instantly are classified and a reply + nudge package is staged for review automatically. Nothing sends.',
                  },
                ]).map((option) => {
                  const selected = (client.ai_sdr_mode ?? 'manual') === option.id
                  const autoBlocked = option.id !== 'manual' && !sdrReadiness.ready
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      disabled={!canManage || sdrModeBusy || autoBlocked}
                      title={autoBlocked ? 'Complete the core AI SDR profile first' : undefined}
                      onClick={() => void changeSdrMode(option.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${selected ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/20'} ${autoBlocked ? 'opacity-60' : ''}`}
                    >
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {option.title}
                        {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{option.detail}</p>
                      {autoBlocked && <p className="mt-1.5 text-[11px] font-medium text-amber-700">Requires a complete core AI SDR profile.</p>}
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            <ClientSdrPromptsCard
              workspaceId={workspaceId}
              clientId={client.id}
              clientName={client.name}
              canManage={canManage && detail.viewer_role === 'owner'}
            />

            <section aria-labelledby="ai-sdr-context-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 id="ai-sdr-context-heading" className="text-xl font-semibold">Approved host context</h3>
                  <p className="text-sm text-muted-foreground">Open one section at a time to give the client-specific AI approved information for helping a host evaluate and book this guest.</p>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.map((field) => {
                  const value = sdrProfile[field.id]
                  return (
                    <Card key={field.id} className={!value ? 'border-dashed' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-base">{field.label}</CardTitle>
                              <Badge variant="secondary" className="text-[10px]">{field.core ? 'Core' : 'Extra'}</Badge>
                            </div>
                            <CardDescription className="mt-2">{field.description}</CardDescription>
                          </div>
                          {canManage && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              aria-label={`${value ? 'Edit' : 'Add'} ${field.label}`}
                              onClick={() => openSdrFieldEditor(field.id)}
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />{value ? 'Edit' : 'Add'}
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {value
                          ? <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{value}</p>
                          : <p className="text-sm italic text-muted-foreground">Not set yet.</p>}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="approval" className="mt-0 space-y-6">
            <Card className="overflow-hidden border-primary/20">
              <div className="bg-gradient-to-br from-primary/10 via-violet-500/5 to-fuchsia-400/10 p-5 sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><LayoutDashboard className="h-5 w-5" /></div>
                      <Badge variant="outline" className={dashboardStatusClassName}>{dashboardStatus}</Badge>
                      {dashboard.podcast_count > 0 && <Badge variant="secondary">{dashboard.podcast_count} podcasts</Badge>}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">Podcast approval dashboard</h2>
                    <p className="mt-2 leading-6 text-muted-foreground">
                      {dashboard.tagline || `A dedicated shortlist where ${client.name} can review, approve, reject, and comment on podcast opportunities.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManage && <Button asChild variant="outline"><a href="#client-podcast-list"><LayoutDashboard className="mr-2 h-4 w-4" />View &amp; edit podcasts</a></Button>}
                    {dashboardHref && <Button variant="outline" onClick={() => void copyPublicLink(dashboardHref, 'Dashboard link')}><Copy className="mr-2 h-4 w-4" />Copy link</Button>}
                    {canManage && dashboardHref && <Button variant="outline" onClick={() => setSlugRotateOpen(true)}><RefreshCw className="mr-2 h-4 w-4" />New link</Button>}
                    {dashboardAdminPreviewHref && <Button asChild><Link to={dashboardAdminPreviewHref}><Eye className="mr-2 h-4 w-4" />Preview as client</Link></Button>}
                  </div>
                </div>
              </div>
            </Card>

            <section aria-labelledby="review-progress-heading">
              <div className="mb-3">
                <h3 id="review-progress-heading" className="text-xl font-semibold">Shortlist decisions</h3>
                <p className="text-sm text-muted-foreground">Client feedback from the current approval list, summarized here.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Mic2} label="Shortlisted" value={dashboard.podcast_count} iconClassName="bg-slate-100 text-slate-700" />
                <MetricCard icon={ThumbsUp} label="Positive" value={dashboard.approved_count} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={ThumbsDown} label="Negative" value={dashboard.rejected_count} iconClassName="bg-rose-50 text-rose-600" />
                <MetricCard icon={Clock3} label="To review" value={dashboard.to_review_count} iconClassName="bg-amber-50 text-amber-600" />
              </div>
            </section>

            {canManage && (
              <ClientShortlistEditor
                workspaceId={workspaceId}
                clientId={client.id}
                clientName={client.name}
                clientBio={client.bio}
                viewerRole={detail.viewer_role}
                databaseHref={databaseHref}
                finderHref={finderHref}
                campaignHref={campaignHref}
                onChanged={() => void detailQuery.refetch()}
              />
            )}
          </TabsContent>

          <TabsContent value="portal" className="mt-0 space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard icon={Mic2} label="Total placements" value={bookings.length} iconClassName="bg-slate-100 text-slate-700" />
              <MetricCard icon={CalendarDays} label="Upcoming / active" value={progress.booked + progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
              <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Portal access</CardTitle><CardDescription>Login readiness and recent client activity.</CardDescription></CardHeader>
                <CardContent>
                  <DetailRow label="Login email" value={client.email || 'No email configured'} />
                  <DetailRow label="Access" value={client.portal_access_enabled ? 'Enabled' : 'Disabled'} />
                  <DetailRow label="Password" value={client.password_set_at ? `Configured ${formatDate(client.password_set_at)}` : 'Not configured'} />
                  <DetailRow label="Last login" value={formatDateTime(client.portal_last_login_at)} />
                  {canManageCredentials ? (
                    <div className="mt-5 space-y-3 rounded-xl border bg-muted/30 p-4">
                      <p className="text-sm leading-6 text-muted-foreground">
                        Existing passwords cannot be viewed. Set a new password and it will be visible here only until you confirm that it was saved.
                      </p>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={!client.email || portalInviteBusy}
                        onClick={() => void copyPortalSetupLink()}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        {portalInviteBusy ? 'Creating link…' : 'Copy setup link'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={!client.email}
                        onClick={openPortalPasswordDialog}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        {client.password_set_at ? 'Change portal password' : 'Set portal password'}
                      </Button>
                      {client.portal_access_enabled && (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          disabled={portalPreviewBusy}
                          onClick={() => void openPortalPreview()}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {portalPreviewBusy ? 'Opening preview…' : 'Preview portal as client'}
                        </Button>
                      )}
                      {!client.email && <p className="text-xs text-destructive">Add a client email before enabling password login.</p>}
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                      Only the workspace owner can manage client portal passwords.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Upcoming recordings</CardTitle><CardDescription>Podcast conversations the client will record next.</CardDescription></CardHeader>
                <CardContent>
                  <MilestoneList
                    bookings={upcomingRecordings}
                    icon={Mic2}
                    emptyTitle="No upcoming recordings"
                    emptyDescription="New recording dates will appear in the client portal."
                    detail={(booking) => formatDate(scheduledDate(booking))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Upcoming episode releases</CardTitle><CardDescription>Recorded episodes the client can promote next.</CardDescription></CardHeader>
                <CardContent>
                  <MilestoneList
                    bookings={upcomingReleases}
                    icon={Radio}
                    emptyTitle="No upcoming releases"
                    emptyDescription="Scheduled publish dates will appear in the client portal."
                    detail={(booking) => `Goes live ${formatDate(booking.publish_date)}`}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="podcasts" className="mt-0 space-y-6">
            <section aria-labelledby="podcast-activity-heading">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="podcast-activity-heading" className="text-xl font-semibold">Podcast activity</h2><p className="text-sm text-muted-foreground">Confirmed booking and publishing milestones. Use the Command Center for the complete client workflow.</p></div><div className="flex items-center gap-2"><Badge variant="outline">{bookings.length} total</Badge>{canManage && <Button size="sm" onClick={() => { setEditingBooking(null); setBookingDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Log a conversation</Button>}<Button asChild variant="outline" size="sm"><Link to={podcastSystemHref}>Open Command Center<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={CalendarDays} label="Booked" value={progress.booked} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={Clock3} label="In progress" value={progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
                <MetricCard icon={Video} label="Recorded" value={progress.recorded} iconClassName="bg-blue-50 text-blue-600" />
                <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
              </div>
            </section>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>All placements</CardTitle><CardDescription>Booked, in progress, recorded, published, and cancelled appearances.</CardDescription></div><Button asChild variant="outline" size="sm"><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Find more</Link></Button></CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center text-center"><CheckCircle2 className="mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No placements yet</p><p className="text-sm text-muted-foreground">Log the first conversation as soon as a host replies, then move it along as it progresses.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{canManage && <Button onClick={() => { setEditingBooking(null); setBookingDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Log a conversation</Button>}<Button asChild variant="outline"><Link to={podcastSystemHref}>Open Command Center</Link></Button><Button asChild variant="outline"><Link to={finderHref}>Open Podcast Finder</Link></Button></div></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Podcast</TableHead><TableHead>Host</TableHead><TableHead>Scheduled</TableHead><TableHead>Status</TableHead><TableHead>Episode</TableHead>{canManage && <TableHead className="w-20 text-right">Edit</TableHead>}</TableRow></TableHeader>
                      <TableBody>{bookings.map((booking) => {
                        const podcastUrl = booking.podcast_url ? safeExternalUrl(booking.podcast_url) : null
                        const episodeUrl = booking.episode_url ? safeExternalUrl(booking.episode_url) : null
                        return (
                          <TableRow key={booking.id}>
                            <TableCell><div className="font-medium">{podcastUrl ? <a href={podcastUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{booking.podcast_name}</a> : booking.podcast_name}</div>{booking.notes && <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{booking.notes}</p>}</TableCell>
                            <TableCell>{booking.host_name || '—'}</TableCell>
                            <TableCell>{formatDate(scheduledDate(booking))}</TableCell>
                            <TableCell><Badge variant="outline" className={bookingStatusStyles[booking.status]}>{labelForStatus(booking.status)}</Badge></TableCell>
                            <TableCell>{episodeUrl ? <a href={episodeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Listen<ExternalLink className="h-3.5 w-3.5" /></a> : '—'}</TableCell>
                            {canManage && <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setEditingBooking(booking); setBookingDialogOpen(true) }}><Pencil className="h-3.5 w-3.5" /><span className="sr-only">Edit {booking.podcast_name}</span></Button></TableCell>}
                          </TableRow>
                        )
                      })}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="mt-0 space-y-6">
            <Card aria-labelledby="client-resources-heading" className="overflow-hidden">
              <CardHeader className="pb-4">
                <CardTitle id="client-resources-heading">Onboarding and connected files</CardTitle>
                <CardDescription>The source material behind research, outreach, and client delivery.</CardDescription>
              </CardHeader>
              <CardContent className="grid divide-y border-t p-0 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                <ConnectedResource icon={BookOpenCheck} title="Onboarding form" description={onboarding ? `Latest activity for ${onboarding.recipient_name}.` : 'Start or review this client’s intake and approved profile.'} status={onboarding ? labelForStatus(onboarding.status) : 'Not started'} statusClassName={onboarding ? onboardingStatusStyles[onboarding.status] : undefined}>
                  <Button asChild variant="ghost" size="sm" className="-ml-3 h-8"><Link to={onboardingHref}>{onboarding ? 'Review onboarding' : 'Open onboarding'}</Link></Button>
                </ConnectedResource>
                <ConnectedResource icon={Activity} title="Media kit" description="Approved bio, positioning, and speaking assets shared with hosts." status={mediaKitUrl ? 'Connected' : 'Not connected'} statusClassName={mediaKitUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>
                  {mediaKitUrl ? <Button asChild variant="ghost" size="sm" className="-ml-3 h-8"><a href={mediaKitUrl} target="_blank" rel="noreferrer">Open media kit<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <span className="text-xs text-muted-foreground">No file connected</span>}
                </ConnectedResource>
                <ConnectedResource icon={LayoutDashboard} title="Original prospect page" description="The pre-client sales dashboard remains separate from active delivery." status={prospectDashboardHref ? 'Linked' : 'Not linked'} statusClassName={prospectDashboardHref ? 'border-sky-200 bg-sky-50 text-sky-800' : undefined}>
                  {prospectDashboardHref ? <Button asChild variant="ghost" size="sm" className="-ml-3 h-8"><a href={prospectDashboardHref} target="_blank" rel="noreferrer">Open prospect page<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <span className="text-xs text-muted-foreground">No prospect page linked</span>}
                </ConnectedResource>
              </CardContent>
            </Card>

            <ClientInstantlyCampaignsCard
              workspaceId={workspaceId}
              clientId={client.id}
              clientName={client.name}
              canManage={canManage}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
              <Card className="overflow-hidden">
                <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Approved client profile</CardTitle>
                    <CardDescription>Positioning used across discovery and outreach.</CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {client.bio && <Button type="button" variant="outline" size="sm" onClick={() => setProfileOpen(true)}><BookOpenCheck className="mr-2 h-4 w-4" />View full profile</Button>}
                    {canManage && <Button type="button" size="sm" onClick={openProfileEditor}><Pencil className="mr-2 h-4 w-4" />{client.bio ? 'Edit profile' : 'Add profile'}</Button>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {client.bio ? (
                    <div className="rounded-xl border bg-muted/20 p-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved source · {profileWordLabel}</p>
                      <p className="leading-7 text-muted-foreground">{profilePreview}</p>
                    </div>
                  ) : <div className="rounded-xl border border-dashed p-4"><p className="font-medium">No approved profile yet</p><p className="mt-1 text-sm text-muted-foreground">Add a focused profile before running personalized research or preparing outreach.</p></div>}
                  <div className="flex flex-wrap gap-2 border-t pt-4">
                    {websiteUrl && <Button asChild variant="outline" size="sm"><a href={websiteUrl} target="_blank" rel="noreferrer"><Globe2 className="mr-2 h-4 w-4" />Website<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                    {linkedInUrl && <Button asChild variant="outline" size="sm"><a href={linkedInUrl} target="_blank" rel="noreferrer"><Linkedin className="mr-2 h-4 w-4" />LinkedIn<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                    {calendarUrl && <Button asChild variant="outline" size="sm"><a href={calendarUrl} target="_blank" rel="noreferrer"><CalendarDays className="mr-2 h-4 w-4" />Calendar<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                    {!websiteUrl && !linkedInUrl && !calendarUrl && <p className="text-sm text-muted-foreground">No external profile links are connected yet.</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle>Internal account notes</CardTitle>
                    <CardDescription>Workspace-only context for this client.</CardDescription>
                  </div>
                  {canManage && !notesEditing && (
                    <Button type="button" variant="outline" size="sm" onClick={beginEditingNotes}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {client.notes ? 'Edit notes' : 'Add notes'}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {notesEditing ? (
                    <div className="space-y-3">
                      <Label htmlFor="internal-client-notes">Internal account notes</Label>
                      <Textarea
                        id="internal-client-notes"
                        value={notesDraft}
                        maxLength={10_000}
                        rows={8}
                        placeholder="Add context, preferences, follow-ups, or anything your team should know."
                        disabled={notesBusy}
                        onChange={(event) => setNotesDraft(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Only workspace staff can see these notes.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={notesBusy} onClick={() => void saveInternalNotes()}>
                          {notesBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save notes
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={notesBusy} onClick={() => setNotesEditing(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : client.notes ? (
                    <div className="space-y-3">
                      <p className={`leading-7 text-muted-foreground ${notesExpanded ? 'whitespace-pre-wrap' : ''}`}>{notesExpanded ? client.notes : notesPreview}</p>
                      {notesAreTruncated && <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => setNotesExpanded((expanded) => !expanded)}>{notesExpanded ? 'Show less' : 'Show all notes'}</Button>}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No internal notes have been added.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={Boolean(activeSdrField)}
        onOpenChange={(open) => {
          if (open) return
          closeSdrFieldEditor()
        }}
      >
        <DialogContent
          className="grid max-h-[94vh] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
          onEscapeKeyDown={(event) => {
            if (sdrBusy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (sdrBusy) event.preventDefault()
          }}
        >
          {activeSdrField && (
            <>
              <DialogHeader className="border-b py-5 pl-6 pr-12 text-left">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={activeSdrField.core ? 'default' : 'secondary'} className="text-[10px]">
                    {activeSdrField.core ? 'Required for readiness' : 'Recommended'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Section {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.findIndex((field) => field.id === activeSdrField.id) + 1} of {CLIENT_SDR_PROFILE_FIELD_DEFINITIONS.length}
                  </span>
                </div>
                <DialogTitle>{sdrProfile[activeSdrField.id] ? 'Edit' : 'Add'} {activeSdrField.label}</DialogTitle>
                <DialogDescription>{activeSdrField.description}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                  <p className="font-medium">Write for a podcast host</p>
                  <p className="mt-1 leading-6 text-sky-900">Be specific, easy to scan, and factual. Include only positioning, claims, links, or logistics the client has approved.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`client-sdr-${activeSdrField.id}`}>{activeSdrField.label}</Label>
                  <Textarea
                    id={`client-sdr-${activeSdrField.id}`}
                    value={sdrDraft[activeSdrField.id]}
                    maxLength={CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH}
                    disabled={sdrBusy}
                    className="min-h-[280px] resize-y leading-7"
                    placeholder={activeSdrField.placeholder}
                    autoFocus
                    onChange={(event) => {
                      setSdrDraft((current) => ({ ...current, [activeSdrField.id]: event.target.value }))
                      setSdrError(null)
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{wordCount(sdrDraft[activeSdrField.id]).toLocaleString()} {wordCount(sdrDraft[activeSdrField.id]) === 1 ? 'word' : 'words'}</span>
                    <span className="tabular-nums">{sdrDraft[activeSdrField.id].length.toLocaleString()} / {CLIENT_SDR_PROFILE_MAX_FIELD_LENGTH.toLocaleString()} characters</span>
                  </div>
                </div>
                <div className={`rounded-xl border px-4 py-3 text-xs leading-5 ${sdrDraftReadiness.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                  {sdrDraftReadiness.ready
                    ? 'Saving this section keeps all four core sections ready for Master Inbox review drafts.'
                    : `This profile can still be saved as a draft. ${sdrDraftReadiness.missing_core_fields.length} core section${sdrDraftReadiness.missing_core_fields.length === 1 ? '' : 's'} will remain before drafting is ready.`}
                </div>
                {sdrError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{sdrError}</p>}
              </div>
              <DialogFooter className="border-t px-6 py-4">
                <Button type="button" variant="outline" disabled={sdrBusy} onClick={closeSdrFieldEditor}>Cancel</Button>
                <Button type="button" disabled={sdrBusy || !sdrDraftChanged} onClick={() => void saveSdrProfile()}>
                  {sdrBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save section
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="grid max-h-[92vh] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b py-5 pl-6 pr-12 text-left">
            <DialogTitle>Approved client profile</DialogTitle>
            <DialogDescription>The complete approved positioning source used for discovery and outreach{profileWordCount ? ` · ${profileWordLabel}` : ''}.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {client.bio ? <article className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{client.bio}</article> : <p className="text-sm text-muted-foreground">No approved profile is available.</p>}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            {canManage && <Button type="button" onClick={openProfileEditor}><Pencil className="mr-2 h-4 w-4" />Edit profile</Button>}
            <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={profileEditorOpen}
        onOpenChange={(open) => {
          if (open) return
          closeProfileEditor()
        }}
      >
        <DialogContent
          className="grid max-h-[94vh] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl"
          onEscapeKeyDown={(event) => {
            if (profileBusy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (profileBusy) event.preventDefault()
          }}
        >
          <DialogHeader className="border-b py-5 pl-6 pr-12 text-left">
            <DialogTitle>{client.bio ? 'Edit approved client profile' : 'Add approved client profile'}</DialogTitle>
            <DialogDescription>
              This is the source used for podcast discovery, fit analysis, pitch writing, and outreach.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="font-medium">Keep it focused and host-ready</p>
              <p className="mt-1 leading-6 text-sky-900">Aim for 150–500 words covering credible experience, specific expertise, strong story angles, and the audiences this client can help.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="approved-client-profile">Approved client profile</Label>
              <Textarea
                id="approved-client-profile"
                value={profileDraft}
                maxLength={20_000}
                disabled={profileBusy}
                className="min-h-[340px] resize-y leading-7"
                placeholder="Summarize the client’s background, authority, strongest stories, areas of expertise, and ideal podcast audiences."
                onChange={(event) => {
                  setProfileDraft(event.target.value)
                  setProfileError(null)
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{profileDraftWordCount.toLocaleString()} {profileDraftWordCount === 1 ? 'word' : 'words'} · {profileDraft.length.toLocaleString()} / 20,000 characters</span>
                {profileDraftWordCount > 600 && <span className="font-medium text-amber-700">Consider tightening this for stronger matching.</span>}
                {!profileDraft.trim() && client.bio && <span className="font-medium text-destructive">Saving an empty profile removes it from research and outreach.</span>}
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Approving a future onboarding response mapped to Client bio may replace this profile.</p>
            {profileError && <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{profileError}</p>}
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" disabled={profileBusy} onClick={closeProfileEditor}>Cancel</Button>
            <Button type="button" disabled={profileBusy || !profileDraftChanged} onClick={() => void saveClientProfile()}>
              {profileBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={portalPasswordOpen}
        onOpenChange={(open) => {
          if (open) return
          if (portalPasswordBusy) return
          if (portalPasswordCommitted && !portalPasswordSaved) {
            setPortalPasswordError('Confirm that you saved the one-time password before closing.')
            return
          }
          clearPortalPasswordDialog()
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (portalPasswordBusy || (portalPasswordCommitted && !portalPasswordSaved)) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            if (portalPasswordBusy || (portalPasswordCommitted && !portalPasswordSaved)) {
              event.preventDefault()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{portalPasswordCommitted ? 'Save the client portal password' : client.password_set_at ? 'Change portal password' : 'Set portal password'}</DialogTitle>
            <DialogDescription>
              {portalPasswordCommitted
                ? `This password is shown once. Share it with ${client.email} through a secure channel.`
                : 'Choose the password this client will use with their email. Saving it enables portal access and signs out any existing portal sessions.'}
            </DialogDescription>
          </DialogHeader>

          {portalPasswordCommitted ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Login email</p>
                <p className="font-medium">{client.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-portal-saved-password">Portal password</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      id="client-portal-saved-password"
                      type={portalPasswordVisible ? 'text' : 'password'}
                      value={portalPassword}
                      readOnly
                      autoComplete="off"
                      className="pr-10 font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setPortalPasswordVisible((visible) => !visible)}
                      aria-label={portalPasswordVisible ? 'Hide portal password' : 'Reveal portal password'}
                    >
                      {portalPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copyPortalPassword()}>
                    <Copy className="mr-2 h-4 w-4" />{portalPasswordCopied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                Once this window closes, the existing password cannot be retrieved. You can always set a new one here.
              </p>
              {portalPasswordError && <p className="text-sm text-destructive" role="alert">{portalPasswordError}</p>}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="client-portal-password-saved"
                  checked={portalPasswordSaved}
                  onCheckedChange={(checked) => setPortalPasswordSaved(checked === true)}
                />
                <Label htmlFor="client-portal-password-saved" className="font-normal leading-5">
                  I saved this password in a secure place.
                </Label>
              </div>
              <DialogFooter>
                <Button type="button" disabled={!portalPasswordSaved} onClick={clearPortalPasswordDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (portalPasswordValid) void savePortalPassword()
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="client-portal-new-password">New password</Label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Input
                      id="client-portal-new-password"
                      type={portalPasswordVisible ? 'text' : 'password'}
                      value={portalPassword}
                      minLength={12}
                      maxLength={72}
                      autoComplete="new-password"
                      disabled={portalPasswordBusy}
                      className="pr-10 font-mono"
                      onChange={(event) => {
                        setPortalPassword(event.target.value)
                        setPortalPasswordCopied(false)
                        setPortalPasswordError(null)
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      disabled={portalPasswordBusy}
                      onClick={() => setPortalPasswordVisible((visible) => !visible)}
                      aria-label={portalPasswordVisible ? 'Hide portal password' : 'Reveal portal password'}
                    >
                      {portalPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button type="button" variant="outline" disabled={portalPasswordBusy} onClick={generatePortalPassword}>
                    <RefreshCw className="mr-2 h-4 w-4" />Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Use at least 12 characters. A secure password is generated by default.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-portal-confirm-password">Confirm password</Label>
                <Input
                  id="client-portal-confirm-password"
                  type={portalPasswordVisible ? 'text' : 'password'}
                  value={portalPasswordConfirm}
                  minLength={12}
                  maxLength={72}
                  autoComplete="new-password"
                  disabled={portalPasswordBusy}
                  className="font-mono"
                  onChange={(event) => {
                    setPortalPasswordConfirm(event.target.value)
                    setPortalPasswordError(null)
                  }}
                />
                {portalPasswordConfirm && portalPassword !== portalPasswordConfirm && (
                  <p className="text-xs text-destructive">Passwords do not match.</p>
                )}
              </div>
              {portalPasswordError && <p className="text-sm text-destructive" role="alert">{portalPasswordError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={portalPasswordBusy} onClick={clearPortalPasswordDialog}>Cancel</Button>
                <Button type="submit" disabled={!portalPasswordValid || portalPasswordBusy}>
                  {portalPasswordBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {client.password_set_at ? 'Save new password' : 'Enable password login'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={slugRotateOpen} onOpenChange={(open) => { if (!slugRotateBusy) setSlugRotateOpen(open) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate a new dashboard link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current approval dashboard link stops working immediately. Anyone the old link was
              shared with will need the new one, including {client.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={slugRotateBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={slugRotateBusy} onClick={(event) => { event.preventDefault(); void rotateDashboardLink() }}>
              {slugRotateBusy ? 'Generating…' : 'Generate new link'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ClientBookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        workspaceId={workspaceId}
        clientId={client.id}
        clientName={client.name}
        booking={editingBooking}
        onSaved={() => void detailQuery.refetch()}
      />
    </WorkspaceLayout>
  )
}

export default WorkspaceClientDetail
