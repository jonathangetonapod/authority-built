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
      const [bookResult, clientsResult, eventsResult, derivedResult] = await Promise.all([
        admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, owner_user_id, updated_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId).maybeSingle(),
        admin.from('workspace_host_relationship_clients')
          .select('client_id, intent, note, created_at, clients(name)')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId),
        admin.from('workspace_host_relationship_events')
          .select('id, client_id, kind, body, occurred_at, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .order('occurred_at', { ascending: false }).limit(200),
        admin.rpc('workspace_podcast_relationships_v1', {
          p_workspace_id: workspaceId,
          p_podcast_ids: [showId],
        }),
      ])
      if (bookResult.error || clientsResult.error || eventsResult.error || derivedResult.error) {
        throw new HttpError(500, 'RELATIONSHIP_DETAIL_FAILED', 'The relationship could not be loaded')
      }
      return jsonResponse(req, METHODS, 200, {
        relationship: bookResult.data ?? null,
        derived: (derivedResult.data ?? [])[0] ?? null,
        clients: (clientsResult.data ?? []).map((row: Record<string, unknown>) => ({
          client_id: row.client_id,
          client_name: (row.clients as { name?: string } | null)?.name ?? null,
          intent: row.intent,
          note: row.note,
          created_at: row.created_at,
        })),
        events: eventsResult.data ?? [],
      })
    }

    if (action === 'upsert') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name',
        'host_name', 'contact_email', 'manual_stage', 'summary',
      ])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const manualStage = body.manual_stage === undefined || body.manual_stage === null
        ? null
        : requireString(body.manual_stage, 'manual_stage', { max: 40 })
      if (manualStage !== null && !MANUAL_STAGES.has(manualStage)) {
        throw new HttpError(400, 'INVALID_FIELD', 'manual_stage must be nurturing, warm, or do_not_contact')
      }
      const { data, error } = await admin
        .from('workspace_host_relationships')
        .upsert({
          workspace_id: workspaceId,
          podcast_id: showId,
          podcast_name: optionalString(body.podcast_name, 'podcast_name', 500),
          host_name: optionalString(body.host_name, 'host_name', 300),
          contact_email: optionalString(body.contact_email, 'contact_email', 320)?.toLowerCase() ?? null,
          manual_stage: manualStage,
          summary: optionalString(body.summary, 'summary', 5_000),
          created_by: authContext.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,podcast_id' })
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
        metadata: { manual_stage: manualStage },
      })
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
      // The book entry must exist before it can hold history; a note on an
      // uncurated show creates the entry rather than failing.
      await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
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
      const { data: client } = await admin
        .from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
      if (!client) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }
      await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
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
      return jsonResponse(req, METHODS, 200, { removed: true })
    }

    throw new HttpError(400, 'UNSUPPORTED_ACTION', 'Unsupported action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
