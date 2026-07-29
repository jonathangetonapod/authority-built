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

export interface PromptVariable {
  id: string
  group: PromptVariableGroup
  type: PromptVariableType
  label: string
  /** Podcast-group only: the podcasts column this reads. */
  column?: string
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
  { id: 'episode_title', group: 'episode', type: 'text', label: "Latest episode title" },
  { id: 'episode_description', group: 'episode', type: 'long_text', label: "Latest episode summary" },
  { id: 'episode_transcript', group: 'episode', type: 'long_text', label: "Latest episode transcript" },
  { id: 'client_name', group: 'client', type: 'text', label: "Client name" },
  { id: 'client_bio', group: 'client', type: 'long_text', label: "Client bio and positioning" },
  { id: 'client_linkedin_url', group: 'client', type: 'text', label: "Client LinkedIn" },
  { id: 'client_website', group: 'client', type: 'text', label: "Client website" },
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
  { id: 'placeholders', group: 'run', type: 'long_text', label: "Unfilled placeholders in the draft", producedBy: 'write_email' },
  { id: 'positioning', group: 'client', type: 'long_text', label: "Client positioning" },
  { id: 'topics_and_angles', group: 'client', type: 'long_text', label: "Client topics and angles" },
  { id: 'listener_takeaways', group: 'client', type: 'long_text', label: "Listener takeaways" },
  { id: 'proof_points', group: 'client', type: 'long_text', label: "Client proof points" },
  { id: 'booking_details', group: 'client', type: 'long_text', label: "Booking and scheduling details" },
  { id: 'podcast_research', group: 'run', type: 'long_text', label: "Podcast research result, for the inbox", producedBy: 'podcast_research' },
  { id: 'pitch_sent', group: 'run', type: 'long_text', label: "The pitch this reply answers", producedBy: 'write_email' },
  { id: 'reply_subject', group: 'run', type: 'text', label: "Subject of the host reply", producedBy: 'inbox' },
  { id: 'reply_body', group: 'run', type: 'long_text', label: "Body of the host reply", producedBy: 'inbox' },
]

/** The podcasts columns the research executor must SELECT to fill the registry. */
export const PODCAST_VARIABLE_COLUMNS: string[] = PROMPT_VARIABLES
  .filter((variable) => variable.group === 'podcast' && variable.column)
  .map((variable) => variable.column as string)

const VARIABLE_TYPES = new Map(
  PROMPT_VARIABLES.map((variable) => [variable.id, variable.type] as const),
)

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
    default: {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 ? value : null
    }
  }
}
