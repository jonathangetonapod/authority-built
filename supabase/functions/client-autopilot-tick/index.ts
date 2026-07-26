// Weekly client autopilot tick. Invoked by pg_cron via pg_net every 10
// minutes with a shared secret — no user JWT (verify_jwt = false). Each tick
// claims at most ONE due client and runs the discovery pipeline for it:
// AI query drafting → Podscan search → AI relevancy scoring → append the top
// matches to the client's list as awaiting review.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, writeAudit } from '../_shared/workspaceAuth.ts'
import { chargeCredits, logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import { ensureEpisodesCaptured } from '../_shared/podcastEpisodes.ts'

const PODSCAN_BASE = 'https://podscan.fm/api/v1'
const QUERY_COUNT = 4
const RESULTS_PER_QUERY = 25
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface CandidatePodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  podcast_categories: unknown
  language: string | null
  region: string | null
  podcast_email: string | null
  rss_url: string | null
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function anthropicJson(
  apiKey: string,
  system: string,
  content: string,
  maxTokens: number,
  usage: { input: number; output: number },
): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`anthropic returned ${response.status}`)
  const payload = await response.json() as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  usage.input += payload.usage?.input_tokens ?? 0
  usage.output += payload.usage?.output_tokens ?? 0
  const text = (payload.content ?? []).find((block) => block.type === 'text')?.text ?? ''
  return JSON.parse(text.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''))
}

async function searchPodscan(query: string): Promise<CandidatePodcast[]> {
  const apiKey = (Deno.env.get('PODSCAN_API_KEY') || Deno.env.get('PODSCAN_TOKEN'))?.trim()
  if (!apiKey) return []
  const minPostedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const url = new URL(`${PODSCAN_BASE}/podcasts/search`)
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', String(RESULTS_PER_QUERY))
  url.searchParams.set('order_by', 'best_match')
  url.searchParams.set('order_dir', 'desc')
  url.searchParams.set('search_fields', 'name,description,publisher_name')
  url.searchParams.set('has_guests', 'true')
  url.searchParams.set('min_last_episode_posted_at', minPostedAt)
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return []
    const payload = await response.json() as { podcasts?: Array<Record<string, unknown>> }
    return (payload.podcasts ?? []).flatMap((raw): CandidatePodcast[] => {
      const id = typeof raw.podcast_id === 'string' ? raw.podcast_id : ''
      const name = typeof raw.podcast_name === 'string' ? raw.podcast_name : ''
      if (!id || !name) return []
      const reach = (raw.reach ?? {}) as Record<string, unknown>
      const itunes = (reach.itunes ?? {}) as Record<string, unknown>
      return [{
        podcast_id: id,
        podcast_name: name.slice(0, 500),
        podcast_description: typeof raw.podcast_description === 'string' ? raw.podcast_description.slice(0, 5_000) : null,
        podcast_image_url: typeof raw.podcast_image_url === 'string' ? raw.podcast_image_url : null,
        podcast_url: typeof raw.podcast_url === 'string' ? raw.podcast_url : null,
        publisher_name: typeof raw.publisher_name === 'string' ? raw.publisher_name : null,
        itunes_rating: typeof itunes.itunes_rating_average === 'string'
          ? Number.parseFloat(itunes.itunes_rating_average) || null
          : null,
        episode_count: typeof raw.episode_count === 'number' ? raw.episode_count : null,
        audience_size: typeof reach.audience_size === 'number' ? reach.audience_size : null,
        last_posted_at: typeof raw.last_posted_at === 'string' ? raw.last_posted_at : null,
        podcast_categories: Array.isArray(raw.podcast_categories) ? raw.podcast_categories : null,
        language: typeof raw.language === 'string' ? raw.language : null,
        region: typeof raw.region === 'string' ? raw.region : null,
        podcast_email: typeof reach.email === 'string' ? reach.email : null,
        rss_url: typeof raw.rss_url === 'string' ? raw.rss_url : null,
      }]
    })
  } catch (_error) {
    console.warn('[Autopilot] Podscan search was unavailable')
    return []
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })
  const secret = Deno.env.get('AUTOPILOT_TICK_SECRET')?.trim()
  if (!secret || req.headers.get('x-autopilot-secret') !== secret) {
    return json(401, { error: 'UNAUTHORIZED' })
  }

  const admin = createAdminClient()

  // Claim exactly one due client; pushing next_run_at forward first makes the
  // claim safe against overlapping ticks.
  const { data: due } = await admin
    .from('client_autopilot_settings')
    .select('workspace_id, client_id, max_weekly_adds, min_score, next_run_at')
    .eq('enabled', true)
    .lte('next_run_at', new Date().toISOString())
    .order('next_run_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!due) return json(200, { processed: 0 })

  const { data: claimed } = await admin
    .from('client_autopilot_settings')
    .update({ next_run_at: new Date(Date.now() + WEEK_MS).toISOString(), updated_at: new Date().toISOString() })
    .eq('workspace_id', due.workspace_id)
    .eq('client_id', due.client_id)
    .eq('next_run_at', due.next_run_at)
    .select('client_id')
    .maybeSingle()
  if (!claimed) return json(200, { processed: 0, note: 'claimed by another tick' })

  const usage = { input: 0, output: 0 }
  let podscanCalls = 0
  let usedByoKey = false
  try {
    const [{ data: client }, { data: ownerMembership }] = await Promise.all([
      admin.from('clients')
        .select('id, name, bio, status')
        .eq('workspace_id', due.workspace_id)
        .eq('id', due.client_id)
        .maybeSingle(),
      admin.from('workspace_memberships')
        .select('user_id')
        .eq('workspace_id', due.workspace_id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle(),
    ])
    if (!client || client.status !== 'active' || !client.bio) {
      return json(200, { processed: 1, skipped: 'client inactive or missing bio' })
    }

    const anthropicKey = await resolveAiKey(admin, due.workspace_id, 'anthropic')
    if (!anthropicKey) return json(200, { processed: 1, skipped: 'no anthropic key' })
    usedByoKey = anthropicKey.source === 'workspace'

    await chargeCredits(admin, {
      workspaceId: due.workspace_id,
      operationType: 'query_generation',
      referenceKind: 'autopilot',
      referenceId: due.client_id,
      clientId: due.client_id,
      byoKeyUsed: usedByoKey,
    })

    const queriesRaw = await anthropicJson(
      anthropicKey.apiKey,
      'You draft podcast search queries. Return ONLY a JSON array of strings.',
      `Draft ${QUERY_COUNT} distinct podcast-search queries (2-4 words each, plain keywords, no operators) to find active interview podcasts where this person would be a strong guest:\n\n${String(client.bio).slice(0, 4_000)}`,
      400,
      usage,
    )
    const queries = (Array.isArray(queriesRaw) ? queriesRaw : [])
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 1)
      .slice(0, QUERY_COUNT)
    if (queries.length === 0) throw new Error('no queries generated')

    const { data: existingRows } = await admin
      .from('client_dashboard_podcasts')
      .select('podcast_id')
      .eq('client_id', due.client_id)
    const existing = new Set((existingRows ?? []).map((row) => String(row.podcast_id).toLowerCase()))

    const collected = new Map<string, CandidatePodcast>()
    for (const query of queries) {
      podscanCalls += 1
      for (const podcast of await searchPodscan(query)) {
        const key = podcast.podcast_id.toLowerCase()
        if (!existing.has(key) && !collected.has(key)) collected.set(key, podcast)
      }
      await new Promise((resolve) => setTimeout(resolve, 600))
    }
    const candidates = [...collected.values()].slice(0, 40)
    if (candidates.length === 0) {
      await admin.from('client_autopilot_settings')
        .update({ last_run_at: new Date().toISOString(), last_run_added: 0 })
        .eq('workspace_id', due.workspace_id)
        .eq('client_id', due.client_id)
      return json(200, { processed: 1, added: 0 })
    }

    const scoredRaw = await anthropicJson(
      anthropicKey.apiKey,
      'You score podcast-guest fit. Return ONLY a JSON array of {"podcast_id": string, "score": number 0-100, "reason": string (one sentence)}.',
      `Guest profile:\n${String(client.bio).slice(0, 3_000)}\n\nScore how strong a fit each podcast is for this guest:\n${JSON.stringify(candidates.map((podcast) => ({
        podcast_id: podcast.podcast_id,
        name: podcast.podcast_name,
        description: (podcast.podcast_description ?? '').slice(0, 300),
        categories: podcast.podcast_categories,
      })))}`,
      4_000,
      usage,
    )
    const scores = new Map(
      (Array.isArray(scoredRaw) ? scoredRaw : []).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const row = entry as Record<string, unknown>
        return typeof row.podcast_id === 'string' && typeof row.score === 'number'
          ? [[row.podcast_id, { score: Math.round(row.score), reason: typeof row.reason === 'string' ? row.reason : '' }]] as const
          : []
      }),
    )

    const winners = candidates
      .map((podcast) => ({ podcast, ...(scores.get(podcast.podcast_id) ?? { score: -1, reason: '' }) }))
      .filter((entry) => entry.score >= due.min_score)
      .sort((left, right) => right.score - left.score)
      .slice(0, due.max_weekly_adds)

    let added = 0
    if (winners.length > 0) {
      await admin.rpc('merge_global_podcast_catalog_batch_v1', {
        p_workspace_id: due.workspace_id,
        p_actor_user_id: ownerMembership?.user_id ?? null,
        p_source: 'workspace_shortlist',
        p_client_id: due.client_id,
        p_prospect_dashboard_id: null,
        p_podcasts: winners.map(({ podcast }) => ({
          podscan_id: podcast.podcast_id,
          podcast_name: podcast.podcast_name,
          podcast_description: podcast.podcast_description,
          podcast_image_url: podcast.podcast_image_url,
          podcast_url: podcast.podcast_url,
          publisher_name: podcast.publisher_name,
          itunes_rating: podcast.itunes_rating,
          episode_count: podcast.episode_count,
          audience_size: podcast.audience_size,
          last_posted_at: podcast.last_posted_at,
          podcast_categories: podcast.podcast_categories,
          language: podcast.language,
          region: podcast.region,
          podscan_email: podcast.podcast_email,
          rss_url: podcast.rss_url,
        })),
      })

      const { data: lastPosition } = await admin
        .from('client_dashboard_podcasts')
        .select('display_order')
        .eq('client_id', due.client_id)
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const startingOrder = lastPosition ? Number(lastPosition.display_order) + 1 : 0
      const { data: inserted, error: insertError } = await admin
        .from('client_dashboard_podcasts')
        .upsert(
          winners.map(({ podcast, score, reason }, index) => ({
            client_id: due.client_id,
            podcast_id: podcast.podcast_id,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description,
            podcast_image_url: podcast.podcast_image_url,
            podcast_url: podcast.podcast_url,
            publisher_name: podcast.publisher_name,
            itunes_rating: podcast.itunes_rating,
            episode_count: podcast.episode_count,
            audience_size: podcast.audience_size,
            last_posted_at: podcast.last_posted_at,
            podcast_categories: podcast.podcast_categories,
            visibility: 'visible',
            display_order: startingOrder + index,
            operator_notes: `Autopilot ${score} fit — ${reason}`.slice(0, 500),
          })),
          { onConflict: 'client_id,podcast_id', ignoreDuplicates: true },
        )
        .select('podcast_id')
      if (insertError) throw new Error('autopilot shortlist insert failed')
      added = (inserted ?? []).length

      // Capture episode metadata for each added show while it is fresh, so
      // the pitch dialog and research never have to. Best-effort: a Podscan
      // hiccup never fails the tick, and the dialog self-heals later anyway.
      for (const row of (inserted ?? [])) {
        try {
          await ensureEpisodesCaptured(admin, String(row.podcast_id))
        } catch (_error) {
          // Ignore — the next flow that needs episodes retries.
        }
      }
    }

    await admin.from('client_autopilot_settings')
      .update({ last_run_at: new Date().toISOString(), last_run_added: added })
      .eq('workspace_id', due.workspace_id)
      .eq('client_id', due.client_id)
    await writeAudit(admin, {
      workspaceId: due.workspace_id,
      actorUserId: ownerMembership?.user_id ?? null,
      action: 'workspace.client.autopilot.discovered',
      entityType: 'client',
      entityId: due.client_id,
      metadata: { added, candidates: candidates.length, queries },
    })
    await logOperationCost(admin, {
      workspaceId: due.workspace_id,
      operationType: 'compatibility_scoring',
      usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls },
      usedByoKey,
      clientId: due.client_id,
      referenceKind: 'autopilot',
      referenceId: due.client_id,
    })

    return json(200, { processed: 1, added, candidates: candidates.length })
  } catch (error) {
    console.error('[Autopilot] Tick failed', error instanceof Error ? error.message : '')
    await logOperationCost(admin, {
      workspaceId: due.workspace_id,
      operationType: 'compatibility_scoring',
      usage: { anthropicInputTokens: usage.input, anthropicOutputTokens: usage.output, podscanCalls },
      usedByoKey,
      clientId: due.client_id,
      referenceKind: 'autopilot',
      referenceId: due.client_id,
    })
    return json(200, { processed: 1, error: 'TICK_FAILED' })
  }
})
