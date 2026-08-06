import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import {
  HttpError,
  parseJsonObject,
  requireAuthenticatedUser,
  requirePlatformAdminOrService,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost, refundCredits } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FALLBACK_STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'build', 'building', 'company', 'could', 'experience',
  'from', 'have', 'helps', 'into', 'more', 'most', 'over', 'their', 'them', 'they', 'this', 'through',
  'using', 'what', 'when', 'where', 'which', 'while', 'with', 'work', 'years', 'your', 'podcast', 'guest',
])

/**
 * How many searches a run is built from. Five was hard-coded, and five is the
 * ceiling on how much of the index a run can reach: extra pages of the same
 * query saturate quickly, whereas another query looks somewhere else entirely.
 */
const DEFAULT_QUERY_COUNT = 5
const MIN_QUERY_COUNT = 3
const MAX_QUERY_COUNT = 20

function resolveQueryCount(value: unknown): number {
  // Only a number means a number. Number(null) is 0 and Number('') is 0, and
  // clamping those to the minimum turns "I did not ask" into "give me fewer".
  const requested = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(requested)) return DEFAULT_QUERY_COUNT
  return Math.min(MAX_QUERY_COUNT, Math.max(MIN_QUERY_COUNT, Math.trunc(requested)))
}

function fallbackQueries(
  targetName: string | undefined,
  targetBio: string,
  count = DEFAULT_QUERY_COUNT,
  avoid: string[] = [],
): string[] {
  const excluded = new Set((targetName || '').toLowerCase().match(/[a-z0-9]+/gu) || [])
  const frequencies = new Map<string, number>()
  for (const token of targetBio.toLowerCase().match(/[a-z][a-z0-9-]{2,}/gu) || []) {
    if (FALLBACK_STOP_WORDS.has(token) || excluded.has(token)) continue
    frequencies.set(token, (frequencies.get(token) || 0) + 1)
  }
  const defaults = ['business', 'leadership', 'growth', 'innovation', 'entrepreneurship']
  const topics = Array.from(frequencies.entries())
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))
    .map(([token]) => token.replace(/-+$/u, ''))
    .filter(Boolean)
  for (const fallback of defaults) if (!topics.includes(fallback)) topics.push(fallback)

  /*
   * Pair every topic against a shifting partner through a rotating set of
   * shapes, so the list grows to whatever was asked for. The old version tacked
   * extras onto five fixed seeds and stopped at the end of the topic list, which
   * meant a short bio returned five queries however many were requested — and
   * nothing downstream could tell the difference.
   */
  const shapes: Array<(first: string, second: string) => string> = [
    (first, second) => `"${first} ${second}"`,
    (first, second) => `"${first}" OR "${second}"`,
    (first, second) => `"${first} * podcast" OR "${second} * stories"`,
    (first, second) => `"${first} leaders" OR "${second} growth"`,
    (first, second) => `"${first} * business" OR "${second} innovation"`,
    (first, second) => `"${first} interview" OR "${second} conversations"`,
  ]
  const avoidSet = new Set(avoid.map((entry) => entry.trim().toLowerCase()))
  const queries: string[] = []
  const seen = new Set<string>()
  const maxAttempts = shapes.length * topics.length * 3
  for (let attempt = 0; attempt < maxAttempts && queries.length < count; attempt += 1) {
    const first = topics[attempt % topics.length]
    const second = topics[(attempt + 1 + Math.floor(attempt / topics.length)) % topics.length]
    if (!first || !second || first === second) continue
    const query = shapes[attempt % shapes.length](first, second)
    const key = query.toLowerCase()
    if (seen.has(key) || avoidSet.has(key)) continue
    seen.add(key)
    queries.push(query)
  }
  return queries
}

function fallbackReplacementQuery(
  targetName: string | undefined,
  targetBio: string,
  oldQuery: string,
): string {
  const queries = fallbackQueries(targetName, targetBio)
  return queries.find((candidate) => candidate !== oldQuery) || queries[0]
}

serve(async (req) => {
  // Set when a real debit lands, so the outer catch can give it back: a
  // failure after the charge is work the workspace paid for and never got.
  // The deterministic-fallback path returns before the catch and keeps its
  // charge, because a fallback strategy is still a delivered strategy.
  let chargedForRefund: { workspaceId: string; entryId: string } | null = null
  let refundAdmin: Parameters<typeof refundCredits>[0] | null = null
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    /*
     * Size-capped rather than a bare req.json(). Bios and avoid lists are the
     * caller-controlled text that reaches the model, credits are charged flat
     * per call, and the platform key pays for any workspace without its own —
     * so an unbounded body is a bill, not just a big request.
     */
    const body = await parseJsonObject(req, 32_768)
    // parseJsonObject answers Record<string, unknown>, so the shape is asserted
    // once here rather than at every use.
    let { clientName, clientBio, clientEmail, prospectName, prospectBio } = body as {
      clientName?: string
      clientBio?: string
      clientEmail?: string
      prospectName?: string
      prospectBio?: string
    }
    const oldQuery = typeof body.oldQuery === 'string' ? body.oldQuery : undefined
    const queryCount = resolveQueryCount(body.queryCount)
    // Searches a previous run already used. Repeating them returns the same
    // shows, so a second run on the same profile should look elsewhere.
    // Bounded and flattened: this is the one caller-controlled string that
    // reaches the prompt, and a newline in it would let an entry stop being a
    // list item and start being an instruction.
    const avoidQueries: string[] = Array.isArray(body.avoidQueries)
      ? body.avoidQueries
        .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim() !== '')
        .map((entry: string) => entry.replace(/\s+/gu, ' ').trim().slice(0, 200))
        .slice(0, 40)
      : []
    const scopedRequest = body.workspaceId !== undefined
      || body.clientId !== undefined
      || body.prospectDashboardId !== undefined

    let anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || ''
    let metering: {
      admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']
      workspaceId: string
      clientId: string | null
      referenceKind: string
      referenceId: string
      byoKeyUsed: boolean
    } | null = null

    if (scopedRequest) {
      const workspaceId = requireUuid(body.workspaceId, 'workspaceId')
      const context = await requireAuthenticatedUser(req)
      await requireWorkspaceFeatureAccess(context, workspaceId)
      const hasClient = body.clientId !== undefined
      const hasProspect = body.prospectDashboardId !== undefined
      if (Number(hasClient) + Number(hasProspect) !== 1) {
        throw new HttpError(400, 'INVALID_RESEARCH_TARGET', 'Choose exactly one client or prospect research target')
      }

      const resolvedKey = await resolveAiKey(context.admin, workspaceId, 'anthropic')
      const byoKeyUsed = resolvedKey?.source === 'workspace'
      if (resolvedKey) anthropicApiKey = resolvedKey.apiKey
      metering = {
        admin: context.admin,
        workspaceId,
        clientId: hasClient ? String(body.clientId) : null,
        referenceKind: hasProspect ? 'prospect_dashboard' : 'client',
        referenceId: String(hasProspect ? body.prospectDashboardId : body.clientId),
        byoKeyUsed,
      }
      const queryCharge = await chargeCredits(context.admin, {
        workspaceId,
        operationType: 'query_generation',
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
        clientId: metering.clientId,
        actorUserId: context.user.id,
        byoKeyUsed,
      })
      if (queryCharge.entryId && !queryCharge.replayed) {
        chargedForRefund = { workspaceId, entryId: queryCharge.entryId }
        refundAdmin = context.admin
      }

      if (hasProspect) {
        const prospectDashboardId = requireUuid(body.prospectDashboardId, 'prospectDashboardId')
        const { data: scopedProspect, error: scopedProspectError } = await context.admin
          .from('prospect_dashboards')
          .select('id,workspace_id,prospect_name,prospect_bio,lifecycle_status,is_active')
          .eq('id', prospectDashboardId)
          .eq('workspace_id', workspaceId)
          .neq('lifecycle_status', 'archived')
          .eq('is_active', true)
          .maybeSingle()
        if (scopedProspectError) {
          throw new HttpError(500, 'PROSPECT_CONTEXT_UNAVAILABLE', 'The prospect profile could not be loaded')
        }
        if (!scopedProspect || scopedProspect.workspace_id !== workspaceId) {
          throw new HttpError(404, 'PROSPECT_NOT_FOUND', 'Active workspace prospect not found')
        }
        prospectName = scopedProspect.prospect_name
        prospectBio = scopedProspect.prospect_bio
        clientName = undefined
        clientBio = undefined
        clientEmail = undefined
      } else {
        const clientId = requireUuid(body.clientId, 'clientId')
        const { data: scopedClient, error: scopedClientError } = await context.admin
          .from('clients')
          .select('id,workspace_id,name,email,bio,status')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .maybeSingle()

        if (scopedClientError) {
          throw new HttpError(500, 'CLIENT_CONTEXT_UNAVAILABLE', 'The client profile could not be loaded')
        }
        if (!scopedClient || scopedClient.workspace_id !== workspaceId) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'This client is not in this workspace')
        }
        // Named rather than folded into "not found": a paused client is a
        // state the operator can change, a missing one is not.
        if (scopedClient.status !== 'active') {
          throw new HttpError(
            409,
            'CLIENT_NOT_ACTIVE',
            `This client is ${scopedClient.status}. Reactivate them to run this.`,
          )
        }
        clientName = scopedClient.name
        clientBio = scopedClient.bio
        clientEmail = scopedClient.email
        prospectName = undefined
        prospectBio = undefined
      }
    } else {
      await requirePlatformAdminOrService(req)
    }

    // Type validation
    if (clientName !== undefined && typeof clientName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (clientBio !== undefined && typeof clientBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectName !== undefined && typeof prospectName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectBio !== undefined && typeof prospectBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Support both client and prospect mode
    const targetName = prospectName || clientName
    const targetBio = prospectBio || clientBio
    const isProspectMode = !!prospectName

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [PODCAST FINDER] Query Generation Request')
    console.log(`   Mode: ${isProspectMode ? 'PROSPECT' : 'CLIENT'}`)
    console.log(`   Name: ${targetName?.substring(0, 50)}`)
    console.log(`   Bio length: ${targetBio?.length || 0} characters`)
    console.log(`   ${oldQuery ? 'Regenerating' : `Generating ${queryCount}`} queries`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (!targetBio || targetBio.trim().length === 0) {
      console.error('❌ [ERROR] Bio is required but was empty')
      return new Response(
        JSON.stringify({ error: `${isProspectMode ? 'Prospect' : 'Client'} bio is required` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    const meterUsage = async (message: { usage?: { input_tokens?: number; output_tokens?: number } } | null) => {
      if (!metering || !message) return
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'query_generation',
        usage: {
          anthropicInputTokens: message.usage?.input_tokens ?? 0,
          anthropicOutputTokens: message.usage?.output_tokens ?? 0,
        },
        usedByoKey: metering.byoKeyUsed,
        clientId: metering.clientId,
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
      })
    }

    // If oldQuery is provided, regenerate a single query
    if (oldQuery) {
      console.log('🔄 [REGENERATE] Replacing poor-performing query')
      console.log(`   Old query: ${oldQuery.substring(0, 100)}`)

      const prompt = `You are an expert podcast researcher using Podscan.fm.

Your task: Generate a *new*, high-volume podcast search query (3–7 words) for Podscan.fm,
designed to return as many relevant podcasts as possible.

The query should be a phrase or combination of phrases likely to appear in the TITLE of a podcast.
- Stay broad, but always relevant to the ${isProspectMode ? 'prospect' : 'client'}'s domain
- Use double quotes "like this" for exact phrases (e.g., "leadership podcast")
- Use * wildcards within quoted phrases (e.g., "leadership * podcast")
- Use Boolean operators (AND, OR, NOT) to combine multiple phrases
- Use Podscan's documented double-quote syntax for every exact phrase
- The new query must NOT be a duplicate of or too similar to: "${oldQuery}"
- Do not use the ${isProspectMode ? 'prospect' : 'client'}'s name or brand

Based on ${isProspectMode ? 'prospect' : 'client'} data:
- Name: ${targetName}
- Bio: ${targetBio}

Return exactly one new query as JSON:
{"query": "your query here"}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations. Just the raw JSON object.`

      console.log('🤖 [AI] Calling Claude Opus 4.5 to generate new query...')

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 100,
        temperature: 0.9,
        messages: [{ role: 'user', content: prompt }],
      }).catch((error) => {
        console.warn('Query regeneration provider was unavailable; using deterministic strategy', error)
        return null
      })
      await meterUsage(message)

      if (!message) {
        const query = fallbackReplacementQuery(targetName, targetBio, oldQuery)
        return new Response(
          JSON.stringify({ query, source: 'deterministic' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const content = message.content[0]
      if (content.type !== 'text') {
        const query = fallbackReplacementQuery(targetName, targetBio, oldQuery)
        return new Response(
          JSON.stringify({ query, source: 'deterministic' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Strip markdown code blocks if present
      let jsonText = content.text.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      }

      console.log('📝 [AI RESPONSE] Raw:', content.text.substring(0, 200))
      console.log('🧹 [CLEANED] Parsed JSON:', jsonText.substring(0, 200))

      let parsed: { query?: unknown }
      try {
        parsed = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('❌ [JSON PARSE ERROR]', parseError)
        console.error('   Failed text:', jsonText)
        const query = fallbackReplacementQuery(targetName, targetBio, oldQuery)
        return new Response(
          JSON.stringify({ query, source: 'deterministic' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (typeof parsed.query !== 'string' || !parsed.query.trim() || parsed.query === oldQuery) {
        const query = fallbackReplacementQuery(targetName, targetBio, oldQuery)
        return new Response(
          JSON.stringify({ query, source: 'deterministic' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ [REGENERATE SUCCESS] New query generated!')
      console.log(`   New query: ${parsed.query}`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      return new Response(
        JSON.stringify({ query: parsed.query }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate the requested number of queries
    console.log(`🤖 [AI] Generating ${queryCount} strategic podcast search queries...`)
    console.log(`   Using Claude Opus 4.5 with temperature 0.8`)

    const prompt = `You are an expert podcast researcher using Podscan.fm.
Your goal: Generate ${queryCount} *broad, high-volume, but relevant* podcast search queries (each 3–7 words),
designed to return the most possible relevant podcasts in Podscan.fm—using advanced search syntax.

**Every query should be something likely to appear in the TITLE of a podcast, and should be
relevant to the ${isProspectMode ? 'prospect' : 'client'}'s domain.**

STRATEGIC MIX (IMPORTANT):
Spread the ${queryCount} queries across these kinds, in roughly this proportion:
1. Precise queries (${isProspectMode ? 'prospect' : 'client'}'s exact niche + specific terms) — about a fifth
2. Broad synonym queries (use OR to combine 3-5 related terms) — about two fifths
3. Wildcard queries (use * for variation: startup * podcast, business * stories) — about a fifth
4. Adjacent category queries (related but slightly different audience) — about a fifth
Every query must reach podcasts the others would miss. Near-duplicates waste a
search: the whole point of asking for ${queryCount} is ${queryCount} different corners of the index.

ADVANCED SEARCH SYNTAX RULES:
- Use double quotes "like this" for exact phrases (e.g., "digital marketing", "business leadership")
- Use * wildcards within quoted phrases for broader matching (e.g., "startup * podcast", "business * stories")
- Use Boolean operators (AND, OR, NOT) to combine multiple search terms
  Example: "B2B marketing" OR "SaaS marketing" OR "growth hacking"
- At least 2 queries MUST use wildcards (*) within quoted phrases
- At least 2 queries MUST use OR operators to combine multiple phrases
- Combine synonyms, adjacent industries, and related terms to cast the widest net while staying on-topic
- IMPORTANT: Podscan exact phrases require double quotes. Do not use single quotes as phrase operators.

QUALITY GUIDELINES:
- Do **not** use the ${isProspectMode ? 'prospect' : 'client'}'s name, brand, or job title in queries
- **Avoid** generic one-word queries like just "business", "success", "leadership"
- If you must use broad terms, always pair them with a specific modifier (e.g., "business leadership", "organizational culture")
- No duplicate queries or near-duplicates
- Think laterally - if ${isProspectMode ? 'prospect' : 'client'} is in SaaS, also search marketing/sales/tech podcasts
- Queries should find 100-300 podcasts each (broad is good!)

**Examples of excellent, high-coverage queries:**
- "business leadership" OR "executive coaching"
- "startup * podcast" OR "founder * stories"
- "digital marketing" OR "growth marketing" OR "content strategy"
- "sales * leaders" OR "revenue growth"
- "women in tech" OR "technology innovation"

${avoidQueries.length > 0 ? `ALREADY SEARCHED — do not repeat these or anything close to them, and deliberately go after different vocabulary, adjacent industries, and different show formats:
${avoidQueries.map((query: string) => `- ${query}`).join('\n')}

` : ''}Based on the following ${isProspectMode ? 'prospect' : 'client'} data:
- Name: ${targetName}
- Bio: ${targetBio}
${clientEmail ? `- Email: ${clientEmail}` : ''}

Return exactly ${queryCount} queries as a JSON object with this exact format:
{
  "queries": [
${Array.from({ length: queryCount }, (_unused, index) => `    "query ${index + 1} here"`).join(',\n')}
  ]
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, no explanations, no additional text. Just the raw JSON object starting with { and ending with }.`

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      // Scaled with the request: twenty OR-chained queries do not fit in the
      // 500 that five needed, and truncation fails silently all the way down to
      // the deterministic fallback.
      max_tokens: Math.min(4000, 400 + (queryCount * 80)),
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    }).catch((error) => {
      console.warn('Query generation provider was unavailable; using deterministic strategy', error)
      return null
    })
    await meterUsage(message)

    if (!message) {
      return new Response(
        JSON.stringify({ queries: fallbackQueries(targetName, targetBio, queryCount, avoidQueries), source: 'deterministic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const content = message.content[0]
    if (content.type !== 'text') {
      return new Response(
        JSON.stringify({ queries: fallbackQueries(targetName, targetBio, queryCount, avoidQueries), source: 'deterministic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Strip markdown code blocks if present
    let jsonText = content.text.trim()
    if (jsonText.startsWith('```')) {
      // Remove ```json or ``` at start and ``` at end
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    }

    // Fix: Claude doesn't escape quotes properly in the query strings
    // We need to manually fix the JSON by escaping quotes inside array values

    try {
      // First attempt: try parsing as-is
      const parsed = JSON.parse(jsonText)

      /*
       * Anything usable is used. Requiring an exact count threw away a whole
       * run because a model returned four queries or six, which is the kind of
       * strictness that makes a feature look broken for no gain — a short list
       * is topped up from the deterministic fallback below.
       */
      /*
       * Only usable strings survive. The old exact-count check incidentally
       * rejected malformed shapes; relaxing it let numbers, objects, nulls and
       * empty strings through to a caller that calls .trim() on each one.
       */
      const avoidSet = new Set(avoidQueries.map((entry) => entry.trim().toLowerCase()))
      const usable: string[] = Array.isArray(parsed.queries)
        ? parsed.queries
          .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim() !== '')
          .map((entry: string) => entry.trim())
          .filter((entry: string) => !avoidSet.has(entry.toLowerCase()))
        : []
      const deduped = Array.from(new Map(usable.map((entry) => [entry.toLowerCase(), entry])).values())
      if (deduped.length === 0) {
        console.error('❌ [ERROR] Invalid response format: no usable queries returned')
        throw new Error('Invalid response format: no usable queries returned')
      }
      parsed.queries = deduped.slice(0, queryCount)
      if (parsed.queries.length < queryCount) {
        const topUp = fallbackQueries(targetName, targetBio, queryCount, [...avoidQueries, ...parsed.queries])
        parsed.queries = [...parsed.queries, ...topUp].slice(0, queryCount)
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`✅ [SUCCESS] Generated ${parsed.queries.length} podcast search queries!`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📋 [QUERIES]:')
      parsed.queries.forEach((q: string, i: number) => {
        console.log(`   ${i + 1}. ${q}`)
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🚀 [NEXT STEP] Frontend will use these to search Podscan API')
      console.log('   Expected: 100-300 podcasts per query = 500-1500 total results')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

      return new Response(
        JSON.stringify({ queries: parsed.queries }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } catch (parseError) {
      console.log('First parse attempt failed, trying manual extraction...')
      const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError)
      console.log('Parse error:', parseErrorMessage)

      // Second attempt: Extract array values by splitting on "," pattern
      // Match the array content between "queries": [ and ]
      const arrayMatch = jsonText.match(/"queries"\s*:\s*\[(.*)\]/s)

      if (arrayMatch) {
        const arrayContent = arrayMatch[1]
        console.log('Matched array content:', arrayContent)

        // Split by "," pattern (quote-comma-quote between array elements)
        const rawQueries = arrayContent.split('","')

        // Clean up: remove leading/trailing quotes and whitespace
        const queries = rawQueries.map(q =>
          // Only the JSON string delimiters come off. Stripping a leading and
          // trailing quote unconditionally mangled exactly what this path is
          // for: "a" OR "b" became a" OR "b, which is invalid Podscan syntax.
          q.trim().replace(/^"(.*)"$/su, '$1').replace(/\\"/gu, '"')
        )

        console.log('Extracted queries via split:', queries)
        console.log('Query count:', queries.length)

        const avoidSet = new Set(avoidQueries.map((entry) => entry.trim().toLowerCase()))
        const usable = queries
          .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim() !== '')
          .map((entry: string) => entry.trim())
          .filter((entry: string) => !avoidSet.has(entry.toLowerCase()))
        const recovered = Array.from(new Map(usable.map((entry) => [entry.toLowerCase(), entry])).values())
          .slice(0, queryCount)
        if (recovered.length > 0) {
          // Recovery is not an excuse to ignore the count: top up like the
          // parsed path does rather than returning one query for a request of
          // twenty, and never return a bare empty string as a search.
          const topped = recovered.length < queryCount
            ? [...recovered, ...fallbackQueries(targetName, targetBio, queryCount, [...avoidQueries, ...recovered])].slice(0, queryCount)
            : recovered
          return new Response(
            JSON.stringify({ queries: topped }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          console.error('Extraction produced no queries')
        }
      } else {
        console.error('Could not match array pattern in JSON text')
      }

      console.error('Manual extraction failed')
      console.error('Original text:', jsonText)
      return new Response(
        JSON.stringify({ queries: fallbackQueries(targetName, targetBio, queryCount, avoidQueries), source: 'deterministic' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  } catch (error) {
    console.error('Error:', error)
    if (chargedForRefund && refundAdmin) {
      await refundCredits(refundAdmin, {
        workspaceId: chargedForRefund.workspaceId,
        entryId: chargedForRefund.entryId,
        reason: 'query generation failed after the charge',
      })
    }
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
        ...(error instanceof HttpError ? { code: error.code } : {}),
      }),
      { status: error instanceof HttpError ? error.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
