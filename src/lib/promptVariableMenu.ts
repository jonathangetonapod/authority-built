import {
  PROMPT_VARIABLES,
  PROMPT_VARIABLE_GROUPS,
  type PromptVariable,
  type PromptVariableGroup,
} from '@/lib/promptVariables'

/**
 * Inline field insertion for the prompt editors.
 *
 * The picker used to be a permanently open wall of 81 chips sitting above a
 * textarea half its height. The list is now summoned at the caret instead: the
 * resting state is a single line, and finding a field is typing rather than
 * scanning.
 */

export type VariableTriggerKind = 'slash' | 'braces'

export interface VariableTrigger {
  /** Index of the first trigger character in the value. */
  start: number
  /** What has been typed after the trigger characters. */
  query: string
  kind: VariableTriggerKind
}

/**
 * A slash only opens the menu at the start of a word. The shipped prompts are
 * full of `Bio/Expertise:`, `[Yes/No`, `role/title/company` and `https://`,
 * none of which put a slash after whitespace — so none of them summon it.
 */
const SLASH_TRIGGER = /(?:^|[\s(["'>])\/([A-Za-z0-9_]*)$/u

/** `{{` is the token syntax itself, so it can never collide with prose. */
const BRACE_TRIGGER = /\{\{[ \t]?([A-Za-z0-9_]*)$/u

/** Reads the text behind the caret and reports an open field menu, if any. */
export function detectVariableTrigger(value: string, caret: number): VariableTrigger | null {
  const before = value.slice(0, Math.max(0, Math.min(caret, value.length)))

  const braces = BRACE_TRIGGER.exec(before)
  if (braces) {
    return { start: braces.index, query: braces[1], kind: 'braces' }
  }

  const slash = SLASH_TRIGGER.exec(before)
  if (slash) {
    // slash[0] carries the boundary character; the trigger itself starts at the
    // slash, so the boundary is left in place when the token replaces it.
    return {
      start: slash.index + slash[0].length - slash[1].length - 1,
      query: slash[1],
      kind: 'slash',
    }
  }

  return null
}

/**
 * Fields matching the typed query, best first: an id that starts with it, then
 * an id that contains it, then a label that does. Ties keep registry order, so
 * an empty query lists the registry as written.
 *
 * Uncapped by default. The menu scrolls and is grouped, so there is no reason
 * to hide the tail of the registry from someone who has not typed enough to
 * narrow it — that only makes the first screenful look like the whole list.
 */
export function filterPromptVariables(
  query: string,
  limit = Number.POSITIVE_INFINITY,
  extra: readonly PromptVariable[] = [],
): PromptVariable[] {
  const all = extra.length > 0 ? [...PROMPT_VARIABLES, ...extra] : PROMPT_VARIABLES
  const needle = query.trim().toLowerCase()
  if (needle === '') return all.slice(0, limit)

  const ranked: Array<{ variable: PromptVariable; rank: number; index: number }> = []
  all.forEach((variable, index) => {
    const id = variable.id.toLowerCase()
    const label = variable.label.toLowerCase()
    const rank = id.startsWith(needle) ? 0 : id.includes(needle) ? 1 : label.includes(needle) ? 2 : -1
    if (rank >= 0) ranked.push({ variable, rank, index })
  })

  return ranked
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .slice(0, limit)
    .map((entry) => entry.variable)
}

/**
 * The matches split into the registry's own groups, empty groups dropped.
 *
 * Groups lead with their best match rather than sitting in a fixed registry
 * order, so the first row of the menu is still the best match overall — typing
 * /host and pressing Enter must not land on podcast_host_name because the
 * podcast group happens to sort first. With nothing typed there is no ranking
 * to apply and this falls back to registry order.
 */
export function groupPromptVariableMatches(
  matches: PromptVariable[],
): Array<{ id: PromptVariableGroup; label: string; variables: PromptVariable[] }> {
  return PROMPT_VARIABLE_GROUPS
    .map((group) => ({
      ...group,
      variables: matches.filter((variable) => variable.group === group.id),
    }))
    .filter((group) => group.variables.length > 0)
    .sort((a, b) => matches.indexOf(a.variables[0]) - matches.indexOf(b.variables[0]))
}

/**
 * The registry fields a prompt actually names, in registry order.
 *
 * An unknown token is ignored rather than reported: the prompts contain
 * `{{placeholders}}` as prose about placeholders, and the filler already
 * leaves those alone.
 */
export function referencedPromptVariables(
  content: string,
  extra: readonly PromptVariable[] = [],
): string[] {
  const named = new Set<string>()
  for (const match of content.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu)) {
    named.add(match[1])
  }
  const all = extra.length > 0 ? [...PROMPT_VARIABLES, ...extra] : PROMPT_VARIABLES
  return all.filter((variable) => named.has(variable.id)).map((variable) => variable.id)
}

/**
 * Characters that look left over from opening the field menu.
 *
 * Typing `/` or `{{` opens the list; dismissing it leaves what was typed
 * behind, and a stray `/` on its own line is easy to save without noticing.
 *
 * Reported rather than removed. Escape cancels the menu, not the typing, and
 * this codebase contains prompts that legitimately write `{{placeholders}}` as
 * prose — any rule that deleted on the way out would eventually eat text
 * somebody meant. A slash counts as stray only when nothing adjoins it, so
 * "and/or" and "24/7" are left alone.
 */
export function strayTriggerHints(content: string): string[] {
  const hints: string[] = []
  const lines = content.split('\n')

  const slashLines = lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /(?:^|\s)\/(?=\s|$)/u.test(line))
    .map(({ number }) => number)
  if (slashLines.length > 0) {
    hints.push(
      `A “/” stands alone on ${slashLines.length === 1 ? 'line' : 'lines'} ${slashLines.join(', ')}` +
      ' — likely left over from opening the field menu.',
    )
  }

  // Closed tokens first, so only a genuinely unfinished one is left.
  const unclosed = content.replace(/\{\{[^{}]*\}\}/gu, '')
  if (unclosed.includes('{{')) {
    hints.push('An unfinished “{{” has no closing “}}” — it will reach the model as written.')
  }
  return hints
}

export interface PromptSegment {
  text: string
  /** The registry field this segment fills, or null for ordinary prose. */
  variableId: string | null
}

/**
 * Splits prompt content into prose and the tokens the run will substitute.
 *
 * The pattern matches fillPromptTemplate in workspace-client-shortlist, so a
 * segment marked here is exactly a segment the run replaces. Prose written in
 * placeholder syntax stays prose, the same way the filler leaves it alone —
 * clean_email's "unfilled {{placeholders}} must never appear" is an
 * instruction, not a field, and must not be coloured as one.
 */
export function splitPromptTokens(
  content: string,
  known: (id: string) => boolean,
): PromptSegment[] {
  const segments: PromptSegment[] = []
  let cursor = 0
  for (const match of content.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/gu)) {
    const id = match[1]
    if (!known(id)) continue
    const start = match.index ?? 0
    if (start > cursor) segments.push({ text: content.slice(cursor, start), variableId: null })
    segments.push({ text: match[0], variableId: id })
    cursor = start + match[0].length
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), variableId: null })
  return segments
}

/**
 * Fields a given stage must not be offered: the ones it writes itself, and the
 * ones written after it.
 *
 * A stage cannot read its own output — the podcast_research editor offering
 * {{research_report}} invites a prompt to reference the thing it is in the
 * middle of producing, which reaches the model as "Not available" every time.
 * Producers outside the stage list (the inbox, the email unlock, the
 * relationship layer) are left alone: they are not stages in this order and
 * their values exist before it starts.
 */
export function unavailableVariableIds(
  promptId: string,
  stageOrder: readonly string[],
): string[] {
  const index = stageOrder.indexOf(promptId)
  if (index === -1) return []
  const selfOrLater = new Set(stageOrder.slice(index))
  return PROMPT_VARIABLES
    .filter((variable) => variable.producedBy && selfOrLater.has(variable.producedBy))
    .map((variable) => variable.id)
}

/** Whether an id names a field the run already provides. */
export function isRegistryVariable(id: string): boolean {
  return PROMPT_VARIABLES.some((variable) => variable.id === id)
}

/**
 * Splits text on every occurrence of the query, so a row can show where it
 * matched.
 *
 * Fields are matched on their description as well as their id — that is what
 * makes "media kit" find client_media_kit_url, whose id says nothing about a
 * media kit. The cost is rows whose id looks unrelated to what was typed:
 * /host returns reply_subject, because its description is "Subject of the host
 * reply". Marking the hit answers that at a glance, which is better than either
 * dropping description matching or making it conditional on how well the ids
 * did.
 */
export function splitOnMatch(text: string, query: string): Array<{ text: string; match: boolean }> {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [{ text, match: false }]

  const haystack = text.toLowerCase()
  const segments: Array<{ text: string; match: boolean }> = []
  let cursor = 0
  while (cursor < text.length) {
    const at = haystack.indexOf(needle, cursor)
    if (at === -1) {
      segments.push({ text: text.slice(cursor), match: false })
      break
    }
    if (at > cursor) segments.push({ text: text.slice(cursor, at), match: false })
    segments.push({ text: text.slice(at, at + needle.length), match: true })
    cursor = at + needle.length
  }
  return segments.filter((segment) => segment.text !== '')
}

/** Replaces the trigger text with the token, leaving the caret after it. */
export function applyVariableTrigger(
  value: string,
  trigger: VariableTrigger,
  caret: number,
  id: string,
): { next: string; caret: number } {
  const token = `{{${id}}}`
  const before = value.slice(0, trigger.start)
  const after = value.slice(caret)
  const lead = before && !/\s$/u.test(before) ? ' ' : ''
  return {
    next: `${before}${lead}${token}${after}`,
    caret: before.length + lead.length + token.length,
  }
}

/**
 * Inserts a token at the caret, replacing any selection, like Clay's columns.
 * A token dropped straight against a word is unreadable, so pad only where the
 * neighbouring character is not already whitespace.
 */
export function spliceAtCaret(
  value: string,
  start: number,
  end: number,
  token: string,
): { next: string; caret: number } {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const lead = before && !/\s$/u.test(before) ? ' ' : ''
  const trail = after && !/^\s/u.test(after) ? ' ' : ''
  const inserted = `${lead}${token}${trail}`
  return { next: `${before}${inserted}${after}`, caret: start + inserted.length }
}

const MIRRORED_STYLES = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
  'lineHeight', 'textTransform', 'textIndent', 'wordSpacing',
] as const

/**
 * Where the caret sits inside a textarea, relative to its top-left padding box.
 *
 * A textarea exposes no caret coordinates, so the text up to the caret is laid
 * out in a hidden clone of the field and the marker span is measured. Returns
 * the origin under jsdom, where nothing has a layout — the menu still renders.
 */
export function measureCaret(field: HTMLTextAreaElement, index: number): { top: number; left: number } {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { top: 0, left: 0 }

  const computed = window.getComputedStyle(field)
  const mirror = document.createElement('div')
  MIRRORED_STYLES.forEach((property) => {
    mirror.style[property] = computed[property]
  })
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.height = 'auto'

  mirror.textContent = field.value.slice(0, index)
  const marker = document.createElement('span')
  // A zero-width marker collapses; the following character gives it a box.
  marker.textContent = field.value.slice(index) || '.'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top = marker.offsetTop - field.scrollTop
  const left = marker.offsetLeft - field.scrollLeft
  document.body.removeChild(mirror)

  return { top, left }
}
