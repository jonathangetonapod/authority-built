import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
  type AuthContext,
  type WorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { generatePodcastSearchEmbedding } from '../_shared/podcastSearch.ts'
import { chargeCredits, logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { fetchRecentEpisodes } from '../_shared/podcastEpisodes.ts'
import { RESEARCH_PROMPT_DEFAULTS } from '../_shared/researchPromptDefaults.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const SHORTLIST_FIELDS = [
  'id',
  'client_id',
  'podcast_id',
  'podcast_name',
  'podcast_description',
  'podcast_image_url',
  'podcast_url',
  'publisher_name',
  'itunes_rating',
  'episode_count',
  'audience_size',
  'last_posted_at',
  'podcast_categories',
  'ai_clean_description',
  'ai_fit_reasons',
  'ai_pitch_angles',
  'ai_analyzed_at',
  'research_progress',
  'visibility',
  'display_order',
  'is_featured',
  'featured_order',
  'operator_notes',
  'archived_at',
  'created_at',
  'updated_at',
].join(',')
const CATALOG_FIELDS = [
  'id',
  'podscan_id',
  'podcast_name',
  'podcast_description',
  'podcast_image_url',
  'podcast_url',
  'publisher_name',
  'itunes_rating',
  'episode_count',
  'audience_size',
  'last_posted_at',
  'podcast_categories',
  'language',
  'region',
  'podscan_email',
  'rss_url',
].join(',')

interface ShortlistPodcastInput {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: Array<{ category_id: string; category_name: string }> | null
  language: string | null
  region: string | null
  podcast_email: string | null
  rss_feed: string | null
}

interface ShortlistPodcastRow extends Record<string, unknown> {
  id: string
  podcast_id: string
  podcast_name: string
  podcast_url: string | null
  publisher_name: string | null
}

interface CatalogPodcastRow extends Record<string, unknown> {
  id: string
  podscan_id: string
  podcast_name: string | null
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: unknown
  language: string | null
  region: string | null
  podscan_email: string | null
  rss_url: string | null
  free_podscan_email?: string | null
  direct_email?: string | null
  rss_feed?: string | null
  demographics?: unknown
}

interface WorkspaceCatalogSearchRow extends Record<string, unknown> {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: unknown
  language: string | null
  region: string | null
  free_podscan_email: string | null
  rss_feed: string | null
}

interface DirectContactRow extends Record<string, unknown> {
  podcast_id: string
  email: string
  host_name: string | null
  verification_status: 'verified' | 'stale' | 'invalid'
  first_paid_unlock_at: string
  last_verified_at: string
  updated_at: string
}

function requireManager(access: WorkspaceFeatureAccess): void {
  if (!MANAGER_ROLES.has(access.role)) {
    throw new HttpError(403, 'WORKSPACE_MANAGER_REQUIRED', 'Workspace manager access is required')
  }
}

async function requireWorkspaceClient(
  admin: AuthContext['admin'],
  workspaceId: string,
  clientId: string,
): Promise<{ id: string; name: string }> {
  const { data, error } = await admin
    .from('clients')
    .select('id,name')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'CLIENT_LOOKUP_FAILED', 'The client could not be verified')
  if (!data) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
  return data
}

function optionalHttpUrl(value: unknown, field: string): string | null {
  const url = optionalString(value, field, 2_048)
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('invalid protocol')
    return parsed.toString()
  } catch {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an HTTP or HTTPS URL`)
  }
}

function optionalNumber(
  value: unknown,
  field: string,
  options: { min: number; max: number; integer?: boolean },
): number | null {
  if (value === null || value === undefined || value === '') return null
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < options.min
    || value > options.max
    || (options.integer && !Number.isInteger(value))
  ) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return value
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const timestamp = optionalString(value, field, 80)
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid timestamp`)
  }
  return parsed.toISOString()
}

function podcastCategories(value: unknown): Array<{ category_id: string; category_name: string }> | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value) || value.length > 30) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_categories is invalid')
  }
  return value.map((category, index) => {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      throw new HttpError(400, 'INVALID_FIELD', `podcast_categories[${index}] is invalid`)
    }
    const record = category as Record<string, unknown>
    requireOnlyKeys(record, ['category_id', 'category_name'])
    return {
      category_id: requireString(record.category_id, `podcast_categories[${index}].category_id`, { max: 200 }),
      category_name: requireString(record.category_name, `podcast_categories[${index}].category_name`, { max: 200 }),
    }
  })
}

function shortlistPodcast(value: unknown, index: number): ShortlistPodcastInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `podcasts[${index}] must be an object`)
  }
  const podcast = value as Record<string, unknown>
  requireOnlyKeys(podcast, [
    'podcast_id',
    'podscan_podcast_id',
    'podcast_name',
    'podcast_description',
    'podcast_image_url',
    'podcast_url',
    'publisher_name',
    'itunes_rating',
    'episode_count',
    'audience_size',
    'last_posted_at',
    'podcast_categories',
    'language',
    'region',
    'podcast_email',
    'rss_feed',
    'compatibility_score',
    'compatibility_reasoning',
  ])
  const id = requireString(
    podcast.podcast_id ?? podcast.podscan_podcast_id,
    `podcasts[${index}].podcast_id`,
    { max: 300 },
  )
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_FIELD', `podcasts[${index}].podcast_id is invalid`)
  }

  return {
    podcast_id: id,
    podcast_name: requireString(podcast.podcast_name, `podcasts[${index}].podcast_name`, { max: 500 }),
    podcast_description: optionalString(podcast.podcast_description, `podcasts[${index}].podcast_description`, 50_000),
    podcast_image_url: optionalHttpUrl(podcast.podcast_image_url, `podcasts[${index}].podcast_image_url`),
    podcast_url: optionalHttpUrl(podcast.podcast_url, `podcasts[${index}].podcast_url`),
    publisher_name: optionalString(podcast.publisher_name, `podcasts[${index}].publisher_name`, 500),
    itunes_rating: optionalNumber(podcast.itunes_rating, `podcasts[${index}].itunes_rating`, { min: 0, max: 5 }),
    episode_count: optionalNumber(podcast.episode_count, `podcasts[${index}].episode_count`, { min: 0, max: 10_000_000, integer: true }),
    audience_size: optionalNumber(podcast.audience_size, `podcasts[${index}].audience_size`, { min: 0, max: 2_000_000_000, integer: true }),
    last_posted_at: optionalTimestamp(podcast.last_posted_at, `podcasts[${index}].last_posted_at`),
    podcast_categories: podcastCategories(podcast.podcast_categories),
    language: optionalString(podcast.language, `podcasts[${index}].language`, 30),
    region: optionalString(podcast.region, `podcasts[${index}].region`, 30),
    podcast_email: optionalString(podcast.podcast_email, `podcasts[${index}].podcast_email`, 500),
    rss_feed: optionalHttpUrl(podcast.rss_feed, `podcasts[${index}].rss_feed`),
  }
}

function podcastInputs(value: unknown): ShortlistPodcastInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcasts must contain between 1 and 50 items')
  }
  const parsed = value.map(shortlistPodcast)
  if (new Set(parsed.map((podcast) => podcast.podcast_id)).size !== parsed.length) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcasts contains duplicate IDs')
  }
  return parsed
}

function podcastIdList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpError(400, 'INVALID_FIELD', `podcast_ids must contain no more than ${max} items`)
  }
  const result = value.map((id, index) => {
    const parsed = requireString(id, `podcast_ids[${index}]`, { max: 300 })
    if (!/^[a-zA-Z0-9_-]+$/.test(parsed)) {
      throw new HttpError(400, 'INVALID_FIELD', `podcast_ids[${index}] is invalid`)
    }
    return parsed
  })
  if (new Set(result).size !== result.length) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_ids contains duplicates')
  }
  return result
}

// Research executor: which UI stages each canonical prompt completes.
const RESEARCH_STAGE_MAP: Record<string, string[]> = {
  podcast_research: ['podcast_profile', 'recent_episodes'],
  host_info: ['host_profile'],
  guest_info: ['guest_patterns'],
  find_topics: ['guest_fit', 'pitch_angles'],
}
const RESEARCH_STALE_LOCK_MS = 3 * 60 * 1000

function fillPromptTemplate(template: string, variables: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gu, (_match, key: string) => {
    const value = variables[key]
    return typeof value === 'string' && value.trim() ? value : 'Not available'
  })
}

async function runResearchPrompt(
  apiKey: string,
  prompt: { model: string; maxTokens: number; system: string },
  content: string,
  usage: { input: number; output: number },
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      system: prompt.system,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(28_000),
  })
  if (!response.ok) throw new Error(`research prompt failed with ${response.status}`)
  const payload = await response.json() as {
    content?: Array<{ type?: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  usage.input += Number(payload.usage?.input_tokens) || 0
  usage.output += Number(payload.usage?.output_tokens) || 0
  const text = payload.content?.find((block) => block.type === 'text' && typeof block.text === 'string')?.text
  if (typeof text !== 'string' || !text.trim()) throw new Error('research prompt returned no text')
  return text.trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')

    const body = await parseJsonObject(req, 1_000_000)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const clientId = requireUuid(body.client_id, 'client_id')
    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    requireManager(access)
    const client = await requireWorkspaceClient(authContext.admin, workspaceId, clientId)

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      const [shortlistResult, feedbackResult, priorOutreachResult] = await Promise.all([
        authContext.admin
          .from('client_dashboard_podcasts')
          .select(SHORTLIST_FIELDS)
          .eq('client_id', clientId)
          .order('is_featured', { ascending: false })
          .order('featured_order', { ascending: true, nullsFirst: false })
          .order('display_order', { ascending: true })
          .order('id', { ascending: true })
          .limit(1_000),
        authContext.admin
          .from('client_podcast_feedback')
          .select('podcast_id,status,notes,updated_at')
          .eq('client_id', clientId)
          .limit(1_000),
        authContext.admin
          .from('podcast_outreach_actions')
          .select('podcast_id,webhook_sent_at,created_at')
          .eq('client_id', clientId)
          .eq('action', 'sent')
          .gte('webhook_response_status', 200)
          .lt('webhook_response_status', 300)
          .limit(1_000),
      ])
      if (shortlistResult.error || feedbackResult.error || priorOutreachResult.error) {
        throw new HttpError(500, 'SHORTLIST_LOOKUP_FAILED', 'The client podcast list could not be loaded')
      }
      const shortlistRows = (shortlistResult.data || []) as unknown as ShortlistPodcastRow[]
      const shortlistPodcastIds = shortlistRows.map((podcast) => podcast.podcast_id)
      const catalogResult = shortlistPodcastIds.length > 0
        ? await authContext.admin
          .from('podcasts')
          .select(`${CATALOG_FIELDS},demographics`)
          .in('podscan_id', shortlistPodcastIds)
        : { data: [], error: null }
      if (catalogResult.error) {
        throw new HttpError(500, 'SHORTLIST_LOOKUP_FAILED', 'Podcast contact details could not be loaded')
      }
      const catalogRows = (catalogResult.data || []) as unknown as CatalogPodcastRow[]
      const directContactResult = catalogRows.length > 0
        ? await authContext.admin
          .from('podcast_direct_contacts')
          .select('podcast_id,email,host_name,verification_status,first_paid_unlock_at,last_verified_at,updated_at')
          .in('podcast_id', catalogRows.map((podcast) => podcast.id))
          .eq('verification_status', 'verified')
        : { data: [], error: null }
      if (directContactResult.error) {
        throw new HttpError(500, 'SHORTLIST_LOOKUP_FAILED', 'Verified podcast contacts could not be loaded')
      }
      const feedbackByPodcast = new Map(
        (feedbackResult.data || []).map((feedback) => [feedback.podcast_id, feedback]),
      )
      const priorOutreachByPodcast = new Map(
        (priorOutreachResult.data || []).map((outreach) => [
          outreach.podcast_id,
          outreach.webhook_sent_at || outreach.created_at,
        ]),
      )
      const catalogByPodcast = new Map(
        catalogRows.map((podcast) => [podcast.podscan_id, podcast]),
      )
      const directContactByPodcast = new Map(
        ((directContactResult.data || []) as unknown as DirectContactRow[])
          .map((contact) => [contact.podcast_id, contact]),
      )
      const podcasts = shortlistRows.map((podcast) => {
        const feedback = feedbackByPodcast.get(podcast.podcast_id)
        const catalog = catalogByPodcast.get(podcast.podcast_id)
        const directContact = catalog ? directContactByPodcast.get(catalog.id) : null
        return {
          ...podcast,
          podcast_name: catalog?.podcast_name || podcast.podcast_name,
          podcast_description: catalog?.podcast_description ?? podcast.podcast_description ?? null,
          podcast_image_url: catalog?.podcast_image_url ?? podcast.podcast_image_url ?? null,
          podcast_url: catalog?.podcast_url ?? podcast.podcast_url ?? null,
          publisher_name: catalog?.publisher_name ?? podcast.publisher_name ?? null,
          itunes_rating: catalog?.itunes_rating ?? podcast.itunes_rating ?? null,
          episode_count: catalog?.episode_count ?? podcast.episode_count ?? null,
          audience_size: catalog?.audience_size ?? podcast.audience_size ?? null,
          last_posted_at: catalog?.last_posted_at ?? podcast.last_posted_at ?? null,
          podcast_categories: catalog?.podcast_categories ?? podcast.podcast_categories ?? null,
          podcast_email: catalog?.podscan_email || null,
          rss_feed: catalog?.rss_url || null,
          language: catalog?.language || null,
          region: catalog?.region || null,
          email_unlock: directContact
            ? {
              status: 'unlocked',
              current_stage: null,
              completed_stages: ['identify_contact', 'find_email', 'verify_email'],
              email: directContact.email,
              host_name: directContact.host_name,
              unlocked_at: directContact.first_paid_unlock_at,
              updated_at: directContact.updated_at,
              verified_at: directContact.last_verified_at,
              scope: 'global',
              credit_cost: 0,
            }
            : null,
          feedback_status: feedback?.status || null,
          feedback_notes: feedback?.notes || null,
          feedback_updated_at: feedback?.updated_at || null,
          prior_outreach_at: priorOutreachByPodcast.get(podcast.podcast_id) || null,
        }
      })
      return jsonResponse(req, METHODS, 200, { client, podcasts })
    }

    if (action === 'catalog-search') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'query'])
      const query = requireString(body.query, 'query', { min: 2, max: 120 })
      const openaiKey = await resolveAiKey(authContext.admin, workspaceId, 'openai')
      const searchEmbedding = await generatePodcastSearchEmbedding(query, openaiKey)
      if (searchEmbedding) {
        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'semantic_search',
          usage: { openaiTokens: searchEmbedding.tokens },
          usedByoKey: searchEmbedding.usedByoKey,
          referenceKind: 'shortlist_catalog_search',
        })
      }
      const queryEmbedding = searchEmbedding?.embedding ?? null
      const catalogResult = await authContext.admin.rpc('workspace_podcast_catalog_page_v2', {
        p_search: query,
        p_category: null,
        p_contact: 'all',
        p_activity: 'active',
        p_audience: 'all',
        p_query_embedding: queryEmbedding,
        p_sort: 'audience',
        p_page: 1,
        p_page_size: 24,
      })
      if (catalogResult.error || !catalogResult.data || typeof catalogResult.data !== 'object') {
        throw new HttpError(500, 'CATALOG_SEARCH_FAILED', 'The podcast catalog could not be searched')
      }
      const catalogPayload = catalogResult.data as Record<string, unknown>
      const results = Array.isArray(catalogPayload.items)
        ? catalogPayload.items as WorkspaceCatalogSearchRow[]
        : []
      const resultIds = results.map((podcast) => String(podcast.podcast_id))
      const existingResult = resultIds.length > 0
        ? await authContext.admin
          .from('client_dashboard_podcasts')
          .select('podcast_id,visibility')
          .eq('client_id', clientId)
          .in('podcast_id', resultIds)
        : { data: [], error: null }
      if (existingResult.error) {
        throw new HttpError(500, 'CATALOG_SEARCH_FAILED', 'The client podcast list could not be compared')
      }
      const existingById = new Map((existingResult.data || []).map((row) => [row.podcast_id, row.visibility]))
      return jsonResponse(req, METHODS, 200, {
        podcasts: results.map((podcast) => ({
          podcast_id: podcast.podcast_id,
          podcast_name: podcast.podcast_name,
          podcast_description: podcast.podcast_description,
          podcast_image_url: podcast.podcast_image_url,
          podcast_url: podcast.podcast_url,
          publisher_name: podcast.publisher_name,
          itunes_rating: podcast.itunes_rating,
          episode_count: podcast.episode_count,
          audience_size: podcast.audience_size,
          last_posted_at: podcast.last_posted_at,
          podcast_categories: podcast.podcast_categories,
          language: podcast.language,
          region: podcast.region,
          podcast_email: podcast.free_podscan_email || null,
          rss_feed: podcast.rss_feed || null,
          already_added: existingById.has(String(podcast.podcast_id)),
          existing_visibility: existingById.get(String(podcast.podcast_id)) || null,
        })),
      })
    }

    if (action === 'add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'podcasts'])
      const podcasts = podcastInputs(body.podcasts)
      const podcastIds = podcasts.map((podcast) => podcast.podcast_id)
      const existingResult = await authContext.admin
        .from('client_dashboard_podcasts')
        .select('podcast_id')
        .eq('client_id', clientId)
        .in('podcast_id', podcastIds)
      if (existingResult.error) {
        throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The client podcast list could not be checked')
      }
      const existingIds = new Set((existingResult.data || []).map((row) => row.podcast_id))
      const newPodcasts = podcasts.filter((podcast) => !existingIds.has(podcast.podcast_id))
      let addedPodcastIds: string[] = []

      if (newPodcasts.length > 0) {
        const centralResult = await authContext.admin.rpc('merge_global_podcast_catalog_batch_v1', {
          p_workspace_id: workspaceId,
          p_actor_user_id: authContext.user.id,
          p_source: 'workspace_shortlist',
          p_client_id: clientId,
          p_prospect_dashboard_id: null,
          p_podcasts: newPodcasts.map((podcast) => ({
            podscan_id: podcast.podcast_id,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description,
            podcast_image_url: podcast.podcast_image_url,
            podcast_url: podcast.podcast_url,
            publisher_name: podcast.publisher_name,
            itunes_rating: podcast.itunes_rating,
            episode_count: podcast.episode_count,
            audience_size: podcast.audience_size,
            last_posted_at: podcast.last_posted_at,
            podcast_categories: podcast.podcast_categories,
            language: podcast.language,
            region: podcast.region,
            podscan_email: podcast.podcast_email,
            rss_url: podcast.rss_feed,
          })),
        })
        if (centralResult.error) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'Podcast details could not be saved')
        }
        const centralDetailsResult = await authContext.admin
          .from('podcasts')
          .select(`${CATALOG_FIELDS},demographics`)
          .in('podscan_id', newPodcasts.map((podcast) => podcast.podcast_id))
        if (centralDetailsResult.error) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'Podcast details could not be loaded')
        }
        const centralById = new Map(
          ((centralDetailsResult.data || []) as unknown as CatalogPodcastRow[])
            .map((podcast) => [podcast.podscan_id, podcast]),
        )

        const { data: lastPosition, error: positionError } = await authContext.admin
          .from('client_dashboard_podcasts')
          .select('display_order')
          .eq('client_id', clientId)
          .order('display_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (positionError) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The client podcast list could not be positioned')
        }
        const startingOrder = lastPosition ? Number(lastPosition.display_order) + 1 : 0
        const shortlistResult = await authContext.admin.from('client_dashboard_podcasts').upsert(
          newPodcasts.map((podcast, index) => {
            const central = centralById.get(podcast.podcast_id)
            return {
              client_id: clientId,
              podcast_id: podcast.podcast_id,
              podcast_name: central?.podcast_name || podcast.podcast_name,
              podcast_description: central?.podcast_description || podcast.podcast_description,
              podcast_image_url: central?.podcast_image_url || podcast.podcast_image_url,
              podcast_url: central?.podcast_url || podcast.podcast_url,
              publisher_name: central?.publisher_name || podcast.publisher_name,
              itunes_rating: central?.itunes_rating ?? podcast.itunes_rating,
              episode_count: central?.episode_count ?? podcast.episode_count,
              audience_size: central?.audience_size ?? podcast.audience_size,
              last_posted_at: central?.last_posted_at || podcast.last_posted_at,
              podcast_categories: central?.podcast_categories || podcast.podcast_categories,
              demographics: central?.demographics || null,
              visibility: 'visible',
              display_order: startingOrder + index,
            }
          }),
          { onConflict: 'client_id,podcast_id', ignoreDuplicates: true },
        ).select('podcast_id')
        if (shortlistResult.error) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'Podcasts could not be added to the client list')
        }
        addedPodcastIds = (shortlistResult.data || []).map((podcast) => podcast.podcast_id)
      }

      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.client.shortlist.added',
        entityType: 'client',
        entityId: clientId,
        metadata: { podcast_ids: addedPodcastIds },
      })
      return jsonResponse(req, METHODS, 200, {
        added: addedPodcastIds.length,
        skipped: podcasts.length - addedPodcastIds.length,
        podcast_ids: addedPodcastIds,
      })
    }

    if (action === 'update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'podcast_id', 'changes'])
      const podcastId = requireString(body.podcast_id, 'podcast_id', { max: 300 })
      if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) {
        throw new HttpError(400, 'INVALID_FIELD', 'changes must be an object')
      }
      const changes = body.changes as Record<string, unknown>
      requireOnlyKeys(changes, ['visibility', 'is_featured', 'operator_notes', 'feedback_status'])
      if (Object.keys(changes).length === 0) {
        throw new HttpError(400, 'INVALID_FIELD', 'changes cannot be empty')
      }
      const { data: existing, error: existingError } = await authContext.admin
        .from('client_dashboard_podcasts')
        .select('id,visibility,is_featured,featured_order')
        .eq('client_id', clientId)
        .eq('podcast_id', podcastId)
        .maybeSingle()
      if (existingError) throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The podcast could not be checked')
      if (!existing) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Podcast is not on this client list')

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      let feedbackStatus: 'approved' | 'rejected' | null | undefined
      if (Object.hasOwn(changes, 'feedback_status')) {
        if (changes.feedback_status !== null && changes.feedback_status !== 'approved' && changes.feedback_status !== 'rejected') {
          throw new HttpError(400, 'INVALID_FIELD', 'feedback_status must be approved, rejected, or null')
        }
        feedbackStatus = changes.feedback_status
      }
      if (Object.hasOwn(changes, 'visibility')) {
        const visibility = requireString(changes.visibility, 'visibility', { max: 20 })
        if (!['visible', 'archived'].includes(visibility)) {
          throw new HttpError(400, 'INVALID_FIELD', 'visibility is invalid')
        }
        update.visibility = visibility
        update.archived_at = visibility === 'archived' ? new Date().toISOString() : null
        update.archived_by = visibility === 'archived' ? authContext.user.id : null
        if (visibility !== 'visible') {
          update.is_featured = false
          update.featured_order = null
        }
      }
      if (Object.hasOwn(changes, 'operator_notes')) {
        update.operator_notes = changes.operator_notes === null || changes.operator_notes === ''
          ? null
          : requireString(changes.operator_notes, 'operator_notes', { max: 2_000 })
      }
      if (Object.hasOwn(changes, 'is_featured')) {
        if (typeof changes.is_featured !== 'boolean') {
          throw new HttpError(400, 'INVALID_FIELD', 'is_featured must be a boolean')
        }
        const nextVisibility = typeof update.visibility === 'string' ? update.visibility : existing.visibility
        if (changes.is_featured && nextVisibility !== 'visible') {
          throw new HttpError(400, 'INVALID_FIELD', 'Only visible podcasts can be featured')
        }
        update.is_featured = changes.is_featured
        if (changes.is_featured && !existing.is_featured) {
          const { data: featuredRows, error: featuredError } = await authContext.admin
            .from('client_dashboard_podcasts')
            .select('featured_order')
            .eq('client_id', clientId)
            .eq('visibility', 'visible')
            .eq('is_featured', true)
            .order('featured_order', { ascending: false, nullsFirst: false })
            .limit(6)
          if (featuredError) throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'Featured podcasts could not be checked')
          if ((featuredRows || []).length >= 6) {
            throw new HttpError(409, 'FEATURED_LIMIT_REACHED', 'You can feature up to six podcasts')
          }
          update.featured_order = Number(featuredRows?.[0]?.featured_order ?? -1) + 1
        } else if (!changes.is_featured) {
          update.featured_order = null
        }
      }

      const { data, error } = await authContext.admin
        .from('client_dashboard_podcasts')
        .update(update)
        .eq('client_id', clientId)
        .eq('podcast_id', podcastId)
        .select(SHORTLIST_FIELDS)
        .single()
      if (error || !data) {
        throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The client podcast list could not be updated')
      }
      const updatedPodcast = data as unknown as ShortlistPodcastRow
      let feedback: { status: string | null; notes: string | null; updated_at: string | null } | null = null
      if (feedbackStatus !== undefined) {
        const { data: currentFeedback, error: currentFeedbackError } = await authContext.admin
          .from('client_podcast_feedback')
          .select('notes')
          .eq('client_id', clientId)
          .eq('podcast_id', podcastId)
          .maybeSingle()
        if (currentFeedbackError) {
          throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The podcast decision could not be checked')
        }
        const { data: savedFeedback, error: savedFeedbackError } = await authContext.admin
          .from('client_podcast_feedback')
          .upsert({
            client_id: clientId,
            podcast_id: podcastId,
            podcast_name: updatedPodcast.podcast_name,
            status: feedbackStatus,
            notes: currentFeedback?.notes || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id,podcast_id' })
          .select('status,notes,updated_at')
          .single()
        if (savedFeedbackError || !savedFeedback) {
          throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The podcast decision could not be saved')
        }
        feedback = savedFeedback
      } else {
        const { data: currentFeedback, error: feedbackError } = await authContext.admin
          .from('client_podcast_feedback')
          .select('status,notes,updated_at')
          .eq('client_id', clientId)
          .eq('podcast_id', podcastId)
          .maybeSingle()
        if (feedbackError) {
          throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The updated podcast feedback could not be loaded')
        }
        feedback = currentFeedback
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.client.shortlist.updated',
        entityType: 'client_dashboard_podcast',
        entityId: updatedPodcast.id,
        metadata: {
          podcast_id: podcastId,
          changes: {
            ...update,
            ...(feedbackStatus !== undefined ? { feedback_status: feedbackStatus } : {}),
          },
        },
      })
      return jsonResponse(req, METHODS, 200, {
        podcast: {
          ...updatedPodcast,
          feedback_status: feedback?.status || null,
          feedback_notes: feedback?.notes || null,
          feedback_updated_at: feedback?.updated_at || null,
        },
      })
    }

    if (action === 'reorder-featured') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'podcast_ids'])
      const podcastIds = podcastIdList(body.podcast_ids)
      const { data, error } = await authContext.admin.rpc('reorder_client_shortlist_featured_v1', {
        p_client_id: clientId,
        p_podcast_ids: podcastIds,
      })
      if (error) {
        throw new HttpError(400, 'FEATURED_REORDER_FAILED', 'Featured podcasts could not be reordered')
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.client.shortlist.featured_reordered',
        entityType: 'client',
        entityId: clientId,
        metadata: { podcast_ids: podcastIds },
      })
      return jsonResponse(req, METHODS, 200, { reordered: Number(data || 0), podcast_ids: podcastIds })
    }

    if (action === 'research-run') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'shortlist_podcast_id'])
      const shortlistPodcastId = requireUuid(body.shortlist_podcast_id, 'shortlist_podcast_id')

      const { data: shortlistRow, error: shortlistError } = await authContext.admin
        .from('client_dashboard_podcasts')
        .select('id, podcast_id, podcast_name, podcast_description, podcast_url, publisher_name, last_posted_at, research_progress')
        .eq('id', shortlistPodcastId)
        .eq('client_id', clientId)
        .maybeSingle()
      if (shortlistError) throw new HttpError(500, 'RESEARCH_FAILED', 'The shortlist podcast could not be loaded')
      if (!shortlistRow) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Shortlist podcast not found for this client')

      const existingProgress = shortlistRow.research_progress as
        | { status?: string; updated_at?: string }
        | null
      if (
        existingProgress
        && ['queued', 'running'].includes(String(existingProgress.status))
        && typeof existingProgress.updated_at === 'string'
        && Date.now() - Date.parse(existingProgress.updated_at) < RESEARCH_STALE_LOCK_MS
      ) {
        throw new HttpError(409, 'RESEARCH_ALREADY_RUNNING', 'Research is already running for this podcast')
      }

      const { data: clientProfile } = await authContext.admin
        .from('clients')
        .select('name, bio, linkedin_url, website')
        .eq('id', clientId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      const { data: catalogRow } = await authContext.admin
        .from('podcasts')
        .select('podcast_name, podcast_description, podcast_url, publisher_name, last_posted_at')
        .eq('podscan_id', shortlistRow.podcast_id)
        .maybeSingle()

      const anthropicKey = await resolveAiKey(authContext.admin, workspaceId, 'anthropic')
      if (!anthropicKey) {
        throw new HttpError(500, 'RESEARCH_NOT_CONFIGURED', 'Podcast research is not configured')
      }
      const byoKeyUsed = anthropicKey.source === 'workspace'
      await chargeCredits(authContext.admin, {
        workspaceId,
        operationType: 'research_run',
        referenceKind: 'shortlist_podcast',
        referenceId: shortlistPodcastId,
        clientId,
        actorUserId: authContext.user.id,
        byoKeyUsed,
      })

      const startedAt = new Date().toISOString()
      const writeProgress = async (progress: Record<string, unknown>) => {
        await authContext.admin
          .from('client_dashboard_podcasts')
          .update({ research_progress: { ...progress, started_at: startedAt, updated_at: new Date().toISOString() } })
          .eq('id', shortlistPodcastId)
          .eq('client_id', clientId)
      }
      await writeProgress({ status: 'running', current_stage: 'podcast_profile', completed_stages: [] })

      const usage = { input: 0, output: 0 }
      const completedStages: string[] = []
      try {
        const { data: overrideRows } = await authContext.admin
          .from('workspace_research_prompts')
          .select('prompt_id, content')
          .eq('workspace_id', workspaceId)
        const overrides = new Map(
          (overrideRows ?? []).map((row) => [String(row.prompt_id), String(row.content)]),
        )
        const promptContent = (promptId: string): string =>
          overrides.get(promptId) ?? RESEARCH_PROMPT_DEFAULTS[promptId].content

        const episodes = await fetchRecentEpisodes(shortlistRow.podcast_id)
        const firstEpisode = episodes[0] ?? null
        const baseVariables: Record<string, string | null> = {
          client_name: clientProfile?.name ?? null,
          client_bio: clientProfile?.bio ?? null,
          client_linkedin_url: clientProfile?.linkedin_url ?? null,
          client_website: clientProfile?.website ?? null,
          podcast_name: catalogRow?.podcast_name ?? shortlistRow.podcast_name,
          podcast_url: catalogRow?.podcast_url ?? shortlistRow.podcast_url,
          podcast_description: catalogRow?.podcast_description ?? shortlistRow.podcast_description,
          last_posted_at: catalogRow?.last_posted_at ?? shortlistRow.last_posted_at,
          episode_title: firstEpisode?.title ?? null,
          episode_description: firstEpisode?.description ?? null,
          episode_transcript: firstEpisode?.transcript ?? null,
        }

        const advance = async (promptId: string, nextStage: string | null) => {
          completedStages.push(...RESEARCH_STAGE_MAP[promptId])
          await writeProgress({ status: 'running', current_stage: nextStage, completed_stages: [...completedStages] })
        }

        const researchReport = await runResearchPrompt(
          anthropicKey.apiKey,
          RESEARCH_PROMPT_DEFAULTS.podcast_research,
          fillPromptTemplate(promptContent('podcast_research'), baseVariables),
          usage,
        )
        await advance('podcast_research', 'host_profile')

        const hostReport = await runResearchPrompt(
          anthropicKey.apiKey,
          RESEARCH_PROMPT_DEFAULTS.host_info,
          fillPromptTemplate(promptContent('host_info'), { ...baseVariables, research_report: researchReport }),
          usage,
        )
        await advance('host_info', 'guest_patterns')

        let guestReport: string | null = null
        if (firstEpisode?.transcript) {
          guestReport = await runResearchPrompt(
            anthropicKey.apiKey,
            RESEARCH_PROMPT_DEFAULTS.guest_info,
            fillPromptTemplate(promptContent('guest_info'), { ...baseVariables, research_report: researchReport }),
            usage,
          ).catch(() => null)
        }
        await advance('guest_info', 'guest_fit')

        const topicProposal = await runResearchPrompt(
          anthropicKey.apiKey,
          RESEARCH_PROMPT_DEFAULTS.find_topics,
          fillPromptTemplate(promptContent('find_topics'), { ...baseVariables, research_report: researchReport }),
          usage,
        )
        await advance('find_topics', null)

        // Structure the narrative outputs into the shortlist's existing
        // ai_* columns so every downstream surface renders them unchanged.
        const structured = await runResearchPrompt(
          anthropicKey.apiKey,
          { model: 'claude-haiku-4-5-20251001', maxTokens: 1_500, system: 'You convert podcast research into strict JSON. Return ONLY a JSON object, no markdown.' },
          `From the research and topic proposal below, return ONLY this JSON shape: {"clean_description": string (2 sentences about the show), "fit_reasons": string[] (3 specific reasons this guest fits), "pitch_angles": [{"title": string, "description": string}] (exactly 3 angles), "host_name": string or null}.\n\nRESEARCH:\n${researchReport.slice(0, 12_000)}\n\nHOST REPORT:\n${hostReport.slice(0, 4_000)}\n\nTOPIC PROPOSAL:\n${topicProposal.slice(0, 8_000)}`,
          usage,
        )
        let parsed: {
          clean_description?: unknown
          fit_reasons?: unknown
          pitch_angles?: unknown
          host_name?: unknown
        } = {}
        try {
          parsed = JSON.parse(structured.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''))
        } catch (_error) {
          console.warn('[Shortlist Research] Structured output was not valid JSON; storing narrative only')
        }
        const cleanDescription = typeof parsed.clean_description === 'string' ? parsed.clean_description.slice(0, 2_000) : null
        const fitReasons = Array.isArray(parsed.fit_reasons)
          ? parsed.fit_reasons.filter((reason): reason is string => typeof reason === 'string').slice(0, 5)
          : []
        const pitchAngles = Array.isArray(parsed.pitch_angles)
          ? parsed.pitch_angles.flatMap((angle) => {
            if (!angle || typeof angle !== 'object' || Array.isArray(angle)) return []
            const record = angle as Record<string, unknown>
            return typeof record.title === 'string' && typeof record.description === 'string'
              ? [{ title: record.title.slice(0, 160), description: record.description.slice(0, 800) }]
              : []
          }).slice(0, 3)
          : []
        const hostName = typeof parsed.host_name === 'string' && parsed.host_name.trim()
          ? parsed.host_name.trim().slice(0, 200)
          : null

        const completedAt = new Date().toISOString()
        const { error: persistError } = await authContext.admin
          .from('client_dashboard_podcasts')
          .update({
            ai_clean_description: cleanDescription,
            ai_fit_reasons: fitReasons.length > 0 ? fitReasons : null,
            ai_pitch_angles: pitchAngles.length > 0 ? pitchAngles : null,
            ai_analyzed_at: completedAt,
            research_document: {
              podcast_research: researchReport.slice(0, 20_000),
              host_info: hostReport.slice(0, 20_000),
              guest_info: guestReport ? guestReport.slice(0, 20_000) : null,
              find_topics: topicProposal.slice(0, 20_000),
              episodes_used: episodes.map((episode) => ({ title: episode.title, had_transcript: Boolean(episode.transcript) })),
              generated_at: completedAt,
            },
            research_progress: {
              status: 'completed',
              current_stage: null,
              completed_stages: completedStages,
              started_at: startedAt,
              updated_at: completedAt,
            },
          })
          .eq('id', shortlistPodcastId)
          .eq('client_id', clientId)
        if (persistError) throw new Error('research results could not be persisted')

        if (hostName) {
          await authContext.admin
            .from('workspace_client_campaign_targets')
            .update({ host_name: hostName })
            .eq('workspace_id', workspaceId)
            .eq('shortlist_podcast_id', shortlistPodcastId)
            .is('host_name', null)
        }

        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'research_run',
          usage: {
            anthropicInputTokens: usage.input,
            anthropicOutputTokens: usage.output,
            podscanCalls: 1,
          },
          usedByoKey: byoKeyUsed,
          clientId,
          referenceKind: 'shortlist_podcast',
          referenceId: shortlistPodcastId,
        })

        return jsonResponse(req, METHODS, 200, {
          research_progress: {
            status: 'completed',
            current_stage: null,
            completed_stages: completedStages,
            started_at: startedAt,
            updated_at: completedAt,
          },
        })
      } catch (error) {
        await writeProgress({
          status: 'failed',
          current_stage: null,
          completed_stages: completedStages,
          message: 'Research was interrupted. Try again in a moment.',
        }).catch(() => undefined)
        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'research_run',
          usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls: 1 },
          usedByoKey: byoKeyUsed,
          clientId,
          referenceKind: 'shortlist_podcast',
          referenceId: shortlistPodcastId,
        })
        if (error instanceof HttpError) throw error
        console.error('[Shortlist Research] Pipeline failed')
        throw new HttpError(503, 'RESEARCH_FAILED', 'The research run could not be completed. Try again shortly')
      }
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown client shortlist action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
