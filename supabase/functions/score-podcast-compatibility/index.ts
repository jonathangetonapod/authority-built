import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'
import {
  HttpError,
  requireAuthenticatedUser,
  requirePlatformAdminOrService,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastForScoring {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

const SCORE_STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'business', 'company', 'could', 'from', 'have', 'helps',
  'into', 'more', 'most', 'over', 'podcast', 'their', 'them', 'they', 'this', 'through', 'using', 'what',
  'when', 'where', 'which', 'while', 'with', 'work', 'years', 'your',
])

function meaningfulTokens(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/gu) || [])
    .filter((token) => !SCORE_STOP_WORDS.has(token)))
}

function deterministicScore(targetBio: string, podcast: PodcastForScoring) {
  const targetTokens = meaningfulTokens(targetBio)
  const podcastText = [
    podcast.podcast_name,
    podcast.publisher_name,
    podcast.podcast_description,
    podcast.podcast_categories?.map((category) => category.category_name).join(' '),
  ].filter(Boolean).join(' ')
  const shared = Array.from(meaningfulTokens(podcastText)).filter((token) => targetTokens.has(token)).slice(0, 4)
  const score = shared.length === 0 ? 5 : Math.min(9, 5.5 + shared.length)
  return {
    score,
    reasoning: shared.length > 0
      ? `The show overlaps with the profile’s ${shared.join(', ')} themes. Review the audience and recent episodes to confirm the strongest angle.`
      : 'The show has broad guest potential, but the available description has limited direct topic overlap. Review it before adding it to the shortlist.',
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json() as {
      clientBio?: string
      prospectBio?: string
      podcasts: PodcastForScoring[]
      workspaceId?: string
      clientId?: string
      prospectDashboardId?: string
    }
    let { clientBio, prospectBio } = body
    const scopedRequest = body.workspaceId !== undefined
      || body.clientId !== undefined
      || body.prospectDashboardId !== undefined
    // Workspace callers are capped: one request scores at most 20 podcasts.
    const podcasts = scopedRequest && Array.isArray(body.podcasts)
      ? body.podcasts.slice(0, 20)
      : body.podcasts

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
      await chargeCredits(context.admin, {
        workspaceId,
        operationType: 'compatibility_scoring',
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
        clientId: metering.clientId,
        actorUserId: context.user.id,
        byoKeyUsed,
      })

      if (hasProspect) {
        const prospectDashboardId = requireUuid(body.prospectDashboardId, 'prospectDashboardId')
        const { data: scopedProspect, error: scopedProspectError } = await context.admin
          .from('prospect_dashboards')
          .select('id,workspace_id,prospect_bio,lifecycle_status,is_active')
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
        prospectBio = scopedProspect.prospect_bio
        clientBio = undefined
      } else {
        const clientId = requireUuid(body.clientId, 'clientId')
        const { data: scopedClient, error: scopedClientError } = await context.admin
          .from('clients')
          .select('id,workspace_id,bio,status')
          .eq('id', clientId)
          .eq('workspace_id', workspaceId)
          .eq('status', 'active')
          .maybeSingle()

        if (scopedClientError) {
          throw new HttpError(500, 'CLIENT_CONTEXT_UNAVAILABLE', 'The client profile could not be loaded')
        }
        if (!scopedClient || scopedClient.workspace_id !== workspaceId) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Active workspace client not found')
        }
        clientBio = scopedClient.bio
        prospectBio = undefined
      }
    } else {
      await requirePlatformAdminOrService(req)
    }

    // Type validation
    if (clientBio !== undefined && typeof clientBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectBio !== undefined && typeof prospectBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcasts)) {
      return new Response(
        JSON.stringify({ error: 'podcasts must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Support both client and prospect mode
    const targetBio = prospectBio || clientBio
    const isProspectMode = !!prospectBio

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [PODCAST FINDER] Compatibility Scoring Request')
    console.log(`   Mode: ${isProspectMode ? 'PROSPECT' : 'CLIENT'}`)
    console.log(`   Bio length: ${targetBio?.length || 0} characters`)
    console.log(`   Podcasts to score: ${podcasts?.length || 0}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (!targetBio || targetBio.trim().length === 0) {
      console.error('❌ [ERROR] Bio is required but was empty')
      return new Response(
        JSON.stringify({ error: `${isProspectMode ? 'Prospect' : 'Client'} bio is required for compatibility scoring` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!podcasts || !Array.isArray(podcasts) || podcasts.length === 0) {
      console.error('❌ [ERROR] Podcasts array is empty or invalid')
      return new Response(
        JSON.stringify({ error: 'Podcasts array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey })

    console.log('🤖 [AI] Using Claude Haiku 4.5 for fast batch scoring...')
    console.log(`   Processing ${podcasts.length} podcasts in parallel`)

    let successCount = 0
    let errorCount = 0
    let anthropicInputTokens = 0
    let anthropicOutputTokens = 0

    // Score each podcast
    const scores = await Promise.all(
      podcasts.map(async (podcast, index) => {
        try {
          const podcastInfo = `
Podcast Name: ${podcast.podcast_name}
Host/Publisher: ${podcast.publisher_name || 'Unknown'}
Description: ${podcast.podcast_description || 'No description available'}
Categories: ${podcast.podcast_categories?.map(c => c.category_name).join(', ') || 'None'}
Audience Size: ${podcast.audience_size ? podcast.audience_size.toLocaleString() : 'Unknown'}
Episodes: ${podcast.episode_count || 'Unknown'}
          `.trim()

          const prompt = `You are a podcast booking expert. Rate the compatibility (1-10) between this ${isProspectMode ? 'prospect' : 'client'} and podcast.

${isProspectMode ? 'Prospect' : 'Client'} Bio:
${targetBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines:
- 9-10: Perfect match - ${isProspectMode ? 'prospect' : 'client'}'s expertise directly aligns with podcast's focus and audience
- 7-8: Strong match - related topics, good audience overlap
- 5-6: Moderate match - some relevance but not ideal
- 3-4: Weak match - tangentially related
- 1-2: Poor match - not relevant

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`

          const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          })
          anthropicInputTokens += message.usage?.input_tokens ?? 0
          anthropicOutputTokens += message.usage?.output_tokens ?? 0

          const content = message.content[0]
          if (content.type !== 'text') {
            return { podcast_id: podcast.podcast_id, ...deterministicScore(targetBio, podcast) }
          }

          // Strip markdown code blocks if present
          let jsonText = content.text.trim()
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          }

          try {
            const parsed = JSON.parse(jsonText)
            successCount++
            if (successCount % 10 === 0 || successCount === podcasts.length) {
              console.log(`⏳ [PROGRESS] Scored ${successCount}/${podcasts.length} podcasts...`)
            }
            return {
              podcast_id: podcast.podcast_id,
              score: parsed.score,
              reasoning: parsed.reasoning
            }
          } catch (parseError) {
            console.warn(`⚠️  [PARSE WARNING] Failed to parse JSON for ${podcast.podcast_name.substring(0, 50)}`)
            // Fallback: try to extract just the score
            const match = content.text.match(/\b([1-9]|10)\b/)
            if (match) {
              successCount++
              return {
                podcast_id: podcast.podcast_id,
                score: parseInt(match[1], 10),
                reasoning: undefined
              }
            }
            errorCount++
            return { podcast_id: podcast.podcast_id, ...deterministicScore(targetBio, podcast) }
          }
        } catch (error) {
          console.error(`❌ [ERROR] Scoring ${podcast.podcast_name.substring(0, 50)}:`, error)
          errorCount++
          return { podcast_id: podcast.podcast_id, ...deterministicScore(targetBio, podcast) }
        }
      })
    )

    // Calculate statistics
    const validScores = scores.filter(s => s.score !== null)
    const highScores = validScores.filter(s => s.score && s.score >= 7)
    const avgScore = validScores.length > 0
      ? (validScores.reduce((sum, s) => sum + (s.score || 0), 0) / validScores.length).toFixed(1)
      : 'N/A'

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [SCORING COMPLETE] Batch processing finished!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 [STATISTICS]:')
    console.log(`   Total podcasts: ${podcasts.length}`)
    console.log(`   ✅ Successfully scored: ${successCount}`)
    console.log(`   ❌ Failed: ${errorCount}`)
    console.log(`   🎯 High scores (7+): ${highScores.length}`)
    console.log(`   📈 Average score: ${avgScore}/10`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 [NEXT STEP] Frontend will filter and rank by score')
    console.log(`   Recommended: Filter for scores >= 7 (${highScores.length} podcasts)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (metering) {
      await logOperationCost(metering.admin, {
        workspaceId: metering.workspaceId,
        operationType: 'compatibility_scoring',
        usage: { anthropicInputTokens, anthropicOutputTokens },
        usedByoKey: metering.byoKeyUsed,
        clientId: metering.clientId,
        referenceKind: metering.referenceKind,
        referenceId: metering.referenceId,
      })
    }

    return new Response(
      JSON.stringify({ scores }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
        ...(error instanceof HttpError ? { code: error.code } : {}),
      }),
      { status: error instanceof HttpError ? error.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
