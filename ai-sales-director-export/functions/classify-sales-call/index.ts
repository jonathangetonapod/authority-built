import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sales_call_id } = await req.json()

    if (!sales_call_id) {
      throw new Error('sales_call_id is required')
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Classify Call] Classifying sales call ${sales_call_id}`)

    // Get the sales call from database
    const { data: salesCall, error: fetchError } = await supabase
      .from('sales_calls')
      .select('*')
      .eq('id', sales_call_id)
      .single()

    if (fetchError || !salesCall) {
      throw new Error('Sales call not found')
    }

    // Use title, meeting_title, and summary for quick classification
    const title = salesCall.title || salesCall.meeting_title || 'Untitled'
    const summary = salesCall.summary || 'No summary available'

    console.log(`[Classify Call] Classifying "${title}" using Haiku`)

    // Quick classification with Haiku
    const classificationPrompt = `You are a meeting classifier. Determine if this is a SALES CALL or NOT a sales call.

Meeting Title: ${title}
Meeting Summary: ${summary}

A SALES CALL is any meeting where:
- Discussing products/services with prospects or customers
- Demo or presentation to potential buyers
- Discovery call with leads
- Closing or negotiation discussions
- Follow-up with potential customers

NOT a sales call includes:
- Internal team meetings
- 1-on-1s with colleagues
- Planning or strategy sessions
- Technical discussions between teammates
- All-hands or company meetings

Respond with ONLY one word: either "SALES" or "NON-SALES"`

    const haikuResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: classificationPrompt,
          },
        ],
      }),
    })

    if (!haikuResponse.ok) {
      const errorText = await haikuResponse.text()
      console.error('[Classify Call] Haiku API error:', errorText)
      throw new Error(`Haiku API error: ${haikuResponse.status}`)
    }

    const haikuData = await haikuResponse.json()
    const classificationText = haikuData.content[0].text.trim().toUpperCase()

    console.log(`[Classify Call] Classification result: ${classificationText}`)

    // Determine call type
    const callType = classificationText.includes('SALES') ? 'sales' : 'non-sales'

    // Update the sales call with classification
    const { error: updateError } = await supabase
      .from('sales_calls')
      .update({ call_type: callType })
      .eq('id', sales_call_id)

    if (updateError) {
      console.error('[Classify Call] Error updating call:', updateError)
      throw updateError
    }

    console.log(`[Classify Call] Call classified as: ${callType}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Call classified as ${callType}`,
        data: {
          call_type: callType,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Classify Call] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
