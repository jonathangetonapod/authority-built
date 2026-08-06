import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceSmartPodcastFinder from '@/pages/app/WorkspaceSmartPodcastFinder'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { generatePodcastQueries } from '@/services/queryGeneration'
import { searchPodcastsWithMeta } from '@/services/podscan'
import { scoreCompatibilityBatch } from '@/services/compatibilityScoring'
import { addClientShortlistPodcasts, searchClientPodcastCatalog } from '@/services/clientShortlist'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'owner@example.com' },
    workspace: { id: '11111111-1111-4111-8111-111111111111', name: 'Agency One' },
    membership: { role: 'owner' },
    platformAdmin: false,
    loading: false,
    signOut: vi.fn(),
  }),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceResearchContext: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/queryGeneration', () => ({ generatePodcastQueries: vi.fn() }))
vi.mock('@/services/podscan', () => ({ searchPodcastsWithMeta: vi.fn() }))
vi.mock('@/services/compatibilityScoring', () => ({ scoreCompatibilityBatch: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn(), searchClientPodcastCatalog: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
// Deliberately not the workspace in AuthContext above: in the platform view the
// viewer's own workspace is never the one on screen.
const viewedWorkspaceId = '99999999-9999-4999-8999-999999999999'

function mockViewedWorkspace() {
  vi.mocked(getAdminWorkspaceView).mockResolvedValue({
    workspace: { id: viewedWorkspaceId, name: 'Viewed Workspace', logo_path: null, logo_updated_at: null },
    clients: [],
  } as never)
}

function podcast(id: string, name: string) {
  return {
    podcast_id: id,
    podcast_name: name,
    podcast_url: `https://example.com/${id}`,
    podcast_description: `${name} description`,
    episode_count: 100,
    last_posted_at: '2026-07-20',
    reach: { audience_size: 12_000 },
    podcast_categories: [{ category_id: 'business', category_name: 'Business' }],
  }
}

function renderFinder(
  initialEntry = `/app/podcast-finder?client=${clientId}`,
  platformWorkspaceId?: string,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceSmartPodcastFinder platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSmartPodcastFinder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceClients).mockResolvedValue([
      {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        contact_person: null,
        linkedin_url: null,
        website: null,
        status: 'active',
        notes: null,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ])
    vi.mocked(getWorkspaceResearchContext).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Agency One', slug: null, status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        website: null,
        status: 'active',
        bio: 'Taylor helps founders scale.',
        photo_url: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: ['pd-existing'],
    })
    vi.mocked(generatePodcastQueries).mockResolvedValue(['founder stories'])
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: {
        podcasts: [
          podcast('pd-low', 'Low Fit Weekly'),
          podcast('pd-high', 'Founder Stories'),
          podcast('pd-existing', 'Already Listed'),
        ],
        pagination: { last_page: '1' },
      },
      rateLimit: {},
    } as never)
    vi.mocked(scoreCompatibilityBatch).mockResolvedValue([
      { podcast_id: 'pd-high', score: 92, reasoning: 'Perfect audience overlap.' },
      { podcast_id: 'pd-catalog', score: 88, reasoning: 'Strong database match.' },
      { podcast_id: 'pd-low', score: 41, reasoning: 'Weak topical match.' },
    ])
    vi.mocked(addClientShortlistPodcasts).mockResolvedValue({ added: 2, skipped: 0, podcast_ids: ['pd-high', 'pd-low'] })
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([
      {
        podcast_id: 'pd-catalog',
        podcast_name: 'Catalog Growth Show',
        podcast_description: 'From the shared database.',
        podcast_image_url: null,
        podcast_url: null,
        publisher_name: null,
        itunes_rating: null,
        episode_count: 80,
        audience_size: 9_000,
        last_posted_at: '2026-07-18',
        podcast_categories: null,
        language: 'en',
        region: null,
        podcast_email: null,
        rss_feed: null,
        already_added: false,
        existing_visibility: null,
      },
    ] as never)
  })

  /*
   * The Smart Finder had no platform view at all — the platform address for
   * this module resolved to the advanced finder — so an agency's own people and
   * the operator viewing them got different pages from the same sidebar item.
   * Reachable now, and scoped to the workspace on screen rather than the one in
   * AuthContext, which is always the viewer's own.
   */
  it('reads the viewed workspace when a platform admin opens it, not their own', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    await waitFor(() => expect(vi.mocked(getWorkspaceClients)).toHaveBeenCalledWith(viewedWorkspaceId))
    expect(vi.mocked(getWorkspaceClients)).not.toHaveBeenCalledWith(workspaceId)
  })

  /*
   * The client list is only half of what the page reads. The research context
   * carries the bio the AI matches against and the ids already on the client's
   * list, so asking the viewer's own workspace for it would either fail or
   * answer about a different agency's client. And ?client= is how every other
   * module hands a client to this one, so the platform view has to honour it
   * too or the operator arrives at an empty chooser.
   */
  it('reads the research context from the viewed workspace, and still honours ?client=', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    // The client arrived from the URL: the scan button already names them.
    expect(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })).toBeInTheDocument()
    await waitFor(() =>
      expect(vi.mocked(getWorkspaceResearchContext)).toHaveBeenCalledWith(viewedWorkspaceId, clientId))
    expect(vi.mocked(getWorkspaceResearchContext)).not.toHaveBeenCalledWith(workspaceId, clientId)
  })

  /*
   * Scanning spends the viewed workspace's Podscan quota and AI credits and
   * writes rows onto its client's list. A workspace id taken from AuthContext
   * anywhere along that path would bill one agency for another's scan and file
   * the results in the wrong tenant.
   */
  it('scans and files the results against the viewed workspace, not the viewer’s', async () => {
    mockViewedWorkspace()

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' }))
    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()

    expect(vi.mocked(searchClientPodcastCatalog)).toHaveBeenCalledWith(viewedWorkspaceId, clientId, expect.any(String))
    expect(vi.mocked(generatePodcastQueries)).toHaveBeenCalledWith({ workspaceId: viewedWorkspaceId, clientId })
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(expect.any(Object), viewedWorkspaceId)
    expect(vi.mocked(scoreCompatibilityBatch).mock.calls[0][5]).toEqual({ workspaceId: viewedWorkspaceId, clientId })

    fireEvent.click(await screen.findByRole('button', { name: /^Add top/ }))
    await waitFor(() => expect(vi.mocked(addClientShortlistPodcasts)).toHaveBeenCalled())
    expect(vi.mocked(addClientShortlistPodcasts).mock.calls[0][0]).toBe(viewedWorkspaceId)
    expect(vi.mocked(addClientShortlistPodcasts)).not.toHaveBeenCalledWith(workspaceId, expect.anything(), expect.anything())
  })

  /*
   * A link written as a literal /app/… moves a platform admin out of the
   * workspace they were looking at and into their own, silently. Both of the
   * page's body links have to follow the viewed workspace's baseHref.
   */
  it('offers to add the first client inside the workspace on screen', async () => {
    mockViewedWorkspace()
    vi.mocked(getWorkspaceClients).mockResolvedValue([])

    renderFinder(`/app/workspaces/${viewedWorkspaceId}/podcast-finder`, viewedWorkspaceId)

    expect(await screen.findByRole('link', { name: 'Add your first client' }))
      .toHaveAttribute('href', `/app/workspaces/${viewedWorkspaceId}/clients`)

    cleanup()
    renderFinder('/app/podcast-finder')

    expect(await screen.findByRole('link', { name: 'Add your first client' }))
      .toHaveAttribute('href', '/app/clients')
  })

  it('sends a fruitless scan on to the advanced finder inside the workspace on screen', async () => {
    mockViewedWorkspace()
    // Nothing new: the catalog is silent and Podscan only returns a show that
    // is already on the client's list, which is what opens the empty state.
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([] as never)
    vi.mocked(searchPodcastsWithMeta).mockResolvedValue({
      data: { podcasts: [podcast('pd-existing', 'Already Listed')], pagination: { last_page: '1' } },
      rateLimit: {},
    } as never)

    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' }))

    expect(await screen.findByRole('link', { name: 'advanced finder' }))
      .toHaveAttribute('href', `/app/workspaces/${viewedWorkspaceId}/podcast-finder/advanced`)

    cleanup()
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' }))

    expect(await screen.findByRole('link', { name: 'advanced finder' }))
      .toHaveAttribute('href', '/app/podcast-finder/advanced')
  })

  /*
   * The header button is always on screen and is the ordinary way to reach the
   * advanced finder, which makes it the worst of these to leave hardcoded: it
   * sent the operator to their own workspace's advanced finder, rebranded and
   * scoped to a client id belonging to the agency they had just left. It was
   * missed when the two body links were fixed, because it builds its path in a
   * template literal rather than a plain string.
   */
  it('keeps the header advanced-finder button inside the workspace on screen', async () => {
    mockViewedWorkspace()
    renderFinder(
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder?client=${clientId}`,
      viewedWorkspaceId,
    )

    const platformLink = await screen.findByRole('link', { name: /advanced finder/i })
    expect(platformLink).toHaveAttribute(
      'href',
      `/app/workspaces/${viewedWorkspaceId}/podcast-finder/advanced?client=${clientId}`,
    )

    cleanup()

    renderFinder(`/app/podcast-finder?client=${clientId}`)
    expect(await screen.findByRole('link', { name: /advanced finder/i }))
      .toHaveAttribute('href', `/app/podcast-finder/advanced?client=${clientId}`)
  })

  it('scans, ranks by AI fit, and never rescored podcasts already on the list', async () => {
    renderFinder()

    const scanButton = await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })
    fireEvent.click(scanButton)

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    expect(vi.mocked(generatePodcastQueries)).toHaveBeenCalledWith({ workspaceId, clientId })
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'founder stories', has_guests: true, order_by: 'best_match' }),
      workspaceId,
    )
    const scored = vi.mocked(scoreCompatibilityBatch).mock.calls[0]
    expect(scored[0]).toBe('Taylor helps founders scale.')
    expect((scored[1] as Array<{ podcast_id: string }>).map((entry) => entry.podcast_id)).toEqual(['pd-catalog', 'pd-low', 'pd-high'])

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Founder Stories')
    expect(items[0]).toHaveTextContent('92 fit')
    expect(items[0]).toHaveTextContent('Perfect audience overlap.')
    expect(items[1]).toHaveTextContent('Catalog Growth Show')
    expect(items[1]).toHaveTextContent('In your database')
    expect(items[2]).toHaveTextContent('Low Fit Weekly')
    expect(screen.queryByText('Already Listed')).not.toBeInTheDocument()
  })

  it('adds the ranked podcasts to the client list with their compatibility scores', async () => {
    renderFinder()
    fireEvent.click(await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add top 3' }))

    await waitFor(() => expect(vi.mocked(addClientShortlistPodcasts)).toHaveBeenCalled())
    const [calledWorkspaceId, calledClientId, inputs] = vi.mocked(addClientShortlistPodcasts).mock.calls[0]
    expect(calledWorkspaceId).toBe(workspaceId)
    expect(calledClientId).toBe(clientId)
    expect(inputs.map((input) => input.podcast_id)).toEqual(['pd-high', 'pd-catalog', 'pd-low'])
    expect(inputs[0]).toMatchObject({ compatibility_score: 9.2, compatibility_reasoning: 'Perfect audience overlap.' })
    expect(await screen.findAllByRole('button', { name: /Added/ })).toHaveLength(3)
  })

  it('lets the owner search with their own keywords and filters instead of the AI strategy', async () => {
    renderFinder()
    await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })

    fireEvent.change(screen.getByLabelText('Your keywords'), { target: { value: '"b2b saas" AND founders' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('switch', { name: 'AI search strategy' }))
    fireEvent.change(screen.getByLabelText('Min audience'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Scan podcasts for Taylor Client' }))

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    expect(vi.mocked(generatePodcastQueries)).not.toHaveBeenCalled()
    expect(vi.mocked(searchPodcastsWithMeta)).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '"b2b saas" AND founders',
        min_audience_size: 5000,
        has_guests: true,
      }),
      workspaceId,
    )
  })

  it('previews the AI strategy so individual queries can be removed before scanning', async () => {
    renderFinder()
    await screen.findByRole('button', { name: 'Scan podcasts for Taylor Client' })

    fireEvent.click(screen.getByRole('button', { name: 'Preview strategy' }))
    expect(await screen.findByText('founder stories')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove AI query founder stories' }))
    fireEvent.change(screen.getByLabelText('Your keywords'), { target: { value: 'bootstrapping' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scan podcasts for Taylor Client' }))

    expect(await screen.findByText('Ranked by fit for Taylor Client')).toBeInTheDocument()
    const searchedQueries = vi.mocked(searchPodcastsWithMeta).mock.calls.map((call) => (call[0] as { query: string }).query)
    expect(searchedQueries).toContain('bootstrapping')
    expect(searchedQueries).not.toContain('founder stories')
  })

  it('blocks scanning until the client has a profile bio', async () => {
    vi.mocked(getWorkspaceResearchContext).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Agency One', slug: null, status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Taylor Client',
        email: null,
        website: null,
        status: 'active',
        bio: null,
        photo_url: null,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: [],
    })
    renderFinder()

    expect(await screen.findByText(/has no profile bio yet/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Scan podcasts for Taylor Client' }))
    expect(vi.mocked(generatePodcastQueries)).not.toHaveBeenCalled()
  })
})
