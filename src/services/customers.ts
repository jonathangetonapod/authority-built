import { supabase } from '@/lib/supabase'

export interface Customer {
  id: string
  email: string
  full_name: string
  stripe_customer_id: string | null
  total_orders: number
  total_spent: number
  created_at: string
  updated_at: string
}

export interface CustomerWithOrders extends Customer {
  orders: Order[]
}

export interface Order {
  id: string
  customer_id: string
  stripe_checkout_session_id: string
  stripe_payment_intent_id: string | null
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  total_amount: number
  currency: string
  customer_email: string
  customer_name: string
  created_at: string
  updated_at: string
  paid_at: string | null
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  premium_podcast_id: string
  podcast_name: string
  podcast_image_url: string | null
  price_at_purchase: number
  quantity: number
  created_at: string
}

/**
 * Get all customers with pagination and optional search
 */
export async function getCustomers(options?: {
  search?: string
  limit?: number
  offset?: number
  orderBy?: 'created_at' | 'total_spent' | 'total_orders'
  orderDirection?: 'asc' | 'desc'
}) {
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })

  // Search by name or email
  if (options?.search) {
    query = query.or(`email.ilike.%${options.search}%,full_name.ilike.%${options.search}%`)
  }

  // Order by
  const orderBy = options?.orderBy || 'created_at'
  const orderDirection = options?.orderDirection || 'desc'
  query = query.order(orderBy, { ascending: orderDirection === 'asc' })

  // Pagination
  if (options?.limit) {
    query = query.limit(options.limit)
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
  }

  const { data, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch customers: ${error.message}`)
  }

  return { customers: data as Customer[], total: count || 0 }
}

/**
 * Get a single customer by ID with their orders
 */
export async function getCustomerById(customerId: string) {
  const { data, error } = await supabase
    .from('customers')
    .select(`
      *,
      orders (
        *,
        order_items (*)
      )
    `)
    .eq('id', customerId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch customer: ${error.message}`)
  }

  return data as CustomerWithOrders
}

/**
 * Get customer statistics
 */
export async function getCustomerStats() {
  // Total customers
  const { count: totalCustomers, error: customersError } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })

  if (customersError) {
    throw new Error(`Failed to fetch customer count: ${customersError.message}`)
  }

  // Total revenue (sum of all paid orders)
  const { data: revenueData, error: revenueError } = await supabase
    .from('orders')
    .select('total_amount')
    .eq('status', 'paid')

  if (revenueError) {
    throw new Error(`Failed to fetch revenue: ${revenueError.message}`)
  }

  const totalRevenue = revenueData?.reduce((sum, order) => sum + parseFloat(order.total_amount as any), 0) || 0

  // Average order value
  const { count: paidOrderCount, error: ordersError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid')

  if (ordersError) {
    throw new Error(`Failed to fetch order count: ${ordersError.message}`)
  }

  const avgOrderValue = paidOrderCount && paidOrderCount > 0 ? totalRevenue / paidOrderCount : 0

  return {
    totalCustomers: totalCustomers || 0,
    totalRevenue,
    avgOrderValue,
    totalOrders: paidOrderCount || 0,
  }
}

/**
 * Search customers by email or name
 */
export async function searchCustomers(searchTerm: string) {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .or(`email.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new Error(`Failed to search customers: ${error.message}`)
  }

  return data as Customer[]
}
