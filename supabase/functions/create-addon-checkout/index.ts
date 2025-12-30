import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  bookingId: string
  serviceId: string
  clientId: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured')
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase keys not configured')
    }

    // Initialize Stripe and Supabase
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { bookingId, serviceId, clientId }: RequestBody = await req.json()

    // Validate input
    if (!bookingId || !serviceId || !clientId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bookingId, serviceId, clientId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('Creating addon checkout for client:', clientId, 'booking:', bookingId, 'service:', serviceId)

    // Fetch service details
    const { data: service, error: serviceError } = await supabase
      .from('addon_services')
      .select('*')
      .eq('id', serviceId)
      .single()

    if (serviceError || !service) {
      return new Response(
        JSON.stringify({ error: 'Service not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('podcast_name, podcast_image_url')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Fetch client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('name, email')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if this addon already exists
    const { data: existingAddon } = await supabase
      .from('booking_addons')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('service_id', serviceId)
      .single()

    if (existingAddon) {
      return new Response(
        JSON.stringify({ error: 'This service has already been purchased for this episode' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Get origin for redirect URLs
    const origin = req.headers.get('origin') || 'http://localhost:8080'

    console.log('Service:', service.name, 'Price:', service.price_cents, 'cents')

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: client.email || undefined,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: service.name,
            images: booking.podcast_image_url ? [booking.podcast_image_url] : [],
            description: `${service.short_description || service.name} for ${booking.podcast_name}`,
          },
          unit_amount: service.price_cents,
        },
        quantity: 1,
      }],
      success_url: `${origin}/portal/dashboard?addon_purchase=success`,
      cancel_url: `${origin}/portal/dashboard?addon_purchase=canceled`,
      metadata: {
        type: 'addon_order',
        bookingId,
        serviceId,
        clientId,
        clientName: client.name,
        clientEmail: client.email || '',
        podcastName: booking.podcast_name,
      },
      payment_intent_data: {
        metadata: {
          type: 'addon_order',
          bookingId,
          serviceId,
          clientId,
        },
      },
    })

    console.log('✅ Addon checkout session created:', session.id)

    // Return session data
    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('❌ Error creating addon checkout session:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create checkout session' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
