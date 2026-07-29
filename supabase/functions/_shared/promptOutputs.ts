import { isPromptVariable } from './promptVariables.ts'

/**
 * Fields a prompt stage returns, named by whoever wrote the prompt.
 *
 * A stage's answer has always been one blob that later stages read whole.
 * Declaring fields turns that answer into variables — the same thing
 * structure_research already does with a hardcoded shape, available to any
 * stage and named by the person who knows what the prompt is for.
 */

export interface PromptOutputField {
  id: string
  label: string
  description: string
  /** text is a string; list is an array of strings, joined for the prompt. */
  type: 'text' | 'list'
}

const ID_PATTERN = /^[a-z][a-z0-9_]{1,47}$/u
const MAX_FIELDS = 20

/**
 * Validates a submitted schema.
 *
 * An id that collides with the registry is rejected rather than merged: a
 * stage that could overwrite podcast_name would let a model's answer
 * impersonate catalogue data, and every later prompt would read the invention
 * instead of the fact.
 */
export function normalizeOutputFields(value: unknown): PromptOutputField[] {
  if (!Array.isArray(value)) throw new Error('output_fields must be an array')
  if (value.length > MAX_FIELDS) throw new Error(`A stage may declare at most ${MAX_FIELDS} fields`)

  const seen = new Set<string>()
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('each output field must be an object')
    }
    const field = entry as Record<string, unknown>
    const id = typeof field.id === 'string' ? field.id.trim() : ''
    if (!ID_PATTERN.test(id)) {
      throw new Error(`"${id.slice(0, 40)}" is not a valid field name: lowercase letters, numbers and underscores`)
    }
    if (isPromptVariable(id)) {
      throw new Error(`"${id}" is already a field this run provides — choose another name`)
    }
    if (seen.has(id)) throw new Error(`"${id}" is declared twice`)
    seen.add(id)

    const label = typeof field.label === 'string' && field.label.trim()
      ? field.label.trim().slice(0, 120)
      : id
    const description = typeof field.description === 'string' ? field.description.trim().slice(0, 500) : ''
    const type = field.type === 'list' ? 'list' : 'text'
    return { id, label, description, type }
  })
}

/**
 * The instruction appended to a stage that declares outputs.
 *
 * Appended rather than replacing the prompt: the prompt says what to think
 * about, this says what shape to answer in, and an owner editing one should
 * not have to restate the other.
 */
export function buildOutputInstruction(fields: readonly PromptOutputField[]): string {
  if (fields.length === 0) return ''
  const shape = fields
    .map((field) => {
      const type = field.type === 'list' ? 'string[]' : 'string'
      const note = field.description ? ` // ${field.description}` : ''
      return `  "${field.id}": ${type}${note}`
    })
    .join('\n')
  return [
    'Return ONLY a JSON object with exactly these keys, and nothing else — no prose before or after, no code fence:',
    '{',
    shape,
    '}',
    'Use an empty string for anything the provided material does not support. Never invent a value to fill a key.',
  ].join('\n')
}

/** Pulls the JSON object out of a model answer that may be fenced or padded. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

/**
 * The declared fields, read out of a stage's answer.
 *
 * Returns null when the answer is not the declared shape at all, which the
 * caller treats as "this stage produced a blob" rather than as a failure —
 * a stage that answers in prose is still useful to the stages after it.
 */
export function parseOutputFields(
  raw: string,
  fields: readonly PromptOutputField[],
): Record<string, string | null> | null {
  if (fields.length === 0) return null
  const parsed = extractJson(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const record = parsed as Record<string, unknown>
  // At least one declared key must be present, or this is some other JSON the
  // prompt happened to produce and reading it would invent structure.
  if (!fields.some((field) => field.id in record)) return null

  const values: Record<string, string | null> = {}
  for (const field of fields) {
    const value = record[field.id]
    if (field.type === 'list') {
      const parts = (Array.isArray(value) ? value : [])
        .flatMap((entry) => (typeof entry === 'string' && entry.trim() ? [entry.trim()] : []))
      values[field.id] = parts.length > 0 ? parts.join('\n') : null
      continue
    }
    values[field.id] = typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return values
}

/** Client row beats workspace row beats no declared outputs. */
export function resolveOutputFields(
  promptId: string,
  clientRows: ReadonlyArray<{ prompt_id: string; output_fields: unknown }>,
  workspaceRows: ReadonlyArray<{ prompt_id: string; output_fields: unknown }>,
): PromptOutputField[] {
  const row = clientRows.find((entry) => entry.prompt_id === promptId)
    ?? workspaceRows.find((entry) => entry.prompt_id === promptId)
  if (!row) return []
  try {
    return normalizeOutputFields(row.output_fields)
  } catch {
    // A stored row that no longer validates (a registry field took its name,
    // say) must not break the run; the stage falls back to its blob.
    return []
  }
}
