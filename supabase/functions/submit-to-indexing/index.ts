import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account
 */
async function getGoogleAccessToken(): Promise<string> {
  // Get service account credentials from environment
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
  const expiry = now + 3600 // 1 hour

  const jwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const jwtPayload = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  }

  // Encode JWT parts
  const encoder = new TextEncoder()
  const base64UrlEncode = (data: string) =>
    btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const headerEncoded = base64UrlEncode(JSON.stringify(jwtHeader))
  const payloadEncoded = base64UrlEncode(JSON.stringify(jwtPayload))
  const signatureInput = `${headerEncoded}.${payloadEncoded}`

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

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`)
  }

  return tokenData.access_token
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

    // Get fresh access token from service account
    console.log('[Submit Indexing] Generating access token...')
    const accessToken = await getGoogleAccessToken()
    console.log('[Submit Indexing] Access token generated')

    // Submit to Google Indexing API
    console.log('[Submit Indexing] Submitting URL:', url)
    const googleResponse = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        url: url,
        type: 'URL_UPDATED',
      }),
    })

    const googleResponseData = await googleResponse.json()
    const isSuccess = googleResponse.ok

    console.log('[Submit Indexing] Result:', isSuccess ? 'success' : 'failed')

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Log the indexation attempt to database
    const { error: logError } = await supabase
      .from('blog_indexing_log')
      .insert({
        post_id: postId,
        url: url,
        service: 'google',
        action: 'submit',
        status: isSuccess ? 'success' : 'failed',
        response_data: googleResponseData,
        error_message: isSuccess ? null : (googleResponseData.error?.message || 'Unknown error'),
      })

    if (logError) {
      console.error('Failed to log indexation attempt:', logError)
    }

    // Update post's submitted_to_google_at timestamp
    if (isSuccess) {
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          submitted_to_google_at: new Date().toISOString(),
          google_indexing_status: 'submitted',
        })
        .eq('id', postId)

      if (updateError) {
        console.error('Failed to update post indexing status:', updateError)
      }
    }

    // Return response
    return new Response(
      JSON.stringify({
        success: isSuccess,
        message: isSuccess
          ? 'Successfully submitted to Google Indexing API'
          : 'Failed to submit to Google Indexing API',
        data: googleResponseData,
      }),
      {
        status: isSuccess ? 200 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('Error in submit-to-indexing function:', error)

    return new Response(
      JSON.stringify({
        success: false,
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
