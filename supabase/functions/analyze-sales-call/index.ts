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
    const { sales_call_id, recording_id } = await req.json()

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

    // Fetch full transcript from Fathom if not already stored
    let transcript = salesCall.transcript

    if (!transcript && recording_id) {
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
      }
    }

    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for analysis')
    }

    // Build transcript text for AI analysis
    const transcriptText = transcript
      .map((entry: any) => `${entry.speaker.display_name}: ${entry.text}`)
      .join('\n')

    console.log(`[Analyze Call] Sending transcript to Claude for analysis (${transcript.length} messages)`)

    // Analyze with Claude API
    const analysisPrompt = `You are an expert sales coach analyzing a sales call transcript. Provide a detailed analysis with scores and recommendations.

Transcript:
${transcriptText}

Please analyze this sales call and provide a JSON response with the following structure:
{
  "overall_score": <number 0-10>,
  "discovery_score": <number 0-10>,
  "objection_handling_score": <number 0-10>,
  "closing_score": <number 0-10>,
  "engagement_score": <number 0-10>,
  "talk_listen_ratio": {
    "talk": <percentage as integer>,
    "listen": <percentage as integer>
  },
  "questions_asked_count": <number>,
  "recommendations": [
    {
      "priority": "high|medium|low",
      "title": "Brief title",
      "description": "Detailed recommendation",
      "specific_timestamp": "Optional timestamp reference"
    }
  ],
  "strengths": [
    "List of strengths observed"
  ],
  "weaknesses": [
    "List of areas for improvement"
  ],
  "key_moments": [
    {
      "timestamp": "HH:MM:SS or approximate",
      "type": "discovery|objection|closing|other",
      "description": "What happened at this moment"
    }
  ],
  "sentiment_analysis": {
    "overall_sentiment": "positive|neutral|negative",
    "prospect_engagement": "high|medium|low",
    "confidence_level": "high|medium|low"
  }
}

Be specific and actionable in your recommendations. Reference actual moments from the call when possible.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
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
      throw new Error('Failed to parse JSON from Claude response')
    }

    const analysis = JSON.parse(jsonMatch[0])

    // Store analysis in database
    const { error: insertError } = await supabase
      .from('sales_call_analysis')
      .insert({
        sales_call_id: sales_call_id,
        overall_score: analysis.overall_score,
        discovery_score: analysis.discovery_score,
        objection_handling_score: analysis.objection_handling_score,
        closing_score: analysis.closing_score,
        engagement_score: analysis.engagement_score,
        talk_listen_ratio_talk: analysis.talk_listen_ratio.talk,
        talk_listen_ratio_listen: analysis.talk_listen_ratio.listen,
        questions_asked_count: analysis.questions_asked_count,
        recommendations: analysis.recommendations,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        key_moments: analysis.key_moments,
        sentiment_analysis: analysis.sentiment_analysis,
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
