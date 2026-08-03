import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspacePodcastDatabase from '@/pages/app/WorkspacePodcastDatabase'
import { addClientShortlistPodcasts } from '@/services/clientShortlist'
import { addWorkspaceProspectPodcasts, getWorkspaceProspects } from '@/services/prospectDashboards'
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
vi.mock('@/services/prospectDashboards', () => ({
  getWorkspaceProspects: vi.fn(),
  addWorkspaceProspectPodcasts: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCatalog = vi.mocked(getWorkspacePodcastCatalog)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedAdd = vi.mocked(addClientShortlistPodcasts)
const mockedProspects = vi.mocked(getWorkspaceProspects)
const mockedAddToProspect = vi.mocked(addWorkspaceProspectPodcasts)
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
    expect(screen.getByText('Free email')).toBeInTheDocument()
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

  /*
   * A prospect dashboard is the pitch for work nobody has bought yet, and it is
   * built out of the same catalogue as a client's shortlist. Until now the only
   * way to fill one was to go and find the shows again from inside the prospect.
   */
  it('adds selected shared podcasts to a prospect dashboard', async () => {
    mockedProspects.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Northwind', slug: 'northwind' },
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [
        { id: 'prospect-1', prospect_name: 'Ada Bell', lifecycle_status: 'draft' },
        // Archived is not somewhere anything should be added to.
        { id: 'prospect-2', prospect_name: 'Old Lead', lifecycle_status: 'archived' },
      ],
    } as never)
    mockedAddToProspect.mockResolvedValue({
      added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: false,
    })

    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A prospect' }))

    const picker = await screen.findByRole('combobox', { name: 'Prospect' })
    expect(picker).toBeInTheDocument()
    expect(screen.queryByText('Old Lead')).not.toBeInTheDocument()

    fireEvent.click(picker)
    fireEvent.click(await screen.findByRole('option', { name: 'Ada Bell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }))

    await waitFor(() => expect(mockedAddToProspect).toHaveBeenCalledWith(
      workspaceId,
      'prospect-1',
      [expect.objectContaining({ podcast_id: 'podcast-one', podcast_name: 'The Founder Show' })],
    ))
    // The prospect shape is narrower on purpose: a dashboard goes to someone
    // who has signed nothing, so the contact address is not gathered for it.
    expect(mockedAddToProspect.mock.calls[0][2][0]).not.toHaveProperty('podcast_email')
  })

  /*
   * The shared catalogue holds websites somebody typed without a scheme —
   * simplecast.com, www.AngelInvestorsNetwork.com. The prospect endpoint
   * validates URLs because the dashboard it builds is public, so one untidy
   * address refused the whole batch with INVALID_FIELD.
   */
  it('repairs a catalogue website that was typed without a scheme', async () => {
    mockedCatalog.mockResolvedValue({
      ...catalogResponse,
      items: [{ ...catalogResponse.items[0], podcast_url: 'simplecast.com', podcast_image_url: null }],
    } as never)
    mockedProspects.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Northwind', slug: 'northwind' },
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [{ id: 'prospect-1', prospect_name: 'Ada Bell', lifecycle_status: 'draft' }],
    } as never)
    mockedAddToProspect.mockResolvedValue({
      added: 1, skipped: 0, podcast_ids: ['podcast-one'], unpublished_for_review: false,
    })

    renderPage()

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Founder Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to client' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A prospect' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Prospect' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ada Bell' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to dashboard' }))

    await waitFor(() => expect(mockedAddToProspect).toHaveBeenCalled())
    const sent = mockedAddToProspect.mock.calls[0][2][0]
    expect(sent.podcast_url).toBe('https://simplecast.com/')
    // Absent is fine; invalid is not.
    expect(sent.podcast_image_url).toBeNull()
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

  // The row keeps a clipped description and four numbers; everything else the
  // catalogue already carried was fetched, sent to the browser, and shown
  // nowhere — so judging a show meant opening it somewhere else.
  it('opens the details it already had for a podcast', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'See details' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('The Founder Show')).toBeInTheDocument()
    expect(dialog.getByText(/Practical conversations with company founders/i)).toBeInTheDocument()
    // Fields the row never showed.
    expect(dialog.getByText('Reach score')).toBeInTheDocument()
    expect(dialog.getByText('Last published')).toBeInTheDocument()
    expect(dialog.getByText(/Used on 4 client shortlists/i)).toBeInTheDocument()
  })

  it('carries the relationship warning into the details', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'See details' }))

    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Passed')).toBeInTheDocument()
  })
})
