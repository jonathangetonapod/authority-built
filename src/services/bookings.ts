import { supabase } from '@/lib/supabase'
import type { Client } from './clients'

export interface Booking {
  id: string
  client_id: string
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
  episode_url: string | null
  notes: string | null
  prep_sent: boolean
  created_at: string
  updated_at: string
}

export interface BookingWithClient extends Booking {
  client: Client
}

/**
 * Get all bookings with optional filtering
 */
export async function getBookings(options?: {
  client_id?: string
  status?: 'booked' | 'in_progress' | 'recorded' | 'published' | 'cancelled'
  date_from?: string
  date_to?: string
  search?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('bookings')
    .select(`
      *,
      client:clients(*)
    `, { count: 'exact' })

  // Filter by client
  if (options?.client_id) {
    query = query.eq('client_id', options.client_id)
  }

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  // Filter by date range
  if (options?.date_from) {
    query = query.gte('scheduled_date', options.date_from)
  }
  if (options?.date_to) {
    query = query.lte('scheduled_date', options.date_to)
  }

  // Search by podcast name
  if (options?.search) {
    query = query.ilike('podcast_name', `%${options.search}%`)
  }

  // Order by scheduled date (newest first)
  query = query.order('scheduled_date', { ascending: false, nullsFirst: false })

  // Pagination
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch bookings: ${error.message}`)
  }

  return { bookings: data as BookingWithClient[], total: count || 0 }
}

/**
 * Get a single booking by ID
 */
export async function getBookingById(bookingId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      client:clients(*)
    `)
    .eq('id', bookingId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch booking: ${error.message}`)
  }

  return data as BookingWithClient
}

/**
 * Get bookings for a specific date
 */
export async function getBookingsByDate(date: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      client:clients(*)
    `)
    .eq('scheduled_date', date)
    .order('scheduled_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch bookings: ${error.message}`)
  }

  return data as BookingWithClient[]
}

/**
 * Get bookings for a specific month
 */
export async function getBookingsByMonth(year: number, month: number) {
  const startDate = new Date(year, month, 1).toISOString().split('T')[0]
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      client:clients(*)
    `)
    .gte('scheduled_date', startDate)
    .lte('scheduled_date', endDate)
    .order('scheduled_date', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch bookings: ${error.message}`)
  }

  return data as BookingWithClient[]
}

/**
 * Create a new booking
 */
export async function createBooking(input: {
  client_id: string
  podcast_name: string
  podcast_url?: string
  host_name?: string
  scheduled_date?: string
  recording_date?: string
  publish_date?: string
  status?: 'booked' | 'in_progress' | 'recorded' | 'published' | 'cancelled'
  episode_url?: string
  notes?: string
  prep_sent?: boolean
}) {
  const { data, error } = await supabase
    .from('bookings')
    .insert([{
      ...input,
      status: input.status || 'booked',
      prep_sent: input.prep_sent || false
    }])
    .select(`
      *,
      client:clients(*)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to create booking: ${error.message}`)
  }

  return data as BookingWithClient
}

/**
 * Update an existing booking
 */
export async function updateBooking(bookingId: string, updates: Partial<Booking>) {
  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select(`
      *,
      client:clients(*)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update booking: ${error.message}`)
  }

  return data as BookingWithClient
}

/**
 * Delete a booking
 */
export async function deleteBooking(bookingId: string) {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)

  if (error) {
    throw new Error(`Failed to delete booking: ${error.message}`)
  }
}

/**
 * Get booking statistics
 */
export async function getBookingStats() {
  // Total bookings
  const { count: totalBookings, error: totalError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })

  if (totalError) {
    throw new Error(`Failed to fetch total bookings: ${totalError.message}`)
  }

  // By status
  const { count: bookedCount, error: bookedError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'booked')

  if (bookedError) {
    throw new Error(`Failed to fetch booked count: ${bookedError.message}`)
  }

  const { count: inProgressCount, error: inProgressError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_progress')

  if (inProgressError) {
    throw new Error(`Failed to fetch in progress count: ${inProgressError.message}`)
  }

  const { count: recordedCount, error: recordedError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'recorded')

  if (recordedError) {
    throw new Error(`Failed to fetch recorded count: ${recordedError.message}`)
  }

  const { count: publishedCount, error: publishedError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')

  if (publishedError) {
    throw new Error(`Failed to fetch published count: ${publishedError.message}`)
  }

  return {
    totalBookings: totalBookings || 0,
    booked: bookedCount || 0,
    inProgress: inProgressCount || 0,
    recorded: recordedCount || 0,
    published: publishedCount || 0,
  }
}

/**
 * Get client booking stats
 */
export async function getClientBookingStats(clientId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('status')
    .eq('client_id', clientId)

  if (error) {
    throw new Error(`Failed to fetch client bookings: ${error.message}`)
  }

  const stats = {
    total: data.length,
    booked: data.filter(b => b.status === 'booked').length,
    inProgress: data.filter(b => b.status === 'in_progress').length,
    recorded: data.filter(b => b.status === 'recorded').length,
    published: data.filter(b => b.status === 'published').length,
  }

  return stats
}
