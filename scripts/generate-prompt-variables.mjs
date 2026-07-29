// Regenerates the two prompt-variable registry mirrors from the canonical JSON.
//
//   node scripts/generate-prompt-variables.mjs
//
// docs/prompt-variables.json is the only file to edit by hand. The
// workspace-campaign contract script asserts the mirrors match it, so a hand
// edit to either mirror fails CI rather than drifting quietly.

import { readFileSync, writeFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync('docs/prompt-variables.json', 'utf8'))

function entry(variable) {
  const parts = [`id: '${variable.id}'`, `group: '${variable.group}'`]
  if (variable.column) parts.push(`column: '${variable.column}'`)
  if (variable.profile) parts.push(`profile: '${variable.profile}'`)
  parts.push(`type: '${variable.type}'`)
  parts.push(`label: ${JSON.stringify(variable.label)}`)
  if (variable.producedBy) parts.push(`producedBy: '${variable.producedBy}'`)
  return `  { ${parts.join(', ')} },`
}

const TYPES = `export type PromptVariableGroup = 'podcast' | 'episode' | 'client' | 'run'

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
`

const ARRAY = `export const PROMPT_VARIABLES: PromptVariable[] = [
${registry.variables.map(entry).join('\n')}
]

/** Display order and labels for the prompt editor's field palette. */
export const PROMPT_VARIABLE_GROUPS: Array<{ id: PromptVariableGroup; label: string }> = [
${Object.entries(registry.groups).map(([id, label]) => `  { id: '${id}', label: ${JSON.stringify(label)} },`).join('\n')}
]
`

const FORMATTER = `
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
      lines.push(\`\${readableKey}: \${String(raw)}\`)
    } else if (Array.isArray(raw)) {
      const list = formatList(raw)
      if (list) lines.push(\`\${readableKey}: \${list}\`)
    }
  }
  return lines.length > 0 ? lines.join('\\n') : null
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
      return stamp ? \`- \${stamp}: \${title}\` : \`- \${title}\`
    })
    .filter((line) => line.length > 0)
  return lines.length > 0 ? lines.join('\\n') : null
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
`

const edgeHeader = `// GENERATED from docs/prompt-variables.json by scripts/generate-prompt-variables.mjs.
// Deno mirror of src/lib/promptVariables.ts. Do not hand-edit; regenerate.
// The workspace-campaign contract script asserts all three agree.

`

const appHeader = `// GENERATED from docs/prompt-variables.json by scripts/generate-prompt-variables.mjs.
// Frontend mirror of supabase/functions/_shared/promptVariables.ts. Do not
// hand-edit; regenerate. Feeds the prompt editor's field list.

`

writeFileSync(
  'supabase/functions/_shared/promptVariables.ts',
  edgeHeader + TYPES + '\n' + ARRAY + FORMATTER,
)
writeFileSync('src/lib/promptVariables.ts', appHeader + TYPES + '\n' + ARRAY)

console.log(`prompt variable registry generated: ${registry.variables.length} variables`)
