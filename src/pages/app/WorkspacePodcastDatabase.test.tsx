import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspacePodcastDatabase from '@/pages/app/WorkspacePodcastDatabase'
import { addClientShortlistPodcasts } from '@/services/clientShortlist'
import { listHostRelationships } from '@/services/hostRelationships'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspacePodcastCatalog } from '@/services/workspacePodcastCatalog'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/workspacePodcastCatalog', () => ({ getWorkspacePodcastCatalog: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({ listHostRelationships: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCatalog = vi.mocked(getWorkspacePodcastCatalog)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedAdd = vi.mocked(addClientShortlistPodcasts)
const mockedRelationships = vi.mocked(listHostRelationships)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const catalogResponse = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  categories: ['Business', 'Technology'],
  pagination: { page: 1, page_size: 24, total: 1, total_pages: 1 },
  summary: {
    total_podcasts: 11807,
    active_podcasts: 9566,
    podcasts_with_free_email: 6610,
    podcasts_with_direct_email: 0,
    podcasts_used_in_shortlists: 1200,
    shortlist_uses: 2391,
    contributing_workspaces: 3,
  },
  items: [{
    podcast_id: 'podcast-one',
    podcast_name: 'The Founder Show',
    podcast_description: 'Practical conversations with company founders.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/podcast',
    publisher_name: 'Founder Media',
    host_name: null,
    podcast_categories: [{ category_id: 'business', category_name: 'Business' }],
    episode_count: 120,
    itunes_rating: 4.8,
    spotify_rating: null,
    audience_size: 25000,
    podcast_reach_score: 72,
    language: 'en',
    region: 'US',
    website: 'https://example.com',
    rss_feed: 'https://example.com/rss',
    last_posted_at: '2026-07-20T12:00:00.000Z',
    is_active: true,
    catalog_updated_at: '2026-07-20T12:00:00.000Z',
    free_podscan_email: 'show@example.com',
    direct_email: null,
    direct_verified_at: null,
    shortlist_uses: 4,
    workspace_uses: 2,
  }],
} as const

function renderPage(initialEntry = '/app/podcast-database') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspacePodcastDatabase />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspacePodcastDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No history with any of these hosts unless a test says otherwise.
    mockedRelationships.mockResolvedValue([])
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
    } as never)
    mockedCatalog.mockResolvedValue(catalogResponse as never)
    mockedClients.mockResolvedValue([{ id: clientId, name: 'Dallas Fontaine', status: 'active' }] as never)
    mockedAdd.mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['podcast-one'] })
  })

  it('shows the searchable shared catalog without internal network metrics', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Podcast Database' })).toBeInTheDocument()
    expect(screen.queryByText('Usable free inboxes')).not.toBeInTheDocument()
    expect(screen.queryByText('Used in shortlists')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspaces building it')).not.toBeInTheDocument()
    expect(screen.getByText('The Founder Show')).toBeInTheDocument()
    expect(screen.getByText('show@example.com')).toBeInTheDocument()
    expect(screen.getByText('Public email')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Email availability' })).toHaveTextContent('All podcasts')
    expect(screen.getByRole('combobox', { name: 'Publishing recency' })).toHaveTextContent('Active shows')
    expect(screen.getByRole('combobox', { name: 'Audience size' })).toHaveTextContent('Any audience size')
    expect(screen.getByRole('link', { name: /find and contribute podcasts/i })).toHaveAttribute('href', '/app/podcast-finder')
  })

  it('filters by email availability, publishing recency, and audience size', async () => {
    renderPage()
    await screen.findByText('The Founder Show')

    fireEvent.click(screen.getByRole('combobox', { name: 'Email availability' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Has an email' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Publishing recency' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Published in 90 days' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Audience size' }))
    fireEvent.click(await screen.findByRole('option', { name: '10K–50K' }))

    await waitFor(() => expect(mockedCatalog).toHaveBeenLastCalledWith(
      workspaceId,
      expect.objectContaining({
        contact: 'any',
        activity: 'last_90_days',
        audience: '10k_50k',
      }),
    ))
  })

  it('adds selected shared podcasts to a workspace client shortlist', async () => {
    renderPage(`/app/podcast-database?client=${clientId}`)

    expect(await screen.findByText('Browsing for Dallas Fontaine')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to client' }))
    expect(await screen.findByRole('combobox', { name: 'Client' })).toHaveTextContent('Dallas Fontaine')
    fireEvent.click(screen.getByRole('button', { name: 'Add to shortlist' }))

    await waitFor(() => expect(mockedAdd).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      [expect.objectContaining({
        podcast_id: 'podcast-one',
        podcast_name: 'The Founder Show',
        podcast_email: 'show@example.com',
      })],
    ))
  })

  // The same podcast is a row here and a relationship in the book, keyed by the
  // same podcast_id — but only the book knew this host had already passed, or
  // been marked do not contact. Someone building a shortlist saw none of it.
  it('marks a podcast the workspace already has history with', async () => {
    mockedRelationships.mockResolvedValue([{
      podcast_id: 'podcast-one',
      podcast_name: 'The Founder Show',
      podcast_image_url: null,
      host_name: null,
      contact_email: null,
      derived_state: 'declined',
      manual_stage: null,
      summary: null,
      last_contacted_at: null,
      touch_count: 1,
      booked_client_name: null,
      client_count: 0,
      note_count: 0,
      last_note_at: null,
      curated: false,
    }] as never)
    renderPage()

    expect(await screen.findByText('Passed')).toBeInTheDocument()
  })

  it('says nothing about a host nobody has contacted', async () => {
    // Every podcast in the catalogue is this one, so a badge on all of them
    // would say nothing and hide the ones that matter.
    mockedRelationships.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('The Founder Show')).toBeInTheDocument()
    expect(screen.queryByText('Passed')).not.toBeInTheDocument()
    expect(screen.queryByText('Not contacted')).not.toBeInTheDocument()
  })

  // A relationship book that will not load must not take the catalogue with it.
  it('still lists podcasts when the relationship book cannot be read', async () => {
    mockedRelationships.mockRejectedValue(new Error('relationships unavailable'))
    renderPage()

    expect(await screen.findByText('The Founder Show')).toBeInTheDocument()
  })
})
