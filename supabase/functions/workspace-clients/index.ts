import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireAuthenticatedUser,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, retryWindowKey } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { notifyBookingConfirmed, notifyEpisodePublished } from '../_shared/clientNotify.ts'

const METHODS = ['POST'] as const
const CLIENT_FIELDS = [
  'name',
  'email',
  'contact_person',
  'linkedin_url',
  'website',
  'status',
  'notes',
] as const
const AI_SDR_PROFILE_FIELDS = [
  'positioning',
  'topics_and_angles',
  'listener_takeaways',
  'proof_points',
  'ideal_opportunities',
  'booking_details',
] as const
const AI_SDR_CORE_FIELDS = [
  'positioning',
  'topics_and_angles',
  'listener_takeaways',
  'booking_details',
] as const
const AI_SDR_PROFILE_MAX_FIELD_LENGTH = 4_000

type AiSdrProfileField = typeof AI_SDR_PROFILE_FIELDS[number]
type AiSdrProfile = Partial<Record<AiSdrProfileField, string>>

function optionalUrl(value: unknown, field: string): string | null {
  const result = optionalString(value, field, 2048)
  if (!result) return null

  let parsed: URL
  try {
    parsed = new URL(result)
  } catch {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid URL`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an HTTP or HTTPS URL`)
  }
  return parsed.toString()
}

function requireTimestamp(value: unknown, field: string): string {
  const result = requireString(value, field, { max: 64 })
  if (Number.isNaN(Date.parse(result))) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid timestamp`)
  }
  return result
}

function nullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null
  return requireTimestamp(value, field)
}

function aiSdrProfile(value: unknown): AiSdrProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_AI_SDR_PROFILE', 'ai_sdr_profile must be an object')
  }
  const input = value as Record<string, unknown>
  requireOnlyKeys(input, AI_SDR_PROFILE_FIELDS)
  const normalized: AiSdrProfile = {}
  for (const field of AI_SDR_PROFILE_FIELDS) {
    const fieldValue = optionalString(input[field], `ai_sdr_profile.${field}`, AI_SDR_PROFILE_MAX_FIELD_LENGTH)
    if (fieldValue) normalized[field] = fieldValue
  }
  return normalized
}

function aiSdrReadiness(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const completedFields = AI_SDR_PROFILE_FIELDS.filter((field) => (
    typeof source[field] === 'string' && source[field].trim().length > 0
  ))
  const missingFields = AI_SDR_PROFILE_FIELDS.filter((field) => !completedFields.includes(field))
  const missingCoreFields = AI_SDR_CORE_FIELDS.filter((field) => !completedFields.includes(field))
  return {
    ready: missingCoreFields.length === 0,
    completed_fields: completedFields.length,
    total_fields: AI_SDR_PROFILE_FIELDS.length,
    missing_fields: missingFields,
    missing_core_fields: missingCoreFields,
  }
}

const BOOKING_STATUSES = [
  'conversation_started',
  'in_progress',
  'booked',
  'recorded',
  'published',
  'cancelled',
]

const BOOKING_FIELDS = [
  'podcast_name',
  'podcast_url',
  'host_name',
  'status',
  'scheduled_date',
  'recording_date',
  'publish_date',
  'episode_url',
  'notes',
  'prep_sent',
  'shortlist_podcast_id',
  'campaign_target_id',
]

function optionalDate(value: unknown, field: string): string | null {
  const text = optionalString(value, field, 10)
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || Number.isNaN(Date.parse(text))) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a YYYY-MM-DD date`)
  }
  return text
}

function optionalUuid(value: unknown, field: string): string | null {
  const text = optionalString(value, field, 40)
  if (!text) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(text)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a UUID`)
  }
  return text.toLowerCase()
}

function bookingPayload(value: unknown): Record<string, string | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BOOKING', 'booking must be an object')
  }
  const input = value as Record<string, unknown>
  requireOnlyKeys(input, BOOKING_FIELDS)
  const podcastName = optionalString(input.podcast_name, 'podcast_name', 300)
  if (!podcastName) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_name is required')
  }
  const status = optionalString(input.status, 'status', 32) ?? 'conversation_started'
  if (!BOOKING_STATUSES.includes(status)) {
    throw new HttpError(400, 'INVALID_FIELD', 'status is not a known placement stage')
  }
  return {
    podcast_name: podcastName,
    podcast_url: optionalString(input.podcast_url, 'podcast_url', 2048),
    host_name: optionalString(input.host_name, 'host_name', 200),
    status,
    scheduled_date: optionalDate(input.scheduled_date, 'scheduled_date'),
    recording_date: optionalDate(input.recording_date, 'recording_date'),
    publish_date: optionalDate(input.publish_date, 'publish_date'),
    episode_url: optionalString(input.episode_url, 'episode_url', 2048),
    notes: optionalString(input.notes, 'notes', 10_000),
    prep_sent: input.prep_sent === true,
    // The journey links: which shortlist row and which outreach this
    // placement came from. Composite FKs reject a mismatched client.
    shortlist_podcast_id: optionalUuid(input.shortlist_podcast_id, 'shortlist_podcast_id'),
    campaign_target_id: optionalUuid(input.campaign_target_id, 'campaign_target_id'),
  }
}

function clientPayload(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_CLIENT', 'client must be an object')
  }
  const input = value as Record<string, unknown>
  requireOnlyKeys(input, CLIENT_FIELDS)

  const status = requireString(input.status, 'status', { max: 20 })
  if (!['active', 'paused', 'churned'].includes(status)) {
    throw new HttpError(400, 'INVALID_FIELD', 'status is invalid')
  }

  const rawEmail = optionalString(input.email, 'email', 254)
  return {
    name: requireString(input.name, 'name', { max: 200 }),
    email: rawEmail ? requireEmail(rawEmail) : null,
    contact_person: optionalString(input.contact_person, 'contact_person', 200),
    linkedin_url: optionalUrl(input.linkedin_url, 'linkedin_url'),
    website: optionalUrl(input.website, 'website'),
    status,
    notes: optionalString(input.notes, 'notes', 10000),
  }
}

function rpcError(error: { message?: string }): never {
  const message = (error.message ?? '').toLowerCase()
  if (
    message.includes('active workspace manager')
    || message.includes('active workspace staff')
    || message.includes('active selected workspace')
  ) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }
  if (message.includes('not found')) {
    throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
  }
  if (message.includes('dashboard address is not configured')) {
    throw new HttpError(409, 'DASHBOARD_NOT_CONFIGURED', 'Client dashboard address is not configured')
  }
  if (message.includes('client ai sdr profile changed')) {
    throw new HttpError(409, 'AI_SDR_PROFILE_CHANGED', 'This AI SDR profile changed since you opened it. Reload the profile and try again.')
  }
  if (message.includes('client profile changed')) {
    throw new HttpError(409, 'PROFILE_CHANGED', 'This client profile changed since you opened it. Reopen the editor and try again.')
  }
  if (message.includes('invalid')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Workspace client request is invalid')
  }
  throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client operation failed')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    let bookingInput: Record<string, string | boolean | null> | null = null
    let bookingId: string | null = null
    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const { admin, user, tokenIssuedAt } = authContext
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    let clientId: string | null = null
    let payload: Record<string, string | null> = {}
    let profileBio: string | null = null
    let expectedUpdatedAt: string | null = null
    let sdrProfile: AiSdrProfile = {}
    let expectedSdrProfileUpdatedAt: string | null = null
    let prospectSlug: string | null = null

    if (action === 'research-get' || action === 'detail-get' || action === 'sdr-context-get') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'profile-update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'bio', 'expected_updated_at'])
      clientId = requireUuid(body.client_id, 'client_id')
      profileBio = optionalString(body.bio, 'bio', 20_000)
      expectedUpdatedAt = requireTimestamp(body.expected_updated_at, 'expected_updated_at')
    } else if (action === 'sdr-profile-update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'ai_sdr_profile', 'expected_profile_updated_at'])
      clientId = requireUuid(body.client_id, 'client_id')
      sdrProfile = aiSdrProfile(body.ai_sdr_profile)
      expectedSdrProfileUpdatedAt = nullableTimestamp(
        body.expected_profile_updated_at,
        'expected_profile_updated_at',
      )
    } else if (action === 'sdr-profile-draft') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'sdr-mode-set') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'mode'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
    } else if (action === 'create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client'])
      payload = clientPayload(body.client)
    } else if (action === 'update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'client'])
      clientId = requireUuid(body.client_id, 'client_id')
      payload = clientPayload(body.client)
    } else if (action === 'delete') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'dashboard-slug-rotate') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      clientId = requireUuid(body.client_id, 'client_id')
    } else if (action === 'prospect-link') {
      // null clears the link; a slug attaches an existing prospect page.
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'prospect_slug'])
      clientId = requireUuid(body.client_id, 'client_id')
      prospectSlug = body.prospect_slug === null || body.prospect_slug === undefined
        ? null
        : requireString(body.prospect_slug, 'prospect_slug', { max: 120 })
    } else if (action === 'booking-create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'booking'])
      clientId = requireUuid(body.client_id, 'client_id')
      bookingInput = bookingPayload(body.booking)
    } else if (action === 'booking-update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'booking_id', 'booking'])
      clientId = requireUuid(body.client_id, 'client_id')
      bookingId = requireUuid(body.booking_id, 'booking_id')
      bookingInput = bookingPayload(body.booking)
    } else if (action === 'booking-delete') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'booking_id'])
      clientId = requireUuid(body.client_id, 'client_id')
      bookingId = requireUuid(body.booking_id, 'booking_id')
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown workspace client action')
    }

    if (action === 'sdr-profile-draft') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id, name, bio, website, linkedin_url, ai_sdr_profile')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (clientError || !client) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found in this workspace')
      }
      if (typeof client.bio !== 'string' || client.bio.trim().length < 40) {
        throw new HttpError(409, 'CLIENT_BIO_REQUIRED', 'Add a client profile bio first — the draft is built from it')
      }
      const anthropicKey = await resolveAiKey(admin, workspaceId, 'anthropic')
      if (!anthropicKey) {
        throw new HttpError(500, 'SERVER_MISCONFIGURED', 'AI drafting is not configured')
      }
      const usedByoKey = anthropicKey.source === 'workspace'
      await chargeCredits(admin, {
        workspaceId,
        operationType: 'pitch_profile',
        referenceKind: 'sdr_profile_draft',
        referenceId: clientId!,
        idempotencyKey: retryWindowKey(['pitch_profile', clientId]),
        clientId,
        actorUserId: authContext.user.id,
        byoKeyUsed: usedByoKey,
      })

      // Evidence: approved shows and completed research for this client.
      const { data: researched } = await admin
        .from('client_dashboard_podcasts')
        .select('podcast_name, ai_fit_reasons, ai_pitch_angles, research_document')
        .eq('client_id', clientId!)
        .not('ai_analyzed_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(3)
      const evidence = (researched ?? []).map((row) => ({
        podcast: row.podcast_name,
        fit_reasons: row.ai_fit_reasons,
        pitch_angles: row.ai_pitch_angles,
        research_excerpt: typeof (row.research_document as { podcast_research?: unknown } | null)?.podcast_research === 'string'
          ? String((row.research_document as { podcast_research: string }).podcast_research).slice(0, 2_000)
          : null,
      }))

      const usage = { input: 0, output: 0 }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          // Thinks by default; see THINKS_BY_DEFAULT in _shared/promptModels.ts.
          thinking: { type: 'disabled' },
          max_tokens: 2_500,
          system: 'You draft podcast-guest AI SDR profiles for booking agencies. Write in the voice of the agency describing their client. Return ONLY a JSON object, no markdown.',
          messages: [{
            role: 'user',
            content: `Draft the AI SDR profile fields for this podcast guest. Return ONLY JSON with these string fields (each 2-5 sentences, concrete, no hype): {"positioning": how to introduce them and what makes them credible, "topics_and_angles": the topics and specific angles they speak on best, "listener_takeaways": what an audience concretely gains, "proof_points": specific numbers/results/credentials worth citing, "ideal_opportunities": which shows and audiences are the best fit, "booking_details": practical booking notes (format preferences, availability, tech setup) — write "To be confirmed with the client" for anything unknown rather than inventing it}.\n\nGUEST:\nName: ${client.name}\nBio: ${String(client.bio).slice(0, 4_000)}\nWebsite: ${client.website ?? 'n/a'}\nLinkedIn: ${client.linkedin_url ?? 'n/a'}\n\nEVIDENCE FROM RESEARCHED SHOWS:\n${JSON.stringify(evidence).slice(0, 6_000)}`,
          }],
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!response.ok) {
        throw new HttpError(503, 'DRAFT_FAILED', 'The profile draft could not be generated. Try again shortly')
      }
      const payloadJson = await response.json() as {
        content?: Array<{ type: string; text?: string }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      usage.input = payloadJson.usage?.input_tokens ?? 0
      usage.output = payloadJson.usage?.output_tokens ?? 0
      const text = (payloadJson.content ?? []).find((block) => block.type === 'text')?.text ?? ''
      let draft: Record<string, unknown> = {}
      try {
        draft = JSON.parse(text.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''))
      } catch (_error) {
        throw new HttpError(503, 'DRAFT_FAILED', 'The profile draft came back malformed. Try again')
      }
      const fields: Record<string, string> = {}
      for (const field of AI_SDR_PROFILE_FIELDS) {
        const value = draft[field]
        if (typeof value === 'string' && value.trim()) fields[field] = value.trim().slice(0, 4_000)
      }
      await logOperationCost(admin, {
        workspaceId,
        operationType: 'pitch_profile',
        usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output },
        usedByoKey,
        clientId,
        referenceKind: 'sdr_profile_draft',
        referenceId: clientId!,
      })
      return jsonResponse(req, METHODS, 200, { success: true, draft: fields, evidence_shows: evidence.length })
    }

    if (action === 'dashboard-slug-rotate') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const { data, error } = await admin.rpc('rotate_client_dashboard_slug_v1', {
        p_workspace_id: workspaceId,
        p_client_id: clientId!,
      })
      if (error) {
        throw new HttpError(500, 'DASHBOARD_SLUG_ROTATE_FAILED', 'The dashboard link could not be regenerated')
      }
      const rotated = data as { dashboard_slug?: string } | null
      if (!rotated?.dashboard_slug) {
        throw new HttpError(500, 'DASHBOARD_SLUG_ROTATE_FAILED', 'The dashboard link could not be regenerated')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: 'client.dashboard_slug.rotated',
        entityType: 'client',
        entityId: clientId!,
        metadata: {},
      })
      return jsonResponse(req, METHODS, 200, { dashboard_slug: rotated.dashboard_slug })
    }

    if (action === 'prospect-link') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      // The slug is a public capability URL. Resolving it inside this
      // workspace is what stops one tenant attaching another tenant's
      // prospect page to their own client and reading it thereafter.
      if (prospectSlug) {
        const { data: prospect, error: prospectError } = await admin
          .from('prospect_dashboards')
          .select('slug')
          .eq('workspace_id', workspaceId)
          .eq('slug', prospectSlug)
          .maybeSingle()
        if (prospectError) {
          throw new HttpError(500, 'PROSPECT_LINK_FAILED', 'The prospect page could not be verified')
        }
        if (!prospect) {
          throw new HttpError(404, 'PROSPECT_NOT_FOUND', 'That prospect page does not belong to this workspace')
        }
      }
      const { error: linkError } = await admin
        .from('clients')
        .update({ prospect_dashboard_slug: prospectSlug, updated_at: new Date().toISOString() })
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
      if (linkError) {
        throw new HttpError(500, 'PROSPECT_LINK_FAILED', 'The prospect page could not be linked')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: prospectSlug ? 'client.prospect_page.linked' : 'client.prospect_page.unlinked',
        entityType: 'client',
        entityId: clientId!,
        metadata: { prospect_slug: prospectSlug },
      })
      return jsonResponse(req, METHODS, 200, { prospect_dashboard_slug: prospectSlug })
    }

    if (action === 'sdr-profile-update') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const { data, error } = await admin.rpc('update_workspace_client_ai_sdr_profile_v1', {
        p_workspace_id: workspaceId,
        p_client_id: clientId!,
        p_profile: sdrProfile,
        p_expected_profile_updated_at: expectedSdrProfileUpdatedAt,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const updated = data as Record<string, unknown>
      return jsonResponse(req, METHODS, 200, {
        client: {
          ...updated,
          ai_sdr_readiness: aiSdrReadiness(updated.ai_sdr_profile),
        },
      })
    }

    if (action === 'profile-update') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const { data, error } = await admin.rpc('update_workspace_client_profile_v1', {
        p_workspace_id: workspaceId,
        p_client_id: clientId!,
        p_bio: profileBio,
        p_expected_updated_at: expectedUpdatedAt!,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      return jsonResponse(req, METHODS, 200, { client: data })
    }

    if (action === 'booking-create' || action === 'booking-update' || action === 'booking-delete') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      // Tenancy: the booking is only reachable through a client that belongs
      // to this workspace.
      const { data: ownerClient, error: ownerError } = await admin
        .from('clients')
        .select('id')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (ownerError || !ownerClient) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }

      if (action === 'booking-delete') {
        const { error: deleteError } = await admin
          .from('bookings')
          .delete()
          .eq('id', bookingId!)
          .eq('client_id', clientId!)
        if (deleteError) {
          throw new HttpError(500, 'BOOKING_OPERATION_FAILED', 'The placement could not be removed')
        }
        await writeAudit(admin, {
          workspaceId,
          actorUserId: authContext.user.id,
          action: 'client.booking.deleted',
          entityType: 'client',
          entityId: clientId,
          metadata: { booking_id: bookingId },
        })
        return jsonResponse(req, METHODS, 200, { success: true })
      }

      const columns = 'id,client_id,workspace_id,podcast_id,shortlist_podcast_id,campaign_target_id,podcast_name,podcast_url,host_name,scheduled_date,recording_date,publish_date,status,episode_url,prep_sent,notes,created_at,updated_at'
      const now = new Date().toISOString()
      // Read the prior state before writing so the notifier can tell a real
      // transition from a re-save of a row that was already in that stage.
      const previousStatus = action === 'booking-update'
        ? (await admin
          .from('bookings')
          .select('status')
          .eq('id', bookingId!)
          .eq('client_id', clientId!)
          .maybeSingle()).data?.status ?? null
        : null
      const { data: booking, error: bookingError } = action === 'booking-create'
        ? await admin
          .from('bookings')
          .insert({ ...bookingInput, client_id: clientId, workspace_id: workspaceId })
          .select(columns)
          .maybeSingle()
        : await admin
          .from('bookings')
          .update({ ...bookingInput, updated_at: now })
          .eq('id', bookingId!)
          .eq('client_id', clientId!)
          .select(columns)
          .maybeSingle()
      if (bookingError || !booking) {
        throw new HttpError(500, 'BOOKING_OPERATION_FAILED', 'The placement could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: action === 'booking-create' ? 'client.booking.created' : 'client.booking.updated',
        entityType: 'client',
        entityId: clientId,
        metadata: { booking_id: booking.id, status: booking.status },
      })

      // Tell the client when their placement reaches a stage that matters to
      // them. Best-effort by contract: a mail failure never fails the save,
      // and the send log makes a repeat announcement impossible.
      if (booking.status !== previousStatus) {
        if (booking.status === 'booked') {
          await notifyBookingConfirmed(admin, {
            workspaceId,
            clientId: clientId!,
            bookingId: booking.id,
            podcastName: booking.podcast_name,
            hostName: booking.host_name,
            recordingDate: booking.recording_date || booking.scheduled_date,
          }).catch(() => null)
        } else if (booking.status === 'published') {
          await notifyEpisodePublished(admin, {
            workspaceId,
            clientId: clientId!,
            bookingId: booking.id,
            podcastName: booking.podcast_name,
            episodeUrl: booking.episode_url,
          }).catch(() => null)
        }
      }
      return jsonResponse(req, METHODS, 200, { booking })
    }

    if (action === 'sdr-mode-set') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      if (!['owner', 'admin', 'platform_admin'].includes(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const mode = requireString(body.mode, 'mode', { max: 20 })
      // auto_send was removed on 2026-07-26: no email leaves the platform
      // without a person sending it, so the mode cannot be selected anymore.
      if (!['manual', 'auto_draft'].includes(mode)) {
        throw new HttpError(400, 'INVALID_FIELD', 'mode must be manual or auto_draft')
      }
      const { data: updated, error: modeError } = await admin
        .from('clients')
        .update({ ai_sdr_mode: mode, updated_at: new Date().toISOString() })
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .select('id, ai_sdr_mode')
        .maybeSingle()
      if (modeError || !updated) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The AI SDR mode could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'client.ai_sdr_mode.set',
        entityType: 'client',
        entityId: clientId,
        metadata: { mode },
      })
      return jsonResponse(req, METHODS, 200, { ai_sdr_mode: updated.ai_sdr_mode })
    }

    if (action === 'sdr-context-get') {
      await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id,workspace_id,name,status,bio,calendar_link,ai_sdr_profile,ai_sdr_profile_updated_at,ai_sdr_mode')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (clientError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client AI SDR context could not be loaded')
      }
      if (!client || client.workspace_id !== workspaceId) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }

      const readiness = aiSdrReadiness(client.ai_sdr_profile)
      return jsonResponse(req, METHODS, 200, {
        context: {
          client_id: client.id,
          workspace_id: client.workspace_id,
          client_name: client.name,
          client_status: client.status,
          approved_guest_profile: client.bio,
          calendar_link: client.calendar_link,
          ai_sdr_profile: client.ai_sdr_profile || {},
          ai_sdr_profile_updated_at: client.ai_sdr_profile_updated_at,
          // A legacy auto_send row reads as auto_draft: drafting still runs
          // for it, but nothing sends and the mode can no longer be chosen.
          ai_sdr_mode: client.ai_sdr_mode === 'auto_send'
            ? 'auto_draft'
            : typeof client.ai_sdr_mode === 'string' ? client.ai_sdr_mode : 'manual',
          readiness,
          safe_to_draft: client.status === 'active' && readiness.ready,
          delivery_authorized: false,
        },
      })
    }

    if (action === 'detail-get') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,contact_person,linkedin_url,website,calendar_link,status,notes,bio,photo_url,media_kit_url,prospect_dashboard_slug,dashboard_slug,dashboard_tagline,dashboard_enabled,dashboard_view_count,dashboard_last_viewed_at,portal_access_enabled,portal_last_login_at,password_set_at,ai_sdr_profile,ai_sdr_profile_updated_at,ai_sdr_mode,created_at,updated_at')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (clientError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client could not be loaded')
      }
      if (!client || client.workspace_id !== workspaceId) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }

      const [bookingsResult, onboardingResult, dashboardPodcastsResult, dashboardFeedbackResult, outreachResult] = await Promise.all([
        admin
          .from('bookings')
          .select('id,client_id,workspace_id,podcast_id,shortlist_podcast_id,campaign_target_id,podcast_name,podcast_url,host_name,scheduled_date,recording_date,publish_date,status,episode_url,prep_sent,notes,created_at,updated_at')
          .eq('client_id', clientId!)
          .order('scheduled_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(500),
        admin
          .from('workspace_onboarding_instances')
          .select('id,workspace_id,client_id,recipient_name,recipient_email,status,invited_at,started_at,submitted_at,approved_at,updated_at,archived_at')
          .eq('workspace_id', workspaceId)
          .eq('client_id', clientId!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from('client_dashboard_podcasts')
          .select('client_id,podcast_id,ai_analyzed_at,visibility,updated_at')
          .eq('client_id', clientId!)
          .order('updated_at', { ascending: false })
          .limit(1_000),
        admin
          .from('client_podcast_feedback')
          .select('client_id,podcast_id,status,updated_at')
          .eq('client_id', clientId!)
          .order('updated_at', { ascending: false })
          .limit(1_000),
        admin
          .from('outreach_messages')
          .select('client_id,podcast_id,podcast_name,status,sent_at,created_at')
          .eq('client_id', clientId!)
          .order('created_at', { ascending: false })
          .limit(5_000),
      ])

      if (bookingsResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client podcast activity could not be loaded')
      }
      if (onboardingResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client onboarding status could not be loaded')
      }
      if (dashboardPodcastsResult.error || dashboardFeedbackResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client dashboard summary could not be loaded')
      }
      if (outreachResult.error) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client outreach activity could not be loaded')
      }
      if ((bookingsResult.data || []).some((booking) => booking.client_id !== clientId)) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client podcast activity could not be loaded')
      }
      if (onboardingResult.data && (
        onboardingResult.data.workspace_id !== workspaceId
        || onboardingResult.data.client_id !== clientId
      )) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client onboarding status could not be loaded')
      }
      if (
        (dashboardPodcastsResult.data || []).some((podcast) => podcast.client_id !== clientId)
        || (dashboardFeedbackResult.data || []).some((feedback) => feedback.client_id !== clientId)
      ) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client dashboard summary could not be loaded')
      }
      if ((outreachResult.data || []).some((message) => message.client_id !== clientId)) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The client outreach activity could not be loaded')
      }

      const allDashboardPodcasts = dashboardPodcastsResult.data || []
      const dashboardPodcasts = allDashboardPodcasts
        .filter((podcast) => podcast.visibility === 'visible')
      const dashboardPodcastIds = new Set(dashboardPodcasts.map((podcast) => podcast.podcast_id))
      const dashboardFeedbackByPodcast = new Map<string, { status: string | null; updated_at: string | null }>()
      for (const feedback of dashboardFeedbackResult.data || []) {
        if (
          dashboardPodcastIds.has(feedback.podcast_id)
          && !dashboardFeedbackByPodcast.has(feedback.podcast_id)
        ) {
          dashboardFeedbackByPodcast.set(feedback.podcast_id, feedback)
        }
      }
      const dashboardFeedback = Array.from(dashboardFeedbackByPodcast.values())
      const approvedCount = dashboardFeedback.filter((feedback) => feedback.status === 'approved').length
      const rejectedCount = dashboardFeedback.filter((feedback) => feedback.status === 'rejected').length
      const reviewedCount = approvedCount + rejectedCount
      const latestTimestamp = (values: Array<string | null | undefined>): string | null => (
        values.filter((value): value is string => Boolean(value)).sort().at(-1) || null
      )
      const outreachMessages = outreachResult.data || []
      const sentOutreach = outreachMessages.filter((message) => message.status === 'sent')
      const contactedPodcastKeys = new Set(sentOutreach.map((message) => {
        const podcastId = typeof message.podcast_id === 'string' ? message.podcast_id.trim() : ''
        const podcastName = typeof message.podcast_name === 'string'
          ? message.podcast_name.trim().toLowerCase()
          : ''
        return podcastId ? `id:${podcastId}` : podcastName ? `name:${podcastName}` : ''
      }).filter(Boolean))
      return jsonResponse(req, METHODS, 200, {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          slug: access.workspace.slug,
          status: access.workspace.status,
          is_default: access.workspace.is_default,
          logo_path: access.workspace.logo_path,
          logo_updated_at: access.workspace.logo_updated_at,
        },
        viewer_role: access.role,
        can_manage: ['owner', 'admin', 'platform_admin'].includes(access.role),
        client: {
          ...client,
          ai_sdr_readiness: aiSdrReadiness(client.ai_sdr_profile),
        },
        dashboard: {
          configured: Boolean(client.dashboard_slug),
          enabled: Boolean(client.dashboard_slug),
          tagline: client.dashboard_tagline || null,
          view_count: Math.max(0, client.dashboard_view_count || 0),
          last_viewed_at: client.dashboard_last_viewed_at || null,
          podcast_count: dashboardPodcasts.length,
          reviewed_count: reviewedCount,
          approved_count: approvedCount,
          rejected_count: rejectedCount,
          to_review_count: Math.max(0, dashboardPodcasts.length - reviewedCount),
          analyzed_count: dashboardPodcasts.filter((podcast) => Boolean(podcast.ai_analyzed_at)).length,
          last_synced_at: latestTimestamp(allDashboardPodcasts.map((podcast) => podcast.updated_at)),
          last_feedback_at: latestTimestamp(dashboardFeedback.map((feedback) => feedback.updated_at)),
        },
        outreach: {
          initial_emails_sent: sentOutreach.length,
          podcasts_contacted: contactedPodcastKeys.size,
          pending_review_count: outreachMessages.filter((message) => message.status === 'pending_review').length,
          approved_count: outreachMessages.filter((message) => message.status === 'approved').length,
          failed_count: outreachMessages.filter((message) => message.status === 'failed').length,
          last_sent_at: latestTimestamp(sentOutreach.map((message) => message.sent_at || message.created_at)),
        },
        bookings: bookingsResult.data || [],
        onboarding: access.role === 'member' ? null : onboardingResult.data || null,
      })
    }

    if (action === 'research-get') {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
      // Read without the status filter so the two failures can be told apart.
      // Filtering in the query made a paused client indistinguishable from one
      // that does not exist, and "Active workspace client not found" gave the
      // operator nothing to act on.
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,website,status,bio,photo_url,updated_at')
        .eq('id', clientId!)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (clientError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace client could not be loaded')
      }
      if (!client || client.workspace_id !== workspaceId) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'This client is not in this workspace')
      }
      if (client.status !== 'active') {
        throw new HttpError(
          409,
          'CLIENT_NOT_ACTIVE',
          `Research is only available for active clients. ${client.name} is ${client.status}.`,
        )
      }

      const historyTables = [
        'client_dashboard_podcasts',
        'client_podcast_feedback',
        'podcast_outreach_actions',
        'bookings',
      ] as const
      const historyResults = await Promise.all(historyTables.map(async (table) => {
        const podcastIds: string[] = []
        const pageSize = 1_000
        const maximumRows = 5_000
        for (let offset = 0; offset < maximumRows; offset += pageSize) {
          const { data, error } = await admin
            .from(table)
            .select('podcast_id')
            .eq('client_id', clientId!)
            .not('podcast_id', 'is', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(offset, offset + pageSize - 1)
          if (error) {
            throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The client podcast history could not be loaded')
          }
          podcastIds.push(...(data || [])
            .map((row) => typeof row.podcast_id === 'string' ? row.podcast_id.trim() : '')
            .filter(Boolean))
          if ((data || []).length < pageSize) break
        }
        return podcastIds
      }))

      const existingPodcastIds = Array.from(new Set(
        historyResults.flat(),
      ))

      return jsonResponse(req, METHODS, 200, {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          slug: access.workspace.slug,
          status: access.workspace.status,
          is_default: access.workspace.is_default,
          logo_path: access.workspace.logo_path,
          logo_updated_at: access.workspace.logo_updated_at,
        },
        client: {
          id: client.id,
          workspace_id: client.workspace_id,
          name: client.name,
          email: client.email,
          website: client.website,
          status: client.status,
          bio: client.bio,
          photo_url: client.photo_url,
          updated_at: client.updated_at,
        },
        existing_podcast_ids: existingPodcastIds,
      })
    }

    if (action === 'list') {
      await requireWorkspaceFeatureAccess(authContext, workspaceId)
      const { data: clients, error: clientsError } = await admin
        .from('clients')
        .select('id,workspace_id,name,email,contact_person,linkedin_url,website,status,notes,ai_sdr_profile,ai_sdr_profile_updated_at,created_at,updated_at')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
        .order('id', { ascending: true })

      if (clientsError) {
        throw new HttpError(500, 'CLIENT_OPERATION_FAILED', 'The workspace clients could not be loaded')
      }
      if ((clients || []).some((client) => client.workspace_id !== workspaceId)) {
        throw new HttpError(500, 'CLIENT_SCOPE_MISMATCH', 'The workspace clients could not be loaded')
      }
      return jsonResponse(req, METHODS, 200, {
        clients: (clients || []).map((client) => {
          const readiness = aiSdrReadiness(client.ai_sdr_profile)
          const { ai_sdr_profile: _profile, ...summary } = client
          return {
            ...summary,
            ai_sdr_profile_ready: readiness.ready,
            ai_sdr_profile_completed_fields: readiness.completed_fields,
            ai_sdr_profile_total_fields: readiness.total_fields,
          }
        }),
      })
    }

    // Plan limit, checked here rather than in the browser. included_active_clients
    // has existed since billing was sketched and nothing has ever read it, so the
    // cap was only a number in a column. Only creation is gated: editing or
    // reactivating an existing client must never be blocked by a limit changed
    // after they signed up.
    if (action === 'create') {
      const { data: allowanceRows, error: allowanceError } = await admin.rpc(
        'workspace_client_allowance_v1',
        { p_workspace_id: workspaceId },
      )
      if (allowanceError) {
        throw new HttpError(503, 'PLAN_LIMIT_UNCHECKED', 'The plan limit could not be verified. Try again shortly')
      }
      const allowance = (allowanceRows ?? [])[0] as
        | { active_clients?: number; client_limit?: number; can_add_client?: boolean }
        | undefined
      if (allowance && allowance.can_add_client === false) {
        throw new HttpError(
          409,
          'CLIENT_LIMIT_REACHED',
          `This plan covers ${allowance.client_limit} active clients and ${allowance.active_clients} are already active. Archive a client or upgrade to add another.`,
        )
      }
    }

    const { data, error } = await admin.rpc('workspace_client_operation_v2', {
      p_action: action,
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_payload: payload,
      p_actor_user_id: user.id,
      p_token_issued_at: tokenIssuedAt,
    })

    if (error) rpcError(error)
    return jsonResponse(req, METHODS, action === 'create' ? 201 : 200, {
      success: true,
      client: data,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
