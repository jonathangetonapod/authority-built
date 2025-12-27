import { supabase } from '@/lib/supabase'

export interface Client {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  website: string | null
  calendar_link: string | null
  contact_person: string | null
  first_invoice_paid_date: string | null
  status: 'active' | 'paused' | 'churned'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ClientWithStats extends Client {
  total_bookings: number
  booked_count: number
  in_progress_count: number
  recorded_count: number
  published_count: number
}

/**
 * Get all clients with optional filtering
 */
export async function getClients(options?: {
  search?: string
  status?: 'active' | 'paused' | 'churned'
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
  }

  // Search by name or email
  if (options?.search) {
    query = query.or(`name.ilike.%${options.search}%,email.ilike.%${options.search}%`)
  }

  // Order by name
  query = query.order('name', { ascending: true })

  // Pagination
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch clients: ${error.message}`)
  }

  return { clients: data as Client[], total: count || 0 }
}

/**
 * Get a single client by ID
 */
export async function getClientById(clientId: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch client: ${error.message}`)
  }

  return data as Client
}

/**
 * Create a new client
 */
export async function createClient(input: {
  name: string
  email?: string
  linkedin_url?: string
  website?: string
  calendar_link?: string
  contact_person?: string
  first_invoice_paid_date?: string
  status?: 'active' | 'paused' | 'churned'
  notes?: string
}) {
  const { data, error } = await supabase
    .from('clients')
    .insert([input])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`)
  }

  return data as Client
}

/**
 * Update an existing client
 */
export async function updateClient(clientId: string, updates: Partial<Client>) {
  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update client: ${error.message}`)
  }

  return data as Client
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)

  if (error) {
    throw new Error(`Failed to delete client: ${error.message}`)
  }
}

/**
 * Get client statistics
 */
export async function getClientStats() {
  // Total clients
  const { count: totalClients, error: clientsError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })

  if (clientsError) {
    throw new Error(`Failed to fetch client count: ${clientsError.message}`)
  }

  // Active clients
  const { count: activeClients, error: activeError } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (activeError) {
    throw new Error(`Failed to fetch active client count: ${activeError.message}`)
  }

  // Total bookings
  const { count: totalBookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })

  if (bookingsError) {
    throw new Error(`Failed to fetch bookings count: ${bookingsError.message}`)
  }

  return {
    totalClients: totalClients || 0,
    activeClients: activeClients || 0,
    totalBookings: totalBookings || 0,
  }
}
