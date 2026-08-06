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
const mockedView = vi.mocked(getAdminWorkspaceView)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

function renderPage(platformWorkspaceId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/mailboxes']}>
        <WorkspaceOutreachSuite module="mailboxes" platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const oneAccount = (campaigns: unknown[] = []) => ({
  email: 'a@x.com', first_name: null, last_name: null, status: 1, status_message: null,
  warmup_status: 1, daily_limit: 15, sent_today: 0, send_history: [], warmup_emails: 10,
  warmup_limit: 70, health_score: 100, tags: [], campaigns,
})

describe('probe2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
      workspace: {
        id: defaultWorkspaceId, name: 'GOAP', slug: 'g', status: 'active',
        is_default: true, logo_path: null, logo_updated_at: null,
      },
    } as never)
    mockedClients.mockResolvedValue([])
    mockedAssign.mockResolvedValue({ sender_accounts: [] })
    mockedView.mockResolvedValue({
      workspace: {
        id: selectedWorkspaceId, name: 'Acme', slug: 'acme', status: 'active',
        is_default: false, logo_path: null, logo_updated_at: null,
      },
      viewer: { workspace_id: selectedWorkspaceId, email: 'o@a.com', full_name: 'O', role: 'owner' },
      clients: [],
    } as never)
  })

  it('P13: accounts is a non-array (object) - does the page blow up?', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null,
      accounts: { '0': oneAccount() } as never,
      last_synced_at: null, analytics_errors: [],
    } as never)
    let threw: unknown = null
    try {
      renderPage()
      await waitFor(() => expect(mockedMailboxes).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 80))
    } catch (e) { threw = e }
    console.log('P13 threw:', threw instanceof Error ? threw.message : String(threw))
    console.log('P13 console.error calls:', spy.mock.calls.map((c) => String(c[0]).slice(0, 200)).slice(0, 3))
    console.log('P13 body:', document.body.textContent?.slice(0, 200))
    spy.mockRestore()
  })

  it('P14: analytics_errors is a string not an array', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: 'rate limited' as never,
    } as never)
    renderPage()
    await new Promise((r) => setTimeout(r, 80))
    console.log('P14 body:', document.body.textContent?.slice(0, 300))
    console.log('P14 errors:', spy.mock.calls.map((c) => String(c[0]).slice(0, 160)).slice(0, 2))
    spy.mockRestore()
  })

  it('P15: platform route - does it flash "not connected" before loading?', async () => {
    const seen: string[] = []
    mockedMailboxes.mockImplementation(() => new Promise(() => {}) as never)
    renderPage(selectedWorkspaceId)
    for (let i = 0; i < 25; i += 1) {
      const t = document.body.textContent || ''
      if (t.includes('Instantly is not connected')) seen.push('not-connected')
      if (t.includes('Loading mailboxes')) seen.push('loading')
      await new Promise((r) => setTimeout(r, 4))
    }
    console.log('P15 sequence:', Array.from(new Set(seen)).join(','), '| first:', seen[0])
  })

  it('P16: double-click the disconnect X', async () => {
    let calls = 0
    mockedAssign.mockImplementation(() => { calls += 1; return new Promise(() => {}) as never })
    mockedClients.mockResolvedValue([{ id: 'c1', name: 'Dallas', status: 'active' }] as never)
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null,
      accounts: [oneAccount([{ campaign_id: 'k1', campaign_name: 'c', campaign_status: 'active', client_id: 'c1', client_name: 'Dallas' }])],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const btn = within(table).getByLabelText('Disconnect Dallas from a@x.com')
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 60))
    console.log('P16 mutate calls from 3 rapid clicks:', calls)
  })

  it('P17: workspace switches under a stale key - assignment posts to which workspace?', async () => {
    mockedClients.mockResolvedValue([{ id: 'c1', name: 'Dallas', status: 'active' }] as never)
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage(selectedWorkspaceId)
    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    fireEvent.click(within(table).getByLabelText('Connect a@x.com to a client'))
    fireEvent.click(await screen.findByRole('option', { name: 'Dallas' }))
    await waitFor(() => expect(mockedAssign).toHaveBeenCalled())
    console.log('P17 assign payload:', JSON.stringify(mockedAssign.mock.calls[0]))
    console.log('P17 mailboxes fetched for:', JSON.stringify(mockedMailboxes.mock.calls))
  })

  it('P18: canManage for a plain member on the tenant route', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
      workspace: {
        id: defaultWorkspaceId, name: 'GOAP', slug: 'g', status: 'active',
        is_default: true, logo_path: null, logo_updated_at: null,
      },
    } as never)
    mockedClients.mockResolvedValue([{ id: 'c1', name: 'Dallas', status: 'active' }] as never)
    mockedMailboxes.mockResolvedValue({
      connected: true, provider_workspace_name: null, accounts: [oneAccount()],
      last_synced_at: null, analytics_errors: [],
    } as never)
    renderPage()
    await screen.findByRole('table', { name: 'Mailbox accounts' })
    await waitFor(() => expect(screen.getByText('a@x.com')).toBeTruthy())
    console.log('P18 member sees assign control:', !!screen.queryByLabelText('Connect a@x.com to a client'))
  })
})
