import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'
import type { CartItem } from '@/stores/cartStore'

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

/**
 * Create a Stripe Checkout Session via Supabase Edge Function
 */
export const createCheckoutSession = async (
  cartItems: CartItem[],
  customerEmail: string,
  customerName: string
): Promise<{ sessionId: string; url: string }> => {
  try {
    console.log('🛒 Creating checkout session for', cartItems.length, 'items')

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        cartItems,
        customerEmail,
        customerName,
      },
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
      throw new Error(error.message || 'Failed to create checkout session')
    }

    if (!data || !data.sessionId || !data.url) {
      throw new Error('Invalid response from checkout session creation')
    }

    console.log('✅ Checkout session created:', data.sessionId)
    return data
  } catch (error) {
    console.error('❌ Failed to create checkout session:', error)
    throw error
  }
}

/**
 * Redirect to Stripe Checkout
 */
export const redirectToCheckout = async (sessionId: string): Promise<void> => {
  try {
    const stripe = await stripePromise

    if (!stripe) {
      throw new Error('Stripe failed to load')
    }

    console.log('🔄 Redirecting to Stripe Checkout:', sessionId)

    const { error } = await stripe.redirectToCheckout({ sessionId })

    if (error) {
      console.error('❌ Redirect error:', error)
      throw error
    }
  } catch (error) {
    console.error('❌ Failed to redirect to checkout:', error)
    throw error
  }
}

/**
 * Retrieve checkout session details
 * (For success page to display order confirmation)
 */
export const getCheckoutSession = async (sessionId: string) => {
  try {
    // Note: In production, you'd call a Supabase Edge Function to retrieve this
    // securely from Stripe's API. For now, we'll just return the sessionId
    // since the webhook handles creating the order.

    return { sessionId }
  } catch (error) {
    console.error('❌ Failed to get checkout session:', error)
    throw error
  }
}

/**
 * Create a Stripe Checkout Session for addon service purchase
 */
export const createAddonCheckoutSession = async (
  bookingId: string,
  serviceId: string,
  clientId: string
): Promise<{ sessionId: string; url: string }> => {
  try {
    console.log('🛒 Creating addon checkout session for booking:', bookingId, 'service:', serviceId)

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-addon-checkout', {
      body: {
        bookingId,
        serviceId,
        clientId,
      },
    })

    if (error) {
      console.error('❌ Edge Function error:', error)
      throw new Error(error.message || 'Failed to create addon checkout session')
    }

    if (!data || !data.sessionId || !data.url) {
      throw new Error('Invalid response from addon checkout session creation')
    }

    console.log('✅ Addon checkout session created:', data.sessionId)
    return data
  } catch (error) {
    console.error('❌ Failed to create addon checkout session:', error)
    throw error
  }
}
