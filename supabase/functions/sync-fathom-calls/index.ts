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
    const body = req.method === 'POST' ? await req.json() : {}
    const daysBack = body.daysBack || 30 // Default to 30 days

    const fathomApiKey = Deno.env.get('FATHOM_API_KEY')
    if (!fathomApiKey) {
      throw new Error('FATHOM_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calculate date range
    const lookbackDate = new Date()
    lookbackDate.setDate(lookbackDate.getDate() - daysBack)

    console.log(`[Sync Fathom] Fetching meetings from Fathom API (last ${daysBack} days)...`)

    // Fetch ALL meetings from Fathom with pagination
    const allMeetings: any[] = []
    let cursor: string | null = null
    let pageCount = 0

    do {
      pageCount++
      const url = cursor
        ? `https://api.fathom.ai/external/v1/meetings?calendar_invitees_domains_type=all&limit=100&cursor=${cursor}`
        : 'https://api.fathom.ai/external/v1/meetings?calendar_invitees_domains_type=all&limit=100'

      console.log(`[Sync Fathom] Fetching page ${pageCount}...`)

      const meetingsResponse = await fetch(url, {
        headers: {
          'X-Api-Key': fathomApiKey,
        },
      })

      if (!meetingsResponse.ok) {
        const errorText = await meetingsResponse.text()
        console.error('[Sync Fathom] API error:', errorText)
        throw new Error(`Fathom API error: ${meetingsResponse.status}`)
      }

      const meetingsData = await meetingsResponse.json()
      const items = meetingsData.items || []
      allMeetings.push(...items)

      console.log(`[Sync Fathom] Page ${pageCount}: Found ${items.length} meetings (total so far: ${allMeetings.length})`)

      // Check for next page
      cursor = meetingsData.next_cursor || null

      // Safety limit to prevent infinite loops
      if (pageCount > 50) {
        console.log('[Sync Fathom] Reached safety limit of 50 pages')
        break
      }
    } while (cursor)

    console.log(`[Sync Fathom] Finished pagination. Total meetings fetched: ${allMeetings.length}`)

    // Filter meetings by date range
    const meetings = allMeetings.filter((meeting: any) => {
      if (!meeting.recording_start_time) return false
      const meetingDate = new Date(meeting.recording_start_time)
      return meetingDate >= lookbackDate
    })

    console.log(`[Sync Fathom] Found ${allMeetings.length} total meetings, ${meetings.length} within last ${daysBack} days`)

    let newCount = 0
    let updatedCount = 0

    for (const meeting of meetings) {
      // Check if call already exists and if it has analysis
      const { data: existingCall } = await supabase
        .from('sales_calls')
        .select(`
          id,
          recording_id,
          analysis:sales_call_analysis(id)
        `)
        .eq('recording_id', meeting.recording_id)
        .single()

      // Skip calls that already have analysis
      if (existingCall && existingCall.analysis && existingCall.analysis.length > 0) {
        console.log(`[Sync Fathom] Skipping call ${meeting.recording_id} - already analyzed`)
        continue
      }

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
        // Update existing call (only if not analyzed yet)
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
      }
    }

    console.log(`[Sync Fathom] Sync complete - New: ${newCount}, Updated: ${updatedCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fathom sync completed successfully',
        data: {
          total_meetings: meetings.length,
          new_calls: newCount,
          updated_calls: updatedCount,
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
