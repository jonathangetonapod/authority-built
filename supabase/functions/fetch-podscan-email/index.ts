import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { requirePlatformAdmin } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NEGATIVE_CACHE_DAYS = 30

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function podscanPodcastPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const nested = record.podcast
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdmin(req)
    const { podcast_id } = await req.json()

    if (!podcast_id) {
      throw new Error('podcast_id is required')
    }

    console.log('[Fetch Podscan Email] Fetching email for podcast:', podcast_id)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // The canonical catalog is the primary free-email cache. The legacy table
    // remains during the transition and is reflected back into the catalog.
    const [catalogResult, legacyCacheResult] = await Promise.all([
      supabase
        .from('podcasts')
        .select('id,podscan_id,podcast_name,podscan_email,podscan_last_fetched_at')
        .eq('podscan_id', podcast_id)
        .maybeSingle(),
      supabase
        .from('podcast_emails')
        .select('email,fetched_at')
        .eq('podcast_id', podcast_id)
        .maybeSingle(),
    ])
    if (catalogResult.error) throw catalogResult.error
    if (legacyCacheResult.error) throw legacyCacheResult.error

    const canonicalEmail = optionalText(catalogResult.data?.podscan_email)
    if (canonicalEmail) {
      console.log('[Fetch Podscan Email] Free Podscan email found in global catalog')
      return new Response(
        JSON.stringify({
          success: true,
          email: canonicalEmail,
          podcast_id: podcast_id,
          cached: true,
          global: true,
          contact_type: 'podscan_free',
          fetched_at: catalogResult.data?.podscan_last_fetched_at,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    const legacyEmail = optionalText(legacyCacheResult.data?.email)
    if (legacyEmail && catalogResult.data?.id) {
      const { error: syncError } = await supabase
        .from('podcasts')
        .update({ podscan_email: legacyEmail.toLowerCase(), updated_at: new Date().toISOString() })
        .eq('id', catalogResult.data.id)
      if (syncError) throw syncError
      return new Response(
        JSON.stringify({
          success: true,
          email: legacyEmail,
          podcast_id,
          cached: true,
          global: true,
          contact_type: 'podscan_free',
          fetched_at: legacyCacheResult.data?.fetched_at,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const negativeFetchedAt = legacyCacheResult.data?.fetched_at
      ? new Date(legacyCacheResult.data.fetched_at)
      : null
    if (
      legacyCacheResult.data
      && !legacyEmail
      && negativeFetchedAt
      && !Number.isNaN(negativeFetchedAt.getTime())
      && Date.now() - negativeFetchedAt.getTime() < NEGATIVE_CACHE_DAYS * 24 * 60 * 60 * 1_000
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          email: null,
          podcast_id,
          cached: true,
          global: true,
          contact_type: 'podscan_free',
          fetched_at: legacyCacheResult.data.fetched_at,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Not in cache, fetch from Podscan API
    const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
    if (!podscanApiKey) {
      throw new Error('PODSCAN_API_KEY not configured')
    }

    // Call Podscan API
    const response = await fetch(`https://podscan.fm/api/v1/podcasts/${podcast_id}`, {
      headers: {
        'Authorization': `Bearer ${podscanApiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Fetch Podscan Email] API error:', errorText)
      throw new Error(`Podscan API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const podcast = podscanPodcastPayload(data)

    // Extract email from reach.email field
    const reach = podcast.reach && typeof podcast.reach === 'object' && !Array.isArray(podcast.reach)
      ? podcast.reach as Record<string, unknown>
      : {}
    const email = optionalText(reach.email)?.toLowerCase() || null

    console.log('[Fetch Podscan Email] Email fetched from API:', email ? 'Yes' : 'No')

    const now = new Date().toISOString()
    let canonicalPodcastId = catalogResult.data?.id || null
    if (canonicalPodcastId) {
      const { error: updateError } = await supabase
        .from('podcasts')
        .update({
          podscan_email: email,
          podscan_last_fetched_at: now,
          updated_at: now,
        })
        .eq('id', canonicalPodcastId)
      if (updateError) throw updateError
    } else {
      const podcastName = optionalText(podcast.podcast_name)
        || optionalText(podcast.name)
        || optionalText(podcast.title)
      if (!podcastName) throw new Error('Podscan returned a podcast without a name')
      const { data: insertedPodcast, error: insertPodcastError } = await supabase
        .from('podcasts')
        .upsert({
          podscan_id: podcast_id,
          podcast_name: podcastName,
          podcast_description: optionalText(podcast.podcast_description) || optionalText(podcast.description),
          podcast_image_url: optionalText(podcast.podcast_image_url) || optionalText(podcast.image_url),
          podcast_url: optionalText(podcast.podcast_url) || optionalText(podcast.url),
          publisher_name: optionalText(podcast.publisher_name) || optionalText(podcast.publisher),
          host_name: optionalText(podcast.host_name),
          podscan_email: email,
          rss_url: optionalText(podcast.rss_url),
          podscan_last_fetched_at: now,
          updated_at: now,
        }, { onConflict: 'podscan_id' })
        .select('id')
        .single()
      if (insertPodcastError || !insertedPodcast) throw insertPodcastError || new Error('Podcast could not be added to the global catalog')
      canonicalPodcastId = insertedPodcast.id
    }

    const { error: cacheError } = await supabase
      .from('podcast_emails')
      .upsert({
        podcast_id,
        email,
        source: 'podscan',
        fetched_at: now,
        updated_at: now,
      }, { onConflict: 'podcast_id' })
    if (cacheError) throw cacheError

    console.log('[Fetch Podscan Email] Free email saved to the global catalog')

    return new Response(
      JSON.stringify({
        success: true,
          email: email,
          podcast_id: podcast_id,
          cached: false,
          global: true,
          contact_type: 'podscan_free',
        }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Fetch Podscan Email] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
