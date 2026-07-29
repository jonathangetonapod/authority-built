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
`

const ARRAY = `export const PROMPT_VARIABLES: PromptVariable[] = [
${registry.variables.map(entry).join('\n')}
]
`

const FORMATTER = `
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
      lines.push(\`\${readableKey}: \${String(raw)}\`)
    } else if (Array.isArray(raw)) {
      const list = formatList(raw)
      if (list) lines.push(\`\${readableKey}: \${list}\`)
    }
  }
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
    default: {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 ? value : null
    }
  }
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
