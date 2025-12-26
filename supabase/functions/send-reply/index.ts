import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { bisonReplyId, message, subject } = await req.json()

    // Validation
    if (!bisonReplyId) {
      throw new Error('bisonReplyId is required')
    }

    if (!message) {
      throw new Error('message is required')
    }

    // Get Email Bison API token from environment
    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')

    if (!bisonApiToken) {
      throw new Error('EMAIL_BISON_API_TOKEN not configured')
    }

    console.log('[Send Reply] Sending reply for Bison reply ID:', bisonReplyId)

    // Call Email Bison API to send reply
    const bisonResponse = await fetch(
      `https://send.leadgenjay.com/api/replies/${bisonReplyId}/reply`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bisonApiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          reply_all: true, // Automatically choose sender and recipients
          inject_previous_email_body: true, // Include previous email thread
          message: message,
          content_type: 'text', // Send as plain text
          use_dedicated_ips: false,
        }),
      }
    )

    if (!bisonResponse.ok) {
      const errorText = await bisonResponse.text()
      console.error('[Send Reply] Email Bison API error:', errorText)
      throw new Error(`Email Bison API error: ${bisonResponse.status} ${errorText}`)
    }

    const responseData = await bisonResponse.json()

    console.log('[Send Reply] Successfully sent reply')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reply sent successfully',
        data: responseData.data,
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
    console.error('[Send Reply] Error:', error)

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
