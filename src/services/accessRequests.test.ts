import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listJoinRequests, requestWorkspaceAccess, setJoinRequestStatus } from './accessRequests'
import { supabase } from '@/lib/supabase'

const table = {
  select: vi.fn(),
  update: vi.fn(),
  order: vi.fn(),
  eq: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(() => table),
    auth: { getUser: vi.fn() },
  },
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

describe('the admin queue', () => {
  beforeEach(() => {
    table.select.mockReset().mockReturnValue(table)
    table.update.mockReset().mockReturnValue(table)
    table.order.mockReset().mockResolvedValue({ data: [], error: null })
    table.eq.mockReset().mockResolvedValue({ error: null })
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: 'admin-1' } } } as never)
  })

  // The hash exists only to count repeat submissions. It must never be handed
  // to a browser, even an admin's.
  it('never selects the stored IP hash', async () => {
    await listJoinRequests()
    expect(supabase.from).toHaveBeenCalledWith('workspace_access_requests')
    expect(table.select.mock.calls[0][0]).not.toContain('source_ip_hash')
    expect(table.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('stamps who acted, from their own session rather than an argument', async () => {
    await setJoinRequestStatus('r1', 'invited')
    const patch = table.update.mock.calls[0][0]
    expect(patch.status).toBe('invited')
    expect(patch.handled_by).toBe('admin-1')
    expect(patch.handled_at).toEqual(expect.any(String))
    expect(table.eq).toHaveBeenCalledWith('id', 'r1')
  })

  // A request moved back to waiting is unhandled again; leaving handled_at set
  // would have it claim it was dealt with.
  it('clears the handled time when a request goes back to waiting', async () => {
    await setJoinRequestStatus('r1', 'new')
    expect(table.update.mock.calls[0][0].handled_at).toBeNull()
  })

  it('surfaces a refusal from the row-level policy', async () => {
    table.order.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(listJoinRequests()).rejects.toThrow(/permission denied/u)
  })
})
