import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { requirePlatformAdminOrService } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COLOR_DARK = { red: 0.13, green: 0.13, blue: 0.13 }
const COLOR_GRAY = { red: 0.35, green: 0.35, blue: 0.35 }
const COLOR_LIGHT_GRAY = { red: 0.55, green: 0.55, blue: 0.55 }
const COLOR_ACCENT = { red: 0.15, green: 0.4, blue: 0.75 }
const COLOR_DIVIDER = { red: 0.85, green: 0.85, blue: 0.85 }
const COLOR_BG_LIGHT = { red: 0.96, green: 0.96, blue: 0.97 }

// ── Google Auth (reused from media kit) ──

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')

  const serviceAccount = JSON.parse(serviceAccountJson)
  const { client_email, private_key } = serviceAccount
  if (!client_email || !private_key) throw new Error('Invalid service account credentials')

  const now = Math.floor(Date.now() / 1000)
  const base64UrlEncode = (data: string) =>
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))

  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  const jwtPayloadObj: Record<string, unknown> = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }
  if (userEmail) jwtPayloadObj.sub = userEmail

  const jwtPayload = base64UrlEncode(JSON.stringify(jwtPayloadObj))

  const normalizedKey = private_key.replace(/\\n/g, '\n')
  const pemContents = normalizedKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const encoder = new TextEncoder()
  const signatureInput = `${jwtHeader}.${jwtPayload}`
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(signatureInput))
  const signatureEncoded = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))
  const jwt = `${signatureInput}.${signatureEncoded}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenResponse.json()
  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`)
  }
  return tokenData.access_token
}

// ── Google Doc builder helpers ──

function insertStyledText(
  requests: any[], index: number, text: string,
  style: { fontSize?: number; bold?: boolean; italic?: boolean; color?: any; font?: string; alignment?: string } = {}
): number {
  const t = text.endsWith('\n') ? text : text + '\n'
  requests.push({ insertText: { location: { index }, text: t } })

  const textStyle: any = {}
  const fields: string[] = []
  if (style.fontSize) { textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' }; fields.push('fontSize') }
  if (style.bold !== undefined) { textStyle.bold = style.bold; fields.push('bold') }
  if (style.italic !== undefined) { textStyle.italic = style.italic; fields.push('italic') }
  if (style.color) { textStyle.foregroundColor = { color: { rgbColor: style.color } }; fields.push('foregroundColor') }
  if (style.font) { textStyle.weightedFontFamily = { fontFamily: style.font }; fields.push('weightedFontFamily') }

  if (fields.length > 0) {
    requests.push({ updateTextStyle: { range: { startIndex: index, endIndex: index + t.length }, textStyle, fields: fields.join(',') } })
  }
  if (style.alignment) {
    requests.push({ updateParagraphStyle: { range: { startIndex: index, endIndex: index + t.length }, paragraphStyle: { alignment: style.alignment }, fields: 'alignment' } })
  }
  return index + t.length
}

function insertSpacer(requests: any[], index: number, size: number = 6): number {
  const spacer = '\n'
  requests.push({ insertText: { location: { index }, text: spacer } })
  requests.push({ updateTextStyle: { range: { startIndex: index, endIndex: index + 1 }, textStyle: { fontSize: { magnitude: size, unit: 'PT' } }, fields: 'fontSize' } })
  return index + 1
}

function insertDivider(requests: any[], index: number): number {
  const d = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  requests.push({ insertText: { location: { index }, text: d } })
  requests.push({ updateTextStyle: { range: { startIndex: index, endIndex: index + d.length }, textStyle: { fontSize: { magnitude: 5, unit: 'PT' }, foregroundColor: { color: { rgbColor: COLOR_DIVIDER } } }, fields: 'fontSize,foregroundColor' } })
  return index + d.length
}

// ── Build the Google Doc ──

async function createSequenceDoc(
  accessToken: string,
  clientName: string,
  sequence: { label: string; timing: string; body: string }[]
): Promise<{ docId: string; docUrl: string }> {
  const firstName = clientName.split(' ')[0]
  const docTitle = `${firstName}'s Outreach Email Preview | Get On A Pod`

  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: docTitle }),
  })
  if (!createResponse.ok) throw new Error(`Failed to create Google Doc: ${await createResponse.text()}`)

  const doc = await createResponse.json()
  const docId = doc.documentId
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`

  const requests: any[] = []
  let idx = 1

  // ── Header ──
  idx = insertStyledText(requests, idx, `YOUR OUTREACH EMAILS`, {
    fontSize: 22, bold: true, color: COLOR_DARK, font: 'Arial',
  })

  idx = insertStyledText(requests, idx, `A preview of how we pitch you to podcast hosts`, {
    fontSize: 11, italic: true, color: COLOR_GRAY, font: 'Arial',
  })

  idx = insertSpacer(requests, idx, 6)

  // ── Intro paragraph ──
  idx = insertStyledText(requests, idx, `Below is a sample of the emails we'll send to podcast hosts on your behalf. We want you to see exactly what goes out with your name on it before we start outreach.`, {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  idx = insertStyledText(requests, idx, `A few things to know:`, {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  const howItWorks = [
    `Every email is written from scratch for each podcast. These are not templates`,
    `We research the host, listen to a recent episode, and reference it in the email`,
    `Your topic bullets are tailored to what that specific audience cares about`,
    `We follow up twice, then move on. No spam, no repeated messages`,
    `Nothing goes out without your approval`,
  ]

  const bulletsStart = idx
  for (const item of howItWorks) {
    const t = item + '\n'
    requests.push({ insertText: { location: { index: idx }, text: t } })
    requests.push({ updateTextStyle: { range: { startIndex: idx, endIndex: idx + t.length }, textStyle: { fontSize: { magnitude: 10, unit: 'PT' }, foregroundColor: { color: { rgbColor: COLOR_DARK } }, weightedFontFamily: { fontFamily: 'Arial' } }, fields: 'fontSize,foregroundColor,weightedFontFamily' } })
    idx += t.length
  }
  requests.push({ createParagraphBullets: { range: { startIndex: bulletsStart, endIndex: idx }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } })

  idx = insertSpacer(requests, idx, 4)

  idx = insertStyledText(requests, idx, `The sample below uses a fictional podcast to show the tone and structure. Your real emails will reference actual shows we've matched you with.`, {
    fontSize: 10, color: COLOR_GRAY, font: 'Arial',
  })

  idx = insertSpacer(requests, idx, 8)

  // ── Email sequence ──
  for (let i = 0; i < sequence.length; i++) {
    const email = sequence[i]

    idx = insertDivider(requests, idx)

    // Email header
    idx = insertStyledText(requests, idx, `${email.label}`, {
      fontSize: 13, bold: true, color: COLOR_DARK, font: 'Arial',
    })

    idx = insertStyledText(requests, idx, email.timing, {
      fontSize: 9, italic: true, color: COLOR_LIGHT_GRAY, font: 'Arial',
    })

    idx = insertSpacer(requests, idx, 4)

    // Email body - parse into text blocks and bullet groups
    const lines = email.body.split('\n')

    // Group consecutive lines into: text paragraphs and bullet groups
    const blocks: { type: 'text' | 'bullets'; content: string[] }[] = []
    let currentBullets: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ')
      if (isBullet) {
        currentBullets.push(trimmed.replace(/^[\-•]\s+/, ''))
      } else {
        if (currentBullets.length > 0) {
          blocks.push({ type: 'bullets', content: currentBullets })
          currentBullets = []
        }
        blocks.push({ type: 'text', content: [trimmed] })
      }
    }
    if (currentBullets.length > 0) {
      blocks.push({ type: 'bullets', content: currentBullets })
    }

    for (const block of blocks) {
      if (block.type === 'text') {
        idx = insertStyledText(requests, idx, block.content[0], {
          fontSize: 10, color: COLOR_DARK, font: 'Arial',
        })
      } else {
        // Insert all bullets as a group, then apply bullet formatting once
        const bulletStart = idx
        for (const item of block.content) {
          const t = item + '\n'
          requests.push({ insertText: { location: { index: idx }, text: t } })
          requests.push({ updateTextStyle: { range: { startIndex: idx, endIndex: idx + t.length }, textStyle: { fontSize: { magnitude: 10, unit: 'PT' }, foregroundColor: { color: { rgbColor: COLOR_DARK } }, weightedFontFamily: { fontFamily: 'Arial' } }, fields: 'fontSize,foregroundColor,weightedFontFamily' } })
          idx += t.length
        }
        requests.push({ createParagraphBullets: { range: { startIndex: bulletStart, endIndex: idx }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } })
      }
    }

    idx = insertSpacer(requests, idx, 8)
  }

  // ── Footer ──
  idx = insertDivider(requests, idx)
  idx = insertSpacer(requests, idx, 4)

  idx = insertStyledText(requests, idx, `Have feedback on the tone, topics, or how you're introduced? Let us know and we'll adjust before we start outreach.`, {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  idx = insertSpacer(requests, idx, 6)

  idx = insertStyledText(requests, idx, `Get On A Pod  ·  getonapod.com`, {
    fontSize: 8, color: COLOR_LIGHT_GRAY, font: 'Arial', alignment: 'CENTER',
  })

  // ── Document margins ──
  requests.push({
    updateDocumentStyle: {
      documentStyle: {
        marginTop: { magnitude: 55, unit: 'PT' },
        marginBottom: { magnitude: 45, unit: 'PT' },
        marginLeft: { magnitude: 65, unit: 'PT' },
        marginRight: { magnitude: 65, unit: 'PT' },
      },
      fields: 'marginTop,marginBottom,marginLeft,marginRight',
    }
  })

  // Execute batch update
  const updateResponse = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    }
  )

  if (!updateResponse.ok) {
    console.error('[Generate Sequence] Doc batch update error:', await updateResponse.text())
  }

  // Make publicly viewable
  await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/permissions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  })

  return { docId, docUrl }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdminOrService(req)
    const { clientName, clientBio, clientTitle, clientLinkedin, clientWebsite } = await req.json()

    if (!clientName || !clientBio) {
      return new Response(
        JSON.stringify({ success: false, error: 'clientName and clientBio are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const firstName = clientName.split(' ')[0]

    const prompt = `You are writing a sample 3-email outreach sequence for a podcast guest booking agency. This sequence will be shown to the CLIENT (${clientName}) so they can see the tone, structure, and quality of emails that will be sent to podcast hosts on their behalf.

CLIENT DETAILS:
- Name: ${clientName}
- Title: ${clientTitle || 'Not specified'}
- Bio: ${clientBio}
- LinkedIn: ${clientLinkedin || 'Not provided'}
- Website: ${clientWebsite || 'Not provided'}

Write a 3-email sequence that pitches ${firstName} as a podcast guest. Use a FICTIONAL but realistic podcast as the example (invent a plausible podcast name, host name, and recent episode topic that fits ${firstName}'s expertise).

Return ONLY a JSON array with exactly 3 objects. No markdown, no code fences, just raw JSON:

[
  {
    "label": "Email 1",
    "timing": "Day 1 · Initial Outreach",
    "body": "The full email body, ready to read."
  },
  {
    "label": "Email 2",
    "timing": "Day 4 · Follow-Up",
    "body": "..."
  },
  {
    "label": "Email 3",
    "timing": "Day 8 · Final Follow-Up",
    "body": "..."
  }
]

EMAIL WRITING RULES:

**Email 1 - Initial Outreach (120-150 words MAX):**
- Open with "Hey [host_first_name],"
- First sentence MUST be: "I had an idea about a potential guest you may want to interview if you're taking on guests."
- Then 1-2 more sentences referencing the (fictional) recent episode naturally, like you actually listened to it and had a thought
- Introduce ${firstName} with only 2-3 strongest credentials with specific numbers
- Exactly 3-4 topic bullets, one line each, starting with "- "
- End with exactly: "Would you be open to seeing some more info about ${firstName}?"
- No text after the CTA

**Email 2 - Follow-Up (80-100 words MAX):**
- Open with "Hey [host_first_name],"
- Short, 3-4 sentences max
- Add a NEW angle or detail about ${firstName} not mentioned in Email 1
- Offer to send a media kit or one-pager
- Conversational, like texting a colleague you respect

**Email 3 - Final Follow-Up (60-80 words MAX):**
- Open with "Hey [host_first_name],"
- Lead with a specific, timely topic ${firstName} can speak to
- Respectful, acknowledges the host is busy
- Leave the door open, no guilt, no pressure
- End with a soft ask

NATURAL TONE - THIS IS CRITICAL:
- Write like a real person sending an email, not like a copywriter following a framework
- Read each email out loud. If it sounds like it was generated by AI or follows an obvious template, rewrite it
- Vary sentence length. Mix short punchy sentences with slightly longer ones
- Don't start every email the same way after "Hey [name],"
- Avoid phrases that scream "outreach email": "I came across your podcast," "I'd love to connect," "I think there's a great fit," "I believe [name] would be a perfect guest"
- Use contractions naturally (don't vs do not, can't vs cannot, it's vs it is)
- The bullets should sound like things you'd say in a quick conversation, not polished marketing copy
- No filler. Every sentence earns its place

STRICT FORMATTING RULES:
- NO em dashes at all, anywhere, ever. Use commas, periods, or regular dashes (-) instead
- NO hype words: "revolutionizing," "game-changing," "transforming," "disrupting," "innovative," "incredible," "thrilled," "excited"
- NO formal phrases: "I am writing on behalf of," "specifically," "there is a," "in order to," "currently," "I wanted to reach out"
- NO links in any email
- NO signatures, no bold, no italic, no placeholder text
- Use only the host's first name, never full name
- Bullet lines must start with "- " (dash space)

CUTTING PATTERNS - DELETE THESE IF THEY APPEAR:
- "I am writing on behalf of" -> just introduce them
- "specifically" -> cut it
- "there is a" -> rewrite without it
- "in order to" -> use "to"
- "currently" -> usually unnecessary
- "I'd love to" -> just say what you want
- "I think" -> just state it`

    console.log('[Generate Sequence] Generating for:', clientName)

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      throw new Error(`Claude API error: ${error}`)
    }

    const claudeData = await claudeResponse.json()
    let rawText = ''
    for (const block of claudeData.content) {
      if (block.type === 'text') {
        rawText = block.text.trim()
        break
      }
    }

    rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
    if (!rawText) throw new Error('Empty response from Claude')

    const sequence = JSON.parse(rawText)
    console.log('[Generate Sequence] Generated', sequence.length, 'emails for', clientName)

    // Create client-facing Google Doc
    let docUrl: string | undefined
    try {
      console.log('[Generate Sequence] Creating Google Doc...')
      const accessToken = await getGoogleAccessToken()
      const result = await createSequenceDoc(accessToken, clientName, sequence)
      docUrl = result.docUrl
      console.log('[Generate Sequence] Doc created:', docUrl)
    } catch (docError) {
      console.error('[Generate Sequence] Failed to create Google Doc:', docError)
      // Don't fail the whole request if doc creation fails
    }

    return new Response(
      JSON.stringify({ success: true, sequence, docUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Generate Sequence] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
