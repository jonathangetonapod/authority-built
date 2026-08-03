import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requirePlatformAdminOrService } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdminOrService(req)
    const { bisonReplyId, name, email, company, leadType, aiReason, customPrompt } = await req.json()

    if (!bisonReplyId) {
      return new Response(
        JSON.stringify({ success: false, error: 'bisonReplyId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')
    if (!bisonApiToken) throw new Error('EMAIL_BISON_API_TOKEN not configured')

    // Fetch full thread from Bison
    console.log('[Generate Reply] Fetching thread for reply ID:', bisonReplyId)

    const threadRes = await fetch(
      `https://send.leadgenjay.com/api/replies/${bisonReplyId}/conversation-thread`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${bisonApiToken}`,
          Accept: 'application/json',
        },
      }
    )

    if (!threadRes.ok) {
      throw new Error(`Failed to fetch thread: ${threadRes.status}`)
    }

    const threadData = await threadRes.json()
    const thread = threadData.data

    const messages = [
      ...(thread.older_messages || []).reverse(),
      thread.current_reply,
      ...(thread.newer_messages || []),
    ].filter(Boolean)

    const threadText = messages
      .map((msg: any) => {
        const from = msg.from_name || msg.from_email_address || 'Unknown'
        const body = msg.text_body || (msg.html_body ? stripHtml(msg.html_body) : '')
        return `From: ${from} <${msg.from_email_address || ''}>\n${body}`
      })
      .join('\n\n---\n\n')

    // Build context-aware prompt
    let roleContext = ''
    if (leadType === 'sales') {
      roleContext = `This is a SALES lead — a prospect who might hire GOAP to book them on podcasts. Your goal is to move them toward booking a call or learning more about GOAP's services. Be helpful, professional, and consultative.`
    } else if (leadType === 'fulfillment') {
      roleContext = `This is a FULFILLMENT thread — a podcast host/producer responding to a guest pitch on behalf of a GOAP client. Your goal is to coordinate scheduling, provide any requested info about the guest, and confirm the booking. Be friendly and accommodating.`
    } else {
      roleContext = `Respond appropriately based on the context of the conversation.`
    }

    const prompt = `You are writing an email reply on behalf of GOAP (Get On A Pod), a podcast booking agency. GOAP helps clients get booked as guests on podcasts.

${roleContext}

Contact info:
- Name: ${name || 'Unknown'}
- Email: ${email || 'Unknown'}
- Company: ${company || 'Unknown'}
${aiReason ? `- AI classification note: ${aiReason}` : ''}

Full email thread:
${threadText}

Write a concise, natural reply to the most recent message. Rules:
- Write ONLY the reply body text, no subject line, no "Dear X" unless appropriate
- Match the tone of the conversation (formal if they're formal, casual if they're casual)
- Keep it short and actionable
- Do not use generic filler phrases like "I hope this email finds you well"
- Do not sign off with a name — the email system handles signatures
- Write in plain text, no HTML or markdown`

    const finalPrompt = customPrompt || prompt

    console.log('[Generate Reply] Calling Claude Sonnet...')

    const sonnetRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        // Thinks by default; see THINKS_BY_DEFAULT in _shared/promptModels.ts.
        thinking: { type: 'disabled' },
        max_tokens: 500,
        messages: [{ role: 'user', content: finalPrompt }],
      }),
    })

    if (!sonnetRes.ok) {
      const errorText = await sonnetRes.text()
      console.error('[Generate Reply] Sonnet error:', errorText)
      throw new Error(`Sonnet API error: ${sonnetRes.status}`)
    }

    const sonnetData = await sonnetRes.json()
    const generatedReply = sonnetData.content[0].text.trim()

    console.log('[Generate Reply] Generated reply successfully')

    return new Response(
      JSON.stringify({
        success: true,
        data: { reply: generatedReply, defaultPrompt: prompt },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Generate Reply] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
