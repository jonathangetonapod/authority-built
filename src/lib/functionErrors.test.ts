import { describe, expect, it } from 'vitest'
import { toFunctionError } from '@/lib/functionErrors'

describe('toFunctionError', () => {
  it('preserves rate-limit response details for retry handling', async () => {
    const context = new Response(JSON.stringify({
      error: 'Podscan concurrency limit reached',
      code: 'PODSCAN_CONCURRENCY_LIMIT',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '7',
        'X-Concurrency-Limit': '15',
      },
    })

    const result = await toFunctionError({ context }, 'Podscan request failed.') as Error & {
      status?: number
      retryAfterSeconds?: number
      concurrencyLimit?: number
    }

    // The code is in the visible text: roughly thirty distinct refusals share
    // one status, and the console can only ever print the status.
    expect(result.message).toBe('Podscan concurrency limit reached (PODSCAN_CONCURRENCY_LIMIT)')
    expect(result.name).toBe('PODSCAN_CONCURRENCY_LIMIT')
    expect(result.status).toBe(429)
    expect(result.retryAfterSeconds).toBe(7)
    expect(result.concurrencyLimit).toBe(15)
  })

  it('leaves a coded refusal identifiable from the message alone', async () => {
    const context = new Response(JSON.stringify({
      error: 'This host has already replied. Continue the conversation in the Master Inbox instead of editing the pitch.',
      code: 'CAMPAIGN_PITCH_LOCKED',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })

    const result = await toFunctionError({ context }, 'The pitch could not be sent.')

    expect(result.message).toBe('This host has already replied. Continue the conversation in the Master Inbox instead of editing the pitch. (CAMPAIGN_PITCH_LOCKED)')
  })

  it('does not print the code twice when the message already names it', async () => {
    const context = new Response(JSON.stringify({
      error: 'Refused by CAMPAIGN_CONTACT_SUPPRESSED',
      code: 'CAMPAIGN_CONTACT_SUPPRESSED',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })

    const result = await toFunctionError({ context }, 'Failed.')

    expect(result.message).toBe('Refused by CAMPAIGN_CONTACT_SUPPRESSED')
  })

  // Network failures and non-JSON responses carry no code to report, and a
  // bare "(undefined)" would be worse than nothing.
  it('leaves an uncoded failure message untouched', async () => {
    const result = await toFunctionError(new Error('Failed to fetch'), 'Request failed.')

    expect(result.message).toBe('Failed to fetch')
    expect(result.name).toBe('EdgeFunctionError')
  })

  it('falls back without a code when the body is not JSON', async () => {
    const context = new Response('<html>502</html>', { status: 502 })

    const result = await toFunctionError({ context }, 'Request failed.')

    expect(result.message).toBe('Request failed.')
  })

  it('does not mistake missing numeric headers for zero-valued limits', async () => {
    const context = new Response(JSON.stringify({ error: 'Upstream unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await toFunctionError({ context }, 'Request failed.') as Error & {
      retryAfterSeconds?: number
      concurrencyLimit?: number
    }

    expect(result.retryAfterSeconds).toBeUndefined()
    expect(result.concurrencyLimit).toBeUndefined()
  })
})
