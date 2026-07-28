import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requireString,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'
import { requestHostname, requireServedByHost, resolveHostWorkspaceId } from '../_shared/workspaceDomain.ts'

const METHODS = ['POST'] as const
const DASHBOARD_FIELDS = [
  'id',
  'prospect_name',
  'prospect_bio',
  'prospect_image_url',
  'prospect_linkedin_url',
  'prospect_website',
  'workspace_id',
  'lifecycle_status',
  'published_at',
  'cta_type',
  'cta_label',
  'cta_url',
  'is_active',
  'show_pricing_section',
  'personalized_tagline',
  'media_kit_url',
  'loom_video_url',
  'loom_thumbnail_url',
  'loom_video_title',
  'show_loom_video',
  'testimonial_ids',
  'show_testimonials',
  'view_count',
].join(',')
const FEEDBACK_FIELDS = [
  'id',
  'podcast_id',
  'podcast_name',
  'status',
  'notes',
  'created_at',
  'updated_at',
].join(',')

type ProspectDashboardRow = Record<string, unknown> & {
  id: string
  workspace_id: string
  view_count: number | null
}

function publicLogoUrl(supabaseUrl: string, path: unknown): string | null {
  if (typeof path !== 'string' || !path.trim()) return null
  const encodedPath = path.trim().split('/').map(encodeURIComponent).join('/')
  return `${supabaseUrl}/storage/v1/object/public/workspace-logos/${encodedPath}`
}

function requireSlug(value: unknown): string {
  const slug = requireString(value, 'slug', { max: 180 }).toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new HttpError(400, 'INVALID_SLUG', 'slug is invalid')
  }
  return slug
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // The preflight has to answer with the tenant's own origin, and it is the
    // only request the browser sends before it will send anything else. Warming
    // after this point would deadlock: a cold isolate rejects the preflight,
    // the POST that would have warmed it is never sent, and the domain never
    // works. So the preflight warms the cache itself.
    await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    return optionsResponse(req, METHODS)
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    requireOnlyKeys(body, ['slug', 'hostname'])
    const slug = requireSlug(body.slug)
    const admin = createAdminClient()
    // Which workspace's domain this was asked for on. Null on the platform
    // origin, where every slug has always been valid.
    await ensureWorkspaceOriginAllowed(admin, req)
    const hostWorkspaceId = await resolveHostWorkspaceId(admin, requestHostname(req, body.hostname))

    const { data: dashboard, error: dashboardError } = await admin
      .from('prospect_dashboards')
      .select(DASHBOARD_FIELDS)
      .eq('slug', slug)
      .eq('is_active', true)
      .eq('content_ready', true)
      .not('published_at', 'is', null)
      .maybeSingle()

    if (dashboardError) {
      throw new HttpError(500, 'DASHBOARD_LOOKUP_FAILED', 'Dashboard could not be loaded')
    }
    if (!dashboard) {
      throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
    }
    const dashboardRow = dashboard as unknown as ProspectDashboardRow
    // On an agency's own hostname, another agency's dashboard does not exist.
    requireServedByHost(
      hostWorkspaceId,
      dashboardRow.workspace_id,
      'DASHBOARD_NOT_FOUND',
      'Dashboard not found',
    )

    const [
      { data: feedback, error: feedbackError },
      { data: workspace, error: workspaceError },
      { error: viewError },
    ] = await Promise.all([
      admin
        .from('prospect_podcast_feedback')
        .select(FEEDBACK_FIELDS)
        .eq('prospect_dashboard_id', dashboardRow.id),
      admin
        .from('workspaces')
        .select('name,logo_path,client_brand_name,client_brand_primary_color,client_brand_accent_color,booking_embed_url')
        .eq('id', dashboardRow.workspace_id)
        .eq('status', 'active')
        .maybeSingle(),
      admin.rpc('record_public_prospect_dashboard_view', {
        p_dashboard_id: dashboardRow.id,
      }),
    ])

    if (feedbackError) {
      throw new HttpError(500, 'FEEDBACK_LOOKUP_FAILED', 'Feedback could not be loaded')
    }
    if (workspaceError || !workspace) {
      throw new HttpError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard not found')
    }
    if (viewError) console.error('Public prospect dashboard view count failed')

    const publicDashboard: Record<string, unknown> = { ...dashboardRow }
    delete publicDashboard.id
    delete publicDashboard.workspace_id
    return jsonResponse(req, METHODS, 200, {
      success: true,
      dashboard: {
        ...publicDashboard,
        view_count: (dashboardRow.view_count ?? 0) + 1,
      },
      feedback: feedback ?? [],
      workspace: {
        name: workspace.name,
        brand_name: workspace.client_brand_name || workspace.name,
        logo_url: publicLogoUrl(Deno.env.get('SUPABASE_URL') || '', workspace.logo_path),
        primary_color: workspace.client_brand_primary_color,
        accent_color: workspace.client_brand_accent_color,
        // The workspace booking link, used when this dashboard has no
        // call-to-action of its own. https only at the column constraint, so
        // a link that cannot be framed never reaches the page.
        booking_url: typeof workspace.booking_embed_url === 'string'
          && workspace.booking_embed_url.startsWith('https://')
          ? workspace.booking_embed_url
          : null,
      },
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
