import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceClientPodcastSystem from '@/pages/app/WorkspaceClientPodcastSystem'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastSystemItem,
  type ClientPodcastSystemResponse,
} from '@/services/clientPodcastSystem'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientPodcastSystem', () => ({ getWorkspaceClientPodcastSystem: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedGetSystem = vi.mocked(getWorkspaceClientPodcastSystem)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const formerClientId = '99999999-9999-4999-8999-999999999999'

const awaitingReview: ClientPodcastSystemItem = {
  id: 'shortlist-one',
  client: { id: clientId, name: 'Taylor Client', status: 'active', photo_url: null },
  podcast: {
    id: '33333333-3333-4333-8333-333333333333',
    podscan_id: 'podscan-one',
    name: 'Founder Frequency',
    description: 'Founder interviews.',
    image_url: null,
    url: 'https://podcasts.example.com/founder-frequency',
    publisher_name: 'Frequency Media',
    host_name: 'Morgan Host',
    audience_size: 25_000,
    last_posted_at: '2026-07-20T12:00:00.000Z',
  },
  stage: 'awaiting_review',
  outcome: null,
  terminal: false,
  has_conflict: false,
  next_action: 'Get the client decision',
  contact: { available: false, source: 'none', email: null, verified_at: null },
  decision: { status: null, notes: null, updated_at: null },
  analysis: {
    source: 'normalized',
    clean_description: 'A practical founder show for growth-stage operators.',
    fit_reasons: ['Taylor has operating experience that fits this audience.'],
    pitch_angles: [{ title: 'Durable growth', description: 'How founders can scale without operational debt.' }],
    analyzed_at: '2026-07-24T12:00:00.000Z',
  },
  campaign: null,
  legacy_outreach_at: null,
  booking: null,
  operator_notes: null,
  shortlist_created_at: '2026-07-20T12:00:00.000Z',
  shortlist_updated_at: '2026-07-24T12:00:00.000Z',
  last_activity_at: '2026-07-24T12:00:00.000Z',
}

const ready: ClientPodcastSystemItem = {
  ...awaitingReview,
  id: 'shortlist-two',
  podcast: {
    ...awaitingReview.podcast,
    id: '44444444-4444-4444-8444-444444444444',
    podscan_id: 'podscan-two',
    name: 'Operator Stories',
    url: 'https://podcasts.example.com/operator-stories',
    host_name: 'Jamie Operator',
  },
  stage: 'ready',
  next_action: 'Launch the reviewed campaign pitch',
  contact: {
    available: true,
    source: 'direct',
    email: 'jamie@operator.example',
    verified_at: '2026-07-24T10:00:00.000Z',
  },
  decision: {
    status: 'approved',
    notes: 'Strong fit for the launch.',
    updated_at: '2026-07-23T12:00:00.000Z',
  },
  campaign: {
    id: '55555555-5555-4555-8555-555555555555',
    target_id: '66666666-6666-4666-8666-666666666666',
    status: 'ready',
    research_ready: true,
    pitch_ready: true,
    open_count: 0,
    reply_count: 0,
    launched_at: null,
    last_activity_at: null,
    last_error: null,
  },
}

const published: ClientPodcastSystemItem = {
  ...awaitingReview,
  id: 'shortlist-three',
  podcast: {
    ...awaitingReview.podcast,
    id: '77777777-7777-4777-8777-777777777777',
    podscan_id: 'podscan-three',
    name: 'Scale Notes',
    url: 'https://podcasts.example.com/scale-notes',
    host_name: 'Alex Scale',
  },
  stage: 'published',
  terminal: true,
  next_action: null,
  decision: { status: 'approved', notes: null, updated_at: '2026-06-01T12:00:00.000Z' },
  booking: {
    id: '88888888-8888-4888-8888-888888888888',
    match: 'podcast_id',
    status: 'published',
    host_name: 'Alex Scale',
    scheduled_date: '2026-06-10',
    recording_date: '2026-06-12',
    publish_date: '2026-07-01',
    episode_url: 'https://podcasts.example.com/scale-notes/episode-42',
    prep_sent: true,
    notes: null,
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
  },
  last_activity_at: '2026-07-01T12:00:00.000Z',
}

const response: ClientPodcastSystemResponse = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  viewer_role: 'owner',
  can_manage: true,
  generated_at: '2026-07-25T12:00:00.000Z',
  clients: [{
    id: clientId,
    name: 'Taylor Client',
    status: 'active',
    photo_url: null,
    email: 'taylor@example.com',
    contact_person: null,
    website: null,
    bio: null,
    profile: {
      ready: true,
      completed_fields: 4,
      total_fields: 6,
      positioning: 'Fintech founder',
      updated_at: '2026-07-01T12:00:00.000Z',
      has_calendar: true,
      has_media_kit: false,
    },
    dashboard_configured: true,
    portal: { enabled: true, last_login_at: null },
    onboarding: null,
    podcast_count: 3,
    created_at: '2026-06-01T12:00:00.000Z',
    updated_at: '2026-07-01T12:00:00.000Z',
    last_activity_at: '2026-07-01T12:00:00.000Z',
  }, {
    id: formerClientId,
    name: 'Jordan Former',
    status: 'churned',
    photo_url: null,
    email: 'jordan@example.com',
    contact_person: null,
    website: null,
    bio: null,
    profile: {
      ready: false,
      completed_fields: 0,
      total_fields: 6,
      positioning: null,
      updated_at: null,
      has_calendar: false,
      has_media_kit: false,
    },
    dashboard_configured: false,
    portal: { enabled: false, last_login_at: null },
    onboarding: null,
    podcast_count: 0,
    created_at: '2026-05-01T12:00:00.000Z',
    updated_at: '2026-06-01T12:00:00.000Z',
    last_activity_at: '2026-06-01T12:00:00.000Z',
  }],
  summary: {
    total: 3,
    active: 2,
    completed: 1,
    needs_attention: 0,
    upcoming_recordings: 0,
    awaiting_publication: 0,
    stage_counts: {
      awaiting_review: 1,
      approved: 0,
      contact_needed: 0,
      research_needed: 0,
      ready: 1,
      outreach: 0,
      conversation: 0,
      booked: 0,
      recorded: 0,
      published: 1,
    },
  },
  items: [awaitingReview, ready, published],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/client-podcast-system']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceClientPodcastSystem />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceClientPodcastSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner', full_name: 'Workspace Owner' },
      isPlatformAdmin: false,
    } as never)
    mockedGetSystem.mockResolvedValue(response)
  })

  it('starts with every client, then switches into one complete client overview', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Client Command Center' })).toBeInTheDocument()
    expect(screen.getByText('Private workspace overview')).toBeInTheDocument()
    expect(screen.getByLabelText('Switch client overview')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All clients' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
    expect(screen.getByText('Get client podcast decisions')).toBeInTheDocument()
    expect(screen.queryByText('Founder Frequency')).not.toBeInTheDocument()
    expect(screen.queryByText('Scale Notes')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View Taylor Client overview' }))
    expect(screen.getByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next client' }))
    expect(screen.getByRole('heading', { name: 'Jordan Former' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous client' }))
    expect(screen.getByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Guest and account readiness' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Outreach and conversations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Master Inbox' })).toHaveAttribute('href', `/app/master-inbox?client=${clientId}`)

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Placements/ }), { button: 0 })
    expect(screen.getByText('Scale Notes')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: /Podcasts/ }), { button: 0 })
    expect(screen.getByText('Founder Frequency')).toBeInTheDocument()
    expect(screen.getByText('Operator Stories')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Search this client's podcasts"), {
      target: { value: 'Operator Stories' },
    })
    expect(screen.getByText('Operator Stories')).toBeInTheDocument()
    expect(screen.queryByText('Founder Frequency')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const details = await screen.findByRole('dialog')
    expect(within(details).getByRole('heading', { name: 'Operator Stories' })).toBeInTheDocument()
    expect(within(details).getByText('jamie@operator.example')).toBeInTheDocument()
    expect(within(details).getByRole('link', { name: 'Client shortlist' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=approval`,
    )
    expect(within(details).getByRole('link', { name: 'Client campaign' })).toHaveAttribute(
      'href',
      `/app/client-campaigns/${clientId}`,
    )
    expect(within(details).getByRole('link', { name: 'Master Inbox' })).toHaveAttribute(
      'href',
      `/app/master-inbox?client=${clientId}`,
    )
    expect(mockedGetSystem).toHaveBeenCalledWith(workspaceId)
  })

  it('keeps raw contact emails out of the member-safe lifecycle response', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'member@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'member', full_name: 'Workspace Member' },
      isPlatformAdmin: false,
    } as never)
    mockedGetSystem.mockResolvedValue({
      ...response,
      viewer_role: 'member',
      can_manage: false,
      items: response.items.map((item) => ({
        ...item,
        contact: { ...item.contact, email: null },
      })),
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Client Command Center' })
    fireEvent.click(screen.getByRole('button', { name: 'View Taylor Client overview' }))
    expect(screen.getByText('Owner/admin only')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Podcasts/ }), { button: 0 })
    fireEvent.change(screen.getByLabelText("Search this client's podcasts"), {
      target: { value: 'Operator Stories' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    const details = await screen.findByRole('dialog')
    expect(within(details).queryByText('jamie@operator.example')).not.toBeInTheDocument()
    expect(within(details).getByText(/Owners and admins manage client decisions/i)).toBeInTheDocument()
  })
})
