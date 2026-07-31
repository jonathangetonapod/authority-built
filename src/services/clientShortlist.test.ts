import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addClientShortlistPodcasts,
  ensureClientShortlistEpisodes,
  generateClientShortlistPitch,
  getClientShortlist,
  getClientShortlistResearchDocument,
  refreshClientShortlistEpisodes,
  reorderClientShortlistFeatured,
  runClientShortlistEmailSearch,
  runClientShortlistResearch,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
} from '@/services/clientShortlist'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

describe('clientShortlist service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes every list and catalog request to the workspace client', async () => {
    invoke
      .mockResolvedValueOnce({ data: { client: { id: clientId, name: 'Client' }, podcasts: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { podcasts: [] }, error: null } as never)

    await getClientShortlist(workspaceId, clientId)
    await searchClientPodcastCatalog(workspaceId, clientId, 'founder')

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-client-shortlist', {
      body: { action: 'list', workspace_id: workspaceId, client_id: clientId },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-client-shortlist', {
      body: { action: 'catalog-search', workspace_id: workspaceId, client_id: clientId, query: 'founder' },
    })
  })

  it('uses narrow add, update, and reorder actions', async () => {
    invoke
      .mockResolvedValueOnce({ data: { added: 1, skipped: 0, podcast_ids: ['podcast-one'] }, error: null } as never)
      .mockResolvedValueOnce({ data: { podcast: { podcast_id: 'podcast-one' } }, error: null } as never)
      .mockResolvedValueOnce({ data: { reordered: 1 }, error: null } as never)

    await addClientShortlistPodcasts(workspaceId, clientId, [{ podcast_id: 'podcast-one', podcast_name: 'Podcast One' }])
    await updateClientShortlistPodcast(workspaceId, clientId, 'podcast-one', { is_featured: true })
    await reorderClientShortlistFeatured(workspaceId, clientId, ['podcast-one'])

    expect(invoke.mock.calls.map((call) => (call[1] as { body: { action: string } }).body.action)).toEqual([
      'add',
      'update',
      'reorder-featured',
    ])
  })

  it('starts a research run scoped to one shortlist podcast and returns progress', async () => {
    const progress = {
      status: 'completed',
      current_stage: null,
      completed_stages: ['podcast_profile', 'recent_episodes', 'host_profile', 'guest_patterns', 'guest_fit', 'pitch_angles'],
      started_at: '2026-07-25T00:00:00.000Z',
      updated_at: '2026-07-25T00:02:00.000Z',
    }
    invoke.mockResolvedValueOnce({ data: { research_progress: progress }, error: null } as never)

    const result = await runClientShortlistResearch(workspaceId, clientId, '33333333-3333-4333-8333-333333333333', true)

    expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist', {
      body: {
        action: 'research-run',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: '33333333-3333-4333-8333-333333333333',
        relationship_acknowledged: true,
      },
    })
    expect(result).toEqual(progress)
  })

  // An invocation is killed at about two minutes and five sequential model
  // calls came to roughly that, so the run stops itself between stages, saves
  // what it has and asks to be called again. To the caller that is still one
  // operation: it resolves when the research is finished, not when the first
  // invocation returns.
  it('keeps calling while the run asks to be continued', async () => {
    const running = (stage: string) => ({
      status: 'running', current_stage: stage,
      completed_stages: [], started_at: 'x', updated_at: 'y',
    })
    const done = { status: 'completed', current_stage: null, completed_stages: [], started_at: 'x', updated_at: 'z' }
    invoke
      .mockResolvedValueOnce({ data: { research_progress: running('host_profile'), continue_required: true }, error: null } as never)
      .mockResolvedValueOnce({ data: { research_progress: running('guest_fit'), continue_required: true }, error: null } as never)
      .mockResolvedValueOnce({ data: { research_progress: done }, error: null } as never)

    const seen: string[] = []
    const result = await runClientShortlistResearch(
      workspaceId, clientId, '33333333-3333-4333-8333-333333333333', false,
      (progress) => seen.push(String(progress.status)),
    )

    expect(invoke).toHaveBeenCalledTimes(3)
    expect(result).toEqual(done)
    // Reported as it goes, so the steps tick over between invocations.
    expect(seen).toEqual(['running', 'running', 'completed'])
  })

  it('returns after one call when the run finished in it', async () => {
    invoke.mockResolvedValueOnce({
      data: { research_progress: { status: 'completed', current_stage: null, completed_stages: [], started_at: 'x', updated_at: 'z' } },
      error: null,
    } as never)

    await runClientShortlistResearch(workspaceId, clientId, '33333333-3333-4333-8333-333333333333')

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  // A backend that always answered "come back" must not spin here forever.
  // Everything finished is saved, so this is an unfinished run, not a failed one.
  it('gives up rather than looping when the run never finishes', async () => {
    invoke.mockResolvedValue({
      data: { research_progress: { status: 'running', current_stage: 'guest_fit', completed_stages: [], started_at: 'x', updated_at: 'y' }, continue_required: true },
      error: null,
    } as never)

    await expect(runClientShortlistResearch(workspaceId, clientId, '33333333-3333-4333-8333-333333333333'))
      .rejects.toThrow(/did not finish/i)
    expect(invoke).toHaveBeenCalledTimes(8)
  })

  it('ensures stored episode metadata for one shortlisted show', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        episodes: [{ title: 'Episode one', description: 'About storage tech', posted_at: '2026-07-20T00:00:00.000Z' }],
        last_posted_at: '2026-07-20T00:00:00.000Z',
        episodes_fetched_at: '2026-07-26T00:00:00.000Z',
      },
      error: null,
    } as never)

    const result = await ensureClientShortlistEpisodes(workspaceId, clientId, 'podcast-one', true)

    expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist', {
      body: {
        action: 'episodes-ensure',
        workspace_id: workspaceId,
        client_id: clientId,
        podcast_id: 'podcast-one',
        relationship_acknowledged: true,
      },
    })
    expect(result).toEqual({
      episodes: [{ title: 'Episode one', description: 'About storage tech', posted_at: '2026-07-20T00:00:00.000Z' }],
      last_posted_at: '2026-07-20T00:00:00.000Z',
      episodes_fetched_at: '2026-07-26T00:00:00.000Z',
    })
  })

  it('forwards an explicit relationship acknowledgement to contact and pitch actions', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { email_unlock: { status: 'unlocked', current_stage: null, completed_stages: [], email: 'host@example.com' } },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { pitch: { subject: 'Warm follow-on', body: 'Good to be back in touch.', angle_index: 0 } },
        error: null,
      } as never)

    await runClientShortlistEmailSearch(workspaceId, clientId, '33333333-3333-4333-8333-333333333333', true)
    await generateClientShortlistPitch(workspaceId, clientId, '33333333-3333-4333-8333-333333333333', 0, true)

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-client-shortlist', {
      body: {
        action: 'email-search-run',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: '33333333-3333-4333-8333-333333333333',
        relationship_acknowledged: true,
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-client-shortlist', {
      body: {
        action: 'pitch-generate',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: '33333333-3333-4333-8333-333333333333',
        angle_index: 0,
        relationship_acknowledged: true,
      },
    })
  })

  it('loads the stored research document for one shortlist podcast', async () => {
    const document = {
      podcast_research: 'Research report',
      host_info: 'Host report',
      guest_info: null,
      find_topics: 'Topic proposal',
      episode_transcript_excerpt: 'Welcome back to the show…',
      recent_guest_name: 'Jamie Rivera',
      episodes_used: [{ title: 'Episode one', had_transcript: true }],
      generated_at: '2026-07-26T00:00:00.000Z',
    }
    invoke.mockResolvedValueOnce({ data: { document }, error: null } as never)

    const result = await getClientShortlistResearchDocument(workspaceId, clientId, '33333333-3333-4333-8333-333333333333')

    expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist', {
      body: {
        action: 'research-inspect',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: '33333333-3333-4333-8333-333333333333',
      },
    })
    expect(result).toEqual(document)
  })

  it('chunks large weekly additions and combines dedupe totals', async () => {
    invoke
      .mockResolvedValueOnce({ data: { added: 50, skipped: 0, podcast_ids: Array.from({ length: 50 }, (_, index) => `podcast-${index}`) }, error: null } as never)
      .mockResolvedValueOnce({ data: { added: 0, skipped: 1, podcast_ids: [] }, error: null } as never)
    const podcasts = Array.from({ length: 51 }, (_, index) => ({
      podcast_id: `podcast-${index}`,
      podcast_name: `Podcast ${index}`,
    }))

    const result = await addClientShortlistPodcasts(workspaceId, clientId, podcasts)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect((invoke.mock.calls[0][1] as { body: { podcasts: unknown[] } }).body.podcasts).toHaveLength(50)
    expect((invoke.mock.calls[1][1] as { body: { podcasts: unknown[] } }).body.podcasts).toHaveLength(1)
    expect(result).toMatchObject({ added: 50, skipped: 1 })
  })
})

describe('refreshClientShortlistEpisodes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the episodes-refresh action for this podcast', async () => {
    invoke.mockResolvedValue({
      data: {
        fetched: true,
        charged: 1,
        has_transcript: true,
        episodes: [{ title: 'Ep 1' }],
        last_posted_at: '2026-07-01',
        episodes_fetched_at: '2026-07-30T10:00:00Z',
      },
      error: null,
    } as never)

    const result = await refreshClientShortlistEpisodes(workspaceId, clientId, 'pod-abc')

    expect(invoke).toHaveBeenCalledWith('workspace-client-shortlist', {
      body: {
        action: 'episodes-refresh',
        workspace_id: workspaceId,
        client_id: clientId,
        podcast_id: 'pod-abc',
      },
    })
    expect(result.fetched).toBe(true)
    expect(result.charged).toBe(1)
    expect(result.has_transcript).toBe(true)
  })

  // The catalogue answering is the free path; the caller has to be able to
  // tell the operator no credit was spent.
  it('reports a catalogue answer as unfetched and uncharged', async () => {
    invoke.mockResolvedValue({
      data: { fetched: false, charged: 0, episodes: [], last_posted_at: null, episodes_fetched_at: null },
      error: null,
    } as never)

    const result = await refreshClientShortlistEpisodes(workspaceId, clientId, 'pod-abc')
    expect(result.fetched).toBe(false)
    expect(result.charged).toBe(0)
    expect(result.episodes).toEqual([])
  })
})
