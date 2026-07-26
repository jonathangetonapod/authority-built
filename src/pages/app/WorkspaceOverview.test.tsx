import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOverview from '@/pages/app/WorkspaceOverview'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClientPodcastSystem } from '@/services/clientPodcastSystem'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clientPodcastSystem', () => ({ getWorkspaceClientPodcastSystem: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref: string }
  }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref || '/app'}>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const mockedSystem = vi.mocked(getWorkspaceClientPodcastSystem)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const systemFixture = {
  workspace: { id: defaultWorkspaceId, name: 'Get On A Pod' },
  viewer_role: 'owner',
  can_manage: true,
  generated_at: '2026-07-26T12:00:00.000Z',
  clients: [{ id: clientId, name: 'Taylor Client', status: 'active', photo_url: null, podcast_count: 2 }],
  summary: {
    total: 2,
    active: 2,
    completed: 0,
    needs_attention: 1,
    upcoming_recordings: 1,
    awaiting_publication: 0,
    stage_counts: {
      awaiting_review: 1,
      approved: 0,
      contact_needed: 0,
      research_needed: 0,
      ready: 0,
      outreach: 1,
      conversation: 0,
      booked: 0,
      recorded: 0,
      published: 0,
    },
  },
  items: [
    {
      id: 'item-1',
      client: { id: clientId, name: 'Taylor Client', status: 'active', photo_url: null },
      podcast: { id: 'p1', podscan_id: 'ps1', name: 'Founder Frequency', description: null, image_url: null, url: null, publisher_name: null, host_name: null, audience_size: null, last_posted_at: null },
      stage: 'awaiting_review',
      outcome: null,
      terminal: false,
      has_conflict: true,
      next_action: 'Get the client decision',
      contact: { available: false, source: 'none', email: null, verified_at: null },
      decision: { status: null, notes: null, updated_at: null },
      analysis: { source: 'none', clean_description: null, fit_reasons: [], pitch_angles: [], analyzed_at: null },
      campaign: null,
      legacy_outreach_at: null,
      booking: null,
      operator_notes: null,
      shortlist_created_at: '2026-07-20T12:00:00.000Z',
      shortlist_updated_at: '2026-07-25T12:00:00.000Z',
      last_activity_at: '2026-07-25T12:00:00.000Z',
    },
  ],
}

function renderPage(platformWorkspaceId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceOverview platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: {
        id: defaultWorkspaceId,
        name: 'Get On A Pod',
        slug: 'get-on-a-pod',
        status: 'active',
        is_default: true,
        logo_path: null,
        logo_updated_at: null,
      },
    } as never)
    mockedSystem.mockResolvedValue(systemFixture as never)
    mockedView.mockResolvedValue({
      workspace: {
        id: selectedWorkspaceId,
        name: 'Acme Workspace',
        slug: 'acme-workspace',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer: {
        workspace_id: selectedWorkspaceId,
        email: 'owner@acme.example',
        full_name: 'Acme Owner',
        role: 'owner',
      },
      clients: [],
    } as never)
  })

  it('shows the action queue for the default workspace', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'My Workspace' })).toBeInTheDocument()
    expect(await screen.findByText('Next actions')).toBeInTheDocument()
    expect(mockedSystem).toHaveBeenCalledWith(defaultWorkspaceId)

    expect(screen.getByText('Need attention')).toBeInTheDocument()
    const itemMentions = screen.getAllByText('Taylor Client · Founder Frequency')
    expect(itemMentions.length).toBeGreaterThan(0)
    expect(screen.getByText('History conflict — review before acting')).toBeInTheDocument()
    expect(itemMentions[0].closest('a')).toHaveAttribute('href', `/app/client-podcast-system?client=${clientId}`)

    expect(screen.getByRole('link', { name: /Podcast Finder/ })).toHaveAttribute('href', '/app/podcast-finder')
    expect(screen.getByRole('link', { name: /Master Inbox/ })).toHaveAttribute('href', '/app/master-inbox')
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/app/settings')
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('scopes the queue and module links inside a selected workspace', async () => {
    renderPage(selectedWorkspaceId.toUpperCase())

    expect(await screen.findByRole('heading', { name: 'Acme Workspace' })).toBeInTheDocument()
    const baseHref = `/app/workspaces/${selectedWorkspaceId}`
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', baseHref)
    expect(await screen.findByText('Next actions')).toBeInTheDocument()
    expect(mockedSystem).toHaveBeenCalledWith(selectedWorkspaceId)
    expect(screen.getByRole('link', { name: /Podcast Finder/ })).toHaveAttribute('href', `${baseHref}/podcast-finder`)
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', `${baseHref}/settings`)
    expect(mockedView).toHaveBeenCalledWith(selectedWorkspaceId, expect.any(AbortSignal))
  })

  it('invites the first client when the workspace is empty', async () => {
    mockedSystem.mockResolvedValue({ ...systemFixture, clients: [], items: [] } as never)
    renderPage()

    expect(await screen.findByText('Add your first client to get started')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Clients/ })).toHaveAttribute('href', '/app/clients')
  })
})
