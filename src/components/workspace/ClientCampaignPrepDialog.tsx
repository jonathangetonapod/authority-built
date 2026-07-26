import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Coins,
  ExternalLink,
  FileSearch,
  Globe,
  Loader2,
  Lightbulb,
  Mail,
  MailCheck,
  Mic2,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  PenLine,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { buildPodcastCampaignSequenceDraft, buildThreadReplySubject, type PodcastCampaignSequenceDraft } from '@/lib/campaignSequence'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  type ClientShortlistEmailUnlockStageId,
  type ClientShortlistPodcast,
  type ClientShortlistResearchStageId,
  ensureClientShortlistEpisodes,
  generateClientShortlistPitch,
  getClientShortlistResearchDocument,
  runClientShortlistEmailSearch,
  runClientShortlistResearch,
} from '@/services/clientShortlist'
import {
  getWorkspaceCampaign,
  prepareWorkspaceCampaignPodcast,
} from '@/services/workspaceCampaigns'
import {
  getWorkspaceResearchPromptOverrides,
  resetWorkspaceResearchPrompt,
  setWorkspaceResearchPrompt,
} from '@/services/workspaceCampaigns'
import {
  RESEARCH_PROMPT_DEFAULTS,
  RESEARCH_PROMPT_DEFAULTS_BY_ID,
  type ResearchPromptId,
} from '@/lib/researchPromptDefaults'

interface ClientCampaignPrepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  clientId: string
  clientName: string
  clientBio?: string | null
  viewerRole?: 'owner' | 'admin' | 'member' | 'platform_admin'
  campaignHref: string
  podcast: ClientShortlistPodcast | null
  onArchive: () => void
  onPrepared?: () => void
}

type PitchStep = 'email' | 'research' | 'pitch'
type EmailRoute = 'podcast' | 'waterfall' | 'manual'
type SequenceEmailStep = 'opening' | 'follow_up_one' | 'follow_up_two'
type ResearchProgressStatus = 'complete' | 'active' | 'queued' | 'failed'
type EmailUnlockVisualStatus = 'available' | 'queued' | 'running' | 'unlocked' | 'not_found' | 'failed'

interface ResearchProgressStep {
  id: ClientShortlistResearchStageId
  title: string
  detail: string
}

interface EmailUnlockStep {
  id: ClientShortlistEmailUnlockStageId
  title: string
}

const pitchSteps: Array<{ id: PitchStep; step: string; title: string; detail: string }> = [
  { id: 'email', step: '1', title: 'Find email', detail: 'Identify the host or producer' },
  { id: 'research', step: '2', title: 'Research & pitch', detail: 'Generate and compare three sequences' },
  { id: 'pitch', step: '3', title: 'Finalize pitch', detail: 'Edit and save the selected sequence' },
]

const sequenceEmailSteps: Array<{ id: SequenceEmailStep; email: string; title: string; timing: string; detail: string }> = [
  { id: 'opening', email: 'Email 1', title: 'Opening pitch', timing: 'Day 0', detail: 'Starts the outreach' },
  { id: 'follow_up_one', email: 'Email 2', title: 'Follow-up', timing: 'Day 3', detail: 'Replies in the same thread' },
  { id: 'follow_up_two', email: 'Email 3', title: 'Close the loop', timing: 'Day 8', detail: 'Final same-thread reply' },
]

const researchProgressSteps: ResearchProgressStep[] = [
  { id: 'podcast_profile', title: 'Reading the podcast profile', detail: 'Show focus, format, and positioning' },
  { id: 'host_profile', title: 'Confirming the host', detail: 'Background and interview approach' },
  { id: 'recent_episodes', title: 'Reviewing recent episodes', detail: 'Themes, questions, and timely references' },
  { id: 'guest_patterns', title: 'Checking guest patterns', detail: 'Guest format and recent conversations' },
  { id: 'guest_fit', title: 'Matching guest expertise', detail: 'Audience needs and credible fit' },
  { id: 'pitch_angles', title: 'Preparing pitch angles', detail: 'Primary topic and useful alternatives' },
]

// Which canonical prompt produced each UI stage — the inverse of the
// executor's RESEARCH_STAGE_MAP, so the inspector can open the stored output.
const RESEARCH_STAGE_TO_PROMPT: Record<
  ClientShortlistResearchStageId,
  'podcast_research' | 'host_info' | 'guest_info' | 'find_topics'
> = {
  podcast_profile: 'podcast_research',
  recent_episodes: 'podcast_research',
  host_profile: 'host_info',
  guest_patterns: 'guest_info',
  guest_fit: 'find_topics',
  pitch_angles: 'find_topics',
}

const emailUnlockSteps: EmailUnlockStep[] = [
  { id: 'identify_contact', title: 'Confirming the right contact' },
  { id: 'find_email', title: 'Searching trusted sources' },
  { id: 'verify_email', title: 'Verifying the email' },
]

function promptVariables(content: string): string[] {
  return Array.from(new Set(Array.from(content.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gu), (match) => match[1])))
}

function emptyDraft(): PodcastCampaignSequenceDraft {
  return {
    researchNotes: '',
    subject: '',
    pitchBody: '',
    followUpOneSubject: '',
    followUpOneBody: '',
    followUpTwoSubject: '',
    followUpTwoBody: '',
  }
}

function fieldComplete(value: string): boolean {
  return Boolean(value.trim())
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatPodcastDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function ClientCampaignPrepDialog({
  open,
  onOpenChange,
  workspaceId,
  clientId,
  clientName,
  clientBio,
  viewerRole,
  campaignHref,
  podcast,
  onArchive,
  onPrepared,
}: ClientCampaignPrepDialogProps) {
  const queryClient = useQueryClient()
  const [activeStep, setActiveStep] = useState<PitchStep>('email')
  const [emailRoute, setEmailRoute] = useState<EmailRoute>('podcast')
  const [previewEmailSearchPodcastId, setPreviewEmailSearchPodcastId] = useState<string | null>(null)
  const shortlistQueryKey = ['client-shortlist', workspaceId, clientId] as const
  const runResearchMutation = useMutation({
    mutationFn: (shortlistPodcastId: string) => runClientShortlistResearch(workspaceId, clientId, shortlistPodcastId),
    onMutate: () => {
      // The shortlist poll only activates once it sees a running status, so
      // refresh shortly after the backend writes its first progress row.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      }, 2_500)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['client-shortlist-research-document', workspaceId, clientId] })
      toast.success('Research completed with your saved workspace prompts.')
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      toast.error(error instanceof Error ? error.message : 'The research run could not be completed.')
    },
  })
  // Real pitch copy comes from the write_email/clean_email prompts running
  // over the stored research with mapped variables; the local template is
  // only the placeholder while it loads (or the fallback if it fails).
  const [aiPitches, setAiPitches] = useState<Record<string, { subject: string; body: string }>>({})
  const [pitchLoadingKey, setPitchLoadingKey] = useState<string | null>(null)
  const pitchKey = (podcastId: string, angleIndex: number) => `${podcastId}:${angleIndex}`
  const loadAiPitch = async (angleIndex: number) => {
    if (!podcast?.id) return
    const key = pitchKey(podcast.id, angleIndex)
    if (aiPitches[key] || pitchLoadingKey === key) return
    const researched = podcast.research_progress
      ? podcast.research_progress.status === 'completed'
      : Boolean(podcast.ai_analyzed_at)
    if (!researched) return
    setPitchLoadingKey(key)
    try {
      const pitch = await generateClientShortlistPitch(workspaceId, clientId, podcast.id, angleIndex)
      if (!pitch?.subject || !pitch?.body) {
        throw new Error('The pitch could not be written from research.')
      }
      setAiPitches((current) => ({ ...current, [key]: { subject: pitch.subject, body: pitch.body } }))
      setDraft((current) => ({ ...current, subject: pitch.subject, pitchBody: pitch.body }))
      setSavedDraft((current) => ({ ...current, subject: pitch.subject, pitchBody: pitch.body }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The pitch could not be written from research.')
    } finally {
      setPitchLoadingKey((current) => (current === key ? null : current))
    }
  }

  const emailSearchMutation = useMutation({
    mutationFn: (shortlistPodcastId: string) => runClientShortlistEmailSearch(workspaceId, clientId, shortlistPodcastId),
    onMutate: () => {
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      }, 2_500)
    },
    onSuccess: (unlock) => {
      if (unlock.status === 'unlocked') {
        toast.success('Direct host email unlocked and shared across the platform.')
      } else {
        toast.info(unlock.message || 'No verified direct email was found. You were not charged.')
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The direct email search could not be completed.')
    },
    onSettled: () => {
      setPreviewEmailSearchPodcastId(null)
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
    },
  })
  const [showPodcastDetails, setShowPodcastDetails] = useState(false)
  const [showResearchSteps, setShowResearchSteps] = useState(false)
  const [showPromptSettings, setShowPromptSettings] = useState(false)
  const [selectedPromptId, setSelectedPromptId] = useState<ResearchPromptId>('podcast_research')
  const [promptDraft, setPromptDraft] = useState(RESEARCH_PROMPT_DEFAULTS_BY_ID.podcast_research.content)
  const [promptTouched, setPromptTouched] = useState(false)
  const [selectedAngleIndex, setSelectedAngleIndex] = useState(0)
  const [activeSequenceEmail, setActiveSequenceEmail] = useState<SequenceEmailStep>('opening')
  const [hostName, setHostName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [draft, setDraft] = useState<PodcastCampaignSequenceDraft>(emptyDraft)
  const [savedDraft, setSavedDraft] = useState<PodcastCampaignSequenceDraft>(emptyDraft)

  const campaignQueryKey = ['client-campaign-preparation', workspaceId, clientId] as const
  const campaignQuery = useQuery({
    queryKey: campaignQueryKey,
    queryFn: () => getWorkspaceCampaign(workspaceId, clientId),
    enabled: open && Boolean(podcast),
    retry: false,
  })
  // Self-healing episode metadata: the server fetches from Podscan only when
  // the stored capture is missing or stale, so opening the dialog normally
  // costs one cheap read — and fills "Latest activity" without anyone asking.
  const episodeMetadataQuery = useQuery({
    queryKey: ['client-shortlist-episodes', workspaceId, clientId, podcast?.podcast_id || 'none'],
    queryFn: () => ensureClientShortlistEpisodes(workspaceId, clientId, podcast!.podcast_id),
    enabled: open && Boolean(podcast?.podcast_id),
    retry: false,
    staleTime: 5 * 60_000,
  })
  const episodeMetadata = episodeMetadataQuery.data ?? null
  const latestEpisode = episodeMetadata?.episodes[0] ?? podcast?.recent_episodes?.[0] ?? null
  const latestActivityAt = episodeMetadata?.last_posted_at ?? podcast?.last_posted_at ?? null
  const campaign = campaignQuery.data?.campaign || null
  const canManageCampaigns = Boolean(campaignQuery.data?.can_manage_campaigns)
  const canCustomizePrompts = viewerRole === 'owner' || viewerRole === 'platform_admin'
  const target = campaignQuery.data?.targets.find((item) => item.shortlist_podcast_id === podcast?.id) || null
  const previouslyContacted = Boolean(podcast?.prior_outreach_at || target?.prior_outreach_at)
  const locked = previouslyContacted || Boolean(target && (
    target.instantly_lead_id
    || ['launching', 'in_outreach', 'replied', 'completed'].includes(target.status)
  ))
  const mappedCampaign = Boolean(campaign?.instantly_campaign_id)
  const podcastUrl = safeExternalUrl(podcast?.podcast_url)
  const podcastImageUrl = safeExternalUrl(podcast?.podcast_image_url)
  const publicPodcastEmail = podcast?.podcast_email?.trim() || ''
  const storedEmailUnlock = podcast?.email_unlock || null
  const previewEmailSearchRunning = previewEmailSearchPodcastId === podcast?.podcast_id
    && storedEmailUnlock?.status !== 'unlocked'
  const emailUnlockStatus: EmailUnlockVisualStatus = previewEmailSearchRunning
    ? 'running'
    : storedEmailUnlock?.status || 'available'
  const unlockedEmail = emailUnlockStatus === 'unlocked'
    ? storedEmailUnlock?.email?.trim() || target?.contact_email?.trim() || ''
    : ''
  const emailSearchRunning = emailUnlockStatus === 'queued' || emailUnlockStatus === 'running'
  const emailAlreadyUnlocked = emailUnlockStatus === 'unlocked' && validEmail(unlockedEmail)
  const emailSearchHasNoResult = emailUnlockStatus === 'not_found' || emailUnlockStatus === 'failed'
  const emailUnlockCurrentStage = previewEmailSearchRunning
    ? 'identify_contact'
    : storedEmailUnlock?.current_stage || null
  const emailUnlockCompletedStages = new Set(storedEmailUnlock?.completed_stages || [])
  const visibleEmailUnlockSteps = emailUnlockSteps.map((step) => ({
    ...step,
    status: emailAlreadyUnlocked || emailUnlockCompletedStages.has(step.id)
      ? 'complete'
      : emailUnlockCurrentStage === step.id
        ? 'active'
        : 'queued',
  }))
  const fitReasons = podcast?.ai_fit_reasons || []
  const pitchAngles = podcast?.ai_pitch_angles || []
  const selectedPitchAngle = pitchAngles[selectedAngleIndex] || null
  const sequenceOptionCount = Math.max(Math.min(pitchAngles.length, 3), 1)
  const researchProgress = podcast?.research_progress || null
  const hasLegacyAnalysis = Boolean(podcast?.ai_analyzed_at)
  const researchRegenerating = runResearchMutation.isPending && runResearchMutation.variables === podcast?.id
  const visibleResearchSteps = useMemo(() => {
    const liveStatus = researchProgress?.status
    if (researchRegenerating && liveStatus !== 'running' && liveStatus !== 'queued') {
      // The run has started but the poll hasn't surfaced backend progress yet.
      return researchProgressSteps.map((step, index): ResearchProgressStep & { status: ResearchProgressStatus } => ({
        ...step,
        status: index === 0 ? 'active' : 'queued',
      }))
    }
    const completedStages = new Set(researchProgress?.completed_stages || [])
    return researchProgressSteps.map((step): ResearchProgressStep & { status: ResearchProgressStatus } => {
      if (!researchProgress) return { ...step, status: hasLegacyAnalysis ? 'complete' : 'queued' }
      if (researchProgress.status === 'completed') return { ...step, status: 'complete' }
      if (completedStages.has(step.id)) return { ...step, status: 'complete' }
      if (researchProgress.current_stage === step.id) {
        return { ...step, status: researchProgress.status === 'failed' ? 'failed' : 'active' }
      }
      return { ...step, status: 'queued' }
    })
  }, [researchProgress, researchRegenerating, hasLegacyAnalysis])
  const completedResearchStepCount = visibleResearchSteps.filter((step) => step.status === 'complete').length
  const activeResearchStep = visibleResearchSteps.find((step) => step.status === 'active') || null
  const failedResearchStep = visibleResearchSteps.find((step) => step.status === 'failed') || null
  const researchComplete = !researchRegenerating
    && (researchProgress ? researchProgress.status === 'completed' : hasLegacyAnalysis)
  const researchFailed = !researchRegenerating && researchProgress?.status === 'failed'
  const researchWorking = researchRegenerating || researchProgress?.status === 'queued' || researchProgress?.status === 'running'
  const researchStepsExpanded = !researchComplete || showResearchSteps
  const researchStatusTitle = researchRegenerating && activeResearchStep
    ? `${activeResearchStep.title} · ${completedResearchStepCount} of ${researchProgressSteps.length} prompts complete`
    : researchComplete
    ? `Research ready · ${researchProgressSteps.length} of ${researchProgressSteps.length} steps complete`
    : researchFailed
      ? `Research paused · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
      : activeResearchStep
        ? `${activeResearchStep.title} · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
        : `Research queued · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
  const researchStatusDetail = researchRegenerating && activeResearchStep
    ? `Running your saved workspace prompts against live podcast data. ${activeResearchStep.detail}.`
    : researchComplete
    ? 'The research is saved to this podcast and will still be here when you return.'
    : researchFailed
      ? researchProgress?.message || `We could not finish ${failedResearchStep?.title.toLowerCase() || 'this research stage'}. Your completed work is saved.`
      : activeResearchStep
        ? activeResearchStep.detail
        : 'Your research will begin as soon as the workspace is ready.'
  const [inspectedStageId, setInspectedStageId] = useState<ClientShortlistResearchStageId | null>(null)
  const researchDocumentQueryKey = ['client-shortlist-research-document', workspaceId, clientId, podcast?.id || 'none'] as const
  const researchDocumentQuery = useQuery({
    queryKey: researchDocumentQueryKey,
    queryFn: () => getClientShortlistResearchDocument(workspaceId, clientId, podcast!.id),
    enabled: open && Boolean(podcast?.id) && researchComplete && researchStepsExpanded,
    retry: false,
    staleTime: 60_000,
  })
  const researchDocument = researchDocumentQuery.data ?? null
  const promptOverridesQuery = useQuery({
    queryKey: ['workspace-research-prompts', workspaceId],
    queryFn: () => getWorkspaceResearchPromptOverrides(workspaceId),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  })
  const promptOverrides = promptOverridesQuery.data ?? {}

  const inspectedStage = inspectedStageId
    ? researchProgressSteps.find((step) => step.id === inspectedStageId) ?? null
    : null
  const inspectedPromptId = inspectedStageId ? RESEARCH_STAGE_TO_PROMPT[inspectedStageId] : null
  const inspectedPromptContent = inspectedPromptId
    ? promptOverrides[inspectedPromptId]?.content ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[inspectedPromptId].content
    : ''
  const inspectedOutput = inspectedPromptId && researchDocument ? researchDocument[inspectedPromptId] : null
  const variablePreview = (value: string | null | undefined, max = 120): string | null => {
    if (typeof value !== 'string' || !value.trim()) return null
    const text = value.trim().replace(/\s+/gu, ' ')
    return text.length > max ? `${text.slice(0, max)}…` : text
  }
  // Mirrors the executor's variable mapping so the inspector can show where
  // each prompt input came from and what was actually available.
  const describeResearchVariable = (name: string): { source: string; value: string | null } => {
    const firstEpisode = researchDocument?.episodes_used?.[0] ?? null
    switch (name) {
      case 'client_name': return { source: 'Client profile', value: variablePreview(clientName) }
      case 'client_bio': return { source: 'Client profile', value: variablePreview(clientBio) }
      case 'client_linkedin_url': return { source: 'Client profile', value: 'Mapped at run time' }
      case 'client_website': return { source: 'Client profile', value: 'Mapped at run time' }
      case 'podcast_name': return { source: 'Podcast catalog', value: variablePreview(podcast?.podcast_name) }
      case 'podcast_url': return { source: 'Podcast catalog', value: variablePreview(podcast?.podcast_url) }
      case 'podcast_description': return { source: 'Podcast catalog', value: variablePreview(podcast?.podcast_description) }
      case 'last_posted_at': return { source: 'Podcast catalog', value: latestActivityAt ? formatPodcastDate(latestActivityAt) : null }
      case 'episode_title': return { source: 'Stored episode capture (Podscan)', value: variablePreview(latestEpisode?.title) ?? variablePreview(firstEpisode?.title) }
      case 'episode_description': return { source: 'Stored episode capture (Podscan)', value: variablePreview(latestEpisode?.description) ?? (firstEpisode ? 'Stored at run time' : null) }
      case 'episode_transcript': return {
        source: 'Latest episode transcript',
        value: variablePreview(researchDocument?.episode_transcript_excerpt)
          ?? (firstEpisode?.had_transcript ? 'Full transcript at run time' : null),
      }
      case 'research_report': return { source: 'Output of “Reading the podcast profile”', value: variablePreview(researchDocument?.podcast_research) }
      case 'recent_guest_name': return { source: 'Guest verification stage', value: variablePreview(researchDocument?.recent_guest_name) }
      default: return { source: 'Mapped at run time', value: 'Mapped at run time' }
    }
  }
  const effectivePromptContent = (promptId: ResearchPromptId): string =>
    promptOverrides[promptId]?.content ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].content
  const selectedPromptDefault = RESEARCH_PROMPT_DEFAULTS_BY_ID[selectedPromptId]
  const selectedPromptCustomized = Boolean(promptOverrides[selectedPromptId])
  const promptDirty = promptDraft !== effectivePromptContent(selectedPromptId)
  const customPromptCount = RESEARCH_PROMPT_DEFAULTS.filter((prompt) => promptOverrides[prompt.id]).length

  const savePromptMutation = useMutation({
    mutationFn: ({ promptId, content }: { promptId: ResearchPromptId; content: string }) =>
      setWorkspaceResearchPrompt(workspaceId, promptId, content),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-prompts', workspaceId] })
      toast.success(`${RESEARCH_PROMPT_DEFAULTS_BY_ID[variables.promptId].label} prompt saved for this workspace.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be saved.')
    },
  })
  const resetPromptMutation = useMutation({
    mutationFn: (promptId: ResearchPromptId) => resetWorkspaceResearchPrompt(workspaceId, promptId),
    onSuccess: (_result, promptId) => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-prompts', workspaceId] })
      setPromptDraft(RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].content)
      toast.success(`${RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].label} restored to the default prompt.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be reset.')
    },
  })
  const promptBusy = savePromptMutation.isPending || resetPromptMutation.isPending

  // Keep the draft in sync with saved overrides unless the owner is mid-edit.
  useEffect(() => {
    if (promptTouched) return
    const effective = promptOverrides[selectedPromptId]?.content
      ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[selectedPromptId].content
    setPromptDraft(effective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptOverridesQuery.data, selectedPromptId, promptTouched])

  useEffect(() => {
    if (!open) {
      setActiveStep('email')
      setEmailRoute('podcast')
      setShowPodcastDetails(false)
      setShowResearchSteps(false)
      setInspectedStageId(null)
      setShowPromptSettings(false)
      setSelectedAngleIndex(0)
      setActiveSequenceEmail('opening')
      setHostName('')
      setContactEmail('')
      setDraft(emptyDraft())
      setSavedDraft(emptyDraft())
    }
  }, [open])

  useEffect(() => {
    if (!open || !podcast || campaignQuery.isLoading) return
    const initial = buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio })
    const savedContactEmail = target?.contact_email?.trim() || ''
    setHostName(storedEmailUnlock?.host_name || target?.host_name || podcast.publisher_name || '')
    if (emailAlreadyUnlocked) {
      setContactEmail(unlockedEmail)
      setEmailRoute('waterfall')
    } else if (emailSearchRunning) {
      setContactEmail('')
      setEmailRoute('waterfall')
    } else {
      setContactEmail(savedContactEmail || publicPodcastEmail)
      setEmailRoute(
        publicPodcastEmail
        && (!savedContactEmail || savedContactEmail.toLowerCase() === publicPodcastEmail.toLowerCase())
          ? 'podcast'
          : 'waterfall',
      )
    }
    const nextDraft = {
      researchNotes: target?.research_notes || initial.researchNotes,
      subject: target?.pitch_subject || initial.subject,
      pitchBody: target?.pitch_body || initial.pitchBody,
      followUpOneSubject: target?.follow_up_1_subject || initial.followUpOneSubject,
      followUpOneBody: target?.follow_up_1_body || initial.followUpOneBody,
      followUpTwoSubject: target?.follow_up_2_subject || initial.followUpTwoSubject,
      followUpTwoBody: target?.follow_up_2_body || initial.followUpTwoBody,
    }
    setDraft(nextDraft)
    setSavedDraft(nextDraft)
  }, [campaignQuery.isLoading, clientBio, clientName, emailAlreadyUnlocked, emailSearchRunning, open, podcast, publicPodcastEmail, storedEmailUnlock?.host_name, target, unlockedEmail])

  const updateDraft = (field: keyof PodcastCampaignSequenceDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }
  const beginEmailSearchPreview = () => {
    if (!podcast || emailSearchMutation.isPending) return
    setEmailRoute('waterfall')
    setContactEmail('')
    setPreviewEmailSearchPodcastId(podcast.podcast_id)
    emailSearchMutation.mutate(podcast.id)
  }
  const selectPromptStage = (promptId: ResearchPromptId) => {
    if (promptDirty) {
      toast.info('Save or discard the current prompt changes before switching stages.')
      return
    }
    setSelectedPromptId(promptId)
    setPromptTouched(false)
    setPromptDraft(effectivePromptContent(promptId))
  }
  const togglePromptSettings = () => {
    if (showPromptSettings && promptDirty) {
      toast.info('Save or discard the current prompt changes before closing the editor.')
      return
    }
    setShowPromptSettings((current) => !current)
  }
  const discardPromptChanges = () => {
    setPromptTouched(false)
    setPromptDraft(effectivePromptContent(selectedPromptId))
  }
  const savePromptChanges = () => {
    const prompt = promptDraft.trim()
    if (!prompt || promptBusy) return
    setPromptTouched(false)
    savePromptMutation.mutate({ promptId: selectedPromptId, content: prompt })
  }
  const restorePromptDefault = () => {
    if (promptBusy) return
    setPromptTouched(false)
    if (selectedPromptCustomized) {
      resetPromptMutation.mutate(selectedPromptId)
    } else {
      setPromptDraft(selectedPromptDefault.content)
    }
  }
  const beginResearchRegeneration = () => {
    if (!podcast) return
    if (promptDirty) {
      toast.info('Save or discard the current prompt changes before regenerating research.')
      setActiveStep('research')
      setShowPromptSettings(true)
      return
    }
    if (researchWorking) {
      toast.info('Research is already running for this podcast.')
      return
    }
    setShowPromptSettings(false)
    setShowResearchSteps(true)
    setActiveStep('research')
    runResearchMutation.mutate(podcast.id)
    toast.info('Research started — running your saved workspace prompts against live podcast data.')
  }
  const choosePitchAngle = (angleIndex: number) => {
    setSelectedAngleIndex(angleIndex)
    if (!podcast) return
    const nextDraft = buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio, angleIndex })
    const cached = aiPitches[pitchKey(podcast.id, angleIndex)]
    const selectedDraft = {
      ...nextDraft,
      ...(cached ? { subject: cached.subject, pitchBody: cached.body } : {}),
      researchNotes: draft.researchNotes || nextDraft.researchNotes,
    }
    setDraft(selectedDraft)
    setSavedDraft(selectedDraft)
    if (!cached) void loadAiPitch(angleIndex)
  }
  const normalizedEmail = contactEmail.trim().toLowerCase()
  const emailReady = validEmail(normalizedEmail)
  const sequenceComplete = [
    draft.subject,
    draft.pitchBody,
    draft.followUpOneBody,
    draft.followUpTwoBody,
  ].every(fieldComplete)
  const sequenceEmailReady: Record<SequenceEmailStep, boolean> = {
    opening: fieldComplete(draft.subject) && fieldComplete(draft.pitchBody),
    follow_up_one: fieldComplete(draft.followUpOneBody),
    follow_up_two: fieldComplete(draft.followUpTwoBody),
  }
  const activeSequenceEmailStep = sequenceEmailSteps.find((step) => step.id === activeSequenceEmail) || sequenceEmailSteps[0]
  const draftHasUnsavedEdits = (Object.keys(draft) as Array<keyof PodcastCampaignSequenceDraft>)
    .some((field) => draft[field] !== savedDraft[field])
  const saveDraftEdits = () => {
    setSavedDraft({ ...draft })
    toast.success('Pitch edits saved in this workspace.')
  }

  const prepareMutation = useMutation({
    mutationFn: () => {
      if (!podcast) throw new Error('Choose a podcast first.')
      return prepareWorkspaceCampaignPodcast({
        workspaceId,
        clientId,
        shortlistPodcastId: podcast.id,
        researchNotes: draft.researchNotes,
        hostName: hostName.trim(),
        contactEmail: normalizedEmail,
        subject: draft.subject,
        pitchBody: draft.pitchBody,
        followUpOneSubject: buildThreadReplySubject(draft.subject),
        followUpOneBody: draft.followUpOneBody,
        followUpTwoSubject: buildThreadReplySubject(draft.subject),
        followUpTwoBody: draft.followUpTwoBody,
      })
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
      ])
      toast.success(result.added
        ? `${podcast?.podcast_name || 'Podcast'} was sent to Client Campaign.`
        : `${podcast?.podcast_name || 'Podcast'} was updated in Client Campaign.`)
      onPrepared?.()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The pitch could not be sent to Client Campaign.'),
  })

  const submitDisabled = !podcast
    || !mappedCampaign
    || locked
    || !sequenceComplete
    || draftHasUnsavedEdits
    || prepareMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-5 pr-12 text-left sm:px-6 sm:pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Approved podcast</Badge>
            <Badge variant="secondary">Pitch workspace</Badge>
            {campaign && <Badge variant="outline">{campaign.name}</Badge>}
          </div>
          <DialogTitle className="text-2xl">Write a pitch for {podcast?.podcast_name || 'this podcast'}</DialogTitle>
          <DialogDescription>Find the right contact, research the show, and then write a thoughtful outreach sequence for {clientName}. Nothing sends from this modal.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {campaignQuery.isLoading ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the pitch workspace…</p></div>
          ) : locked ? (
            <div className="m-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              {previouslyContacted ? <MailCheck className="h-9 w-9 text-sky-600" /> : <Send className="h-9 w-9 text-sky-600" />}
              <h3 className="mt-4 text-lg font-semibold">{previouslyContacted ? 'This podcast was already contacted' : 'This podcast is already in outreach'}</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{previouslyContacted ? 'Earlier outreach history for this client is preserved, so Scout will not create a duplicate campaign sequence.' : 'The sequence is locked so active Instantly outreach cannot be changed accidentally.'}</p>
              {previouslyContacted ? <Button className="mt-5" onClick={() => onOpenChange(false)}>Close</Button> : <Button asChild className="mt-5"><Link to={campaignHref}>View outreach</Link></Button>}
            </div>
          ) : podcast ? (
            <div>
              <div className="border-b bg-muted/10 px-5 py-4 sm:px-6">
                <section aria-labelledby="pitch-podcast-context-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted shadow-sm">
                        {podcastImageUrl
                          ? <img src={podcastImageUrl} alt="" className="h-full w-full object-cover" />
                          : <Radio className="h-7 w-7 text-muted-foreground/60" />}
                      </div>
                      <div className="min-w-0">
                        <p id="pitch-podcast-context-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Podcast context</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="text-lg font-semibold leading-tight">{podcast.podcast_name}</h3>
                          <span className="text-muted-foreground" aria-hidden="true">·</span>
                          <p className="text-sm text-muted-foreground">{podcast.publisher_name || 'Publisher unavailable'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-expanded={showPodcastDetails}
                        aria-controls="pitch-podcast-details"
                        onClick={() => setShowPodcastDetails((current) => !current)}
                      >
                        {showPodcastDetails ? 'Hide details' : 'Show details'}
                        <ChevronDown className={`ml-2 h-3.5 w-3.5 transition-transform ${showPodcastDetails ? 'rotate-180' : ''}`} />
                      </Button>
                      {podcastUrl && <Button asChild variant="outline" size="sm"><a href={podcastUrl} target="_blank" rel="noreferrer">Open show<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>}
                    </div>
                  </div>

                  {showPodcastDetails && (
                    <div id="pitch-podcast-details" className="border-t">
                      <section aria-labelledby="pitch-show-overview-heading" className="px-4 py-4 sm:px-5">
                        <div className="flex items-center gap-2"><FileSearch className="h-4 w-4 text-primary" /><h4 id="pitch-show-overview-heading" className="font-semibold">Show overview</h4></div>
                        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{podcast.ai_clean_description || podcast.podcast_description || 'No show overview has been saved yet.'}</p>
                      </section>

                      <div className="grid border-t lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
                        <section aria-labelledby="pitch-host-and-show-heading" className="border-b px-4 py-4 sm:px-5 lg:border-b-0 lg:border-r">
                          <div className="flex items-center gap-2"><Mic2 className="h-4 w-4 text-primary" /><h4 id="pitch-host-and-show-heading" className="font-semibold">Host and show</h4></div>
                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                            <div><dt className="text-xs text-muted-foreground">Host or publisher on record</dt><dd className="mt-1 font-medium">{latestEpisode?.hosts?.length ? latestEpisode.hosts.map((host) => host.name).join(' & ') : podcast.host_name || podcast.publisher_name || 'Not identified yet'}</dd></div>
                            <div><dt className="text-xs text-muted-foreground">Latest activity</dt><dd className="mt-1 font-medium">{latestActivityAt ? formatPodcastDate(latestActivityAt) : episodeMetadataQuery.isLoading ? 'Checking…' : '—'}</dd></div>
                            <div className="sm:col-span-2 lg:col-span-1">
                              <dt className="text-xs text-muted-foreground">Latest episode</dt>
                              <dd className="mt-1 font-medium">
                                {latestEpisode
                                  ? latestEpisode.title
                                  : episodeMetadataQuery.isLoading ? 'Checking…' : 'Not available yet'}
                              </dd>
                              {latestEpisode?.posted_at && (
                                <p className="mt-0.5 text-xs text-muted-foreground">Released {formatPodcastDate(latestEpisode.posted_at)}</p>
                              )}
                              {(latestEpisode?.guests?.length ?? 0) > 0 && (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Guest: {latestEpisode!.guests!.map((guest) => [guest.name, [guest.role, guest.company].filter(Boolean).join(', ')].filter(Boolean).join(' — ')).join(' · ')}
                                </p>
                              )}
                            </div>
                          </dl>
                        </section>

                        <section aria-labelledby="pitch-audience-snapshot-heading" className="px-4 py-4 sm:px-5">
                          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h4 id="pitch-audience-snapshot-heading" className="font-semibold">Audience snapshot</h4></div>
                          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4 lg:grid-cols-2">
                            <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Estimated audience</p><p className="mt-1 text-base font-semibold">{compactNumber(podcast.audience_size)}</p></div>
                            <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Apple rating</p><p className="mt-1 text-base font-semibold">{podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—'}</p></div>
                            <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Episode library</p><p className="mt-1 text-base font-semibold">{podcast.episode_count?.toLocaleString() || '—'}</p></div>
                            <div><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Primary themes</p><div className="mt-1.5 flex flex-wrap gap-1.5">{podcast.podcast_categories?.length
                              ? podcast.podcast_categories.slice(0, 3).map((category) => <Badge key={category.category_id} variant="secondary" className="font-normal">{category.category_name}</Badge>)
                              : latestEpisode?.topics?.length
                                ? latestEpisode.topics.slice(0, 3).map((topic) => <Badge key={topic} variant="secondary" className="font-normal">{topic}</Badge>)
                                : <span className="text-sm font-medium">—</span>}</div></div>
                          </div>
                        </section>
                      </div>

                      {fitReasons.length > 0 && (
                        <section aria-labelledby="pitch-podcast-fit-heading" className="border-t px-4 py-4 sm:px-5">
                          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h4 id="pitch-podcast-fit-heading" className="font-semibold">Why {clientName} fits</h4></div>
                          <div className="mt-3 grid gap-3 lg:grid-cols-2">
                            {fitReasons.slice(0, 4).map((reason) => <p key={reason} className="rounded-xl border bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">{reason}</p>)}
                          </div>
                        </section>
                      )}

                      {podcast.feedback_notes && (
                        <div className="flex gap-3 border-t border-emerald-100 bg-emerald-50/60 px-4 py-3 sm:px-5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                          <p className="text-sm leading-5 text-emerald-950"><span className="font-semibold">Client note:</span> “{podcast.feedback_notes}”</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>

              <nav aria-label="Pitch workflow steps" className="grid gap-2 border-b bg-muted/20 px-5 py-4 sm:grid-cols-3 sm:px-6">
                {pitchSteps.map((item) => {
                  const active = activeStep === item.id
                  const lockedUntilEmail = item.id !== 'email' && !emailReady
                  const lockedUntilResearch = item.id === 'pitch' && !researchComplete
                  const lockedStepLabel = lockedUntilEmail
                    ? `Step ${item.step}: ${item.title} locked until an email is ready`
                    : lockedUntilResearch
                      ? `Step ${item.step}: ${item.title} locked until research is complete`
                      : `Go to step ${item.step}: ${item.title}`
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={lockedStepLabel}
                      aria-current={active ? 'step' : undefined}
                      disabled={lockedUntilEmail || lockedUntilResearch}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/40 hover:bg-muted/30'}`}
                      onClick={() => setActiveStep(item.id)}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.step}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{lockedUntilEmail ? 'Email required first' : lockedUntilResearch ? 'Research must finish first' : item.detail}</span></span>
                    </button>
                  )
                })}
              </nav>

              {activeStep === 'email' && (
                <div className="mx-auto max-w-4xl p-5 sm:p-8">
                  <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="border-b bg-gradient-to-br from-primary/10 via-primary/5 to-background p-5 sm:p-6">
                      <div className="flex gap-3">
                        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Mail className="h-5 w-5" /></div>
                        <div><Badge variant="secondary">Step 1</Badge><h3 className="mt-2 text-xl font-semibold">Find the email</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">A valid email is required before research. Use the free Podscan inbox, try a deeper direct-host search, or enter an address you already have.</p></div>
                      </div>
                    </div>

                    <div className="space-y-6 p-5 sm:p-6">
                      <div>
                        <div className="mb-5 flex gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-sky-950">
                          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
                          <div><p className="text-sm font-semibold">One shared contact network</p><p className="mt-1 text-xs leading-5 text-sky-900/80">Free Podscan inboxes and verified direct contacts are shared across the Database. If this podcast has already been unlocked, it is reused for 0 credits.</p></div>
                        </div>
                        <p className="text-sm font-semibold">Choose an email path</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the route you want. Podscan supplies the free show inbox; the robust route identifies and verifies a direct host contact.</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <button
                            type="button"
                            aria-label="Use free podcast email"
                            aria-pressed={emailRoute === 'podcast'}
                            disabled={!publicPodcastEmail}
                            className={`relative flex min-h-64 flex-col rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${emailRoute === 'podcast' ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20' : 'bg-background hover:border-primary/40 hover:bg-muted/20'}`}
                            onClick={() => {
                              setEmailRoute('podcast')
                              setContactEmail(publicPodcastEmail)
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700"><Mail className="h-5 w-5" /></div>
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Free · Podscan</Badge>
                            </div>
                            <h4 className="mt-4 font-semibold">Use the free podcast inbox</h4>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the address supplied with the podcast by Podscan. It is always free and shared globally, but may route to a general show inbox.</p>
                            <div className="mt-4 rounded-xl border bg-background px-3 py-2.5">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Free Podscan inbox</p>
                              <p className="mt-1 truncate text-sm font-medium">{publicPodcastEmail || 'No public email found'}</p>
                            </div>
                            <div className="mt-auto flex items-center gap-2 pt-4 text-xs font-medium text-muted-foreground">
                              {emailRoute === 'podcast' && publicPodcastEmail ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <span className="h-4 w-4 rounded-full border" />}
                              {publicPodcastEmail ? (emailRoute === 'podcast' ? 'Selected' : 'Use this email') : 'Unavailable for this show'}
                            </div>
                          </button>

                          <button
                            type="button"
                            aria-label="Try waterfall enrichment"
                            aria-pressed={emailRoute === 'waterfall'}
                            className={`relative flex min-h-64 flex-col rounded-2xl border p-5 text-left transition-all ${emailRoute === 'waterfall' ? 'border-violet-500 bg-violet-50/50 shadow-sm ring-1 ring-violet-200' : 'bg-background hover:border-violet-300 hover:bg-violet-50/20'}`}
                            onClick={() => {
                              setEmailRoute('waterfall')
                              setContactEmail(emailAlreadyUnlocked ? unlockedEmail : '')
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700">{emailAlreadyUnlocked ? <CheckCircle2 className="h-5 w-5" /> : emailSearchRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : emailSearchHasNoResult ? <AlertCircle className="h-5 w-5" /> : <Search className="h-5 w-5" />}</div>
                              <div className="flex flex-col items-end gap-1.5">
                                <Badge className="border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100">{emailAlreadyUnlocked ? 'Globally unlocked' : emailSearchRunning ? 'Global search in progress' : emailSearchHasNoResult ? 'No result yet' : 'Recommended'}</Badge>
                                <span className="text-[11px] font-semibold text-violet-800">{emailAlreadyUnlocked ? '0 additional credits' : emailSearchRunning ? 'Safe to close' : emailSearchHasNoResult ? 'You were not charged' : '1 credit on success'}</span>
                              </div>
                            </div>
                            <h4 className="mt-4 font-semibold">{emailAlreadyUnlocked ? 'Use the direct host email' : emailSearchRunning ? 'Finding the direct host email' : emailSearchHasNoResult ? 'No direct email found yet' : "Find the host's direct email"}</h4>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{emailAlreadyUnlocked
                              ? 'A verified direct contact for this podcast is already in the Database. It can be reused for every client and campaign.'
                              : emailSearchRunning
                                ? 'One platform-wide search is running for this podcast. It keeps going if you close this modal, and another workspace cannot start or pay for a duplicate lookup.'
                                : emailSearchHasNoResult
                                  ? storedEmailUnlock?.message || 'The last search did not return a verified direct email. Use the public inbox, enter your own address, or try again.'
                                  : 'Run a waterfall search to identify the host and verify a work or personal address—the stronger route for reply potential.'}</p>
                            {emailAlreadyUnlocked ? (
                              <div className="mt-4 rounded-xl border border-violet-200 bg-background/80 px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Direct email ready</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{storedEmailUnlock?.unlocked_at ? `First unlocked ${formatPodcastDate(storedEmailUnlock.unlocked_at)}.` : 'Saved to the global contact network.'} Future host and contact refreshes are included for every workspace.</p>
                              </div>
                            ) : emailSearchRunning ? (
                              <div className="mt-4 space-y-2">
                                {visibleEmailUnlockSteps.map((step) => <div key={step.id} className="flex items-center gap-2 text-[11px] font-medium text-violet-900">{step.status === 'complete' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : step.status === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-700" /> : <span className="h-3.5 w-3.5 rounded-full border border-violet-300" />}<span>{step.title}</span><span className="ml-auto text-violet-700/70">{step.status === 'complete' ? 'Done' : step.status === 'active' ? 'In progress' : 'Waiting'}</span></div>)}
                              </div>
                            ) : emailSearchHasNoResult ? (
                              <p className="mt-4 rounded-xl border border-violet-200 bg-background/80 px-3 py-2.5 text-xs leading-5 text-violet-900">No credit was used. A future retry is charged only if it becomes the first successful direct-contact unlock across the entire platform.</p>
                            ) : (
                              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-violet-900">
                                <span className="rounded-full bg-violet-100 px-2.5 py-1">Identify host</span>
                                <ArrowRight className="h-3 w-3 text-violet-400" />
                                <span className="rounded-full bg-violet-100 px-2.5 py-1">Confirm identity</span>
                                <ArrowRight className="h-3 w-3 text-violet-400" />
                                <span className="rounded-full bg-violet-100 px-2.5 py-1">Verify email</span>
                              </div>
                            )}
                            <div className="mt-auto flex items-center gap-2 pt-4 text-xs font-medium text-violet-800">
                              {emailRoute === 'waterfall' ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-violet-300" />}
                              {emailRoute === 'waterfall' ? emailAlreadyUnlocked ? 'Selected · ready to use' : emailSearchRunning ? 'Selected · search continues' : 'Selected' : emailAlreadyUnlocked ? 'Use unlocked contact' : emailSearchRunning ? 'View search progress' : 'Try for a better contact'}
                            </div>
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label="Enter email manually"
                          aria-pressed={emailRoute === 'manual'}
                          className={`mt-4 flex w-full flex-col gap-3 rounded-xl border p-4 text-left transition-all sm:flex-row sm:items-center ${emailRoute === 'manual' ? 'border-slate-500 bg-slate-50 shadow-sm ring-1 ring-slate-200' : 'bg-background hover:border-slate-300 hover:bg-muted/20'}`}
                          onClick={() => {
                            setEmailRoute('manual')
                            if ([publicPodcastEmail, unlockedEmail].filter(Boolean).some((email) => contactEmail.trim().toLowerCase() === email.toLowerCase())) setContactEmail('')
                          }}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><PenLine className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Enter an email manually</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Use a host or producer email you found yourself. No credits are used.</span></span>
                          <span className="flex shrink-0 items-center gap-2"><Badge variant="outline">0 credits</Badge>{emailRoute === 'manual' && <CheckCircle2 className="h-4 w-4 text-slate-700" />}</span>
                        </button>

                        {emailRoute === 'manual' && (
                          <div className="mt-4 rounded-xl border bg-slate-50/70 p-4">
                            <Label htmlFor="campaign-manual-email">Email address</Label>
                            <Input
                              id="campaign-manual-email"
                              type="email"
                              value={contactEmail}
                              onChange={(event) => setContactEmail(event.target.value)}
                              maxLength={254}
                              placeholder="host@podcast.com"
                              aria-invalid={Boolean(normalizedEmail) && !emailReady}
                              aria-describedby="campaign-manual-email-help"
                              required
                              className="mt-2 bg-background"
                            />
                            <p id="campaign-manual-email-help" className={`mt-2 text-xs ${emailReady ? 'text-emerald-700' : normalizedEmail ? 'text-destructive' : 'text-muted-foreground'}`}>{emailReady ? 'Email ready. You can continue to Research.' : normalizedEmail ? 'Enter a valid email address.' : 'A valid email is required to unlock Research.'}</p>
                          </div>
                        )}
                      </div>

                      {emailRoute === 'waterfall' && (
                        emailAlreadyUnlocked ? (
                          <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div><p className="text-sm font-semibold text-emerald-950">Globally unlocked direct email · 0 credits</p><p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-900/75">Another successful lookup already paid for this contact. It is permanently available to every workspace, client, and campaign, with future verification refreshes included.</p></div></div>
                          </div>
                        ) : emailSearchRunning ? (
                          <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                            <div className="flex gap-3"><Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-violet-700" /><div><p className="text-sm font-semibold text-violet-950">Direct email search in progress</p><p className="mt-1 max-w-3xl text-xs leading-5 text-violet-900/75">You can safely close this modal. The search continues in the background, and reopening this podcast returns to the same job without reserving or charging another credit.</p></div></div>
                          </div>
                        ) : emailSearchHasNoResult ? (
                          <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">No verified direct email · No charge</p><p className="mt-1 max-w-2xl text-xs leading-5 text-amber-900/75">Try again, use the free Podscan inbox, or enter an address manually. A credit is eligible only for the first successful global unlock.</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-200 bg-background text-amber-950" onClick={beginEmailSearchPreview}>Try search again</Button></div>
                          </div>
                        ) : (
                          <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex gap-3">
                                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                                <div><p className="text-sm font-semibold text-violet-950">Robust lookup · 1 credit on first global success</p><p className="mt-1 max-w-2xl text-xs leading-5 text-violet-900/75">We check the global contact network first. Only a true global miss starts host identification and verification; no verified direct email means no credit is charged.</p></div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline" size="sm" className="border-violet-200 bg-background text-violet-900 hover:bg-violet-100"><Link to="/app/settings/billing" target="_blank" rel="noreferrer"><Coins className="mr-2 h-3.5 w-3.5" />Buy credits in Billing<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button><Button type="button" size="sm" onClick={beginEmailSearchPreview}><Search className="mr-2 h-3.5 w-3.5" />Start direct email search</Button></div>
                            </div>
                            <p className="mt-3 border-t border-violet-200/70 pt-3 text-[11px] font-medium leading-5 text-violet-800">Once successfully unlocked in the Database, this podcast never costs another direct-email credit. Billing opens in a new tab so this pitch stays here.</p>
                          </div>
                        )
                      )}

                      {!emailReady && !publicPodcastEmail && !emailSearchRunning && (
                        <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div><p className="text-sm font-semibold">No usable email?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Archive this podcast instead of moving an incomplete contact into research.</p></div>
                          <Button type="button" variant="outline" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={onArchive}><Archive className="mr-2 h-4 w-4" />Archive podcast</Button>
                        </div>
                      )}

                    </div>
                  </section>
                </div>
              )}

              {activeStep === 'research' && (
                <div className="mx-auto max-w-5xl p-5 sm:p-8">
                  <section aria-labelledby="campaign-research-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="border-b bg-gradient-to-br from-sky-50 via-primary/5 to-background p-5 sm:p-6">
                      <div className="flex gap-3">
                        <div className="h-fit rounded-xl bg-sky-100 p-2.5 text-sky-700"><FileSearch className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Step 2</Badge>
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 className="mr-1 h-3 w-3" />Included with your plan</Badge>
                          </div>
                          <h3 id="campaign-research-heading" className="mt-2 text-xl font-semibold">Research and Pitch</h3>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Review the show, its audience, and the strongest reasons to feature {clientName} before choosing the angle for the pitch.</p>
                        </div>
                      </div>

                      <div className={`mt-5 overflow-hidden rounded-xl border ${researchComplete ? 'border-emerald-200 bg-emerald-50/70' : researchFailed ? 'border-destructive/25 bg-destructive/5' : 'border-sky-200 bg-sky-50/70'}`}>
                        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex gap-3">
                            {researchComplete && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />}
                            {researchWorking && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-700" />}
                            {researchFailed && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                            <div aria-live="polite">
                              <p className={`text-sm font-semibold ${researchComplete ? 'text-emerald-950' : researchFailed ? 'text-destructive' : 'text-sky-950'}`}>{researchStatusTitle}</p>
                              <p className={`mt-1 text-xs leading-5 ${researchComplete ? 'text-emerald-900/75' : researchFailed ? 'text-destructive/80' : 'text-sky-900/75'}`}>{researchStatusDetail}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                            <p className={`hidden text-xs font-medium lg:block ${researchComplete ? 'text-emerald-800' : researchFailed ? 'text-destructive' : 'text-sky-800'}`}>
                              {researchComplete
                                ? podcast.ai_analyzed_at ? `Last researched ${formatPodcastDate(podcast.ai_analyzed_at)}` : 'Saved to your workspace'
                                : researchFailed ? 'Completed work saved' : researchRegenerating ? 'Running prompts in order' : 'Working in the background'}
                            </p>
                            {canManageCampaigns && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="bg-background"
                                disabled={researchWorking}
                                title="Reruns all six research stages using the saved prompt for each stage"
                                onClick={beginResearchRegeneration}
                              >
                                {researchRegenerating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                                {researchRegenerating ? 'Regenerating' : researchWorking ? 'Research running' : 'Regenerate'}
                              </Button>
                            )}
                            {canCustomizePrompts && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="bg-background"
                                disabled={researchRegenerating}
                                aria-expanded={showPromptSettings}
                                aria-controls="campaign-research-prompt-settings"
                                onClick={togglePromptSettings}
                              >
                                <PenLine className="mr-2 h-3.5 w-3.5" />
                                {showPromptSettings ? 'Close prompt editor' : 'Edit stage prompts'}
                              </Button>
                            )}
                            {researchComplete && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-emerald-200 bg-background text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950"
                                aria-expanded={researchStepsExpanded}
                                aria-controls="campaign-research-progress-steps"
                                onClick={() => setShowResearchSteps((current) => !current)}
                              >
                                {showResearchSteps ? 'Hide steps' : 'View steps'}
                                <ChevronDown className={`ml-2 h-3.5 w-3.5 transition-transform ${showResearchSteps ? 'rotate-180' : ''}`} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {researchStepsExpanded && (
                          <div id="campaign-research-progress-steps" className="border-t bg-background/80">
                            <ol aria-label="Podcast research progress" className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
                              {visibleResearchSteps.map((step) => {
                                const inspectable = researchComplete && step.status === 'complete'
                                const inspected = inspectedStageId === step.id
                                return (
                                  <li key={step.id} className="bg-background">
                                    <button
                                      type="button"
                                      disabled={!inspectable}
                                      aria-expanded={inspectable ? inspected : undefined}
                                      aria-controls={inspectable ? 'campaign-research-stage-inspector' : undefined}
                                      title={inspectable ? 'Open the stored output of this stage' : undefined}
                                      className={`flex h-full w-full gap-3 p-4 text-left transition-colors ${inspectable ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default'} ${inspected ? 'bg-primary/5' : ''}`}
                                      onClick={() => {
                                        if (!inspectable) return
                                        setInspectedStageId((current) => (current === step.id ? null : step.id))
                                      }}
                                    >
                                      {step.status === 'complete' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                                      {step.status === 'active' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
                                      {step.status === 'queued' && <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/25" />}
                                      {step.status === 'failed' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                                      <div>
                                        <div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-semibold text-foreground">{step.title}</p><span className={`text-[10px] font-semibold ${step.status === 'complete' ? 'text-emerald-700' : step.status === 'active' ? 'text-primary' : step.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{step.status === 'complete' ? 'Done' : step.status === 'active' ? 'In progress' : step.status === 'failed' ? 'Needs attention' : 'Waiting'}</span></div>
                                        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{step.detail}</p>
                                        {inspectable && (
                                          <p className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold ${inspected ? 'text-primary' : 'text-muted-foreground'}`}>
                                            <FileSearch className="h-3 w-3" />
                                            {inspected ? 'Hide output' : 'Inspect output'}
                                          </p>
                                        )}
                                      </div>
                                    </button>
                                  </li>
                                )
                              })}
                            </ol>
                            {inspectedStage && inspectedPromptId && (
                              <div id="campaign-research-stage-inspector" className="border-t bg-background px-4 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-semibold text-foreground">{inspectedStage.title} · stored output</p>
                                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                      Written by the “{RESEARCH_PROMPT_DEFAULTS_BY_ID[inspectedPromptId].label}” prompt
                                      {researchDocument?.generated_at ? ` on ${formatPodcastDate(researchDocument.generated_at)}` : ''}. Exactly what later stages received.
                                    </p>
                                  </div>
                                  <Button type="button" variant="ghost" size="sm" onClick={() => setInspectedStageId(null)}>Close</Button>
                                </div>
                                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Variables this prompt received</p>
                                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Prompt input variables">
                                  {promptVariables(inspectedPromptContent).map((name) => {
                                    const variable = describeResearchVariable(name)
                                    return (
                                      <li key={name} className="max-w-full rounded-md border bg-muted/10 px-2 py-1 text-[11px] leading-4">
                                        <code className="font-semibold text-foreground">{`{{${name}}}`}</code>
                                        <span className="text-muted-foreground">{' ← '}{variable.source}</span>
                                        <span className={`block truncate ${variable.value ? 'text-foreground/70' : 'italic text-muted-foreground'}`}>
                                          {variable.value || 'Not available for this run'}
                                        </span>
                                      </li>
                                    )
                                  })}
                                </ul>
                                {researchDocumentQuery.isLoading ? (
                                  <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/10 p-3 text-xs text-muted-foreground">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the stored research…
                                  </div>
                                ) : inspectedOutput ? (
                                  <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/10 p-3 font-sans text-xs leading-5 text-foreground/90">{inspectedOutput}</pre>
                                ) : (
                                  <p className="mt-3 rounded-lg border border-dashed bg-muted/10 p-3 text-xs leading-5 text-muted-foreground">
                                    {researchDocumentQuery.isError
                                      ? 'The stored research could not be loaded. Close and reopen the steps to try again.'
                                      : researchDocument && inspectedPromptId === 'guest_info'
                                        ? 'Guest analysis was skipped for this run — the latest episode had no transcript to verify a guest against.'
                                        : 'No stored output for this stage. It ran before research documents were saved — regenerate research to capture every stage.'}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex gap-2 border-t px-4 py-3 text-[11px] leading-4 text-muted-foreground">
                              {researchWorking ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" /> : researchFailed ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                              <p>{researchWorking
                                ? researchRegenerating
                                  ? 'All six saved workspace prompts run in order. You can safely close this window and return without losing progress.'
                                  : 'Research continues in the background. You can safely close this window and return without losing progress.'
                                : researchFailed
                                  ? 'Completed stages are saved. Retrying can continue from the stage that needs attention.'
                                  : 'Every stage is saved with this podcast, so the research does not need to run again when you return.'}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {showPromptSettings && canCustomizePrompts && (
                        <section id="campaign-research-prompt-settings" aria-labelledby="campaign-research-prompt-heading" className="mt-4 overflow-hidden rounded-xl border bg-background shadow-sm">
                          <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2"><h4 id="campaign-research-prompt-heading" className="text-sm font-semibold">Workspace research prompts</h4><Badge variant="secondary">Owner controls</Badge>{customPromptCount > 0 && <Badge variant="outline">{customPromptCount} customized</Badge>}</div>
                              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Choose a stage and adjust the instructions used the next time research runs. Changes apply across this workspace and do not interrupt research already in progress.</p>
                            </div>
                          </div>

                          <div className="grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                            <nav aria-label="Research prompt stages" className="grid gap-1 border-b bg-muted/10 p-3 sm:grid-cols-2 lg:grid-cols-1 lg:border-b-0 lg:border-r">
                              {RESEARCH_PROMPT_DEFAULTS.map((prompt) => {
                                const selected = prompt.id === selectedPromptId
                                const customized = Boolean(promptOverrides[prompt.id])
                                return (
                                  <button
                                    key={prompt.id}
                                    type="button"
                                    aria-pressed={selected}
                                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border hover:bg-background'}`}
                                    onClick={() => selectPromptStage(prompt.id)}
                                  >
                                    <span className="block text-xs font-semibold">{prompt.label}</span>
                                    <span className={`mt-1 block text-[10px] font-medium ${customized ? 'text-primary' : 'text-muted-foreground'}`}>{customized ? 'Customized' : 'Workspace default'}</span>
                                  </button>
                                )
                              })}
                            </nav>

                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div><p className="text-sm font-semibold">{selectedPromptDefault.label}</p><p className="mt-1 text-xs text-muted-foreground">{selectedPromptDefault.description}</p></div>
                                <Badge variant={selectedPromptCustomized ? 'outline' : 'secondary'} className="w-fit">{selectedPromptCustomized ? 'Custom prompt' : 'Default prompt'}</Badge>
                              </div>
                              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">System instruction (fixed)</p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{selectedPromptDefault.system}</p>
                              </div>
                              <div className="mt-4 space-y-2">
                                <Label htmlFor="campaign-research-stage-prompt">Prompt instructions</Label>
                                <Textarea
                                  id="campaign-research-stage-prompt"
                                  aria-label={`Prompt for ${selectedPromptDefault.label}`}
                                  value={promptDraft}
                                  onChange={(event) => { setPromptTouched(true); setPromptDraft(event.target.value) }}
                                  disabled={promptBusy || promptOverridesQuery.isLoading}
                                  className="min-h-48 resize-y bg-background font-mono text-xs leading-5"
                                  maxLength={20_000}
                                />
                                <p className="text-[11px] leading-5 text-muted-foreground">
                                  Available variables:{' '}
                                  {promptVariables(selectedPromptDefault.content).map((variable, index) => (
                                    <Fragment key={variable}>{index > 0 && ', '}<code>{`{{${variable}}}`}</code></Fragment>
                                  ))}
                                </p>
                              </div>
                              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <Button type="button" variant="ghost" size="sm" disabled={promptBusy} onClick={restorePromptDefault}><RefreshCw className="mr-2 h-3.5 w-3.5" />Restore default</Button>
                                <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" disabled={!promptDirty || promptBusy} onClick={discardPromptChanges}>Discard changes</Button><Button type="button" size="sm" disabled={!promptDirty || !promptDraft.trim() || promptBusy} onClick={savePromptChanges}>{savePromptMutation.isPending ? 'Saving…' : 'Save prompt'}</Button></div>
                              </div>
                            </div>
                          </div>
                        </section>
                      )}
                    </div>

                    <div className="space-y-5 p-5 sm:p-6">
                      <section className="rounded-2xl border p-5">
                        <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><h4 className="font-semibold">Recommended pitch angles</h4></div>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Each direction creates its own opening pitch and two follow-ups. Select an option to compare the complete sequence below.</p>
                        {researchRegenerating && (
                          <div className="mt-4 flex gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-xs leading-5 text-sky-950">
                            <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-sky-700" />
                            <p>Previous options remain visible for reference. Three refreshed sequences will replace them after every saved stage prompt has finished.</p>
                          </div>
                        )}
                        {pitchAngles.length > 0
                          ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{pitchAngles.slice(0, 3).map((angle, index) => <button key={`${angle.title}-${index}`} type="button" aria-label={`Select sequence ${index + 1}: ${angle.title}`} aria-pressed={selectedAngleIndex === index} disabled={researchWorking} className={`relative flex min-h-48 flex-col rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selectedAngleIndex === index ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15' : 'bg-background hover:border-primary/40'}`} onClick={() => choosePitchAngle(index)}><div className="flex items-center justify-between gap-2"><Badge variant="secondary">Option {index + 1}</Badge>{selectedAngleIndex === index && <Badge className="bg-primary text-primary-foreground hover:bg-primary">Selected</Badge>}</div><span className="mt-4 block text-sm font-semibold leading-5">{angle.title}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{angle.description}</span><span className="mt-auto pt-4 text-xs font-semibold text-primary">{researchWorking ? 'Refreshing this sequence' : selectedAngleIndex === index ? 'Previewing this sequence' : 'View this sequence'}</span></button>)}</div>
                          : <p className="mt-3 text-sm leading-6 text-muted-foreground">Three complete sequence options will appear here once the podcast research is ready.</p>}
                      </section>

                      {researchComplete && (
                        <section aria-labelledby="campaign-sequence-preview-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                          <div className="flex flex-col gap-4 border-b bg-gradient-to-br from-violet-50 via-primary/5 to-background p-5 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex gap-3">
                              <div className="h-fit rounded-xl bg-violet-100 p-2.5 text-violet-700"><Send className="h-5 w-5" /></div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2"><h4 id="campaign-sequence-preview-heading" className="font-semibold">Pitch and follow-ups</h4><Badge variant="secondary">Option {Math.min(selectedAngleIndex + 1, sequenceOptionCount)} of {sequenceOptionCount}</Badge><Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-800">Selected sequence</Badge></div>
                                {selectedPitchAngle && <p className="mt-2 text-sm font-medium text-foreground">{selectedPitchAngle.title}</p>}
                                <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Read-only preview. Compare the options above, then continue to Finalize Pitch to edit and save the sequence you prefer.</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4 p-5">
                            <article aria-label="Opening pitch preview" className="rounded-xl border bg-muted/10 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Email 1 · Opening pitch</Badge><span className="text-[11px] font-medium text-muted-foreground">Sends first</span></div>
                              <p className="mt-3 text-sm font-semibold">{draft.subject || 'Opening pitch subject'}</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.pitchBody || 'The personalized opening pitch will appear here when the research is ready.'}</p>
                            </article>

                            <div className="grid gap-4 lg:grid-cols-2">
                              <article aria-label="First follow-up preview" className="rounded-xl border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Email 2 · Follow-up</Badge><span className="text-[11px] font-medium text-muted-foreground">3 days later · Same thread</span></div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.followUpOneBody || 'The first follow-up will appear here.'}</p>
                              </article>

                              <article aria-label="Second follow-up preview" className="rounded-xl border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Email 3 · Close the loop</Badge><span className="text-[11px] font-medium text-muted-foreground">5 days later · Same thread</span></div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.followUpTwoBody || 'The final follow-up will appear here.'}</p>
                              </article>
                            </div>
                          </div>
                        </section>
                      )}

                    </div>
                  </section>
                </div>
              )}

              {activeStep === 'pitch' && (
                <div className="space-y-5 p-5 sm:p-6">
                  {(campaignQuery.error || !mappedCampaign) && (
                    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold">You can finalize the pitch now</p><p className="mt-1 text-xs leading-5 text-amber-900/80">Connect or assign the client campaign before sending this finished sequence to it.</p></div></div>
                      <div className="flex shrink-0 gap-2">{campaignQuery.error && <Button type="button" variant="outline" size="sm" onClick={() => void campaignQuery.refetch()}><RefreshCw className="mr-2 h-3.5 w-3.5" />Retry</Button>}<Button asChild variant="outline" size="sm"><Link to={campaignHref}>Campaign setup</Link></Button></div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div><Badge variant="secondary">Step 3</Badge><h3 className="mt-2 text-xl font-semibold">Finalize the selected pitch</h3><p className="mt-1 text-sm text-muted-foreground">Edit the chosen opening pitch and two follow-ups, then save the finished sequence for outreach.</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className={draftHasUnsavedEdits ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}>{draftHasUnsavedEdits ? 'Unsaved edits' : 'All edits saved'}</Badge>
                      <Button type="button" variant="outline" disabled={!draftHasUnsavedEdits} onClick={saveDraftEdits}><Save className="mr-2 h-4 w-4" />Save edits</Button>
                    </div>
                  </div>

                  <section aria-labelledby="campaign-outreach-sequence-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="border-b bg-muted/20 px-5 py-4">
                      <h4 id="campaign-outreach-sequence-heading" className="font-semibold">Outreach sequence</h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Follow the timeline, then choose an email to review or edit its contents.</p>
                    </div>
                    <nav aria-label="Sequence emails" className="grid items-stretch gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:p-5">
                      {sequenceEmailSteps.map((step, index) => {
                        const selected = activeSequenceEmail === step.id
                        const ready = sequenceEmailReady[step.id]
                        return (
                          <Fragment key={step.id}>
                            <button
                              type="button"
                              aria-label={`Edit ${step.email}: ${step.title}`}
                              aria-pressed={selected}
                              className={`rounded-xl border p-4 text-left transition-colors ${selected ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15' : 'bg-background hover:border-primary/40 hover:bg-muted/20'}`}
                              onClick={() => setActiveSequenceEmail(step.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{index + 1}</span>
                                <div className="flex items-center gap-1.5"><Badge variant="secondary">{step.timing}</Badge>{ready && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={`${step.email} ready`} />}</div>
                              </div>
                              <p className="mt-3 text-xs font-medium text-muted-foreground">{step.email}</p>
                              <p className="mt-1 text-sm font-semibold">{step.title}</p>
                              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{step.detail}</p>
                            </button>
                            {index < sequenceEmailSteps.length - 1 && <div className="flex items-center justify-center text-muted-foreground/50"><ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" aria-hidden="true" /></div>}
                          </Fragment>
                        )
                      })}
                    </nav>
                  </section>

                  <section aria-labelledby="campaign-active-email-heading" className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                    <div className="flex flex-col gap-3 border-b bg-gradient-to-br from-primary/5 to-background px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{activeSequenceEmailStep.email}</Badge><Badge variant="outline">{activeSequenceEmailStep.timing}</Badge><h4 id="campaign-active-email-heading" className="font-semibold">{activeSequenceEmailStep.title}</h4></div>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeSequenceEmail === 'opening' ? 'Your personalized first note to the host or producer.' : activeSequenceEmail === 'follow_up_one' ? 'Wait 3 days, then reply in the original thread. Stop when the host replies.' : 'Wait 5 more days, reply in the same thread, and close respectfully.'}</p>
                      </div>
                      <Badge variant="outline" className={`w-fit ${sequenceEmailReady[activeSequenceEmail] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{sequenceEmailReady[activeSequenceEmail] ? 'Ready' : 'Needs copy'}</Badge>
                    </div>
                    <div className="space-y-4 p-5">
                      {activeSequenceEmail === 'opening' && <><div className="space-y-2"><Label htmlFor="campaign-pitch-subject">Subject</Label><Input id="campaign-pitch-subject" value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} maxLength={300} /></div><div className="space-y-2"><Label htmlFor="campaign-pitch-body">Opening email</Label><Textarea id="campaign-pitch-body" value={draft.pitchBody} onChange={(event) => updateDraft('pitchBody', event.target.value)} className="min-h-72 resize-y" maxLength={20_000} /></div></>}
                      {activeSequenceEmail === 'follow_up_one' && <div className="space-y-2"><Label htmlFor="campaign-follow-up-one-body">Follow-up 1 reply</Label><Textarea id="campaign-follow-up-one-body" value={draft.followUpOneBody} onChange={(event) => updateDraft('followUpOneBody', event.target.value)} className="min-h-64 resize-y" maxLength={20_000} /></div>}
                      {activeSequenceEmail === 'follow_up_two' && <div className="space-y-2"><Label htmlFor="campaign-follow-up-two-body">Follow-up 2 reply</Label><Textarea id="campaign-follow-up-two-body" value={draft.followUpTwoBody} onChange={(event) => updateDraft('followUpTwoBody', event.target.value)} className="min-h-64 resize-y" maxLength={20_000} /></div>}
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {podcast && !locked && !campaignQuery.isLoading && (
          <footer aria-label="Pitch actions" className="shrink-0 border-t bg-muted/20 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
            <div className="flex flex-col gap-4 rounded-2xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                {activeStep === 'email' && (emailReady
                  ? 'Email ready. Research is unlocked.'
                  : emailSearchRunning
                    ? publicPodcastEmail
                      ? 'The global direct-email search is still running. You can close this window or choose the free Podscan inbox while it continues.'
                      : 'The global direct-email search is still running. You can safely close this window and return later.'
                    : 'A valid email is required before you can continue to Research.')}
                {activeStep === 'research' && (researchWorking
                  ? researchRegenerating
                    ? 'Regeneration is running all six saved workspace prompts in order. You can close this window and return without losing progress.'
                    : 'Research is running in the background. You can close this window and return without losing progress.'
                  : researchFailed
                    ? 'Research paused before the pitch could be prepared. Completed stages are saved.'
                    : 'Research is included with your plan, saved to this podcast, and used to shape the pitch.')}
                {activeStep === 'pitch' && (draftHasUnsavedEdits
                  ? 'You have unsaved edits. Save them before sending this sequence to Client Campaign.'
                  : 'All edits are saved. Nothing moves to Client Campaign until you choose Send to Client Campaign.')}
              </p>
              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                {activeStep !== 'email' && <Button type="button" variant="outline" onClick={() => setActiveStep(activeStep === 'pitch' ? 'research' : 'email')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
                {activeStep === 'email' && <Button type="button" disabled={!emailReady} onClick={() => setActiveStep('research')}>Continue to research<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'research' && <Button type="button" disabled={!researchComplete} onClick={() => { setActiveSequenceEmail('opening'); setActiveStep('pitch') }}>Finalize selected pitch<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'pitch' && <Button type="button" disabled={submitDisabled} onClick={() => prepareMutation.mutate()}>{prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send to Client Campaign</Button>}
              </div>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}
