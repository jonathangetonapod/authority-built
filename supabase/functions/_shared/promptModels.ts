/**
 * The Claude models a stage may run on, read from Anthropic rather than listed
 * here.
 *
 * A hardcoded list goes stale the moment a model ships or retires, and it also
 * lies in the other direction: model access varies by key, so a workspace on
 * its own Anthropic key may reach models the platform key does not, or fewer.
 * Asking the Models API answers both — the list is what THIS key can actually
 * use, today.
 *
 * What the API cannot tell us is kept below as BEHAVIOUR, deliberately small.
 */

/** The subset of a model the picker and the run actually need. */
export interface PromptModel {
  id: string
  label: string
  /** Context window. Null when the API did not report one. */
  contextTokens: number | null
  /** Output cap, which bounds what a stage can be asked to write. */
  maxOutputTokens: number | null
  /** True when omitting `thinking` makes this model think. See BEHAVIOUR. */
  thinksByDefault: boolean
}

/**
 * What the Models API does not expose: whether a model thinks when the
 * `thinking` parameter is absent.
 *
 * This is a default, not a capability, and `capabilities.thinking` reports only
 * what is *supported*. It matters because the request sends one `max_tokens`
 * covering thinking AND the answer — so on a model that thinks by default, a
 * stage capped at 4,096 can spend most of that budget reasoning and return a
 * truncated report, which still reads like a report. Stages on these models are
 * sent an explicit disabled config so that choosing a model changes the model
 * and nothing else.
 *
 * A model absent from this map is treated as not thinking by default, which is
 * how every model behaved before the Claude 5 generation. That is the safe
 * direction: the cost of being wrong is a stage that thinks when we did not ask
 * it to, whereas sending a `thinking` parameter to a model that will not accept
 * one fails the stage outright.
 */
const THINKS_BY_DEFAULT = new Set<string>([
  'claude-opus-5',
  'claude-sonnet-5',
])

/**
 * The thinking parameter to send for a model, or null to send none.
 *
 * Null for anything not known to think by default — see the note above on why
 * silence is safer than a blanket disabled config.
 */
export function thinkingForModel(id: string): { type: 'disabled' } | null {
  return THINKS_BY_DEFAULT.has(id) ? { type: 'disabled' } : null
}

interface ModelsApiEntry {
  id?: unknown
  display_name?: unknown
  max_input_tokens?: unknown
  max_tokens?: unknown
}

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null

/** One API entry, kept only when it carries an id we could actually send. */
function toPromptModel(entry: unknown): PromptModel[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  const record = entry as ModelsApiEntry
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return []
  return [{
    id,
    label: typeof record.display_name === 'string' && record.display_name.trim()
      ? record.display_name.trim()
      : id,
    contextTokens: positiveInt(record.max_input_tokens),
    maxOutputTokens: positiveInt(record.max_tokens),
    thinksByDefault: THINKS_BY_DEFAULT.has(id),
  }]
}

/**
 * Every model this key may use, newest first as the API returns them.
 *
 * Paginates, because the endpoint does and a truncated first page would present
 * a partial list as the whole one. Bounded so an unexpected cursor loop cannot
 * spin an invocation against its two-minute ceiling.
 */
export async function fetchPromptModels(apiKey: string): Promise<PromptModel[]> {
  const models: PromptModel[] = []
  let afterId: string | null = null

  for (let page = 0; page < 10; page += 1) {
    const url = new URL('https://api.anthropic.com/v1/models')
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)

    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`the model list could not be read (${response.status})`)
    }
    const body = await response.json() as { data?: unknown; has_more?: unknown; last_id?: unknown }
    const entries = Array.isArray(body.data) ? body.data : []
    models.push(...entries.flatMap(toPromptModel))

    if (body.has_more !== true || typeof body.last_id !== 'string' || !body.last_id) break
    afterId = body.last_id
  }

  return models
}
