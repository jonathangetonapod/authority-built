import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { getWorkspacePodcastCatalog } from '@/services/workspacePodcastCatalog'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const response = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  items: [],
  categories: ['Business'],
  pagination: { page: 2, page_size: 24, total: 30, total_pages: 2 },
  summary: {
    total_podcasts: 11807,
    active_podcasts: 9566,
    podcasts_with_free_email: 6610,
    podcasts_with_direct_email: 0,
    podcasts_used_in_shortlists: 100,
    shortlist_uses: 200,
    contributing_workspaces: 3,
  },
}

describe('workspacePodcastCatalog service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the global catalog through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({ data: response, error: null } as never)

    await expect(getWorkspacePodcastCatalog(workspaceId.toUpperCase(), {
      search: ' founder ',
      category: 'Business',
      contact: 'free',
      activity: 'last_90_days',
      audience: '10k_50k',
      sort: 'community',
      page: 2,
    })).resolves.toEqual(response)

    expect(invoke).toHaveBeenCalledWith('workspace-podcast-catalog', {
      body: {
        action: 'list',
        workspace_id: workspaceId,
        search: 'founder',
        category: 'Business',
        contact: 'free',
        activity: 'last_90_days',
        audience: '10k_50k',
        sort: 'community',
        page: 2,
        page_size: 24,
      },
    })
  })

  it('rejects a response for a different workspace', async () => {
    invoke.mockResolvedValueOnce({
      data: { ...response, workspace: { ...response.workspace, id: '22222222-2222-4222-8222-222222222222' } },
      error: null,
    } as never)

    await expect(getWorkspacePodcastCatalog(workspaceId)).rejects.toThrow(
      'did not match the workspace address',
    )
  })
})
