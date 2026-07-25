import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addWorkspaceProspectPodcasts,
  buildWorkspaceProspect,
  createWorkspaceProspect,
  getWorkspaceProspect,
  getWorkspaceProspects,
  setWorkspaceProspectPublished,
  updateWorkspaceProspectPodcast,
} from '@/services/prospectDashboards'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const dashboardId = '22222222-2222-4222-8222-222222222222'

describe('prospectDashboards service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses workspace-scoped list and detail reads', async () => {
    invoke
      .mockResolvedValueOnce({ data: { dashboards: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { dashboard: { id: dashboardId }, podcasts: [] }, error: null } as never)

    await getWorkspaceProspects(workspaceId)
    await getWorkspaceProspect(workspaceId, dashboardId)

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-prospect-dashboards', {
      body: { action: 'list', workspace_id: workspaceId },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-prospect-dashboards', {
      body: { action: 'detail-get', workspace_id: workspaceId, dashboard_id: dashboardId },
    })
  })

  it('normalizes a concise profile before creating a safe draft', async () => {
    invoke.mockResolvedValueOnce({ data: { dashboard: { id: dashboardId } }, error: null } as never)

    await createWorkspaceProspect(workspaceId, {
      name: '  Dallas Fontaine  ',
      email: '  dallas@scalelabs.dev ',
      company: ' ScaleLabs ',
      bio: '  A focused founder profile.  ',
      expertise: [' SaaS ', 'SaaS', ' B2B sales '],
      topics: [],
      cta_type: 'reply',
      cta_label: ' Reply to this email ',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-prospect-dashboards', {
      body: expect.objectContaining({
        action: 'create',
        workspace_id: workspaceId,
        profile: expect.objectContaining({
          name: 'Dallas Fontaine',
          email: 'dallas@scalelabs.dev',
          company: 'ScaleLabs',
          bio: 'A focused founder profile.',
          expertise: ['SaaS', 'B2B sales'],
          topics: [],
          cta_type: 'reply',
        }),
      }),
    })
  })

  it('maps build, publish, and shortlist edits to narrow actions', async () => {
    invoke
      .mockResolvedValueOnce({ data: { dashboard: {}, podcasts: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { dashboard: {}, podcasts: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { dashboard: {}, podcasts: [] }, error: null } as never)

    await buildWorkspaceProspect(workspaceId, dashboardId)
    await setWorkspaceProspectPublished(workspaceId, dashboardId, true)
    await updateWorkspaceProspectPodcast(workspaceId, dashboardId, 'podcast-one', {
      visibility: 'archived',
    })

    expect(invoke.mock.calls.map((call) => (call[1] as { body: { action: string } }).body.action)).toEqual([
      'build',
      'publish',
      'podcast-update',
    ])
    expect(invoke).toHaveBeenNthCalledWith(3, 'workspace-prospect-dashboards', {
      body: {
        action: 'podcast-update',
        workspace_id: workspaceId,
        dashboard_id: dashboardId,
        podcast_id: 'podcast-one',
        changes: { visibility: 'archived' },
      },
    })
  })

  it('adds Finder results to the selected prospect in bounded batches', async () => {
    invoke.mockResolvedValueOnce({
      data: { added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: true },
      error: null,
    } as never)

    const result = await addWorkspaceProspectPodcasts(workspaceId, dashboardId, [{
      podcast_id: 'podcast-one',
      podcast_name: 'Founder Stories',
      relevance_score: 8.7,
      relevance_reason: 'Strong founder and SaaS audience overlap.',
    }])

    expect(result).toEqual({
      added: 1,
      skipped: 0,
      podcast_ids: ['podcast-one'],
      unpublished_for_review: true,
    })
    expect(invoke).toHaveBeenCalledWith('workspace-prospect-dashboards', {
      body: {
        action: 'podcast-add',
        workspace_id: workspaceId,
        dashboard_id: dashboardId,
        podcasts: [{
          podcast_id: 'podcast-one',
          podcast_name: 'Founder Stories',
          relevance_score: 8.7,
          relevance_reason: 'Strong founder and SaaS audience overlap.',
        }],
      },
    })
  })
})
