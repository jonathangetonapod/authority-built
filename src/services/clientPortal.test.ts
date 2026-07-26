import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completePortalPasswordReset,
  getPortalExperience,
  loginWithPassword,
  requestPortalPasswordReset,
  sessionStorage,
  validateSession,
} from '@/services/clientPortal'
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

describe('clientPortal password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends reset requests with the expected payload', async () => {
    mockedInvoke.mockResolvedValue({ data: { success: true }, error: null } as never)

    await requestPortalPasswordReset('taylor@example.com')

    expect(mockedInvoke).toHaveBeenCalledWith('portal-password-reset', {
      body: { action: 'request', email: 'taylor@example.com' },
    })
  })

  it('completes a reset with token and password', async () => {
    mockedInvoke.mockResolvedValue({ data: { success: true }, error: null } as never)

    await completePortalPasswordReset('11111111-1111-4111-8111-111111111111', 'new-password-9!')

    expect(mockedInvoke).toHaveBeenCalledWith('portal-password-reset', {
      body: { action: 'complete', token: '11111111-1111-4111-8111-111111111111', password: 'new-password-9!' },
    })
  })

  it('throws a generic error when completion fails', async () => {
    mockedInvoke.mockResolvedValue({ data: { success: false }, error: null } as never)

    await expect(completePortalPasswordReset('token', 'new-password-9!'))
      .rejects.toThrow('This reset link is invalid or has expired.')
  })
})

describe('clientPortal experience overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('loads the aggregated overview with the stored session token', async () => {
    const client = { id: '22222222-2222-4222-8222-222222222222', name: 'Taylor', email: 't@example.com' }
    const session = {
      session_token: '33333333-3333-4333-8333-333333333333',
      expires_at: '2099-01-01T00:00:00.000Z',
      client_id: client.id,
    }
    sessionStorage.save(session as never, client as never)
    const overview = {
      profile: { name: 'Taylor', photo_url: null, bio: null, media_kit_url: null, calendar_link: null, dashboard_tagline: null },
      review: { dashboard_slug: 'taylor-ab12cd34ef', total_visible: 5, awaiting_count: 2, approved_count: 3, rejected_count: 0 },
      outreach: { emails_sent: 40, podcasts_contacted: 18, replies: 4, meetings_booked: 1, in_outreach_count: 6, replied_count: 2, completed_count: 1 },
      pitch_profile: null,
      bookings: [],
    }
    mockedInvoke.mockResolvedValue({ data: overview, error: null } as never)

    const result = await getPortalExperience(client.id)

    expect(mockedInvoke).toHaveBeenCalledWith('portal-experience', {
      body: { clientId: client.id, sessionToken: session.session_token },
    })
    expect(result).toEqual(overview)
  })

  it('refuses to load an overview for a different client than the session', async () => {
    const client = { id: '22222222-2222-4222-8222-222222222222', name: 'Taylor', email: 't@example.com' }
    sessionStorage.save(
      {
        session_token: '33333333-3333-4333-8333-333333333333',
        expires_at: '2099-01-01T00:00:00.000Z',
        client_id: client.id,
      } as never,
      client as never,
    )

    await expect(getPortalExperience('44444444-4444-4444-8444-444444444444'))
      .rejects.toThrow('Portal session does not match the requested client.')
    expect(mockedInvoke).not.toHaveBeenCalled()
  })
})
