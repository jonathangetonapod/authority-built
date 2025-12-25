import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify webhook secret (optional but recommended)
    const webhookSecret = Deno.env.get('CAMPAIGN_WEBHOOK_SECRET')
    const providedSecret = req.headers.get('x-webhook-secret')

    if (webhookSecret && providedSecret !== webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook secret' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const payload = await req.json()
    console.log('[Campaign Webhook] Received payload:', payload)

    // Parse Instantly webhook structure
    const eventType = payload?.data?.event?.type
    const leadData = payload?.data?.lead
    const campaignData = payload?.data?.campaign
    const scheduledEmail = payload?.data?.scheduled_email
    const campaignEvent = payload?.data?.campaign_event

    // Only process reply events (adjust event type as needed)
    // Common Instantly event types: EMAIL_REPLY, EMAIL_REPLIED, LEAD_REPLIED
    const replyEvents = ['EMAIL_REPLY', 'EMAIL_REPLIED', 'LEAD_REPLIED', 'REPLY_RECEIVED']

    if (!replyEvents.includes(eventType)) {
      console.log(`[Campaign Webhook] Skipping event type: ${eventType}`)
      return new Response(
        JSON.stringify({
          success: true,
          message: `Event type ${eventType} ignored - only processing replies`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Extract lead information
    const email = leadData?.email
    const firstName = leadData?.first_name || ''
    const lastName = leadData?.last_name || ''
    const name = [firstName, lastName].filter(Boolean).join(' ') || null
    const company = leadData?.company || null
    const campaignName = campaignData?.name || null
    const replyContent = scheduledEmail?.email_body || null
    const receivedAt = campaignEvent?.created_at || new Date().toISOString()

    // Validation
    if (!email) {
      throw new Error('Email is required')
    }

    console.log('[Campaign Webhook] Processing reply from:', email)

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Insert campaign reply
    const { data, error } = await supabase
      .from('campaign_replies')
      .insert({
        email: email,
        name: name,
        company: company,
        reply_content: replyContent,
        campaign_name: campaignName,
        received_at: receivedAt,
        status: 'new',
      })
      .select()
      .single()

    if (error) {
      console.error('[Campaign Webhook] Database error:', error)
      throw error
    }

    console.log('[Campaign Webhook] Reply created:', data.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Campaign reply received',
        reply_id: data.id,
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
    console.error('[Campaign Webhook] Error:', error)

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
