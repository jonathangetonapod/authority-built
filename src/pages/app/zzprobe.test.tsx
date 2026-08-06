import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceMailboxes, setWorkspaceMailboxClient } from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceClientDetail: vi.fn(),
  getWorkspaceClientSdrContext: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({
  addOutreachSuppression: vi.fn().mockResolvedValue(undefined),
  captureHostRelationshipThread: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(),
  disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
  getWorkspaceInboxThreads: vi.fn().mockResolvedValue({ connected: true, threads: [] }),
  getWorkspaceInboxLeadDetail: vi.fn().mockResolvedValue({ lead: null }),
  getWorkspaceInboxThreadMessages: vi.fn().mockResolvedValue([]),
  setWorkspaceInboxLeadInterest: vi.fn(),
  setWorkspaceInboxThreadStatus: vi.fn(),
  draftWorkspaceInboxReply: vi.fn(),
  sendWorkspaceInboxReply: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  setWorkspaceMailboxClient: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedMailboxes = vi.mocked(getWorkspaceMailboxes)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedAssign = vi.mocked(setWorkspaceMailboxClient)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'

function auth(workspaceId: string | null) {
  mockedUseAuth.mockReturnValue({
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    membership: { role: 'owner' },
    isPlatformAdmin: false,
    workspace: workspaceId === null ? null : {
      id: workspaceId,
      name: 'Get On A Pod',
      slug: 'g',
      status: 'active',
      is_default: true,
      logo_path: null,
      logo_updated_at: null,
    },
  } as never)
}

function renderPage(platformWorkspaceId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/mailboxes']}>
        <WorkspaceOutreachSuite module="mailboxes" platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const oneAccount = (campaigns: unknown[] = []) => ({
  email: 'a@x.com',
  first_name: null,
  last_name: null,
  status: 1,
  status_message: null,
  warmup_status: 1,
  daily_limit: 15,
  sent_today: 0,
  send_history: [],
  warmup_emails: 10,
  warmup_limit: 70,
  health_score: 100,
  tags: [],
  campaigns,
})

describe('probe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth(defaultWorkspaceId)
    mockedClients.mockResolvedValue([])
    mockedAssign.mockResolvedValue({ sender_accounts: [] })
  })

  it('P1: null data from the service', async () => {
    mockedMailboxes.mockResolvedValue(null as never)
    renderPage()
    await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy())
    console.log('P1 heading:', screen.getByRole('heading', { level: 2 }).textContent)
    console.log('P1 badge text present "Not connected":', !!screen.queryByText('Not connected'))
  })

  it('P2: connected true but accounts missing entirely', async () => {
    mockedMailboxes.mockResolvedValue({ connected: true } as never)
    renderPage()
    await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy())
    console.log('P2 heading:', screen.getByRole('heading', { level: 2 }).textContent)
    console.log('P2 body:', document.body.textContent?.slice(0, 400))
  })

  it('P3: accounts present but each field missing (partial provider data)', async () => {
    mockedMailboxes.mockResolvedValue({
      connected: true,
      provider_workspace_name: null,
      accounts: [{ email: 'a@x.com' } as never],
      last_synced_at: null,
      analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    console.log('P3 rows:', within(table).getAllByRole('row').length)
    console.log('P3 text:', table.textContent)
  })

  it('P4: workspace id fails the UUID pattern (nil uuid)', async () => {
    auth('00000000-0000-0000-0000-000000000000')
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy())
    console.log('P4 heading:', screen.getByRole('heading', { level: 2 }).textContent)
    console.log('P4 service called:', mockedMailboxes.mock.calls.length)
    console.log('P4 badge:', document.body.textContent?.includes('Not connected'))
  })

  it('P5: request never settles - is a spinner shown?', async () => {
    mockedMailboxes.mockReturnValue(new Promise(() => {}) as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    console.log('P5 table text:', table.textContent)
  })

  it('P6: clients query fails - can the operator still assign?', async () => {
    mockedClients.mockRejectedValue(new Error('clients boom'))
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(within(table).getByText('a@x.com')).toBeTruthy())
    console.log('P6 assign control present:', !!screen.queryByLabelText('Connect a@x.com to a client'))
    console.log('P6 any mention of client error:', document.body.textContent?.includes('boom'))
  })

  it('P7: assignment write fails - what stays on screen', async () => {
    mockedClients.mockResolvedValue([{ id: 'c1', name: 'Dallas', status: 'active' }] as never)
    mockedAssign.mockRejectedValue(new Error('assign boom'))
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    fireEvent.click(within(table).getByLabelText('Connect a@x.com to a client'))
    fireEvent.click(await screen.findByRole('option', { name: 'Dallas' }))
    await waitFor(() => expect(mockedAssign).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 60))
    console.log('P7 row text after failure:', within(table).getByText('a@x.com').closest('tr')?.textContent)
  })

  it('P8: two rows toggled while first in flight', async () => {
    mockedClients.mockResolvedValue([{ id: 'c1', name: 'Dallas', status: 'active' }] as never)
    let resolveFirst: (v: unknown) => void = () => {}
    mockedAssign
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res as never }) as never)
      .mockResolvedValue({ sender_accounts: [] })
    mockedMailboxes.mockResolvedValue({
      connected: true,
      provider_workspace_name: null,
      accounts: [oneAccount(), { ...oneAccount(), email: 'b@x.com' }],
      last_synced_at: null,
      analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    fireEvent.click(within(table).getByLabelText('Connect a@x.com to a client'))
    fireEvent.click(await screen.findByRole('option', { name: 'Dallas' }))
    await waitFor(() => expect(mockedAssign).toHaveBeenCalledTimes(1))
    // now start a second one on row b while a is still pending
    fireEvent.click(within(table).getByLabelText('Connect b@x.com to a client'))
    fireEvent.click(await screen.findByRole('option', { name: 'Dallas' }))
    await waitFor(() => expect(mockedAssign).toHaveBeenCalledTimes(2))
    console.log('P8 second call fired while first pending: yes')
    resolveFirst({ sender_accounts: [] })
    await new Promise((r) => setTimeout(r, 60))
    console.log('P8 calls:', JSON.stringify(mockedAssign.mock.calls))
  })

  it('P9: duplicate campaign_id links on one mailbox', async () => {
    const link = {
      campaign_id: 'camp-1', campaign_name: 'c', campaign_status: 'active',
      client_id: 'client-1', client_name: null,
    }
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null,
      accounts: [oneAccount([link, link])],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(within(table).getByText('a@x.com')).toBeTruthy())
    console.log('P9 row:', within(table).getByText('a@x.com').closest('tr')?.textContent)
  })

  it('P10: send_history with a bad date / NaN sent', async () => {
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null,
      accounts: [{ ...oneAccount(), send_history: [{ date: 'd1', sent: 0 }, { date: 'd2', sent: 0 }] }],
      last_synced_at: 'not-a-date', analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(within(table).getByText('a@x.com')).toBeTruthy())
    console.log('P10 header text:', document.body.textContent?.slice(0, 300))
  })
})
