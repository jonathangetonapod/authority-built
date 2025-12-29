import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  sessionToken?: string
  clientId: string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sessionToken, clientId }: RequestBody = await req.json()

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
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

    // If session token provided, validate it
    // If no session token, allow it (for admin impersonation)
    if (sessionToken) {
      const { data: session, error: sessionError } = await supabase
        .from('client_portal_sessions')
        .select('client_id, expires_at')
        .eq('session_token', sessionToken)
        .single()

      if (sessionError || !session) {
        console.error('[Get Client Bookings] Invalid session:', sessionError)
        return new Response(
          JSON.stringify({ error: 'Invalid session. Please log out and log back in.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if session expired
      if (new Date(session.expires_at) < new Date()) {
        console.log('[Get Client Bookings] Session expired for client:', clientId)
        return new Response(
          JSON.stringify({ error: 'Session expired. Please log in again.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify client ID matches session
      if (session.client_id !== clientId) {
        console.error('[Get Client Bookings] Client ID mismatch:', session.client_id, 'vs', clientId)
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('[Get Client Bookings] Session validated for client:', clientId)
    } else {
      console.log('[Get Client Bookings] No session token - allowing (admin impersonation)')
    }

    // Fetch bookings with service role (bypasses RLS)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false, nullsFirst: false })

    if (bookingsError) {
      console.error('[Get Client Bookings] Error:', bookingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ bookings }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Get Client Bookings] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
