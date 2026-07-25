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
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { generatePodcastSearchEmbedding } from '../_shared/podcastSearch.ts'

const METHODS = ['POST'] as const
const CONTACT_FILTERS = new Set(['all', 'any', 'free', 'direct', 'none'])
const ACTIVITY_FILTERS = new Set(['active', 'last_30_days', 'last_90_days', 'last_180_days', 'last_year', 'all'])
const AUDIENCE_FILTERS = new Set(['all', 'under_10k', '10k_50k', '50k_250k', '250k_plus'])
const SORT_OPTIONS = new Set(['audience', 'name', 'recent', 'community'])

function optionalChoice(
  value: unknown,
  field: string,
  choices: Set<string>,
  fallback: string,
): string {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !choices.has(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return value
}

function optionalInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null) return fallback
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} is invalid`)
  }
  return Number(value)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')

    const body = await parseJsonObject(req, 4_096)
    requireOnlyKeys(body, [
      'action',
      'workspace_id',
      'search',
      'category',
      'contact',
      'activity',
      'audience',
      'sort',
      'page',
      'page_size',
    ])
    if (body.action !== 'list') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown podcast catalog action')
    }

    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    const search = optionalString(body.search, 'search', 120)
    const category = optionalString(body.category, 'category', 200)
    const contact = optionalChoice(body.contact, 'contact', CONTACT_FILTERS, 'all')
    const activity = optionalChoice(body.activity, 'activity', ACTIVITY_FILTERS, 'active')
    const audience = optionalChoice(body.audience, 'audience', AUDIENCE_FILTERS, 'all')
    const sort = optionalChoice(body.sort, 'sort', SORT_OPTIONS, 'audience')
    const page = optionalInteger(body.page, 'page', 1, 1, 10_000)
    const pageSize = optionalInteger(body.page_size, 'page_size', 24, 12, 48)

    const context = await requireAuthenticatedUser(req)
    const access = await requireWorkspaceFeatureAccess(context, workspaceId)
    const queryEmbedding = await generatePodcastSearchEmbedding(search)
    const { data, error } = await context.admin.rpc('workspace_podcast_catalog_page_v2', {
      p_search: search,
      p_category: category,
      p_contact: contact,
      p_activity: activity,
      p_audience: audience,
      p_query_embedding: queryEmbedding,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
    })
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpError(500, 'PODCAST_CATALOG_UNAVAILABLE', 'The shared podcast catalog could not be loaded')
    }

    return jsonResponse(req, METHODS, 200, {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
      },
      search_mode: search ? (queryEmbedding ? 'hybrid' : 'keyword') : 'browse',
      ...data as Record<string, unknown>,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
