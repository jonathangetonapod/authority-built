import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'

const METHODS = ['POST'] as const
const API_BASE = 'https://podscan.fm/api/v1'
const SEARCH_KEYS = new Set([
  'query',
  'category_ids',
  'per_page',
  'order_by',
  'order_dir',
  'search_fields',
  'language',
  'region',
  'min_audience_size',
  'max_audience_size',
  'min_episode_count',
  'max_episode_count',
  'min_last_episode_posted_at',
  'max_last_episode_posted_at',
  'has_guests',
  'has_sponsors',
  'page',
])

function requiredSecret(): string {
  const value = (Deno.env.get('PODSCAN_API_KEY') || Deno.env.get('PODSCAN_TOKEN'))?.trim()
  if (!value) throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Podscan is not configured')
  return value
}

function podcastId(value: unknown): string {
  const id = requireString(value, 'podcast_id', { max: 200 })
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_id is invalid')
  }
  return id
}

function enumValue(value: unknown, field: string, values: readonly string[]): string {
  const result = requireString(value, field, { max: 80 })
  if (!values.includes(result)) throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  return result
}

function searchParams(value: unknown): URLSearchParams {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', 'options must be an object')
  }
  const options = value as Record<string, unknown>
  if (Object.keys(options).some((key) => !SEARCH_KEYS.has(key))) {
    throw new HttpError(400, 'UNKNOWN_FIELD', 'options contains an unknown field')
  }

  const params = new URLSearchParams()
  for (const [key, rawValue] of Object.entries(options)) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw new HttpError(400, 'INVALID_FIELD', `${key} has an invalid value`)
    }
    const serialized = String(rawValue)
    if (serialized.length > 500) {
      throw new HttpError(400, 'INVALID_FIELD', `${key} is too long`)
    }
    params.set(key, serialized)
  }
  return params
}

interface PodscanFetchResult {
  data: unknown
  rateLimit: {
    limit?: number
    remaining?: number
    retryAfterSeconds?: number
    concurrencyLimit?: number
  }
}

class PodscanRateLimitError extends HttpError {
  readonly retryAfter: string | null
  readonly concurrencyLimit: string | null

  constructor(code: string, message: string, headers: Headers) {
    super(429, code, message)
    this.retryAfter = headers.get('Retry-After')
    this.concurrencyLimit = headers.get('X-Concurrency-Limit')
  }
}

function positiveHeaderNumber(headers: Headers, name: string): number | undefined {
  const rawValue = headers.get(name)
  if (rawValue === null || rawValue.trim() === '') return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

async function fetchPodscan(path: string, params?: URLSearchParams): Promise<PodscanFetchResult> {
  const url = new URL(`${API_BASE}${path}`)
  if (params) url.search = params.toString()

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${requiredSecret()}`,
      Accept: 'application/json',
    },
  })

  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > 5_000_000) {
    throw new HttpError(502, 'PODSCAN_RESPONSE_TOO_LARGE', 'Podscan returned an oversized response')
  }

  const raw = await response.text()
  if (new TextEncoder().encode(raw).byteLength > 5_000_000) {
    throw new HttpError(502, 'PODSCAN_RESPONSE_TOO_LARGE', 'Podscan returned an oversized response')
  }
  if (!response.ok) {
    if (response.status === 429) {
      let upstreamCode = ''
      try {
        const payload = JSON.parse(raw) as { error?: unknown; code?: unknown }
        upstreamCode = typeof payload.code === 'string'
          ? payload.code
          : typeof payload.error === 'string' ? payload.error : ''
      } catch {
        // The status and headers still provide a safe retry path.
      }
      const concurrencyExceeded = upstreamCode.includes('concurrency_limit_exceeded')
      throw new PodscanRateLimitError(
        concurrencyExceeded ? 'PODSCAN_CONCURRENCY_LIMIT' : 'PODSCAN_RATE_LIMIT',
        concurrencyExceeded ? 'Podscan concurrency limit reached' : 'Podscan rate limit reached',
        response.headers,
      )
    }
    throw new HttpError(
      502,
      `PODSCAN_UPSTREAM_${response.status}`,
      `Podscan API error: ${response.status}`,
    )
  }

  try {
    return {
      data: JSON.parse(raw),
      rateLimit: {
        limit: positiveHeaderNumber(response.headers, 'X-RateLimit-Limit'),
        remaining: positiveHeaderNumber(response.headers, 'X-RateLimit-Remaining'),
        retryAfterSeconds: positiveHeaderNumber(response.headers, 'Retry-After'),
        concurrencyLimit: positiveHeaderNumber(response.headers, 'X-Concurrency-Limit'),
      },
    }
  } catch {
    throw new HttpError(502, 'PODSCAN_INVALID_RESPONSE', 'Podscan returned an invalid response')
  }
}

serve(async (req) => {
  // A lookup that failed after the charge — the index refusing, a timeout —
  // delivered nothing to pay for, so the outer catch gives the debit back.
  let chargedForRefund: { workspaceId: string; entryId: string } | null = null
  let refundAdmin: Parameters<typeof refundCredits>[0] | null = null
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = body.workspace_id === undefined
      ? null
      : requireUuid(body.workspace_id, 'workspace_id')
    let metering: { admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']; workspaceId: string } | null = null
    if (workspaceId) {
      const context = await requireAuthenticatedUser(req)
      await requireWorkspaceFeatureAccess(context, workspaceId)
      metering = { admin: context.admin, workspaceId }
      const lookupCharge = await chargeCredits(context.admin, {
        workspaceId,
        operationType: 'podscan_lookup',
        referenceKind: 'podscan_action',
        referenceId: action,
        actorUserId: context.user.id,
      })
      if (lookupCharge.entryId) {
        chargedForRefund = { workspaceId, entryId: lookupCharge.entryId }
        refundAdmin = context.admin
      }
    } else {
      await requirePlatformAdmin(req)
    }
    let result: PodscanFetchResult

    if (action === 'search') {
      requireOnlyKeys(body, ['action', 'options', 'workspace_id'])
      result = await fetchPodscan('/podcasts/search', searchParams(body.options))
    } else if (action === 'podcast') {
      requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
      result = await fetchPodscan(`/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}`)
    } else if (action === 'related') {
      requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
      result = await fetchPodscan(`/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}/related_podcasts`)
    } else if (action === 'demographics') {
      requireOnlyKeys(body, ['action', 'podcast_id', 'workspace_id'])
      result = await fetchPodscan(`/podcasts/${encodeURIComponent(podcastId(body.podcast_id))}/demographics`)
    } else if (action === 'chart_countries') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      result = await fetchPodscan('/charts/countries/available')
    } else if (action === 'chart_categories') {
      requireOnlyKeys(body, ['action', 'platform', 'country', 'workspace_id'])
      const platform = enumValue(body.platform, 'platform', ['apple', 'spotify'])
      const country = requireString(body.country, 'country', { max: 8 }).toLowerCase()
      if (!/^[a-z]{2,8}$/.test(country)) throw new HttpError(400, 'INVALID_FIELD', 'country is invalid')
      result = await fetchPodscan(`/charts/${platform}/${country}/categories`)
    } else if (action === 'chart_top') {
      requireOnlyKeys(body, ['action', 'platform', 'country', 'category', 'limit', 'workspace_id'])
      const platform = enumValue(body.platform, 'platform', ['apple', 'spotify'])
      const country = requireString(body.country, 'country', { max: 8 }).toLowerCase()
      const category = requireString(body.category, 'category', { max: 100 })
      if (!/^[a-z]{2,8}$/.test(country) || !/^[a-zA-Z0-9_-]+$/.test(category)) {
        throw new HttpError(400, 'INVALID_FIELD', 'chart parameters are invalid')
      }
      const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.max(1, Math.min(body.limit, platform === 'apple' ? 200 : 50))
        : 10
      result = await fetchPodscan(
        `/charts/${platform}/${country}/${encodeURIComponent(category)}/top`,
        new URLSearchParams({ limit: String(limit) }),
      )
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown Podscan action')
    }

    if (metering) {
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'podscan_lookup',
        usage: { podscanCalls: 1 },
        referenceKind: 'podscan_action',
        referenceId: action,
      })
    }

    return jsonResponse(req, METHODS, 200, {
      data: result.data,
      meta: { rate_limit: result.rateLimit },
    })
  } catch (error) {
    if (chargedForRefund && refundAdmin) {
      await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'the podcast index lookup failed after the charge',
      })
    }
    if (error instanceof PodscanRateLimitError) {
      const response = errorResponse(req, METHODS, error)
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Expose-Headers', 'Retry-After, X-Concurrency-Limit')
      if (error.retryAfter) headers.set('Retry-After', error.retryAfter)
      if (error.concurrencyLimit) headers.set('X-Concurrency-Limit', error.concurrencyLimit)
      return new Response(response.body, { status: response.status, headers })
    }
    return errorResponse(req, METHODS, error)
  }
})
