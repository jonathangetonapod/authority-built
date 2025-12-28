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

  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
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
    const { clientId, clientName } = await req.json() as {
      clientId: string
      clientName: string
    }

    if (!clientId || !clientName) {
      return new Response(
        JSON.stringify({ error: 'Client ID and name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get access token
    console.log('[Create Sheet] Generating access token...')
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!
    const serviceAccount = JSON.parse(serviceAccountJson)
    const serviceAccountEmail = serviceAccount.client_email
    console.log('[Create Sheet] Using service account:', serviceAccountEmail)

    const accessToken = await getGoogleAccessToken()
    console.log('[Create Sheet] Access token obtained, length:', accessToken.length)

    // Create a new spreadsheet
    const sheetTitle = `Podcast Leads - ${clientName}`
    console.log('[Create Sheet] Creating spreadsheet:', sheetTitle)

    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: sheetTitle,
        },
        sheets: [{
          properties: {
            title: 'Podcasts',
            gridProperties: {
              rowCount: 1000,
              columnCount: 12,
              frozenRowCount: 1, // Freeze header row
            },
          },
        }],
      }),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('[Create Sheet] Failed to create:', errorText)
      console.error('[Create Sheet] Status:', createResponse.status)
      throw new Error(`Google Sheets API error (${createResponse.status}): ${errorText}`)
    }

    const spreadsheet = await createResponse.json()
    const spreadsheetId = spreadsheet.spreadsheetId
    const spreadsheetUrl = spreadsheet.spreadsheetUrl

    console.log('[Create Sheet] Created with ID:', spreadsheetId)
    console.log('[Create Sheet] Spreadsheet URL:', spreadsheetUrl)

    // Make the sheet publicly editable by anyone with the link
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
          role: 'writer',
        }),
      }
    )

    if (!publicPermissionResponse.ok) {
      const errorText = await publicPermissionResponse.text()
      console.error('[Create Sheet] Failed to make public:', errorText)
      // Continue anyway - this is optional
    } else {
      console.log('[Create Sheet] Made sheet publicly editable via link')
    }

    // Add headers to the first row
    const headers = [
      'Podcast Name',
      'Publisher/Host',
      'Description',
      'Audience Size',
      'Episodes',
      'Rating',
      'Podcast URL',
      'Email',
      'RSS Feed',
      'Fit Score',
      'AI Reasoning',
      'Export Date',
    ]

    // Add headers and format them
    const updateResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            // Add header values
            {
              updateCells: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                rows: [{
                  values: headers.map(header => ({
                    userEnteredValue: { stringValue: header },
                  })),
                }],
                fields: 'userEnteredValue',
              },
            },
            // Format headers: bold, background color, text color
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: {
                      red: 0.2,
                      green: 0.6,
                      blue: 0.86,
                    },
                    textFormat: {
                      foregroundColor: {
                        red: 1.0,
                        green: 1.0,
                        blue: 1.0,
                      },
                      fontSize: 11,
                      bold: true,
                    },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE',
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
              },
            },
            // Auto-resize columns
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: 0,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        }),
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('[Create Sheet] Failed to format:', errorText)
      // Continue anyway - sheet is created even if formatting fails
    }

    console.log('[Create Sheet] Formatted headers')

    // Share the sheet with the service account (so it can write to it)
    const shareResponse = await fetch(
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

    if (!shareResponse.ok) {
      const errorText = await shareResponse.text()
      console.error('[Create Sheet] Failed to share:', errorText)
      // Continue anyway - user can manually share if needed
    }

    console.log('[Create Sheet] Shared with service account')

    // Update client record with the sheet URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error: updateError } = await supabase
      .from('clients')
      .update({ google_sheet_url: spreadsheetUrl })
      .eq('id', clientId)

    if (updateError) {
      console.error('[Create Sheet] Failed to update client:', updateError)
      // Return success anyway - they can manually add the URL
    }

    console.log('[Create Sheet] Updated client record')

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetUrl,
        spreadsheetId,
        message: `Created sheet: ${sheetTitle}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Create Sheet] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorStack = error instanceof Error ? error.stack : undefined

    console.error('[Create Sheet] Error message:', errorMessage)
    console.error('[Create Sheet] Error stack:', errorStack)

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorStack,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
