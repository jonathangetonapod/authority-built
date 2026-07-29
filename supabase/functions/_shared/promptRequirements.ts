import { isPromptVariable, PROMPT_VARIABLES } from './promptVariables.ts'

/**
 * Fields a prompt stage refuses to run without.
 *
 * The builders in promptVariables.ts return `string | null`, where null is a
 * genuine absence — a false boolean and a zero are already facts by the time
 * they get here. That distinction is the whole basis of this check: "required"
 * means the run must have a real value, not that the token appears in the text.
 */

export interface PromptRequirementRow {
  prompt_id: string
  required_variables: string[] | null
}

/** Every stage that can carry requirements, matching the two tables' CHECK. */
export const REQUIREMENT_PROMPT_IDS = [
  'podcast_research',
  'host_info',
  'guest_info',
  'host_name_extractor',
  'find_topics',
  'write_email',
  'clean_email',
  'inbox_reply',
  'inbox_nudges',
] as const

export type RequirementPromptId = typeof REQUIREMENT_PROMPT_IDS[number]

export function isRequirementPromptId(value: unknown): value is RequirementPromptId {
  return typeof value === 'string'
    && (REQUIREMENT_PROMPT_IDS as readonly string[]).includes(value)
}

/**
 * Client row beats workspace row beats nothing required — the same order the
 * prompts themselves resolve in.
 *
 * A client row holding an empty array is an opinion, not an absence: it means
 * this client requires nothing even though the workspace requires something.
 * That is why the set is stored as one array per stage rather than a row per
 * variable, which could not express it.
 */
export function resolveRequiredVariables(
  promptId: string,
  clientRows: readonly PromptRequirementRow[],
  workspaceRows: readonly PromptRequirementRow[],
): string[] {
  const clientRow = clientRows.find((row) => row.prompt_id === promptId)
  if (clientRow) return [...(clientRow.required_variables ?? [])]
  const workspaceRow = workspaceRows.find((row) => row.prompt_id === promptId)
  return [...(workspaceRow?.required_variables ?? [])]
}

/**
 * Which of the required fields the run could not fill.
 *
 * Absent from the map counts as missing: a run field naming a stage that has
 * not happened yet is exactly as unusable as a podcast column that is empty.
 */
export function missingRequiredVariables(
  required: readonly string[],
  variables: Readonly<Record<string, string | null | undefined>>,
): string[] {
  return required.filter((id) => {
    const value = variables[id]
    return typeof value !== 'string' || value.trim() === ''
  })
}

/**
 * Normalizes a submitted set: unknown ids rejected, duplicates collapsed,
 * registry order kept so a stored row reads the same way the editor showed it.
 */
export function normalizeRequiredVariables(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('required_variables must be an array')
  if (value.length > 200) throw new Error('required_variables is too long')

  const wanted = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') throw new Error('required_variables must contain strings')
    const id = entry.trim()
    // The registry is the authority; the database CHECK only constrains shape.
    if (!isPromptVariable(id)) throw new Error(`Unknown field: ${id.slice(0, 60)}`)
    wanted.add(id)
  }
  return PROMPT_VARIABLES.filter((variable) => wanted.has(variable.id)).map((variable) => variable.id)
}

/** The operator-facing reason a run stopped, naming the fields by their labels. */
export function describeMissingRequirements(promptId: string, missing: readonly string[]): string {
  const labelled = missing.map((id) => {
    const variable = PROMPT_VARIABLES.find((entry) => entry.id === id)
    return variable ? `${variable.label} (${id})` : id
  })
  const fields = labelled.length === 1
    ? labelled[0]
    : `${labelled.slice(0, -1).join(', ')} and ${labelled[labelled.length - 1]}`
  return `This podcast is missing ${fields}, which the ${promptId} stage is set to require. Nothing was generated and no credit was spent.`
}
