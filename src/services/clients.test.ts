import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getClients,
  getWorkspaceClientDetail,
  getWorkspaceResearchContext,
  setWorkspaceClientPassword,
  updateWorkspaceClientProfile,
} from '@/services/clients'

const { from, invoke } = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from,
    functions: { invoke },
  },
}))

describe('getClients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies the selected workspace before returning active research clients', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({ data: [], error: null, count: 0 })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).resolves.toEqual({
      clients: [],
      total: 0,
    })
    expect(from).toHaveBeenCalledWith('clients')
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'status', 'active')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', workspaceId)
  })

  it('fails closed if a workspace-scoped response contains another workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({
      data: [{ id: 'client-1', workspace_id: '22222222-2222-4222-8222-222222222222' }],
      error: null,
      count: 1,
    })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).rejects.toThrow(
      'The selected workspace response did not match the client scope.',
    )
  })
})

describe('getWorkspaceResearchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads one client through the workspace-bound function contract', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    const context = {
      workspace: {
        id: workspaceId,
        name: 'Agency',
        slug: 'agency',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Client',
        email: 'client@example.com',
        website: null,
        status: 'active',
        bio: 'Approved client profile',
        photo_url: null,
        updated_at: '2026-07-23T00:00:00.000Z',
      },
      existing_podcast_ids: ['podcast-one', 'podcast-two'],
    }
    invoke.mockResolvedValue({ data: context, error: null })

    await expect(getWorkspaceResearchContext(workspaceId.toUpperCase(), clientId.toUpperCase())).resolves.toEqual(context)
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: {
        action: 'research-get',
        workspace_id: workspaceId,
        client_id: clientId,
      },
    })
  })

  it('keeps older research responses usable with an empty history', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, status: 'active' },
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).resolves.toMatchObject({
      existing_podcast_ids: [],
    })
  })

  it('rejects malformed client podcast history instead of weakening dedupe', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, status: 'active' },
        existing_podcast_ids: ['valid-id', ''],
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).rejects.toThrow(
      'The podcast research history response was invalid.',
    )
  })

  it('rejects a client response from another workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: {
          id: clientId,
          workspace_id: '33333333-3333-4333-8333-333333333333',
          status: 'active',
        },
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).rejects.toThrow(
      'The podcast research context did not match the workspace client address.',
    )
  })
})

describe('getWorkspaceClientDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the legacy client command-center data through a workspace-bound contract', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    const detail = {
      workspace: {
        id: workspaceId,
        name: 'Agency',
        slug: 'agency',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer_role: 'owner',
      can_manage: true,
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Client',
        bookings: undefined,
        dashboard_slug: 'client-dashboard',
        dashboard_enabled: true,
      },
      dashboard: {
        configured: true,
        enabled: true,
        tagline: null,
        view_count: 3,
        last_viewed_at: null,
        podcast_count: 10,
        reviewed_count: 6,
        approved_count: 4,
        rejected_count: 2,
        to_review_count: 4,
        analyzed_count: 8,
        last_synced_at: null,
        last_feedback_at: null,
      },
      outreach: {
        initial_emails_sent: 24,
        podcasts_contacted: 20,
        pending_review_count: 3,
        approved_count: 2,
        failed_count: 1,
        last_sent_at: '2026-07-23T09:00:00.000Z',
      },
      bookings: [{ id: 'booking-1', client_id: clientId }],
      onboarding: { id: 'onboarding-1', workspace_id: workspaceId, client_id: clientId },
    }
    invoke.mockResolvedValue({ data: detail, error: null })

    await expect(getWorkspaceClientDetail(workspaceId.toUpperCase(), clientId.toUpperCase())).resolves.toEqual(detail)
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: {
        action: 'detail-get',
        workspace_id: workspaceId,
        client_id: clientId,
      },
    })
  })

  it('rejects podcast or onboarding data belonging to another client', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, dashboard_slug: null, dashboard_enabled: false },
        dashboard: {
          configured: false,
          enabled: false,
          tagline: null,
          view_count: 0,
          last_viewed_at: null,
          podcast_count: 0,
          reviewed_count: 0,
          approved_count: 0,
          rejected_count: 0,
          to_review_count: 0,
          analyzed_count: 0,
          last_synced_at: null,
          last_feedback_at: null,
        },
        bookings: [{ id: 'booking-1', client_id: '33333333-3333-4333-8333-333333333333' }],
        onboarding: null,
      },
      error: null,
    })

    await expect(getWorkspaceClientDetail(workspaceId, clientId)).rejects.toThrow(
      'The client detail response did not match the workspace client address.',
    )
  })

  it('rejects an internally inconsistent dashboard summary', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, dashboard_slug: 'client-dashboard', dashboard_enabled: true },
        dashboard: {
          configured: true,
          enabled: true,
          tagline: null,
          view_count: 1,
          last_viewed_at: null,
          podcast_count: 4,
          reviewed_count: 3,
          approved_count: 2,
          rejected_count: 0,
          to_review_count: 1,
          analyzed_count: 2,
          last_synced_at: null,
          last_feedback_at: null,
        },
        bookings: [],
        onboarding: null,
      },
      error: null,
    })

    await expect(getWorkspaceClientDetail(workspaceId, clientId)).rejects.toThrow(
      'The client detail response did not match the workspace client address.',
    )
  })
})

describe('updateWorkspaceClientProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates only the canonical profile through the workspace-scoped contract', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    const expectedUpdatedAt = '2026-07-23T00:00:00.000Z'
    const updatedAt = '2026-07-24T00:00:00.000Z'
    invoke.mockResolvedValue({
      data: {
        client: {
          id: clientId,
          workspace_id: workspaceId,
          bio: 'A concise approved profile.',
          updated_at: updatedAt,
        },
      },
      error: null,
    })

    await expect(updateWorkspaceClientProfile(
      workspaceId.toUpperCase(),
      clientId.toUpperCase(),
      '  A concise approved profile.  ',
      expectedUpdatedAt,
    )).resolves.toEqual({
      id: clientId,
      workspace_id: workspaceId,
      bio: 'A concise approved profile.',
      updated_at: updatedAt,
    })
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: {
        action: 'profile-update',
        workspace_id: workspaceId,
        client_id: clientId,
        bio: 'A concise approved profile.',
        expected_updated_at: expectedUpdatedAt,
      },
    })
  })

  it('rejects a profile response outside the requested client scope', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        client: {
          id: clientId,
          workspace_id: '33333333-3333-4333-8333-333333333333',
          bio: 'Wrong workspace.',
          updated_at: '2026-07-24T00:00:00.000Z',
        },
      },
      error: null,
    })

    await expect(updateWorkspaceClientProfile(
      workspaceId,
      clientId,
      'Wrong workspace.',
      '2026-07-23T00:00:00.000Z',
    )).rejects.toThrow('did not match the workspace client address')
  })
})

describe('setWorkspaceClientPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the explicit workspace/client boundary and accepts only a configured response', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValueOnce({
      data: { success: true, configured: true },
      error: null,
    })

    await expect(setWorkspaceClientPassword(
      workspaceId,
      clientId,
      'Secure-Portal-42!',
    )).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('manage-client-portal-password', {
      body: {
        action: 'set',
        workspace_id: workspaceId,
        client_id: clientId,
        password: 'Secure-Portal-42!',
      },
    })

    invoke.mockResolvedValueOnce({ data: { success: true, configured: false }, error: null })
    await expect(setWorkspaceClientPassword(
      workspaceId,
      clientId,
      'Secure-Portal-42!',
    )).rejects.toThrow('client portal password response was invalid')
  })
})
