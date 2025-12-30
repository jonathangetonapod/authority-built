import { supabase } from '@/lib/supabase'

export interface AddonService {
  id: string
  name: string
  description: string
  short_description: string | null
  price_cents: number
  stripe_product_id: string | null
  stripe_price_id: string | null
  active: boolean
  features: string[]
  delivery_days: number
  created_at: string
  updated_at: string
}

export interface BookingAddon {
  id: string
  booking_id: string
  service_id: string
  client_id: string
  stripe_payment_intent_id: string | null
  amount_paid_cents: number
  status: 'pending' | 'in_progress' | 'delivered' | 'cancelled'
  google_drive_url: string | null
  admin_notes: string | null
  purchased_at: string
  delivered_at: string | null
  created_at: string
  updated_at: string
  // Joined data
  service?: AddonService
  booking?: {
    id: string
    podcast_name: string
    podcast_image_url: string | null
    host_name: string | null
    publish_date: string | null
  }
  client?: {
    id: string
    name: string
    email: string | null
  }
}

/**
 * Get all active addon services
 */
export async function getActiveAddonServices(): Promise<AddonService[]> {
  const { data, error } = await supabase
    .from('addon_services')
    .select('*')
    .eq('active', true)
    .order('price_cents', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch addon services: ${error.message}`)
  }

  return data as AddonService[]
}

/**
 * Get a specific addon service by ID
 */
export async function getAddonServiceById(serviceId: string): Promise<AddonService> {
  const { data, error } = await supabase
    .from('addon_services')
    .select('*')
    .eq('id', serviceId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch addon service: ${error.message}`)
  }

  return data as AddonService
}

/**
 * Get addons for a specific booking
 */
export async function getBookingAddons(bookingId: string): Promise<BookingAddon[]> {
  const { data, error } = await supabase
    .from('booking_addons')
    .select(`
      *,
      service:addon_services(*)
    `)
    .eq('booking_id', bookingId)
    .order('purchased_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch booking addons: ${error.message}`)
  }

  return data as BookingAddon[]
}

/**
 * Get all addons for a client
 */
export async function getClientAddons(clientId: string): Promise<BookingAddon[]> {
  const { data, error } = await supabase
    .from('booking_addons')
    .select(`
      *,
      service:addon_services(*),
      booking:bookings(*)
    `)
    .eq('client_id', clientId)
    .order('purchased_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch client addons: ${error.message}`)
  }

  return data as BookingAddon[]
}

/**
 * Check if a booking already has a specific addon
 */
export async function hasBookingAddon(bookingId: string, serviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('booking_addons')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('service_id', serviceId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to check booking addon: ${error.message}`)
  }

  return data !== null
}

/**
 * Create a booking addon purchase record (called after Stripe payment)
 */
export async function createBookingAddon(input: {
  bookingId: string
  serviceId: string
  clientId: string
  stripePaymentIntentId: string
  amountPaidCents: number
}): Promise<BookingAddon> {
  const { data, error } = await supabase
    .from('booking_addons')
    .insert([{
      booking_id: input.bookingId,
      service_id: input.serviceId,
      client_id: input.clientId,
      stripe_payment_intent_id: input.stripePaymentIntentId,
      amount_paid_cents: input.amountPaidCents,
      status: 'pending'
    }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create booking addon: ${error.message}`)
  }

  return data as BookingAddon
}

/**
 * Update booking addon status (Admin only)
 */
export async function updateBookingAddonStatus(
  addonId: string,
  status: BookingAddon['status'],
  googleDriveUrl?: string,
  adminNotes?: string
): Promise<BookingAddon> {
  const updates: any = {
    status,
    ...(googleDriveUrl && { google_drive_url: googleDriveUrl }),
    ...(adminNotes !== undefined && { admin_notes: adminNotes })
  }

  // Set delivered_at timestamp when marking as delivered
  if (status === 'delivered' && !updates.delivered_at) {
    updates.delivered_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('booking_addons')
    .update(updates)
    .eq('id', addonId)
    .select(`
      *,
      service:addon_services(*)
    `)
    .single()

  if (error) {
    throw new Error(`Failed to update booking addon: ${error.message}`)
  }

  return data as BookingAddon
}

/**
 * Get all booking addons (Admin only)
 */
export async function getAllBookingAddons(): Promise<BookingAddon[]> {
  const { data, error } = await supabase
    .from('booking_addons')
    .select(`
      *,
      service:addon_services(*),
      booking:bookings(id, podcast_name, podcast_image_url, host_name, publish_date),
      client:clients(id, name, email)
    `)
    .order('purchased_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch all booking addons: ${error.message}`)
  }

  return data as BookingAddon[]
}

/**
 * Format price in cents to dollars
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

/**
 * Get status badge color
 */
export function getAddonStatusColor(status: BookingAddon['status']) {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'delivered':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

/**
 * Get status display text
 */
export function getAddonStatusText(status: BookingAddon['status']) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'in_progress':
      return 'In Progress'
    case 'delivered':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}
