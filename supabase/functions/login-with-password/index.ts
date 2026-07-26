import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import {
  hashPortalPassword,
  hashPortalSessionToken,
  verifyPortalPassword,
} from '../_shared/portalSecurity.ts'
import { safeWorkspaceBranding } from '../_shared/portalBranding.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store',
}

interface LoginRequest {
  email: string
  password: string
}

serve(async (req) => {
  console.log('[LOGIN] ========== FUNCTION INVOKED ==========')
  console.log('[LOGIN] Method:', req.method)
  console.log('[LOGIN] URL:', req.url)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[LOGIN] CORS preflight request')
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Only POST is allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[LOGIN] Missing environment variables!')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const recordActivity = async (activity: Record<string, unknown>): Promise<boolean> => {
      const { error } = await supabase.from('client_portal_activity_log').insert(activity)
      if (error) console.error('[LOGIN] Activity log write failed')
      return !error
    }

    if (!req.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const declaredLength = Number(req.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > 4096) {
      return new Response(
        JSON.stringify({ error: 'Request body is too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return new Response(
        JSON.stringify({ error: 'Request body is too large' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      return new Response(
        JSON.stringify({ error: 'Request body must be valid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return new Response(
        JSON.stringify({ error: 'Request body must be a JSON object' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const loginRequest = parsedBody as Partial<LoginRequest>
    const email = typeof loginRequest.email === 'string'
      ? loginRequest.email.trim().toLowerCase()
      : ''
    const password = typeof loginRequest.password === 'string'
      ? loginRequest.password
      : ''
    const forwardedFor = req.headers.get('x-forwarded-for')?.split(',').at(-1)
    const ip = (req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || forwardedFor
      || 'unknown').trim().slice(0, 120)
    const userAgent = (req.headers.get('user-agent') || 'unknown').slice(0, 1024)

    // Validate input
    if (!email || email.length > 254 || !password || password.length > 256) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: attemptReserved, error: attemptError } = await supabase.rpc(
      'reserve_client_portal_login_attempt',
      {
        p_email_normalized: email,
        p_ip_address: ip,
        p_user_agent: userAgent,
      },
    )

    if (attemptError) {
      console.error('[LOGIN] Atomic rate limit reservation failed')
      return new Response(
        JSON.stringify({ error: 'Login is temporarily unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!attemptReserved) {
      return new Response(
        JSON.stringify({ error: 'Too many login attempts. Please try again in 15 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find client by email
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email, portal_access_enabled, photo_url, dashboard_slug, workspace:workspaces!clients_workspace_id_fkey(id, name, status, logo_path, logo_updated_at)')
      .eq('portal_email_normalized', email)
      .eq('portal_access_enabled', true)
      .maybeSingle()

    const clientWorkspace = client?.workspace as {
      id?: string
      name?: string
      status?: string
      logo_path?: string | null
      logo_updated_at?: string | null
    } | null
    if (clientError || !client || clientWorkspace?.status !== 'active') {
      await hashPortalPassword(password)
      // Log failed attempt (generic message to prevent email enumeration)
      const logged = await recordActivity({
        client_id: null,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'client_not_found', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      if (!logged) {
        return new Response(
          JSON.stringify({ error: 'Login is temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if portal access is enabled
    if (!client.portal_access_enabled) {
      await hashPortalPassword(password)
      const logged = await recordActivity({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'access_disabled', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      if (!logged) {
        return new Response(
          JSON.stringify({ error: 'Login is temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: credential, error: credentialError } = await supabase
      .from('client_portal_credentials')
      .select('password_verifier')
      .eq('client_id', client.id)
      .maybeSingle()

    if (credentialError) {
      console.error('[LOGIN] Credential lookup failed')
      return new Response(
        JSON.stringify({ error: 'Login is temporarily unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Keep the unknown/unconfigured path expensive enough to resist account
    // enumeration through response timing.
    if (!credential?.password_verifier) {
      await hashPortalPassword(password)
      const logged = await recordActivity({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'password_not_set', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      if (!logged) {
        return new Response(
          JSON.stringify({ error: 'Login is temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const passwordVerification = await verifyPortalPassword(
      password,
      credential.password_verifier,
    )
    if (!passwordVerification.valid) {
      const logged = await recordActivity({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'incorrect_password', ip },
        ip_address: ip,
        user_agent: userAgent
      })

      if (!logged) {
        return new Response(
          JSON.stringify({ error: 'Login is temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upgradedPassword = passwordVerification.needsUpgrade
      ? await hashPortalPassword(password)
      : null
    const sessionToken = crypto.randomUUID()
    const storedSessionToken = await hashPortalSessionToken(sessionToken)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const { data: sessionId, error: sessionError } = await supabase.rpc(
      'issue_client_portal_password_session',
      {
        p_client_id: client.id,
        p_expected_email_normalized: email,
        p_expected_password_verifier: credential.password_verifier,
        p_upgraded_password_verifier: upgradedPassword,
        p_session_token_hash: storedSessionToken,
        p_expires_at: expiresAt.toISOString(),
        p_ip_address: ip,
        p_user_agent: userAgent.slice(0, 1024),
      },
    )

    if (sessionError) {
      console.error('[LOGIN] Atomic session creation failed')
      return new Response(
        JSON.stringify({ error: 'Login is temporarily unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!sessionId) {
      const logged = await recordActivity({
        client_id: client.id,
        session_id: null,
        action: 'password_login_failed',
        metadata: { email, reason: 'credential_changed', ip },
        ip_address: ip,
        user_agent: userAgent,
      })

      if (!logged) {
        return new Response(
          JSON.stringify({ error: 'Login is temporarily unavailable' }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const branding = clientWorkspace
      ? await safeWorkspaceBranding(supabase, clientWorkspace)
      : null

    // Return session token and client data
    return new Response(
      JSON.stringify({
        session_token: sessionToken,
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          photo_url: client.photo_url,
          dashboard_slug: client.dashboard_slug ?? null
        },
        branding,
        expires_at: expiresAt.toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in login-with-password:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
