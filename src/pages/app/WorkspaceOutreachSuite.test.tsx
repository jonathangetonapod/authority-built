import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceCampaignOverview } from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceClientDetail: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(),
  disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref: string; workspaceName: string }
  }) => (
    <div
      data-testid="workspace-layout"
      data-base-href={platformWorkspace?.baseHref || '/app'}
      data-workspace-name={platformWorkspace?.workspaceName || 'My Workspace'}
    >
      {children}
    </div>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedCampaignOverview = vi.mocked(getWorkspaceCampaignOverview)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(module: OutreachWorkspaceModule, platformWorkspaceId?: string) {
  const baseHref = platformWorkspaceId
    ? `/app/workspaces/${platformWorkspaceId.toLowerCase()}`
    : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`${baseHref}/${module}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceOutreachSuite module={module} platformWorkspaceId={platformWorkspaceId} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceOutreachSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
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
    })
    mockedClients.mockResolvedValue([])
    mockedCampaignOverview.mockResolvedValue({
      integration: {
        connected: false,
        status: 'disconnected',
        provider_workspace_id: null,
        provider_workspace_name: null,
        api_key_last_four: null,
        accounts: [],
        active_account_count: 0,
        connected_at: null,
        last_verified_at: null,
        last_error: null,
        can_manage: true,
        required_scopes: [],
      },
      can_manage_campaigns: true,
      campaigns: [],
      provider_campaigns: [],
      provider_campaigns_error: null,
    })
  })

  it.each([
    ['client-campaigns', 'Client Campaigns', 'No active clients'],
    ['master-inbox', 'Master Inbox', 'No conversations yet'],
    ['mailboxes', 'Mailboxes', 'No mailboxes synced yet'],
  ] as const)('renders the %s workspace foundation without invented provider data', async (module, title, emptyState) => {
    renderPage(module)

    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: emptyState })).toBeInTheDocument()
    if (module === 'client-campaigns') {
      expect(await screen.findByTestId('instantly-connection-card')).toHaveTextContent('Connect Instantly')
    } else {
      expect(screen.getByTestId('instantly-connection-state')).toHaveTextContent('not connected')
    }
    expect(screen.queryByRole('navigation', { name: 'Outreach suite' })).not.toBeInTheDocument()
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('uses a scoped three-pane workflow for the master inbox without fake replies', () => {
    renderPage('master-inbox')

    const scope = screen.getByRole('radiogroup', { name: 'Inbox scope' })
    expect(within(scope).getByRole('radio', { name: /all replies/i })).toHaveAttribute('aria-checked', 'true')
    expect(within(scope).getByRole('radio', { name: /^interested/i })).toHaveAttribute('aria-checked', 'false')
    expect(within(scope).getByRole('radio', { name: /other replies/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByPlaceholderText('Search conversations')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by client' })).toHaveTextContent('All clients')
    expect(screen.getByRole('combobox', { name: 'Filter by client campaign' })).toHaveTextContent('All campaigns')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Needs reply')
    expect(screen.getByRole('heading', { name: 'Conversations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conversation thread' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conversation context' })).toBeInTheDocument()
    expect(screen.getByText('Automatic sync on connection')).toBeInTheDocument()
    expect(screen.queryByText('Your master inbox is ready')).not.toBeInTheDocument()

    fireEvent.click(within(scope).getByRole('radio', { name: /other replies/i }))
    expect(within(scope).getByRole('radio', { name: /other replies/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('Conversation filters')).not.toHaveTextContent('Needs reply')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Booked')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Ended')
  })

  it('loads a selected workspace and scopes every suite route to it', async () => {
    renderPage('client-campaigns', selectedWorkspaceId.toUpperCase())

    expect(await screen.findByText('Acme Workspace')).toBeInTheDocument()
    const baseHref = `/app/workspaces/${selectedWorkspaceId}`
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', baseHref)
    expect(screen.queryByRole('navigation', { name: 'Outreach suite' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open clients/i })).toHaveAttribute('href', `${baseHref}/clients`)
    expect(mockedView).toHaveBeenCalledWith(selectedWorkspaceId, expect.any(AbortSignal))
  })
})
