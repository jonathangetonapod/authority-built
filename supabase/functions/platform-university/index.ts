// University: platform-authored training lessons, served to every workspace.
//
// The platform owner records short videos on how to use each module and
// publishes them here. Reading is open to any authenticated user — training
// is the point, and the content is the platform's own, not tenant data.
// Writing (and seeing drafts) is platform-administrator only. Videos are
// hosted on Loom or YouTube; only the pasted URL is stored, with the
// provider and video id derived server-side so the client never parses an
// arbitrary URL into an iframe source.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import { HttpError } from '../_shared/httpError.ts'

const METHODS = ['POST'] as const
const MAX_BODY_BYTES = 64 * 1024

const CATEGORIES = [
  'getting_started',
  'onboarding',
  'clients',
  'podcast_finder',
  'podcast_database',
  'client_podcast_system',
  'prospects',
  'client_campaigns',
  'relationships',
  'master_inbox',
  'mailboxes',
  'billing',
  'settings',
  'other',
] as const

/**
 * Derive the embeddable identity from a pasted watch URL. Only Loom and
 * YouTube shapes are accepted — the id (never the raw URL) is what the
 * browser puts in an iframe, so an unparseable link is refused here rather
 * than shipped to every workspace as a broken player.
 */
export function parseVideoUrl(raw: string): { provider: 'loom' | 'youtube'; videoId: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch (_error) {
    throw new HttpError(400, 'INVALID_VIDEO_URL', 'Paste a full Loom or YouTube link')
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, 'INVALID_VIDEO_URL', 'Video links must be https')
  }
  const host = url.hostname.toLowerCase().replace(/^www\./u, '')
  // Exact id shapes per provider, not a generic 6-64 net. Loom share links
  // usually carry a title slug ("share/My-Demo-Video-<32hex>") — a loose
  // match stored the first slug word as the "id" and shipped a dead player
  // to every workspace, or rejected a perfectly valid link when the first
  // word was short. YouTube video ids are exactly 11 characters; anything
  // longer that fits a looser net (a pasted playlist id) also embeds dead.
  const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/u

  if (host === 'loom.com' || host.endsWith('.loom.com')) {
    const match = /^\/(?:share|embed)\/(?:[\w-]+-)?([0-9a-f]{32})(?:[/?#]|$)/u.exec(url.pathname)
    if (match) return { provider: 'loom', videoId: match[1] }
    throw new HttpError(400, 'INVALID_VIDEO_URL', 'That Loom link has no video id — use the Share link')
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0]
    if (YOUTUBE_ID.test(id)) return { provider: 'youtube', videoId: id }
    throw new HttpError(400, 'INVALID_VIDEO_URL', 'That YouTube link has no video id')
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host.endsWith('.youtube.com')) {
    const fromQuery = url.searchParams.get('v')
    if (fromQuery && YOUTUBE_ID.test(fromQuery)) return { provider: 'youtube', videoId: fromQuery }
    const pathMatch = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]+)/u.exec(url.pathname)
    if (pathMatch && YOUTUBE_ID.test(pathMatch[1])) return { provider: 'youtube', videoId: pathMatch[1] }
    throw new HttpError(400, 'INVALID_VIDEO_URL', 'That YouTube link has no video id')
  }
  throw new HttpError(400, 'INVALID_VIDEO_URL', 'Only Loom and YouTube links are supported')
}

function lessonResponse(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    video_url: row.video_url,
    provider: row.provider,
    video_id: row.video_id,
    sort_order: row.sort_order,
    published: row.published,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const context = await requireAuthenticatedUser(req)
    /*
     * Same credential-freshness gate as every sibling function: a token
     * minted before a password change or access revocation must not keep
     * working here just because the content is benign. Beyond that, reading
     * published lessons deliberately requires no workspace membership —
     * training is platform content offered to every authenticated account,
     * and the only write a non-admin can make is their own watch mark.
     */
    if (!workspaceCredentialIsFresh(context)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const admin = context.admin
    const body = await parseJsonObject(req, MAX_BODY_BYTES)
    const action = typeof body.action === 'string' ? body.action : ''

    if (action === 'list') {
      requireOnlyKeys(body, ['action'])
      let query = admin
        .from('platform_university_lessons')
        .select('id, category, title, description, video_url, provider, video_id, sort_order, published, created_at, updated_at')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(500)
      // Drafts are the author's workbench, not tenant content.
      if (!context.platformAdmin) query = query.eq('published', true)
      const { data, error } = await query
      if (error) {
        throw new HttpError(500, 'UNIVERSITY_UNAVAILABLE', 'Lessons could not be loaded')
      }
      // What THIS user has watched. Per-user, so the same person on two
      // workspaces has watched a video exactly once. A failed read degrades
      // to "nothing watched" rather than failing the whole library.
      const { data: watchRows } = await admin
        .from('platform_university_watches')
        .select('lesson_id')
        .eq('user_id', context.user.id)
        // Newest first so that if the cap is ever reached, the marks that
        // drop are the oldest — a stable subset, not a flapping one.
        .order('watched_at', { ascending: false })
        .limit(1_000)
      return jsonResponse(req, METHODS, 200, {
        lessons: (data ?? []).map((row) => lessonResponse(row as Record<string, unknown>)),
        watched_lesson_ids: ((watchRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => String(row.lesson_id)),
        can_manage: context.platformAdmin,
      })
    }

    if (action === 'set-watched') {
      requireOnlyKeys(body, ['action', 'lesson_id', 'watched'])
      const lessonId = requireUuid(body.lesson_id, 'lesson_id')
      const watched = body.watched === true
      // The lesson must exist and be visible to this caller — a member can
      // never probe draft ids by marking them watched.
      let lessonQuery = admin
        .from('platform_university_lessons')
        .select('id')
        .eq('id', lessonId)
      if (!context.platformAdmin) lessonQuery = lessonQuery.eq('published', true)
      const { data: lessonRow, error: lessonLookupError } = await lessonQuery.maybeSingle()
      // A transient read failure is a 500, not "that lesson no longer
      // exists" — the 404 message actively misleads when the DB hiccups.
      if (lessonLookupError) {
        throw new HttpError(500, 'UNIVERSITY_UNAVAILABLE', 'The lesson could not be checked')
      }
      if (!lessonRow) {
        throw new HttpError(404, 'LESSON_NOT_FOUND', 'That lesson no longer exists')
      }
      if (watched) {
        const { error } = await admin
          .from('platform_university_watches')
          .upsert({ user_id: context.user.id, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id' })
        if (error) {
          throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The watched mark could not be saved')
        }
      } else {
        const { error } = await admin
          .from('platform_university_watches')
          .delete()
          .eq('user_id', context.user.id)
          .eq('lesson_id', lessonId)
        if (error) {
          throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The watched mark could not be removed')
        }
      }
      return jsonResponse(req, METHODS, 200, { success: true, watched })
    }

    // Everything below writes platform content.
    if (!context.platformAdmin) {
      throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required')
    }

    if (action === 'upsert') {
      requireOnlyKeys(body, ['action', 'id', 'category', 'title', 'description', 'video_url', 'published'])
      const id = body.id === undefined || body.id === null ? null : requireUuid(body.id, 'id')
      const category = requireString(body.category, 'category', { max: 40 })
      if (!(CATEGORIES as readonly string[]).includes(category)) {
        throw new HttpError(400, 'INVALID_FIELD', 'Unknown lesson category')
      }
      const title = requireString(body.title, 'title', { max: 200 })
      const description = typeof body.description === 'string' ? body.description.slice(0, 2_000) : ''
      const videoUrl = requireString(body.video_url, 'video_url', { max: 500 })
      const published = body.published === true
      const { provider, videoId } = parseVideoUrl(videoUrl)

      let saved: Record<string, unknown> | null = null
      if (id) {
        // A lesson moved to a different category lands at that category's
        // end. Keeping its old sort_order collided with the destination's
        // positions and dropped it mid-list wherever the tiebreaker fell.
        const { data: currentRow } = await admin
          .from('platform_university_lessons')
          .select('category')
          .eq('id', id)
          .maybeSingle()
        let movedSortOrder: Record<string, unknown> = {}
        if (currentRow && currentRow.category !== category) {
          const { data: destinationTail } = await admin
            .from('platform_university_lessons')
            .select('sort_order')
            .eq('category', category)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle()
          movedSortOrder = {
            sort_order: (typeof destinationTail?.sort_order === 'number' ? destinationTail.sort_order : -1) + 1,
          }
        }
        const { data, error } = await admin
          .from('platform_university_lessons')
          .update({
            category,
            title,
            description,
            video_url: videoUrl,
            provider,
            video_id: videoId,
            published,
            ...movedSortOrder,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .maybeSingle()
        if (error || !data) {
          throw new HttpError(error ? 500 : 404, error ? 'UNIVERSITY_SAVE_FAILED' : 'LESSON_NOT_FOUND', error ? 'The lesson could not be saved' : 'That lesson no longer exists')
        }
        saved = data as Record<string, unknown>
      } else {
        // New lessons land at the end of their category.
        const { data: tail } = await admin
          .from('platform_university_lessons')
          .select('sort_order')
          .eq('category', category)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        const { data, error } = await admin
          .from('platform_university_lessons')
          .insert({
            category,
            title,
            description,
            video_url: videoUrl,
            provider,
            video_id: videoId,
            published,
            sort_order: (typeof tail?.sort_order === 'number' ? tail.sort_order : -1) + 1,
          })
          .select()
          .maybeSingle()
        if (error || !data) {
          throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The lesson could not be saved')
        }
        saved = data as Record<string, unknown>
      }
      await writeAudit(admin, {
        workspaceId: null,
        actorUserId: context.user.id,
        action: id ? 'platform.university.lesson_updated' : 'platform.university.lesson_created',
        entityType: 'university_lesson',
        entityId: String(saved.id),
        metadata: { category, published },
      })
      return jsonResponse(req, METHODS, 200, { lesson: lessonResponse(saved) })
    }

    if (action === 'delete') {
      requireOnlyKeys(body, ['action', 'id'])
      const id = requireUuid(body.id, 'id')
      const { data, error } = await admin
        .from('platform_university_lessons')
        .delete()
        .eq('id', id)
        .select('id')
      if (error) {
        throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The lesson could not be deleted')
      }
      if ((data ?? []).length === 0) {
        throw new HttpError(404, 'LESSON_NOT_FOUND', 'That lesson no longer exists')
      }
      await writeAudit(admin, {
        workspaceId: null,
        actorUserId: context.user.id,
        action: 'platform.university.lesson_deleted',
        entityType: 'university_lesson',
        entityId: id,
      })
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    if (action === 'reorder') {
      requireOnlyKeys(body, ['action', 'category', 'ordered_ids'])
      const category = requireString(body.category, 'category', { max: 40 })
      if (!(CATEGORIES as readonly string[]).includes(category)) {
        throw new HttpError(400, 'INVALID_FIELD', 'Unknown lesson category')
      }
      if (!Array.isArray(body.ordered_ids) || body.ordered_ids.length === 0 || body.ordered_ids.length > 200) {
        throw new HttpError(400, 'INVALID_FIELD', 'ordered_ids must list the lessons to order')
      }
      const orderedIds = body.ordered_ids.map((value, index) => requireUuid(value, `ordered_ids[${index}]`))
      /*
       * The order must name exactly the lessons the category holds. Silently
       * skipping foreign or stale ids consumed positions for rows that were
       * never updated and left omitted lessons interleaved at their old
       * numbers — while the action still claimed success.
       */
      const { data: currentRows, error: currentError } = await admin
        .from('platform_university_lessons')
        .select('id')
        .eq('category', category)
      if (currentError) {
        throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The order could not be saved')
      }
      const currentIds = new Set(((currentRows ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id)))
      const orderedSet = new Set(orderedIds)
      if (orderedSet.size !== orderedIds.length
        || currentIds.size !== orderedSet.size
        || [...currentIds].some((lessonId) => !orderedSet.has(lessonId))) {
        throw new HttpError(409, 'REORDER_STALE', 'The lesson list changed while reordering — refresh and try again')
      }
      for (const [index, lessonId] of orderedIds.entries()) {
        const { error } = await admin
          .from('platform_university_lessons')
          .update({ sort_order: index, updated_at: new Date().toISOString() })
          .eq('id', lessonId)
          .eq('category', category)
        if (error) {
          throw new HttpError(500, 'UNIVERSITY_SAVE_FAILED', 'The order could not be saved')
        }
      }
      await writeAudit(admin, {
        workspaceId: null,
        actorUserId: context.user.id,
        action: 'platform.university.lessons_reordered',
        entityType: 'university_lesson',
        entityId: null,
        metadata: { category, count: orderedIds.length },
      })
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown university action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
