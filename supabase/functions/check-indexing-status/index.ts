import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, postId } = await req.json()

    // Validation
    if (!url || !postId) {
      throw new Error('url and postId are required')
    }

    // Validate URL format
    if (!url.startsWith('https://getonapod.com/blog/')) {
      throw new Error('Invalid URL format. Must be https://getonapod.com/blog/*')
    }

    console.log('[Check Indexing] Request:', { url, postId })

    // Get OAuth credentials from environment
    const refreshToken = Deno.env.get('GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN')
    const clientId = Deno.env.get('GOOGLE_SEARCH_CONSOLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET')

    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error('OAuth credentials not configured. Check GOOGLE_SEARCH_CONSOLE_* secrets.')
    }

    // Exchange refresh token for access token
    console.log('[Check Indexing] Refreshing OAuth token...')

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('[Check Indexing] Token refresh failed:', tokenData)

      // Handle specific OAuth errors
      if (tokenData.error === 'invalid_grant') {
        throw new Error('OAuth refresh token invalid or revoked. Re-run authorization script.')
      }

      throw new Error(`OAuth token refresh failed: ${tokenData.error_description || tokenData.error}`)
    }

    const accessToken = tokenData.access_token
    console.log('[Check Indexing] ✓ Access token obtained')

    // Call Google Search Console URL Inspection API
    console.log('[Check Indexing] Calling URL Inspection API...')

    const inspectionResponse = await fetch(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inspectionUrl: url,
          siteUrl: 'sc-domain:getonapod.com', // Use domain property format
        }),
      }
    )

    const inspectionData = await inspectionResponse.json()

    // Handle API errors
    if (!inspectionResponse.ok) {
      console.error('[Check Indexing] API call failed:', inspectionData)

      // Handle specific error codes
      if (inspectionResponse.status === 403) {
        throw new Error('Permission denied. OAuth account lacks access to Search Console property.')
      } else if (inspectionResponse.status === 404) {
        // URL not found in Search Console - this is not necessarily an error
        console.log('[Check Indexing] URL not found in Search Console property')
      } else if (inspectionResponse.status === 429) {
        throw new Error('Daily quota exceeded (2,000 requests/day). Try again tomorrow.')
      } else {
        throw new Error(
          inspectionData.error?.message || 'Search Console API request failed'
        )
      }
    }

    console.log('[Check Indexing] ✓ API call successful')

    // Parse inspection results
    const inspectionResult = inspectionData.inspectionResult
    const indexStatusResult = inspectionResult?.indexStatusResult

    // Determine if page is indexed
    const verdict = indexStatusResult?.verdict
    const isIndexed = verdict === 'PASS'
    const coverageState = indexStatusResult?.coverageState || 'Unknown'
    const lastCrawlTime = indexStatusResult?.lastCrawlTime
    const indexingState = indexStatusResult?.indexingState
    const crawlDecision = indexStatusResult?.crawledAs
    const googleCanonical = indexStatusResult?.googleCanonical
    const richResultsItems = inspectionResult?.richResultsResult?.detectedItems || []

    // Check for canonical URL mismatch
    if (googleCanonical && googleCanonical !== url) {
      console.log(`[Check Indexing] ⚠️  Canonical mismatch: ${url} → ${googleCanonical}`)
    }

    console.log('[Check Indexing] Results:', {
      isIndexed,
      coverageState,
      verdict,
    })

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Log the check to database
    const { error: logError } = await supabase
      .from('blog_indexing_log')
      .insert({
        post_id: postId,
        url: url,
        service: 'google',
        action: 'check_status',
        status: inspectionResponse.ok ? 'success' : 'failed',
        response_data: inspectionData,
        error_message: inspectionResponse.ok
          ? null
          : (inspectionData.error?.message || 'Unknown error'),
      })

    if (logError) {
      console.error('[Check Indexing] Failed to log check:', logError)
    }

    // Update post's indexed_by_google_at timestamp if indexed
    if (isIndexed && inspectionResponse.ok) {
      console.log('[Check Indexing] Updating post as indexed...')

      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          indexed_by_google_at: lastCrawlTime || new Date().toISOString(),
          google_indexing_status: 'indexed',
        })
        .eq('id', postId)

      if (updateError) {
        console.error('[Check Indexing] Failed to update post:', updateError)
      } else {
        console.log('[Check Indexing] ✓ Post marked as indexed')
      }
    } else if (inspectionResponse.ok) {
      // Update status even if not indexed (to show it was checked)
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          google_indexing_status: coverageState,
        })
        .eq('id', postId)

      if (updateError) {
        console.error('[Check Indexing] Failed to update post status:', updateError)
      }
    }

    // Return response
    return new Response(
      JSON.stringify({
        success: inspectionResponse.ok || inspectionResponse.status === 404,
        message: isIndexed
          ? 'Post is indexed by Google'
          : inspectionResponse.status === 404
            ? 'Post not yet discovered by Google. Try submitting it first.'
            : `Post not indexed yet: ${coverageState}`,
        data: {
          isIndexed,
          coverageState,
          lastCrawlTime,
          indexingState,
          crawlDecision,
          verdict,
          canonicalUrl: googleCanonical,
          urlMismatch: googleCanonical !== url,
          richResultsItems,
        },
      }),
      {
        status: inspectionResponse.ok || inspectionResponse.status === 404 ? 200 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Check Indexing] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to check indexing status',
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
