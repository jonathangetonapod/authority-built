// Regenerates the two prompt-variable registry mirrors from the canonical JSON.
//
//   node scripts/generate-prompt-variables.mjs           write the mirrors
//   node scripts/generate-prompt-variables.mjs --check   fail if they differ
//
// docs/prompt-variables.json is the only file to edit by hand, and any change
// to what the mirrors CONTAIN — formatters included, not just the registry
// array — belongs in this script. --check runs in check:static and fails CI on
// any difference, in either direction: a hand-edited mirror and a stale
// template are the same finding here.

import { readFileSync, writeFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync('docs/prompt-variables.json', 'utf8'))

/**
 * One variable per stage, carrying that stage's whole answer.
 *
 * Derived rather than declared: the id is always `<stage_id>_response`, so the
 * name of the stage is the name of the field and there is nothing to look up.
 * Before this, reading the host stage's answer meant knowing it was called
 * research_report's sibling `host_report` — a mapping that existed only in the
 * registry, which is why the prompt editor needed three paragraphs explaining
 * how a stage's output reaches the next one.
 */
const stageResponses = Object.entries(registry.stage_responses.stages).map(([stage, spec]) => ({
  id: `${stage}_response`,
  group: 'run',
  type: 'long_text',
  label: spec.label,
  producedBy: stage,
  aliases: spec.aliases,
}))

// Placed at the head of the run group rather than appended, so the field menu
// offers a stage's own name above the older name for the same answer.
const firstRunIndex = registry.variables.findIndex((variable) => variable.group === 'run')
const variables = firstRunIndex === -1
  ? [...registry.variables, ...stageResponses]
  : [
    ...registry.variables.slice(0, firstRunIndex),
    ...stageResponses,
    ...registry.variables.slice(firstRunIndex),
  ]

function entry(variable) {
  const parts = [`id: '${variable.id}'`, `group: '${variable.group}'`]
  if (variable.column) parts.push(`column: '${variable.column}'`)
  if (variable.profile) parts.push(`profile: '${variable.profile}'`)
  parts.push(`type: '${variable.type}'`)
  parts.push(`label: ${JSON.stringify(variable.label)}`)
  if (variable.producedBy) parts.push(`producedBy: '${variable.producedBy}'`)
  if (variable.aliases?.length) {
    parts.push(`aliases: [${variable.aliases.map((alias) => `'${alias}'`).join(', ')}]`)
  }
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
  /**
   * Older ids that carry the same value. A stage's answer was reachable by a
   * hand-picked name before it was reachable by the stage's own name, and
   * every shipped and saved prompt still references the hand-picked one.
   */
  aliases?: string[]
}
`

const ARRAY = `export const PROMPT_VARIABLES: PromptVariable[] = [
${variables.map(entry).join('\n')}
]

/** Display order and labels for the prompt editor's field palette. */
export const PROMPT_VARIABLE_GROUPS: Array<{ id: PromptVariableGroup; label: string }> = [
${Object.entries(registry.groups).map(([id, label]) => `  { id: '${id}', label: ${JSON.stringify(label)} },`).join('\n')}
]

/**
 * Every id a stage's whole answer fills: its own {{stage_response}} first, then
 * the older names for the same value.
 *
 * The executors write through this rather than naming fields one by one, so a
 * stage added later carries its output to later stages without anyone
 * remembering to wire it — which is how host_report and guest_report came to
 * exist in the registry while sitting unfilled in one of the two run paths.
 */
export const STAGE_RESPONSE_TARGETS: Record<string, string[]> = {
${stageResponses.map((variable) => `  ${variable.producedBy}: [${[variable.id, ...variable.aliases].map((id) => `'${id}'`).join(', ')}],`).join('\n')}
}
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

/**
 * A decoded value for somewhere a line break would be read as a new item:
 * list entries and episode titles each own exactly one line.
 */
function decodeFeedLine(value: string): string {
  return decodeFeedText(value).replace(/\\s+/gu, ' ').trim()
}

function formatList(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const parts = value
    .map((entry) => {
      if (typeof entry === 'string') return decodeFeedLine(entry)
      if (typeof entry === 'number') return String(entry)
      if (entry && typeof entry === 'object') {
        const named = entry as Record<string, unknown>
        const label = named.name ?? named.label ?? named.title ?? named.category
        return typeof label === 'string' ? decodeFeedLine(label) : ''
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
      const title = typeof episode.title === 'string' ? decodeFeedLine(episode.title) : ''
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
 * Feed markup reaches the model as markup unless it is cleaned here.
 *
 * A third of catalogue descriptions carry <p> tags and 556 show names carry an
 * HTML entity, because that is how the feeds publish them. The opener quotes
 * the show name back to the host, so "The Good, Bad, &amp; the Ugly" is not a
 * cosmetic problem — it is the broken-automation tell the prompts spend a
 * paragraph avoiding, arriving through the data instead of the wording.
 *
 * Block tags become breaks rather than nothing, so "<p>One.</p><p>Two.</p>"
 * does not collapse into "One.Two.". A paragraph ends with a blank line and a
 * line item with a single newline, which is the shape the model reads as
 * structure rather than as a wrapped sentence.
 */
export function decodeFeedText(value: string): string {
  const withoutTags = value
    .replace(/<br\\s*\\/?>/giu, '\\n')
    .replace(/<\\/(p|div|h[1-6])>/giu, '\\n\\n')
    .replace(/<\\/(li|tr)>/giu, '\\n')
    .replace(/<[a-zA-Z/][^>]*>/gu, ' ')
  // One pass, so an escaped entity like "&amp;lt;" decodes to "&lt;" and not
  // to "<": decoding the ampersand separately would re-read its own output.
  const decoded = withoutTags.replace(
    /&(nbsp|amp|lt|gt|quot|apos|hellip|ndash|mdash|[lr]squo|[lr]dquo|#0?39|#x27|#821[167]|#822[01]|#8230|#8212);/giu,
    (entity) => {
      const key = entity.slice(1, -1).toLowerCase()
      switch (key) {
        case 'nbsp': return ' '
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': case 'ldquo': case 'rdquo': case '#8220': case '#8221': return '"'
        case 'apos': case '#39': case '#039': case '#x27': return "'"
        case 'lsquo': case '#8216': return '‘'
        case 'rsquo': case '#8217': return '’'
        case 'hellip': case '#8230': return '…'
        case 'ndash': case '#8211': return '–'
        case 'mdash': case '#8212': return '—'
        default: return entity
      }
    },
  )
  // The space a stripped tag leaves behind is an artefact of the markup, so it
  // does not survive next to a break it did not create.
  return decoded
    .replace(/[ \\t]+/gu, ' ')
    .replace(/[ \\t]*\\n[ \\t]*/gu, '\\n')
    .replace(/\\n{3,}/gu, '\\n\\n')
    .trim()
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
      const cleaned = decodeFeedText(value)
      return cleaned.length > 0 ? cleaned : null
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
  // The transcript is not always the latest episode's: Podscan is asked for
  // episodes whether or not transcription has finished, and the capture flags
  // the one it actually got. A prompt that quotes the transcript needs to name
  // that episode, or it attributes the words to whatever came out most
  // recently — which is how a pitch tells a host they said something they
  // said on a different show week.
  const transcriptSource = list.find((episode) => episode.transcript_source) ?? latest
  return {
    transcript_episode_title: formatPromptValue('transcript_episode_title', transcriptSource?.title),
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

const outputs = [
  ['supabase/functions/_shared/promptVariables.ts', edgeHeader + TYPES + '\n' + ARRAY + FORMATTER],
  ['src/lib/promptVariables.ts', appHeader + TYPES + '\n' + ARRAY],
]

// --check verifies the mirrors are exactly what this script would write.
//
// Without it, drift runs the other way from the documented workflow: a hand
// edit to a mirror leaves the template behind, and the NEXT regenerate — the
// sanctioned command — silently deletes the shipped logic. That is not
// hypothetical. Both decodeFeedText (feed markup reaching hosts as markup) and
// transcript_episode_title (quotes attributed to the wrong episode) were added
// to the edge mirror by hand and would have been reverted by a regenerate.
// The registry array was the only part any contract script compared.
if (process.argv.includes('--check')) {
  const stale = outputs.filter(([path, contents]) => readFileSync(path, 'utf8') !== contents)
  if (stale.length > 0) {
    console.error('prompt variable mirrors are out of sync with the generator:')
    for (const [path] of stale) console.error(`  - ${path}`)
    console.error('\nEither the mirror was hand-edited, or the generator template is stale.')
    console.error('Fold the change into scripts/generate-prompt-variables.mjs, then rerun with --check.')
    process.exit(1)
  }
  console.log(`prompt variable registry in sync: ${variables.length} variables`)
} else {
  for (const [path, contents] of outputs) writeFileSync(path, contents)
  console.log(`prompt variable registry generated: ${variables.length} variables`)
}
