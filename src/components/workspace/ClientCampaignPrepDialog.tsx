import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Trash2,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Coins,
  Copy,
  ExternalLink,
  FileSearch,
  Globe,
  Loader2,
  Lightbulb,
  Mail,
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { buildPodcastCampaignSequenceDraft, buildThreadReplySubject, type PodcastCampaignSequenceDraft } from '@/lib/campaignSequence'
import { AgencyRelationshipNotice, PitchTrustPanel } from '@/components/workspace/PitchQualitySignals'
import { checkPitchCopy } from '@/lib/pitchQuality'
import { campaignErrorGuidance, campaignErrorReport, errorCode, errorStatus } from '@/lib/campaignErrorGuidance'
import { MY_WORKSPACE_BASE_HREF, workspaceModuleHref } from '@/lib/workspaceRoutes'
import { safeExternalUrl } from '@/lib/externalUrl'
import {
  type ClientShortlistEmailUnlockStageId,
  type ClientShortlistPodcast,
  type ClientShortlistResearchStageId,
  ensureClientShortlistEpisodes,
  generateClientShortlistPitch,
  getClientShortlistResearchDocument,
  getPromptPreview,
  refreshClientShortlistEpisodes,
  runClientShortlistEmailSearch,
  runClientShortlistResearch,
} from '@/services/clientShortlist'
import {
  getClientInstantlyCampaignLinks,
  getWorkspaceCampaign,
  prepareWorkspaceCampaignPodcast,
  removeWorkspaceCampaignLead,
} from '@/services/workspaceCampaigns'
import {
  getWorkspacePromptModels,
  setWorkspacePromptModel,
  getWorkspacePromptRequirements,
  getWorkspaceResearchPromptOverrides,
  setWorkspacePromptRequirements,
  getClientSdrPrompts,
  resetClientSdrPrompt,
  setClientSdrPrompt,
} from '@/services/workspaceCampaigns'
import { PromptVariableTextarea } from './PromptVariableTextarea'
import { PromptFieldPreview } from './PromptFieldPreview'
import { PROMPT_VARIABLES } from '@/lib/promptVariables'
import { unavailableVariableIds } from '@/lib/promptVariableMenu'
import { isResearchRunStale } from '@/lib/researchProgress'
import {
  RESEARCH_PROMPT_DEFAULTS,
  RESEARCH_PROMPT_DEFAULTS_BY_ID,
  type ResearchPromptId,
} from '@/lib/researchPromptDefaults'
import { isTargetInActiveOutreach } from '@/lib/campaignTargetState'
import { researchPromptPhases, researchPromptStepNumbers } from '@/lib/researchPromptStages'

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

interface PrepareResult {
  added: boolean
  /**
   * The lead reached Instantly. Without it the podcast is on the campaign list
   * and the copy is saved, but no host exists to receive any of it — a
   * difference the screen used to paper over.
   */
  leadStaged: boolean
  willSend: boolean
  hostName: string
  contactEmail: string
  campaignName: string
}
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

/** A written sequence for one angle, as the editor holds it. */
interface StoredPitch {
  subject: string
  body: string
  followUpOneBody: string | null
  followUpTwoBody: string | null
  auditFlags: string[]
  chainVersion: string | null
}

const sequenceEmailSteps: Array<{ id: SequenceEmailStep; email: string; title: string; timing: string; detail: string }> = [
  { id: 'opening', email: 'Email 1', title: 'Opening pitch', timing: 'Sends first', detail: 'Starts the outreach' },
  { id: 'follow_up_one', email: 'Email 2', title: 'Follow-up', timing: 'Second send', detail: 'Same thread, adds a second angle' },
  { id: 'follow_up_two', email: 'Email 3', title: 'Close the loop', timing: 'Final send', detail: 'Final same-thread reply' },
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

function podcastRelationshipNeedsReview(podcast: ClientShortlistPodcast | null): boolean {
  const relationship = podcast?.agency_relationship
  return Boolean(
    podcast?.prior_outreach_at
    || (relationship && (
      relationship.state !== 'none'
      || relationship.touch_count > 0
      || relationship.same_contact_other_show
      || relationship.manual_stage
      || relationship.summary?.trim()
    )),
  )
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
  // What happened on the last successful send. Held rather than toasted: the
  // operator just created a record in an external system and may have started
  // emailing a stranger, and a notification that disappears is a poor place to
  // learn that.
  const [stagedResult, setStagedResult] = useState<PrepareResult | null>(null)
  // Held rather than toasted. Suppression, a duplicate contact, and a locked
  // pitch are situations to act on, not notifications to catch before they
  // fade, and the operator still has a draft on screen to fix.
  // The code travels with the message so the alert can offer the move that
  // resolves this particular refusal rather than a generic apology. `source`
  // travels with it because sending and removing share this one alert, and a
  // "Try again" that retried the wrong one would email a host the operator was
  // trying to take out of the campaign.
  const [prepareError, setPrepareError] = useState<
    { message: string; code: string | null; status: number | null; source: 'prepare' | 'remove' } | null
  >(null)
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [emailRoute, setEmailRoute] = useState<EmailRoute>('podcast')
  const [previewEmailSearchPodcastId, setPreviewEmailSearchPodcastId] = useState<string | null>(null)
  const [acknowledgedRelationshipPodcastId, setAcknowledgedRelationshipPodcastId] = useState<string | null>(null)
  const relationshipAcknowledged = acknowledgedRelationshipPodcastId === podcast?.podcast_id
  const relationshipNeedsReview = podcastRelationshipNeedsReview(podcast)
  const relationshipSuppressed = podcast?.agency_relationship?.state === 'suppressed'
    || podcast?.agency_relationship?.manual_stage === 'do_not_contact'
  const relationshipReady = !relationshipNeedsReview || relationshipAcknowledged
  const relationshipCanProceed = relationshipReady && !relationshipSuppressed
  const shortlistQueryKey = ['client-shortlist', workspaceId, clientId] as const
  const runResearchMutation = useMutation({
    mutationFn: (shortlistPodcastId: string) => runClientShortlistResearch(
      workspaceId,
      clientId,
      shortlistPodcastId,
      relationshipAcknowledged,
      // The run hands itself on between stages to stay inside the platform's
      // two-minute ceiling, so the steps are refreshed as each invocation
      // returns rather than only when the last one does.
      () => {
        void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      },
    ),
    onMutate: () => {
      // The shortlist poll only activates once it sees a running status, so
      // refresh shortly after the backend writes its first progress row.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
        // Whatever just changed for this podcast, the editor's field values
        // changed with it.
        void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
      }, 2_500)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      // Whatever just changed for this podcast, the editor's field values
      // changed with it.
      void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: ['client-shortlist-research-document', workspaceId, clientId] })
      toast.success('Research complete — writing the recommended sequence.')
      // This run proposed new angles, and the cache is keyed by angle POSITION.
      // Left alone, option 1 of fresh research would be served the sequence
      // written from the previous run's option 1. The ref is cleared alongside
      // the state because the load below runs before the next render.
      setAiPitches({})
      aiPitchesRef.current = {}
      // Writes still running belong to the previous run's angles, so they are
      // forgotten rather than adopted — a late arrival must not land in the
      // cache as though it were written for the angles that just replaced it.
      inFlightPitchesRef.current.clear()
      pitchGenerationRef.current += 1
      // One button, whole pipeline: research finishing rolls straight into
      // writing the recommended sequence, so the operator clicks once and
      // ends with finished copy. The prop-driven research check is skipped
      // because the fresh document is persisted server-side already.
      setSelectedAngleIndex(0)
      void loadAiPitch(0, { skipResearchCheck: true })
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      // Whatever just changed for this podcast, the editor's field values
      // changed with it.
      void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
      toast.error(error instanceof Error ? error.message : 'The research run could not be completed.')
    },
  })
  // Real pitch copy comes from the write_email/clean_email prompts running
  // over the stored research with mapped variables; the local template is
  // only the placeholder while it loads (or the fallback if it fails).
  const [aiPitches, setAiPitches] = useState<Record<string, StoredPitch>>({})
  const [pitchLoadingKey, setPitchLoadingKey] = useState<string | null>(null)
  const pitchKey = (podcastId: string, angleIndex: number) => `${podcastId}:${angleIndex}`
  // Latest values for the background writer below, which outlives the render
  // that started it and must not decide anything from a stale closure.
  const aiPitchesRef = useRef(aiPitches)
  aiPitchesRef.current = aiPitches
  const dialogOpenRef = useRef(open)
  dialogOpenRef.current = open
  /**
   * Pitch writes currently in flight, by pitch key.
   *
   * Holding the promise rather than a marker is what lets a click adopt a
   * background write instead of racing it. Clicking an option that was already
   * being written used to start a SECOND request for the same angle — the
   * operator then waited out a fresh run from zero while the first one was
   * most of the way done, which is exactly the pause that felt like a hang.
   */
  const inFlightPitchesRef = useRef(new Map<string, Promise<StoredPitch | null>>())
  /**
   * Which set of angles the writes in flight belong to.
   *
   * Bumped when research re-runs. Dropping the map alone was not enough: a
   * write started for the old angles still resolves, and the cache is keyed by
   * angle POSITION — so it would land in slot 1 of the NEW angles and be shown
   * as copy written for an angle it never saw.
   */
  const pitchGenerationRef = useRef(0)
  /**
   * The angle set the cached pitches were written against.
   *
   * The podcast prop is fed by a shared, polled query, so the angles can change
   * without this dialog having run anything: another operator — or the same one
   * in a second tab, or a platform admin viewing the tenant — can re-run
   * research for the same podcast. Bumping the generation only in this
   * component's own mutation left those cases uncovered, and because the cache
   * is keyed by angle POSITION the result was a sequence written for the old
   * angle 1 shown as the new angle 1, with nothing to tell them apart.
   */
  const angleSignature = useMemo(
    () => (podcast?.ai_pitch_angles || []).map((angle) => angle?.title ?? '').join('\u0000'),
    [podcast?.ai_pitch_angles],
  )
  const lastAngleSignatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (lastAngleSignatureRef.current === null) {
      lastAngleSignatureRef.current = angleSignature
      return
    }
    if (lastAngleSignatureRef.current === angleSignature) return
    lastAngleSignatureRef.current = angleSignature
    // These pitches were written for angles that no longer exist.
    setAiPitches({})
    aiPitchesRef.current = {}
    inFlightPitchesRef.current.clear()
    pitchGenerationRef.current += 1
  }, [angleSignature])

  /**
   * Writes one option, or joins the write already happening for it.
   *
   * The single door both the click path and the background writer go through,
   * so an angle is never written twice concurrently however it was asked for.
   */
  const generatePitch = (angleIndex: number): Promise<StoredPitch | null> => {
    if (!podcast?.id) return Promise.resolve(null)
    const key = pitchKey(podcast.id, angleIndex)
    const existing = inFlightPitchesRef.current.get(key)
    if (existing) return existing

    const generation = pitchGenerationRef.current
    const request = generateClientShortlistPitch(
      workspaceId,
      clientId,
      podcast.id,
      angleIndex,
      relationshipAcknowledged,
    ).then((pitch) => {
      if (!pitch?.subject || !pitch?.body) {
        throw new Error('The pitch could not be written from research.')
      }
      // Written for angles that no longer exist — drop it rather than cache it.
      if (generation !== pitchGenerationRef.current) return null
      const stored: StoredPitch = {
        subject: pitch.subject,
        body: pitch.body,
        followUpOneBody: pitch.follow_up_1_body ?? null,
        followUpTwoBody: pitch.follow_up_2_body ?? null,
        auditFlags: Array.isArray(pitch.audit_flags) ? pitch.audit_flags : [],
        chainVersion: pitch.chain_version ?? null,
      }
      // Never overwrites: the operator may have this option open and edited.
      setAiPitches((current) => (current[key] ? current : { ...current, [key]: stored }))
      return stored
    }).finally(() => {
      // Cleared either way, so a failure can be retried by opening the option.
      inFlightPitchesRef.current.delete(key)
    })

    inFlightPitchesRef.current.set(key, request)
    return request
  }

  /**
   * Writes the options the operator has not opened yet.
   *
   * Each option is two or three sequential model calls, so opening one to
   * compare it cost about a minute — and the panel exists to be compared, it
   * says so. They are written in the background instead, concurrently with each
   * other: they are separate invocations server-side, and writing them one
   * after another left the third option a full run away long after the second
   * was ready.
   *
   * Deliberately quiet: it never touches the loading key or the draft, because
   * the operator is reading and may be editing the option they DID open. A
   * failure here is swallowed for the same reason — clicking the option reports
   * it properly, and a toast about copy nobody asked for is just noise.
   *
   * Every distinct angle costs a credit whether it is written now or on click,
   * and the charge is idempotent per angle, so this changes when the credit is
   * spent rather than how many. The exception is the option never opened, which
   * this does pay for.
   */
  const prefetchOtherAngles = async (loadedIndex: number) => {
    if (!podcast?.id || !relationshipCanProceed) return
    const total = Math.min((podcast.ai_pitch_angles || []).length, 3)
    const pending: Array<Promise<unknown>> = []
    for (let index = 0; index < total; index += 1) {
      if (index === loadedIndex) continue
      if (!dialogOpenRef.current) return
      const key = pitchKey(podcast.id, index)
      if (aiPitchesRef.current[key]) continue
      pending.push(generatePitch(index).catch(() => null))
    }
    await Promise.all(pending)
  }

  const loadAiPitch = async (angleIndex: number, options?: { skipResearchCheck?: boolean }) => {
    if (!podcast?.id || !relationshipCanProceed) return
    const key = pitchKey(podcast.id, angleIndex)
    // Read through the ref, so a cache cleared moments ago — by a fresh
    // research run, whose new angles must not be shown the old run's copy — is
    // seen as cleared rather than as this render's stale snapshot.
    if (aiPitchesRef.current[key] || pitchLoadingKey === key) return
    // Only the current prompt pipeline counts — a legacy ai_analyzed_at
    // stamp does not authorize pitch writing (the server enforces this too).
    const researched = podcast.research_progress?.status === 'completed'
    if (!researched && !options?.skipResearchCheck) return
    setPitchLoadingKey(key)
    try {
      // Joins the background write when one is already running for this angle,
      // so opening an option mid-prefetch waits out what is left of it rather
      // than starting again from zero.
      const stored = await generatePitch(angleIndex)
      // Null means the write was discarded because the angles changed under it,
      // not that writing failed. The angle change reloads the right option on
      // its own, so an error here would blame the click for something that
      // worked correctly.
      if (!stored) return
      // The whole three-touch sequence is AI-written now; the template
      // follow-ups only remain as the fallback for older generations.
      const applyPitch = (current: PodcastCampaignSequenceDraft): PodcastCampaignSequenceDraft => ({
        ...current,
        subject: stored.subject,
        pitchBody: stored.body,
        ...(stored.followUpOneBody ? { followUpOneBody: stored.followUpOneBody } : {}),
        ...(stored.followUpTwoBody ? { followUpTwoBody: stored.followUpTwoBody } : {}),
      })
      setDraft(applyPitch)
      setSavedDraft(applyPitch)
      // The option on screen is ready; write the ones it will be compared
      // against while the operator reads this one.
      void prefetchOtherAngles(angleIndex)
    } catch (error) {
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      // Whatever just changed for this podcast, the editor's field values
      // changed with it.
      void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
      toast.error(error instanceof Error ? error.message : 'The pitch could not be written from research.')
    } finally {
      setPitchLoadingKey((current) => (current === key ? null : current))
    }
  }

  const emailSearchMutation = useMutation({
    mutationFn: (shortlistPodcastId: string) => runClientShortlistEmailSearch(
      workspaceId,
      clientId,
      shortlistPodcastId,
      relationshipAcknowledged,
    ),
    onMutate: () => {
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
        // Whatever just changed for this podcast, the editor's field values
        // changed with it.
        void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
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
      // Whatever just changed for this podcast, the editor's field values
      // changed with it.
      void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
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
  // Which campaigns this pitch may join. Only campaigns this app built carry
  // the sequence a written pitch renders through, so the rest of the client's
  // links — attribution-only — never appear as a choice.
  const linksQuery = useQuery({
    queryKey: ['client-instantly-campaign-links', workspaceId, clientId],
    queryFn: () => getClientInstantlyCampaignLinks(workspaceId, clientId),
    enabled: open && Boolean(podcast),
    retry: false,
    staleTime: 30_000,
  })
  // Self-healing episode metadata: the server fetches from Podscan only when
  // the stored capture is missing or stale, so opening the dialog normally
  // costs one cheap read — and fills "Latest activity" without anyone asking.
  const episodeMetadataQuery = useQuery({
    queryKey: ['client-shortlist-episodes', workspaceId, clientId, podcast?.podcast_id || 'none'],
    queryFn: () => ensureClientShortlistEpisodes(
      workspaceId,
      clientId,
      podcast!.podcast_id,
      relationshipAcknowledged,
    ),
    enabled: open && Boolean(podcast?.podcast_id) && relationshipCanProceed,
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
  // Shared with the shortlist row's button label, so what the row promises and
  // what this screen allows are one judgement rather than two.
  const locked = isTargetInActiveOutreach(target)
  const mappedCampaign = Boolean(campaign?.instantly_campaign_id)
  // The client's own campaign is always a target; the extra ones are whichever
  // links were created here rather than linked from Instantly.
  const sendableCampaigns = useMemo(() => {
    const own = campaign?.instantly_campaign_id
      ? [{
        id: campaign.instantly_campaign_id,
        name: campaign.name || 'This client’s campaign',
        status: campaign.instantly_campaign_status ?? null,
      }]
      : []
    const extra = (linksQuery.data?.links ?? [])
      .filter((link) => link.sendable && link.instantly_campaign_id !== campaign?.instantly_campaign_id)
      .map((link) => ({
        id: link.instantly_campaign_id,
        name: link.campaign_name || 'Campaign',
        status: link.status ?? null,
      }))
    return [...own, ...extra]
  }, [campaign?.instantly_campaign_id, campaign?.instantly_campaign_status, campaign?.name, linksQuery.data])
  const [chosenCampaignId, setChosenCampaignId] = useState<string | null>(null)
  // Default to the client's own campaign, and never leave a stale choice
  // pointing at a campaign that is no longer offered.
  const activeCampaignId = chosenCampaignId
      && sendableCampaigns.some((item) => item.id === chosenCampaignId)
    ? chosenCampaignId
    : sendableCampaigns[0]?.id ?? null
  const chosenCampaign = sendableCampaigns.find((item) => item.id === activeCampaignId) ?? null
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
  // The server decides what "out of date" means; the dialog only says so. A
  // stale address still fills the field — withholding a contact the workspace
  // already owns helps nobody — but it must not read as freshly verified.
  const contactIsStale = emailAlreadyUnlocked && storedEmailUnlock?.stale === true
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
  // A run that dies mid-flight stops writing progress, so nothing arrives to
  // re-render against. Without a clock of its own the modal would keep spinning
  // until it was closed and reopened — which is exactly how a run that stopped
  // on the 29th was still animating on the 31st.
  const [nowMs, setNowMs] = useState(() => Date.now())
  const researchClaimsWork = researchProgress?.status === 'queued' || researchProgress?.status === 'running'
  useEffect(() => {
    if (!open || !researchClaimsWork) return
    setNowMs(Date.now())
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open, researchClaimsWork])
  // Only the current prompt pipeline counts as research. A legacy
  // ai_analyzed_at from the retired analysis path no longer unlocks the
  // pitch flow — those shows re-run research through the real prompts.
  const researchRegenerating = runResearchMutation.isPending && runResearchMutation.variables === podcast?.id
  // Says it is running, but has not written progress for longer than a live run
  // ever goes quiet. Treated as stopped rather than as working: the backend has
  // long since released the lock, so a re-run is available and the one thing
  // the screen must not do is keep implying it should be waited for.
  const researchStale = !researchRegenerating && isResearchRunStale(researchProgress, nowMs)
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
      if (!researchProgress) return { ...step, status: 'queued' }
      if (researchProgress.status === 'completed') return { ...step, status: 'complete' }
      if (completedStages.has(step.id)) return { ...step, status: 'complete' }
      if (researchProgress.current_stage === step.id) {
        // A stale run's current stage is where it stopped, not where it is.
        const stopped = researchProgress.status === 'failed' || researchStale
        return { ...step, status: stopped ? 'failed' : 'active' }
      }
      return { ...step, status: 'queued' }
    })
  }, [researchProgress, researchRegenerating, researchStale])
  const completedResearchStepCount = visibleResearchSteps.filter((step) => step.status === 'complete').length
  const activeResearchStep = visibleResearchSteps.find((step) => step.status === 'active') || null
  const failedResearchStep = visibleResearchSteps.find((step) => step.status === 'failed') || null
  const researchComplete = !researchRegenerating
    && researchProgress?.status === 'completed'
  const researchFailed = !researchRegenerating
    && (researchProgress?.status === 'failed' || researchStale)
  const selectedPitchMeta = podcast?.id ? aiPitches[pitchKey(podcast.id, selectedAngleIndex)] : undefined
  // Style checks rerun on the copy actually in the editor, so an operator's
  // own edits are held to the same standard as the generated draft.
  const liveCopyIssues = useMemo(() => [...new Set([
    ...checkPitchCopy(draft.pitchBody),
    ...checkPitchCopy(draft.followUpOneBody),
    ...checkPitchCopy(draft.followUpTwoBody),
  ])], [draft.pitchBody, draft.followUpOneBody, draft.followUpTwoBody])
  const pitchGrounding = {
    hostName: hostName || podcast?.host_name || null,
    episodeTitle: latestEpisode?.title ?? null,
    guestName: latestEpisode?.guests?.[0]?.name ?? null,
  }
  // The synthetic final progress step: the sequence being written by the
  // write_email/clean_email prompts for the currently selected angle.
  const sequenceWritingStatus: 'queued' | 'active' | 'complete' = (() => {
    if (!podcast?.id) return 'queued'
    const key = pitchKey(podcast.id, selectedAngleIndex)
    if (aiPitches[key]) return 'complete'
    if (pitchLoadingKey === key) return 'active'
    return 'queued'
  })()
  const researchWorking = researchRegenerating || (researchClaimsWork && !researchStale)
  const researchStepsExpanded = !researchComplete || showResearchSteps
  const researchStatusTitle = researchRegenerating && activeResearchStep
    ? `${activeResearchStep.title} · ${completedResearchStepCount} of ${researchProgressSteps.length} prompts complete`
    : researchComplete
    ? `Research ready · ${researchProgressSteps.length} of ${researchProgressSteps.length} steps complete`
    : researchStale
      ? `Research stopped · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
    : researchFailed
      ? `Research paused · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
      : activeResearchStep
        ? `${activeResearchStep.title} · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
        : researchProgress || researchRegenerating
          ? `Research queued · ${completedResearchStepCount} of ${researchProgressSteps.length} steps complete`
          : 'Research has not run yet'
  const researchStatusDetail = researchRegenerating && activeResearchStep
    ? `Running your saved workspace prompts against live podcast data. ${activeResearchStep.detail}.`
    : researchComplete
    ? 'The research is saved to this podcast and will still be here when you return.'
    : researchStale
      ? `This run stopped before it finished${failedResearchStep ? ` at ${failedResearchStep.title.toLowerCase()}` : ''} and is no longer going. Everything completed before that is saved — run research again to pick it up.`
    : researchFailed
      ? researchProgress?.message || `We could not finish ${failedResearchStep?.title.toLowerCase() || 'this research stage'}. Your completed work is saved.`
      : activeResearchStep
        ? activeResearchStep.detail
        : researchProgress || researchRegenerating
          ? 'Your research will begin as soon as the workspace is ready.'
          : 'Nothing runs until you click Run research — it executes every saved prompt in order and ends with the written sequence.'
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
  // The layer that actually runs for this client. Editing here used to show
  // and save the workspace text while a client override silently won at run
  // time — an operator edited a prompt in the research flow, saw "saved", and
  // nothing changed for the client in front of them.
  const clientPromptsQuery = useQuery({
    queryKey: ['client-sdr-prompts', workspaceId, clientId],
    queryFn: () => getClientSdrPrompts(workspaceId, clientId),
    enabled: open,
    retry: false,
  })
  const clientPrompts = clientPromptsQuery.data ?? {}
  // Read live from Anthropic rather than from a list in this app: the usable
  // set changes as models ship and retire, and differs by which key the
  // workspace runs on.
  const promptModelsQuery = useQuery({
    queryKey: ['workspace-prompt-models', workspaceId],
    queryFn: () => getWorkspacePromptModels(workspaceId),
    enabled: open && showPromptSettings,
    retry: false,
    staleTime: 10 * 60_000,
  })
  const promptModels = promptModelsQuery.data ?? []
  const setPromptModelMutation = useMutation({
    mutationFn: ({ promptId, model }: { promptId: ResearchPromptId; model: string | null }) =>
      setWorkspacePromptModel(workspaceId, promptId, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-research-prompts', workspaceId] })
      toast.success('Stage model saved.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The model could not be saved.')
    },
  })

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
  // The chain the run itself resolves: client, then workspace, then shipped.
  // Every derived flag below must read this, not one layer of it — comparing
  // the draft against the wrong layer made a client-level prompt register as
  // an unsaved edit at open, which locked stage switching, closing the editor,
  // and running research behind a save nobody had made.
  const effectivePromptContent = (promptId: ResearchPromptId): string =>
    clientPrompts[promptId]?.content
      ?? promptOverrides[promptId]?.content
      ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].content
  const promptPhases = useMemo(() => researchPromptPhases(), [])
  const promptStepNumbers = useMemo(() => researchPromptStepNumbers(promptPhases), [promptPhases])
  const selectedPromptDefault = RESEARCH_PROMPT_DEFAULTS_BY_ID[selectedPromptId]
  const selectedPromptCustomized = Boolean(clientPrompts[selectedPromptId]?.content ?? promptOverrides[selectedPromptId]?.content)
  const promptDirty = promptDraft !== effectivePromptContent(selectedPromptId)
  // Customized means someone wrote the instructions, not that a row exists.
  // A row is also created by choosing a model, and counting those made every
  // stage with a model claim its prompt had been rewritten.
  const customPromptCount = RESEARCH_PROMPT_DEFAULTS.filter((prompt) => clientPrompts[prompt.id]?.content ?? promptOverrides[prompt.id]?.content).length

  /**
   * Named, because anything that fills a field has to invalidate it.
   *
   * Research runs inside this dialog and writes host names, episode captures
   * and stage outputs. Until this key was invalidated with the rest, the
   * operator watched a stage complete while the fields it had just filled
   * stayed marked empty — staleTime only refetches on remount, not on a write.
   */
  const promptPreviewQueryKey = useMemo(
    () => ['client-shortlist-prompt-preview', workspaceId, clientId, podcast?.id || 'none'],
    [workspaceId, clientId, podcast?.id],
  )

  /**
   * The operator's escape hatch when the catalogue looks thinner than Podscan.
   *
   * The only metered action in this editor: everything else here reads stored
   * data. What it fetches lands in the global catalogue, so the credit buys
   * the show for every workspace, not just this one.
   */
  const refreshEpisodesMutation = useMutation({
    mutationFn: () => refreshClientShortlistEpisodes(workspaceId, clientId, podcast!.podcast_id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: promptPreviewQueryKey })
      void queryClient.invalidateQueries({ queryKey: shortlistQueryKey })
      if (!result.fetched) {
        toast.success('Already refreshed in the last hour — used the stored copy, no credit spent.')
      } else if (result.episodes.length === 0) {
        toast.warning('Podscan has no episodes for this show. Nothing to quote from.')
      } else {
        toast.success(
          `${result.episodes.length} ${result.episodes.length === 1 ? 'episode' : 'episodes'} captured`
          + `${result.has_transcript ? ' with a transcript' : ', none with a transcript yet'}.`,
        )
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Podscan could not be reached.')
    },
  })

  // The real value of every field for THIS podcast, built server-side by the
  // same function the run uses. Stored reads only, so opening the editor is
  // never a provider call or a charge.
  const promptPreviewQuery = useQuery({
    queryKey: promptPreviewQueryKey,
    queryFn: () => getPromptPreview(workspaceId, clientId, podcast!.id),
    enabled: open && Boolean(podcast?.id),
    retry: false,
    staleTime: 30_000,
  })

  // Registry fields written by this stage or a later one, which this prompt
  // must not be offered: a stage cannot read what it has not produced yet.
  const omittedVariableIds = useMemo(
    () => unavailableVariableIds(selectedPromptId, RESEARCH_PROMPT_DEFAULTS.map((prompt) => prompt.id)),
    [selectedPromptId],
  )

  /**
   * Which fields hold a value for this podcast, for colouring the prompt.
   *
   * Null while there is no preview to report from — no podcast open, or the
   * read still in flight. Colouring against an empty map would paint every
   * field red and read as "this podcast has nothing", which is a different
   * claim from "not known yet".
   *
   * A field an earlier stage has not written yet counts as empty, because on
   * this run it is: the filler will tell the model "Not available" either way.
   */
  const promptFieldAvailability = useMemo(() => {
    const preview = promptPreviewQuery.data
    if (!preview) return null
    const map: Record<string, boolean> = {}
    for (const [id, field] of Object.entries(preview.fields)) {
      map[id] = Boolean(field?.value)
    }
    return map
  }, [promptPreviewQuery.data])

  const requirementsQueryKey = useMemo(
    () => ['workspace-prompt-requirements', workspaceId],
    [workspaceId],
  )
  const requirementsQuery = useQuery({
    queryKey: requirementsQueryKey,
    queryFn: () => getWorkspacePromptRequirements(workspaceId),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  })
  const promptRequirements = requirementsQuery.data ?? {}

  type PromptRequirementMap = Record<string, string[]>

  const saveRequirementsMutation = useMutation({
    mutationFn: ({ promptId, required }: { promptId: ResearchPromptId; required: string[] }) =>
      setWorkspacePromptRequirements(workspaceId, promptId, required),
    /**
     * A switch has to move on the click that moved it.
     *
     * Its checked state is read from this query, so it used to wait out two
     * round trips before it budged: the write, and then the refetch the write
     * triggered. Write the new value in first and let the server confirm it.
     */
    onMutate: async ({ promptId, required }) => {
      await queryClient.cancelQueries({ queryKey: requirementsQueryKey })
      const previous = queryClient.getQueryData<PromptRequirementMap>(requirementsQueryKey)
      queryClient.setQueryData<PromptRequirementMap>(requirementsQueryKey, (current) => ({
        ...(current ?? {}),
        [promptId]: required,
      }))
      return { previous }
    },
    onError: (error, _variables, context) => {
      // Put the switch back where it was: leaving it on while the workspace
      // has it off would be a lie about whether the stage will skip.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(requirementsQueryKey, context.previous)
      }
      toast.error(error instanceof Error ? error.message : 'The field requirements could not be saved.')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: requirementsQueryKey })
    },
  })

  const savePromptMutation = useMutation({
    // The client layer, not the workspace one. An edit made inside a client's
    // research flow is about the client in front of you, and the client layer
    // is the one the run resolves first — saving anywhere else is a save that
    // does not take effect.
    mutationFn: ({ promptId, content }: { promptId: ResearchPromptId; content: string }) =>
      setClientSdrPrompt(workspaceId, clientId, promptId, content),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['client-sdr-prompts', workspaceId, clientId] })
      toast.success(`${RESEARCH_PROMPT_DEFAULTS_BY_ID[variables.promptId].label} prompt saved for ${clientName} only.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be saved.')
    },
  })
  const resetPromptMutation = useMutation({
    mutationFn: (promptId: ResearchPromptId) => resetClientSdrPrompt(workspaceId, clientId, promptId),
    onSuccess: (_result, promptId) => {
      void queryClient.invalidateQueries({ queryKey: ['client-sdr-prompts', workspaceId, clientId] })
      // Back to what the rest of the workspace uses, not to the shipped text.
      setPromptDraft(promptOverrides[promptId]?.content ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].content)
      toast.success(`${RESEARCH_PROMPT_DEFAULTS_BY_ID[promptId].label} back on the workspace default for ${clientName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The prompt could not be reset.')
    },
  })
  const promptBusy = savePromptMutation.isPending || resetPromptMutation.isPending

  /** Adds or removes one field from the selected stage's required set. */
  const toggleRequirement = (variableId: string, next: boolean) => {
    const wanted = new Set(promptRequirements[selectedPromptId] ?? [])
    if (next) wanted.add(variableId)
    else wanted.delete(variableId)
    saveRequirementsMutation.mutate({
      promptId: selectedPromptId,
      // Registry order, so the saved set reads the way the list is drawn.
      required: PROMPT_VARIABLES
        .filter((variable) => wanted.has(variable.id))
        .map((variable) => variable.id),
    })
  }

  // Keep the draft in sync with saved overrides unless the owner is mid-edit.
  useEffect(() => {
    if (promptTouched) return
    const effective = clientPrompts[selectedPromptId]?.content
      ?? promptOverrides[selectedPromptId]?.content
      ?? RESEARCH_PROMPT_DEFAULTS_BY_ID[selectedPromptId].content
    setPromptDraft(effective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptOverridesQuery.data, clientPromptsQuery.data, selectedPromptId, promptTouched])

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
    setAcknowledgedRelationshipPodcastId(null)
  }, [open, podcast?.podcast_id])

  useEffect(() => {
    if (!open) {
      setStagedResult(null)
      setConfirmSendOpen(false)
      setConfirmRemoveOpen(false)
      setPrepareError(null)
    }
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
    if (!relationshipCanProceed) {
      toast.info(relationshipSuppressed
        ? 'This host is marked do not contact in Relationships.'
        : 'Review and confirm the relationship warning before starting a contact search.')
      return
    }
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
    if (!relationshipCanProceed) {
      toast.info(relationshipSuppressed
        ? 'This host is marked do not contact in Relationships.'
        : 'Review and confirm the relationship warning before using research credits.')
      return
    }
    if (promptDirty) {
      toast.info('Save or discard the current prompt changes before regenerating research.')
      setActiveStep('research')
      setShowPromptSettings(true)
      return
    }
    // A finished run loads its recommended sequence over the draft AND over
    // savedDraft, so an unsaved hand-edit would be gone with nothing to revert
    // to. Same guard the prompt editor already applies to its own unsaved text.
    if (draftHasUnsavedEdits) {
      toast.info('Save or discard your pitch edits first — finishing research replaces the written sequence.')
      setActiveStep('pitch')
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
    if (!relationshipCanProceed) return
    setSelectedAngleIndex(angleIndex)
    if (!podcast) return
    const nextDraft = buildPodcastCampaignSequenceDraft({ podcast, clientName, clientBio, angleIndex })
    const cached = aiPitches[pitchKey(podcast.id, angleIndex)]
    const selectedDraft = {
      ...nextDraft,
      ...(cached ? { subject: cached.subject, pitchBody: cached.body } : {}),
      ...(cached?.followUpOneBody ? { followUpOneBody: cached.followUpOneBody } : {}),
      ...(cached?.followUpTwoBody ? { followUpTwoBody: cached.followUpTwoBody } : {}),
      researchNotes: draft.researchNotes || nextDraft.researchNotes,
    }
    setDraft(selectedDraft)
    setSavedDraft(selectedDraft)
    if (!cached) void loadAiPitch(angleIndex)
  }
  const normalizedEmail = contactEmail.trim().toLowerCase()

  // Sending to Client Campaign creates the Instantly lead in the campaign
  // itself. A paused campaign holds it; a live one starts the sequence on its
  // next send window with no further approval. The operator has to be able to
  // see which of those they are about to do, before they do it.
  // The status of the campaign being sent into, not the client's default one.
  // Reading the default meant that choosing a live campaign while the default
  // was paused skipped the confirmation entirely and told the operator
  // "nothing goes out" as a host was being emailed.
  const campaignIsLive = chosenCampaign
    ? chosenCampaign.status === 1
    : campaign?.instantly_campaign_status === 1
  const submitWillSend = campaignIsLive && validEmail(normalizedEmail)
  // Reopening a podcast that is already in the campaign. Sending again updates
  // the existing lead rather than adding a second one, and the operator should
  // know that before they press it.
  const alreadyStaged = Boolean(target?.lead_staged_at) && !target?.launched_at

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
      setPrepareError(null)
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
        pitchChainVersion: aiPitches[pitchKey(podcast.id, selectedAngleIndex)]?.chainVersion ?? null,
        instantlyCampaignId: activeCampaignId,
      }).then((result) => ({
        ...result,
        sent_to_campaign_name: chosenCampaign?.name || campaign?.name || 'the client campaign',
      }))
    },
    onSuccess: async (result) => {
      setConfirmSendOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
      ])
      // The dialog stays open on a confirmation screen instead of vanishing.
      // Closing on success left the operator with a three-second toast as the
      // only record of an action that reaches a real person.
      setStagedResult({
        added: result.added,
        leadStaged: result.lead_staged,
        willSend: result.will_send,
        hostName: hostName.trim(),
        contactEmail: normalizedEmail,
        // Pinned when the request went out, not read again now. Both queries
        // behind these names can refetch during an Instantly round trip, and a
        // confirmation naming a campaign other than the one the server used is
        // the same lie in a different place.
        campaignName: result.sent_to_campaign_name,
      })
      onPrepared?.()
    },
    onError: (error) => setPrepareError({
      message: error instanceof Error ? error.message : 'The pitch could not be sent to Client Campaign.',
      code: errorCode(error),
      status: errorStatus(error),
      source: 'prepare',
    }),
  })
  const removeMutation = useMutation({
    mutationFn: () => {
      if (!podcast) throw new Error('Choose a podcast first.')
      return removeWorkspaceCampaignLead({ workspaceId, clientId, shortlistPodcastId: podcast.id })
    },
    onSuccess: async () => {
      setConfirmRemoveOpen(false)
      setStagedResult(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignQueryKey }),
        queryClient.invalidateQueries({ queryKey: ['workspace-client-campaigns', workspaceId] }),
      ])
      toast.success(`${podcast?.podcast_name || 'This podcast'} was removed from the campaign.`)
      onPrepared?.()
    },
    onError: (error) => {
      setConfirmRemoveOpen(false)
      setPrepareError({
        message: error instanceof Error ? error.message : 'The podcast could not be removed from the campaign.',
        code: errorCode(error),
        status: errorStatus(error),
        source: 'remove',
      })
    },
  })

  const [detailsCopied, setDetailsCopied] = useState(false)
  // Clipboard access is absent in some embedded browsers and in jsdom. A copy
  // button that throws on click would take the alert down with it, so a
  // failure leaves the label alone and the code stays readable on screen.
  const copyPrepareErrorDetails = () => {
    if (!prepareError) return
    const report = campaignErrorReport({
      code: prepareError.code,
      status: prepareError.status,
      message: prepareError.message,
      context: {
        action: prepareError.source === 'remove' ? 'unstage-podcast' : 'prepare-podcast',
        client: clientName,
        podcast: podcast?.podcast_name,
        campaign: campaign?.name,
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: podcast?.id,
      },
    })
    void Promise.resolve(navigator.clipboard?.writeText(report))
      .then(() => {
        setDetailsCopied(true)
        window.setTimeout(() => setDetailsCopied(false), 2_000)
      })
      .catch(() => toast.error('The details could not be copied. The code is shown above.'))
  }

  const prepareGuidance = campaignErrorGuidance(prepareError?.code)
  const retryPending = prepareError?.source === 'remove'
    ? removeMutation.isPending
    : prepareMutation.isPending
  const prepareRemedy = prepareGuidance && prepareGuidance.remedy.kind !== 'none'
    ? prepareGuidance.remedy
    : null
  // campaignHref is `${base}/client-campaigns/${clientId}`, so the workspace
  // base is what precedes it — the dialog is given no other route context.
  const workspaceBaseHref = campaignHref.split('/client-campaigns')[0] || MY_WORKSPACE_BASE_HREF

  // Rendered on the success screen as well as the editor. The removal offered
  // right after a send is an undo, and the footer that used to hold this alert
  // is gone by then — so a failed undo said nothing at all.
  const prepareErrorAlert = prepareError ? (
              <div role="alert" className="mb-3 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-destructive">{prepareGuidance?.title || 'This pitch was not sent to Client Campaign'}</p>
                  <p className="mt-1 text-xs leading-5 text-destructive/90">{prepareGuidance?.explanation || prepareError.message}</p>
                  {/* The draft is still on screen and still saved; a refusal
                      that reads as data loss makes operators redo work. */}
                  {prepareGuidance && <p className="mt-1 text-xs leading-5 text-destructive/70">{prepareError.message}</p>}
                  {/* The identifying detail, always shown rather than folded
                      away. A refusal this dialog has no guidance for is exactly
                      the one somebody has to escalate, and the code is what
                      makes that reportable. */}
                  <p className="mt-2 font-mono text-[11px] leading-4 text-destructive/70">
                    {prepareError.code || 'no code'}
                    {prepareError.status !== null && ` · HTTP ${prepareError.status}`}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {prepareRemedy && (prepareRemedy.kind === 'link' ? (
                      <Button asChild type="button" size="sm" variant="outline">
                        <Link to={workspaceModuleHref(workspaceBaseHref, prepareRemedy.module)}>{prepareRemedy.label}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={retryPending}
                        onClick={() => {
                          const retrying = prepareError.source
                          setPrepareError(null)
                          if (prepareRemedy.kind === 'contact') setActiveStep('email')
                          else if (retrying === 'remove') removeMutation.mutate()
                          else prepareMutation.mutate()
                        }}
                      >
                        {retryPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        {prepareRemedy.label}
                      </Button>
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={copyPrepareErrorDetails}>
                      {detailsCopied ? <Check className="mr-2 h-3.5 w-3.5" /> : <Copy className="mr-2 h-3.5 w-3.5" />}
                      {detailsCopied ? 'Copied' : 'Copy details'}
                    </Button>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setPrepareError(null)}>Dismiss</Button>
              </div>
  ) : null

  const submitDisabled = !podcast
    || !mappedCampaign
    || locked
    || !relationshipCanProceed
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
          <DialogDescription>Find the right contact, research the show, and then write a thoughtful outreach sequence for {clientName}.{' '}{submitWillSend ? `${chosenCampaign?.name || campaign?.name || 'This campaign'} is live, so sending this to Client Campaign puts the host into the sequence.` : 'Nothing sends from this modal.'}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {stagedResult ? (
            <div
              role="status"
              aria-label="Pitch added to client campaign"
              className={stagedResult.willSend || !stagedResult.leadStaged
                ? 'm-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-amber-300 bg-amber-50 px-6 py-10 text-center'
                : 'm-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center'}
            >
              {/* Green is a claim that the work is finished. Without a lead it
                  is not: the podcast is listed and nobody can be reached. */}
              {stagedResult.willSend || !stagedResult.leadStaged
                ? <AlertCircle className="h-10 w-10 text-amber-700" />
                : <CheckCircle2 className="h-10 w-10 text-emerald-600" />}
              <h3 className="mt-4 text-lg font-semibold">
                {stagedResult.willSend
                  ? `${podcast?.podcast_name || 'This podcast'} is now in a live sequence`
                  : stagedResult.leadStaged
                    ? `${podcast?.podcast_name || 'This podcast'} was added to ${stagedResult.campaignName}`
                    : `${podcast?.podcast_name || 'This podcast'} was added, but has no lead`}
              </h3>
              {/* Saying "added as a lead" when no lead exists is the failure
                  that sends somebody to Instantly looking for a host who was
                  never created. The sequence only attaches to a real lead. */}
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {stagedResult.leadStaged
                  ? `${stagedResult.hostName || 'The host'} was ${stagedResult.added ? 'added' : 'updated'} in ${stagedResult.campaignName} as a lead, with the full three-email sequence attached.`
                  : `The podcast and its sequence are saved to ${stagedResult.campaignName}. No lead was created, because there is no contact email to create one for, so nothing can reach the host yet.`}
              </p>
              <dl className="mt-5 w-full max-w-sm space-y-2 rounded-xl border bg-background/80 p-4 text-left text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className={stagedResult.contactEmail ? 'truncate font-medium' : 'truncate font-medium text-amber-800'}>
                    {stagedResult.contactEmail || 'None yet'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Campaign</dt><dd className="truncate font-medium">{stagedResult.campaignName}</dd></div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Sending</dt>
                  <dd className={stagedResult.willSend || !stagedResult.leadStaged ? 'font-semibold text-amber-800' : 'font-medium'}>
                    {stagedResult.willSend
                      ? 'Live — starts automatically'
                      : stagedResult.leadStaged
                        ? 'Paused — nothing sends yet'
                        : 'Nothing to send — no lead yet'}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 max-w-md text-xs leading-5 text-muted-foreground">
                {stagedResult.willSend
                  ? 'The opening email goes out on the campaign\u2019s next send window, then the two follow-ups on day 6 and day 13. To stop it, pause the campaign in Client Campaigns.'
                  : stagedResult.leadStaged
                    ? 'Open Client Campaigns and choose Approve & start outreach when you are ready for this to send. You can keep editing the sequence until then.'
                    : 'Add a contact email and send again to create the lead. Approving outreach before then starts a sequence with nobody in it.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {/* The one move that finishes what this screen reports. */}
                {!stagedResult.leadStaged && (
                  <Button
                    type="button"
                    onClick={() => {
                      setStagedResult(null)
                      setActiveStep('email')
                    }}
                  >
                    Add a contact email
                  </Button>
                )}
                <Button asChild variant={stagedResult.willSend || !stagedResult.leadStaged ? 'outline' : 'default'}><Link to={campaignHref}>Open Client Campaigns</Link></Button>
                <Button type="button" variant={stagedResult.willSend ? 'outline' : 'default'} onClick={() => onOpenChange(false)}>Done</Button>
              </div>
              {prepareErrorAlert && <div className="mt-6 w-full max-w-xl text-left">{prepareErrorAlert}</div>}
              {/* The undo. Most valuable in exactly the moment it is offered:
                  right after a send the operator did not mean to make. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-3 text-destructive hover:text-destructive"
                onClick={() => setConfirmRemoveOpen(true)}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Remove from campaign
              </Button>
            </div>
          ) : campaignQuery.isLoading ? (
            <div className="flex min-h-96 flex-col items-center justify-center gap-3"><Loader2 className="h-7 w-7 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading the pitch workspace…</p></div>
          ) : locked ? (
            <div className="m-6 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
              <Send className="h-9 w-9 text-sky-600" />
              <h3 className="mt-4 text-lg font-semibold">This podcast is already in active outreach</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">The live campaign sequence is locked so it cannot be changed accidentally. Prior outreach by itself no longer prevents you from opening this workspace and preparing a considered re-pitch.</p>
              <Button asChild className="mt-5"><Link to={campaignHref}>View outreach</Link></Button>
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

                  {relationshipNeedsReview && (
                    <div className="space-y-3 px-4 pb-4 sm:px-5" role="region" aria-label="Relationship review required">
                      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 shadow-sm">
                        <div className="flex gap-3">
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">
                              {previouslyContacted || (podcast.agency_relationship?.touch_count ?? 0) > 0
                                ? "Warning: you've reached out to this podcast already"
                                : 'Warning: this podcast already has relationship history'}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-amber-900/85">
                              Review the CRM history before continuing. Nothing that can use research credits, pitch credits, or external contact enrichment will run until this check is complete.
                            </p>
                            {podcast.agency_relationship?.podcast_id && (
                              <p className="mt-1 text-[11px] text-amber-900/70">CRM match · Podcast ID {podcast.agency_relationship.podcast_id}</p>
                            )}
                            {relationshipSuppressed ? (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Badge variant="destructive">Do not contact</Badge>
                                <span className="text-xs font-medium">This instruction cannot be overridden from the pitch workflow.</span>
                              </div>
                            ) : (
                              <label htmlFor="relationship-warning-acknowledgement" className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-background/80 p-3">
                                <Checkbox
                                  id="relationship-warning-acknowledgement"
                                  checked={relationshipAcknowledged}
                                  onCheckedChange={(checked) => setAcknowledgedRelationshipPodcastId(
                                    checked === true ? podcast.podcast_id : null,
                                  )}
                                  aria-label="I reviewed the prior relationship and still want to prepare this pitch"
                                />
                                <span className="text-xs font-semibold leading-5">
                                  I reviewed the prior relationship and still want to research and prepare this pitch. I will adjust the messaging before it is sent.
                                </span>
                              </label>
                            )}
                            <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0 text-amber-950">
                              <Link to="/app/relationships">Open the relationship CRM<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                      {podcast.agency_relationship && (
                        <AgencyRelationshipNotice relationship={podcast.agency_relationship} />
                      )}
                    </div>
                  )}

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
                  const lockedUntilRelationship = item.id !== 'email' && !relationshipCanProceed
                  const lockedStepLabel = lockedUntilRelationship
                    ? `Step ${item.step}: ${item.title} locked until the relationship warning is reviewed`
                    : lockedUntilEmail
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
                      disabled={lockedUntilRelationship || lockedUntilEmail || lockedUntilResearch}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/40 hover:bg-muted/30'}`}
                      onClick={() => setActiveStep(item.id)}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{item.step}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{lockedUntilRelationship ? 'Review relationship first' : lockedUntilEmail ? 'Email required first' : lockedUntilResearch ? 'Research must finish first' : item.detail}</span></span>
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
                                <Badge className={contactIsStale ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-100' : 'border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100'}>{contactIsStale ? 'Needs re-check' : emailAlreadyUnlocked ? 'Globally unlocked' : emailSearchRunning ? 'Global search in progress' : emailSearchHasNoResult ? 'No result yet' : 'Recommended'}</Badge>
                                <span className={contactIsStale ? 'text-[11px] font-semibold text-amber-900' : 'text-[11px] font-semibold text-violet-800'}>{contactIsStale ? 'Re-check costs 0 credits' : emailAlreadyUnlocked ? '0 additional credits' : emailSearchRunning ? 'Safe to close' : emailSearchHasNoResult ? 'You were not charged' : '1 credit on success'}</span>
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
                              <div className={contactIsStale
                                ? 'mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5'
                                : 'mt-4 rounded-xl border border-violet-200 bg-background/80 px-3 py-2.5'}>
                                <p className={contactIsStale
                                  ? 'text-[11px] font-semibold uppercase tracking-wide text-amber-900'
                                  : 'text-[11px] font-semibold uppercase tracking-wide text-violet-800'}>
                                  {contactIsStale ? 'Direct email out of date' : 'Direct email ready'}
                                </p>
                                <p className={contactIsStale ? 'mt-1 text-xs leading-5 text-amber-900' : 'mt-1 text-xs leading-5 text-muted-foreground'}>
                                  {contactIsStale
                                    ? storedEmailUnlock?.message
                                      || `Last verified ${formatPodcastDate(storedEmailUnlock?.verified_at)}. Hosts change addresses, so this may now bounce — re-run the search to re-check it at no credit cost.`
                                    : (
                                      <>
                                        {storedEmailUnlock?.revalidated
                                          ? 'Re-checked just now and still valid.'
                                          : storedEmailUnlock?.verified_at
                                            ? `Verified ${formatPodcastDate(storedEmailUnlock.verified_at)}.`
                                            : 'Saved to the global contact network.'}
                                        {' '}Future host and contact refreshes are included for every workspace.
                                      </>
                                    )}
                                </p>
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
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">No verified direct email · No charge</p><p className="mt-1 max-w-2xl text-xs leading-5 text-amber-900/75">Try again, use the free Podscan inbox, or enter an address manually. A credit is eligible only for the first successful global unlock.</p></div></div><Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-200 bg-background text-amber-950" disabled={!relationshipCanProceed} onClick={beginEmailSearchPreview}>Try search again</Button></div>
                          </div>
                        ) : (
                          <div aria-label="Waterfall enrichment plan" className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex gap-3">
                                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                                <div><p className="text-sm font-semibold text-violet-950">Robust lookup · 1 credit on first global success</p><p className="mt-1 max-w-2xl text-xs leading-5 text-violet-900/75">We check the global contact network first. Only a true global miss starts host identification and verification; no verified direct email means no credit is charged.</p></div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline" size="sm" className="border-violet-200 bg-background text-violet-900 hover:bg-violet-100"><Link to="/app/settings/billing" target="_blank" rel="noreferrer"><Coins className="mr-2 h-3.5 w-3.5" />Buy credits in Billing<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button><Button type="button" size="sm" disabled={!relationshipCanProceed} onClick={beginEmailSearchPreview}><Search className="mr-2 h-3.5 w-3.5" />Start direct email search</Button></div>
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
                            <Badge variant="outline" className="border-border bg-muted text-muted-foreground">2 credits per run</Badge>
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
                                variant={researchProgress || researchRegenerating ? 'outline' : 'default'}
                                size="sm"
                                className={researchProgress || researchRegenerating ? 'bg-background' : undefined}
                                disabled={researchWorking || !relationshipCanProceed}
                                title="Runs every research stage using the saved prompt for each stage, then writes the sequence"
                                onClick={beginResearchRegeneration}
                              >
                                {researchRegenerating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                                {researchRegenerating
                                  ? 'Regenerating'
                                  : researchWorking
                                    ? 'Research running'
                                    : researchProgress ? 'Regenerate' : 'Run research'}
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
                              {/* The pipeline's final visible act: research rolls
                                  straight into the write_email/clean_email prompts,
                                  so the operator watches one unbroken chain end in
                                  finished copy. */}
                              <li key="sequence_writing" className="bg-background">
                                <div className="flex h-full w-full gap-3 p-4 text-left">
                                  {sequenceWritingStatus === 'complete' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
                                  {sequenceWritingStatus === 'active' && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />}
                                  {sequenceWritingStatus === 'queued' && <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/25" />}
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-semibold text-foreground">Writing the sequence</p><span className={`text-[10px] font-semibold ${sequenceWritingStatus === 'complete' ? 'text-emerald-700' : sequenceWritingStatus === 'active' ? 'text-primary' : 'text-muted-foreground'}`}>{sequenceWritingStatus === 'complete' ? 'Done' : sequenceWritingStatus === 'active' ? 'In progress' : 'Waiting'}</span></div>
                                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Pitch email draft and cleanup prompts, written from the research above</p>
                                  </div>
                                </div>
                              </li>
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
                                <div className="mt-3">
                                  <PromptFieldPreview
                                    content={inspectedPromptContent}
                                    preview={promptPreviewQuery.data ?? null}
                                    loading={promptPreviewQuery.isLoading}
                                    error={promptPreviewQuery.isError}
                                    onRetry={() => void promptPreviewQuery.refetch()}
                                    podcastName={podcast?.podcast_name}
                                  />
                                </div>
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
                              {/*
                                Precise about which window, because the two are
                                no longer the same promise. The run hands itself
                                between invocations to stay inside the platform's
                                time limit, and this tab is what asks for the
                                next one — so closing the panel costs nothing and
                                closing the tab stops it. Nothing is lost either
                                way, which is the part worth saying plainly.
                              */}
                              <p>{researchWorking
                                ? researchRegenerating
                                  ? 'All six saved workspace prompts run in order. Closing this panel is fine — the run continues as long as this tab stays open, and every finished stage is saved if it stops.'
                                  : 'Research continues while this tab stays open, so closing this panel is fine. Closing the tab pauses it — every finished stage is saved, and running it again picks up from where it stopped.'
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
                              <div className="flex flex-wrap items-center gap-2"><h4 id="campaign-research-prompt-heading" className="text-sm font-semibold">Research prompts</h4><Badge variant="secondary">Owner controls</Badge>{customPromptCount > 0 && <Badge variant="outline">{customPromptCount} customized</Badge>}</div>
                              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">Choose a stage and adjust the instructions used the next time research runs. Saving applies to this client only and does not interrupt research already in progress.</p>
                            </div>
                          </div>

                          <div className="grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                            {/* Grouped and numbered, because the first seven are
                                one run in order and the last two fire when a
                                host replies. Flat and identical, they read as
                                nine unrelated settings. */}
                            <nav aria-label="Research prompt stages" className="space-y-4 border-b bg-muted/10 p-3 lg:border-b-0 lg:border-r">
                              {promptPhases.map((phase) => (
                                <div key={phase.id}>
                                  <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{phase.label}</p>
                                  <p className="mt-0.5 px-1 text-[10px] leading-4 text-muted-foreground/80">{phase.hint}</p>
                                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                                    {phase.prompts.map((prompt) => {
                                      const selected = prompt.id === selectedPromptId
                                      const customized = Boolean(clientPrompts[prompt.id]?.content ?? promptOverrides[prompt.id]?.content)
                                      const step = promptStepNumbers.get(prompt.id)
                                      return (
                                        <button
                                          key={prompt.id}
                                          type="button"
                                          aria-pressed={selected}
                                          className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-background hover:border-border hover:bg-muted/40'}`}
                                          onClick={() => selectPromptStage(prompt.id)}
                                        >
                                          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                            {step ?? '·'}
                                          </span>
                                          <span className="min-w-0 flex-1">
                                            <span className="block text-xs font-semibold leading-4">{prompt.label}</span>
                                            {/* Only the exception is labelled. Nine
                                                repetitions of "Workspace default"
                                                buried the one that had changed. */}
                                            {customized && (
                                              <span className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                                                Customized
                                              </span>
                                            )}
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </nav>

                            <div className="p-4 sm:p-5">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div><p className="text-sm font-semibold">{selectedPromptDefault.label}</p><p className="mt-1 text-xs text-muted-foreground">{selectedPromptDefault.description}</p></div>
                                <Badge variant={selectedPromptCustomized ? 'outline' : 'secondary'} className="w-fit">{selectedPromptCustomized ? 'Custom prompt' : 'Default prompt'}</Badge>
                              </div>
                              <div className="mt-3 rounded-lg border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Label htmlFor="campaign-research-stage-model" className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Model this stage runs on</Label>
                                  {promptModelsQuery.isError && (
                                    <button
                                      type="button"
                                      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                                      onClick={() => void promptModelsQuery.refetch()}
                                    >
                                      Retry
                                    </button>
                                  )}
                                </div>
                                <select
                                  id="campaign-research-stage-model"
                                  className="mt-2 h-8 w-full rounded border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={promptBusy || promptModelsQuery.isLoading || promptModelsQuery.isError || setPromptModelMutation.isPending}
                                  value={promptOverrides[selectedPromptId]?.model ?? ''}
                                  onChange={(event) => setPromptModelMutation.mutate({
                                    promptId: selectedPromptId,
                                    model: event.target.value === '' ? null : event.target.value,
                                  })}
                                >
                                  {/* Empty means "follow the shipped default", which is not the
                                      same as pinning that default's id — if we change the default
                                      for a stage, a workspace that never chose should move with it. */}
                                  <option value="">Default for this stage ({selectedPromptDefault.model})</option>
                                  {promptModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                      {model.label} — {model.id}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                                  {promptModelsQuery.isError
                                    ? 'The model list could not be read from Anthropic, so this cannot be changed right now. Everything else on this stage still saves.'
                                    : promptModelsQuery.isLoading
                                      ? 'Reading the models this workspace can use…'
                                      : 'Read live from Anthropic, so it reflects what this workspace\u2019s key can actually use. Stages run in order and share a cached copy of the research, and that cache is per model — putting one stage on a different model means it re-reads the context rather than reusing it.'}
                                </p>
                              </div>
                              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">System instruction (fixed)</p>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{selectedPromptDefault.system}</p>
                              </div>
                              <div className="mt-4 space-y-2">
                                <Label htmlFor="campaign-research-stage-prompt">Prompt instructions</Label>
                                <PromptVariableTextarea
                                  omitVariableIds={omittedVariableIds}
                                  availability={promptFieldAvailability}
                                  requiredVariableIds={promptRequirements[selectedPromptId] ?? []}
                                  requirementsDisabled={requirementsQuery.isLoading}
                                  onToggleRequired={(variableId, next) => toggleRequirement(variableId, next)}
                                  id="campaign-research-stage-prompt"
                                  ariaLabel={`Prompt for ${selectedPromptDefault.label}`}
                                  value={promptDraft}
                                  onChange={(next) => { setPromptTouched(true); setPromptDraft(next) }}
                                  disabled={promptBusy || promptOverridesQuery.isLoading}
                                  className="min-h-48 resize-y bg-background font-mono text-sm leading-7"
                                  maxLength={20_000}
                                />
                              </div>
                              <div className="mt-4">
                                <PromptFieldPreview
                                  content={promptDraft}
                                  preview={promptPreviewQuery.data ?? null}
                                  loading={promptPreviewQuery.isLoading}
                                  error={promptPreviewQuery.isError}
                                  onRetry={() => void promptPreviewQuery.refetch()}
                                  requiredVariableIds={promptRequirements[selectedPromptId] ?? []}
                                  onRefreshEpisodes={podcast?.podcast_id
                                    ? () => refreshEpisodesMutation.mutate()
                                    : undefined}
                                  refreshing={refreshEpisodesMutation.isPending}
                                  podcastName={podcast?.podcast_name}
                                />
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
                        {researchComplete && pitchAngles.length > 0
                          ? <div className="mt-4 grid gap-3 lg:grid-cols-3">{pitchAngles.slice(0, 3).map((angle, index) => <button key={`${angle.title}-${index}`} type="button" aria-label={`Select sequence ${index + 1}: ${angle.title}`} aria-pressed={selectedAngleIndex === index} disabled={researchWorking || !relationshipCanProceed} className={`relative flex min-h-48 flex-col rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selectedAngleIndex === index ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/15' : 'bg-background hover:border-primary/40'}`} onClick={() => choosePitchAngle(index)}><div className="flex items-center justify-between gap-2"><Badge variant="secondary">Option {index + 1}</Badge>{selectedAngleIndex === index && <Badge className="bg-primary text-primary-foreground hover:bg-primary">Selected</Badge>}</div><span className="mt-4 block text-sm font-semibold leading-5">{angle.title}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{angle.description}</span><span className="mt-auto pt-4 text-xs font-semibold text-primary">{selectedAngleIndex === index ? 'Previewing this sequence' : 'View this sequence'}</span></button>)}</div>
                          : (
                            <p className="mt-3 rounded-xl border border-dashed p-3 text-sm leading-6 text-muted-foreground">
                              {researchWorking
                                ? 'The prompt pipeline is running — three sequence directions appear here when every stage above completes.'
                                : 'Pitch angles are written by the research pipeline. Run research above and the three options appear here when it finishes.'}
                            </p>
                          )}
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
                                <div className="mt-3 max-w-2xl">
                                  <PitchTrustPanel
                                    generated={Boolean(selectedPitchMeta)}
                                    auditFlags={selectedPitchMeta?.auditFlags ?? []}
                                    grounding={pitchGrounding}
                                  />
                                </div>
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
                                <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Email 2 · Follow-up</Badge><span className="text-[11px] font-medium text-muted-foreground">Same thread</span></div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.followUpOneBody || 'The first follow-up will appear here.'}</p>
                              </article>

                              <article aria-label="Second follow-up preview" className="rounded-xl border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Email 3 · Close the loop</Badge><span className="text-[11px] font-medium text-muted-foreground">Same thread</span></div>
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

                  <PitchTrustPanel
                    generated={Boolean(selectedPitchMeta)}
                    auditFlags={selectedPitchMeta?.auditFlags ?? []}
                    liveIssues={liveCopyIssues}
                    grounding={pitchGrounding}
                  />

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
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeSequenceEmail === 'opening' ? 'Your personalized first note to the host or producer.' : activeSequenceEmail === 'follow_up_one' ? 'Follows up in the same thread, adding a second angle rather than bumping. Stops when the host replies.' : 'Closes the loop respectfully in the same thread, and ends the sequence.'}</p>
                      </div>
                      <Badge variant="outline" className={`w-fit ${sequenceEmailReady[activeSequenceEmail] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{sequenceEmailReady[activeSequenceEmail] ? 'Ready' : 'Needs copy'}</Badge>
                    </div>
                    <div className="space-y-4 p-5">
                      {activeSequenceEmail === 'opening' && (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="campaign-pitch-subject">Subject</Label>
                            <Input id="campaign-pitch-subject" value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} maxLength={300} />
                            <p className="text-[11px] leading-4 text-muted-foreground">Plain and specific beats clever. Hosts open on the idea, not the wording.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="campaign-pitch-body">Opening email</Label>
                            <Textarea id="campaign-pitch-body" value={draft.pitchBody} onChange={(event) => updateDraft('pitchBody', event.target.value)} className="min-h-72 resize-y" maxLength={20_000} />
                          </div>
                        </>
                      )}
                      {activeSequenceEmail === 'follow_up_one' && (
                        <div className="space-y-2">
                          <Label htmlFor="campaign-follow-up-one-body">Follow-up 1 reply</Label>
                          <Textarea id="campaign-follow-up-one-body" value={draft.followUpOneBody} onChange={(event) => updateDraft('followUpOneBody', event.target.value)} className="min-h-64 resize-y" maxLength={20_000} />
                        </div>
                      )}
                      {activeSequenceEmail === 'follow_up_two' && (
                        <div className="space-y-2">
                          <Label htmlFor="campaign-follow-up-two-body">Follow-up 2 reply</Label>
                          <Textarea id="campaign-follow-up-two-body" value={draft.followUpTwoBody} onChange={(event) => updateDraft('followUpTwoBody', event.target.value)} className="min-h-64 resize-y" maxLength={20_000} />
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* The last stop before a stranger is emailed. The campaign is live, so
            there is no draft state on the other side of this button and no way
            to recall what goes out. Naming the person and the address is the
            difference between a decision and a reflex. */}
        <Dialog open={confirmSendOpen} onOpenChange={(next) => !prepareMutation.isPending && setConfirmSendOpen(next)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Email {hostName.trim() || 'this host'} now?</DialogTitle>
              <DialogDescription>
                {chosenCampaign?.name || campaign?.name || 'This campaign'} is live. Adding this lead starts the sequence, so the
                opening email goes to {normalizedEmail} on the next send window without another approval.
              </DialogDescription>
            </DialogHeader>
            <dl className="mt-4 space-y-2 rounded-xl border bg-muted/30 p-4 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Podcast</dt><dd className="truncate font-medium">{podcast?.podcast_name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Sending as</dt><dd className="truncate font-medium">{clientName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Sequence</dt><dd className="font-medium">Opening, then day 6 and day 13</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              To add the lead without sending, pause {chosenCampaign?.name || campaign?.name || 'the campaign'} in Client Campaigns first.
            </p>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setConfirmSendOpen(false)} disabled={prepareMutation.isPending}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => prepareMutation.mutate()} disabled={prepareMutation.isPending}>
                {prepareMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add and start sending
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmRemoveOpen} onOpenChange={(next) => !removeMutation.isPending && setConfirmRemoveOpen(next)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Remove {podcast?.podcast_name || 'this podcast'} from the campaign?</DialogTitle>
              <DialogDescription>
                The lead is deleted in Instantly, so no further steps of the sequence go out and the
                pitch returns to editable here.
              </DialogDescription>
            </DialogHeader>
            {/* The one thing removal cannot do. Saying it plainly is the
                difference between an undo and a false promise. */}
            {target?.lead_staged_campaign_status === 1 && (
              <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                This campaign was live when the lead was added, so the opening email may already have
                reached {hostName.trim() || 'the host'}. Removing the lead stops what has not been sent
                yet; it cannot recall what has.
              </p>
            )}
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" onClick={() => setConfirmRemoveOpen(false)} disabled={removeMutation.isPending}>Keep in campaign</Button>
              <Button type="button" variant="destructive" onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}>
                {removeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remove from campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {podcast && !locked && !stagedResult && !campaignQuery.isLoading && (
          <footer aria-label="Pitch actions" className="shrink-0 border-t bg-muted/20 px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
            {prepareErrorAlert}
            <div className="flex flex-col gap-4 rounded-2xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                {activeStep === 'email' && (!relationshipCanProceed
                  ? relationshipSuppressed
                    ? 'This host is marked do not contact. Pitch preparation is disabled.'
                    : 'Review and confirm the relationship warning before continuing. No credit-bearing work has started.'
                  : emailReady
                  ? 'Email ready. Research is unlocked.'
                  : emailSearchRunning
                    ? publicPodcastEmail
                      ? 'The global direct-email search is still running. You can close this window or choose the free Podscan inbox while it continues.'
                      : 'The global direct-email search is still running. You can safely close this window and return later.'
                    : 'A valid email is required before you can continue to Research.')}
                {activeStep === 'research' && (researchWorking
                  ? researchRegenerating
                    ? 'Regeneration is running every saved workspace prompt in order, then writing the sequence. Closing this panel is fine; the run needs this tab to stay open, and every finished stage is saved if it stops.'
                    : 'Research is running. Closing this panel is fine; the run needs this tab to stay open, and every finished stage is saved if it stops.'
                  : researchFailed
                    ? 'Research paused before the pitch could be prepared. Completed stages are saved.'
                    : 'Research is saved to this podcast and used to shape the pitch.')}
                {activeStep === 'pitch' && (draftHasUnsavedEdits
                  ? 'You have unsaved edits. Save them before sending this sequence to Client Campaign.'
                  : alreadyStaged && !submitWillSend
                    ? `${hostName.trim() || 'This host'} is already a lead in ${chosenCampaign?.name || campaign?.name || 'the campaign'}. Sending again replaces the sequence on that lead rather than adding a second one, and the campaign is paused so nothing goes out.`
                    : submitWillSend
                      ? `All edits are saved. Sending ${alreadyStaged ? 'updates' : 'adds'} ${hostName.trim() || 'this host'} ${alreadyStaged ? 'in' : 'to'} ${chosenCampaign?.name || campaign?.name || 'the campaign'}, and that campaign is live, so the opening email goes out on its next send window.`
                      : 'All edits are saved. Sending adds this host to the campaign as a lead. The campaign is paused, so nothing goes out until you start outreach.')}
              </p>
              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
                {/* Only when there is a choice to make. One campaign needs no
                    picker, and a picker offering one option reads as a setting
                    somebody forgot to finish. */}
                {activeStep === 'pitch' && sendableCampaigns.length > 1 && (
                  <div className="flex items-center gap-2">
                    {/* Its own provider: this dialog is rendered from several
                        places, and depending on one mounted in App.tsx makes it
                        crash wherever that is not an ancestor. */}
                    <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor="send-target-campaign" className="cursor-help whitespace-nowrap text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
                          Send to
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Which campaign this host joins. Only campaigns created in this app
                        appear here — one built in Instantly carries its own copy, so a pitch
                        sent into it would go out as that copy instead of this one.
                      </TooltipContent>
                    </Tooltip>
                    </TooltipProvider>
                    <Select
                      value={activeCampaignId ?? undefined}
                      onValueChange={setChosenCampaignId}
                      disabled={locked || prepareMutation.isPending}
                    >
                      <SelectTrigger id="send-target-campaign" className="h-9 w-full sm:w-56">
                        <SelectValue placeholder="Choose a campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        {sendableCampaigns.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                {activeStep === 'pitch' && alreadyStaged && (
                  <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemoveOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />Remove from campaign
                  </Button>
                )}
                {activeStep !== 'email' && <Button type="button" variant="outline" onClick={() => setActiveStep(activeStep === 'pitch' ? 'research' : 'email')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>}
                {activeStep === 'email' && <Button type="button" disabled={!emailReady || !relationshipCanProceed} onClick={() => setActiveStep('research')}>Continue to research<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'research' && <Button type="button" disabled={!researchComplete} onClick={() => { setActiveSequenceEmail('opening'); setActiveStep('pitch') }}>Finalize selected pitch<ArrowRight className="ml-2 h-4 w-4" /></Button>}
                {activeStep === 'pitch' && <Button type="button" variant={submitWillSend ? 'destructive' : 'default'} disabled={submitDisabled} onClick={() => (submitWillSend ? setConfirmSendOpen(true) : prepareMutation.mutate())}>{prepareMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{submitWillSend ? 'Send to Client Campaign (goes live)' : alreadyStaged ? 'Update in Client Campaign' : 'Send to Client Campaign'}</Button>}
              </div>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  )
}
