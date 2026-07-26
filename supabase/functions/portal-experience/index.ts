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
  requireUuid,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

// Every field in this payload is safe to show to the end client. Operator
// notes, research documents, pitch copy, and contact emails must never be
// added here.
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
  'podcast_image_url',
  'podcast_description',
  'audience_size',
  'itunes_rating',
  'episode_count',
].join(',')

function clampText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null
}

function clampCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength))
}

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
        .select('client_id,clients(portal_access_enabled,workspace:workspaces(status))')
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

    const [
      clientResult,
      bookingsResult,
      shortlistResult,
      feedbackResult,
      campaignResult,
      targetsResult,
      pitchProfileResult,
    ] = await Promise.all([
      admin
        .from('clients')
        .select('id,name,photo_url,bio,media_kit_url,calendar_link,dashboard_slug,dashboard_tagline')
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('bookings')
        .select(PORTAL_BOOKING_FIELDS)
        .eq('client_id', clientId)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(500),
      admin
        .from('client_dashboard_podcasts')
        .select('podcast_id')
        .eq('client_id', clientId)
        .eq('visibility', 'visible')
        .limit(2_000),
      admin
        .from('client_podcast_feedback')
        .select('podcast_id,status')
        .eq('client_id', clientId)
        .limit(2_000),
      admin
        .from('workspace_client_campaigns')
        .select('status,analytics')
        .eq('client_id', clientId)
        .maybeSingle(),
      admin
        .from('workspace_client_campaign_targets')
        .select('status')
        .eq('client_id', clientId)
        .limit(5_000),
      admin
        .from('workspace_client_pitch_profiles')
        .select('professional_bio,positioning_summary,key_messages,story_angles,talking_points,ideal_audience,approved_at')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    if (clientResult.error || !clientResult.data) {
      throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found')
    }
    if (bookingsResult.error) {
      throw new HttpError(500, 'BOOKINGS_LOOKUP_FAILED', 'Bookings could not be loaded')
    }

    const clientRow = clientResult.data as Record<string, unknown>

    // Review queue: visible shortlist podcasts joined against the client's
    // approve/reject feedback, mirroring what /client/:slug shows them.
    const feedbackByPodcast = new Map<string, string>()
    for (const row of (feedbackResult.data ?? []) as Array<Record<string, unknown>>) {
      if (typeof row.podcast_id === 'string' && typeof row.status === 'string') {
        feedbackByPodcast.set(row.podcast_id, row.status)
      }
    }
    let approvedCount = 0
    let rejectedCount = 0
    let awaitingCount = 0
    const visibleRows = (shortlistResult.error ? [] : shortlistResult.data ?? []) as Array<Record<string, unknown>>
    for (const row of visibleRows) {
      const status = typeof row.podcast_id === 'string' ? feedbackByPodcast.get(row.podcast_id) : undefined
      if (status === 'approved') approvedCount += 1
      else if (status === 'rejected') rejectedCount += 1
      else awaitingCount += 1
    }

    // Outreach summary: high-level journey numbers only — no pitch copy,
    // contact emails, or failure diagnostics.
    let outreach: Record<string, number> | null = null
    if (!campaignResult.error && campaignResult.data) {
      const analytics = (campaignResult.data.analytics ?? {}) as Record<string, unknown>
      const targetRows = (targetsResult.error ? [] : targetsResult.data ?? []) as Array<Record<string, unknown>>
      const countByStatus = (status: string): number =>
        targetRows.filter((row) => row.status === status).length
      outreach = {
        emails_sent: clampCount(analytics.emails_sent_count),
        podcasts_contacted: clampCount(analytics.contacted_count),
        replies: clampCount(analytics.reply_count_unique),
        meetings_booked: clampCount(analytics.total_meeting_booked),
        in_outreach_count: countByStatus('in_outreach'),
        replied_count: countByStatus('replied'),
        completed_count: countByStatus('completed'),
      }
    }

    // The guest profile is only shared once the workspace approved it.
    let pitchProfile: Record<string, unknown> | null = null
    if (!pitchProfileResult.error && pitchProfileResult.data?.approved_at) {
      const profile = pitchProfileResult.data as Record<string, unknown>
      pitchProfile = {
        professional_bio: clampText(profile.professional_bio, 4_000),
        positioning_summary: clampText(profile.positioning_summary, 2_000),
        key_messages: stringList(profile.key_messages, 12, 400),
        story_angles: stringList(profile.story_angles, 12, 400),
        talking_points: stringList(profile.talking_points, 12, 400),
        ideal_audience: clampText(profile.ideal_audience, 2_000),
      }
    }

    return jsonResponse(req, METHODS, 200, {
      profile: {
        name: clampText(clientRow.name, 200) ?? 'Client',
        photo_url: clampText(clientRow.photo_url, 2_000),
        bio: clampText(clientRow.bio, 4_000),
        media_kit_url: clampText(clientRow.media_kit_url, 2_000),
        calendar_link: clampText(clientRow.calendar_link, 2_000),
        dashboard_tagline: clampText(clientRow.dashboard_tagline, 400),
      },
      review: {
        dashboard_slug: clampText(clientRow.dashboard_slug, 200),
        total_visible: visibleRows.length,
        awaiting_count: awaitingCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
      },
      outreach,
      pitch_profile: pitchProfile,
      bookings: bookingsResult.data ?? [],
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
