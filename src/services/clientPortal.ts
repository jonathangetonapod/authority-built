import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { createPortalSessionStore } from '@/lib/portalSessionStore'
import type { Client } from './clients'
import type { Booking } from './bookings'

export interface ClientPortalSession {
  session_token: string
  expires_at: string
  client_id: string
}

export interface PortalBranding {
  name: string
  logo_url: string | null
  primary_color: string
  accent_color: string
}

export interface ClientPortalAuthResponse {
  session: ClientPortalSession
  client: Client
  branding: PortalBranding | null
}

export interface ClientPortalValidation {
  client: Client
  branding: PortalBranding | null
}

function parsePortalBranding(value: unknown): PortalBranding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || !record.name.trim()) return null
  return {
    name: record.name.trim(),
    logo_url: typeof record.logo_url === 'string' ? record.logo_url : null,
    primary_color: typeof record.primary_color === 'string' ? record.primary_color : '#0D1B2A',
    accent_color: typeof record.accent_color === 'string' ? record.accent_color : '#C7794F',
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
    throw await toFunctionError(error, 'Login failed.')
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
    client: data.client,
    branding: parsePortalBranding(data.branding)
  }
}

/**
 * Validate an existing session and return client data
 */
export async function validateSession(sessionToken: string): Promise<ClientPortalValidation> {
  const { data, error } = await supabase.functions.invoke('validate-portal-session', {
    body: { sessionToken }
  })

  if (error) {
    console.error('Failed to validate session:', error)
    throw await toFunctionError(error, 'Session expired or invalid.')
  }

  if (!data.success) {
    throw new Error(data.error || 'Session expired or invalid')
  }

  return { client: data.client, branding: parsePortalBranding(data.branding) }
}

/**
 * Request a self-serve password reset email. Always resolves on success
 * responses regardless of whether the email matched an account.
 */
export async function requestPortalPasswordReset(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('portal-password-reset', {
    body: { action: 'request', email }
  })
  if (error) throw await toFunctionError(error, 'The reset request could not be sent.')
  if (!data?.success) throw new Error('The reset request could not be sent.')
}

/**
 * Redeem a reset token with a new password.
 */
export async function completePortalPasswordReset(token: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('portal-password-reset', {
    body: { action: 'complete', token, password }
  })
  if (error) throw await toFunctionError(error, 'This reset link is invalid or has expired.')
  if (!data?.success) throw new Error('This reset link is invalid or has expired.')
}

/**
 * Logout and invalidate the session
 */
export async function logout(sessionToken: string): Promise<void> {
  const { error } = await supabase.functions.invoke('logout-portal-session', {
    body: { sessionToken }
  })
  if (error) throw await toFunctionError(error, 'Failed to invalidate the portal session.')

  // Clear tab-scoped, in-memory, and legacy persistent storage.
  sessionStorage.clear()
}

export interface ClientPortalData {
  bookings: Array<Pick<
    Booking,
    | 'id'
    | 'podcast_name'
    | 'podcast_url'
    | 'host_name'
    | 'scheduled_date'
    | 'recording_date'
    | 'publish_date'
    | 'status'
    | 'episode_url'
  >>
}

/**
 * Get all bookings and outreach messages for the authenticated client via Edge Function
 */
export async function getClientBookings(clientId: string): Promise<ClientPortalData> {
  // Get session token if exists
  const { session } = sessionStorage.get()

  if (session && session.client_id !== clientId) {
    throw new Error('Portal session does not match the requested client.')
  }

  // Build request body - only include sessionToken if it exists
  const requestBody: { clientId: string; sessionToken?: string } = {
    clientId
  }

  if (session?.session_token) {
    requestBody.sessionToken = session.session_token
  }

  const { data, error } = await supabase.functions.invoke('get-client-bookings', {
    body: requestBody
  })

  if (error) {
    console.error('[getClientBookings] Failed to fetch bookings:', error)
    throw new Error(error.message || 'Failed to fetch bookings')
  }

  if (data.error) {
    console.error('[getClientBookings] Edge Function returned error:', data.error)
    throw new Error(data.error || 'Failed to fetch bookings')
  }

  return {
    bookings: data.bookings,
  }
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
    return cached.analysis
  }

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
  }
}

export const sessionStorage = {
  ...createPortalSessionStore<ClientPortalSession, Client>(),
  isExpired: (session: ClientPortalSession): boolean => {
    const expiresAt = new Date(session.expires_at)
    const now = new Date()
    return now >= expiresAt
  }
}
