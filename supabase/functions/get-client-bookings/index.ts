import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalSessionToken } from '../_shared/portalSecurity.ts'
import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const PORTAL_BOOKING_FIELDS = [
  'id',
  'podcast_name',
  'podcast_url',
  'host_name',
  'scheduled_date',
  'recording_date',
  'publish_date',
  'status',
  'episode_url',
].join(',')

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 2_048)
    requireOnlyKeys(body, ['clientId', 'sessionToken'])
    const clientId = requireUuid(body.clientId, 'clientId')
    const sessionToken = body.sessionToken === undefined
      ? null
      : requireUuid(body.sessionToken, 'sessionToken')
    const admin = createAdminClient()

    if (sessionToken) {
      const sessionTokenHash = await hashPortalSessionToken(sessionToken)
      const { data: session, error } = await admin
        .from('client_portal_sessions')
        .select('client_id,clients(portal_access_enabled,workspace:workspaces!clients_workspace_id_fkey(status))')
        .eq('session_token', sessionTokenHash)
        .eq('client_id', clientId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      const client = session?.clients as {
        portal_access_enabled?: boolean
        workspace?: { status?: string } | null
      } | null
      if (
        error
        || !session
        || !client?.portal_access_enabled
        || client.workspace?.status !== 'active'
      ) {
        throw new HttpError(401, 'INVALID_PORTAL_SESSION', 'Session expired or invalid')
      }
    } else {
      // No portal token means this is the explicit operator impersonation path.
      await requirePlatformAdmin(req)
    }

    const { data: bookings, error } = await admin
      .from('bookings')
      .select(PORTAL_BOOKING_FIELDS)
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false, nullsFirst: false })

    if (error) {
      throw new HttpError(500, 'BOOKINGS_LOOKUP_FAILED', 'Bookings could not be loaded')
    }

    return jsonResponse(req, METHODS, 200, { bookings: bookings ?? [] })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
