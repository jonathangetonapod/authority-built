import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite from '@/pages/app/WorkspaceOutreachSuite'
import { getWorkspaceClients } from '@/services/clients'
import { draftWorkspaceInboxReply, getWorkspaceInboxThreads } from '@/services/workspaceCampaigns'

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
  getWorkspaceInboxThreads: vi.fn(),
  getWorkspaceInboxLeadDetail: vi.fn().mockResolvedValue(null),
  getWorkspaceInboxThreadMessages: vi.fn().mockResolvedValue([]),
  setWorkspaceInboxLeadInterest: vi.fn().mockResolvedValue(undefined),
  setWorkspaceInboxThreadStatus: vi.fn().mockResolvedValue({ success: true }),
  draftWorkspaceInboxReply: vi.fn(),
  sendWorkspaceInboxReply: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  setWorkspaceMailboxClient: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const workspaceId = '00000000-0000-4000-8000-000000000000'
const clientId = '22222222-2222-4222-8222-222222222222'

function renderInbox(search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/app/master-inbox${search}`]}>
        <WorkspaceOutreachSuite module="master-inbox" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const thread = (over: Record<string, unknown>) => ({
  id: 'message-a',
  thread_id: 'thread-a',
  message_id: 'pm-a',
  eaccount: 'sdr@example.com',
  subject: 'Subject A',
  from_email: 'host@example.com',
  to_email: 'sdr@example.com',
  body_text: 'Hello there',
  received_at: '2026-07-21T12:00:00.000Z',
  is_unread: false,
  interested: true,
  interest_status: null,
  suppressed: false,
  opt_out_detected: false,
  lead_email: 'host@example.com',
  campaign: { campaign_id: 'c1', campaign_name: 'Camp', client: { id: clientId, name: 'Dallas Fontaine' } },
  lead_context: null,
  thread_key: 'thread-a',
  relationship: null,
  state: null,
  ...over,
})

describe('probes', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
      workspace: {
        id: workspaceId, name: 'GOAP', slug: 'goap', status: 'active',
        is_default: true, logo_path: null, logo_updated_at: null,
      },
    } as never)
    vi.mocked(getWorkspaceClients).mockResolvedValue([{
      id: clientId, workspace_id: workspaceId, name: 'Dallas Fontaine',
      email: 'd@x.dev', contact_person: null, linkedin_url: null, website: null,
      status: 'active', notes: null, ai_sdr_profile_ready: true,
      ai_sdr_profile_completed_fields: 6, ai_sdr_profile_total_fields: 6,
      ai_sdr_profile_updated_at: null, created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }] as never)
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({ connected: true, threads: [] } as never)
  })

  it('PROBE 1: badge on request error', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockRejectedValue(new Error('Instantly timed out'))
    renderInbox()
    const badge = await screen.findByTestId('instantly-connection-state')
    // eslint-disable-next-line no-console
    console.log('PROBE1 badge =', badge.textContent, '| panel =', screen.queryByText('Replies could not be loaded')?.textContent)
  })

  it('PROBE 2: unmapped opt-out thread offers no suppression control', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [thread({ campaign: { campaign_id: 'c1', campaign_name: 'Camp', client: null }, opt_out_detected: true, interested: false, subject: 'Please stop' })],
    } as never)
    renderInbox()
    fireEvent.click(await screen.findByRole('radio', { name: /Other replies/ }))
    // eslint-disable-next-line no-console
    console.log('PROBE2 banner =', screen.queryByText(/asks not to be contacted/)?.textContent)
    fireEvent.click(await screen.findByText('Please stop'))
    // eslint-disable-next-line no-console
    console.log('PROBE2 dnc button =', screen.queryByRole('button', { name: /do not contact/i })?.textContent ?? 'ABSENT')
    // eslint-disable-next-line no-console
    console.log('PROBE2 archive button =', screen.queryByRole('button', { name: /Archive conversation/i })?.textContent ?? 'ABSENT')
  })

  it('PROBE 3: deep link + client filter discards the AI draft', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true, threads: [thread({})],
    } as never)
    vi.mocked(draftWorkspaceInboxReply).mockResolvedValue({
      subject: 'Re: Subject A', body: 'DRAFTED BODY TEXT', classification: null, nudges: [],
    } as never)
    renderInbox('?thread=thread-a')
    await screen.findByText('Hello there')
    // Change the client filter (preserves ?thread=, clears selectedThreadId).
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter by client' }), { key: 'Enter' })
    const option = await screen.findByRole('option', { name: /Dallas Fontaine/ })
    fireEvent.click(option)
    await screen.findByText('Hello there')
    fireEvent.click(await screen.findByRole('button', { name: /Draft with AI/ }))
    await waitFor(() => expect(draftWorkspaceInboxReply).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    const box = screen.getByLabelText('Reply body') as HTMLTextAreaElement
    // eslint-disable-next-line no-console
    console.log('PROBE3 textarea after successful draft =', JSON.stringify(box.value))
  })

  it('PROBE 4: typed manual reply lost on thread switch when state is null', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [
        thread({}),
        thread({ id: 'message-b', thread_id: 'thread-b', thread_key: 'thread-b', subject: 'Subject B', body_text: 'Second thread' }),
      ],
    } as never)
    renderInbox()
    fireEvent.click(await screen.findByText('Subject A'))
    const box = screen.getByLabelText('Reply body') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'MY HAND WRITTEN REPLY' } })
    // eslint-disable-next-line no-console
    console.log('PROBE4 typed =', JSON.stringify((screen.getByLabelText('Reply body') as HTMLTextAreaElement).value))
    fireEvent.click(screen.getByText('Subject B'))
    fireEvent.click(screen.getByText('Subject A'))
    // eslint-disable-next-line no-console
    console.log('PROBE4 after switch back =', JSON.stringify((screen.getByLabelText('Reply body') as HTMLTextAreaElement).value))
  })
})
