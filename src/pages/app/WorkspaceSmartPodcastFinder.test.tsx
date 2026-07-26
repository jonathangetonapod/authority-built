import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceSmartPodcastFinder from '@/pages/app/WorkspaceSmartPodcastFinder'
import { getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
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
vi.mock('@/services/queryGeneration', () => ({ generatePodcastQueries: vi.fn() }))
vi.mock('@/services/podscan', () => ({ searchPodcastsWithMeta: vi.fn() }))
vi.mock('@/services/compatibilityScoring', () => ({ scoreCompatibilityBatch: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn(), searchClientPodcastCatalog: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

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

function renderFinder(initialEntry = `/app/podcast-finder?client=${clientId}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceSmartPodcastFinder />
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
