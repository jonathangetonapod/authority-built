import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastExportData {
  podcast_name: string
  publisher_name?: string | null
  podcast_description?: string | null
  audience_size?: number | null
  episode_count?: number | null
  itunes_rating?: number | null
  podcast_url?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, podcasts } = await req.json() as {
      clientId: string
      podcasts: PodcastExportData[]
    }

    if (!clientId || !podcasts || podcasts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client ID and podcasts array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get client's Google Sheet URL
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('google_sheet_url, name')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!client.google_sheet_url) {
      return new Response(
        JSON.stringify({ error: 'No Google Sheet URL configured for this client. Please add one in client settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract spreadsheet ID from URL
    // URL format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit...
    const spreadsheetIdMatch = client.google_sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!spreadsheetIdMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google Sheet URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const spreadsheetId = spreadsheetIdMatch[1]

    // Get Google Service Account credentials from environment
    const googleCredentials = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    if (!googleCredentials) {
      return new Response(
        JSON.stringify({ error: 'Google Service Account credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let credentials
    try {
      credentials = JSON.parse(googleCredentials)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google Service Account credentials format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate JWT for Google API authentication
    const now = Math.floor(Date.now() / 1000)
    const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const jwtClaim = btoa(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }))

    // Import private key for signing
    const privateKeyPem = credentials.private_key
    const pemHeader = '-----BEGIN PRIVATE KEY-----'
    const pemFooter = '-----END PRIVATE KEY-----'
    const pemContents = privateKeyPem.substring(
      pemHeader.length,
      privateKeyPem.length - pemFooter.length
    ).replace(/\\n/g, '')

    // Decode base64 private key
    const binaryDerString = atob(pemContents)
    const binaryDer = new Uint8Array(binaryDerString.length)
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i)
    }

    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    )

    // Sign the JWT
    const dataToSign = new TextEncoder().encode(`${jwtHeader}.${jwtClaim}`)
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataToSign)
    const jwtSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\\+/g, '-')
      .replace(/\\//g, '_')

    const jwt = `${jwtHeader}.${jwtClaim}.${jwtSignature}`

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Google' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { access_token } = await tokenResponse.json()

    // Prepare rows to append
    const rows = podcasts.map(podcast => [
      podcast.podcast_name || '',
      podcast.publisher_name || '',
      podcast.podcast_description || '',
      podcast.audience_size?.toString() || '',
      podcast.episode_count?.toString() || '',
      podcast.itunes_rating?.toString() || '',
      podcast.podcast_url || '',
      podcast.podcast_email || '',
      podcast.rss_feed || '',
      podcast.compatibility_score?.toString() || '',
      podcast.compatibility_reasoning || '',
      new Date().toISOString(), // Timestamp
    ])

    // Check if sheet has headers, if not add them
    const sheetMetadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!sheetMetadataResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to access Google Sheet. Make sure the sheet is shared with the service account.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Append data to the sheet
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    )

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text()
      console.error('Append failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to write to Google Sheet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await appendResponse.json()

    return new Response(
      JSON.stringify({
        success: true,
        rowsAdded: podcasts.length,
        updatedRange: result.updates.updatedRange,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
