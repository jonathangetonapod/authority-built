// Best-effort recent-episode fetch from Podscan for the research pipeline.
// Research must degrade gracefully — every failure path returns [] and the
// prompts are written to handle missing episode data explicitly.

export interface RecentEpisode {
  title: string
  description: string
  transcript: string | null
  posted_at: string | null
}

const PODSCAN_BASE = 'https://podscan.fm/api/v1'
const MAX_EPISODES = 3
const MAX_TRANSCRIPT_CHARS = 60_000

function podscanKey(): string | null {
  return (Deno.env.get('PODSCAN_API_KEY') || Deno.env.get('PODSCAN_TOKEN'))?.trim() || null
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

// Host names from Podscan's aggregated episode analysis. Best-effort like
// everything else in this module — failures return [].
export async function fetchPodcastHosts(podscanId: string): Promise<string[]> {
  const apiKey = podscanKey()
  if (!apiKey || !/^[a-zA-Z0-9_-]+$/.test(podscanId)) return []
  try {
    const response = await fetch(`${PODSCAN_BASE}/podcasts/${encodeURIComponent(podscanId)}/analysis`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return []
    const payload = await response.json().catch(() => null) as { hosts?: unknown[] } | null
    if (!Array.isArray(payload?.hosts)) return []
    return payload.hosts.flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const name = (raw as Record<string, unknown>).name
      return typeof name === 'string' && name.trim() ? [name.trim().slice(0, 200)] : []
    }).slice(0, 5)
  } catch (_error) {
    console.warn('[Podcast Episodes] Host analysis fetch was unavailable')
    return []
  }
}

export async function fetchRecentEpisodes(podscanId: string): Promise<RecentEpisode[]> {
  const apiKey = podscanKey()
  if (!apiKey || !/^[a-zA-Z0-9_-]+$/.test(podscanId)) return []

  try {
    const url = new URL(`${PODSCAN_BASE}/podcasts/${encodeURIComponent(podscanId)}/episodes`)
    url.searchParams.set('per_page', String(MAX_EPISODES))
    url.searchParams.set('order_by', 'posted_at')
    url.searchParams.set('order_dir', 'desc')
    url.searchParams.set('show_full_podcast', 'false')
    // Plain prose keeps prompt input compact — no timestamps or speaker labels.
    url.searchParams.set('transcript_formatter', 'plain_text')
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      console.warn('[Podcast Episodes] Podscan returned a non-success status', response.status)
      return []
    }
    const payload = await response.json().catch(() => null) as
      | { episodes?: unknown[]; data?: unknown[] }
      | unknown[]
      | null
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.episodes)
        ? payload.episodes
        : Array.isArray(payload?.data)
          ? payload.data
          : []

    return rows.slice(0, MAX_EPISODES).flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const episode = raw as Record<string, unknown>
      const title = text(episode.episode_title ?? episode.title, 300)
      if (!title) return []
      const transcript = text(
        episode.episode_transcript ?? episode.transcript ?? episode.full_transcript,
        MAX_TRANSCRIPT_CHARS,
      )
      return [{
        title,
        description: text(episode.episode_description ?? episode.description, 5_000),
        transcript: transcript || null,
        posted_at: typeof episode.posted_at === 'string' ? episode.posted_at : null,
      }]
    })
  } catch (_error) {
    console.warn('[Podcast Episodes] Episode fetch was unavailable')
    return []
  }
}
