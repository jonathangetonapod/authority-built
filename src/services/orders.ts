import { supabase } from '@/lib/supabase'
import type { Order, OrderItem } from './customers'

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}

/**
 * Get all orders with pagination and optional filters
 */
export async function getOrders(options?: {
  customerId?: string
  status?: Order['status']
  limit?: number
  offset?: number
  orderBy?: 'created_at' | 'total_amount' | 'paid_at'
  orderDirection?: 'asc' | 'desc'
}) {
  let query = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })

  // Filter by customer
  if (options?.customerId) {
    query = query.eq('customer_id', options.customerId)
  }

  // Filter by status
  if (options?.status) {
    query = query.eq('status', options.status)
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
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return { orders: data as OrderWithItems[], total: count || 0 }
}

/**
 * Get a single order by ID with items
 */
export async function getOrderById(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('id', orderId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch order: ${error.message}`)
  }

  return data as OrderWithItems
}

/**
 * Get recent orders (for dashboard)
 */
export async function getRecentOrders(limit: number = 5) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch recent orders: ${error.message}`)
  }

  return data as OrderWithItems[]
}

/**
 * Get order statistics
 */
export async function getOrderStats() {
  // Total orders
  const { count: totalOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })

  if (ordersError) {
    throw new Error(`Failed to fetch order count: ${ordersError.message}`)
  }

  // Paid orders
  const { count: paidOrders, error: paidError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'paid')

  if (paidError) {
    throw new Error(`Failed to fetch paid order count: ${paidError.message}`)
  }

  // Pending orders
  const { count: pendingOrders, error: pendingError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (pendingError) {
    throw new Error(`Failed to fetch pending order count: ${pendingError.message}`)
  }

  // Failed orders
  const { count: failedOrders, error: failedError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')

  if (failedError) {
    throw new Error(`Failed to fetch failed order count: ${failedError.message}`)
  }

  return {
    totalOrders: totalOrders || 0,
    paidOrders: paidOrders || 0,
    pendingOrders: pendingOrders || 0,
    failedOrders: failedOrders || 0,
  }
}

/**
 * Get order items for a specific order
 */
export async function getOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch order items: ${error.message}`)
  }

  return data as OrderItem[]
}
