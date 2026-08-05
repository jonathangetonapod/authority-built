import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  normalizeEmail,
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
import { chargeCredits, logOperationCost, retryWindowKey } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'

const METHODS = ['POST'] as const
const PROSPECT_IMAGE_BUCKET = 'prospect-images'
const PROSPECT_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const MAX_PROSPECT_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_PROSPECT_IMAGE_MULTIPART_BYTES = MAX_PROSPECT_IMAGE_BYTES + (64 * 1024)
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const PROFILE_FIELDS = [
  'name',
  'email',
  'company',
  'title',
  'bio',
  'image_url',
  'linkedin_url',
  'website',
  'industry',
  'expertise',
  'topics',
  'target_audience',
  'cta_type',
  'cta_label',
  'cta_url',
] as const
const DASHBOARD_FIELDS = [
  'id',
  'workspace_id',
  'slug',
  'prospect_name',
  'first_name',
  'prospect_email',
  'prospect_company',
  'prospect_title',
  'prospect_bio',
  'prospect_image_url',
  'prospect_linkedin_url',
  'prospect_website',
  'prospect_industry',
  'prospect_expertise',
  'prospect_topics',
  'prospect_target_audience',
  'lifecycle_status',
  'build_error',
  'build_started_at',
  'build_completed_at',
  'published_at',
  'sent_at',
  'first_engaged_at',
  'converted_at',
  'cta_type',
  'cta_label',
  'cta_url',
  'show_pricing_section',
  'is_active',
  'content_ready',
  'pending_review_at',
  'view_count',
  'last_viewed_at',
  'created_by',
  'created_at',
  'updated_at',
].join(',')
const SHORTLIST_FIELDS = [
  'id',
  'prospect_dashboard_id',
  'podcast_id',
  'podcast_name',
  'podcast_description',
  'podcast_image_url',
  'podcast_url',
  'publisher_name',
  'itunes_rating',
  'episode_count',
  'audience_size',
  'podcast_categories',
  'last_posted_at',
  'ai_clean_description',
  'ai_fit_reasons',
  'ai_pitch_angles',
  'ai_analyzed_at',
  'visibility',
  'display_order',
  'is_featured',
  'featured_order',
  'operator_notes',
  'relevance_score',
  'relevance_reason',
  'match_source',
  'archived_at',
  'created_at',
  'updated_at',
].join(',')
const WORKSPACE_FIELDS = [
  'id',
  'name',
  'status',
  'is_default',
  'logo_path',
  'logo_updated_at',
  'client_brand_name',
  'client_brand_primary_color',
  'client_brand_accent_color',
].join(',')

interface ProspectDashboardRow extends Record<string, unknown> {
  id: string
  workspace_id: string
  slug: string
  prospect_name: string
  prospect_bio: string | null
  prospect_industry: string | null
  prospect_expertise: string[] | null
  prospect_topics: string[] | null
  prospect_target_audience: string | null
  prospect_company: string | null
  prospect_title: string | null
  lifecycle_status: string
  published_at: string | null
  updated_at: string
}

interface ShortlistRow extends Record<string, unknown> {
  prospect_dashboard_id: string
  podcast_id: string
  visibility: string
  relevance_reason: string | null
  ai_fit_reasons: unknown
  is_featured: boolean
}

interface PodcastCandidate extends Record<string, unknown> {
  id: string
  podscan_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories: unknown
  last_posted_at: string | null
  similarity: number
}

interface RankedCandidate {
  index: number
  score: number
  reason: string
  pitch_angles: Array<{ title: string; description: string }>
}

interface ProspectShortlistPodcastInput {
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
  relevance_score: number | null
  relevance_reason: string | null
}

function requireManager(access: WorkspaceFeatureAccess): void {
  if (!MANAGER_ROLES.has(access.role)) {
    throw new HttpError(403, 'WORKSPACE_MANAGER_REQUIRED', 'Workspace manager access is required')
  }
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

function managedProspectImagePath(
  value: unknown,
  workspaceId: string,
  dashboardId: string,
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = new URL(value)
    const marker = `/storage/v1/object/public/${PROSPECT_IMAGE_BUCKET}/`
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex < 0) return null
    const encodedPath = parsed.pathname.slice(markerIndex + marker.length)
    const path = encodedPath.split('/').map(decodeURIComponent).join('/')
    const prefix = `${workspaceId}/${dashboardId}/`
    return path.startsWith(prefix) ? path : null
  } catch {
    return null
  }
}

function matchesProspectImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)
  }
  if (contentType === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  return false
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

function prospectShortlistPodcast(value: unknown, index: number): ProspectShortlistPodcastInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `podcasts[${index}] must be an object`)
  }
  const podcast = value as Record<string, unknown>
  requireOnlyKeys(podcast, [
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
    'relevance_score',
    'relevance_reason',
  ])
  const id = requireString(podcast.podcast_id, `podcasts[${index}].podcast_id`, { max: 300 })
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
    relevance_score: optionalNumber(podcast.relevance_score, `podcasts[${index}].relevance_score`, { min: 0, max: 10 }),
    relevance_reason: optionalString(podcast.relevance_reason, `podcasts[${index}].relevance_reason`, 2_000),
  }
}

function prospectShortlistPodcasts(value: unknown): ProspectShortlistPodcastInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcasts must contain between 1 and 50 items')
  }
  const parsed = value.map(prospectShortlistPodcast)
  if (new Set(parsed.map((podcast) => podcast.podcast_id)).size !== parsed.length) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcasts contains duplicate IDs')
  }
  return parsed
}

function optionalEmail(value: unknown): string | null {
  const email = optionalString(value, 'email', 254)
  if (!email) return null
  const normalized = normalizeEmail(email)
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, 'INVALID_EMAIL', 'email must be a valid email address')
  }
  return normalized
}

function optionalStringArray(value: unknown, field: string): string[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.length > 20) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must contain at most 20 items`)
  }
  const items = value.map((entry, index) => requireString(entry, `${field}[${index}]`, { max: 120 }))
  const unique = Array.from(new Set(items))
  if (unique.length !== items.length) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must not contain duplicate items`)
  }
  return unique
}

function profilePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_PROFILE', 'profile must be an object')
  }
  const profile = value as Record<string, unknown>
  requireOnlyKeys(profile, PROFILE_FIELDS)
  const ctaType = typeof profile.cta_type === 'string' ? profile.cta_type.trim() : 'reply'
  if (!['reply', 'book_call', 'learn_more', 'none'].includes(ctaType)) {
    throw new HttpError(400, 'INVALID_FIELD', 'cta_type is invalid')
  }
  const ctaUrl = optionalHttpUrl(profile.cta_url, 'cta_url')
  if (['book_call', 'learn_more'].includes(ctaType) && !ctaUrl) {
    throw new HttpError(400, 'INVALID_FIELD', 'cta_url is required for a linked call to action')
  }
  const name = requireString(profile.name, 'name', { max: 200 })
  return {
    prospect_name: name,
    first_name: name.split(/\s+/u)[0] || name,
    prospect_email: optionalEmail(profile.email),
    prospect_company: optionalString(profile.company, 'company', 300),
    prospect_title: optionalString(profile.title, 'title', 300),
    prospect_bio: optionalString(profile.bio, 'bio', 20_000),
    prospect_image_url: optionalHttpUrl(profile.image_url, 'image_url'),
    prospect_linkedin_url: optionalHttpUrl(profile.linkedin_url, 'linkedin_url'),
    prospect_website: optionalHttpUrl(profile.website, 'website'),
    prospect_industry: optionalString(profile.industry, 'industry', 300),
    prospect_expertise: optionalStringArray(profile.expertise, 'expertise'),
    prospect_topics: optionalStringArray(profile.topics, 'topics'),
    prospect_target_audience: optionalString(profile.target_audience, 'target_audience', 2_000),
    cta_type: ctaType,
    cta_label: optionalString(profile.cta_label, 'cta_label', 80)
      || (ctaType === 'book_call' ? 'Book a strategy call' : ctaType === 'learn_more' ? 'Learn more' : 'Reply to this email'),
    cta_url: ctaUrl,
  }
}

function hasAnalysis(row: ShortlistRow): boolean {
  return Boolean(row.relevance_reason?.trim())
    || (Array.isArray(row.ai_fit_reasons) && row.ai_fit_reasons.length > 0)
}

function readinessForRows(dashboard: ProspectDashboardRow, rows: ShortlistRow[]) {
  const visibleRows = rows.filter((row) => row.visibility === 'visible')
  const profileReady = dashboard.prospect_name.trim().length > 0
    && (dashboard.prospect_bio?.trim().length || 0) >= 80
  const ctaReady = ['book_call', 'learn_more'].includes(String(dashboard.cta_type))
    ? Boolean(dashboard.cta_url)
    : true
  const analyzedCount = visibleRows.filter(hasAnalysis).length
  return {
    profile_ready: profileReady,
    visible_count: visibleRows.length,
    analyzed_count: analyzedCount,
    featured_count: visibleRows.filter((row) => row.is_featured).length,
    cta_ready: ctaReady,
    publishable: profileReady && visibleRows.length >= 5 && analyzedCount >= 5 && ctaReady,
  }
}

async function workspaceRecord(admin: AuthContext['admin'], workspaceId: string) {
  const { data, error } = await admin
    .from('workspaces')
    .select(WORKSPACE_FIELDS)
    .eq('id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new HttpError(500, 'WORKSPACE_LOOKUP_FAILED', 'The workspace could not be loaded')
  if (!data) throw new HttpError(404, 'WORKSPACE_NOT_FOUND', 'Active workspace not found')
  return data
}

async function requireWorkspaceProspect(
  admin: AuthContext['admin'],
  workspaceId: string,
  dashboardId: string,
): Promise<ProspectDashboardRow> {
  const { data, error } = await admin
    .from('prospect_dashboards')
    .select(DASHBOARD_FIELDS)
    .eq('id', dashboardId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new HttpError(500, 'PROSPECT_LOOKUP_FAILED', 'The prospect dashboard could not be loaded')
  if (!data) throw new HttpError(404, 'PROSPECT_NOT_FOUND', 'Workspace prospect dashboard not found')
  return data as unknown as ProspectDashboardRow
}

async function shortlistRows(
  admin: AuthContext['admin'],
  dashboardId: string,
): Promise<ShortlistRow[]> {
  const { data, error } = await admin
    .from('prospect_dashboard_podcasts')
    .select(SHORTLIST_FIELDS)
    .eq('prospect_dashboard_id', dashboardId)
    .order('is_featured', { ascending: false })
    .order('featured_order', { ascending: true, nullsFirst: false })
    .order('display_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(500)
  if (error) throw new HttpError(500, 'SHORTLIST_LOOKUP_FAILED', 'The prospect shortlist could not be loaded')
  return (data || []) as unknown as ShortlistRow[]
}

async function detailPayload(
  admin: AuthContext['admin'],
  workspaceId: string,
  dashboardId: string,
) {
  const [dashboard, podcasts] = await Promise.all([
    requireWorkspaceProspect(admin, workspaceId, dashboardId),
    shortlistRows(admin, dashboardId),
  ])
  return {
    dashboard: { ...dashboard, readiness: readinessForRows(dashboard, podcasts) },
    podcasts,
  }
}

function prospectEmbeddingText(prospect: ProspectDashboardRow): string {
  const parts = [
    `Name: ${prospect.prospect_name}`,
    prospect.prospect_title ? `Title: ${prospect.prospect_title}` : '',
    prospect.prospect_company ? `Company: ${prospect.prospect_company}` : '',
    prospect.prospect_industry ? `Industry: ${prospect.prospect_industry}` : '',
    prospect.prospect_bio ? `Background: ${prospect.prospect_bio}` : '',
    prospect.prospect_expertise?.length ? `Expertise: ${prospect.prospect_expertise.join(', ')}` : '',
    prospect.prospect_topics?.length ? `Speaking topics: ${prospect.prospect_topics.join(', ')}` : '',
    prospect.prospect_target_audience ? `Target audience: ${prospect.prospect_target_audience}` : '',
  ]
  return parts.filter(Boolean).join('\n')
}

function rankLexicalCandidates(
  candidates: PodcastCandidate[],
  prospectText: string,
  limit = 40,
): PodcastCandidate[] {
  const stopWords = new Set([
    'about', 'after', 'also', 'and', 'are', 'been', 'being', 'business', 'but',
    'can', 'company', 'for', 'from', 'has', 'have', 'into', 'more', 'name',
    'not', 'our', 'prospect', 'that', 'the', 'their', 'they', 'this', 'through',
    'title', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'with', 'your',
  ])
  const terms = (value: string) => new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, ' ')
      .split(/\s+/u)
      .filter((term) => term.length >= 3 && !stopWords.has(term))
  )
  const prospectTerms = terms(prospectText)
  return candidates
    .map((candidate, sourceIndex) => {
      const candidateTerms = terms([
        candidate.podcast_name,
        candidate.publisher_name || '',
        candidate.podcast_description || '',
        JSON.stringify(candidate.podcast_categories || ''),
      ].join(' '))
      let overlap = 0
      for (const term of candidateTerms) {
        if (prospectTerms.has(term)) overlap += 1
      }
      const relevanceScore = Number(candidate.relevance_score || 0)
      const sourceOrderSignal = Math.max(0, 1 - sourceIndex / Math.max(candidates.length, 1))
      const similarity = overlap
        + (Number.isFinite(relevanceScore) ? relevanceScore / 4 : 0)
        + sourceOrderSignal / 10
      return { ...candidate, similarity }
    })
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
}

async function generateEmbedding(
  input: string,
  apiKeyOverride?: string,
): Promise<{ embedding: number[]; tokens: number }> {
  const apiKey = apiKeyOverride ?? Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) throw new HttpError(500, 'BUILD_NOT_CONFIGURED', 'Prospect matching is not configured')
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input,
      dimensions: 1_536,
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`embedding request failed with ${response.status}`)
  const payload = await response.json()
  const embedding = payload?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || embedding.length !== 1_536) {
    throw new Error('embedding response was invalid')
  }
  const tokens = Number(payload?.usage?.total_tokens) || 0
  return { embedding, tokens }
}

function parseRankedCandidates(value: unknown, candidateCount: number): RankedCandidate[] {
  if (!Array.isArray(value)) throw new Error('ranking response was not an array')
  const ranked: RankedCandidate[] = []
  const seen = new Set<number>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const index = Number(record.index)
    const score = Number(record.score)
    if (!Number.isInteger(index) || index < 0 || index >= candidateCount || seen.has(index)) continue
    if (!Number.isFinite(score) || score < 0 || score > 10) continue
    if (typeof record.reason !== 'string' || record.reason.trim().length < 20) continue
    const pitchAngles = Array.isArray(record.pitch_angles)
      ? record.pitch_angles.flatMap((rawAngle) => {
        if (!rawAngle || typeof rawAngle !== 'object' || Array.isArray(rawAngle)) return []
        const angle = rawAngle as Record<string, unknown>
        if (typeof angle.title !== 'string' || typeof angle.description !== 'string') return []
        const title = angle.title.trim().slice(0, 160)
        const description = angle.description.trim().slice(0, 800)
        return title && description ? [{ title, description }] : []
      }).slice(0, 2)
      : []
    seen.add(index)
    ranked.push({
      index,
      score,
      reason: record.reason.trim().slice(0, 2_000),
      pitch_angles: pitchAngles,
    })
  }
  return ranked.sort((left, right) => right.score - left.score).slice(0, 12)
}

async function rankCandidates(
  prospectText: string,
  candidates: PodcastCandidate[],
  apiKeyOverride?: string,
): Promise<{ ranked: RankedCandidate[]; inputTokens: number; outputTokens: number }> {
  const apiKey = apiKeyOverride ?? Deno.env.get('ANTHROPIC_API_KEY')?.trim()
  if (!apiKey) throw new HttpError(500, 'BUILD_NOT_CONFIGURED', 'Prospect analysis is not configured')
  const candidateText = candidates.map((candidate, index) => ({
    index,
    name: candidate.podcast_name,
    publisher: candidate.publisher_name,
    description: candidate.podcast_description?.slice(0, 650) || '',
    categories: candidate.podcast_categories,
    audience_size: candidate.audience_size,
    rating: candidate.itunes_rating,
    episodes: candidate.episode_count,
    semantic_similarity: Number(candidate.similarity || 0).toFixed(4),
  }))
  const prompt = `You are a senior podcast booking strategist. Select and rank the 12 strongest podcast guest opportunities for this prospect.

PROSPECT PROFILE
${prospectText}

CANDIDATES
${JSON.stringify(candidateText)}

Judge topical alignment, audience overlap, guest format, show activity, and whether the prospect has a credible story for the room. Avoid generic business shows when a more specific fit exists. Return at least 8 candidates and no more than 12.

Return ONLY a JSON array:
[
  {
    "index": 0,
    "score": 8.7,
    "reason": "Two specific sentences explaining the fit.",
    "pitch_angles": [
      {"title": "Specific episode angle", "description": "One-sentence angle grounded in the prospect profile."}
    ]
  }
]`
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4_096,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!response.ok) throw new Error(`ranking request failed with ${response.status}`)
  const payload = await response.json()
  const text = payload?.content?.find((block: { type?: string }) => block.type === 'text')?.text
  if (typeof text !== 'string') throw new Error('ranking response was empty')
  const json = text.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')
  const ranked = parseRankedCandidates(JSON.parse(json), candidates.length)
  if (ranked.length < 5) throw new Error('ranking response did not contain enough qualified matches')
  return {
    ranked,
    inputTokens: Number(payload?.usage?.input_tokens) || 0,
    outputTokens: Number(payload?.usage?.output_tokens) || 0,
  }
}

function fallbackRankCandidates(
  prospect: ProspectDashboardRow,
  candidates: PodcastCandidate[],
): RankedCandidate[] {
  const genericTerms = new Set([
    'about', 'after', 'also', 'and', 'are', 'been', 'being', 'business', 'can',
    'company', 'experience', 'for', 'from', 'guest', 'has', 'have', 'into',
    'more', 'most', 'podcast', 'show', 'that', 'the', 'their', 'they', 'this',
    'through', 'with', 'years', 'your',
  ])
  const words = (value: string) => value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(/\s+/u)
    .filter((term) => term.length >= 4 && !genericTerms.has(term))
  const topTerms = (value: string, limit: number) => {
    const counts = new Map<string, number>()
    for (const term of words(value)) counts.set(term, (counts.get(term) || 0) + 1)
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([term]) => term)
      .slice(0, limit)
  }
  const humanize = (value: string) => value
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase())
  const explicitFocus = [
    ...(prospect.prospect_topics || []),
    ...(prospect.prospect_expertise || []),
    prospect.prospect_industry || '',
  ].map((value) => value.trim()).filter(Boolean)
  const profileTerms = topTerms(prospect.prospect_bio || '', 12)
  const primaryFocus = explicitFocus[0]
    || profileTerms.slice(0, 2).map(humanize).join(' and ')
    || 'practical leadership'
  const secondaryFocus = explicitFocus[1]
    || profileTerms.slice(2, 4).map(humanize).join(' and ')
    || primaryFocus
  const prospectTermSet = new Set(words(prospectEmbeddingText(prospect)))

  return candidates.slice(0, 12).map((candidate, index) => {
    const candidateTerms = topTerms([
      candidate.podcast_name,
      candidate.podcast_description || '',
      JSON.stringify(candidate.podcast_categories || ''),
    ].join(' '), 16)
    const sharedTerms = candidateTerms
      .filter((term) => prospectTermSet.has(term))
      .slice(0, 2)
      .map(humanize)
    const podcastFocus = sharedTerms.join(' and ')
      || candidateTerms.slice(0, 2).map(humanize).join(' and ')
      || 'the show’s core subject matter'
    const companyContext = prospect.prospect_company
      ? `their work at ${prospect.prospect_company}`
      : 'their professional track record'
    const score = Number(Math.max(
      6.8,
      Math.min(9.4, 7.4 + Math.min(1.4, candidate.similarity / 5) - index * 0.03),
    ).toFixed(1))
    return {
      index,
      score,
      reason: `${candidate.podcast_name} covers ${podcastFocus}, which overlaps with ${prospect.prospect_name}'s experience in ${primaryFocus}. The conversation can stay practical by connecting ${secondaryFocus} to ${companyContext}.`,
      pitch_angles: [{
        title: `${humanize(primaryFocus)}: What Actually Works`.slice(0, 160),
        description: `${prospect.prospect_name} can share specific lessons from ${companyContext}, including what changed their approach and what listeners can apply.`.slice(0, 800),
      }],
    }
  })
}

function buildFailureMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message
  const detail = error instanceof Error ? error.message : ''
  if (detail.startsWith('embedding request failed')) {
    return 'The podcast matching provider is temporarily unavailable. Try the build again.'
  }
  if (detail === 'embedding response was invalid') {
    return 'The podcast matching provider returned an invalid result. Try the build again.'
  }
  if (detail === 'semantic podcast search failed') {
    return 'The podcast catalog could not be searched. Try the build again.'
  }
  if (detail.includes('not enough active guest podcasts')) {
    return 'Not enough active guest podcasts matched this profile. Add more specific topics or expertise and try again.'
  }
  if (detail.startsWith('ranking request failed')) {
    return 'The shortlist analysis provider is temporarily unavailable. Try the build again.'
  }
  if (detail.startsWith('ranking response')) {
    return 'The shortlist analysis was incomplete. Try the build again.'
  }
  if (detail.includes('matched podcast details')) {
    return 'The matched podcast details were incomplete. Try the build again.'
  }
  if (detail.includes('shortlist') || detail.includes('prospect build')) {
    return 'The ranked shortlist could not be saved. Try the build again.'
  }
  return 'The automatic shortlist build failed. Review the profile and try again.'
}

async function buildProspect(
  context: AuthContext,
  workspaceId: string,
  dashboardId: string,
): Promise<Awaited<ReturnType<typeof detailPayload>>> {
  const prospect = await requireWorkspaceProspect(context.admin, workspaceId, dashboardId)
  const prospectText = prospectEmbeddingText(prospect)
  if ((prospect.prospect_bio?.trim().length || 0) < 80) {
    throw new HttpError(409, 'PROFILE_NOT_READY', 'Add a focused prospect profile of at least 80 characters before building')
  }

  const anthropicKey = await resolveAiKey(context.admin, workspaceId, 'anthropic')
  const openaiKey = await resolveAiKey(context.admin, workspaceId, 'openai')
  const byoKeyUsed = anthropicKey?.source === 'workspace'
  await chargeCredits(context.admin, {
    workspaceId,
    operationType: 'dashboard_build',
    referenceKind: 'prospect_dashboard',
    referenceId: dashboardId,
    idempotencyKey: retryWindowKey(['dashboard_build', dashboardId]),
    actorUserId: context.user.id,
    byoKeyUsed,
  })
  const buildUsage = { anthropicInputTokens: 0, anthropicOutputTokens: 0, openaiTokens: 0 }

  const buildStartedAt = new Date().toISOString()
  const { error: startError } = await context.admin
    .from('prospect_dashboards')
    .update({
      lifecycle_status: 'matching',
      build_error: null,
      build_started_at: buildStartedAt,
      build_completed_at: null,
      published_at: null,
      content_ready: false,
    })
    .eq('id', dashboardId)
    .eq('workspace_id', workspaceId)
  if (startError) throw new HttpError(500, 'BUILD_START_FAILED', 'The prospect build could not be started')

  try {
    const { data: existingCandidates, error: existingCandidatesError } = await context.admin
      .from('prospect_dashboard_podcasts')
      .select('podcast_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,itunes_rating,episode_count,audience_size,podcast_categories,last_posted_at,relevance_score')
      .eq('prospect_dashboard_id', dashboardId)
      .eq('visibility', 'visible')
      .in('match_source', ['legacy', 'sheet'])
      .order('display_order', { ascending: true })
      .limit(250)
    if (existingCandidatesError) throw new Error('previous shortlist candidates could not be loaded')

    let candidates = rankLexicalCandidates(
      ((existingCandidates || []) as Array<Record<string, unknown>>).map((podcast) => ({
        ...podcast,
        id: String(podcast.podcast_id),
        podscan_id: String(podcast.podcast_id),
        similarity: 0,
      })) as unknown as PodcastCandidate[],
      prospectText,
    )

    if (candidates.length >= 5) {
      console.log(`Workspace prospect build is using ${candidates.length} curated legacy candidates`)
    } else {
      try {
        const { embedding, tokens: embeddingTokens } = await generateEmbedding(prospectText, openaiKey?.apiKey)
        buildUsage.openaiTokens += embeddingTokens
        const { data: semanticMatches, error: matchError } = await context.admin.rpc('search_similar_podcasts', {
          query_embedding: embedding,
          match_threshold: 0.18,
          match_count: 40,
          p_exclude_podcast_ids: null,
        })
        if (matchError) throw new Error('semantic podcast search failed')
        if (Array.isArray(semanticMatches) && semanticMatches.length >= 5) {
          const centralIds = semanticMatches.map((match) => String(match.id))
          const { data: catalog, error: catalogError } = await context.admin
            .from('podcasts')
            .select('id,podscan_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,itunes_rating,episode_count,audience_size,podcast_categories,last_posted_at')
            .in('id', centralIds)
          if (catalogError) throw new Error('matched podcast details could not be loaded')
          const semanticById = new Map(semanticMatches.map((match) => [String(match.id), Number(match.similarity || 0)]))
          candidates = (catalog || []).map((podcast) => ({
            ...podcast,
            similarity: semanticById.get(String(podcast.id)) || 0,
          })) as unknown as PodcastCandidate[]
          candidates.sort((left, right) => right.similarity - left.similarity)
        }
      } catch {
        console.warn('Workspace prospect semantic matching was unavailable; using catalog fallback')
      }
    }

    if (candidates.length < 5) {
      const { data: fallbackCatalog, error: fallbackError } = await context.admin
        .from('podcasts')
        .select('id,podscan_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,itunes_rating,episode_count,audience_size,podcast_categories,last_posted_at')
        .or('podcast_has_guests.eq.true,podcast_has_guests.is.null')
        .order('last_posted_at', { ascending: false, nullsFirst: false })
        .limit(300)
      if (fallbackError) throw new Error('fallback podcast catalog could not be loaded')
      candidates = rankLexicalCandidates(
        ((fallbackCatalog || []) as unknown as PodcastCandidate[]).map((podcast) => ({
          ...podcast,
          similarity: 0,
        })),
        prospectText,
      )
    }
    if (candidates.length < 5) throw new Error('not enough active guest podcasts matched this profile')

    await context.admin
      .from('prospect_dashboards')
      .update({ lifecycle_status: 'analyzing' })
      .eq('id', dashboardId)
      .eq('workspace_id', workspaceId)

    let rankingSource: 'ai_ranked' | 'semantic' = 'ai_ranked'
    let ranked: RankedCandidate[]
    try {
      const ranking = await rankCandidates(prospectText, candidates, anthropicKey?.apiKey)
      ranked = ranking.ranked
      buildUsage.anthropicInputTokens += ranking.inputTokens
      buildUsage.anthropicOutputTokens += ranking.outputTokens
    } catch {
      console.warn('Workspace prospect AI ranking was unavailable; using deterministic ranking')
      rankingSource = 'semantic'
      ranked = fallbackRankCandidates(prospect, candidates)
    }
    if (ranked.length < 5) throw new Error('ranking response did not contain enough qualified matches')
    await logOperationCost(context.admin, {
      workspaceId,
      operationType: 'dashboard_build',
      usage: buildUsage,
      usedByoKey: byoKeyUsed,
      referenceKind: 'prospect_dashboard',
      referenceId: dashboardId,
    })
    const now = new Date().toISOString()
    const selected = ranked.map((rank, displayOrder) => {
      const podcast = candidates[rank.index]
      return {
        prospect_dashboard_id: dashboardId,
        podcast_id: podcast.podscan_id,
        podcast_name: podcast.podcast_name,
        podcast_description: podcast.podcast_description,
        podcast_image_url: podcast.podcast_image_url,
        podcast_url: podcast.podcast_url,
        publisher_name: podcast.publisher_name,
        itunes_rating: podcast.itunes_rating,
        episode_count: podcast.episode_count,
        audience_size: podcast.audience_size,
        podcast_categories: podcast.podcast_categories,
        last_posted_at: podcast.last_posted_at,
        ai_clean_description: rankingSource === 'ai_ranked' ? podcast.podcast_description : null,
        ai_fit_reasons: rankingSource === 'ai_ranked' ? [rank.reason] : null,
        ai_pitch_angles: rank.pitch_angles,
        ai_analyzed_at: rankingSource === 'ai_ranked' ? now : null,
        visibility: 'visible',
        display_order: displayOrder,
        is_featured: displayOrder < 5,
        featured_order: displayOrder < 5 ? displayOrder : null,
        relevance_score: rank.score,
        relevance_reason: rank.reason,
        match_source: rankingSource,
        archived_at: null,
        archived_by: null,
        updated_at: now,
      }
    })

    const selectedIds = new Set(selected.map((podcast) => podcast.podcast_id))
    const { data: previousGenerated, error: previousError } = await context.admin
      .from('prospect_dashboard_podcasts')
      .select('podcast_id')
      .eq('prospect_dashboard_id', dashboardId)
      .in('match_source', ['legacy', 'sheet', 'semantic', 'ai_ranked'])
      .eq('visibility', 'visible')
    if (previousError) throw new Error('previous generated shortlist could not be checked')
    const staleIds = (previousGenerated || [])
      .map((row) => String(row.podcast_id))
      .filter((podcastId) => !selectedIds.has(podcastId))
    if (staleIds.length > 0) {
      const { error: archiveError } = await context.admin
        .from('prospect_dashboard_podcasts')
        .update({
          visibility: 'archived',
          is_featured: false,
          featured_order: null,
          archived_at: now,
          archived_by: context.user.id,
          updated_at: now,
        })
        .eq('prospect_dashboard_id', dashboardId)
        .in('podcast_id', staleIds)
      if (archiveError) throw new Error('previous generated shortlist could not be archived')
    }

    const { error: shortlistError } = await context.admin
      .from('prospect_dashboard_podcasts')
      .upsert(selected, { onConflict: 'prospect_dashboard_id,podcast_id' })
    if (shortlistError) throw new Error('ranked shortlist could not be saved')

    const { error: finishError } = await context.admin
      .from('prospect_dashboards')
      .update({
        lifecycle_status: 'review',
        build_error: null,
        build_completed_at: now,
        published_at: null,
        content_ready: false,
      })
      .eq('id', dashboardId)
      .eq('workspace_id', workspaceId)
    if (finishError) throw new Error('prospect build could not be finalized')

    await writeAudit(context.admin, {
      workspaceId,
      actorUserId: context.user.id,
      action: 'workspace.prospect.built',
      entityType: 'prospect_dashboard',
      entityId: dashboardId,
      metadata: {
        shortlist_count: selected.length,
        ranking_source: rankingSource,
        model: rankingSource === 'ai_ranked' ? 'claude-haiku-4-5-20251001' : null,
      },
    })
    return await detailPayload(context.admin, workspaceId, dashboardId)
  } catch (error) {
    const message = buildFailureMessage(error)
    console.error(`Workspace prospect build failed: ${message}`)
    await context.admin
      .from('prospect_dashboards')
      .update({
        lifecycle_status: 'failed',
        build_error: message,
        build_completed_at: new Date().toISOString(),
        published_at: null,
        content_ready: false,
      })
      .eq('id', dashboardId)
      .eq('workspace_id', workspaceId)
    if (error instanceof HttpError) throw error
    throw new HttpError(502, 'BUILD_FAILED', message)
  }
}

function publicationError(error: { code?: string; message?: string }): never {
  const message = (error.message || '').toLowerCase()
  if (message.includes('not ready') || error.code === '23514') {
    throw new HttpError(409, 'PROSPECT_NOT_READY', 'Complete the profile, five analyzed matches, and CTA before publishing')
  }
  if (message.includes('manager access') || error.code === '42501') {
    throw new HttpError(403, 'WORKSPACE_MANAGER_REQUIRED', 'Workspace manager access is required')
  }
  if (message.includes('not found') || error.code === 'P0002') {
    throw new HttpError(404, 'PROSPECT_NOT_FOUND', 'Workspace prospect dashboard not found')
  }
  throw new HttpError(500, 'PUBLICATION_FAILED', 'The prospect publication state could not be changed')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    let photoFile: File | null = null
    let body: Record<string, unknown>
    const multipartRequest = (req.headers.get('content-type') || '')
      .toLowerCase()
      .startsWith('multipart/form-data')
    if (multipartRequest) {
      const declaredLength = Number(req.headers.get('content-length'))
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 1) {
        throw new HttpError(411, 'CONTENT_LENGTH_REQUIRED', 'Prospect photo uploads require a valid Content-Length')
      }
      if (declaredLength > MAX_PROSPECT_IMAGE_MULTIPART_BYTES) {
        throw new HttpError(413, 'BODY_TOO_LARGE', 'Prospect photo upload is too large')
      }
      const form = await req.formData()
      const allowedFormFields = new Set(['action', 'workspace_id', 'dashboard_id', 'photo'])
      const formKeys = Array.from(form.keys())
      if (
        formKeys.some((key) => !allowedFormFields.has(key))
        || Array.from(allowedFormFields).some((key) => form.getAll(key).length > 1)
      ) {
        throw new HttpError(400, 'INVALID_MULTIPART_BODY', 'Prospect photo upload fields are invalid')
      }
      const candidate = form.get('photo')
      if (candidate instanceof File) photoFile = candidate
      body = {
        action: form.get('action'),
        workspace_id: form.get('workspace_id'),
        dashboard_id: form.get('dashboard_id'),
      }
    } else {
      body = await parseJsonObject(req, 1_000_000)
    }
    const action = typeof body.action === 'string' ? body.action : ''
    if (multipartRequest && action !== 'photo-upload') {
      throw new HttpError(400, 'INVALID_ACTION', 'Multipart requests are only accepted for prospect photo uploads')
    }
    const context = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(context)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const access = await requireWorkspaceFeatureAccess(context, workspaceId)
    const workspace = await workspaceRecord(context.admin, workspaceId)

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const { data: dashboards, error: dashboardError } = await context.admin
        .from('prospect_dashboards')
        .select(DASHBOARD_FIELDS)
        .eq('workspace_id', workspaceId)
        .neq('lifecycle_status', 'archived')
        .order('created_at', { ascending: false })
        .limit(500)
      if (dashboardError) throw new HttpError(500, 'PROSPECT_LIST_FAILED', 'Prospect dashboards could not be loaded')
      const rows = (dashboards || []) as unknown as ProspectDashboardRow[]
      const ids = rows.map((dashboard) => dashboard.id)
      const shortlistResult = ids.length > 0
        ? await context.admin
          .from('prospect_dashboard_podcasts')
          .select('prospect_dashboard_id,podcast_id,visibility,relevance_reason,ai_fit_reasons,is_featured')
          .in('prospect_dashboard_id', ids)
          .limit(10_000)
        : { data: [], error: null }
      if (shortlistResult.error) throw new HttpError(500, 'PROSPECT_LIST_FAILED', 'Prospect readiness could not be loaded')
      const shortlistByDashboard = new Map<string, ShortlistRow[]>()
      for (const row of (shortlistResult.data || []) as unknown as ShortlistRow[]) {
        const bucket = shortlistByDashboard.get(row.prospect_dashboard_id) || []
        bucket.push(row)
        shortlistByDashboard.set(row.prospect_dashboard_id, bucket)
      }
      // Which client this prospect became, if any. The link is stored on the
      // client, so without reading it back a prospect page cannot say whether
      // it converted — the operator has to remember, or check every client.
      const slugs = rows.map((dashboard) => dashboard.slug).filter(Boolean)
      const linkedClientsResult = slugs.length > 0
        ? await context.admin
          .from('clients')
          .select('id,name,status,prospect_dashboard_slug')
          .eq('workspace_id', workspaceId)
          .in('prospect_dashboard_slug', slugs)
          .limit(1_000)
        : { data: [], error: null }
      const clientBySlug = new Map<string, { id: string; name: string; status: string }>()
      for (const row of ((linkedClientsResult.error ? [] : linkedClientsResult.data ?? []) as Array<Record<string, unknown>>)) {
        if (typeof row.prospect_dashboard_slug !== 'string') continue
        clientBySlug.set(row.prospect_dashboard_slug, {
          id: String(row.id),
          name: String(row.name ?? ''),
          status: String(row.status ?? ''),
        })
      }
      return jsonResponse(req, METHODS, 200, {
        workspace,
        viewer_role: access.role,
        can_manage: MANAGER_ROLES.has(access.role),
        dashboards: rows.map((dashboard) => ({
          ...dashboard,
          readiness: readinessForRows(dashboard, shortlistByDashboard.get(dashboard.id) || []),
          linked_client: clientBySlug.get(dashboard.slug) ?? null,
        })),
      })
    }

    if (action === 'create') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'profile'])
      requireManager(access)
      const profile = profilePayload(body.profile)
      const { data, error } = await context.admin
        .from('prospect_dashboards')
        .insert({
          ...profile,
          slug: null,
          workspace_id: workspaceId,
          created_by: context.user.id,
          lifecycle_status: 'draft',
          is_active: true,
          content_ready: false,
          show_pricing_section: false,
          view_count: 0,
        })
        .select(DASHBOARD_FIELDS)
        .single()
      if (error || !data) throw new HttpError(500, 'PROSPECT_CREATE_FAILED', 'The prospect dashboard could not be created')
      const created = data as unknown as ProspectDashboardRow
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.created',
        entityType: 'prospect_dashboard',
        entityId: created.id,
        metadata: { has_email: Boolean(profile.prospect_email), has_bio: Boolean(profile.prospect_bio) },
      })
      return jsonResponse(req, METHODS, 201, {
        dashboard: {
          ...created,
          readiness: readinessForRows(created, []),
        },
      })
    }

    const dashboardId = requireUuid(body.dashboard_id, 'dashboard_id')

    if (action === 'detail-get') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      return jsonResponse(req, METHODS, 200, {
        workspace,
        viewer_role: access.role,
        can_manage: MANAGER_ROLES.has(access.role),
        ...await detailPayload(context.admin, workspaceId, dashboardId),
      })
    }

    requireManager(access)

    const existing = await requireWorkspaceProspect(context.admin, workspaceId, dashboardId)

    if (action === 'photo-upload') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      if (!photoFile || photoFile.size < 1) {
        throw new HttpError(400, 'PHOTO_REQUIRED', 'Choose a prospect photo to upload')
      }
      const extension = PROSPECT_IMAGE_TYPES.get(photoFile.type.toLowerCase())
      if (!extension) {
        throw new HttpError(400, 'INVALID_PHOTO_TYPE', 'Use a JPEG, PNG, or WebP image')
      }
      if (photoFile.size > MAX_PROSPECT_IMAGE_BYTES) {
        throw new HttpError(400, 'PHOTO_TOO_LARGE', 'Prospect photos must be 5 MB or smaller')
      }

      const photoBytes = new Uint8Array(await photoFile.arrayBuffer())
      if (!matchesProspectImageSignature(photoBytes, photoFile.type.toLowerCase())) {
        throw new HttpError(400, 'INVALID_PHOTO_CONTENT', 'The uploaded file does not match its image type')
      }

      const path = `${workspaceId}/${dashboardId}/${crypto.randomUUID()}.${extension}`
      const uploaded = await context.admin.storage
        .from(PROSPECT_IMAGE_BUCKET)
        .upload(path, photoBytes, {
          cacheControl: '3600',
          contentType: photoFile.type.toLowerCase(),
          upsert: false,
        })
      if (uploaded.error) {
        throw new HttpError(500, 'PHOTO_UPLOAD_FAILED', 'The prospect photo could not be uploaded')
      }
      const imageUrl = context.admin.storage.from(PROSPECT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
      const now = new Date().toISOString()
      const update: Record<string, unknown> = {
        prospect_image_url: imageUrl,
        build_error: null,
        updated_at: now,
      }
      // A headshot is the operator's own asset, like the profile text around it.
      // Swapping it marks a review; it does not close the page.
      if (existing.published_at) {
        update.pending_review_at = now
      }
      const { data: updated, error: updateError } = await context.admin
        .from('prospect_dashboards')
        .update(update)
        .eq('id', dashboardId)
        .eq('workspace_id', workspaceId)
        .eq('updated_at', existing.updated_at)
        .select('id')
        .maybeSingle()
      if (updateError || !updated) {
        await context.admin.storage.from(PROSPECT_IMAGE_BUCKET).remove([path])
        if (!updateError) throw new HttpError(409, 'PROSPECT_CHANGED', 'This prospect changed. Refresh and try again')
        throw new HttpError(500, 'PHOTO_UPLOAD_FAILED', 'The prospect photo could not be saved')
      }

      const oldPath = managedProspectImagePath(existing.prospect_image_url, workspaceId, dashboardId)
      if (oldPath && oldPath !== path) {
        const removed = await context.admin.storage.from(PROSPECT_IMAGE_BUCKET).remove([oldPath])
        if (removed.error) console.error('Previous prospect photo cleanup failed')
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.photo_uploaded',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: { changes_pending_review: Boolean(existing.published_at) },
      })
      return jsonResponse(req, METHODS, 200, await detailPayload(context.admin, workspaceId, dashboardId))
    }

    if (action === 'photo-remove') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      const now = new Date().toISOString()
      const update: Record<string, unknown> = {
        prospect_image_url: null,
        build_error: null,
        updated_at: now,
      }
      // A headshot is the operator's own asset, like the profile text around it.
      // Swapping it marks a review; it does not close the page.
      if (existing.published_at) {
        update.pending_review_at = now
      }
      const { data: updated, error: updateError } = await context.admin
        .from('prospect_dashboards')
        .update(update)
        .eq('id', dashboardId)
        .eq('workspace_id', workspaceId)
        .eq('updated_at', existing.updated_at)
        .select('id')
        .maybeSingle()
      if (updateError) throw new HttpError(500, 'PHOTO_REMOVE_FAILED', 'The prospect photo could not be removed')
      if (!updated) throw new HttpError(409, 'PROSPECT_CHANGED', 'This prospect changed. Refresh and try again')

      const oldPath = managedProspectImagePath(existing.prospect_image_url, workspaceId, dashboardId)
      if (oldPath) {
        const removed = await context.admin.storage.from(PROSPECT_IMAGE_BUCKET).remove([oldPath])
        if (removed.error) console.error('Prospect photo cleanup failed')
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.photo_removed',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: { changes_pending_review: Boolean(existing.published_at) },
      })
      return jsonResponse(req, METHODS, 200, await detailPayload(context.admin, workspaceId, dashboardId))
    }

    if (action === 'update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id', 'profile', 'expected_updated_at'])
      const expectedUpdatedAt = requireString(body.expected_updated_at, 'expected_updated_at', { max: 80 })
      if (Number.isNaN(Date.parse(expectedUpdatedAt))) {
        throw new HttpError(400, 'INVALID_FIELD', 'expected_updated_at must be a timestamp')
      }
      const profile = profilePayload(body.profile)
      const update: Record<string, unknown> = { ...profile, build_error: null }
      /*
       * A live dashboard stays live through a profile edit. This is the
       * operator's own writing about their own prospect — there is no generated
       * content here for anyone to have got wrong, and taking the page down
       * while somebody is reading it is worse than showing them the newer
       * sentence. It is still marked for review; that no longer means offline.
       */
      if (existing.published_at) {
        update.pending_review_at = new Date().toISOString()
      }
      const { data, error } = await context.admin
        .from('prospect_dashboards')
        .update(update)
        .eq('id', dashboardId)
        .eq('workspace_id', workspaceId)
        .eq('updated_at', expectedUpdatedAt)
        .select(DASHBOARD_FIELDS)
        .maybeSingle()
      if (error) throw new HttpError(500, 'PROSPECT_UPDATE_FAILED', 'The prospect profile could not be updated')
      if (!data) throw new HttpError(409, 'PROSPECT_CHANGED', 'This prospect changed. Refresh and try again')
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.profile_updated',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: { changes_pending_review: Boolean(existing.published_at) },
      })
      return jsonResponse(req, METHODS, 200, await detailPayload(context.admin, workspaceId, dashboardId))
    }

    if (action === 'build') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      return jsonResponse(req, METHODS, 200, await buildProspect(context, workspaceId, dashboardId))
    }

    if (action === 'publish' || action === 'unpublish') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      const { data, error } = await context.admin.rpc('set_workspace_prospect_publication_v1', {
        p_workspace_id: workspaceId,
        p_dashboard_id: dashboardId,
        p_publish: action === 'publish',
        p_actor_user_id: context.user.id,
        p_token_issued_at: context.tokenIssuedAt,
      })
      if (error) publicationError(error)
      return jsonResponse(req, METHODS, 200, {
        publication: data,
        ...await detailPayload(context.admin, workspaceId, dashboardId),
      })
    }

    if (action === 'podcast-add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id', 'podcasts'])
      const podcasts = prospectShortlistPodcasts(body.podcasts)
      const podcastIds = podcasts.map((podcast) => podcast.podcast_id)
      const { data: existingPodcasts, error: existingPodcastsError } = await context.admin
        .from('prospect_dashboard_podcasts')
        .select('podcast_id')
        .eq('prospect_dashboard_id', dashboardId)
        .in('podcast_id', podcastIds)
      if (existingPodcastsError) {
        throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The prospect shortlist could not be checked')
      }
      const existingIds = new Set((existingPodcasts || []).map((podcast) => String(podcast.podcast_id)))
      const newPodcasts = podcasts.filter((podcast) => !existingIds.has(podcast.podcast_id))
      let addedPodcastIds: string[] = []

      if (newPodcasts.length > 0) {
        const now = new Date().toISOString()
        const isLive = Boolean(existing.published_at)
        /*
         * Additions to a live dashboard arrive hidden rather than closing the
         * page. The property worth keeping is that an unreviewed Finder
         * addition is never visible to the prospect; unpublishing achieved that
         * by making nothing visible at all, including the shortlist somebody
         * was already reading. Writing the rows archived achieves it without
         * the collateral: the live page is unchanged until an operator shows
         * them, and a failure part-way through leaves rows nobody can see.
         */
        const markPendingReview = async () => {
          const { error: dashboardUpdateError } = await context.admin
            .from('prospect_dashboards')
            .update({
              build_error: null,
              pending_review_at: now,
              updated_at: now,
            })
            .eq('id', dashboardId)
            .eq('workspace_id', workspaceId)
          if (dashboardUpdateError) {
            throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The prospect review state could not be updated')
          }
        }

        // Mark the review before writing, for the same reason the old code
        // unpublished first: a failure between the two must not leave additions
        // that nobody has been told to look at.
        if (isLive) await markPendingReview()

        const catalogMerge = await context.admin.rpc('merge_global_podcast_catalog_batch_v1', {
          p_workspace_id: workspaceId,
          p_actor_user_id: context.user.id,
          p_source: 'workspace_prospect',
          p_client_id: null,
          p_prospect_dashboard_id: dashboardId,
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
          })),
        })
        if (catalogMerge.error) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'Podcast details could not be merged into the shared catalog')
        }

        const { data: lastPosition, error: positionError } = await context.admin
          .from('prospect_dashboard_podcasts')
          .select('display_order')
          .eq('prospect_dashboard_id', dashboardId)
          .order('display_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (positionError) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The prospect shortlist could not be positioned')
        }
        const startingOrder = lastPosition ? Number(lastPosition.display_order) + 1 : 0
        const { data: addedPodcasts, error: addError } = await context.admin
          .from('prospect_dashboard_podcasts')
          .upsert(newPodcasts.map((podcast, index) => ({
            prospect_dashboard_id: dashboardId,
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
            // Hidden on a live dashboard until an operator reviews them; visible
            // immediately on one nobody can read yet.
            visibility: isLive ? 'archived' : 'visible',
            archived_at: isLive ? now : null,
            display_order: startingOrder + index,
            is_featured: false,
            featured_order: null,
            relevance_score: podcast.relevance_score,
            relevance_reason: podcast.relevance_reason,
            match_source: 'manual',
            archived_by: null,
            updated_at: now,
          })), { onConflict: 'prospect_dashboard_id,podcast_id', ignoreDuplicates: true })
          .select('podcast_id')
        if (addError) {
          throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'Podcasts could not be added to the prospect shortlist')
        }
        addedPodcastIds = (addedPodcasts || []).map((podcast) => String(podcast.podcast_id))

        // A dashboard nobody can read yet keeps the old behaviour: additions are
        // visible straight away and the lifecycle says it wants a look.
        if (addedPodcastIds.length > 0 && !isLive) {
          const { error: reviewError } = await context.admin
            .from('prospect_dashboards')
            .update({ lifecycle_status: 'review', build_error: null, updated_at: now })
            .eq('id', dashboardId)
            .eq('workspace_id', workspaceId)
          if (reviewError) {
            throw new HttpError(500, 'SHORTLIST_ADD_FAILED', 'The prospect review state could not be updated')
          }
        }
      }

      const changesPendingReview = Boolean(existing.published_at && addedPodcastIds.length > 0)
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.shortlist.added',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: {
          podcast_ids: addedPodcastIds,
          changes_pending_review: changesPendingReview,
        },
      })
      return jsonResponse(req, METHODS, 200, {
        added: addedPodcastIds.length,
        skipped: podcasts.length - addedPodcastIds.length,
        podcast_ids: addedPodcastIds,
        // Kept in the shape because callers read it, and now always false: a
        // live dashboard is no longer taken down to accept an addition.
        unpublished_for_review: false,
        changes_pending_review: changesPendingReview,
        hidden_pending_review: changesPendingReview,
      })
    }

    if (action === 'podcast-update') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id', 'podcast_id', 'changes'])
      const podcastId = requireString(body.podcast_id, 'podcast_id', { max: 300 })
      if (!body.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) {
        throw new HttpError(400, 'INVALID_FIELD', 'changes must be an object')
      }
      const changes = body.changes as Record<string, unknown>
      requireOnlyKeys(changes, ['visibility', 'is_featured', 'operator_notes'])
      if (Object.keys(changes).length === 0) throw new HttpError(400, 'INVALID_FIELD', 'changes cannot be empty')
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (Object.hasOwn(changes, 'visibility')) {
        const visibility = requireString(changes.visibility, 'visibility', { max: 20 })
        if (!['visible', 'archived'].includes(visibility)) throw new HttpError(400, 'INVALID_FIELD', 'visibility is invalid')
        update.visibility = visibility
        update.archived_at = visibility === 'archived' ? new Date().toISOString() : null
        update.archived_by = visibility === 'archived' ? context.user.id : null
        if (visibility === 'archived') {
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
        if (typeof changes.is_featured !== 'boolean') throw new HttpError(400, 'INVALID_FIELD', 'is_featured must be a boolean')
        update.is_featured = changes.is_featured
        if (changes.is_featured) {
          const { count, error: countError } = await context.admin
            .from('prospect_dashboard_podcasts')
            .select('id', { count: 'exact', head: true })
            .eq('prospect_dashboard_id', dashboardId)
            .eq('visibility', 'visible')
            .eq('is_featured', true)
          if (countError) throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'Featured podcasts could not be checked')
          if ((count || 0) >= 6) throw new HttpError(409, 'FEATURED_LIMIT_REACHED', 'You can feature up to six podcasts')
          update.visibility = 'visible'
          update.featured_order = count || 0
        } else {
          update.featured_order = null
        }
      }
      const { data, error } = await context.admin
        .from('prospect_dashboard_podcasts')
        .update(update)
        .eq('prospect_dashboard_id', dashboardId)
        .eq('podcast_id', podcastId)
        .select(SHORTLIST_FIELDS)
        .maybeSingle()
      if (error) throw new HttpError(500, 'SHORTLIST_UPDATE_FAILED', 'The prospect shortlist could not be updated')
      if (!data) throw new HttpError(404, 'PODCAST_NOT_FOUND', 'Podcast is not on this prospect shortlist')
      const detail = await detailPayload(context.admin, workspaceId, dashboardId)
      if (existing.published_at && !detail.dashboard.readiness.publishable) {
        const { error: unpublishError } = await context.admin.rpc('set_workspace_prospect_publication_v1', {
          p_workspace_id: workspaceId,
          p_dashboard_id: dashboardId,
          p_publish: false,
          p_actor_user_id: context.user.id,
          p_token_issued_at: context.tokenIssuedAt,
        })
        if (unpublishError) publicationError(unpublishError)
      }
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.shortlist_updated',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: { podcast_id: podcastId, fields: Object.keys(changes) },
      })
      return jsonResponse(req, METHODS, 200, await detailPayload(context.admin, workspaceId, dashboardId))
    }

    if (action === 'reorder-featured') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id', 'podcast_ids'])
      if (!Array.isArray(body.podcast_ids) || body.podcast_ids.length > 6) {
        throw new HttpError(400, 'INVALID_FIELD', 'podcast_ids must contain at most six items')
      }
      const podcastIds = body.podcast_ids.map((value, index) => {
        return requireString(value, `podcast_ids[${index}]`, { max: 300 })
      })
      if (new Set(podcastIds).size !== podcastIds.length) throw new HttpError(400, 'INVALID_FIELD', 'podcast_ids contains duplicates')
      const { error } = await context.admin.rpc('reorder_prospect_shortlist_featured_v1', {
        p_dashboard_id: dashboardId,
        p_podcast_ids: podcastIds,
      })
      if (error) throw new HttpError(400, 'INVALID_FEATURED_LIST', 'The featured prospect shortlist is invalid')
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.featured_reordered',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: { podcast_ids: podcastIds },
      })
      return jsonResponse(req, METHODS, 200, await detailPayload(context.admin, workspaceId, dashboardId))
    }

    if (action === 'archive') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'dashboard_id'])
      const { error } = await context.admin
        .from('prospect_dashboards')
        .update({
          lifecycle_status: 'archived',
          is_active: false,
          content_ready: false,
          published_at: null,
        })
        .eq('id', dashboardId)
        .eq('workspace_id', workspaceId)
      if (error) throw new HttpError(500, 'PROSPECT_ARCHIVE_FAILED', 'The prospect dashboard could not be archived')
      await writeAudit(context.admin, {
        workspaceId,
        actorUserId: context.user.id,
        action: 'workspace.prospect.archived',
        entityType: 'prospect_dashboard',
        entityId: dashboardId,
        metadata: {},
      })
      return jsonResponse(req, METHODS, 200, { archived: true, dashboard_id: dashboardId })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown workspace prospect action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
