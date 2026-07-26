// Best-effort recent-episode fetch from Podscan for the research pipeline,
// plus fetch-once persistence on the global podcast catalog. Research must
// degrade gracefully — every failure path returns [] / stored data and the
// prompts are written to handle missing episode data explicitly.

/** A host or guest from Podscan's per-episode speaker analysis. */
export interface EpisodePerson {
  name: string
  company: string | null
  role: string | null
}

export interface RecentEpisode {
  episode_id: string | null
  title: string
  description: string
  transcript: string | null
  posted_at: string | null
  url: string | null
  audio_url: string | null
  image_url: string | null
  duration_seconds: number | null
  word_count: number | null
  has_guests: boolean
  hosts: EpisodePerson[]
  guests: EpisodePerson[]
  summary: string | null
  keywords: string[]
  topics: string[]
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
      const metadata = (episode.metadata && typeof episode.metadata === 'object' && !Array.isArray(episode.metadata)
        ? episode.metadata
        : {}) as Record<string, unknown>
      const persons = (value: unknown, nameKey: string, companyKey: string, roleKey: string): EpisodePerson[] =>
        (Array.isArray(value) ? value : []).flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
          const record = entry as Record<string, unknown>
          const name = text(record[nameKey], 200).trim()
          if (!name) return []
          return [{
            name,
            company: text(record[companyKey], 200).trim() || null,
            role: text(record[roleKey], 200).trim() || null,
          }]
        }).slice(0, 6)
      const strings = (value: unknown, max: number): string[] =>
        (Array.isArray(value) ? value : []).flatMap((entry) =>
          typeof entry === 'string' && entry.trim() ? [entry.trim().slice(0, 120)] : []
        ).slice(0, max)
      return [{
        episode_id: typeof episode.episode_id === 'string' ? episode.episode_id : null,
        title,
        description: text(episode.episode_description ?? episode.description, 5_000),
        transcript: transcript || null,
        posted_at: typeof episode.posted_at === 'string' ? episode.posted_at : null,
        url: text(episode.episode_url, 500) || null,
        audio_url: text(episode.episode_audio_url, 500) || null,
        image_url: text(episode.episode_image_url, 500) || null,
        duration_seconds: typeof episode.episode_duration === 'number' ? episode.episode_duration : null,
        word_count: typeof episode.episode_word_count === 'number' ? episode.episode_word_count : null,
        has_guests: episode.episode_has_guests === true || metadata.has_guests === true,
        hosts: persons(metadata.hosts, 'host_name', 'host_company', 'host_occupation'),
        guests: persons(metadata.guests, 'guest_name', 'guest_company', 'guest_occupation'),
        summary: text(metadata.summary_long ?? metadata.summary_short, 2_000) || null,
        keywords: strings(metadata.summary_keywords, 20),
        topics: strings(
          (Array.isArray(episode.topics) ? episode.topics : [])
            .map((topic) => (topic && typeof topic === 'object' ? (topic as Record<string, unknown>).topic_name : null)),
          20,
        ),
      }]
    })
  } catch (_error) {
    console.warn('[Podcast Episodes] Episode fetch was unavailable')
    return []
  }
}

// ---------------------------------------------------------------------------
// Fetch-once episode capture on the global catalog.
//
// Podscan is only called when the stored capture is missing or older than the
// freshness window; everything else — reruns, other clients, other
// workspaces, the pitch dialog — reads the stored copy. A successful fetch
// also advances last_posted_at from the newest episode, which is how catalog
// rows that predate the field self-heal without anyone doing anything.

/** Everything RecentEpisode carries except the transcript, which is stored
 * in its own column so list-style reads can skip the heavy field. */
export type StoredEpisode = Omit<RecentEpisode, 'transcript'>

export interface CapturedEpisodes {
  episodes: StoredEpisode[]
  transcript: string | null
  last_posted_at: string | null
  episodes_fetched_at: string | null
}

const EPISODE_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000

function newestIso(values: Array<string | null>): string | null {
  // Podscan posted_at values are ISO-formatted, so lexicographic max works.
  return values.reduce<string | null>(
    (max, value) => (value && (!max || value > max) ? value : max),
    null,
  )
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureEpisodesCaptured(admin: any, podscanId: string): Promise<CapturedEpisodes | null> {
  if (!/^[a-zA-Z0-9_-]+$/.test(podscanId)) return null
  const { data: row, error } = await admin
    .from('podcasts')
    .select('id, recent_episodes, latest_episode_transcript, episodes_fetched_at, last_posted_at, host_name')
    .eq('podscan_id', podscanId)
    .maybeSingle()
  if (error || !row) return null

  const stored: CapturedEpisodes = {
    episodes: Array.isArray(row.recent_episodes)
      ? (row.recent_episodes as StoredEpisode[]).filter((episode) => episode && typeof episode.title === 'string')
      : [],
    transcript: typeof row.latest_episode_transcript === 'string' && row.latest_episode_transcript
      ? row.latest_episode_transcript
      : null,
    last_posted_at: typeof row.last_posted_at === 'string' ? row.last_posted_at : null,
    episodes_fetched_at: typeof row.episodes_fetched_at === 'string' ? row.episodes_fetched_at : null,
  }
  // A capture from before the metadata expansion (no episode_id key) is
  // treated as stale so rows silently upgrade to the full shape.
  const shapeCurrent = stored.episodes.length > 0
    && stored.episodes.every((episode) => 'episode_id' in episode)
  const fresh = shapeCurrent
    && stored.episodes_fetched_at
    && Date.now() - Date.parse(stored.episodes_fetched_at) < EPISODE_FRESHNESS_MS
  if (fresh) return stored

  const fetched = await fetchRecentEpisodes(podscanId)
  if (fetched.length === 0) {
    // Nothing usable came back. Keep what we had and leave episodes_fetched_at
    // unstamped so the next flow that needs episodes retries.
    return stored
  }

  const episodes: StoredEpisode[] = fetched.map(({ transcript: _transcript, ...episode }) => episode)
  const transcript = fetched[0]?.transcript || null
  const fetchedAt = new Date().toISOString()
  const lastPostedAt = newestIso([stored.last_posted_at, ...episodes.map((episode) => episode.posted_at)])
  // Podscan's speaker analysis names the hosts; fill the catalog's host_name
  // when nothing curated it yet, so "Host on record" stops showing dashes.
  const analyzedHosts = episodes[0]?.hosts.map((host) => host.name) ?? []
  const hostNameFill = !row.host_name && analyzedHosts.length > 0
    ? { host_name: analyzedHosts.join(' & ').slice(0, 300) }
    : {}
  // Persistence is best-effort: a failed write still returns the fresh data
  // to the caller, and the next flow simply fetches again.
  await admin
    .from('podcasts')
    .update({
      recent_episodes: episodes,
      latest_episode_transcript: transcript,
      episodes_fetched_at: fetchedAt,
      last_posted_at: lastPostedAt,
      updated_at: fetchedAt,
      ...hostNameFill,
    })
    .eq('id', row.id)

  return { episodes, transcript, last_posted_at: lastPostedAt, episodes_fetched_at: fetchedAt }
}
