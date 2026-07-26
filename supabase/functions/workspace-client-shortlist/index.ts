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
import { fetchPodcastHosts, fetchRecentEpisodes } from '../_shared/podcastEpisodes.ts'
import { decryptInstantlyApiKey, instantlyRequest } from '../_shared/instantly.ts'
import { RESEARCH_PROMPT_DEFAULTS } from '../_shared/researchPromptDefaults.ts'
import { notifyShortlistReady } from '../_shared/clientNotify.ts'

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
  'email_unlock_progress',
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

// Podscan payloads carry HTML entities in names and descriptions.
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCharCode(Number(code)))
}
const EMAIL_SEARCH_STALE_LOCK_MS = 3 * 60 * 1000
// Hosted-platform domains never receive host mailboxes — pattern guesses
// against them are pure noise.
const HOSTING_PLATFORM_DOMAINS = new Set([
  'podbean.com', 'libsyn.com', 'buzzsprout.com', 'anchor.fm', 'spotify.com',
  'apple.com', 'megaphone.fm', 'simplecast.com', 'transistor.fm', 'spreaker.com',
  'soundcloud.com', 'audioboom.com', 'captivate.fm', 'podigee.io', 'acast.com',
  'youtube.com', 'substack.com', 'squarespace.com', 'wordpress.com', 'wixsite.com',
  'linktr.ee', 'patreon.com', 'podcasts.apple.com',
])

function podcastDomain(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null
  try {
    const host = new URL(websiteUrl).hostname.toLowerCase().replace(/^www\./u, '')
    if (!host.includes('.')) return null
    const rootDomain = host.split('.').slice(-2).join('.')
    if (HOSTING_PLATFORM_DOMAINS.has(rootDomain) || HOSTING_PLATFORM_DOMAINS.has(host)) return null
    return host
  } catch (_error) {
    return null
  }
}

function buildEmailCandidates(hostName: string | null, domain: string | null): string[] {
  if (!domain) return []
  const candidates: string[] = []
  const nameParts = (hostName ?? '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/gu, '')
    .replace(/['-]/gu, '')
    .split(/\s+/u)
    .filter((part) => part.length > 1)
  if (nameParts.length > 0) {
    const first = nameParts[0]
    const last = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null
    candidates.push(`${first}@${domain}`)
    if (last) {
      candidates.push(`${first}.${last}@${domain}`)
      candidates.push(`${first}${last}@${domain}`)
      candidates.push(`${first[0]}${last}@${domain}`)
    }
  }
  return [...new Set(candidates)].slice(0, 5)
}

interface EmailVerificationResult {
  email: string
  status: string
}

async function verifyEmailWithInstantly(apiKey: string, email: string): Promise<EmailVerificationResult> {
  const started = await instantlyRequest<{ verification_status?: string; status?: string }>(
    apiKey,
    '/email-verification',
    { method: 'POST', body: { email } },
  )
  let status = String(started.verification_status ?? started.status ?? 'pending').toLowerCase()
  for (let attempt = 0; attempt < 3 && (status === 'pending' || status === 'in_progress' || status === 'processing'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3_000))
    try {
      const polled = await instantlyRequest<{ verification_status?: string; status?: string }>(
        apiKey,
        `/email-verification/${encodeURIComponent(email)}`,
      )
      status = String(polled.verification_status ?? polled.status ?? status).toLowerCase()
    } catch (_error) {
      break
    }
  }
  return { email, status }
}

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
      const podcasts = shortlistRows.map((row) => {
        const { email_unlock_progress: storedUnlockProgress, ...podcast } = row
        const feedback = feedbackByPodcast.get(podcast.podcast_id as string)
        const catalog = catalogByPodcast.get(podcast.podcast_id as string)
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
            : storedUnlockProgress ?? null,
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

      // Shows the client cannot see are not news. Once anything lands on the
      // review list, tell them — at most once a day, and never fatally.
      if (addedPodcastIds.length > 0) {
        await notifyShortlistReady(authContext.admin, {
          workspaceId,
          clientId,
          day: new Date().toISOString().slice(0, 10),
        }).catch(() => null)
      }
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
        const { data: clientOverrideRows } = await authContext.admin
          .from('client_ai_sdr_prompts')
          .select('prompt_id, content')
          .eq('workspace_id', workspaceId)
          .eq('client_id', clientId)
        const overrides = new Map(
          (overrideRows ?? []).map((row) => [String(row.prompt_id), String(row.content)]),
        )
        // This client's own prompt wins over the workspace house style.
        const clientOverrides = new Map(
          (clientOverrideRows ?? []).map((row) => [String(row.prompt_id), String(row.content)]),
        )
        const promptContent = (promptId: string): string =>
          clientOverrides.get(promptId)
            ?? overrides.get(promptId)
            ?? RESEARCH_PROMPT_DEFAULTS[promptId].content

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
          `From the research and topic proposal below, return ONLY this JSON shape: {"clean_description": string (2 sentences about the show), "fit_reasons": string[] (3 specific reasons this guest fits), "pitch_angles": [{"title": string, "description": string}] (exactly 3 angles), "host_name": string or null, "recent_guest_name": string or null (full name of the guest on the analyzed episode per the guest report; null for solo episodes or when unverified)}.\n\nRESEARCH:\n${researchReport.slice(0, 12_000)}\n\nHOST REPORT:\n${hostReport.slice(0, 4_000)}\n\nGUEST REPORT:\n${guestReport ? guestReport.slice(0, 4_000) : 'Not available'}\n\nTOPIC PROPOSAL:\n${topicProposal.slice(0, 8_000)}`,
          usage,
        )
        let parsed: {
          clean_description?: unknown
          fit_reasons?: unknown
          pitch_angles?: unknown
          host_name?: unknown
          recent_guest_name?: unknown
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
        const recentGuestName = typeof parsed.recent_guest_name === 'string' && parsed.recent_guest_name.trim()
          ? parsed.recent_guest_name.trim().slice(0, 200)
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
              // Trimmed so write_email can quote the latest episode without
              // ballooning the stored document (full transcripts run ~60k).
              episode_transcript_excerpt: firstEpisode?.transcript ? firstEpisode.transcript.slice(0, 2_000) : null,
              recent_guest_name: recentGuestName,
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

    if (action === 'email-search-run') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'shortlist_podcast_id'])
      const shortlistPodcastId = requireUuid(body.shortlist_podcast_id, 'shortlist_podcast_id')

      const { data: shortlistRow, error: shortlistError } = await authContext.admin
        .from('client_dashboard_podcasts')
        .select('id, podcast_id, podcast_name, podcast_url, email_unlock_progress, research_document')
        .eq('id', shortlistPodcastId)
        .eq('client_id', clientId)
        .maybeSingle()
      if (shortlistError) throw new HttpError(500, 'EMAIL_SEARCH_FAILED', 'The shortlist podcast could not be loaded')
      if (!shortlistRow) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Shortlist podcast not found for this client')

      const { data: catalogRow } = await authContext.admin
        .from('podcasts')
        .select('id, podscan_id, podcast_url, podscan_email')
        .eq('podscan_id', shortlistRow.podcast_id)
        .maybeSingle()

      const buildUnlockedPayload = (contact: { email: string; host_name: string | null; first_paid_unlock_at?: string | null; last_verified_at?: string | null }, creditCost: number) => ({
        status: 'unlocked',
        current_stage: null,
        completed_stages: ['identify_contact', 'find_email', 'verify_email'],
        email: contact.email,
        host_name: contact.host_name,
        unlocked_at: contact.first_paid_unlock_at ?? new Date().toISOString(),
        verified_at: contact.last_verified_at ?? new Date().toISOString(),
        scope: 'global',
        credit_cost: creditCost,
      })

      if (catalogRow) {
        const { data: existingContact } = await authContext.admin
          .from('podcast_direct_contacts')
          .select('email, host_name, first_paid_unlock_at, last_verified_at')
          .eq('podcast_id', catalogRow.id)
          .eq('verification_status', 'verified')
          .maybeSingle()
        if (existingContact?.email) {
          await authContext.admin
            .from('client_dashboard_podcasts')
            .update({ email_unlock_progress: null })
            .eq('id', shortlistPodcastId)
            .eq('client_id', clientId)
          return jsonResponse(req, METHODS, 200, { email_unlock: buildUnlockedPayload(existingContact, 0) })
        }
      }

      const existingUnlockProgress = shortlistRow.email_unlock_progress as
        | { status?: string; updated_at?: string }
        | null
      if (
        existingUnlockProgress
        && ['queued', 'running'].includes(String(existingUnlockProgress.status))
        && typeof existingUnlockProgress.updated_at === 'string'
        && Date.now() - Date.parse(existingUnlockProgress.updated_at) < EMAIL_SEARCH_STALE_LOCK_MS
      ) {
        throw new HttpError(409, 'EMAIL_SEARCH_ALREADY_RUNNING', 'A direct email search is already running for this podcast')
      }

      const { data: integration } = await authContext.admin
        .from('workspace_instantly_integrations')
        .select('status, api_key_ciphertext, api_key_iv')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (!integration || integration.status !== 'connected' || !integration.api_key_ciphertext || !integration.api_key_iv) {
        throw new HttpError(409, 'INSTANTLY_NOT_CONNECTED', 'Connect Instantly in the Outreach suite before running the direct email search')
      }
      const instantlyKey = await decryptInstantlyApiKey({
        ciphertext: integration.api_key_ciphertext,
        iv: integration.api_key_iv,
      })

      const searchStartedAt = new Date().toISOString()
      const writeUnlockProgress = async (progress: Record<string, unknown>) => {
        await authContext.admin
          .from('client_dashboard_podcasts')
          .update({ email_unlock_progress: { ...progress, started_at: searchStartedAt, updated_at: new Date().toISOString() } })
          .eq('id', shortlistPodcastId)
          .eq('client_id', clientId)
      }
      await writeUnlockProgress({ status: 'running', current_stage: 'identify_contact', completed_stages: [] })

      const usage = { input: 0, output: 0 }
      let podscanCalls = 0
      let usedByoKey = false
      try {
        let hostName: string | null = null
        const { data: campaignTarget } = await authContext.admin
          .from('workspace_client_campaign_targets')
          .select('host_name')
          .eq('workspace_id', workspaceId)
          .eq('shortlist_podcast_id', shortlistPodcastId)
          .maybeSingle()
        if (typeof campaignTarget?.host_name === 'string' && campaignTarget.host_name.trim()) {
          hostName = campaignTarget.host_name.trim()
        }
        if (!hostName) {
          podscanCalls += 1
          hostName = (await fetchPodcastHosts(shortlistRow.podcast_id))[0] ?? null
        }
        const researchDocument = shortlistRow.research_document as { host_info?: unknown; podcast_research?: unknown } | null
        const contactData = [researchDocument?.host_info, researchDocument?.podcast_research]
          .filter((section): section is string => typeof section === 'string' && section.length > 0)
          .join('\n\n')
        if (!hostName && contactData) {
          const anthropicKey = await resolveAiKey(authContext.admin, workspaceId, 'anthropic')
          if (anthropicKey) {
            usedByoKey = anthropicKey.source === 'workspace'
            const extracted = await runResearchPrompt(
              anthropicKey.apiKey,
              RESEARCH_PROMPT_DEFAULTS.host_name_extractor,
              fillPromptTemplate(RESEARCH_PROMPT_DEFAULTS.host_name_extractor.content, { contact_data: contactData.slice(0, 8_000) }),
              usage,
            ).catch(() => '')
            const candidateName = extracted.split('\n')[0]?.trim() ?? ''
            if (/^[A-Za-z][A-Za-z .'-]{2,79}$/u.test(candidateName)) hostName = candidateName
          }
        }
        await writeUnlockProgress({ status: 'running', current_stage: 'find_email', completed_stages: ['identify_contact'], host_name: hostName })

        const domain = podcastDomain(catalogRow?.podcast_url ?? shortlistRow.podcast_url)
        const candidates = buildEmailCandidates(hostName, domain)
        await writeUnlockProgress({
          status: 'running',
          current_stage: 'verify_email',
          completed_stages: ['identify_contact', 'find_email'],
          host_name: hostName,
        })

        let verifiedEmail: string | null = null
        for (const candidate of candidates) {
          const result = await verifyEmailWithInstantly(instantlyKey, candidate).catch(() => null)
          if (result?.status === 'verified') {
            verifiedEmail = result.email
            break
          }
        }

        if (!verifiedEmail) {
          const notFound = {
            status: 'not_found',
            current_stage: null,
            completed_stages: ['identify_contact', 'find_email'],
            host_name: hostName,
            message: candidates.length === 0
              ? 'No email candidates could be built for this podcast. Try the free Podscan inbox or enter an address manually.'
              : 'No candidate address passed verification. You were not charged.',
            started_at: searchStartedAt,
            updated_at: new Date().toISOString(),
          }
          await writeUnlockProgress(notFound)
          await logOperationCost(authContext.admin, {
            workspaceId,
            operationType: 'email_unlock_verify',
            usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls },
            usedByoKey,
            clientId,
            referenceKind: 'shortlist_podcast',
            referenceId: shortlistPodcastId,
          })
          return jsonResponse(req, METHODS, 200, { email_unlock: notFound })
        }

        const { data: recorded, error: recordError } = await authContext.admin.rpc('record_global_podcast_direct_contact_v1', {
          p_podscan_id: shortlistRow.podcast_id,
          p_email: verifiedEmail,
          p_host_name: hostName,
          p_provider: 'instantly-verification',
          p_workspace_id: workspaceId,
          p_actor_user_id: authContext.user.id,
        })
        if (recordError) throw new Error('the verified contact could not be recorded globally')
        const record = recorded as {
          credit_charge_allowed?: boolean
          email?: string
          host_name?: string | null
          verified_at?: string | null
        }

        let charged = 0
        if (record.credit_charge_allowed) {
          try {
            charged = await chargeCredits(authContext.admin, {
              workspaceId,
              operationType: 'email_unlock_verify',
              referenceKind: 'podcast_direct_contact',
              referenceId: shortlistRow.podcast_id,
              clientId,
              actorUserId: authContext.user.id,
              idempotencyKey: `email-unlock:${shortlistRow.podcast_id}`,
            })
          } catch (chargeError) {
            // The contact is already recorded globally; never claw the unlock
            // back from the workspace that produced it.
            if (!(chargeError instanceof HttpError && chargeError.code === 'INSUFFICIENT_CREDITS')) throw chargeError
            console.warn('[Client Shortlist] First global unlock succeeded without an available credit')
          }
        }

        await authContext.admin
          .from('client_dashboard_podcasts')
          .update({ email_unlock_progress: null })
          .eq('id', shortlistPodcastId)
          .eq('client_id', clientId)
        await authContext.admin
          .from('workspace_client_campaign_targets')
          .update({ host_name: record.host_name ?? hostName })
          .eq('workspace_id', workspaceId)
          .eq('shortlist_podcast_id', shortlistPodcastId)
          .is('host_name', null)

        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'email_unlock_verify',
          usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls },
          usedByoKey,
          clientId,
          referenceKind: 'podcast_direct_contact',
          referenceId: shortlistRow.podcast_id,
        })

        return jsonResponse(req, METHODS, 200, {
          email_unlock: buildUnlockedPayload(
            {
              email: record.email ?? verifiedEmail,
              host_name: record.host_name ?? hostName,
              last_verified_at: record.verified_at ?? null,
            },
            charged,
          ),
        })
      } catch (error) {
        await writeUnlockProgress({
          status: 'failed',
          current_stage: null,
          completed_stages: [],
          message: 'The direct email search was interrupted. You were not charged — try again in a moment.',
        }).catch(() => undefined)
        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'email_unlock_verify',
          usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls },
          usedByoKey,
          clientId,
          referenceKind: 'shortlist_podcast',
          referenceId: shortlistPodcastId,
        })
        if (error instanceof HttpError) throw error
        console.error('[Client Shortlist] Email waterfall failed')
        throw new HttpError(503, 'EMAIL_SEARCH_FAILED', 'The direct email search could not be completed. Try again shortly')
      }
    }

    if (action === 'autopilot-get') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
      const { data: settings } = await authContext.admin
        .from('client_autopilot_settings')
        .select('enabled, max_weekly_adds, min_score, last_run_at, last_run_added, next_run_at')
        .eq('workspace_id', workspaceId)
        .eq('client_id', clientId)
        .maybeSingle()
      return jsonResponse(req, METHODS, 200, { autopilot: settings ?? null })
    }

    if (action === 'autopilot-set') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'enabled', 'max_weekly_adds', 'min_score'])
      if (typeof body.enabled !== 'boolean') {
        throw new HttpError(400, 'INVALID_FIELD', 'enabled must be a boolean')
      }
      const maxWeeklyAdds = body.max_weekly_adds === undefined ? 5 : body.max_weekly_adds
      const minScore = body.min_score === undefined ? 70 : body.min_score
      if (typeof maxWeeklyAdds !== 'number' || !Number.isInteger(maxWeeklyAdds) || maxWeeklyAdds < 1 || maxWeeklyAdds > 15) {
        throw new HttpError(400, 'INVALID_FIELD', 'max_weekly_adds must be between 1 and 15')
      }
      if (typeof minScore !== 'number' || !Number.isInteger(minScore) || minScore < 0 || minScore > 100) {
        throw new HttpError(400, 'INVALID_FIELD', 'min_score must be between 0 and 100')
      }
      const { data: settings, error: settingsError } = await authContext.admin
        .from('client_autopilot_settings')
        .upsert({
          workspace_id: workspaceId,
          client_id: clientId,
          enabled: body.enabled,
          max_weekly_adds: maxWeeklyAdds,
          min_score: minScore,
          // Enabling schedules the first run immediately; the tick picks it up
          // within ten minutes.
          next_run_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,client_id' })
        .select('enabled, max_weekly_adds, min_score, last_run_at, last_run_added, next_run_at')
        .maybeSingle()
      if (settingsError || !settings) {
        throw new HttpError(500, 'AUTOPILOT_SAVE_FAILED', 'Autopilot settings could not be saved')
      }
      await writeAudit(authContext.admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: body.enabled ? 'workspace.client.autopilot.enabled' : 'workspace.client.autopilot.disabled',
        entityType: 'client',
        entityId: clientId,
        metadata: { max_weekly_adds: maxWeeklyAdds, min_score: minScore },
      })
      return jsonResponse(req, METHODS, 200, { autopilot: settings })
    }

    if (action === 'pitch-generate') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'shortlist_podcast_id', 'angle_index'])
      const shortlistPodcastId = requireUuid(body.shortlist_podcast_id, 'shortlist_podcast_id')
      const angleIndex = typeof body.angle_index === 'number' && Number.isInteger(body.angle_index)
        ? Math.max(0, Math.min(body.angle_index, 4))
        : 0

      const [{ data: shortlistRow }, { data: clientProfile }, { data: target }] = await Promise.all([
        authContext.admin
          .from('client_dashboard_podcasts')
          .select('id, podcast_id, podcast_name, podcast_description, podcast_url, publisher_name, ai_pitch_angles, research_document')
          .eq('id', shortlistPodcastId)
          .eq('client_id', clientId)
          .maybeSingle(),
        authContext.admin
          .from('clients')
          .select('name, bio, linkedin_url, website')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        authContext.admin
          .from('workspace_client_campaign_targets')
          .select('host_name, contact_email')
          .eq('workspace_id', workspaceId)
          .eq('shortlist_podcast_id', shortlistPodcastId)
          .maybeSingle(),
      ])
      if (!shortlistRow) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Shortlist podcast not found for this client')
      const researchDocument = (shortlistRow.research_document ?? null) as
        | {
          podcast_research?: unknown
          host_info?: unknown
          find_topics?: unknown
          episodes_used?: Array<{ title?: string }>
          episode_transcript_excerpt?: unknown
          recent_guest_name?: unknown
        }
        | null
      if (!researchDocument || typeof researchDocument.podcast_research !== 'string') {
        throw new HttpError(409, 'RESEARCH_REQUIRED', 'Run research for this podcast before generating the pitch')
      }
      const angles = Array.isArray(shortlistRow.ai_pitch_angles) ? shortlistRow.ai_pitch_angles : []
      const angle = angles[angleIndex] as { title?: string; description?: string } | undefined

      const anthropicKey = await resolveAiKey(authContext.admin, workspaceId, 'anthropic')
      if (!anthropicKey) throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Pitch writing is not configured')
      const byoKeyUsed = anthropicKey.source === 'workspace'
      await chargeCredits(authContext.admin, {
        workspaceId,
        operationType: 'query_generation',
        referenceKind: 'pitch_generate',
        referenceId: `${shortlistPodcastId}:${angleIndex}`,
        clientId,
        actorUserId: authContext.user.id,
        byoKeyUsed,
        idempotencyKey: `pitch:${shortlistPodcastId}:${angleIndex}`,
      })

      const { data: overrideRows } = await authContext.admin
        .from('workspace_research_prompts')
        .select('prompt_id, content')
        .eq('workspace_id', workspaceId)
        .in('prompt_id', ['write_email', 'clean_email'])
      const { data: clientOverrideRows } = await authContext.admin
        .from('client_ai_sdr_prompts')
        .select('prompt_id, content')
        .eq('workspace_id', workspaceId)
        .eq('client_id', clientId)
        .in('prompt_id', ['write_email', 'clean_email'])
      const overrides = new Map(
        (overrideRows ?? []).map((row) => [String(row.prompt_id), String(row.content)]),
      )
      // This client's own prompt wins over the workspace house style.
      const clientOverrides = new Map(
        (clientOverrideRows ?? []).map((row) => [String(row.prompt_id), String(row.content)]),
      )
      const promptContent = (promptId: string): string =>
        clientOverrides.get(promptId)
          ?? overrides.get(promptId)
          ?? RESEARCH_PROMPT_DEFAULTS[promptId].content

      // Every template variable is mapped from stored research and catalog
      // data — nothing raw (like the client bio document) leaks into the email.
      const researchReport = [
        String(researchDocument.podcast_research).slice(0, 8_000),
        typeof researchDocument.host_info === 'string' ? String(researchDocument.host_info).slice(0, 3_000) : '',
      ].filter(Boolean).join('\n\n')
      const variables: Record<string, string | null> = {
        client_name: clientProfile?.name ?? null,
        client_bio: typeof clientProfile?.bio === 'string' ? clientProfile.bio.slice(0, 1_500) : null,
        client_linkedin_url: clientProfile?.linkedin_url ?? null,
        client_website: clientProfile?.website ?? null,
        podcast_name: decodeHtmlEntities(shortlistRow.podcast_name),
        podcast_url: shortlistRow.podcast_url,
        podcast_description: decodeHtmlEntities(shortlistRow.podcast_description ?? ''),
        host_name: target?.host_name ?? null,
        verified_email: target?.contact_email ?? null,
        episode_title: researchDocument.episodes_used?.[0]?.title ?? null,
        episode_transcript: typeof researchDocument.episode_transcript_excerpt === 'string'
          ? researchDocument.episode_transcript_excerpt.slice(0, 2_000)
          : null,
        recent_guest_name: typeof researchDocument.recent_guest_name === 'string'
          ? researchDocument.recent_guest_name.slice(0, 200)
          : null,
        topic_proposal: [
          angle?.title && angle?.description ? `SELECTED ANGLE: ${angle.title} — ${angle.description}` : '',
          typeof researchDocument.find_topics === 'string' ? String(researchDocument.find_topics).slice(0, 4_000) : '',
        ].filter(Boolean).join('\n\n') || null,
        research_report: researchReport,
      }

      const usage = { input: 0, output: 0 }
      try {
        const draftEmail = await runResearchPrompt(
          anthropicKey.apiKey,
          RESEARCH_PROMPT_DEFAULTS.write_email,
          fillPromptTemplate(promptContent('write_email'), variables),
          usage,
        )
        const cleaned = await runResearchPrompt(
          anthropicKey.apiKey,
          RESEARCH_PROMPT_DEFAULTS.clean_email,
          fillPromptTemplate(promptContent('clean_email'), { email_draft: draftEmail.slice(0, 6_000) }),
          usage,
        )

        // The cleaned output is the email body; lift a Subject: line when the
        // prompt produced one.
        let subject = `Guest idea for ${decodeHtmlEntities(shortlistRow.podcast_name)}: ${clientProfile?.name ?? 'a guest'}`
        let emailBody = cleaned.trim()
        const subjectMatch = emailBody.match(/^\s*subject\s*:\s*(.{3,200})$/imu)
        if (subjectMatch) {
          subject = subjectMatch[1].trim()
          emailBody = emailBody.replace(subjectMatch[0], '').trim()
        }

        await logOperationCost(authContext.admin, {
          workspaceId,
          operationType: 'query_generation',
          usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output },
          usedByoKey: byoKeyUsed,
          clientId,
          referenceKind: 'pitch_generate',
          referenceId: shortlistPodcastId,
        })
        return jsonResponse(req, METHODS, 200, {
          pitch: { subject: subject.slice(0, 300), body: emailBody.slice(0, 6_000), angle_index: angleIndex },
        })
      } catch (error) {
        if (error instanceof HttpError) throw error
        console.error('[Client Shortlist] Pitch generation failed')
        throw new HttpError(503, 'PITCH_FAILED', 'The pitch could not be written. Try again shortly')
      }
    }

    if (action === 'research-inspect') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'client_id', 'shortlist_podcast_id'])
      const shortlistPodcastId = requireUuid(body.shortlist_podcast_id, 'shortlist_podcast_id')
      const { data: row, error } = await authContext.admin
        .from('client_dashboard_podcasts')
        .select('id, research_document')
        .eq('id', shortlistPodcastId)
        .eq('client_id', clientId)
        .maybeSingle()
      if (error) throw new HttpError(500, 'RESEARCH_LOOKUP_FAILED', 'The stored research could not be loaded')
      if (!row) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Shortlist podcast not found for this client')
      const document = (row.research_document ?? null) as Record<string, unknown> | null
      const section = (key: string, max: number): string | null => {
        const value = document?.[key]
        return typeof value === 'string' && value.trim() ? value.slice(0, max) : null
      }
      const episodesUsed = Array.isArray(document?.episodes_used)
        ? (document.episodes_used as unknown[]).flatMap((raw) => {
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
          const episode = raw as Record<string, unknown>
          return typeof episode.title === 'string'
            ? [{ title: episode.title.slice(0, 300), had_transcript: Boolean(episode.had_transcript) }]
            : []
        }).slice(0, 5)
        : []
      return jsonResponse(req, METHODS, 200, {
        document: document
          ? {
            podcast_research: section('podcast_research', 20_000),
            host_info: section('host_info', 20_000),
            guest_info: section('guest_info', 20_000),
            find_topics: section('find_topics', 20_000),
            episode_transcript_excerpt: section('episode_transcript_excerpt', 2_000),
            recent_guest_name: section('recent_guest_name', 200),
            episodes_used: episodesUsed,
            generated_at: typeof document.generated_at === 'string' ? document.generated_at : null,
          }
          : null,
      })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown client shortlist action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
