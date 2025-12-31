import { supabase } from '@/lib/supabase'
import type { Client } from './clients'
import type { Booking } from './bookings'

export interface ClientPortalSession {
  session_token: string
  expires_at: string
  client_id: string
}

export interface ClientPortalAuthResponse {
  session: ClientPortalSession
  client: Client
}

/**
 * Request a magic link to be sent to the specified email address
 */
export async function requestMagicLink(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-portal-magic-link', {
    body: { email }
  })

  if (error) {
    console.error('Failed to request magic link:', error)
    throw new Error(error.message || 'Failed to send login link')
  }

  if (!data.success) {
    throw new Error(data.error || 'Failed to send login link')
  }
}

/**
 * Login with email and password
 */
export async function loginWithPassword(email: string, password: string): Promise<ClientPortalAuthResponse> {
  const { data, error } = await supabase.functions.invoke('login-with-password', {
    body: { email, password }
  })

  if (error) {
    console.error('Failed to login with password:', error)
    throw new Error(error.message || 'Login failed')
  }

  if (data.error) {
    throw new Error(data.error)
  }

  return {
    session: {
      session_token: data.session_token,
      expires_at: data.expires_at,
      client_id: data.client.id
    },
    client: data.client
  }
}

/**
 * Verify a magic link token and create a session
 */
export async function verifyToken(token: string): Promise<ClientPortalAuthResponse> {
  const { data, error } = await supabase.functions.invoke('verify-portal-token', {
    body: { token }
  })

  if (error) {
    console.error('Failed to verify token:', error)
    throw new Error(error.message || 'Invalid or expired login link')
  }

  if (!data.success) {
    throw new Error(data.error || 'Invalid or expired login link')
  }

  return {
    session: data.session,
    client: data.client
  }
}

/**
 * Validate an existing session and return client data
 */
export async function validateSession(sessionToken: string): Promise<Client> {
  const { data, error } = await supabase.functions.invoke('validate-portal-session', {
    body: { sessionToken }
  })

  if (error) {
    console.error('Failed to validate session:', error)
    throw new Error(error.message || 'Session expired or invalid')
  }

  if (!data.success) {
    throw new Error(data.error || 'Session expired or invalid')
  }

  return data.client
}

/**
 * Logout and invalidate the session
 */
export async function logout(sessionToken: string): Promise<void> {
  try {
    await supabase.functions.invoke('logout-portal-session', {
      body: { sessionToken }
    })
  } catch (error) {
    console.error('Failed to logout:', error)
    // Don't throw - logout should always succeed client-side
  }

  // Clear local storage
  sessionStorage.clear()
}

/**
 * Get all bookings for the authenticated client via Edge Function
 */
export async function getClientBookings(clientId: string): Promise<Booking[]> {
  // Get session token if exists
  const { session } = sessionStorage.get()

  // Use client ID from session if available (to ensure it matches the session token)
  const effectiveClientId = session?.client_id || clientId

  const { data, error } = await supabase.functions.invoke('get-client-bookings', {
    body: {
      clientId: effectiveClientId,
      sessionToken: session?.session_token
    }
  })

  if (error) {
    console.error('Failed to fetch bookings:', error)
    throw new Error(error.message || 'Failed to fetch bookings')
  }

  if (data.error) {
    console.error('Edge Function returned error:', data.error)
    throw new Error(data.error || 'Failed to fetch bookings')
  }

  return data.bookings as Booking[]
}

/**
 * Get a single booking by ID (with authorization check)
 */
export async function getClientBooking(clientId: string, bookingId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('client_id', clientId) // Authorization check
    .single()

  if (error) {
    throw new Error(`Failed to fetch booking: ${error.message}`)
  }

  return data as Booking
}

/**
 * Get client portal activity log for a specific client
 * (Admin use only - requires service role)
 */
export async function getClientPortalActivity(clientId: string, limit = 50) {
  const { data, error } = await supabase
    .from('client_portal_activity_log')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch activity log: ${error.message}`)
  }

  return data
}

/**
 * Enable or disable portal access for a client (Admin use only)
 */
export async function updatePortalAccess(clientId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ portal_access_enabled: enabled })
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to update portal access: ${error.message}`)
  }
}

/**
 * Send portal invitation email (Admin use only)
 */
export async function sendPortalInvitation(clientId: string): Promise<void> {
  // Get client details
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, name, email, portal_access_enabled')
    .eq('id', clientId)
    .single()

  if (clientError || !client) {
    throw new Error('Client not found')
  }

  if (!client.email) {
    throw new Error('Client has no email address')
  }

  if (!client.portal_access_enabled) {
    throw new Error('Portal access is not enabled for this client')
  }

  // Note: Invitation emails should use the portal invitation template
  // For now, we'll just send a magic link as the invitation
  await requestMagicLink(client.email)

  // Update invitation sent timestamp
  await supabase
    .from('clients')
    .update({ portal_invitation_sent_at: new Date().toISOString() })
    .eq('id', clientId)
}

/**
 * Get client portal stats (Admin use only)
 */
export async function getPortalStats() {
  const { data, error } = await supabase.rpc('get_client_portal_stats')

  if (error) {
    console.error('Failed to fetch portal stats:', error)
    return {
      total_clients_with_access: 0,
      active_sessions_count: 0,
      logins_last_24h: 0,
      logins_last_7d: 0
    }
  }

  return data
}

/**
 * Get cached podcast fit analysis or generate new one if not cached
 */
export async function getPodcastFitAnalysis(
  clientId: string,
  bookingId: string,
  clientBio: string,
  podcastName: string,
  podcastDescription?: string,
  hostName?: string,
  audienceSize?: number
): Promise<string | null> {
  // Check cache first
  const { data: cached, error: cacheError } = await supabase
    .from('podcast_fit_analyses')
    .select('analysis')
    .eq('client_id', clientId)
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (!cacheError && cached?.analysis) {
    console.log('[PodcastFitCache] Using cached analysis')
    return cached.analysis
  }

  console.log('[PodcastFitCache] No cache found, generating new analysis')

  // Generate new analysis via Edge Function
  try {
    const { data, error } = await supabase.functions.invoke('analyze-podcast-fit', {
      body: {
        clientBio,
        podcastName,
        podcastDescription: podcastDescription || '',
        hostName,
        audienceSize,
      }
    })

    if (error) {
      console.error('Failed to analyze podcast fit:', error)
      return null
    }

    if (!data?.analysis) {
      console.error('No analysis returned from Edge Function')
      return null
    }

    // Save to cache
    const { error: saveError } = await supabase
      .from('podcast_fit_analyses')
      .insert({
        client_id: clientId,
        booking_id: bookingId,
        podcast_name: podcastName,
        podcast_description: podcastDescription,
        analysis: data.analysis
      })

    if (saveError) {
      console.error('Failed to cache analysis:', saveError)
      // Don't fail if cache save fails - we still have the analysis
    } else {
      console.log('[PodcastFitCache] Analysis cached successfully')
    }

    return data.analysis
  } catch (error) {
    console.error('Error generating podcast fit analysis:', error)
    return null
  }
}

/**
 * Invalidate cached analysis for a booking (e.g., when client bio changes)
 */
export async function invalidatePodcastFitAnalysis(clientId: string, bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('podcast_fit_analyses')
    .delete()
    .eq('client_id', clientId)
    .eq('booking_id', bookingId)

  if (error) {
    console.error('Failed to invalidate cache:', error)
  } else {
    console.log('[PodcastFitCache] Cache invalidated for booking:', bookingId)
  }
}

/**
 * Session storage helpers
 */
export const sessionStorage = {
  save: (session: ClientPortalSession, client: Client) => {
    localStorage.setItem('client_portal_session', JSON.stringify(session))
    localStorage.setItem('client_portal_client', JSON.stringify(client))
  },

  get: (): { session: ClientPortalSession | null, client: Client | null } => {
    const sessionStr = localStorage.getItem('client_portal_session')
    const clientStr = localStorage.getItem('client_portal_client')

    return {
      session: sessionStr ? JSON.parse(sessionStr) : null,
      client: clientStr ? JSON.parse(clientStr) : null
    }
  },

  clear: () => {
    localStorage.removeItem('client_portal_session')
    localStorage.removeItem('client_portal_client')
  },

  isExpired: (session: ClientPortalSession): boolean => {
    const expiresAt = new Date(session.expires_at)
    const now = new Date()
    return now >= expiresAt
  }
}
