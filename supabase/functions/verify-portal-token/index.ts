import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  token: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token }: RequestBody = await req.json()

    // Validation
    if (!token || !token.trim()) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    console.log(`[Verify Token] Verifying token (IP: ${ip_address})`)

    // 1. Find token in database
    const { data: tokenRecord, error: tokenError } = await supabase
      .from('client_portal_tokens')
      .select('id, client_id, expires_at, used_at')
      .eq('token', token)
      .single()

    if (tokenError || !tokenRecord) {
      console.log('[Verify Token] Token not found')
      return new Response(
        JSON.stringify({
          error: 'Invalid or expired login link. Please request a new one.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Check if token is already used
    if (tokenRecord.used_at) {
      console.log(`[Verify Token] Token already used: ${tokenRecord.id}`)
      await supabase.from('client_portal_activity_log').insert({
        client_id: tokenRecord.client_id,
        action: 'login_failed',
        metadata: { reason: 'token_already_used', token_id: tokenRecord.id },
        ip_address,
        user_agent
      })
      return new Response(
        JSON.stringify({
          error: 'This login link has already been used. Please request a new one.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Check if token is expired
    const now = new Date()
    const expiresAt = new Date(tokenRecord.expires_at)
    if (now > expiresAt) {
      console.log(`[Verify Token] Token expired: ${tokenRecord.id}`)
      await supabase.from('client_portal_activity_log').insert({
        client_id: tokenRecord.client_id,
        action: 'login_failed',
        metadata: {
          reason: 'token_expired',
          token_id: tokenRecord.id,
          expires_at: tokenRecord.expires_at
        },
        ip_address,
        user_agent
      })
      return new Response(
        JSON.stringify({
          error: 'This login link has expired. Please request a new one.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', tokenRecord.client_id)
      .single()

    if (clientError || !client) {
      console.error('[Verify Token] Client not found:', clientError)
      throw new Error('Client not found')
    }

    // 5. Check if portal access is still enabled
    if (!client.portal_access_enabled) {
      console.log(`[Verify Token] Portal access disabled for client: ${client.id}`)
      await supabase.from('client_portal_activity_log').insert({
        client_id: client.id,
        action: 'login_failed',
        metadata: { reason: 'portal_access_disabled' },
        ip_address,
        user_agent
      })
      return new Response(
        JSON.stringify({
          error: 'Portal access has been disabled. Please contact support.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Mark token as used
    const { error: updateTokenError } = await supabase
      .from('client_portal_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenRecord.id)

    if (updateTokenError) {
      console.error('[Verify Token] Failed to mark token as used:', updateTokenError)
      throw new Error('Failed to process token')
    }

    // 7. Create new session (24-hour expiry)
    const sessionToken = crypto.randomUUID() + '-' + crypto.randomUUID()
    const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .insert({
        client_id: client.id,
        session_token: sessionToken,
        expires_at: sessionExpiresAt.toISOString(),
        ip_address,
        user_agent
      })
      .select()
      .single()

    if (sessionError) {
      console.error('[Verify Token] Failed to create session:', sessionError)
      throw new Error('Failed to create session')
    }

    // 8. Update client's last login timestamp
    await supabase
      .from('clients')
      .update({ portal_last_login_at: new Date().toISOString() })
      .eq('id', client.id)

    // 9. Log successful login
    await supabase.from('client_portal_activity_log').insert({
      client_id: client.id,
      session_id: session.id,
      action: 'login_success',
      metadata: {
        session_id: session.id,
        expires_at: sessionExpiresAt.toISOString()
      },
      ip_address,
      user_agent
    })

    console.log(`[Verify Token] Session created successfully for client: ${client.id}`)

    // 10. Return session and client data
    return new Response(
      JSON.stringify({
        success: true,
        session: {
          session_token: sessionToken,
          expires_at: sessionExpiresAt.toISOString(),
          client_id: client.id
        },
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          contact_person: client.contact_person,
          linkedin_url: client.linkedin_url,
          website: client.website
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Verify Token] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
