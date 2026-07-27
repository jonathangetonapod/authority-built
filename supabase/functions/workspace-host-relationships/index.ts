// The relationship book: the agency's contact record for podcast hosts.
//
// An agency pitches the same show for many clients over years. What it knows
// about a host — who they are, what they said on a call, which client belongs
// in front of them next — is the asset that compounds, and until now it lived
// only in people's heads. Derived outreach state (campaigns, conversations,
// bookings) is computed by workspace_podcast_relationships_v1 and is never
// written here; these actions curate only what a person decides.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const MANUAL_STAGES = new Set(['nurturing', 'warm', 'do_not_contact'])
const EVENT_KINDS = new Set(['note', 'call', 'meeting'])
const CLIENT_INTENTS = new Set(['considering', 'pitched', 'placed', 'declined', 'ruled_out'])

function podcastId(value: unknown): string {
  const id = requireString(value, 'podcast_id', { max: 200 })
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_id is invalid')
  }
  return id
}

function parseManualStage(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const stage = requireString(value, 'manual_stage', { max: 40 })
  if (!MANUAL_STAGES.has(stage)) {
    throw new HttpError(400, 'INVALID_FIELD', 'manual_stage must be nurturing, warm, or do_not_contact')
  }
  return stage
}

function optionalContactEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireEmail(value)
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const raw = optionalString(value, field, 40)
  if (!raw) return null
  const milliseconds = Date.parse(raw)
  if (!Number.isFinite(milliseconds)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid timestamp`)
  }
  return new Date(milliseconds).toISOString()
}

function newManualPodcastId(): string {
  return `manual-${crypto.randomUUID()}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  try {
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')

    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    const admin = authContext.admin
    // Reading the book is part of deciding who to pitch, so every workspace
    // member may look. Curation is a manager action.
    const requireManager = () => {
      if (!MANAGER_ROLES.has(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
    }

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'limit'])
      const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.max(1, Math.min(body.limit, 500))
        : 200
      const { data, error } = await admin.rpc('workspace_host_relationship_book_v1', {
        p_workspace_id: workspaceId,
        p_limit: limit,
      })
      if (error) {
        throw new HttpError(500, 'RELATIONSHIP_LIST_FAILED', 'The relationship book could not be loaded')
      }
      return jsonResponse(req, METHODS, 200, { relationships: data ?? [] })
    }

    if (action === 'detail') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id'])
      const showId = podcastId(body.podcast_id)
      const [
        bookResult,
        clientsResult,
        eventsResult,
        derivedResult,
        targetsResult,
        threadsResult,
        bookingsResult,
        savedThreadsResult,
      ] = await Promise.all([
        admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, owner_user_id, updated_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId).maybeSingle(),
        admin.from('workspace_host_relationship_clients')
          .select('client_id, intent, note, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId),
        admin.from('workspace_host_relationship_events')
          .select('id, client_id, kind, body, occurred_at, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .order('occurred_at', { ascending: false }).limit(200),
        admin.rpc('workspace_podcast_relationships_v1', {
          p_workspace_id: workspaceId,
          p_podcast_ids: [showId],
        }),
        admin.from('workspace_client_campaign_targets')
          .select('client_id, email_reply_count, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .or('launched_at.not.is.null,instantly_lead_id.not.is.null'),
        admin.from('workspace_inbox_thread_state')
          .select('client_id, status, classification, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId),
        admin.from('bookings')
          .select('client_id, status, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .neq('status', 'cancelled'),
        admin.from('workspace_host_relationship_threads')
          .select([
            'thread_key', 'client_id', 'provider', 'latest_message_id', 'subject',
            'lead_email', 'from_email', 'to_email', 'latest_message_body',
            'latest_message_at', 'campaign_id', 'campaign_name', 'created_at', 'updated_at',
          ].join(','))
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .order('latest_message_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(100),
      ])
      if (
        bookResult.error || clientsResult.error || eventsResult.error || derivedResult.error
        || targetsResult.error || threadsResult.error || bookingsResult.error || savedThreadsResult.error
      ) {
        throw new HttpError(500, 'RELATIONSHIP_DETAIL_FAILED', 'The relationship could not be loaded')
      }
      const clientHistory = new Map<string, { intent: string; note: string | null; created_at: string }>()
      const putDerivedClient = (clientId: unknown, intent: string, createdAt: unknown) => {
        if (typeof clientId !== 'string') return
        const existing = clientHistory.get(clientId)
        const rank: Record<string, number> = { considering: 0, pitched: 1, declined: 2, placed: 3, ruled_out: 4 }
        if (!existing || (rank[intent] ?? 0) > (rank[existing.intent] ?? 0)) {
          clientHistory.set(clientId, {
            intent,
            note: null,
            created_at: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString(),
          })
        }
      }
      for (const row of (targetsResult.data ?? []) as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'pitched', row.created_at)
      }
      for (const row of (threadsResult.data ?? []) as Array<Record<string, unknown>>) {
        const label = row.classification && typeof row.classification === 'object'
          ? (row.classification as Record<string, unknown>).label
          : null
        putDerivedClient(
          row.client_id,
          row.status === 'booked' ? 'placed' : ['not_interested', 'not_now'].includes(String(label)) ? 'declined' : 'pitched',
          row.created_at,
        )
      }
      for (const row of (bookingsResult.data ?? []) as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'placed', row.created_at)
      }
      for (const row of (savedThreadsResult.data ?? []) as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'pitched', row.created_at)
      }
      // A person's explicit association wins over an inferred campaign state.
      for (const row of (clientsResult.data ?? []) as Array<Record<string, unknown>>) {
        if (typeof row.client_id !== 'string') continue
        clientHistory.set(row.client_id, {
          intent: typeof row.intent === 'string' ? row.intent : 'considering',
          note: typeof row.note === 'string' ? row.note : null,
          created_at: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
        })
      }
      const clientIds = [...clientHistory.keys()]
      const clientNames = new Map<string, string>()
      if (clientIds.length > 0) {
        const { data: nameRows, error: namesError } = await admin.from('clients')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('id', clientIds)
        if (namesError) {
          throw new HttpError(500, 'RELATIONSHIP_DETAIL_FAILED', 'The relationship could not be loaded')
        }
        for (const row of nameRows ?? []) clientNames.set(row.id, row.name)
      }
      return jsonResponse(req, METHODS, 200, {
        relationship: bookResult.data ?? null,
        derived: (derivedResult.data ?? [])[0] ?? null,
        clients: clientIds.map((clientId) => ({
          client_id: clientId,
          client_name: clientNames.get(clientId) ?? null,
          ...clientHistory.get(clientId),
        })),
        events: eventsResult.data ?? [],
        threads: ((savedThreadsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          ...row,
          client_name: typeof row.client_id === 'string' ? clientNames.get(row.client_id) ?? null : null,
        })),
      })
    }

    if (action === 'create') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name',
        'host_name', 'contact_email', 'manual_stage', 'summary',
      ])
      requireManager()
      const showName = requireString(body.podcast_name, 'podcast_name', { max: 500 })
      const hostName = optionalString(body.host_name, 'host_name', 300)
      const contactEmail = optionalContactEmail(body.contact_email)
      const stage = parseManualStage(body.manual_stage)
      const summary = optionalString(body.summary, 'summary', 5_000)
      const requestedPodcastId = body.podcast_id === undefined || body.podcast_id === null || body.podcast_id === ''
        ? null
        : podcastId(body.podcast_id)

      // Manual entry is duplicate-safe. Canonical show ids win; for a
      // free-form record, an exact show + contact match reopens the existing
      // relationship instead of producing a second copy.
      let existing: Record<string, unknown> | null = null
      if (requestedPodcastId) {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', requestedPodcastId).maybeSingle()
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = data as Record<string, unknown> | null
      } else if (contactEmail) {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at')
          .eq('workspace_id', workspaceId).eq('contact_email', contactEmail).limit(50)
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = ((data ?? []) as Array<Record<string, unknown>>).find((row) => (
          typeof row.podcast_name === 'string'
          && row.podcast_name.trim().toLowerCase() === showName.toLowerCase()
        )) ?? null
      } else {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at')
          .eq('workspace_id', workspaceId).eq('podcast_name', showName).limit(1).maybeSingle()
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = data as Record<string, unknown> | null
      }
      if (existing && typeof existing.podcast_id === 'string') {
        const existingId = existing.podcast_id
        const changes: Record<string, unknown> = {
          podcast_name: showName,
          updated_at: new Date().toISOString(),
        }
        // A duplicate manual add is an intentional enrichment, but blank
        // optional inputs must not erase context the team already recorded.
        if (hostName) changes.host_name = hostName
        if (contactEmail) changes.contact_email = contactEmail
        if (stage) changes.manual_stage = stage
        if (summary) changes.summary = summary
        const { data, error } = await admin.from('workspace_host_relationships')
          .update(changes)
          .eq('workspace_id', workspaceId).eq('podcast_id', existingId)
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at')
          .single()
        if (error || !data) {
          throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be updated')
        }
        await writeAudit(admin, {
          workspaceId,
          actorUserId: authContext.user.id,
          action: 'workspace.host_relationship.saved',
          entityType: 'podcast',
          entityId: existingId,
          metadata: { source: 'manual_duplicate', changed_fields: Object.keys(changes).filter((key) => key !== 'updated_at') },
        })
        return jsonResponse(req, METHODS, 200, { relationship: data, created: false })
      }

      const showId = requestedPodcastId ?? newManualPodcastId()
      const { data, error } = await admin.from('workspace_host_relationships').insert({
        workspace_id: workspaceId,
        podcast_id: showId,
        podcast_name: showName,
        host_name: hostName,
        contact_email: contactEmail,
        manual_stage: stage,
        summary,
        created_by: authContext.user.id,
      }).select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at').single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.created',
        entityType: 'podcast',
        entityId: showId,
        metadata: { source: requestedPodcastId ? 'catalog' : 'manual', manual_stage: stage },
      })
      return jsonResponse(req, METHODS, 201, { relationship: data, created: true })
    }

    if (action === 'thread-capture') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name', 'host_name',
        'contact_email', 'thread_key', 'client_id', 'provider', 'message_id',
        'subject', 'from_email', 'to_email', 'body_text', 'received_at',
        'campaign_id', 'campaign_name',
      ])
      requireManager()
      const threadKey = requireString(body.thread_key, 'thread_key', { max: 120 })
      const requestedPodcastId = body.podcast_id === undefined || body.podcast_id === null || body.podcast_id === ''
        ? null
        : podcastId(body.podcast_id)
      const showName = optionalString(body.podcast_name, 'podcast_name', 500)
      const hostName = optionalString(body.host_name, 'host_name', 300)
      const contactEmail = optionalString(body.contact_email, 'contact_email', 320)?.toLowerCase() ?? null
      const captureClientId = body.client_id === undefined || body.client_id === null
        ? null
        : requireUuid(body.client_id, 'client_id')
      const provider = body.provider === undefined || body.provider === null
        ? 'instantly'
        : requireString(body.provider, 'provider', { max: 40 })
      if (provider !== 'instantly') {
        throw new HttpError(400, 'INVALID_FIELD', 'provider must be instantly')
      }
      if (captureClientId) {
        const { data: client, error: clientError } = await admin.from('clients')
          .select('id').eq('workspace_id', workspaceId).eq('id', captureClientId).maybeSingle()
        if (clientError) {
          throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
        }
        if (!client) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }

      const { data: savedThread, error: savedThreadError } = await admin
        .from('workspace_host_relationship_threads')
        .select('podcast_id')
        .eq('workspace_id', workspaceId).eq('thread_key', threadKey).maybeSingle()
      if (savedThreadError) {
        throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
      }

      let showId = requestedPodcastId
        ?? (typeof savedThread?.podcast_id === 'string' ? savedThread.podcast_id : null)
      if (!showId && contactEmail) {
        const { data: matches, error: matchesError } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name')
          .eq('workspace_id', workspaceId).eq('contact_email', contactEmail).limit(50)
        if (matchesError) {
          throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
        }
        const candidates = (matches ?? []) as Array<Record<string, unknown>>
        const named = showName
          ? candidates.find((row) => (
            typeof row.podcast_name === 'string'
            && row.podcast_name.trim().toLowerCase() === showName.toLowerCase()
          ))
          : null
        const match = named ?? (candidates.length === 1 ? candidates[0] : null)
        showId = typeof match?.podcast_id === 'string' ? match.podcast_id : null
      }
      showId ??= newManualPodcastId()

      const { data: current, error: currentError } = await admin.from('workspace_host_relationships')
        .select('podcast_id, podcast_name, host_name, contact_email')
        .eq('workspace_id', workspaceId).eq('podcast_id', showId).maybeSingle()
      if (currentError) {
        throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
      }
      let relationshipCreated = false
      if (!current) {
        if (!showName) {
          throw new HttpError(400, 'INVALID_FIELD', 'podcast_name is required when the conversation is not mapped to a show')
        }
        const { error: parentError } = await admin.from('workspace_host_relationships').insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          podcast_name: showName,
          host_name: hostName,
          contact_email: contactEmail,
          created_by: authContext.user.id,
        })
        if (parentError) {
          throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
        }
        relationshipCreated = true
      } else {
        const identityPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (!current.podcast_name && showName) identityPatch.podcast_name = showName
        if (!current.host_name && hostName) identityPatch.host_name = hostName
        if (!current.contact_email && contactEmail) identityPatch.contact_email = contactEmail
        const { error: parentError } = await admin.from('workspace_host_relationships')
          .update(identityPatch).eq('workspace_id', workspaceId).eq('podcast_id', showId)
        if (parentError) {
          throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
        }
      }

      const snapshot = {
        workspace_id: workspaceId,
        podcast_id: showId,
        thread_key: threadKey,
        client_id: captureClientId,
        provider,
        latest_message_id: optionalString(body.message_id, 'message_id', 120),
        subject: optionalString(body.subject, 'subject', 300),
        lead_email: contactEmail,
        from_email: optionalString(body.from_email, 'from_email', 320),
        to_email: optionalString(body.to_email, 'to_email', 320),
        latest_message_body: optionalString(body.body_text, 'body_text', 20_000),
        latest_message_at: optionalTimestamp(body.received_at, 'received_at'),
        campaign_id: optionalString(body.campaign_id, 'campaign_id', 120),
        campaign_name: optionalString(body.campaign_name, 'campaign_name', 300),
        captured_by: authContext.user.id,
        updated_at: new Date().toISOString(),
      }
      const { error: snapshotError } = await admin.from('workspace_host_relationship_threads')
        .upsert(snapshot, { onConflict: 'workspace_id,thread_key' })
      if (snapshotError) {
        throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation could not be saved')
      }
      if (captureClientId) {
        const { error: stateError } = await admin.from('workspace_inbox_thread_state').upsert({
          workspace_id: workspaceId,
          thread_key: threadKey,
          client_id: captureClientId,
          podcast_id: showId,
          ...(contactEmail ? { lead_email: contactEmail } : {}),
          updated_by: authContext.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,thread_key' })
        if (stateError) {
          throw new HttpError(500, 'RELATIONSHIP_THREAD_FAILED', 'The conversation link could not be saved')
        }
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.thread_captured',
        entityType: 'podcast',
        entityId: showId,
        metadata: { client_id: captureClientId, provider, relationship_created: relationshipCreated },
      })
      return jsonResponse(req, METHODS, 200, {
        podcast_id: showId,
        relationship_created: relationshipCreated,
        thread_saved: true,
      })
    }

    if (action === 'upsert') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name',
        'host_name', 'contact_email', 'manual_stage', 'summary',
      ])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const manualStage = parseManualStage(body.manual_stage)
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
      const { data: current, error: currentError } = await admin
        .from('workspace_host_relationships')
        .select('manual_stage')
        .eq('workspace_id', workspaceId)
        .eq('podcast_id', showId)
        .maybeSingle()
      if (currentError) {
        throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship could not be saved')
      }
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (has('podcast_name')) changes.podcast_name = optionalString(body.podcast_name, 'podcast_name', 500)
      if (has('host_name')) changes.host_name = optionalString(body.host_name, 'host_name', 300)
      if (has('contact_email')) {
        changes.contact_email = optionalContactEmail(body.contact_email)
      }
      if (has('manual_stage')) changes.manual_stage = manualStage
      if (has('summary')) changes.summary = optionalString(body.summary, 'summary', 5_000)
      // Existing rows use UPDATE so omitted properties are unambiguously
      // preserved. INSERT is reserved for a new relationship and stamps its
      // creator once; later edits never rewrite authorship.
      const saveQuery = current
        ? admin.from('workspace_host_relationships')
          .update(changes)
          .eq('workspace_id', workspaceId)
          .eq('podcast_id', showId)
        : admin.from('workspace_host_relationships').insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          created_by: authContext.user.id,
          ...changes,
        })
      const { data, error } = await saveQuery
        .select('podcast_id, manual_stage, summary, updated_at')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.saved',
        entityType: 'podcast',
        entityId: showId,
        metadata: { changed_fields: Object.keys(changes).filter((key) => key !== 'updated_at') },
      })
      if (has('manual_stage') && current?.manual_stage !== manualStage) {
        const from = typeof current?.manual_stage === 'string' ? current.manual_stage : 'derived activity'
        const to = manualStage ?? 'derived activity'
        const { error: eventError } = await admin.from('workspace_host_relationship_events').insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          kind: 'stage_change',
          body: `Relationship stage changed from ${from} to ${to}.`,
          created_by: authContext.user.id,
        })
        if (eventError) {
          throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship stage history could not be saved')
        }
      }
      return jsonResponse(req, METHODS, 200, { relationship: data })
    }

    if (action === 'note-add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id', 'kind', 'body_text'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const kind = body.kind === undefined || body.kind === null
        ? 'note'
        : requireString(body.kind, 'kind', { max: 20 })
      if (!EVENT_KINDS.has(kind)) {
        throw new HttpError(400, 'INVALID_FIELD', 'kind must be note, call, or meeting')
      }
      const text = requireString(body.body_text, 'body_text', { max: 5_000 })
      const clientId = body.client_id === undefined || body.client_id === null
        ? null
        : requireUuid(body.client_id, 'client_id')
      if (clientId) {
        const { data: client, error: clientError } = await admin
          .from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
        if (clientError) {
          throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
        }
        if (!client) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
        }
      }
      // The book entry must exist before it can hold history; a note on an
      // uncurated show creates the entry rather than failing.
      const { error: parentError } = await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
      if (parentError) {
        throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
      }
      const { data, error } = await admin
        .from('workspace_host_relationship_events')
        .insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          client_id: clientId,
          kind,
          body: text,
          created_by: authContext.user.id,
        })
        .select('id, kind, body, occurred_at, client_id')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.note_added',
        entityType: 'podcast',
        entityId: showId,
        metadata: { kind, client_id: clientId },
      })
      return jsonResponse(req, METHODS, 200, { event: data })
    }

    if (action === 'client-link') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id', 'intent', 'note'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const clientId = requireUuid(body.client_id, 'client_id')
      const intent = body.intent === undefined || body.intent === null
        ? 'considering'
        : requireString(body.intent, 'intent', { max: 20 })
      if (!CLIENT_INTENTS.has(intent)) {
        throw new HttpError(400, 'INVALID_FIELD', 'intent is invalid')
      }
      // Cross-tenant safety: the client must belong to this workspace.
      const { data: client, error: clientError } = await admin
        .from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
      if (clientError) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      if (!client) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }
      const { error: parentError } = await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
      if (parentError) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      const { data, error } = await admin
        .from('workspace_host_relationship_clients')
        .upsert({
          workspace_id: workspaceId,
          podcast_id: showId,
          client_id: clientId,
          intent,
          note: optionalString(body.note, 'note', 1_000),
          created_by: authContext.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,podcast_id,client_id' })
        .select('client_id, intent, note')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.client_linked',
        entityType: 'podcast',
        entityId: showId,
        metadata: { client_id: clientId, intent },
      })
      return jsonResponse(req, METHODS, 200, { client: data })
    }

    if (action === 'client-unlink') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const clientId = requireUuid(body.client_id, 'client_id')
      const { error } = await admin
        .from('workspace_host_relationship_clients')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('podcast_id', showId)
        .eq('client_id', clientId)
      if (error) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_UNLINK_FAILED', 'The client could not be removed')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.client_unlinked',
        entityType: 'podcast',
        entityId: showId,
        metadata: { client_id: clientId },
      })
      return jsonResponse(req, METHODS, 200, { removed: true })
    }

    throw new HttpError(400, 'UNSUPPORTED_ACTION', 'Unsupported action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
