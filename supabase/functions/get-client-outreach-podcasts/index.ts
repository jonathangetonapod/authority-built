import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account
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

  // Create JWT
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

  // Import private key
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

  // Sign JWT
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

  // Exchange JWT for access token
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

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId } = await req.json()

    if (!clientId) {
      throw new Error('clientId is required')
    }

    console.log('[Get Outreach Podcasts] Starting for client:', clientId)
    console.log('[Get Outreach Podcasts] Version: 2.0 with debug info')

    // Get client's Google Sheet URL from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('google_sheet_url')
      .eq('id', clientId)
      .single()

    if (clientError || !client?.google_sheet_url) {
      console.log('[Get Outreach Podcasts] No Google Sheet found for client')
      return new Response(
        JSON.stringify({ success: true, podcasts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract spreadsheet ID from URL
    const sheetUrl = client.google_sheet_url
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!spreadsheetIdMatch) {
      throw new Error('Invalid Google Sheet URL')
    }
    const spreadsheetId = spreadsheetIdMatch[1]

    console.log('[Get Outreach Podcasts] Reading from spreadsheet:', spreadsheetId)

    // Get Google access token
    const accessToken = await getGoogleAccessToken()

    // First, get the sheet metadata to find the first sheet's name
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!metadataResponse.ok) {
      const error = await metadataResponse.text()
      throw new Error(`Failed to get sheet metadata: ${error}`)
    }

    const metadata = await metadataResponse.json()
    const firstSheetName = metadata.sheets[0]?.properties?.title || 'Sheet1'

    console.log('[Get Outreach Podcasts] First sheet name:', firstSheetName)

    // Read column E (Podscan Podcast ID) - assuming data starts at row 2 (skip header)
    const range = `${firstSheetName}!E2:E1000` // Read up to 1000 rows
    console.log('[Get Outreach Podcasts] Reading range:', range)

    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetsResponse.ok) {
      const error = await sheetsResponse.text()
      throw new Error(`Failed to read sheet: ${error}`)
    }

    const sheetsData = await sheetsResponse.json()
    const rows = sheetsData.values || []

    console.log('[Get Outreach Podcasts] Raw rows returned:', rows.length)
    console.log('[Get Outreach Podcasts] First few rows:', JSON.stringify(rows.slice(0, 5)))

    // Extract podcast IDs (column E), filter out empty values
    const podcastIds = rows
      .map((row: string[]) => row[0]) // Column E is index 0 in our range
      .filter((id: string) => id && id.trim() !== '')

    console.log('[Get Outreach Podcasts] Found', podcastIds.length, 'podcast IDs')
    console.log('[Get Outreach Podcasts] Sample IDs:', JSON.stringify(podcastIds.slice(0, 3)))

    if (podcastIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          podcasts: [],
          debug: {
            spreadsheetId,
            sheetName: firstSheetName,
            range,
            rowsReturned: rows.length,
            sampleRows: rows.slice(0, 5),
            message: 'No podcast IDs found in column E'
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch podcast details from Podscan API
    const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
    if (!podscanApiKey) {
      throw new Error('PODSCAN_API_KEY not configured')
    }

    const podcasts = []

    // Fetch podcasts in parallel (but limit concurrency to avoid rate limiting)
    const batchSize = 5
    for (let i = 0; i < podcastIds.length; i += batchSize) {
      const batch = podcastIds.slice(i, i + batchSize)
      const batchPromises = batch.map(async (podcastId: string) => {
        try {
          const response = await fetch(
            `https://api.podscan.fm/podcasts/${podcastId}`,
            {
              headers: {
                'X-API-KEY': podscanApiKey,
              },
            }
          )

          if (!response.ok) {
            console.warn('[Get Outreach Podcasts] Failed to fetch podcast:', podcastId)
            return null
          }

          const podcast = await response.json()
          return {
            podcast_id: podcastId,
            podcast_name: podcast.name || 'Unknown Podcast',
            podcast_description: podcast.description || null,
            podcast_image_url: podcast.image_url || null,
            podcast_url: podcast.website || podcast.listen_url || null,
            publisher_name: podcast.publisher || null,
            itunes_rating: podcast.itunes_rating || null,
            episode_count: podcast.episode_count || null,
            audience_size: podcast.audience_size || null,
          }
        } catch (error) {
          console.error('[Get Outreach Podcasts] Error fetching podcast:', podcastId, error)
          return null
        }
      })

      const batchResults = await Promise.all(batchPromises)
      podcasts.push(...batchResults.filter(p => p !== null))
    }

    console.log('[Get Outreach Podcasts] Successfully fetched', podcasts.length, 'podcasts')

    return new Response(
      JSON.stringify({
        success: true,
        podcasts,
        total: podcasts.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Get Outreach Podcasts] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch outreach podcasts',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
