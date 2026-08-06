import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceProspectDashboards from '@/pages/app/WorkspaceProspectDashboards'
import { useAuth } from '@/contexts/AuthContext'
import {
  getWorkspaceProspect,
  getWorkspaceProspects,
  type ProspectShortlistPodcast,
  type ProspectWorkspaceSummary,
  type WorkspaceProspect,
} from '@/services/prospectDashboards'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/prospectDashboards', () => ({
  archiveWorkspaceProspect: vi.fn(),
  buildWorkspaceProspect: vi.fn(),
  createWorkspaceProspect: vi.fn(),
  getWorkspaceProspect: vi.fn(),
  getWorkspaceProspects: vi.fn(),
  removeWorkspaceProspectPhoto: vi.fn(),
  setWorkspaceProspectPublished: vi.fn(),
  updateWorkspaceProspect: vi.fn(),
  updateWorkspaceProspectPodcast: vi.fn(),
  uploadWorkspaceProspectPhoto: vi.fn(),
}))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedList = vi.mocked(getWorkspaceProspects)
const mockedDetail = vi.mocked(getWorkspaceProspect)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const prospectId = '33333333-3333-4333-8333-333333333333'
const platformWorkspaceId = '44444444-4444-4444-8444-444444444444'

const workspaceSummary: ProspectWorkspaceSummary = {
  id: workspaceId,
  name: 'Tenant Workspace',
  status: 'active',
  is_default: false,
  logo_path: null,
  logo_updated_at: null,
  client_brand_name: null,
  client_brand_primary_color: null,
  client_brand_accent_color: null,
}

const prospect: WorkspaceProspect = {
  id: prospectId,
  workspace_id: workspaceId,
  slug: 'casey-prospect-123',
  prospect_name: 'Casey Prospect',
  first_name: 'Casey',
  prospect_email: 'casey@example.com',
  prospect_company: 'Example Co',
  prospect_title: 'Founder',
  prospect_bio: 'Casey helps founders build durable operations, and has done for a decade.',
  prospect_image_url: null,
  prospect_linkedin_url: null,
  prospect_website: null,
  prospect_industry: null,
  prospect_expertise: null,
  prospect_topics: null,
  prospect_target_audience: null,
  linked_client: null,
  lifecycle_status: 'draft',
  build_error: null,
  build_started_at: null,
  build_completed_at: null,
  published_at: null,
  pending_review_at: null,
  sent_at: null,
  first_engaged_at: null,
  converted_at: null,
  cta_type: 'reply',
  cta_label: 'Reply to move forward',
  cta_url: null,
  show_pricing_section: false,
  is_active: true,
  content_ready: false,
  view_count: 0,
  last_viewed_at: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
  readiness: {
    profile_ready: true,
    visible_count: 0,
    analyzed_count: 0,
    featured_count: 0,
    cta_ready: true,
    publishable: false,
  },
}

function renderPage(props: { platformWorkspaceId?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceProspectDashboards {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceProspectDashboards finder link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [prospect],
    })
    mockedDetail.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboard: prospect,
      podcasts: [],
    })
  })

  /*
   * The regression: /app/podcast-finder is the one-click Smart Finder, which
   * reads ?client= and knows nothing about prospects, so a prospect id sent
   * there was dropped and the finder opened unscoped. The prospect-aware
   * finder is the one at /advanced.
   */
  it('sends a prospect to the finder that reads the prospect parameter', async () => {
    renderPage()

    const link = await screen.findByRole('link', { name: /find podcasts/i })
    expect(link).toHaveAttribute('href', `/app/podcast-finder/advanced?prospect=${prospectId}`)
  })

  /*
   * This used to assert the plain platform address, because that path had no
   * Smart Finder and its plain address resolved to the advanced one. Both paths
   * now carry both finders at the same two addresses, so the prospect goes to
   * /advanced here for exactly the reason it does on the tenant path.
   */
  it('sends a prospect to the advanced finder on the platform path too', async () => {
    mockedList.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboards: [{ ...prospect, workspace_id: platformWorkspaceId }],
    })
    mockedDetail.mockResolvedValue({
      workspace: { ...workspaceSummary, id: platformWorkspaceId },
      viewer_role: 'platform_admin',
      can_manage: true,
      dashboard: { ...prospect, workspace_id: platformWorkspaceId },
      podcasts: [],
    })

    renderPage({ platformWorkspaceId })

    const link = await screen.findByRole('link', { name: /find podcasts/i })
    expect(link).toHaveAttribute(
      'href',
      `/app/workspaces/${platformWorkspaceId}/podcast-finder/advanced?prospect=${prospectId}`,
    )
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(platformWorkspaceId))
  })
})

function shortlistPodcast(index: number, overrides: Partial<ProspectShortlistPodcast> = {}): ProspectShortlistPodcast {
  return {
    id: `podcast-row-${index}`,
    prospect_dashboard_id: prospectId,
    podcast_id: `podcast-${index}`,
    podcast_name: `Operations Show ${index}`,
    podcast_description: 'A show about running companies.',
    podcast_image_url: null,
    podcast_url: null,
    publisher_name: `Publisher ${index}`,
    itunes_rating: null,
    episode_count: 120,
    audience_size: 1000 + index,
    podcast_categories: [{ category_id: `cat-${index % 2}`, category_name: index % 2 === 0 ? 'Business' : 'Health' }],
    last_posted_at: null,
    ai_clean_description: null,
    ai_fit_reasons: null,
    ai_pitch_angles: null,
    ai_analyzed_at: '2026-08-01T00:00:00.000Z',
    visibility: 'visible',
    display_order: index,
    is_featured: false,
    featured_order: null,
    operator_notes: null,
    relevance_score: 5,
    relevance_reason: 'Audience overlap.',
    match_source: 'ai_ranked',
    archived_at: null,
    archived_by: null,
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('WorkspaceProspectDashboards shortlist search and filters', () => {
  const podcasts = [
    ...Array.from({ length: 30 }, (_, index) => shortlistPodcast(index)),
    shortlistPodcast(99, {
      podcast_name: 'Private Practice Owners Club',
      publisher_name: 'Nathan Shields',
      podcast_categories: [{ category_id: 'cat-health', category_name: 'Health' }],
      relevance_score: 8.7,
    }),
    shortlistPodcast(100, {
      podcast_name: 'Retired Founder Radio',
      visibility: 'archived',
      archived_at: '2026-08-02T00:00:00.000Z',
      // Taken off the list by a person, which is what "Removed" means. A row
      // with no archived_by is a Finder addition waiting to be reviewed.
      archived_by: '55555555-5555-4555-8555-555555555555',
    }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboards: [prospect],
    })
    mockedDetail.mockResolvedValue({
      workspace: workspaceSummary,
      viewer_role: 'owner',
      can_manage: true,
      dashboard: prospect,
      podcasts,
    })
  })

  const visibleCount = podcasts.filter((podcast) => podcast.visibility === 'visible').length

  async function openAllView() {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: `All (${visibleCount})` }))
  }

  it('finds one show in a shortlist too long to scroll', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'private practice' } })

    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()
    expect(screen.queryByText('Operations Show 1')).not.toBeInTheDocument()
    expect(screen.getByText(/across the whole shortlist/i)).toBeInTheDocument()
  })

  /*
   * The reported failure: on Featured, which is three shows out of two hundred,
   * the search box was hidden and scoped to the open tab. Both made a search
   * that plainly should work look broken.
   */
  it('offers search on the featured tab and looks through the whole shortlist', async () => {
    renderPage()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'retired founder' } })

    // Archived, and on a tab that never lists archived shows.
    expect(await screen.findByText('Retired Founder Radio')).toBeInTheDocument()
    expect(screen.getByText('Removed')).toBeInTheDocument()
  })

  it('treats picking a tab as browsing, which ends the search', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'private practice' } })
    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `All (${visibleCount})` }))

    // The search is over rather than silently ignored, so the tab shows what it says.
    await waitFor(() => expect(screen.getByLabelText(/search this shortlist/i)).toHaveValue(''))
    expect(await screen.findByText('Operations Show 0')).toBeInTheDocument()
  })

  it('searches the publisher and the reason, not only the title', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'nathan shields' } })

    expect(await screen.findByText('Private Practice Owners Club')).toBeInTheDocument()
  })

  it('pages through a long list rather than rendering all of it', async () => {
    await openAllView()

    expect(await screen.findByText(/showing 25 of 31/i)).toBeInTheDocument()
    expect(screen.queryByText('Operations Show 27')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show 6 more/i }))

    expect(await screen.findByText('Operations Show 27')).toBeInTheDocument()
  })

  it('says nothing matches instead of pretending the shortlist is empty', async () => {
    await openAllView()

    const search = await screen.findByLabelText(/search this shortlist/i)
    fireEvent.change(search, { target: { value: 'zzzz-no-such-show' } })

    expect(await screen.findByText(/no shows match/i)).toBeInTheDocument()
    expect(screen.queryByText(/no matches yet/i)).not.toBeInTheDocument()

    // Offered twice on purpose: in the controls, and in the empty result itself.
    fireEvent.click(screen.getAllByRole('button', { name: /clear filters/i })[0])
    expect(await screen.findByText('Operations Show 0')).toBeInTheDocument()
  })

  it('keeps the dashboard order until an operator asks for another one', async () => {
    await openAllView()

    const list = await screen.findByText('Operations Show 0')
    expect(list).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/sort this shortlist/i))
    fireEvent.click(await screen.findByRole('option', { name: /best fit first/i }))

    const headings = screen.getAllByRole('heading', { level: 4 })
    expect(within(headings[0]).getByText('Private Practice Owners Club')).toBeInTheDocument()
  })
})
