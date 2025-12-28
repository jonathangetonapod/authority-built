import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getMagicLinkEmail } from '../_shared/email-templates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  email: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email }: RequestBody = await req.json()

    // Validation
    if (!email || !email.trim()) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const portalBaseUrl = Deno.env.get('PORTAL_BASE_URL') || 'http://localhost:5173'

    if (!resendApiKey) {
      console.error('[Magic Link] RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get client IP and user agent for logging
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const user_agent = req.headers.get('user-agent') || 'unknown'

    console.log(`[Magic Link] Request from ${email} (IP: ${ip_address})`)

    // 1. Find client by email
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email, portal_access_enabled')
      .ilike('email', email)
      .single()

    if (clientError || !client) {
      console.log(`[Magic Link] Client not found: ${email}`)
      // Return generic success message to prevent email enumeration
      return new Response(
        JSON.stringify({
          success: true,
          message: 'If an account exists with this email, you will receive a login link shortly.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Check if portal access is enabled
    if (!client.portal_access_enabled) {
      console.log(`[Magic Link] Portal access disabled for client: ${client.id}`)
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        action: 'request_magic_link_denied',
        metadata: { reason: 'portal_access_disabled' },
        ip_address,
        user_agent
      })
      // Return generic success message
      return new Response(
        JSON.stringify({
          success: true,
          message: 'If an account exists with this email, you will receive a login link shortly.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Rate limiting - check last 3 requests in past 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentRequests, error: rateLimitError } = await supabase
      .from('client_portal_activity_log')
      .select('created_at')
      .eq('client_id', client.id)
      .eq('action', 'request_magic_link')
      .gte('created_at', fifteenMinutesAgo)
      .order('created_at', { ascending: false })

    if (rateLimitError) {
      console.error('[Magic Link] Rate limit check error:', rateLimitError)
    }

    if (recentRequests && recentRequests.length >= 3) {
      console.log(`[Magic Link] Rate limit exceeded for client: ${client.id}`)
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        action: 'request_magic_link_rate_limited',
        metadata: { attempt_count: recentRequests.length + 1 },
        ip_address,
        user_agent
      })
      return new Response(
        JSON.stringify({
          error: 'Too many requests. Please wait a few minutes before trying again.'
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Generate secure token
    const token = crypto.randomUUID() + '-' + crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now

    // 5. Store token in database
    const { error: tokenError } = await supabase
      .from('client_portal_tokens')
      .insert({
        client_id: client.id,
        token,
        expires_at: expiresAt.toISOString(),
        ip_address,
        user_agent
      })

    if (tokenError) {
      console.error('[Magic Link] Failed to store token:', tokenError)
      throw new Error('Failed to generate login link')
    }

    // 6. Construct magic link
    const magicLink = `${portalBaseUrl}/portal/auth?token=${encodeURIComponent(token)}`

    // 7. Send email via Resend
    const emailTemplate = getMagicLinkEmail(client.name, magicLink)

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Get On A Pod <portal@getonapod.com>',
        to: [email],
        subject: emailTemplate.subject,
        text: emailTemplate.text,
      }),
    })

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      console.error('[Magic Link] Resend API error:', errorText)
      throw new Error('Failed to send email')
    }

    const emailData = await emailResponse.json()
    console.log(`[Magic Link] Email sent successfully to ${email} (ID: ${emailData.id})`)

    // 8. Log activity
    await supabase.from('client_portal_activity_log').insert({
      client_id: client.id,
      action: 'request_magic_link',
      metadata: {
        email_id: emailData.id,
        expires_at: expiresAt.toISOString()
      },
      ip_address,
      user_agent
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Check your email for a login link. It will expire in 15 minutes.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Magic Link] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
