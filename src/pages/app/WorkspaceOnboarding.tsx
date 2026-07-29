import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Archive, ClipboardCheck, Clock3, Copy, ExternalLink, FilePlus2, ImagePlus, Link2, Loader2, MoreHorizontal, Palette, Plus, RefreshCw, Search, Send, Share2, ShieldAlert, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import ClientOnboardingPreview from '@/components/onboarding/ClientOnboardingPreview'
import OnboardingReviewDialog, { type OnboardingReviewComment } from '@/components/onboarding/OnboardingReviewDialog'
import OnboardingTemplateBuilder, { type OnboardingTemplateDraft } from '@/components/onboarding/OnboardingTemplateBuilder'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { DEFAULT_ONBOARDING_ACCENT, renderOnboardingBrandText } from '@/lib/onboardingBrand'
import { onboardingActivityStage, onboardingStatusLabel, type OnboardingActivityStage } from '@/lib/onboardingActivity'
import { EXPIRING_SOON_DAYS, onboardingChaseState } from '@/lib/onboardingChase'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  approveOnboardingAnswers,
  requestOnboardingChanges,
  archiveOnboardingInstance,
  archiveOnboardingTemplate,
  duplicateOnboardingTemplate,
  extendOnboardingLink,
  getOnboardingLink,
  getWorkspaceOnboardingDetail,
  listWorkspaceOnboarding,
  publishOnboardingTemplate,
  purgeOnboardingInstance,
  revokeOnboardingLink,
  rotateOnboardingLink,
  saveOnboardingTemplate,
  setDefaultOnboardingTemplate,
  startWorkspaceOnboarding,
  type OnboardingInstanceDetail,
  type OnboardingInstanceSummary,
  type OnboardingInvitationResult,
  type OnboardingTemplate,
  type StartOnboardingInput,
} from '@/services/workspaceOnboarding'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface Props {
  platformWorkspaceId?: string
}

interface StartForm {
  template_id: string
  client_choice: string
  client_name: string
  contact_person: string
  recipient_name: string
  recipient_email: string
  expires_in_days: string
  assigned_membership_ids: string[]
  send_email: boolean
  experience_title: string
  experience_body: string
  experience_completion_message: string
  accent_color: string
  logo_file: File | null
}

type ConfirmationAction = 'revoke' | 'archive' | 'purge'

const blankStartForm: StartForm = {
  template_id: '',
  client_choice: 'new',
  client_name: '',
  contact_person: '',
  recipient_name: '',
  recipient_email: '',
  expires_in_days: '14',
  assigned_membership_ids: [],
  send_email: true,
  experience_title: '',
  experience_body: '',
  experience_completion_message: '',
  accent_color: DEFAULT_ONBOARDING_ACCENT,
  logo_file: null,
}

const ACCENT_PRESETS = ['#665CF2', '#2563EB', '#0F766E', '#C2410C', '#BE185D', '#334155'] as const

function experienceFromTemplate(template: OnboardingTemplate | undefined, workspaceName: string) {
  return {
    experience_title: renderOnboardingBrandText(template?.definition.intro_title ?? 'Welcome', workspaceName),
    experience_body: renderOnboardingBrandText(
      template?.definition.intro_body ?? 'Please share a few details so we can prepare your profile.',
      workspaceName,
    ),
    experience_completion_message: renderOnboardingBrandText(
      template?.definition.completion_message ?? `Thank you. ${workspaceName || 'Our team'} will review your answers and follow up.`,
      workspaceName,
    ),
    accent_color: DEFAULT_ONBOARDING_ACCENT,
  }
}

const statusStyles: Record<OnboardingInstanceSummary['status'], string> = {
  invited: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-amber-50 text-amber-800 border-amber-200',
  changes_requested: 'bg-blue-50 text-blue-700 border-blue-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired: 'bg-slate-50 text-slate-600 border-slate-200',
  revoked: 'bg-slate-50 text-slate-600 border-slate-200',
}

const activityLabels: Record<OnboardingActivityStage, string> = {
  not_viewed: 'Not viewed',
  viewed: 'Viewed',
  started: 'Started',
  completed: 'Completed',
}

const activityStyles: Record<OnboardingActivityStage, string> = {
  not_viewed: 'bg-slate-50 text-slate-600 border-slate-200',
  viewed: 'bg-blue-50 text-blue-700 border-blue-200',
  started: 'bg-violet-50 text-violet-700 border-violet-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function activityDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function OnboardingActivity({ instance }: { instance: OnboardingInstanceSummary }) {
  const stage = onboardingActivityStage(instance)
  const events = [
    ['Viewed', instance.viewed_at],
    ['Started', instance.started_at],
    ['Completed', instance.submitted_at],
  ] as const
  const recordedEvents = events.flatMap(([label, value]) => value ? [{ label, value }] : [])

  return (
    <div className="min-w-40 space-y-1.5">
      <Badge variant="outline" className={activityStyles[stage]}>{activityLabels[stage]}</Badge>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {recordedEvents.length > 0 ? recordedEvents.map(({ label, value }) => (
          <p key={label}><span className="font-medium text-foreground/75">{label}</span>{' '}<time dateTime={value}>{activityDate(value)}</time></p>
        )) : (
          <p>Sent <time dateTime={instance.invited_at}>{activityDate(instance.invited_at)}</time></p>
        )}
      </div>
    </div>
  )
}

type OnboardingTableFilter = 'all' | 'chasing' | 'review' | 'active' | 'approved' | 'expired' | 'archived'

function OnboardingAge({ instance }: { instance: OnboardingInstanceSummary }) {
  const state = onboardingChaseState(instance, Date.now())
  if (state.ageDays === null) return null
  const settled = ['approved', 'expired', 'revoked'].includes(instance.status) || Boolean(instance.archived_at)
  return (
    <div className="min-w-32 space-y-1 text-xs text-muted-foreground">
      <p>{state.ageDays === 0 ? 'Sent today' : `Sent ${state.ageDays} day${state.ageDays === 1 ? '' : 's'} ago`}</p>
      {!settled && state.expiresInDays !== null && (
        <p className={state.expiresInDays <= EXPIRING_SOON_DAYS ? 'font-medium text-amber-700' : undefined}>
          {state.expiresInDays < 0
            ? 'Link expired'
            : state.expiresInDays === 0
              ? 'Link expires today'
              : `Link expires in ${state.expiresInDays} day${state.expiresInDays === 1 ? '' : 's'}`}
        </p>
      )}
      {state.reason && (
        <p className="flex items-start gap-1 font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{state.reason}
        </p>
      )}
    </div>
  )
}

function nextCopyName(template: OnboardingTemplate, templates: OnboardingTemplate[]): string {
  const names = new Set(templates.map((candidate) => candidate.name.toLowerCase()))
  let index = 1
  while (names.has(`${template.name} copy ${index}`.toLowerCase())) index += 1
  return `${template.name} Copy ${index}`
}

const WorkspaceOnboarding = ({ platformWorkspaceId }: Props) => {
  const { user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || ''
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const queryKey = [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'onboarding'] as const
  const [startOpen, setStartOpen] = useState(false)
  const [startForm, setStartForm] = useState<StartForm>(blankStartForm)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<OnboardingInvitationResult | null>(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<OnboardingTemplate | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const openedRequestedInstanceRef = useRef<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ action: ConfirmationAction; instance: OnboardingInstanceSummary } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OnboardingTableFilter>('all')

  const onboardingQuery = useQuery({
    queryKey,
    queryFn: () => listWorkspaceOnboarding(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
    refetchInterval: startOpen || builderOpen || selectedInstanceId ? false : 30_000,
  })
  const data = onboardingQuery.data
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const requestedInstanceId = (searchParams.get('instance') || '').toLowerCase()
  const clientFilter = UUID_PATTERN.test(requestedClientId) ? requestedClientId : null
  const visibleInstances = useMemo(
    () => data?.instances.filter((instance) => !clientFilter || instance.client_id === clientFilter) ?? [],
    [clientFilter, data?.instances],
  )
  const filteredClient = clientFilter
    ? data?.clients.find((client) => client.id === clientFilter) || null
    : null
  const canManage = data?.can_manage === true
  const publishedTemplates = useMemo(
    () => data?.templates.filter((template) => template.status === 'published') ?? [],
    [data?.templates],
  )
  const selectedStartTemplate = useMemo(
    () => publishedTemplates.find((template) => template.id === startForm.template_id),
    [publishedTemplates, startForm.template_id],
  )
  const agencyLogoUrl = workspaceLogoUrl(
    data?.workspace.id,
    data?.workspace.logo_path,
    data?.workspace.logo_updated_at,
  )
  const activePreviewLogoUrl = logoPreviewUrl || agencyLogoUrl

  useEffect(() => {
    if (!startOpen || !data) return
    const defaultTemplate = publishedTemplates.find((template) => template.is_default) ?? publishedTemplates[0]
    const requestedClient = clientFilter
      ? data.clients.find((client) => client.id === clientFilter)
      : undefined
    setLogoPreviewUrl(null)
    setStartForm({
      ...blankStartForm,
      template_id: defaultTemplate?.id ?? '',
      ...(requestedClient ? {
        client_choice: requestedClient.id,
        client_name: requestedClient.name,
        contact_person: requestedClient.contact_person || '',
        recipient_name: requestedClient.contact_person || requestedClient.name,
        recipient_email: requestedClient.email || '',
      } : {}),
      ...experienceFromTemplate(defaultTemplate, data.workspace.name),
    })
  }, [clientFilter, data, publishedTemplates, startOpen])

  const detailQuery = useQuery({
    queryKey: [...queryKey, 'detail', selectedInstanceId || 'none'],
    queryFn: () => getWorkspaceOnboardingDetail(workspaceId, selectedInstanceId || ''),
    enabled: Boolean(selectedInstanceId && validWorkspaceId),
    retry: false,
  })

  useEffect(() => {
    if (
      !UUID_PATTERN.test(requestedInstanceId)
      || openedRequestedInstanceRef.current === requestedInstanceId
      || !visibleInstances.some((instance) => instance.id === requestedInstanceId)
    ) return
    openedRequestedInstanceRef.current = requestedInstanceId
    setSelectedInstanceId(requestedInstanceId)
  }, [requestedInstanceId, visibleInstances])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }

  const startMutation = useMutation({
    mutationFn: (input: StartOnboardingInput) => startWorkspaceOnboarding(workspaceId, input),
    onSuccess: async (result) => {
      await refresh()
      setStartOpen(false)
      setInvitation(result)
      toast.success(result.delivery.status === 'sent' ? 'Onboarding invitation sent.' : 'Onboarding link created.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to start onboarding.'),
  })

  const templateMutation = useMutation({
    mutationFn: async ({ draft, publish, makeDefault }: { draft: OnboardingTemplateDraft; publish: boolean; makeDefault: boolean }) => {
      const saved = await saveOnboardingTemplate(workspaceId, draft, editingTemplate?.id)
      return publish ? publishOnboardingTemplate(workspaceId, saved.id, makeDefault) : saved
    },
    onSuccess: async () => {
      await refresh()
      setBuilderOpen(false)
      setEditingTemplate(null)
      toast.success('Onboarding template saved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to save the template.'),
  })

  const templateActionMutation = useMutation({
    mutationFn: async ({ action, template }: { action: 'duplicate' | 'default' | 'archive'; template: OnboardingTemplate }) => {
      if (action === 'duplicate') return duplicateOnboardingTemplate(workspaceId, template.id, nextCopyName(template, data?.templates ?? []))
      if (action === 'default') return setDefaultOnboardingTemplate(workspaceId, template.id)
      return archiveOnboardingTemplate(workspaceId, template.id)
    },
    onSuccess: async (_, variables) => {
      await refresh()
      toast.success(variables.action === 'duplicate' ? 'Template duplicated.' : variables.action === 'default' ? 'Default template updated.' : 'Template archived.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the template.'),
  })

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInstanceId) throw new Error('No onboarding is selected.')
      return approveOnboardingAnswers(workspaceId, selectedInstanceId)
    },
    onSuccess: async () => {
      await refresh()
      await detailQuery.refetch()
      toast.success('Onboarding approved.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to approve onboarding.'),
  })

  const requestChangesMutation = useMutation({
    mutationFn: async (comments: OnboardingReviewComment[]) => {
      if (!selectedInstanceId) throw new Error('No onboarding is selected.')
      return requestOnboardingChanges(workspaceId, selectedInstanceId, comments)
    },
    onSuccess: async (result) => {
      await refresh()
      await detailQuery.refetch()
      setSelectedInstanceId(null)
      // The client is emailed here, so a failed send has to be said out loud:
      // the link reopened either way and they are not expecting it.
      if (result.delivery?.status === 'sent') toast.success('Changes requested. The client has been emailed their reopened link.')
      else toast.warning('Changes recorded and the link reopened, but the email did not send. Share the link from the onboarding row.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to request changes.'),
  })

  const linkMutation = useMutation({
    mutationFn: async ({ action, instance }: { action: 'get_link' | 'rotate' | 'extend'; instance: OnboardingInstanceSummary }) => {
      if (action === 'get_link') return getOnboardingLink(workspaceId, instance.id)
      return action === 'rotate'
        ? rotateOnboardingLink(workspaceId, instance.id, 14)
        : extendOnboardingLink(workspaceId, instance.id, 14)
    },
    onSuccess: async (result, variables) => {
      await refresh()
      if (result.onboarding_url && result.instance) {
        const nextInvitation = {
          instance: result.instance,
          onboarding_url: result.onboarding_url,
          delivery: result.delivery ?? { status: 'skipped' as const },
        }
        setInvitation((current) => current?.instance.id === nextInvitation.instance.id
          && current.instance.capability_generation > nextInvitation.instance.capability_generation
          ? current
          : nextInvitation)
      }
      toast.success(variables.action === 'get_link'
        ? 'Current secure link is ready.'
        : variables.action === 'rotate'
          ? 'Secure link rotated. Older links no longer work.'
          : 'Link extended by 14 days.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update the secure link.'),
  })

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, instance }: { action: ConfirmationAction; instance: OnboardingInstanceSummary }) => {
      if (action === 'revoke') return revokeOnboardingLink(workspaceId, instance.id)
      if (action === 'archive') return archiveOnboardingInstance(workspaceId, instance.id)
      return purgeOnboardingInstance(workspaceId, instance.id)
    },
    onSuccess: async (_, variables) => {
      await refresh()
      setConfirmation(null)
      if (variables.action === 'purge' && selectedInstanceId === variables.instance.id) setSelectedInstanceId(null)
      toast.success(variables.action === 'revoke' ? 'Secure link revoked.' : variables.action === 'archive' ? 'Onboarding archived.' : 'Onboarding PII permanently purged; the client record was retained.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update onboarding.'),
  })

  // Recomputed whenever the list is refetched, which is every 30 seconds while
  // the page is idle. A day boundary is not worth a timer of its own.
  const chaseByInstance = useMemo(() => {
    const now = Date.now()
    return new Map(visibleInstances.map((instance) => [instance.id, onboardingChaseState(instance, now)]))
  }, [visibleInstances])

  const counts = useMemo(() => {
    const instances = visibleInstances
    return {
      chasing: instances.filter((instance) => chaseByInstance.get(instance.id)?.needsChasing).length,
      active: instances.filter((instance) => ['invited', 'in_progress', 'changes_requested'].includes(instance.status)).length,
      review: instances.filter((instance) => instance.status === 'submitted').length,
      approved: instances.filter((instance) => instance.status === 'approved').length,
      expired: instances.filter((instance) => instance.status === 'expired' || instance.status === 'revoked').length,
    }
  }, [chaseByInstance, visibleInstances])

  const tableInstances = useMemo(() => {
    const query = search.trim().toLowerCase()
    return visibleInstances.filter((instance) => {
      if (statusFilter === 'chasing' && !chaseByInstance.get(instance.id)?.needsChasing) return false
      if (statusFilter === 'review' && instance.status !== 'submitted') return false
      if (statusFilter === 'active' && !['invited', 'in_progress', 'changes_requested'].includes(instance.status)) return false
      if (statusFilter === 'approved' && instance.status !== 'approved') return false
      if (statusFilter === 'expired' && !['expired', 'revoked'].includes(instance.status)) return false
      // Archived rows are the only ones a filter hides rather than selects:
      // they are finished work and would otherwise pad every other view.
      if (statusFilter === 'archived' ? !instance.archived_at : Boolean(instance.archived_at)) return false
      if (!query) return true
      return instance.client_name.toLowerCase().includes(query)
        || instance.recipient_email.toLowerCase().includes(query)
        || instance.recipient_name.toLowerCase().includes(query)
        || instance.template_name.toLowerCase().includes(query)
    })
  }, [chaseByInstance, search, statusFilter, visibleInstances])
  const archivedCount = visibleInstances.filter((instance) => instance.archived_at).length
  const filtering = statusFilter !== 'all' || search.trim().length > 0

  const handleClientChoice = (choice: string) => {
    if (choice === 'new') {
      setLogoPreviewUrl(null)
      setStartForm((current) => ({
        ...current,
        client_choice: 'new',
        client_name: '',
        contact_person: '',
        recipient_name: '',
        recipient_email: '',
        logo_file: null,
      }))
      return
    }
    const client = data?.clients.find((candidate) => candidate.id === choice)
    if (!client) return
    setLogoPreviewUrl(null)
    setStartForm((current) => ({
      ...current,
      client_choice: choice,
      client_name: client.name,
      contact_person: client.contact_person || '',
      recipient_name: client.contact_person || client.name,
      recipient_email: client.email || '',
      logo_file: null,
    }))
  }

  const handleTemplateChoice = (templateId: string) => {
    const template = publishedTemplates.find((candidate) => candidate.id === templateId)
    setStartForm((current) => ({
      ...current,
      template_id: templateId,
      ...experienceFromTemplate(template, data?.workspace.name ?? ''),
    }))
  }

  const handleLogoChoice = (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 2_097_152) {
      toast.error('Choose a PNG, JPEG, or WebP logo up to 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => toast.error('The logo preview could not be opened.')
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setLogoPreviewUrl(reader.result)
      setStartForm((current) => ({ ...current, logo_file: file }))
    }
    reader.readAsDataURL(file)
  }

  const submitStart = () => {
    const expiry = Number(startForm.expires_in_days)
    if (!startForm.template_id || !startForm.recipient_name.trim() || !startForm.recipient_email.trim()) {
      toast.error('Choose a template and enter the invited contact name and email.')
      return
    }
    if (!Number.isSafeInteger(expiry) || expiry < 1 || expiry > 90) {
      toast.error('Link expiry must be between 1 and 90 days.')
      return
    }
    if (startForm.client_choice === 'new' && !startForm.client_name.trim()) {
      toast.error('Enter the new client name.')
      return
    }
    if (
      !startForm.experience_title.trim()
      || !startForm.experience_body.trim()
      || !startForm.experience_completion_message.trim()
    ) {
      toast.error('Complete the client-facing welcome and completion messages.')
      return
    }
    startMutation.mutate({
      template_id: startForm.template_id,
      client_id: startForm.client_choice === 'new' ? null : startForm.client_choice,
      new_client: startForm.client_choice === 'new'
        ? { name: startForm.client_name, email: startForm.recipient_email, contact_person: startForm.contact_person }
        : null,
      recipient_name: startForm.recipient_name,
      recipient_email: startForm.recipient_email,
      expires_in_days: expiry,
      assigned_membership_ids: startForm.assigned_membership_ids,
      send_email: startForm.send_email,
      experience: {
        intro_title: startForm.experience_title,
        intro_body: startForm.experience_body,
        completion_message: startForm.experience_completion_message,
        accent_color: startForm.accent_color,
        logo_file: startForm.logo_file,
      },
    })
  }

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Secure onboarding link copied.')
    } catch {
      toast.error('Copy failed. Select and copy the link manually.')
    }
  }

  const shareLink = async (link: string) => {
    const agencyName = data?.workspace.name?.trim() || 'Our agency'
    if (!navigator.share) {
      await copyLink(link)
      return
    }
    try {
      await navigator.share({
        title: `${agencyName} · Client onboarding`,
        text: `${agencyName} sent you a secure client intake form.`,
        url: link,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error('Sharing could not be opened. Copy the link instead.')
    }
  }

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  const effectiveWorkspace = data?.workspace
  const workspaceBaseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(selectedWorkspaceId) : '/app'
  const platformWorkspace = isPlatformWorkspace
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(effectiveWorkspace?.id, effectiveWorkspace?.logo_path, effectiveWorkspace?.logo_updated_at),
        baseHref: workspaceBaseHref,
      }
    : undefined

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">{filteredClient ? `${filteredClient.name} onboarding` : 'Client Onboarding'}</h1><p className="mt-1 text-muted-foreground">{filteredClient ? 'Review this client’s intake, answers, and approved profile.' : 'Create branded intake forms, invite clients, and review their completed answers.'}</p></div>
          <div className="flex flex-wrap gap-2">
            {filteredClient && <Button asChild variant="outline"><Link to={`${workspaceBaseHref}/clients/${filteredClient.id}`}>Back to client</Link></Button>}
            {canManage && (publishedTemplates.length > 0
              ? <Button onClick={() => setStartOpen(true)}><Send className="mr-2 h-4 w-4" />Start onboarding</Button>
              : <Button onClick={() => { setEditingTemplate(data?.templates.find((template) => template.status !== 'archived') ?? null); setBuilderOpen(true) }}><Plus className="mr-2 h-4 w-4" />Set up a template</Button>)}
          </div>
        </div>

        {!validWorkspaceId ? (
          <Card><CardHeader><CardTitle>Workspace address invalid</CardTitle><CardDescription>The selected workspace could not be identified.</CardDescription></CardHeader></Card>
        ) : onboardingQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : onboardingQuery.error ? (
          <Card><CardHeader><CardTitle>Onboarding unavailable</CardTitle><CardDescription>{onboardingQuery.error instanceof Error ? onboardingQuery.error.message : 'Try again.'}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void onboardingQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : data ? (
          <>
            {!canManage && <Alert><ShieldAlert className="h-4 w-4" /><AlertTitle>Assigned onboarding access</AlertTitle><AlertDescription>You can review only the onboarding records assigned to you. Owners and admins manage templates and invitations.</AlertDescription></Alert>}

            {/* Each card selects the rows it counts. A number you cannot open
                is a number you have to go looking for. */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {([
                { key: 'chasing', label: 'Needs chasing', value: counts.chasing, icon: AlertTriangle, tone: 'text-amber-600' },
                { key: 'active', label: 'Active intake', value: counts.active, icon: Clock3, tone: 'text-violet-500' },
                { key: 'review', label: 'Awaiting review', value: counts.review, icon: ClipboardCheck, tone: 'text-amber-500' },
                { key: 'approved', label: 'Approved', value: counts.approved, icon: Sparkles, tone: 'text-emerald-500' },
                { key: 'expired', label: 'Expired', value: counts.expired, icon: Link2, tone: 'text-slate-500' },
              ] as const).map(({ key, label, value, icon: Icon, tone }) => (
                <Card
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={statusFilter === key}
                  onClick={() => setStatusFilter((current) => (current === key ? 'all' : key))}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setStatusFilter((current) => (current === key ? 'all' : key))
                  }}
                  className={`cursor-pointer transition-colors hover:bg-muted/30 ${statusFilter === key ? 'border-primary ring-1 ring-primary' : ''}`}
                >
                  <CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader>
                  <CardContent><Icon className={`h-5 w-5 ${tone}`} /></CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="instances" className="space-y-4">
              <TabsList><TabsTrigger value="instances">Client onboarding</TabsTrigger>{canManage && <TabsTrigger value="templates">Form templates</TabsTrigger>}</TabsList>
              <TabsContent value="instances">
                <Card>
                  <CardHeader>
                    <CardTitle>Onboarding activity</CardTitle>
                    <CardDescription>See when the private link was first viewed, when the client first saved progress, and when they completed the form. Nothing chases a client automatically, so anything gone quiet is flagged here.</CardDescription>
                    <div className="flex flex-col gap-2 pt-3 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search client, contact, or template"
                          aria-label="Search onboarding"
                          className="pl-9"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OnboardingTableFilter)}>
                        <SelectTrigger className="sm:w-56" aria-label="Filter onboarding by status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All active ({visibleInstances.length - archivedCount})</SelectItem>
                          <SelectItem value="chasing">Needs chasing ({counts.chasing})</SelectItem>
                          <SelectItem value="active">Active intake ({counts.active})</SelectItem>
                          <SelectItem value="review">Awaiting review ({counts.review})</SelectItem>
                          <SelectItem value="approved">Approved ({counts.approved})</SelectItem>
                          <SelectItem value="expired">Expired ({counts.expired})</SelectItem>
                          <SelectItem value="archived">Archived ({archivedCount})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visibleInstances.length === 0 ? (
                      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><FilePlus2 className="h-10 w-10 text-muted-foreground" /><div><p className="font-medium">No onboarding invitations yet</p><p className="text-sm text-muted-foreground">Start with an existing client or create a minimal client while inviting them.</p></div>{canManage && <Button variant="outline" onClick={() => setStartOpen(true)}><Plus className="mr-2 h-4 w-4" />Start onboarding</Button>}</div>
                    ) : (
                      <div className="overflow-x-auto">
                        {filtering && (
                          <p className="pb-3 text-xs text-muted-foreground">
                            {tableInstances.length} of {visibleInstances.length} shown
                            <button type="button" className="ml-2 font-medium underline underline-offset-2" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear</button>
                          </p>
                        )}
                        {tableInstances.length === 0 ? (
                          <p className="py-10 text-center text-sm text-muted-foreground">
                            {statusFilter === 'chasing'
                              ? 'Nothing has gone quiet. Every live onboarding was opened recently and has time on its link.'
                              : 'No onboarding matches this filter.'}
                          </p>
                        ) : (
                        <Table>
                          <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Template</TableHead><TableHead>Activity</TableHead><TableHead>Timing</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                          <TableBody>{tableInstances.map((instance) => (
                            <TableRow key={instance.id} className={instance.archived_at ? 'opacity-60' : undefined}>
                              <TableCell><p className="font-medium">{instance.client_name}</p><p className="text-xs text-muted-foreground">{instance.recipient_email}</p>{instance.archived_at && <Badge variant="outline" className="mt-1">Archived</Badge>}</TableCell>
                              <TableCell><p>{instance.template_name}</p><p className="text-xs text-muted-foreground">Version {instance.template_version}</p></TableCell>
                              <TableCell><OnboardingActivity instance={instance} /></TableCell>
                              <TableCell><OnboardingAge instance={instance} /></TableCell>
                              <TableCell><Badge variant="outline" className={statusStyles[instance.status]}>{onboardingStatusLabel(instance.status)}</Badge></TableCell>
                              <TableCell className="text-right"><div className="inline-flex items-center gap-1"><Button size="sm" variant="outline" onClick={() => setSelectedInstanceId(instance.id)}>View</Button>{canManage && <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`More actions for ${instance.client_name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
                                {!['approved', 'revoked', 'submitted', 'expired'].includes(instance.status) && <DropdownMenuItem disabled={linkMutation.isPending} onClick={() => linkMutation.mutate({ action: 'get_link', instance })}><ExternalLink className="mr-2 h-4 w-4" />Open or copy current link</DropdownMenuItem>}
                                {!['approved', 'revoked', 'submitted'].includes(instance.status) && <DropdownMenuItem disabled={linkMutation.isPending} onClick={() => linkMutation.mutate({ action: 'rotate', instance })}>Rotate secure link</DropdownMenuItem>}
                                {!['submitted', 'approved', 'revoked'].includes(instance.status) && <DropdownMenuItem disabled={linkMutation.isPending} onClick={() => linkMutation.mutate({ action: 'extend', instance })}>Extend 14 days</DropdownMenuItem>}
                                {!['approved', 'revoked'].includes(instance.status) && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmation({ action: 'revoke', instance })}>Revoke link</DropdownMenuItem>}
                                <DropdownMenuSeparator />
                                {!instance.archived_at && <DropdownMenuItem onClick={() => setConfirmation({ action: 'archive', instance })}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>}
                                {instance.archived_at && <DropdownMenuItem className="text-destructive" onClick={() => setConfirmation({ action: 'purge', instance })}>Permanently purge onboarding PII</DropdownMenuItem>}
                              </DropdownMenuContent></DropdownMenu>}</div></TableCell>
                            </TableRow>
                          ))}</TableBody>
                        </Table>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {canManage && <TabsContent value="templates">
                <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Reusable form templates</h2><p className="text-sm text-muted-foreground">Edit drafts freely; every publish creates a new immutable version.</p></div><Button variant="outline" onClick={() => { setEditingTemplate(null); setBuilderOpen(true) }}><Plus className="mr-2 h-4 w-4" />New template</Button></div>
                <div className="grid gap-4 lg:grid-cols-2">{data.templates.map((template) => (
                  <Card key={template.id} className={template.status === 'archived' ? 'opacity-60' : undefined}>
                    <CardHeader><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>{template.name}</CardTitle>{template.is_default && <Badge>Default</Badge>}<Badge variant="outline" className="capitalize">{template.status}</Badge></div><CardDescription className="mt-2">{template.description || 'No internal description'}</CardDescription></div></div></CardHeader>
                    <CardContent><div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{template.definition.sections.length} sections</span><span>{template.definition.sections.reduce((total, section) => total + section.questions.length, 0)} questions</span><span>Version {template.published_version || 'draft'}</span></div>{template.status !== 'archived' && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingTemplate(template); setBuilderOpen(true) }}>Edit builder</Button><Button size="sm" variant="outline" onClick={() => templateActionMutation.mutate({ action: 'duplicate', template })}><Copy className="mr-2 h-4 w-4" />Duplicate</Button>{template.status === 'published' && !template.is_default && <Button size="sm" variant="outline" onClick={() => templateActionMutation.mutate({ action: 'default', template })}>Make default</Button>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => templateActionMutation.mutate({ action: 'archive', template })}>Archive</Button></div>}</CardContent>
                  </Card>
                ))}</div>
              </TabsContent>}
            </Tabs>

          </>
        ) : null}
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        {/* Header and footer are pinned and the body is the only thing that
            scrolls, so the actions stay put and no dead band opens up around a
            body that is shorter or taller than the dialog. */}
        <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-7xl flex-col gap-0 overflow-hidden p-0 sm:w-[96vw] sm:max-w-7xl">
          <DialogHeader className="shrink-0 border-b px-6 pb-5 pt-6">
            <DialogTitle>Start client onboarding</DialogTitle>
            <DialogDescription>Choose the client and personalize the exact branded experience they will receive.</DialogDescription>
          </DialogHeader>

          {/* Side by side, the two columns have nothing to do with each other's
              height: the form is as tall as its fields, the preview as tall as
              the experience it renders. Sharing one scroll meant the shorter one
              left a long white run beside the taller. Each column scrolls itself
              instead, bounded by the dialog, so neither can strand the other.
              Below lg they stack and the body scrolls as one. */}
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 lg:flex-row lg:overflow-hidden">
            <div className="min-w-0 space-y-6 lg:w-[45%] lg:overflow-y-auto lg:pr-1">
              <section className="space-y-4">
                <div><h3 className="font-semibold">Client and form</h3><p className="text-sm text-muted-foreground">Create one private intake link for this client. The questions stay pinned to this published template version.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2"><Label>Template</Label><Select value={startForm.template_id} onValueChange={handleTemplateChoice}><SelectTrigger><SelectValue placeholder="Choose a published template" /></SelectTrigger><SelectContent>{publishedTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · v{template.published_version}{template.is_default ? ' · Default' : ''}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Client</Label><Select value={startForm.client_choice} onValueChange={handleClientChoice}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Create a new client</SelectItem>{data?.clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}{client.email ? ` · ${client.email}` : ''}</SelectItem>)}</SelectContent></Select></div>
                  {startForm.client_choice === 'new' ? <>
                    <div className="space-y-2"><Label htmlFor="new-client-name">Client or company name</Label><Input id="new-client-name" placeholder="Acme Company" value={startForm.client_name} onChange={(event) => setStartForm((current) => ({ ...current, client_name: event.target.value }))} /></div>
                    <div className="space-y-2"><Label htmlFor="new-contact">Contact name</Label><Input id="new-contact" placeholder="Jane Smith" value={startForm.contact_person} onChange={(event) => setStartForm((current) => ({ ...current, contact_person: event.target.value, recipient_name: event.target.value }))} /></div>
                  </> : <div className="space-y-2 sm:col-span-2"><Label htmlFor="recipient-name">Contact name</Label><Input id="recipient-name" value={startForm.recipient_name} onChange={(event) => setStartForm((current) => ({ ...current, recipient_name: event.target.value }))} /></div>}
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="recipient-email">Contact email</Label><Input id="recipient-email" type="email" placeholder="jane@example.com" value={startForm.recipient_email} onChange={(event) => setStartForm((current) => ({ ...current, recipient_email: event.target.value }))} /></div>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
                <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Palette className="h-5 w-5" /></div><div><h3 className="font-semibold">Customize this client’s experience</h3><p className="text-sm text-muted-foreground">These choices apply only to this secure link. The client sees your branding, never the platform brand.</p></div></div>
                <div className="space-y-2"><Label htmlFor="experience-title">Welcome title</Label><Input id="experience-title" maxLength={300} value={startForm.experience_title} onChange={(event) => setStartForm((current) => ({ ...current, experience_title: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="experience-body">Welcome message</Label><Textarea id="experience-body" rows={4} maxLength={3000} value={startForm.experience_body} onChange={(event) => setStartForm((current) => ({ ...current, experience_body: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="experience-completion">Completion message</Label><Textarea id="experience-completion" rows={3} maxLength={2000} value={startForm.experience_completion_message} onChange={(event) => setStartForm((current) => ({ ...current, experience_completion_message: event.target.value }))} /></div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Accent color</Label><div className="flex flex-wrap items-center gap-2">{ACCENT_PRESETS.map((color) => <button key={color} type="button" aria-label={`Use accent ${color}`} aria-pressed={startForm.accent_color === color} className="h-8 w-8 rounded-full border-2 border-background shadow ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2" style={{ backgroundColor: color, boxShadow: startForm.accent_color === color ? `0 0 0 2px ${color}` : undefined }} onClick={() => setStartForm((current) => ({ ...current, accent_color: color }))} />)}<Input aria-label="Custom accent color" type="color" value={startForm.accent_color} className="h-9 w-12 cursor-pointer p-1" onChange={(event) => setStartForm((current) => ({ ...current, accent_color: event.target.value.toUpperCase() }))} /></div></div>
                  <div className="space-y-2"><Label htmlFor="client-onboarding-logo">Client logo override</Label><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" asChild><label htmlFor="client-onboarding-logo" className="cursor-pointer"><ImagePlus className="mr-2 h-4 w-4" />{startForm.logo_file ? 'Replace logo' : 'Upload logo'}</label></Button>{startForm.logo_file && <Button type="button" variant="ghost" size="sm" onClick={() => { setLogoPreviewUrl(null); setStartForm((current) => ({ ...current, logo_file: null })) }}><X className="mr-1 h-4 w-4" />Use agency logo</Button>}</div><Input id="client-onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { handleLogoChoice(event.target.files?.[0]); event.currentTarget.value = '' }} /><p className="text-xs text-muted-foreground">PNG, JPEG, or WebP up to 2 MB. Leave empty to use {data?.workspace.name}’s logo.</p></div>
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="expiry-days">Link expires in days</Label><Input id="expiry-days" type="number" min={1} max={90} value={startForm.expires_in_days} onChange={(event) => setStartForm((current) => ({ ...current, expires_in_days: event.target.value }))} /></div>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={startForm.send_email} onCheckedChange={(checked) => setStartForm((current) => ({ ...current, send_email: checked === true }))} /><span>Email this invitation to the client</span></label>
                {data?.assignable_members.length ? <div className="space-y-2 sm:col-span-2"><Label>Assign read-only team members</Label><div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">{data.assignable_members.map((member) => <label key={member.id} className="flex items-center gap-2 text-sm"><Checkbox checked={startForm.assigned_membership_ids.includes(member.id)} onCheckedChange={(checked) => setStartForm((current) => ({ ...current, assigned_membership_ids: checked === true ? [...current.assigned_membership_ids, member.id] : current.assigned_membership_ids.filter((id) => id !== member.id) }))} /><span>{member.full_name || member.email}</span></label>)}</div></div> : null}
              </section>
            </div>

            <aside className="min-w-0 lg:w-[55%] lg:overflow-y-auto">
              {selectedStartTemplate ? (
                <ClientOnboardingPreview
                  key={selectedStartTemplate.id}
                  definition={{
                    ...selectedStartTemplate.definition,
                    intro_title: startForm.experience_title,
                    intro_body: startForm.experience_body,
                    completion_message: startForm.experience_completion_message,
                  }}
                  workspaceName={data?.workspace.name ?? ''}
                  workspaceLogoUrl={activePreviewLogoUrl}
                  accentColor={startForm.accent_color}
                  recipientName={startForm.recipient_name}
                />
              ) : (
                <Card><CardHeader><CardTitle className="text-base">Choose a template to preview</CardTitle><CardDescription>The complete client experience will appear here.</CardDescription></CardHeader></Card>
              )}
            </aside>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4"><Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button><Button disabled={startMutation.isPending} onClick={submitStart}>{startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create secure link</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(invitation)} onOpenChange={(open) => { if (!open) setInvitation(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Your client intake link is ready</DialogTitle><DialogDescription>Share it from your agency’s usual client communication channel.</DialogDescription></DialogHeader>
          {invitation && invitation.delivery.status === 'sent' && (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
              Invitation emailed to {invitation.instance.recipient_name}. You can still share the link directly below.
            </p>
          )}
          {invitation && invitation.delivery.status === 'failed' && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              The invitation email could not be delivered — share the link below manually.
            </p>
          )}
          {invitation && <div className="space-y-4"><div className="overflow-hidden rounded-2xl border bg-muted/20"><div className="h-1.5 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-400" /><div className="p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Share2 className="h-5 w-5" /></div><div><p className="font-semibold">Ready for {invitation.instance.recipient_name}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">When shared in Messages, the link can display your agency name and logo as a polished preview.</p></div></div></div></div><div className="space-y-2"><Label htmlFor="onboarding-link">Private onboarding link</Label><Input id="onboarding-link" readOnly value={invitation.onboarding_url} onFocus={(event) => event.currentTarget.select()} /><div className="grid gap-2 sm:grid-cols-2"><Button onClick={() => void shareLink(invitation.onboarding_url)}><Share2 className="mr-2 h-4 w-4" />Share link</Button><Button variant="outline" onClick={() => void copyLink(invitation.onboarding_url)}><Copy className="mr-2 h-4 w-4" />Copy link</Button></div></div><p className="text-xs text-muted-foreground">Anyone with this link can complete this client’s intake until it expires or is revoked. Send it only to the intended contact.</p></div>}
          <DialogFooter>{invitation && <Button variant="outline" asChild><a href={invitation.onboarding_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open client form</a></Button>}<Button onClick={() => setInvitation(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <OnboardingTemplateBuilder open={builderOpen} template={editingTemplate} workspaceName={data?.workspace.name ?? ''} workspaceLogoUrl={agencyLogoUrl} saving={templateMutation.isPending} onOpenChange={(open) => { setBuilderOpen(open); if (!open) setEditingTemplate(null) }} onSave={(draft, publish, makeDefault) => templateMutation.mutate({ draft, publish, makeDefault })} />

      <OnboardingReviewDialog
        open={Boolean(selectedInstanceId)}
        detail={detailQuery.data ?? null}
        canManage={canManage}
        busy={approveMutation.isPending || requestChangesMutation.isPending || detailQuery.isFetching}
        onOpenChange={(open) => { if (!open) setSelectedInstanceId(null) }}
        onApprove={() => approveMutation.mutate()}
        onRequestChanges={(comments) => requestChangesMutation.mutate(comments)}
      />

      {selectedInstanceId && detailQuery.isLoading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20"><div className="rounded-xl bg-background p-6 shadow-xl"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div></div>}

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{confirmation?.action === 'purge' ? 'Permanently purge onboarding PII?' : confirmation?.action === 'archive' ? 'Archive this onboarding?' : 'Revoke this secure link?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === 'purge' ? 'This permanently deletes every onboarding draft, immutable answer revision, review note, AI draft, notification record, and private upload. It cannot be undone. The separate client record remains.' : confirmation?.action === 'archive' ? 'Archiving removes this record from active work, revokes any live client link, and is required before permanent PII purge. The draft and uploads remain retained.' : 'The client will immediately lose access to this link. Their existing draft and files remain retained.'}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className={confirmation?.action === 'archive' ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'} disabled={lifecycleMutation.isPending} onClick={(event) => { event.preventDefault(); if (confirmation) lifecycleMutation.mutate(confirmation) }}>{lifecycleMutation.isPending ? 'Working…' : confirmation?.action === 'purge' ? 'Permanently purge' : confirmation?.action === 'archive' ? 'Archive' : 'Revoke link'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  )
}

export default WorkspaceOnboarding
