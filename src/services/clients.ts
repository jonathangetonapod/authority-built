import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import {
  clientSdrProfileReadiness,
  isClientSdrProfile,
  normalizeClientSdrProfile,
  type ClientSdrProfile,
  type ClientSdrProfileField,
  type ClientSdrProfileReadiness,
} from '@/lib/clientSdrProfile'

export interface Client {
  id: string
  workspace_id?: string | null
  workspace?: {
    id: string
    name: string
    slug: string
    is_default: boolean
  } | null
  name: string
  email: string | null
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  bio: string | null
  ai_sdr_profile?: Partial<ClientSdrProfile> | null
  ai_sdr_profile_updated_at?: string | null
  ai_sdr_mode?: WorkspaceClientSdrMode
  photo_url: string | null
  google_sheet_url: string | null
  media_kit_url: string | null
  prospect_dashboard_slug: string | null
  dashboard_slug?: string | null
  dashboard_enabled?: boolean
  outreach_webhook_url: string | null
  bison_campaign_id: string | null
  created_at: string
  updated_at: string
  company?: string | null
  // Portal access fields
  portal_access_enabled?: boolean
  portal_last_login_at?: string | null
  portal_invitation_sent_at?: string | null
  password_set_at?: string | null
  password_set_by?: string | null
}

export interface WorkspaceClient {
  id: string
  workspace_id: string
  name: string
  email: string | null
  contact_person: string | null
  linkedin_url: string | null
  website: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  ai_sdr_profile_ready?: boolean
  ai_sdr_profile_completed_fields?: number
  ai_sdr_profile_total_fields?: number
  ai_sdr_profile_updated_at?: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceClientProfile extends WorkspaceClient {
  bio: string | null
  photo_url: string | null
  calendar_link: string | null
  media_kit_url: string | null
  prospect_dashboard_slug: string | null
  dashboard_slug: string | null
  dashboard_enabled: boolean
  portal_access_enabled: boolean
  portal_last_login_at: string | null
  password_set_at: string | null
  ai_sdr_profile: Partial<ClientSdrProfile>
  ai_sdr_profile_updated_at: string | null
  ai_sdr_mode?: WorkspaceClientSdrMode
  ai_sdr_readiness: ClientSdrProfileReadiness
}

export interface WorkspaceClientProfileUpdate {
  id: string
  workspace_id: string
  bio: string | null
  updated_at: string
}

export interface WorkspaceClientSdrProfileUpdate {
  id: string
  workspace_id: string
  ai_sdr_profile: ClientSdrProfile
  ai_sdr_profile_updated_at: string
  ai_sdr_readiness: ClientSdrProfileReadiness
}

export interface WorkspaceClientSdrContext {
  client_id: string
  workspace_id: string
  client_name: string
  client_status: 'active' | 'paused' | 'churned'
  approved_guest_profile: string | null
  calendar_link: string | null
  ai_sdr_profile: ClientSdrProfile
  ai_sdr_profile_updated_at: string | null
  readiness: ClientSdrProfileReadiness
  safe_to_draft: boolean
  delivery_authorized: false
}

export interface WorkspaceClientDashboardSummary {
  configured: boolean
  enabled: boolean
  tagline: string | null
  view_count: number
  last_viewed_at: string | null
  podcast_count: number
  reviewed_count: number
  approved_count: number
  rejected_count: number
  to_review_count: number
  analyzed_count: number
  last_synced_at: string | null
  last_feedback_at: string | null
}

export interface WorkspaceClientOutreachSummary {
  initial_emails_sent: number
  podcasts_contacted: number
  pending_review_count: number
  approved_count: number
  failed_count: number
  last_sent_at: string | null
}

export interface WorkspaceClientBooking {
  id: string
  client_id: string
  podcast_id: string | null
  shortlist_podcast_id?: string | null
  campaign_target_id?: string | null
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
  episode_url: string | null
  prep_sent: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceClientBookingInput {
  podcast_name: string
  podcast_url?: string | null
  host_name?: string | null
  status: WorkspaceClientBooking['status']
  scheduled_date?: string | null
  recording_date?: string | null
  publish_date?: string | null
  episode_url?: string | null
  notes?: string | null
  prep_sent?: boolean
  shortlist_podcast_id?: string | null
  campaign_target_id?: string | null
}

export async function saveWorkspaceClientBooking(
  workspaceId: string,
  clientId: string,
  booking: WorkspaceClientBookingInput,
  bookingId?: string,
): Promise<WorkspaceClientBooking> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: bookingId ? 'booking-update' : 'booking-create',
      workspace_id: workspaceId.toLowerCase(),
      client_id: clientId.toLowerCase(),
      ...(bookingId ? { booking_id: bookingId } : {}),
      booking,
    },
  })
  if (error) throw await toFunctionError(error, 'The placement could not be saved.')
  if (!data?.booking) throw new Error('The placement could not be saved.')
  return data.booking as WorkspaceClientBooking
}

export async function deleteWorkspaceClientBooking(
  workspaceId: string,
  clientId: string,
  bookingId: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'booking-delete',
      workspace_id: workspaceId.toLowerCase(),
      client_id: clientId.toLowerCase(),
      booking_id: bookingId,
    },
  })
  if (error) throw await toFunctionError(error, 'The placement could not be removed.')
  if (!data?.success) throw new Error('The placement could not be removed.')
}

export interface WorkspaceClientOnboardingSummary {
  id: string
  workspace_id: string
  client_id: string
  recipient_name: string
  recipient_email: string
  status: 'invited' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'expired' | 'revoked'
  invited_at: string
  started_at: string | null
  submitted_at: string | null
  approved_at: string | null
  updated_at: string
  archived_at: string | null
}

export interface WorkspaceClientDetail {
  workspace: WorkspaceResearchContext['workspace']
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage: boolean
  client: WorkspaceClientProfile
  dashboard: WorkspaceClientDashboardSummary
  outreach: WorkspaceClientOutreachSummary
  bookings: WorkspaceClientBooking[]
  onboarding: WorkspaceClientOnboardingSummary | null
}

export interface WorkspaceClientInput {
  name: string
  email?: string
  contact_person?: string
  linkedin_url?: string
  website?: string
  status: 'active' | 'paused' | 'churned'
  notes?: string
}

export interface WorkspaceResearchContext {
  workspace: {
    id: string
    name: string
    slug: string | null
    status: string
    is_default: boolean
    logo_path: string | null
    logo_updated_at: string | null
  }
  client: {
    id: string
    workspace_id: string
    name: string
    email: string | null
    website: string | null
    status: 'active'
    bio: string | null
    photo_url: string | null
    updated_at: string
  }
  existing_podcast_ids: string[]
}

const cleanWorkspaceClientInput = (input: WorkspaceClientInput) => ({
  name: input.name.trim(),
  email: input.email?.trim() || null,
  contact_person: input.contact_person?.trim() || null,
  linkedin_url: input.linkedin_url?.trim() || null,
  website: input.website?.trim() || null,
  status: input.status,
  notes: input.notes?.trim() || null,
})

const EMPTY_WORKSPACE_CLIENT_OUTREACH: WorkspaceClientOutreachSummary = {
  initial_emails_sent: 0,
  podcasts_contacted: 0,
  pending_review_count: 0,
  approved_count: 0,
  failed_count: 0,
  last_sent_at: null,
}

function isWorkspaceClientOutreachSummary(value: unknown): value is WorkspaceClientOutreachSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const summary = value as Record<string, unknown>
  const counts = [
    summary.initial_emails_sent,
    summary.podcasts_contacted,
    summary.pending_review_count,
    summary.approved_count,
    summary.failed_count,
  ]
  return counts.every((count) => Number.isInteger(count) && Number(count) >= 0)
    && Number(summary.podcasts_contacted) <= Number(summary.initial_emails_sent)
    && (summary.last_sent_at === null || typeof summary.last_sent_at === 'string')
}

function parseClientSdrReadiness(
  value: unknown,
  profile: ClientSdrProfile,
): ClientSdrProfileReadiness | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const expected = clientSdrProfileReadiness(profile)
  const missingFields = input.missing_fields
  const missingCoreFields = input.missing_core_fields
  const validFields = (fields: unknown): fields is ClientSdrProfileField[] => (
    Array.isArray(fields)
    && fields.every((field) => typeof field === 'string')
  )
  if (
    input.ready !== expected.ready
    || input.completed_fields !== expected.completed_fields
    || input.total_fields !== expected.total_fields
    || !validFields(missingFields)
    || !validFields(missingCoreFields)
    || missingFields.join('|') !== expected.missing_fields.join('|')
    || missingCoreFields.join('|') !== expected.missing_core_fields.join('|')
  ) return null
  return expected
}

export async function getWorkspaceClients(workspaceId: string): Promise<WorkspaceClient[]> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: { action: 'list', workspace_id: canonicalWorkspaceId },
  })

  if (error) throw await toFunctionError(error, 'Failed to fetch clients.')
  const clients = (data?.clients || []) as WorkspaceClient[]
  const emptyReadiness = clientSdrProfileReadiness({})
  if (clients.some((client) => client.workspace_id !== canonicalWorkspaceId)) {
    throw new Error('The workspace client list did not match the requested workspace.')
  }
  return clients.map((client) => ({
    ...client,
    ai_sdr_profile_ready: client.ai_sdr_profile_ready === true,
    ai_sdr_profile_completed_fields: Number.isInteger(client.ai_sdr_profile_completed_fields)
      ? Math.max(0, Math.min(emptyReadiness.total_fields, client.ai_sdr_profile_completed_fields || 0))
      : 0,
    ai_sdr_profile_total_fields: emptyReadiness.total_fields,
    ai_sdr_profile_updated_at: typeof client.ai_sdr_profile_updated_at === 'string'
      ? client.ai_sdr_profile_updated_at
      : null,
  }))
}

export async function getWorkspaceResearchContext(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceResearchContext> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'research-get',
      workspace_id: canonicalWorkspaceId,
      client_id: canonicalClientId,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to load podcast research context.')
  const context = data as (
    Omit<WorkspaceResearchContext, 'existing_podcast_ids'>
    & { existing_podcast_ids?: unknown }
  ) | null
  if (
    !context?.workspace
    || !context.client
    || context.workspace.id !== canonicalWorkspaceId
    || context.client.workspace_id !== canonicalWorkspaceId
    || context.client.id !== canonicalClientId
    || context.client.status !== 'active'
  ) {
    throw new Error('The podcast research context did not match the workspace client address.')
  }

  const rawExistingPodcastIds = context.existing_podcast_ids
  if (
    rawExistingPodcastIds !== undefined
    && (
      !Array.isArray(rawExistingPodcastIds)
      || rawExistingPodcastIds.length > 20_000
      || rawExistingPodcastIds.some((podcastId) => (
        typeof podcastId !== 'string'
        || !podcastId.trim()
        || podcastId.length > 200
      ))
    )
  ) {
    throw new Error('The podcast research history response was invalid.')
  }

  return {
    ...context,
    existing_podcast_ids: Array.from(new Set(Array.isArray(rawExistingPodcastIds)
      ? rawExistingPodcastIds.map((podcastId) => podcastId.trim())
      : [])),
  }
}

export async function getWorkspaceClientDetail(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceClientDetail> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'detail-get',
      workspace_id: canonicalWorkspaceId,
      client_id: canonicalClientId,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to load client details.')
  const detail = data as (
    Omit<WorkspaceClientDetail, 'outreach'>
    & { outreach?: unknown }
  ) | null
  const outreach = detail?.outreach === undefined
    ? EMPTY_WORKSPACE_CLIENT_OUTREACH
    : detail.outreach
  const sdrProfile = detail?.client && isClientSdrProfile(detail.client.ai_sdr_profile)
    ? normalizeClientSdrProfile(detail.client.ai_sdr_profile)
    : null
  const sdrReadiness = sdrProfile
    ? parseClientSdrReadiness(detail?.client.ai_sdr_readiness, sdrProfile)
    : null
  if (
    !detail?.workspace
    || !detail.client
    || detail.workspace.id !== canonicalWorkspaceId
    || detail.client.workspace_id !== canonicalWorkspaceId
    || detail.client.id !== canonicalClientId
    || !sdrProfile
    || !sdrReadiness
    || (
      detail.client.ai_sdr_profile_updated_at !== null
      && typeof detail.client.ai_sdr_profile_updated_at !== 'string'
    )
    || !Array.isArray(detail.bookings)
    || detail.bookings.length > 500
    || detail.bookings.some((booking) => booking.client_id !== canonicalClientId)
    || !detail.dashboard
    || typeof detail.dashboard.configured !== 'boolean'
    || typeof detail.dashboard.enabled !== 'boolean'
    || detail.dashboard.configured !== Boolean(detail.client.dashboard_slug)
    || detail.dashboard.enabled !== Boolean(detail.client.dashboard_slug)
    || (detail.dashboard.tagline !== null && typeof detail.dashboard.tagline !== 'string')
    || (detail.dashboard.last_viewed_at !== null && typeof detail.dashboard.last_viewed_at !== 'string')
    || (detail.dashboard.last_synced_at !== null && typeof detail.dashboard.last_synced_at !== 'string')
    || (detail.dashboard.last_feedback_at !== null && typeof detail.dashboard.last_feedback_at !== 'string')
    || [
      detail.dashboard.view_count,
      detail.dashboard.podcast_count,
      detail.dashboard.reviewed_count,
      detail.dashboard.approved_count,
      detail.dashboard.rejected_count,
      detail.dashboard.to_review_count,
      detail.dashboard.analyzed_count,
    ].some((value) => !Number.isInteger(value) || value < 0)
    || detail.dashboard.reviewed_count !== detail.dashboard.approved_count + detail.dashboard.rejected_count
    || detail.dashboard.reviewed_count + detail.dashboard.to_review_count !== detail.dashboard.podcast_count
    || detail.dashboard.analyzed_count > detail.dashboard.podcast_count
    || !isWorkspaceClientOutreachSummary(outreach)
    || (detail.onboarding !== null && (
      detail.onboarding.workspace_id !== canonicalWorkspaceId
      || detail.onboarding.client_id !== canonicalClientId
    ))
  ) {
    throw new Error('The client detail response did not match the workspace client address.')
  }

  return {
    ...detail,
    client: {
      ...detail.client,
      ai_sdr_profile: sdrProfile,
      ai_sdr_readiness: sdrReadiness,
    },
    outreach,
  }
}

export async function createWorkspaceClient(workspaceId: string, input: WorkspaceClientInput): Promise<WorkspaceClient> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'create',
      workspace_id: workspaceId,
      client: cleanWorkspaceClientInput(input),
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to create client.')
  return data.client as WorkspaceClient
}

export async function updateWorkspaceClient(
  workspaceId: string,
  clientId: string,
  input: WorkspaceClientInput,
): Promise<WorkspaceClient> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'update',
      workspace_id: workspaceId,
      client_id: clientId,
      client: cleanWorkspaceClientInput(input),
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to update client.')
  return data.client as WorkspaceClient
}

export async function rotateWorkspaceClientDashboardSlug(
  workspaceId: string,
  clientId: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'dashboard-slug-rotate',
      workspace_id: workspaceId,
      client_id: clientId,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to regenerate the dashboard link.')
  if (typeof data?.dashboard_slug !== 'string' || !data.dashboard_slug) {
    throw new Error('Failed to regenerate the dashboard link.')
  }
  return data.dashboard_slug
}

export async function updateWorkspaceClientProfile(
  workspaceId: string,
  clientId: string,
  bio: string,
  expectedUpdatedAt: string,
): Promise<WorkspaceClientProfileUpdate> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'profile-update',
      workspace_id: canonicalWorkspaceId,
      client_id: canonicalClientId,
      bio: bio.trim() || null,
      expected_updated_at: expectedUpdatedAt,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to update the approved client profile.')
  const updated = data?.client as WorkspaceClientProfileUpdate | null
  if (
    !updated
    || updated.id !== canonicalClientId
    || updated.workspace_id !== canonicalWorkspaceId
    || (updated.bio !== null && typeof updated.bio !== 'string')
    || typeof updated.updated_at !== 'string'
  ) {
    throw new Error('The updated client profile did not match the workspace client address.')
  }
  return updated
}

export async function getWorkspaceClientSdrContext(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceClientSdrContext> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'sdr-context-get',
      workspace_id: canonicalWorkspaceId,
      client_id: canonicalClientId,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to load the client AI SDR context.')
  const context = data?.context as Record<string, unknown> | null
  if (!context || !isClientSdrProfile(context.ai_sdr_profile)) {
    throw new Error('The client AI SDR context response was invalid.')
  }
  const profile = normalizeClientSdrProfile(context.ai_sdr_profile)
  const readiness = parseClientSdrReadiness(context.readiness, profile)
  if (
    context.client_id !== canonicalClientId
    || context.workspace_id !== canonicalWorkspaceId
    || !['active', 'paused', 'churned'].includes(String(context.client_status))
    || typeof context.client_name !== 'string'
    || !context.client_name.trim()
    || (context.approved_guest_profile !== null && typeof context.approved_guest_profile !== 'string')
    || (context.calendar_link !== null && typeof context.calendar_link !== 'string')
    || (
      context.ai_sdr_profile_updated_at !== null
      && typeof context.ai_sdr_profile_updated_at !== 'string'
    )
    || !readiness
    || context.safe_to_draft !== (context.client_status === 'active' && readiness.ready)
    || context.delivery_authorized !== false
  ) {
    throw new Error('The client AI SDR context did not match the workspace client address.')
  }

  return {
    client_id: canonicalClientId,
    workspace_id: canonicalWorkspaceId,
    client_name: context.client_name,
    client_status: context.client_status as WorkspaceClientSdrContext['client_status'],
    approved_guest_profile: context.approved_guest_profile as string | null,
    calendar_link: context.calendar_link as string | null,
    ai_sdr_profile: profile,
    ai_sdr_profile_updated_at: context.ai_sdr_profile_updated_at as string | null,
    readiness,
    safe_to_draft: context.safe_to_draft,
    delivery_authorized: false,
  }
}

/**
 * manual     — nothing happens without a person.
 * auto_draft — replies are written and staged for review, never sent.
 * auto_send  — staged replies dispatch themselves after a hold window.
 */
export type WorkspaceClientSdrMode = 'manual' | 'auto_draft' | 'auto_send'

export async function setWorkspaceClientSdrMode(
  workspaceId: string,
  clientId: string,
  mode: WorkspaceClientSdrMode,
): Promise<WorkspaceClientSdrMode> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'sdr-mode-set',
      workspace_id: workspaceId.toLowerCase(),
      client_id: clientId.toLowerCase(),
      mode,
    },
  })
  if (error) throw await toFunctionError(error, 'The AI SDR mode could not be saved.')
  return data?.ai_sdr_mode === 'auto_draft' || data?.ai_sdr_mode === 'auto_send'
    ? data.ai_sdr_mode
    : 'manual'
}

export async function updateWorkspaceClientSdrProfile(
  workspaceId: string,
  clientId: string,
  profile: ClientSdrProfile,
  expectedProfileUpdatedAt: string | null,
): Promise<WorkspaceClientSdrProfileUpdate> {
  const canonicalWorkspaceId = workspaceId.toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const normalizedProfile = normalizeClientSdrProfile(profile)
  const compactProfile = Object.fromEntries(
    Object.entries(normalizedProfile).filter(([, value]) => Boolean(value)),
  )
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: {
      action: 'sdr-profile-update',
      workspace_id: canonicalWorkspaceId,
      client_id: canonicalClientId,
      ai_sdr_profile: compactProfile,
      expected_profile_updated_at: expectedProfileUpdatedAt,
    },
  })

  if (error) throw await toFunctionError(error, 'Failed to update the client AI SDR profile.')
  const updated = data?.client as Record<string, unknown> | null
  if (!updated || !isClientSdrProfile(updated.ai_sdr_profile)) {
    throw new Error('The updated AI SDR profile response was invalid.')
  }
  const updatedProfile = normalizeClientSdrProfile(updated.ai_sdr_profile)
  const readiness = parseClientSdrReadiness(updated.ai_sdr_readiness, updatedProfile)
  if (
    updated.id !== canonicalClientId
    || updated.workspace_id !== canonicalWorkspaceId
    || typeof updated.ai_sdr_profile_updated_at !== 'string'
    || !readiness
  ) {
    throw new Error('The updated AI SDR profile did not match the workspace client address.')
  }

  return {
    id: canonicalClientId,
    workspace_id: canonicalWorkspaceId,
    ai_sdr_profile: updatedProfile,
    ai_sdr_profile_updated_at: updated.ai_sdr_profile_updated_at,
    ai_sdr_readiness: readiness,
  }
}

export async function deleteWorkspaceClient(workspaceId: string, clientId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('workspace-clients', {
    body: { action: 'delete', workspace_id: workspaceId, client_id: clientId },
  })

  if (error) throw await toFunctionError(error, 'Failed to delete client.')
}

export interface ClientWithStats extends Client {
  total_bookings: number
  booked_count: number
  in_progress_count: number
  recorded_count: number
  published_count: number
}

/**
 * Get all clients with optional filtering
 */
export async function getClients(options?: {
  search?: string
  status?: 'active' | 'paused' | 'churned'
  workspaceId?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('clients')
    .select('*, workspace:workspaces(id,name,slug,is_default)', { count: 'exact' })

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  if (options?.workspaceId) {
    query = query.eq('workspace_id', options.workspaceId)
  }

  // Search by name or email
  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
  }

  // Order by name
  query = query.order('name', { ascending: true })

  // Pagination
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  const clients = data as Client[]
  if (options?.workspaceId && clients.some((client) => client.workspace_id !== options.workspaceId)) {
    throw new Error('The selected workspace response did not match the client scope.')
  }

  return { clients, total: count || 0 }
}

/**
 * Get a single client by ID
 */
export async function getClientById(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*, workspace:workspaces(id,name,slug,is_default)')
    .eq('id', clientId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data as Client
}

/**
 * Create a new client
 */
export async function createClient(input: {
  name: string
  email?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status?: 'active' | 'paused' | 'churned'
  notes?: string
}) {
  const { data, error } = await supabase
    .from('clients')
    .insert([input])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`)
  }

  return data as Client
}

/**
 * Update an existing client
 */
export async function updateClient(clientId: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update client: ${error.message}`)
  }

  return data as Client
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to delete client: ${error.message}`)
  }
}

/**
 * Set or update client portal password
 */
export async function setClientPassword(clientId: string, password: string, setBy: string = 'Admin') {
  const { error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: {
      action: 'set',
      client_id: clientId,
      password,
      set_by: setBy,
    },
  })

  if (error) {
    throw await toFunctionError(error, 'Failed to set portal password.')
  }
}

/**
 * Set or reset a client portal password from an explicitly selected workspace.
 * The plaintext password is sent only to the authenticated Edge Function and
 * is never persisted by this service or returned by the API.
 */
export async function setWorkspaceClientPassword(
  workspaceId: string,
  clientId: string,
  password: string,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: {
      action: 'set',
      workspace_id: workspaceId,
      client_id: clientId,
      password,
    },
  })

  if (error) {
    throw await toFunctionError(error, 'The client portal password could not be set.')
  }
  if (
    !data
    || typeof data !== 'object'
    || data.success !== true
    || data.configured !== true
  ) {
    throw new Error('The client portal password response was invalid.')
  }
}

export async function sendWorkspaceClientPortalInvite(
  workspaceId: string,
  clientId: string,
): Promise<'sent' | 'skipped' | 'failed'> {
  const { data, error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: {
      action: 'invite',
      workspace_id: workspaceId,
      client_id: clientId,
    },
  })

  if (error) {
    throw await toFunctionError(error, 'The portal invitation could not be sent.')
  }
  const status = data?.delivery?.status
  if (data?.success !== true || !['sent', 'skipped', 'failed'].includes(status)) {
    throw new Error('The portal invitation response was invalid.')
  }
  return status as 'sent' | 'skipped' | 'failed'
}

/**
 * Clear client portal password
 */
export async function clearClientPassword(clientId: string) {
  const { error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: { action: 'clear', client_id: clientId },
  })

  if (error) {
    throw await toFunctionError(error, 'Failed to clear portal password.')
  }
}

/**
 * Generate a random password
 */
export function generatePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)

  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length]
  }

  return password
}

/**
 * Get client statistics
 */
export async function getClientStats() {
  // Total clients
  const { count: totalClients, error: clientsError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })

  if (clientsError) {
    throw new Error(`Failed to fetch client count: ${clientsError.message}`)
  }

  // Active clients
  const { count: activeClients, error: activeError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (activeError) {
    throw new Error(`Failed to fetch active client count: ${activeError.message}`)
  }

  // Total bookings
  const { count: totalBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })

  if (bookingsError) {
    throw new Error(`Failed to fetch bookings count: ${bookingsError.message}`)
  }

  return {
    totalClients: totalClients || 0,
    activeClients: activeClients || 0,
    totalBookings: totalBookings || 0,
  }
}

/**
 * Upload client photo to Supabase Storage
 */
export async function uploadClientPhoto(clientId: string, file: File) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${clientId}-${Date.now()}.${fileExt}`
  const filePath = `client-photos/${fileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('client-assets')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    })

  if (uploadError) {
    throw new Error(`Failed to upload photo: ${uploadError.message}`)
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('client-assets')
    .getPublicUrl(filePath)

  // Update client record with photo URL
  const { data, error } = await supabase
    .from('clients')
    .update({ photo_url: publicUrl })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update client photo URL: ${error.message}`)
  }

  return data as Client
}

/**
 * Remove client photo
 */
export async function removeClientPhoto(clientId: string, photoUrl: string) {
  let filePath: string
  try {
    const parsedUrl = new URL(photoUrl)
    const publicObjectMarker = '/storage/v1/object/public/client-assets/'
    const markerIndex = parsedUrl.pathname.indexOf(publicObjectMarker)
    if (markerIndex === -1) throw new Error('bucket marker not found')
    filePath = decodeURIComponent(
      parsedUrl.pathname.slice(markerIndex + publicObjectMarker.length),
    )
  } catch {
    throw new Error('Invalid photo URL')
  }

  if (
    !filePath.startsWith(`client-photos/${clientId}-`)
    || filePath.includes('..')
    || filePath.includes('\\')
  ) {
    throw new Error('Invalid photo path')
  }

  // Delete from storage
  const { error: deleteError } = await supabase.storage
    .from('client-assets')
    .remove([filePath])

  if (deleteError) {
    console.error('Failed to delete photo from storage:', deleteError)
    // Continue anyway to clear the URL
  }

  // Clear photo URL in database
  const { data, error } = await supabase
    .from('clients')
    .update({ photo_url: null })
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to clear client photo URL: ${error.message}`)
  }

  return data as Client
}

export async function createWorkspaceClientPortalSetupLink(
  workspaceId: string,
  clientId: string,
): Promise<{ url: string; login_url: string; expires_at: string }> {
  const { data, error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: { action: 'setup-link', workspace_id: workspaceId, client_id: clientId },
  })
  if (error) throw await toFunctionError(error, 'The setup link could not be created.')
  if (!data || data.success !== true || typeof data.url !== 'string') {
    throw new Error('The setup link response was invalid.')
  }
  return { url: data.url, login_url: data.login_url, expires_at: data.expires_at }
}

export interface WorkspaceClientPortalPreview {
  session_token: string
  expires_at: string
  client: {
    id: string
    name: string
    email: string | null
    photo_url: string | null
    dashboard_slug: string | null
  }
}

export async function createWorkspaceClientPortalPreview(
  workspaceId: string,
  clientId: string,
): Promise<WorkspaceClientPortalPreview> {
  const { data, error } = await supabase.functions.invoke('manage-client-portal-password', {
    body: { action: 'preview-session', workspace_id: workspaceId, client_id: clientId },
  })
  if (error) throw await toFunctionError(error, 'The portal preview could not be started.')
  if (!data || data.success !== true || typeof data.session_token !== 'string' || !data.client) {
    throw new Error('The portal preview response was invalid.')
  }
  return {
    session_token: data.session_token,
    expires_at: data.expires_at,
    client: data.client,
  }
}

export async function draftWorkspaceClientSdrProfile(
  workspaceId: string,
  clientId: string,
): Promise<{ draft: Partial<ClientSdrProfile>; evidence_shows: number }> {
  const { data, error } = await supabase.functions.invoke('workspace-clients', {
    body: { action: 'sdr-profile-draft', workspace_id: workspaceId.toLowerCase(), client_id: clientId.toLowerCase() },
  })
  if (error) throw await toFunctionError(error, 'The profile draft could not be generated.')
  if (!data || data.success !== true || !data.draft || typeof data.draft !== 'object') {
    throw new Error('The profile draft response was invalid.')
  }
  return { draft: data.draft as Partial<ClientSdrProfile>, evidence_shows: Number(data.evidence_shows) || 0 }
}
