// GENERATED from docs/prompt-variables.json by scripts/generate-prompt-variables.mjs.
// Deno mirror of src/lib/promptVariables.ts. Do not hand-edit; regenerate.
// The workspace-campaign contract script asserts all three agree.

export type PromptVariableGroup = 'podcast' | 'episode' | 'client' | 'run'

export type PromptVariableType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'list'
  | 'object'
  | 'episode_list'

export interface PromptVariable {
  id: string
  group: PromptVariableGroup
  type: PromptVariableType
  label: string
  /** Podcast- and client-group only: the table column this reads. */
  column?: string
  /** Client-group only: the clients.ai_sdr_profile key this reads. */
  profile?: string
  /** Run-group only: the stage that produces it. */
  producedBy?: string
}

export const PROMPT_VARIABLES: PromptVariable[] = [
  { id: 'podcast_name', group: 'podcast', column: 'podcast_name', type: 'text', label: "Podcast name" },
  { id: 'podcast_description', group: 'podcast', column: 'podcast_description', type: 'long_text', label: "Description" },
  { id: 'podcast_url', group: 'podcast', column: 'podcast_url', type: 'text', label: "Podcast URL" },
  { id: 'podcast_website', group: 'podcast', column: 'website', type: 'text', label: "Show website" },
  { id: 'publisher_name', group: 'podcast', column: 'publisher_name', type: 'text', label: "Publisher" },
  { id: 'podcast_categories', group: 'podcast', column: 'podcast_categories', type: 'list', label: "Categories" },
  { id: 'language', group: 'podcast', column: 'language', type: 'text', label: "Language" },
  { id: 'region', group: 'podcast', column: 'region', type: 'text', label: "Region" },
  { id: 'episode_count', group: 'podcast', column: 'episode_count', type: 'number', label: "Episodes published" },
  { id: 'last_posted_at', group: 'podcast', column: 'last_posted_at', type: 'date', label: "Last episode posted" },
  { id: 'audience_size', group: 'podcast', column: 'audience_size', type: 'number', label: "Audience size" },
  { id: 'podcast_reach_score', group: 'podcast', column: 'podcast_reach_score', type: 'number', label: "Reach score" },
  { id: 'itunes_rating', group: 'podcast', column: 'itunes_rating', type: 'decimal', label: "Apple rating" },
  { id: 'itunes_rating_count', group: 'podcast', column: 'itunes_rating_count', type: 'number', label: "Apple ratings" },
  { id: 'spotify_rating', group: 'podcast', column: 'spotify_rating', type: 'decimal', label: "Spotify rating" },
  { id: 'spotify_rating_count', group: 'podcast', column: 'spotify_rating_count', type: 'number', label: "Spotify ratings" },
  { id: 'podcast_has_guests', group: 'podcast', column: 'podcast_has_guests', type: 'boolean', label: "Takes guests" },
  { id: 'podcast_has_sponsors', group: 'podcast', column: 'podcast_has_sponsors', type: 'boolean', label: "Runs sponsors" },
  { id: 'social_links', group: 'podcast', column: 'social_links', type: 'object', label: "Social links" },
  { id: 'demographics', group: 'podcast', column: 'demographics', type: 'object', label: "Audience demographics" },
  { id: 'demographics_episodes_analyzed', group: 'podcast', column: 'demographics_episodes_analyzed', type: 'number', label: "Episodes behind the demographics" },
  { id: 'brand_safety_risk_level', group: 'podcast', column: 'brand_safety_risk_level', type: 'text', label: "Brand safety risk" },
  { id: 'brand_safety_recommendation', group: 'podcast', column: 'brand_safety_recommendation', type: 'long_text', label: "Brand safety note" },
  { id: 'podcast_host_name', group: 'podcast', column: 'host_name', type: 'text', label: "Host name (Podscan)" },
  { id: 'podcast_is_active', group: 'podcast', column: 'is_active', type: 'boolean', label: "Still publishing" },
  { id: 'podcast_inbox_email', group: 'podcast', column: 'podscan_email', type: 'text', label: "Show inbox (Podscan)" },
  { id: 'podcast_rss_url', group: 'podcast', column: 'rss_url', type: 'text', label: "RSS feed" },
  { id: 'podcast_image_url', group: 'podcast', column: 'podcast_image_url', type: 'text', label: "Cover art URL" },
  { id: 'demographics_fetched_at', group: 'podcast', column: 'demographics_fetched_at', type: 'date', label: "Demographics captured" },
  { id: 'episodes_fetched_at', group: 'podcast', column: 'episodes_fetched_at', type: 'date', label: "Episodes captured" },
  { id: 'episode_title', group: 'episode', type: 'text', label: "Latest episode title" },
  { id: 'episode_description', group: 'episode', type: 'long_text', label: "Latest episode summary" },
  { id: 'episode_transcript', group: 'episode', type: 'long_text', label: "Latest episode transcript" },
  { id: 'episode_posted_at', group: 'episode', type: 'date', label: "Latest episode posted" },
  { id: 'episode_summary', group: 'episode', type: 'long_text', label: "Latest episode summary (Podscan)" },
  { id: 'episode_topics', group: 'episode', type: 'list', label: "Latest episode topics" },
  { id: 'episode_keywords', group: 'episode', type: 'list', label: "Latest episode keywords" },
  { id: 'episode_guests', group: 'episode', type: 'list', label: "Latest episode guests" },
  { id: 'episode_hosts', group: 'episode', type: 'list', label: "Latest episode hosts" },
  { id: 'episode_has_guests', group: 'episode', type: 'boolean', label: "Latest episode had a guest" },
  { id: 'episode_url', group: 'episode', type: 'text', label: "Latest episode URL" },
  { id: 'episode_duration_seconds', group: 'episode', type: 'number', label: "Latest episode length, seconds" },
  { id: 'episode_word_count', group: 'episode', type: 'number', label: "Latest episode word count" },
  { id: 'recent_episodes', group: 'episode', type: 'episode_list', label: "Recent episodes, newest first" },
  { id: 'client_name', group: 'client', column: 'name', type: 'text', label: "Client name" },
  { id: 'client_bio', group: 'client', column: 'bio', type: 'long_text', label: "Client bio and positioning" },
  { id: 'client_linkedin_url', group: 'client', column: 'linkedin_url', type: 'text', label: "Client LinkedIn" },
  { id: 'client_website', group: 'client', column: 'website', type: 'text', label: "Client website" },
  { id: 'client_calendar_link', group: 'client', column: 'calendar_link', type: 'text', label: "Client booking link" },
  { id: 'research_report', group: 'run', type: 'long_text', label: "Podcast research result", producedBy: 'podcast_research' },
  { id: 'host_report', group: 'run', type: 'long_text', label: "Host identification result", producedBy: 'host_info' },
  { id: 'guest_report', group: 'run', type: 'long_text', label: "Guest verification result", producedBy: 'guest_info' },
  { id: 'recent_guest_name', group: 'run', type: 'text', label: "Most recent guest", producedBy: 'guest_info' },
  { id: 'topic_proposal', group: 'run', type: 'long_text', label: "Topic alignment result", producedBy: 'find_topics' },
  { id: 'host_name', group: 'run', type: 'text', label: "Primary contact name", producedBy: 'host_name_extractor' },
  { id: 'contact_data', group: 'run', type: 'long_text', label: "Contact data to extract from", producedBy: 'podcast_research' },
  { id: 'verified_email', group: 'run', type: 'text', label: "Verified contact email", producedBy: 'email_unlock' },
  { id: 'sequence_json', group: 'run', type: 'long_text', label: "Drafted sequence, as JSON", producedBy: 'write_email' },
  { id: 'audit_flags', group: 'run', type: 'long_text', label: "Problems found in the draft", producedBy: 'write_email' },
  { id: 'positioning', group: 'client', profile: 'positioning', type: 'long_text', label: "Client positioning" },
  { id: 'topics_and_angles', group: 'client', profile: 'topics_and_angles', type: 'long_text', label: "Client topics and angles" },
  { id: 'listener_takeaways', group: 'client', profile: 'listener_takeaways', type: 'long_text', label: "Listener takeaways" },
  { id: 'proof_points', group: 'client', profile: 'proof_points', type: 'long_text', label: "Client proof points" },
  { id: 'ideal_opportunities', group: 'client', profile: 'ideal_opportunities', type: 'long_text', label: "Ideal shows and audiences" },
  { id: 'booking_details', group: 'client', profile: 'booking_details', type: 'long_text', label: "Booking and scheduling details" },
  { id: 'podcast_research', group: 'run', type: 'long_text', label: "Podcast research result, for the inbox", producedBy: 'podcast_research' },
  { id: 'pitch_sent', group: 'run', type: 'long_text', label: "The pitch this reply answers", producedBy: 'write_email' },
  { id: 'reply_subject', group: 'run', type: 'text', label: "Subject of the host reply", producedBy: 'inbox' },
  { id: 'reply_body', group: 'run', type: 'long_text', label: "Body of the host reply", producedBy: 'inbox' },
  { id: 'agency_relationship', group: 'run', type: 'long_text', label: "What this agency already means to this host", producedBy: 'relationship' },
  { id: 'clean_description', group: 'run', type: 'long_text', label: "Show summary, structured", producedBy: 'structure_research' },
  { id: 'fit_reasons', group: 'run', type: 'list', label: "Why this guest fits, structured", producedBy: 'structure_research' },
  { id: 'pitch_angles', group: 'run', type: 'long_text', label: "All three angles, structured", producedBy: 'structure_research' },
  { id: 'selected_angle', group: 'run', type: 'long_text', label: "The angle this pitch was asked for", producedBy: 'structure_research' },
]

/** Display order and labels for the prompt editor's field palette. */
export const PROMPT_VARIABLE_GROUPS: Array<{ id: PromptVariableGroup; label: string }> = [
  { id: 'podcast', label: "Podcast · Podscan" },
  { id: 'episode', label: "Latest episode" },
  { id: 'client', label: "Client" },
  { id: 'run', label: "Produced during the run" },
]

/** The podcasts columns an executor must SELECT to fill the registry. */
export const PODCAST_VARIABLE_COLUMNS: string[] = PROMPT_VARIABLES
  .filter((variable) => variable.group === 'podcast' && variable.column)
  .map((variable) => variable.column as string)

/** The clients columns an executor must SELECT, alongside ai_sdr_profile. */
export const CLIENT_VARIABLE_COLUMNS: string[] = PROMPT_VARIABLES
  .filter((variable) => variable.group === 'client' && variable.column)
  .map((variable) => variable.column as string)

const VARIABLE_TYPES = new Map(
  PROMPT_VARIABLES.map((variable) => [variable.id, variable.type] as const),
)

const VARIABLE_IDS = new Set(PROMPT_VARIABLES.map((variable) => variable.id))

/**
 * Whether a {{token}} names a real variable.
 *
 * A filler that substitutes anything token-shaped turns prose into data: the
 * clean_email rule "unfilled {{placeholders}} must never appear" was itself
 * being filled, so the shipped instruction read "unfilled Not available must
 * never appear". An unknown token is left alone instead.
 */
export function isPromptVariable(id: string): boolean {
  return VARIABLE_IDS.has(id)
}

function formatList(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const parts = value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (typeof entry === 'number') return String(entry)
      if (entry && typeof entry === 'object') {
        const named = entry as Record<string, unknown>
        const label = named.name ?? named.label ?? named.title ?? named.category
        return typeof label === 'string' ? label.trim() : ''
      }
      return ''
    })
    .filter((entry) => entry.length > 0)
  return parts.length > 0 ? parts.join(', ') : null
}

function formatObject(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const lines: string[] = []
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined || raw === '') continue
    const readableKey = key.replace(/_/gu, ' ')
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      lines.push(`${readableKey}: ${String(raw)}`)
    } else if (Array.isArray(raw)) {
      const list = formatList(raw)
      if (list) lines.push(`${readableKey}: ${list}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** Stored episode captures, newest first, one dated title per line. */
function formatEpisodeList(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const lines = value
    .slice(0, 10)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const episode = entry as Record<string, unknown>
      const title = typeof episode.title === 'string' ? episode.title.trim() : ''
      if (!title) return ''
      const postedAt = typeof episode.posted_at === 'string' ? new Date(episode.posted_at) : null
      const stamp = postedAt && !Number.isNaN(postedAt.getTime())
        ? postedAt.toISOString().slice(0, 10)
        : null
      return stamp ? `- ${stamp}: ${title}` : `- ${title}`
    })
    .filter((line) => line.length > 0)
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * Renders a stored value for a prompt, by the registry's declared type.
 *
 * Returns null only for a genuine absence — the filler turns that into
 * "Not available". A false boolean and a zero are values: podcast_has_guests
 * being false is the most decision-relevant fact we hold about a show, and it
 * must never reach a prompt looking like missing data.
 */
export function formatPromptValue(variableId: string, value: unknown): string | null {
  if (value === null || value === undefined) return null
  const type = VARIABLE_TYPES.get(variableId) ?? 'text'

  switch (type) {
    case 'boolean': {
      if (typeof value === 'boolean') return value ? 'Yes' : 'No'
      if (value === 'true' || value === 'false') return value === 'true' ? 'Yes' : 'No'
      return null
    }
    case 'number': {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) return null
      return Math.round(numeric).toLocaleString('en-US')
    }
    case 'decimal': {
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) return null
      return numeric.toFixed(1)
    }
    case 'date': {
      const parsed = typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : null
      if (!parsed || Number.isNaN(parsed.getTime())) return null
      return parsed.toISOString().slice(0, 10)
    }
    case 'list':
      return formatList(value)
    case 'object':
      return formatObject(value)
    case 'episode_list':
      return formatEpisodeList(value)
    default: {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 ? value : null
    }
  }
}

/**
 * Every podcast-group variable, read off a catalogue row by declared type.
 * Both executors build these the same way so the pitch stage can never again
 * see less of a show than the research stage did.
 */
export function buildPodcastVariables(row: unknown): Record<string, string | null> {
  const values = (row ?? {}) as Record<string, unknown>
  const variables: Record<string, string | null> = {}
  for (const variable of PROMPT_VARIABLES) {
    if (variable.group !== 'podcast' || !variable.column) continue
    variables[variable.id] = formatPromptValue(variable.id, values[variable.column])
  }
  return variables
}

/**
 * Every episode-group variable, from a stored capture (newest episode first).
 *
 * Reads what is already on the catalogue row — no provider call — so a stage
 * that only holds a podcasts row can offer the same episode fields as the
 * research run that captured them.
 */
export function buildEpisodeVariables(episodes: unknown): Record<string, string | null> {
  const list = Array.isArray(episodes) ? episodes as Array<Record<string, unknown>> : []
  const latest = (list[0] ?? {}) as Record<string, unknown>
  return {
    episode_title: formatPromptValue('episode_title', latest.title),
    episode_description: formatPromptValue('episode_description', latest.description),
    episode_posted_at: formatPromptValue('episode_posted_at', latest.posted_at),
    episode_summary: formatPromptValue('episode_summary', latest.summary),
    episode_topics: formatPromptValue('episode_topics', latest.topics),
    episode_keywords: formatPromptValue('episode_keywords', latest.keywords),
    episode_guests: formatPromptValue('episode_guests', latest.guests),
    episode_hosts: formatPromptValue('episode_hosts', latest.hosts),
    episode_has_guests: formatPromptValue('episode_has_guests', latest.has_guests),
    episode_url: formatPromptValue('episode_url', latest.url),
    episode_duration_seconds: formatPromptValue('episode_duration_seconds', latest.duration_seconds),
    episode_word_count: formatPromptValue('episode_word_count', latest.word_count),
    // The transcript is stored in its own column, so a caller that has one
    // supplies it; a stored capture alone cannot.
    episode_transcript: null,
    recent_episodes: formatPromptValue('recent_episodes', list.length > 0 ? list : null),
  }
}

/**
 * Every client-group variable, from the client row and its AI SDR profile.
 * The profile fields (positioning, topics, proof points, booking details) were
 * declared and referenced by shipped prompts but never loaded here, so they
 * reached the model as "Not available" while sitting populated in the row.
 */
export function buildClientVariables(row: unknown): Record<string, string | null> {
  const values = (row ?? {}) as Record<string, unknown>
  const profile = (values.ai_sdr_profile ?? {}) as Record<string, unknown>
  const variables: Record<string, string | null> = {}
  for (const variable of PROMPT_VARIABLES) {
    if (variable.group !== 'client') continue
    if (variable.column) {
      variables[variable.id] = formatPromptValue(variable.id, values[variable.column])
    } else if (variable.profile) {
      variables[variable.id] = formatPromptValue(variable.id, profile[variable.profile])
    }
  }
  return variables
}
