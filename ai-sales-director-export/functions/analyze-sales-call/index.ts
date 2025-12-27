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
    const { sales_call_id, recording_id: requestRecordingId } = await req.json()

    if (!sales_call_id) {
      throw new Error('sales_call_id is required')
    }

    const fathomApiKey = Deno.env.get('FATHOM_API_KEY')
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!fathomApiKey) {
      throw new Error('FATHOM_API_KEY not configured')
    }

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Analyze Call] Analyzing sales call ${sales_call_id}`)

    // Get the sales call from database
    const { data: salesCall, error: fetchError } = await supabase
      .from('sales_calls')
      .select('*')
      .eq('id', sales_call_id)
      .single()

    if (fetchError || !salesCall) {
      throw new Error('Sales call not found')
    }

    // Use recording_id from request or fallback to database value
    const recording_id = requestRecordingId || salesCall.recording_id

    if (!recording_id) {
      throw new Error('recording_id not found')
    }

    // Fetch full transcript from Fathom if not already stored
    let transcript = salesCall.transcript

    if (!transcript) {
      console.log(`[Analyze Call] Fetching transcript from Fathom for recording ${recording_id}`)
      const transcriptResponse = await fetch(
        `https://api.fathom.ai/external/v1/recordings/${recording_id}/transcript`,
        {
          headers: {
            'X-Api-Key': fathomApiKey,
          },
        }
      )

      if (transcriptResponse.ok) {
        const transcriptData = await transcriptResponse.json()
        transcript = transcriptData.transcript

        // Update the sales call with transcript
        await supabase
          .from('sales_calls')
          .update({ transcript })
          .eq('id', sales_call_id)
      } else {
        const errorText = await transcriptResponse.text()
        console.error('[Analyze Call] Failed to fetch transcript from Fathom:', errorText)
        throw new Error(`Failed to fetch transcript from Fathom: ${transcriptResponse.status}`)
      }
    }

    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for analysis. The call may still be processing in Fathom.')
    }

    // Build transcript text for AI analysis
    const transcriptText = transcript
      .map((entry: any) => `${entry.speaker.display_name}: ${entry.text}`)
      .join('\n')

    console.log(`[Analyze Call] Sending transcript to Claude for analysis (${transcript.length} messages)`)

    // Analyze with Claude API using Corey Jackson's Framework
    const analysisPrompt = `You are an expert sales coach analyzing a sales call transcript based on COREY JACKSON'S SCALABLE SALES FRAMEWORK.

FRAMEWORK OVERVIEW:
1. INTRO + FRAME CONTROL (60-90 seconds) - Set tone, establish authority, confirm timing
2. DISCOVERY PHASE - Find the gap
   a) Current State - Where are they now?
   b) Desired State - Where do they want to be?
   c) Cost of Inaction - What's it costing them to stay stuck?
   d) Consequences of Not Solving - Long-term impact
3. WATT TIE-DOWNS - Micro-commitments building YES momentum
4. BRIDGE THE GAP - Position offer as solution to gap
5. SELLBACK - Let them talk themselves into it
6. PRICE DROP - Minimize and pause after revealing price
7. OBJECTION HANDLING - Every fear is an info gap
8. CLOSE & CELEBRATE - Take payment, celebrate the win

Transcript:
${transcriptText}

Analyze this sales call based on the Corey Jackson Framework and provide a JSON response:
{
  "overall_score": <number 0-10>,
  "framework_adherence_score": <number 0-10>,

  "frame_control_score": <number 0-10>,
  "discovery_current_state_score": <number 0-10>,
  "discovery_desired_state_score": <number 0-10>,
  "discovery_cost_of_inaction_score": <number 0-10>,
  "watt_tiedowns_score": <number 0-10>,
  "bridge_gap_score": <number 0-10>,
  "sellback_score": <number 0-10>,
  "price_drop_score": <number 0-10>,
  "objection_handling_score": <number 0-10>,
  "close_celebration_score": <number 0-10>,

  "discovery_score": <number 0-10>,
  "closing_score": <number 0-10>,
  "engagement_score": <number 0-10>,

  "talk_listen_ratio": {
    "talk": <percentage as integer>,
    "listen": <percentage as integer>
  },
  "questions_asked_count": <number>,

  "framework_insights": {
    "frame_control": {
      "present": <boolean>,
      "feedback": "What was done well or missed"
    },
    "discovery": {
      "current_state_explored": <boolean>,
      "desired_state_identified": <boolean>,
      "cost_of_inaction_discussed": <boolean>,
      "consequences_explored": <boolean>,
      "gap_size": "large|medium|small|none",
      "feedback": "Overall discovery feedback"
    },
    "watt_tiedowns": {
      "used": <boolean>,
      "count": <number>,
      "effectiveness": "high|medium|low",
      "feedback": "Tie-down feedback"
    },
    "bridge_gap": {
      "offer_positioned_as_bridge": <boolean>,
      "recapped_gap": <boolean>,
      "feedback": "Bridge feedback"
    },
    "sellback": {
      "prospect_sold_themselves": <boolean>,
      "feedback": "Sellback feedback"
    },
    "price_drop": {
      "minimized_price": <boolean>,
      "paused_after_drop": <boolean>,
      "feedback": "Price handling feedback"
    },
    "objection_handling": {
      "objections_encountered": <boolean>,
      "framework_followed": <boolean>,
      "asked_for_money_again": <boolean>,
      "feedback": "Objection handling feedback"
    },
    "close": {
      "closed": <boolean>,
      "celebrated": <boolean>,
      "next_steps_confirmed": <boolean>,
      "feedback": "Close feedback"
    }
  },

  "recommendations": [
    {
      "priority": "high|medium|low",
      "framework_stage": "frame_control|discovery|watt_tiedowns|bridge_gap|sellback|price_drop|objection_handling|close",
      "title": "Brief title",
      "description": "Detailed recommendation based on framework",
      "specific_timestamp": "Optional timestamp reference"
    }
  ],

  "strengths": [
    "List of strengths with framework stage references"
  ],

  "weaknesses": [
    "List of areas for improvement with framework stage references"
  ],

  "key_moments": [
    {
      "timestamp": "HH:MM:SS or approximate",
      "framework_stage": "frame_control|discovery|watt_tiedowns|bridge_gap|sellback|price_drop|objection_handling|close",
      "type": "positive|negative|neutral",
      "description": "What happened at this moment"
    }
  ],

  "sentiment_analysis": {
    "overall_sentiment": "positive|neutral|negative",
    "prospect_engagement": "high|medium|low",
    "confidence_level": "high|medium|low"
  }
}

SCORING GUIDELINES:
- Frame Control (0-10): Did they set the tone in 60-90 seconds? Confirm timing? Get permission?
- Discovery Current State (0-10): How well did they understand where prospect is now?
- Discovery Desired State (0-10): How clearly did they identify the goal?
- Discovery Cost of Inaction (0-10): How effectively did they uncover pain of staying stuck?
- WATT Tie-downs (0-10): How well did they build YES momentum with micro-commitments?
- Bridge Gap (0-10): How effectively was offer positioned as bridge to desired state?
- Sellback (0-10): Did prospect talk themselves into the solution?
- Price Drop (0-10): Was price minimized and followed by silence?
- Objection Handling (0-10): Framework followed? Asked for money again?
- Close & Celebrate (0-10): Did they take payment? Celebrate with prospect?

Be specific, actionable, and reference actual moments from the call.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
      }),
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('[Analyze Call] Claude API error:', errorText)
      throw new Error(`Claude API error: ${claudeResponse.status}`)
    }

    const claudeData = await claudeResponse.json()
    const analysisText = claudeData.content[0].text

    console.log('[Analyze Call] Received analysis from Claude')

    // Parse the JSON response from Claude
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Analyze Call] No JSON found in response. Response text:', analysisText)
      throw new Error('Failed to parse JSON from Claude response')
    }

    let analysis
    try {
      analysis = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      console.error('[Analyze Call] JSON parse error:', parseError)
      console.error('[Analyze Call] Attempted to parse:', jsonMatch[0])
      throw new Error('Invalid JSON in Claude response')
    }

    console.log('[Analyze Call] Parsed analysis, preparing to store in database')

    // Delete existing analysis if it exists (for re-analysis)
    const { error: deleteError } = await supabase
      .from('sales_call_analysis')
      .delete()
      .eq('sales_call_id', sales_call_id)

    if (deleteError) {
      console.log('[Analyze Call] No existing analysis to delete or delete failed:', deleteError)
    } else {
      console.log('[Analyze Call] Deleted existing analysis for re-analysis')
    }

    // Store analysis in database (with optional framework fields)
    const { error: insertError } = await supabase
      .from('sales_call_analysis')
      .insert({
        sales_call_id: sales_call_id,
        overall_score: analysis.overall_score || 0,
        framework_adherence_score: analysis.framework_adherence_score || null,

        // Corey Jackson Framework scores (optional)
        frame_control_score: analysis.frame_control_score || null,
        discovery_current_state_score: analysis.discovery_current_state_score || null,
        discovery_desired_state_score: analysis.discovery_desired_state_score || null,
        discovery_cost_of_inaction_score: analysis.discovery_cost_of_inaction_score || null,
        watt_tiedowns_score: analysis.watt_tiedowns_score || null,
        bridge_gap_score: analysis.bridge_gap_score || null,
        sellback_score: analysis.sellback_score || null,
        price_drop_score: analysis.price_drop_score || null,
        close_celebration_score: analysis.close_celebration_score || null,

        // General scores (kept for backwards compatibility)
        discovery_score: analysis.discovery_score || 0,
        objection_handling_score: analysis.objection_handling_score || 0,
        closing_score: analysis.closing_score || 0,
        engagement_score: analysis.engagement_score || 0,

        talk_listen_ratio_talk: analysis.talk_listen_ratio?.talk || 50,
        talk_listen_ratio_listen: analysis.talk_listen_ratio?.listen || 50,
        questions_asked_count: analysis.questions_asked_count || 0,

        framework_insights: analysis.framework_insights || null,
        recommendations: analysis.recommendations || [],
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        key_moments: analysis.key_moments || [],
        sentiment_analysis: analysis.sentiment_analysis || null,
      })

    if (insertError) {
      console.error('[Analyze Call] Error storing analysis:', insertError)
      throw insertError
    }

    console.log(`[Analyze Call] Analysis complete for call ${sales_call_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Call analyzed successfully',
        data: analysis,
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
    console.error('[Analyze Call] Error:', error)

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
