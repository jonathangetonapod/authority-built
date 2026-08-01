interface FunctionErrorPayload {
  error?: unknown
  message?: unknown
  code?: unknown
}

function responseHeaderNumber(headers: Headers, name: string): number | undefined {
  const rawValue = headers.get(name)
  if (rawValue === null || rawValue.trim() === '') return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

export async function toFunctionError(error: unknown, fallback: string): Promise<Error> {
  let message = error instanceof Error && error.message ? error.message : fallback
  let code: string | null = null
  let status: number | undefined
  let retryAfterSeconds: number | undefined
  let concurrencyLimit: number | undefined
  const context = error && typeof error === 'object'
    ? (error as { context?: unknown }).context
    : null

  if (context instanceof Response) {
    status = context.status
    retryAfterSeconds = responseHeaderNumber(context.headers, 'Retry-After')
    concurrencyLimit = responseHeaderNumber(context.headers, 'X-Concurrency-Limit')
    try {
      const payload = await context.clone().json() as FunctionErrorPayload
      if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error
      else if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message
      if (typeof payload.code === 'string' && payload.code.trim()) code = payload.code
    } catch {
      // Keep the SDK/fallback message when the response is not JSON.
    }
  }

  // The code goes in the visible text, not just on `name`.
  //
  // An edge function refuses with a specific check — CAMPAIGN_PITCH_LOCKED,
  // CAMPAIGN_CONTACT_SUPPRESSED — and roughly thirty of them share one status.
  // The browser console prints the status and can never print the body, so
  // without the code on screen, identifying which check fired meant opening
  // DevTools and reading the response by hand. Callers render `message`, so
  // this is the one place that puts it where it is already being read.
  const result = new Error(displayMessage(message, code))
  result.name = code || 'EdgeFunctionError'
  Object.assign(result, { status, retryAfterSeconds, concurrencyLimit })
  return result
}

function displayMessage(message: string, code: string | null): string {
  if (!code) return message
  // A message that already names its code does not need it twice.
  if (message.includes(code)) return message
  return `${message} (${code})`
}
