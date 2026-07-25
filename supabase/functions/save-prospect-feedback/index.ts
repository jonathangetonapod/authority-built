import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  errorResponse,
  parseJsonObject,
  requireOnlyKeys,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
  'Vary': 'Origin',
}

function normalizeDashboardSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 180 ? slug : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only POST is allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await parseJsonObject(req, 8_192)
    requireOnlyKeys(body, ['dashboard_slug', 'podcast_id', 'status', 'notes'])
    const { dashboard_slug, podcast_id, status, notes } = body
    const dashboardSlug = normalizeDashboardSlug(dashboard_slug)

    if (!dashboardSlug || typeof podcast_id !== 'string' || !podcast_id.trim() || podcast_id.length > 300) {
      return new Response(
        JSON.stringify({ success: false, error: 'A valid dashboard link and podcast_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate status value
    if (status !== undefined && status !== null && status !== 'approved' && status !== 'rejected') {
      return new Response(
        JSON.stringify({ success: false, error: "status must be 'approved', 'rejected', or null" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 5000)) {
      return new Response(
        JSON.stringify({ success: false, error: 'notes must be a string of at most 5000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Save Prospect Feedback] Podcast feedback request, status: ${status}`)

    // Resolve the dashboard from the public link; never trust a caller-provided
    // dashboard UUID when writing with the service role.
    const { data: dashboard, error: dashboardError } = await supabase
      .from('prospect_dashboards')
      .select('id,is_active,lifecycle_status,first_engaged_at')
      .eq('slug', dashboardSlug)
      .eq('is_active', true)
      .eq('content_ready', true)
      .not('published_at', 'is', null)
      .maybeSingle()

    if (dashboardError) {
      console.error('[Save Prospect Feedback] Dashboard lookup failed')
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to verify the prospect dashboard' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!dashboard) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prospect dashboard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedPodcastId = podcast_id.trim()
    const { data: podcast, error: podcastError } = await supabase
      .from('prospect_dashboard_podcasts')
      .select('podcast_id,podcast_name')
      .eq('prospect_dashboard_id', dashboard.id)
      .eq('podcast_id', normalizedPodcastId)
      .eq('visibility', 'visible')
      .maybeSingle()

    if (podcastError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to verify the podcast' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!podcast) {
      return new Response(
        JSON.stringify({ success: false, error: 'Podcast is not available on this dashboard' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert feedback (unique on prospect_dashboard_id + podcast_id)
    const feedbackData: Record<string, unknown> = {
      prospect_dashboard_id: dashboard.id,
      podcast_id: normalizedPodcastId,
      podcast_name: podcast.podcast_name,
      status: status ?? null,
    }

    if (notes !== undefined) {
      feedbackData.notes = notes
    }

    const { data: feedback, error: upsertError } = await supabase
      .from('prospect_podcast_feedback')
      .upsert(feedbackData, {
        onConflict: 'prospect_dashboard_id,podcast_id',
      })
      .select('id, status, notes, created_at, updated_at')
      .single()

    if (upsertError) {
      console.error('[Save Prospect Feedback] Upsert error:', upsertError)
      throw upsertError
    }

    const { error: engagementError } = await supabase
      .from('prospect_dashboards')
      .update({
        first_engaged_at: dashboard.first_engaged_at || new Date().toISOString(),
        lifecycle_status: dashboard.lifecycle_status === 'converted' ? 'converted' : 'engaged',
      })
      .eq('id', dashboard.id)
      .eq('is_active', true)
      .eq('content_ready', true)
      .not('published_at', 'is', null)

    if (engagementError) {
      console.error('[Save Prospect Feedback] Dashboard engagement update failed')
      throw engagementError
    }

    console.log(`[Save Prospect Feedback] Saved feedback: ${feedback.id} (status: ${feedback.status})`)

    return new Response(
      JSON.stringify({
        success: true,
        feedback: {
          id: feedback.id,
          status: feedback.status,
          notes: feedback.notes,
          created_at: feedback.created_at,
          updated_at: feedback.updated_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
