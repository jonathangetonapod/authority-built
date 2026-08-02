import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestWorkspaceAccess } from './accessRequests'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)

describe('requestWorkspaceAccess', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { received: true }, error: null } as never)
  })

  it('sends only the fields that were filled in', async () => {
    await requestWorkspaceAccess({
      fullName: '  Dana Reyes  ',
      email: '  Dana@Example.COM ',
      audience: 'pr',
      company: '',
      website: '   ',
      clientsNow: '4–10',
      notes: '',
    })

    expect(invoke).toHaveBeenCalledWith('request-workspace-access', {
      body: {
        // Lowercased here so a request never lands twice under two casings.
        email: 'dana@example.com',
        fullName: 'Dana Reyes',
        audience: 'pr',
        clientsNow: '4–10',
      },
    })
  })

  it('surfaces the reason the edge function refused', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        context: new Response(
          JSON.stringify({ error: 'A few requests have already come from here today.', code: 'TOO_MANY_REQUESTS' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
      }),
    } as never)

    await expect(requestWorkspaceAccess({
      fullName: 'Dana Reyes',
      email: 'dana@example.com',
      audience: 'agency',
    })).rejects.toThrow(/already come from here today/u)
  })
})
