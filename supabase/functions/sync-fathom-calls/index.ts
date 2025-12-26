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
    const fathomApiKey = Deno.env.get('FATHOM_API_KEY')
    if (!fathomApiKey) {
      throw new Error('FATHOM_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[Sync Fathom] Fetching meetings from Fathom API...')

    // Fetch meetings from Fathom
    const meetingsResponse = await fetch(
      'https://api.fathom.ai/external/v1/meetings?calendar_invitees_domains_type=all&limit=50',
      {
        headers: {
          'X-Api-Key': fathomApiKey,
        },
      }
    )

    if (!meetingsResponse.ok) {
      const errorText = await meetingsResponse.text()
      console.error('[Sync Fathom] API error:', errorText)
      throw new Error(`Fathom API error: ${meetingsResponse.status}`)
    }

    const meetingsData = await meetingsResponse.json()
    const meetings = meetingsData.items || []

    console.log(`[Sync Fathom] Found ${meetings.length} meetings`)

    let newCount = 0
    let updatedCount = 0
    let analyzedCount = 0

    for (const meeting of meetings) {
      // Check if call already exists
      const { data: existingCall } = await supabase
        .from('sales_calls')
        .select('id, recording_id')
        .eq('recording_id', meeting.recording_id)
        .single()

      // Calculate duration in minutes
      const startTime = new Date(meeting.recording_start_time)
      const endTime = new Date(meeting.recording_end_time)
      const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000)

      const callData = {
        recording_id: meeting.recording_id,
        title: meeting.title,
        meeting_title: meeting.meeting_title,
        fathom_url: meeting.url,
        share_url: meeting.share_url,
        scheduled_start_time: meeting.scheduled_start_time,
        scheduled_end_time: meeting.scheduled_end_time,
        recording_start_time: meeting.recording_start_time,
        recording_end_time: meeting.recording_end_time,
        duration_minutes: durationMinutes,
        transcript: meeting.transcript || null,
        summary: meeting.default_summary?.markdown_formatted || null,
        updated_at: new Date().toISOString(),
      }

      if (existingCall) {
        // Update existing call
        await supabase
          .from('sales_calls')
          .update(callData)
          .eq('id', existingCall.id)

        updatedCount++
        console.log(`[Sync Fathom] Updated call ${meeting.recording_id}`)
      } else {
        // Insert new call
        const { data: newCall, error: insertError } = await supabase
          .from('sales_calls')
          .insert(callData)
          .select()
          .single()

        if (insertError) {
          console.error(`[Sync Fathom] Error inserting call:`, insertError)
          continue
        }

        newCount++
        console.log(`[Sync Fathom] Created new call ${meeting.recording_id}`)

        // Trigger AI analysis for new calls
        if (newCall) {
          try {
            const analyzeResponse = await fetch(`${supabaseUrl}/functions/v1/analyze-sales-call`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                sales_call_id: newCall.id,
                recording_id: meeting.recording_id,
              }),
            })

            if (analyzeResponse.ok) {
              analyzedCount++
              console.log(`[Sync Fathom] Triggered analysis for call ${meeting.recording_id}`)
            }
          } catch (analyzeError) {
            console.error(`[Sync Fathom] Error triggering analysis:`, analyzeError)
          }
        }
      }
    }

    console.log(`[Sync Fathom] Sync complete - New: ${newCount}, Updated: ${updatedCount}, Analyzed: ${analyzedCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fathom sync completed successfully',
        data: {
          total_meetings: meetings.length,
          new_calls: newCount,
          updated_calls: updatedCount,
          analyzed_calls: analyzedCount,
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
    console.error('[Sync Fathom] Error:', error)

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
