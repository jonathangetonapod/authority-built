import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requirePlatformAdminOrService } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate a random slug for the prospect dashboard URL
 */
function generateSlug(): string {
  return `prospect-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
}

interface PodcastExportData {
  podcast_name: string
  publisher_name?: string | null
  podcast_description?: string | null
  audience_size?: number | null
  episode_count?: number | null
  itunes_rating?: number | null
  podcast_url?: string | null
  podcast_image_url?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  language?: string | null
  region?: string | null
  podcast_categories?: Array<{ category_id: string; category_name: string }> | null
  podscan_podcast_id?: string | null
  podcast_id?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

/**
 * Generate Google Access Token from Service Account with Domain-Wide Delegation
 */
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')

  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)
  const { client_email, private_key } = serviceAccount

  if (!client_email || !private_key) {
    throw new Error('Invalid service account credentials')
  }

  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const base64UrlEncode = (data: string) =>
    btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
  }))

  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  if (!userEmail) {
    throw new Error('GOOGLE_WORKSPACE_USER_EMAIL not configured')
  }

  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
    sub: userEmail,
  }))

  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = private_key
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signatureInput = `${jwtHeader}.${jwtPayload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signatureInput)
  )

  const signatureEncoded = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )

  const jwt = `${signatureInput}.${signatureEncoded}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`)
  }

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdminOrService(req)
    const { prospectName, prospectBio, prospectImageUrl, podcasts, existingProspectId } = await req.json() as {
      prospectName: string
      prospectBio?: string
      prospectImageUrl?: string
      podcasts: PodcastExportData[]
      existingProspectId?: string
    }

    // Type validation
    if (typeof prospectName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcasts)) {
      return new Response(
        JSON.stringify({ error: 'podcasts must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!prospectName) {
      return new Response(
        JSON.stringify({ error: 'Prospect name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcasts)) {
      return new Response(
        JSON.stringify({ error: 'podcasts must be an array (may be empty)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Prospect Sheet] Creating sheet for:', prospectName)
    console.log('[Prospect Sheet] Podcasts to export:', podcasts.length)

    // Get access token
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!
    const serviceAccount = JSON.parse(serviceAccountJson)
    const serviceAccountEmail = serviceAccount.client_email

    const accessToken = await getGoogleAccessToken()
    console.log('[Prospect Sheet] Access token obtained')

    // Get template spreadsheet ID
    const templateId = Deno.env.get('GOOGLE_SHEET_TEMPLATE_ID')
    if (!templateId) {
      throw new Error('GOOGLE_SHEET_TEMPLATE_ID not configured')
    }

    // Create sheet title from prospect name
    const timestamp = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    const sheetTitle = `Podcast Opportunities - ${prospectName} - ${timestamp}`
    console.log('[Prospect Sheet] Creating sheet:', sheetTitle)

    // Copy the template spreadsheet
    const copyResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${templateId}/copy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: sheetTitle,
      }),
    })

    if (!copyResponse.ok) {
      const errorText = await copyResponse.text()
      console.error('[Prospect Sheet] Failed to copy template:', errorText)
      throw new Error(`Google Drive API error: ${errorText}`)
    }

    const copiedFile = await copyResponse.json()
    const spreadsheetId = copiedFile.id
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

    console.log('[Prospect Sheet] Sheet created:', spreadsheetId)

    // Make the sheet publicly viewable by anyone with the link
    const publicPermissionResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'anyone',
          role: 'reader',  // Read-only for prospects
        }),
      }
    )

    if (!publicPermissionResponse.ok) {
      console.error('[Prospect Sheet] Failed to make public:', await publicPermissionResponse.text())
    } else {
      console.log('[Prospect Sheet] Made sheet publicly viewable')
    }

    // Share with service account for writing
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'user',
          role: 'writer',
          emailAddress: serviceAccountEmail,
        }),
      }
    )

    // Prepare rows to append - matching template columns
    const rows = podcasts.map(podcast => [
      podcast.podcast_name || '',
      podcast.podcast_description || '',
      podcast.itunes_rating?.toString() || '',
      podcast.episode_count?.toString() || '',
      podcast.podscan_podcast_id || podcast.podcast_id || '',
      podcast.compatibility_score?.toString() || '',
      podcast.compatibility_reasoning || '',
    ])

    // Write headers for score columns (F1:G1) that aren't in the template
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!F1:G1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [['Compatibility Score', 'Compatibility Reasoning']],
        }),
      }
    )

    // Append data to the sheet (skipped when no podcasts — empty dashboards are valid)
    let appendResult: any = { updates: { updatedRange: 'Sheet1' } }
    if (rows.length > 0) {
      const appendResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=RAW`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: rows,
          }),
        }
      )

      if (!appendResponse.ok) {
        const errorText = await appendResponse.text()
        console.error('[Prospect Sheet] Append failed:', errorText)
        throw new Error(`Failed to write to Google Sheet: ${errorText}`)
      }

      appendResult = await appendResponse.json()
      console.log('[Prospect Sheet] Data exported successfully')
    } else {
      console.log('[Prospect Sheet] Empty dashboard — no podcasts to append')
    }

    // Create or update a record in the prospect_dashboards table
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let dashboardRecord: { id: string; slug: string } | null = null
    let slug: string

    if (existingProspectId) {
      // Update existing prospect with sheet info instead of creating a duplicate
      console.log('[Prospect Sheet] Updating existing prospect:', existingProspectId)
      const { data: updated, error: updateError } = await supabase
        .from('prospect_dashboards')
        .update({
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: spreadsheetUrl,
        })
        .eq('id', existingProspectId)
        .select('id, slug')
        .single()

      if (updateError) {
        console.error('[Prospect Sheet] Failed to update existing prospect:', updateError)
        throw new Error('Failed to update prospect dashboard')
      } else {
        dashboardRecord = updated
        console.log('[Prospect Sheet] Existing prospect updated:', updated.id)
      }
      slug = dashboardRecord?.slug || generateSlug()
    } else {
      // Create a new prospect dashboard record
      slug = generateSlug()

      const { data: inserted, error: dbError } = await supabase
        .from('prospect_dashboards')
        .insert({
          slug,
          prospect_name: prospectName,
          prospect_bio: prospectBio || null,
          prospect_image_url: prospectImageUrl || null,
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: spreadsheetUrl,
        })
        .select('id, slug')
        .single()

      if (dbError) {
        console.error('[Prospect Sheet] Failed to create dashboard record:', dbError)
        throw new Error('Failed to create prospect dashboard')
      } else {
        dashboardRecord = inserted
        slug = inserted.slug
        console.log('[Prospect Sheet] Dashboard record created:', inserted.id)
      }
    }

    // Build the dashboard URL
    const appUrl = Deno.env.get('APP_URL') || 'https://getonapod.com'
    const dashboardUrl = `${appUrl}/prospect/${slug}`

    // ============================================
    // CACHE OPTIMIZATION: Save podcasts to central database
    // ============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💾 [CACHE SAVE] Saving podcasts to central database...')
    console.log(`   Prospect: ${prospectName}`)
    console.log(`   Podcasts to cache: ${podcasts.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    let savedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const podcast of podcasts) {
      const podcastId = podcast.podscan_podcast_id || podcast.podcast_id

      if (!podcastId) {
        console.warn('⚠️  [SKIP] No podcast ID for:', podcast.podcast_name?.substring(0, 50))
        skippedCount++
        continue
      }

      try {
        // Upsert podcast to central database
        const { error: upsertError } = await supabase
          .from('podcasts')
          .upsert({
            podscan_id: podcastId,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description || null,
            podcast_image_url: podcast.podcast_image_url || null,
            podcast_url: podcast.podcast_url || null,
            publisher_name: podcast.publisher_name || null,
            episode_count: podcast.episode_count || null,
            itunes_rating: podcast.itunes_rating || null,
            audience_size: podcast.audience_size || null,
            language: podcast.language || null,
            region: podcast.region || null,
            podscan_email: podcast.podcast_email || null,
            rss_url: podcast.rss_feed || null,
            podcast_categories: podcast.podcast_categories || null,
            // Mark as saved from podcast finder export
            podscan_last_fetched_at: new Date().toISOString(),
          }, {
            onConflict: 'podscan_id',
            ignoreDuplicates: false, // Update if exists
          })

        if (upsertError) {
          console.error('❌ [ERROR] Failed to save podcast:', podcast.podcast_name?.substring(0, 50), upsertError.message)
          errorCount++
        } else {
          console.log(`💾 [SAVED] ${podcast.podcast_name?.substring(0, 50)} → Central DB`)
          savedCount++
        }
      } catch (error) {
        console.error('❌ [ERROR] Exception saving podcast:', podcast.podcast_name?.substring(0, 50), error)
        errorCount++
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [CACHE SAVE COMPLETE]')
    console.log(`   💾 Saved to central DB: ${savedCount}`)
    console.log(`   ⏩ Skipped (no ID): ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 [BENEFIT] These podcasts now available for ALL prospects & clients!')
    console.log('   Next time anyone fetches these → Cache hit!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetUrl,
        spreadsheetId,
        sheetTitle,
        rowsAdded: podcasts.length,
        updatedRange: appendResult.updates?.updatedRange || 'Sheet1',
        message: `Created "${sheetTitle}" with ${podcasts.length} podcasts`,
        // New fields for prospect dashboard
        dashboardId: dashboardRecord?.id || null,
        dashboardUrl,
        dashboardSlug: slug,
        // Cache statistics
        cacheSaved: savedCount,
        cacheSkipped: skippedCount,
        cacheErrors: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Prospect Sheet] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
