import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!stripeSecretKey || !stripeWebhookSecret) {
      throw new Error('Stripe keys not configured')
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase keys not configured')
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Stripe signature from headers
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      console.error('❌ No Stripe signature found in headers')
      throw new Error('No Stripe signature found')
    }

    // Get raw body as text (required for signature verification)
    const body = await req.text()

    console.log('🔍 Verifying webhook signature...')
    console.log('📝 Body length:', body.length)
    console.log('🔐 Signature present:', !!signature)
    console.log('🔑 Webhook secret configured:', !!stripeWebhookSecret)

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret)
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message)
      console.error('📊 Error details:', err)
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification failed', details: err.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Webhook verified:', event.type)

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        console.log('💳 Processing completed checkout session:', session.id)

        // Check if this is an addon order
        if (session.metadata?.type === 'addon_order') {
          console.log('🎁 Processing addon order')

          const { bookingId, serviceId, clientId } = session.metadata

          if (!bookingId || !serviceId || !clientId) {
            console.error('❌ Missing addon order metadata')
            break
          }

          // Check if addon already exists (idempotency)
          const { data: existingAddon } = await supabase
            .from('booking_addons')
            .select('id')
            .eq('booking_id', bookingId)
            .eq('service_id', serviceId)
            .single()

          if (existingAddon) {
            console.log('♻️ Addon order already exists:', existingAddon.id)
            break
          }

          // Create addon order
          const { data: addonOrder, error: addonError } = await supabase
            .from('booking_addons')
            .insert({
              booking_id: bookingId,
              service_id: serviceId,
              client_id: clientId,
              stripe_payment_intent_id: session.payment_intent as string,
              amount_paid_cents: session.amount_total || 0,
              status: 'pending',
              purchased_at: new Date().toISOString(),
            })
            .select()
            .single()

          if (addonError) {
            console.error('❌ Error creating addon order:', addonError)
            throw addonError
          }

          console.log('✅ Addon order created:', addonOrder.id)
          break
        }

        // Regular premium placement order processing

        // Extract customer data
        const customerEmail = session.customer_email || session.metadata?.customerEmail
        const customerName = session.metadata?.customerName

        if (!customerEmail || !customerName) {
          console.error('❌ Missing customer data in session')
          break
        }

        // Create or get customer
        let customerId: string

        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id')
          .eq('email', customerEmail)
          .single()

        if (existingCustomer) {
          // Update existing customer
          customerId = existingCustomer.id

          await supabase
            .from('customers')
            .update({
              stripe_customer_id: session.customer as string,
              updated_at: new Date().toISOString(),
            })
            .eq('id', customerId)

          console.log('📝 Updated existing customer:', customerId)
        } else {
          // Create new customer
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              email: customerEmail,
              full_name: customerName,
              stripe_customer_id: session.customer as string,
            })
            .select('id')
            .single()

          if (customerError) {
            console.error('❌ Error creating customer:', customerError)
            throw customerError
          }

          customerId = newCustomer.id
          console.log('✨ Created new customer:', customerId)
        }

        // Check if order already exists (idempotency)
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('stripe_checkout_session_id', session.id)
          .single()

        let orderId: string

        if (existingOrder) {
          // Order already exists, use it
          orderId = existingOrder.id
          console.log('♻️ Order already exists:', orderId)

          // Delete existing order items to recreate them
          await supabase
            .from('order_items')
            .delete()
            .eq('order_id', orderId)

          console.log('🗑️ Deleted existing order items for retry')
        } else {
          // Create new order
          const totalAmount = (session.amount_total || 0) / 100 // Convert from cents

          const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
              customer_id: customerId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string,
              status: 'paid',
              total_amount: totalAmount,
              currency: session.currency || 'usd',
              customer_email: customerEmail,
              customer_name: customerName,
              paid_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (orderError) {
            console.error('❌ Error creating order:', orderError)
            throw orderError
          }

          orderId = order.id
          console.log('📦 Created order:', orderId)
        }

        // Get line items from Stripe
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product'],
        })

        // Parse cart item IDs from metadata
        let cartItemIds: string[] = []
        try {
          if (session.metadata?.cartItemIds) {
            cartItemIds = JSON.parse(session.metadata.cartItemIds)
            console.log('📋 Parsed cart item IDs:', cartItemIds)
          }
        } catch (error) {
          console.error('❌ Failed to parse cartItemIds from metadata:', error)
        }

        // Create order items
        const orderItems = lineItems.data.map((item, index) => {
          const product = item.price?.product as Stripe.Product
          const podcastId = cartItemIds[index] || null

          if (!podcastId) {
            console.error('⚠️ No podcast ID found for line item', index)
          }

          return {
            order_id: orderId,
            premium_podcast_id: podcastId,
            podcast_name: item.description || product?.name || 'Unknown',
            podcast_image_url: product?.images?.[0] || null,
            price_at_purchase: (item.amount_total || 0) / 100,
            quantity: item.quantity || 1,
          }
        })

        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems)

        if (itemsError) {
          console.error('❌ Error creating order items:', itemsError)
          throw itemsError
        }

        console.log('📋 Created', orderItems.length, 'order items')

        // Update customer stats
        const { data: customerStats } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('customer_id', customerId)
          .eq('status', 'paid')

        if (customerStats) {
          const totalOrders = customerStats.length
          const totalSpent = customerStats.reduce((sum, order) => sum + parseFloat(order.total_amount), 0)

          await supabase
            .from('customers')
            .update({
              total_orders: totalOrders,
              total_spent: totalSpent,
            })
            .eq('id', customerId)

          console.log('📊 Updated customer stats: orders =', totalOrders, ', spent = $', totalSpent)
        }

        console.log('✅ Order processing complete!')
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('❌ Payment failed:', paymentIntent.id)

        // Update order status to failed (if order exists)
        await supabase
          .from('orders')
          .update({ status: 'failed' })
          .eq('stripe_payment_intent_id', paymentIntent.id)

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        console.log('💸 Charge refunded:', charge.id)

        // Update order status to refunded
        if (charge.payment_intent) {
          await supabase
            .from('orders')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', charge.payment_intent as string)
        }

        break
      }

      default:
        console.log('ℹ️ Unhandled event type:', event.type)
    }

    // Return success response
    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('❌ Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Webhook processing failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
