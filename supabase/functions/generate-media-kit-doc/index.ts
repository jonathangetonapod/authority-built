import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { requirePlatformAdminOrService } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOAP_LOGO_URL = 'https://getonapod.com/icon-512.png'

// Brand colors
const COLOR_DARK = { red: 0.13, green: 0.13, blue: 0.13 }
const COLOR_GRAY = { red: 0.35, green: 0.35, blue: 0.35 }
const COLOR_LIGHT_GRAY = { red: 0.55, green: 0.55, blue: 0.55 }
const COLOR_ACCENT = { red: 0.15, green: 0.4, blue: 0.75 } // Professional blue for links/accents
const COLOR_DIVIDER = { red: 0.85, green: 0.85, blue: 0.85 }

/**
 * Generate Google Access Token from Service Account (with domain-wide delegation)
 */
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

  if (userEmail) {
    jwtPayloadObj.sub = userEmail
    console.log('[Generate Media Kit] Domain-wide delegation, impersonating:', userEmail)
  }

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

/**
 * Generate media kit content using Claude AI — host-facing format
 */
interface MediaKitContent {
  tagline: string
  aboutBio: string
  credentials: string[]
  episodeTopics: { title: string; hook: string; audienceTakeaway: string }[]
  sampleQuestions: string[]
  audienceValue: string
}

async function generateMediaKitContent(guest: {
  name: string
  bio: string
  title?: string
  company?: string
  industry?: string
  expertise?: string[]
  topics?: string[]
  targetAudience?: string
  linkedinUrl?: string
  website?: string
}): Promise<MediaKitContent> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const expertiseList = guest.expertise?.length ? guest.expertise.join(', ') : 'Not specified'
  const topicsList = guest.topics?.length ? guest.topics.join(', ') : 'Not specified'

  const prompt = `You are creating content for a podcast guest media kit that will be sent to PODCAST HOSTS to convince them to book this person as a guest. This is NOT a sales document — it's a professional one-pager that makes a host think "I need this person on my show."

GUEST DETAILS:
- Name: ${guest.name}
- Title: ${guest.title || 'Not specified'}
- Company: ${guest.company || 'Not specified'}
- Industry: ${guest.industry || 'Not specified'}
- Bio: ${guest.bio}
- Areas of Expertise: ${expertiseList}
- Topics They Can Speak On: ${topicsList}
- Target Audience: ${guest.targetAudience || 'Not specified'}

Return a JSON object with exactly this structure (no markdown, no code fences, just raw JSON):

{
  "tagline": "One punchy sentence that captures who they are and why they're worth listening to. Under 15 words. Example format: 'The founder who scaled X to Y by doing Z'",
  "aboutBio": "2-3 paragraph professional bio in third person. Written for a podcast host — emphasize storytelling ability, unique experiences, and what makes them a compelling interview. Use \\n\\n between paragraphs.",
  "credentials": ["5-7 specific, verifiable achievements that prove credibility. Numbers, outcomes, recognitions. Each should make a host think 'my audience needs to hear this.'"],
  "episodeTopics": [
    {
      "title": "Episode-ready topic title (how a host would name the episode)",
      "hook": "One sentence that explains why this topic is timely and relevant right now",
      "audienceTakeaway": "What listeners will walk away with — specific, actionable"
    }
  ],
  "sampleQuestions": ["5-7 great interview questions a host could ask. Make them specific and conversation-starting, not generic. The kind of questions that lead to stories and insights."],
  "audienceValue": "2-3 sentences explaining what value this guest brings to a podcast audience. Focus on unique perspective, real experience, and actionable insights — not credentials."
}

RULES:
- Write for PODCAST HOSTS, not the guest themselves
- Be specific — use real details from their bio, not generic praise
- Episode topics should feel like real episode titles, not academic papers
- Sample questions should be conversation starters that lead to stories
- Don't fabricate facts not supported by the bio
- Make the host feel like booking this guest is a no-brainer
- Return ONLY valid JSON, nothing else`

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
      max_tokens: 3000,
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

  return JSON.parse(rawText)
}

// ── Document building helpers ──

function insertStyledText(
  requests: any[],
  index: number,
  text: string,
  style: {
    fontSize?: number
    bold?: boolean
    italic?: boolean
    color?: { red: number; green: number; blue: number }
    font?: string
    alignment?: string
    link?: string
  } = {}
): number {
  const textWithNewline = text.endsWith('\n') ? text : text + '\n'

  requests.push({
    insertText: { location: { index }, text: textWithNewline }
  })

  const textStyle: any = {}
  const fields: string[] = []

  if (style.fontSize) {
    textStyle.fontSize = { magnitude: style.fontSize, unit: 'PT' }
    fields.push('fontSize')
  }
  if (style.bold !== undefined) {
    textStyle.bold = style.bold
    fields.push('bold')
  }
  if (style.italic !== undefined) {
    textStyle.italic = style.italic
    fields.push('italic')
  }
  if (style.color) {
    textStyle.foregroundColor = { color: { rgbColor: style.color } }
    fields.push('foregroundColor')
  }
  if (style.font) {
    textStyle.weightedFontFamily = { fontFamily: style.font }
    fields.push('weightedFontFamily')
  }
  if (style.link) {
    textStyle.link = { url: style.link }
    fields.push('link')
  }

  if (fields.length > 0) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: index, endIndex: index + textWithNewline.length },
        textStyle,
        fields: fields.join(','),
      }
    })
  }

  if (style.alignment) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: index, endIndex: index + textWithNewline.length },
        paragraphStyle: { alignment: style.alignment },
        fields: 'alignment',
      }
    })
  }

  return index + textWithNewline.length
}

function insertSectionHeading(requests: any[], index: number, text: string): number {
  const headingText = text + '\n'
  requests.push({
    insertText: { location: { index }, text: headingText }
  })
  requests.push({
    updateParagraphStyle: {
      range: { startIndex: index, endIndex: index + headingText.length },
      paragraphStyle: {
        namedStyleType: 'HEADING_2',
        spaceAbove: { magnitude: 16, unit: 'PT' },
        spaceBelow: { magnitude: 6, unit: 'PT' },
      },
      fields: 'namedStyleType,spaceAbove,spaceBelow',
    }
  })
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + headingText.length },
      textStyle: {
        fontSize: { magnitude: 13, unit: 'PT' },
        bold: true,
        foregroundColor: { color: { rgbColor: COLOR_DARK } },
        weightedFontFamily: { fontFamily: 'Arial' },
      },
      fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
    }
  })
  return index + headingText.length
}

function insertSpacer(requests: any[], index: number, size: number = 6): number {
  const spacer = '\n'
  requests.push({
    insertText: { location: { index }, text: spacer }
  })
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + spacer.length },
      textStyle: { fontSize: { magnitude: size, unit: 'PT' } },
      fields: 'fontSize',
    }
  })
  return index + spacer.length
}

function insertBullets(requests: any[], index: number, items: string[], style: {
  fontSize?: number
  color?: { red: number; green: number; blue: number }
} = {}): number {
  const startIndex = index
  let currentIndex = index

  for (const item of items) {
    const bulletText = item + '\n'
    requests.push({
      insertText: { location: { index: currentIndex }, text: bulletText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: currentIndex, endIndex: currentIndex + bulletText.length },
        textStyle: {
          fontSize: { magnitude: style.fontSize || 10, unit: 'PT' },
          foregroundColor: { color: { rgbColor: style.color || COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,foregroundColor,weightedFontFamily',
      }
    })
    currentIndex += bulletText.length
  }

  requests.push({
    createParagraphBullets: {
      range: { startIndex, endIndex: currentIndex },
      bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
    }
  })

  return currentIndex
}

// Insert a horizontal rule-like divider
function insertDivider(requests: any[], index: number): number {
  const dividerText = '━━━━━━━━━━━━━━━━━━━━━━━━��━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  requests.push({
    insertText: { location: { index }, text: dividerText }
  })
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + dividerText.length },
      textStyle: {
        fontSize: { magnitude: 6, unit: 'PT' },
        foregroundColor: { color: { rgbColor: COLOR_DIVIDER } },
      },
      fields: 'fontSize,foregroundColor',
    }
  })
  return index + dividerText.length
}

/**
 * Build the host-facing media kit document
 */
async function createMediaKitDoc(
  accessToken: string,
  guest: {
    name: string
    title?: string
    company?: string
    imageUrl?: string
    linkedinUrl?: string
    website?: string
    calendarLink?: string
  },
  content: MediaKitContent
): Promise<{ docId: string; docUrl: string }> {
  const docTitle = `${guest.name} — Podcast Guest Media Kit`
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: docTitle }),
  })

  if (!createResponse.ok) {
    throw new Error(`Failed to create Google Doc: ${await createResponse.text()}`)
  }

  const doc = await createResponse.json()
  const docId = doc.documentId
  const docUrl = `https://docs.google.com/document/d/${docId}/edit`
  console.log('[Generate Media Kit] Doc created:', docId)

  const requests: any[] = []
  let idx = 1

  // ── Header: Name ──
  idx = insertStyledText(requests, idx, guest.name.toUpperCase(), {
    fontSize: 26, bold: true, color: COLOR_DARK, font: 'Arial',
  })

  // ── Tagline ──
  idx = insertStyledText(requests, idx, content.tagline, {
    fontSize: 12, italic: true, color: COLOR_GRAY, font: 'Arial',
  })

  // ── Title & Company ──
  const subtitle = [guest.title, guest.company].filter(Boolean).join('  |  ')
  if (subtitle) {
    idx = insertStyledText(requests, idx, subtitle, {
      fontSize: 11, color: COLOR_GRAY, font: 'Arial',
    })
  }

  idx = insertDivider(requests, idx)

  // ════���═════════════════════════════════
  // SECTION: About
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'About')

  const bioParagraphs = content.aboutBio.split(/\n+/).filter(Boolean)
  for (const para of bioParagraphs) {
    idx = insertStyledText(requests, idx, para, {
      fontSize: 10, color: COLOR_DARK, font: 'Arial',
    })
  }

  // ══════════════════════════════════════
  // SECTION: Notable Credentials
  // ═════════════════════════════��════════
  idx = insertSectionHeading(requests, idx, 'Notable Credentials')
  idx = insertBullets(requests, idx, content.credentials)

  // ════════════════════════���═════════════
  // SECTION: Episode Topics
  // ══════════════════════════════════════
  idx = insertSectionHeading(requests, idx, 'Episode-Ready Topics')

  for (const topic of content.episodeTopics) {
    // Topic title
    const titleText = topic.title + '\n'
    requests.push({
      insertText: { location: { index: idx }, text: titleText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + titleText.length },
        textStyle: {
          fontSize: { magnitude: 11, unit: 'PT' },
          bold: true,
          foregroundColor: { color: { rgbColor: COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
      }
    })
    idx += titleText.length

    // Hook
    idx = insertStyledText(requests, idx, topic.hook, {
      fontSize: 10, color: COLOR_GRAY, font: 'Arial',
    })

    // Audience takeaway
    const takeawayText = `Your audience will learn: ${topic.audienceTakeaway}`
    idx = insertStyledText(requests, idx, takeawayText, {
      fontSize: 10, italic: true, color: COLOR_ACCENT, font: 'Arial',
    })

    idx = insertSpacer(requests, idx, 4)
  }

  // ════════════════════���═════════════════
  // SECTION: What Your Audience Will Gain
  // ═══════════════════════════════════���══
  idx = insertSectionHeading(requests, idx, 'What Your Audience Will Gain')

  idx = insertStyledText(requests, idx, content.audienceValue, {
    fontSize: 10, color: COLOR_DARK, font: 'Arial',
  })

  // ══════════════════════════════════════
  // SECTION: Sample Interview Questions
  // ═══════════════════════════════���══════
  idx = insertSectionHeading(requests, idx, 'Sample Interview Questions')

  // Numbered list for questions
  const startQIdx = idx
  for (const q of content.sampleQuestions) {
    const qText = q + '\n'
    requests.push({
      insertText: { location: { index: idx }, text: qText }
    })
    requests.push({
      updateTextStyle: {
        range: { startIndex: idx, endIndex: idx + qText.length },
        textStyle: {
          fontSize: { magnitude: 10, unit: 'PT' },
          foregroundColor: { color: { rgbColor: COLOR_DARK } },
          weightedFontFamily: { fontFamily: 'Arial' },
        },
        fields: 'fontSize,foregroundColor,weightedFontFamily',
      }
    })
    idx += qText.length
  }
  requests.push({
    createParagraphBullets: {
      range: { startIndex: startQIdx, endIndex: idx },
      bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
    }
  })

  // ════════════════════════════════════��═
  // SECTION: Connect
  // ══════════════════════════════════════
  idx = insertDivider(requests, idx)

  idx = insertSectionHeading(requests, idx, 'Connect')

  const links: { label: string; url: string }[] = []
  if (guest.linkedinUrl) links.push({ label: 'LinkedIn', url: guest.linkedinUrl })
  if (guest.website) links.push({ label: 'Website', url: guest.website.startsWith('http') ? guest.website : `https://${guest.website}` })
  if (guest.calendarLink) links.push({ label: 'Book a Call', url: guest.calendarLink })

  if (links.length > 0) {
    for (const link of links) {
      const linkText = `${link.label}\n`
      requests.push({
        insertText: { location: { index: idx }, text: linkText }
      })
      requests.push({
        updateTextStyle: {
          range: { startIndex: idx, endIndex: idx + linkText.length },
          textStyle: {
            fontSize: { magnitude: 10, unit: 'PT' },
            bold: true,
            foregroundColor: { color: { rgbColor: COLOR_ACCENT } },
            link: { url: link.url },
            weightedFontFamily: { fontFamily: 'Arial' },
          },
          fields: 'fontSize,bold,foregroundColor,link,weightedFontFamily',
        }
      })
      idx += linkText.length
    }
  }

  idx = insertSpacer(requests, idx, 8)

  // ── Footer ──
  idx = insertStyledText(requests, idx, `Booking managed by Get On A Pod  ·  getonapod.com`, {
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
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  )

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text()
    console.error('[Generate Media Kit] Batch update error:', errorText)
  } else {
    console.log('[Generate Media Kit] Content inserted and formatted')
  }

  // ── Insert images independently ──
  const insertImage = async (index: number, uri: string, width: number, height: number, label: string) => {
    try {
      const imgResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                insertInlineImage: {
                  location: { index },
                  uri,
                  objectSize: {
                    height: { magnitude: height, unit: 'PT' },
                    width: { magnitude: width, unit: 'PT' },
                  }
                }
              },
              {
                insertText: { location: { index: index + 1 }, text: '\n' }
              }
            ]
          }),
        }
      )
      if (!imgResponse.ok) {
        console.error(`[Generate Media Kit] ${label} insertion failed:`, await imgResponse.text())
        return false
      }
      console.log(`[Generate Media Kit] ${label} inserted`)
      return true
    } catch (err) {
      console.error(`[Generate Media Kit] ${label} error:`, err)
      return false
    }
  }

  // Insert guest photo at the top
  if (guest.imageUrl) {
    await insertImage(1, guest.imageUrl, 90, 90, 'Guest photo')
  }

  return { docId, docUrl }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdminOrService(req)
    const body = await req.json()
    const {
      dashboardId, clientId, prospectName, prospectBio, prospectTitle, prospectCompany,
      prospectIndustry, prospectExpertise, prospectTopics, prospectTargetAudience,
      prospectImageUrl, prospectLinkedinUrl, prospectWebsite, prospectCalendarLink,
      dashboardSlug,
    } = body

    if ((!dashboardId && !clientId) || !prospectName || !prospectBio) {
      return new Response(
        JSON.stringify({ success: false, error: 'dashboardId or clientId, prospectName, and prospectBio are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Generate Media Kit] Starting for:', prospectName)

    // Step 1: Generate content with Claude
    console.log('[Generate Media Kit] Generating content with Claude...')
    const content = await generateMediaKitContent({
      name: prospectName,
      bio: prospectBio,
      title: prospectTitle,
      company: prospectCompany,
      industry: prospectIndustry,
      expertise: prospectExpertise,
      topics: prospectTopics,
      targetAudience: prospectTargetAudience,
      linkedinUrl: prospectLinkedinUrl,
      website: prospectWebsite,
    })
    console.log('[Generate Media Kit] Content generated')

    // Step 2: Get Google access token
    console.log('[Generate Media Kit] Authenticating with Google...')
    const accessToken = await getGoogleAccessToken()

    // Step 3: Create formatted Google Doc
    console.log('[Generate Media Kit] Creating Google Doc...')
    const { docId, docUrl } = await createMediaKitDoc(accessToken, {
      name: prospectName,
      title: prospectTitle,
      company: prospectCompany,
      imageUrl: prospectImageUrl,
      linkedinUrl: prospectLinkedinUrl,
      website: prospectWebsite,
      calendarLink: prospectCalendarLink,
    }, content)

    // Step 4: Make the doc publicly viewable
    const permResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${docId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'anyone', role: 'reader' }),
      }
    )
    if (!permResponse.ok) {
      console.error('[Generate Media Kit] Failed to make public:', await permResponse.text())
    }

    // Step 5: Save URL to database
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (clientId) {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ media_kit_url: docUrl })
        .eq('id', clientId)
      if (updateError) {
        console.error('[Generate Media Kit] Failed to save URL to client:', updateError)
      }
    }

    if (dashboardId && !clientId) {
      const { error: updateError } = await supabase
        .from('prospect_dashboards')
        .update({ media_kit_url: docUrl })
        .eq('id', dashboardId)
      if (updateError) {
        console.error('[Generate Media Kit] Failed to save URL to dashboard:', updateError)
      }
    }

    console.log('[Generate Media Kit] Done! URL:', docUrl)

    return new Response(
      JSON.stringify({ success: true, docUrl, docId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Generate Media Kit] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
