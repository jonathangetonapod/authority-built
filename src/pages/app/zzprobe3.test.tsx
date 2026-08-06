import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceMailboxes } from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceClientDetail: vi.fn(),
  getWorkspaceClientSdrContext: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({
  addOutreachSuppression: vi.fn(), captureHostRelationshipThread: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(), disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(), getWorkspaceMailboxes: vi.fn(),
  getWorkspaceInboxThreads: vi.fn().mockResolvedValue({ connected: true, threads: [] }),
  getWorkspaceInboxLeadDetail: vi.fn(), getWorkspaceInboxThreadMessages: vi.fn(),
  setWorkspaceInboxLeadInterest: vi.fn(), setWorkspaceInboxThreadStatus: vi.fn(),
  draftWorkspaceInboxReply: vi.fn(), sendWorkspaceInboxReply: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(), saveWorkspaceCampaign: vi.fn(),
  setWorkspaceMailboxClient: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

describe('probe3 platform route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'owner' },
      isPlatformAdmin: true,
      workspace: { id: '00000000-0000-4000-8000-000000000000', name: 'GOAP', slug: 'g', status: 'active', is_default: true, logo_path: null, logo_updated_at: null },
    } as never)
    vi.mocked(getWorkspaceClients).mockResolvedValue([])
    vi.mocked(getAdminWorkspaceView).mockResolvedValue({
      workspace: { id: selectedWorkspaceId, name: 'Acme', slug: 'acme', status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
      viewer: { workspace_id: selectedWorkspaceId, email: 'o@a.com', full_name: 'O', role: 'owner' },
      clients: [{ id: 'c1', name: 'Dallas', status: 'active' }],
    } as never)
    vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Live Instantly',
      accounts: [{
        email: 'live@x.com', first_name: null, last_name: null, status: 1, status_message: null,
        warmup_status: 1, daily_limit: 15, sent_today: 3, send_history: [], warmup_emails: 10,
        warmup_limit: 70, health_score: 100, tags: [], campaigns: [],
      }],
      last_synced_at: null, analytics_errors: [],
    } as never)
  })

  it('platform admin viewing a tenant sees the real mailboxes', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/app/workspaces/${selectedWorkspaceId}/mailboxes`]}>
          <WorkspaceOutreachSuite module="mailboxes" platformWorkspaceId={selectedWorkspaceId} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByRole('table', { name: 'Mailbox accounts' })
    await new Promise((r) => setTimeout(r, 120))
    console.log('>>> getWorkspaceMailboxes called times:', vi.mocked(getWorkspaceMailboxes).mock.calls.length)
    console.log('>>> live@x.com on screen:', !!screen.queryByText('live@x.com'))
    console.log('>>> body:', document.body.textContent?.slice(0, 350))
    console.log('>>> query cache keys:', JSON.stringify(queryClient.getQueryCache().getAll().map((q) => q.queryKey)))
  })
})
