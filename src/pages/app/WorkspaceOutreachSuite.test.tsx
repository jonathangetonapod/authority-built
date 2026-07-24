import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceCampaignOverview, getWorkspaceMailboxes } from '@/services/workspaceCampaigns'

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
  getWorkspaceMailboxes: vi.fn(),
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
const mockedMailboxes = vi.mocked(getWorkspaceMailboxes)
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
    const mailboxes = [
      ['admin@solaraccountreview.help', 1, 70, 100],
      ['admin@solaraccountreview.homes', 1, 70, 100],
      ['admin@solarserviceupdate.help', -3, 0, 100],
      ['admin@solarserviceupdate.homes', 1, 70, 100],
      ['admin@solarsupportcenter.help', 1, 70, 100],
      ['admin@solarsupportcenter.homes', 1, 70, 97],
      ['admin@titanbankruptcy.lat', 1, 70, 100],
      ['admin@titanbankruptcyupdate.help', -3, 0, 99],
      ['admin@titanbankruptcyupdates.help', 1, 70, 99],
      ['admin@titansolarbankrupcy.help', -3, 0, 100],
    ] as const
    mockedMailboxes.mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Solar workspace',
      accounts: mailboxes.map(([email, status, warmupEmails, healthScore], index) => ({
        email,
        first_name: null,
        last_name: null,
        status,
        status_message: status === -3 ? 'SMTP send failed' : null,
        warmup_status: 1,
        daily_limit: 15,
        sent_today: 0,
        warmup_emails: warmupEmails,
        warmup_limit: 70,
        health_score: healthScore,
        tags: [{ id: `tag-${index}`, label: 'Solar - CI 04/23/2026', description: null }],
      })),
      last_synced_at: '2026-07-24T12:00:00.000Z',
      analytics_errors: [],
    })
  })

  it.each([
    ['client-campaigns', 'Client Campaigns', 'No active clients'],
    ['master-inbox', 'Master Inbox', 'No conversations yet'],
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

  it('renders live Instantly accounts in the supplied operational table layout', async () => {
    renderPage('mailboxes')

    expect(screen.getByRole('heading', { name: 'Mailboxes', level: 1 })).toBeInTheDocument()
    expect(screen.queryByTestId('instantly-connection-state')).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Mailbox accounts' })
    expect(within(table).getByRole('columnheader', { name: 'Email' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Emails sent' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Warmup emails' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Health score' })).toBeInTheDocument()
    await within(table).findByText('admin@solaraccountreview.help')
    expect(within(table).getAllByRole('row')).toHaveLength(11)
    expect(within(table).getAllByText('Solar - CI 04/23/2026')).toHaveLength(10)
    expect(within(table).getAllByText('Sending error')).toHaveLength(3)

    const account = within(table).getByText('admin@solaraccountreview.help').closest('tr')
    expect(account).not.toBeNull()
    expect(within(account as HTMLElement).getByText('0 of 15')).toBeInTheDocument()
    expect(within(account as HTMLElement).getByText('70')).toBeInTheDocument()
    expect(within(account as HTMLElement).getByText('100%')).toBeInTheDocument()
    expect(screen.queryByText('No mailboxes synced yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Mailbox health signals')).not.toBeInTheDocument()
    expect(screen.queryByText(/layout preview/i)).not.toBeInTheDocument()
    expect(mockedMailboxes).toHaveBeenCalledWith(defaultWorkspaceId)
  })

  it('shows the workspace-safe disconnected mailbox state', async () => {
    mockedMailboxes.mockResolvedValueOnce({
      connected: false,
      provider_workspace_name: null,
      accounts: [],
      last_synced_at: null,
      analytics_errors: [],
    })

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Instantly is not connected' })).toBeInTheDocument()
    expect(screen.getByText('Connect this workspace to load its sending accounts.')).toBeInTheDocument()
  })

  it('visualizes deterministic client AI SDR routing without fake replies', () => {
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
    expect(screen.queryByRole('heading', { name: 'Conversation context' })).not.toBeInTheDocument()
    expect(screen.getByText('Client AI SDRs activate after connection')).toBeInTheDocument()
    const routing = screen.getByRole('list', { name: 'AI SDR reply routing' })
    expect(within(routing).getByText('Reply received')).toBeInTheDocument()
    expect(within(routing).getByText('Client resolved')).toBeInTheDocument()
    expect(within(routing).getByText('Client AI SDR loaded')).toBeInTheDocument()
    expect(within(routing).getByText('Review or act')).toBeInTheDocument()
    expect(screen.getByText('No client match, no AI response.')).toBeInTheDocument()
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
