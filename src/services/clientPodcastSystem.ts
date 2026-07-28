import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type ClientPodcastLifecycleStage =
  | 'awaiting_review'
  | 'approved'
  | 'contact_needed'
  | 'research_needed'
  | 'ready'
  | 'outreach'
  | 'conversation'
  | 'booked'
  | 'recorded'
  | 'published'

export type ClientPodcastLifecycleOutcome = 'rejected' | 'cancelled' | 'archived' | null

export interface ClientPodcastSystemClient {
  id: string
  name: string
  status: string
  photo_url: string | null
  email: string | null
  contact_person: string | null
  website: string | null
  bio: string | null
  profile: {
    ready: boolean
    completed_fields: number
    total_fields: number
    positioning: string | null
    updated_at: string | null
    has_calendar: boolean
    has_media_kit: boolean
  }
  dashboard_configured: boolean
  portal: {
    enabled: boolean
    last_login_at: string | null
  }
  onboarding: {
    id: string
    status: 'invited' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'expired' | 'revoked'
    invited_at: string
    submitted_at: string | null
    approved_at: string | null
    updated_at: string
  } | null
  podcast_count: number
  created_at: string
  updated_at: string
  last_activity_at: string | null
}

export interface ClientPodcastSystemItem {
  id: string
  client: {
    id: string
    name: string
    status: string
    photo_url: string | null
  }
  podcast: {
    id: string | null
    podscan_id: string
    name: string
    description: string | null
    image_url: string | null
    url: string | null
    publisher_name: string | null
    host_name: string | null
    audience_size: number | null
    last_posted_at: string | null
  }
  stage: ClientPodcastLifecycleStage
  outcome: ClientPodcastLifecycleOutcome
  terminal: boolean
  has_conflict: boolean
  next_action: string | null
  contact: {
    available: boolean
    source: 'campaign' | 'direct' | 'podscan' | 'none'
    email: string | null
    verified_at: string | null
  }
  decision: {
    status: 'approved' | 'rejected' | null
    notes: string | null
    updated_at: string | null
  }
  analysis: {
    source: 'normalized' | 'legacy_cache' | 'none'
    clean_description: string | null
    fit_reasons: string[]
    pitch_angles: Array<{ title: string; description: string }>
    analyzed_at: string | null
  }
  campaign: {
    id: string
    target_id: string
    status: 'draft' | 'ready' | 'launching' | 'in_outreach' | 'replied' | 'completed' | 'failed'
    research_ready: boolean
    pitch_ready: boolean
    open_count: number
    reply_count: number
    launched_at: string | null
    last_activity_at: string | null
    last_error: string | null
  } | null
  legacy_outreach_at: string | null
  /**
   * The Master Inbox conversation with this host, when there is one.
   * thread_key is null when a reply is known from a campaign sync but the
   * inbox has not read the thread in yet, so there is nothing to open.
   */
  conversation: {
    thread_key: string | null
    status: string | null
    replied: boolean
    updated_at: string | null
  } | null
  booking: {
    id: string
    match: 'podcast_id' | 'podcast_name'
    status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
    host_name: string | null
    scheduled_date: string | null
    recording_date: string | null
    publish_date: string | null
    episode_url: string | null
    prep_sent: boolean
    notes: string | null
    created_at: string
    updated_at: string
  } | null
  operator_notes: string | null
  shortlist_created_at: string
  shortlist_updated_at: string
  last_activity_at: string | null
}

export interface ClientPodcastSystemResponse {
  workspace: { id: string; name: string }
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage: boolean
  generated_at: string
  clients: ClientPodcastSystemClient[]
  summary: {
    total: number
    active: number
    completed: number
    needs_attention: number
    upcoming_recordings: number
    awaiting_publication: number
    stage_counts: Record<ClientPodcastLifecycleStage, number>
  }
  items: ClientPodcastSystemItem[]
}

export async function getWorkspaceClientPodcastSystem(
  workspaceId: string,
): Promise<ClientPodcastSystemResponse> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-client-podcast-system', {
    body: {
      action: 'list',
      workspace_id: canonicalWorkspaceId,
    },
  })
  if (error) {
    throw await toFunctionError(error, 'The Client Command Center could not be loaded.')
  }

  const response = data as ClientPodcastSystemResponse | null
  if (
    !response?.workspace
    || typeof response.workspace.id !== 'string'
    || response.workspace.id.toLowerCase() !== canonicalWorkspaceId
    || !Array.isArray(response.clients)
    || !Array.isArray(response.items)
    || !response.summary
  ) {
    throw new Error('The Client Command Center response did not match the workspace address.')
  }
  return response
}
