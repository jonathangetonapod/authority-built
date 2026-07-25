import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastSystemResponse,
} from '@/services/clientPodcastSystem'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const response: ClientPodcastSystemResponse = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  viewer_role: 'owner',
  can_manage: true,
  generated_at: '2026-07-25T12:00:00.000Z',
  clients: [],
  summary: {
    total: 0,
    active: 0,
    completed: 0,
    needs_attention: 0,
    upcoming_recordings: 0,
    awaiting_publication: 0,
    stage_counts: {
      awaiting_review: 0,
      approved: 0,
      contact_needed: 0,
      research_needed: 0,
      ready: 0,
      outreach: 0,
      conversation: 0,
      booked: 0,
      recorded: 0,
      published: 0,
    },
  },
  items: [],
}

describe('clientPodcastSystem service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the lifecycle through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({ data: response, error: null } as never)

    await expect(getWorkspaceClientPodcastSystem(workspaceId.toUpperCase())).resolves.toEqual(response)

    expect(invoke).toHaveBeenCalledWith('workspace-client-podcast-system', {
      body: { action: 'list', workspace_id: workspaceId },
    })
  })

  it('rejects a response for a different workspace', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ...response,
        workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Other Workspace' },
      },
      error: null,
    } as never)

    await expect(getWorkspaceClientPodcastSystem(workspaceId)).rejects.toThrow(
      'did not match the workspace address',
    )
  })
})
