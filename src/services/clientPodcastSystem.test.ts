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
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    logo_path: `${workspaceId}/logo.png`,
    logo_updated_at: '2026-07-25T11:00:00.000Z',
  },
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

  /*
   * The browser bundle and the edge function ship separately, so a page built
   * with these fields can be talking to a function deployed without them. The
   * type would otherwise promise two fields that are simply absent.
   */
  it('reads a missing logo as no logo rather than passing undefined on', async () => {
    invoke.mockResolvedValue({
      data: { ...response, workspace: { id: workspaceId, name: 'Acme Workspace' } },
      error: null,
    } as never)

    const result = await getWorkspaceClientPodcastSystem(workspaceId)

    expect(result.workspace.logo_path).toBeNull()
    expect(result.workspace.logo_updated_at).toBeNull()
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
