import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loginWithPassword, validateSession } from '@/services/clientPortal'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const mockedInvoke = vi.mocked(supabase.functions.invoke)

const branding = {
  name: 'Acme Audio',
  logo_url: 'https://example.supabase.co/storage/v1/object/public/workspace-logos/w/logo.png',
  primary_color: '#112233',
  accent_color: '#445566',
}

describe('clientPortal branding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns workspace branding and dashboard slug from login', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        session_token: 'token',
        expires_at: '2026-07-27T00:00:00.000Z',
        client: { id: 'client-1', name: 'Taylor', email: 't@example.com', photo_url: null, dashboard_slug: 'taylor-ab12cd34ef' },
        branding,
      },
      error: null,
    } as never)

    const result = await loginWithPassword('t@example.com', 'password-123456')

    expect(mockedInvoke).toHaveBeenCalledWith('login-with-password', {
      body: { email: 't@example.com', password: 'password-123456' },
    })
    expect(result.branding).toEqual(branding)
    expect(result.client.dashboard_slug).toBe('taylor-ab12cd34ef')
  })

  it('degrades to null branding when the payload is malformed', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        session_token: 'token',
        expires_at: '2026-07-27T00:00:00.000Z',
        client: { id: 'client-1', name: 'Taylor' },
        branding: { logo_url: 123 },
      },
      error: null,
    } as never)

    const result = await loginWithPassword('t@example.com', 'password-123456')
    expect(result.branding).toBeNull()
  })

  it('returns client and branding from session validation', async () => {
    mockedInvoke.mockResolvedValue({
      data: {
        success: true,
        client: { id: 'client-1', name: 'Taylor', email: null, photo_url: null, dashboard_slug: null },
        branding,
      },
      error: null,
    } as never)

    const result = await validateSession('11111111-1111-4111-8111-111111111111')

    expect(mockedInvoke).toHaveBeenCalledWith('validate-portal-session', {
      body: { sessionToken: '11111111-1111-4111-8111-111111111111' },
    })
    expect(result.client.id).toBe('client-1')
    expect(result.branding?.name).toBe('Acme Audio')
  })

  it('treats missing branding as null without failing validation', async () => {
    mockedInvoke.mockResolvedValue({
      data: { success: true, client: { id: 'client-1', name: 'Taylor' } },
      error: null,
    } as never)

    const result = await validateSession('11111111-1111-4111-8111-111111111111')
    expect(result.branding).toBeNull()
  })
})
