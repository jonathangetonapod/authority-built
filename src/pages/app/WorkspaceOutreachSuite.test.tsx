import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients, getWorkspaceClientSdrContext } from '@/services/clients'
import {
  getWorkspaceCampaignOverview,
  getWorkspaceInboxThreads,
  setWorkspaceInboxThreadStatus,
  getWorkspaceMailboxes,
  getWorkspaceInboxThreadMessages,
  setWorkspaceMailboxClient,
  sendWorkspaceInboxReply,
  setWorkspaceInboxLeadInterest,
} from '@/services/workspaceCampaigns'
import { addOutreachSuppression, captureHostRelationshipThread } from '@/services/hostRelationships'
import { getMailboxInfraOverview } from '@/services/mailboxInfra'

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
vi.mock('@/services/mailboxInfra', () => ({
  getMailboxInfraOverview: vi.fn().mockResolvedValue({ winnr_connected: true, domains: [], orders: [] }),
  getMailboxOrderStatus: vi.fn(),
  retryMailboxWarming: vi.fn(),
  searchMailboxDomains: vi.fn(),
  createMailboxOrder: vi.fn(),
  exportMailboxesForInstantly: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(),
  disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
  getWorkspaceInboxThreads: vi.fn().mockResolvedValue({ connected: true, threads: [] }),
  getWorkspaceInboxLeadDetail: vi.fn().mockResolvedValue({ lead: null }),
  getWorkspaceInboxThreadMessages: vi.fn().mockResolvedValue([]),
  setWorkspaceInboxLeadInterest: vi.fn().mockResolvedValue({ success: true, interest_value: 1 }),
  setWorkspaceInboxThreadStatus: vi.fn().mockResolvedValue({ success: true }),
  draftWorkspaceInboxReply: vi.fn(),
  sendWorkspaceInboxReply: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  setWorkspaceMailboxClient: vi.fn().mockResolvedValue({ sender_accounts: [] }),
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
const mockedSdrContext = vi.mocked(getWorkspaceClientSdrContext)
const mockedCampaignOverview = vi.mocked(getWorkspaceCampaignOverview)
const mockedMailboxes = vi.mocked(getWorkspaceMailboxes)
const mockedCaptureRelationshipThread = vi.mocked(captureHostRelationshipThread)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(module: OutreachWorkspaceModule, platformWorkspaceId?: string, search = '') {
  const baseHref = platformWorkspaceId
    ? `/app/workspaces/${platformWorkspaceId.toLowerCase()}`
    : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`${baseHref}/${module}${search}`]}
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
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({ connected: true, threads: [] })
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
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
      send_day_timezone: 'America/Chicago',
      accounts: mailboxes.map(([email, status, warmupEmails, healthScore], index) => ({
        email,
        first_name: null,
        last_name: null,
        status,
        status_message: status === -3 ? 'SMTP send failed' : null,
        warmup_status: 1,
        daily_limit: 15,
        sent_today: 0,
        send_history: [],
        warmup_emails: warmupEmails,
        warmup_limit: 70,
        health_score: healthScore,
        tags: [{ id: `tag-${index}`, label: 'Solar - CI 04/23/2026', description: null }],
        campaigns: email === 'admin@solaraccountreview.help'
          ? [{
            campaign_id: 'campaign-one',
            campaign_name: 'Dallas Fontaine podcast outreach',
            campaign_status: 'active',
            client_id: 'client-one',
            client_name: 'Dallas Fontaine',
          }]
          : [],
      })),
      last_synced_at: '2026-07-24T12:00:00.000Z',
      analytics_errors: [],
    })
    mockedCaptureRelationshipThread.mockResolvedValue({
      podcast_id: 'show-one',
      relationship_created: false,
      thread_saved: true,
    })
  })

  it.each([
    ['client-campaigns', 'Client Campaigns', 'No active clients'],
    ['master-inbox', 'Master Inbox', 'No replies yet'],
  ] as const)('renders the %s workspace foundation without invented provider data', async (module, title, emptyState) => {
    renderPage(module)

    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: emptyState })).toBeInTheDocument()
    if (module === 'client-campaigns') {
      expect(await screen.findByTestId('instantly-connection-card')).toHaveTextContent('Connect Instantly')
    } else {
      // The badge reports the inbox's real connection state. It used to be a
      // static element reading "not connected" whenever this module was open.
      expect(await screen.findByTestId('instantly-connection-state')).toHaveTextContent('Instantly connected')
    }
    expect(screen.queryByRole('navigation', { name: 'Outreach suite' })).not.toBeInTheDocument()
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('reports the inbox connection honestly instead of always claiming disconnected', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: false,
      reason: 'key_rejected',
      threads: [],
    } as never)
    renderPage('master-inbox')

    expect(await screen.findByTestId('instantly-connection-state')).toHaveTextContent('Instantly key rejected')
  })

  it('renders live Instantly accounts in the supplied operational table layout', async () => {
    renderPage('mailboxes')

    expect(screen.getByRole('heading', { name: 'Mailboxes', level: 1 })).toBeInTheDocument()
    expect(screen.queryByTestId('instantly-connection-state')).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Mailbox accounts' })
    expect(within(table).getByRole('columnheader', { name: 'Email' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Sent today' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Client' })).toBeInTheDocument()
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

  it('puts the mailboxes that cannot send at the top, and says why on the row', async () => {
    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const rows = within(table).getAllByRole('row').slice(1)
    // Three accounts are in a hard sending error. They used to sit in provider
    // order, which buried them among healthy ones.
    expect(rows.slice(0, 3).every((row) => within(row).queryByText('Sending error'))).toBe(true)
    // The SMTP failure was a title attribute — invisible without a mouse.
    expect(within(rows[0]).getByText('SMTP send failed')).toBeInTheDocument()
  })

  it('sums the sending capacity and names the day it belongs to', async () => {
    renderPage('mailboxes')

    // Seven of ten accounts are active at 15/day.
    const summary = await screen.findByTestId('mailbox-capacity')
    expect(summary).toHaveTextContent('0 of 105 daily capacity used (America/Chicago)')
    expect(summary).toHaveTextContent('3 mailboxes cannot send')
    expect(summary).toHaveTextContent('9 not connected to any client')
  })

  it('filters down to the mailboxes that need attention', async () => {
    renderPage('mailboxes')
    await screen.findByRole('table', { name: 'Mailbox accounts' })

    fireEvent.click(screen.getByLabelText('Filter mailboxes'))
    fireEvent.click(await screen.findByRole('option', { name: /Needs attention/ }))

    const rows = within(screen.getByRole('table', { name: 'Mailbox accounts' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
  })

  it('shows which client a mailbox sends for, and connects it to another', async () => {
    mockedClients.mockResolvedValue([
      { id: 'client-one', name: 'Dallas Fontaine', status: 'active' },
      { id: 'client-two', name: 'Rae Whitfield', status: 'active' },
    ] as never)

    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const assigned = within(table).getByText('admin@solaraccountreview.help').closest('tr') as HTMLElement
    expect(within(assigned).getByText('Dallas Fontaine')).toBeInTheDocument()

    // Dallas is already connected, so only the other client is offered.
    fireEvent.click(within(assigned).getByLabelText('Connect admin@solaraccountreview.help to a client'))
    fireEvent.click(await screen.findByRole('option', { name: 'Rae Whitfield' }))

    await waitFor(() => expect(vi.mocked(setWorkspaceMailboxClient)).toHaveBeenCalledWith({
      workspaceId: defaultWorkspaceId,
      clientId: 'client-two',
      email: 'admin@solaraccountreview.help',
      assigned: true,
    }))
  })

  it('takes a mailbox back off a client from the badge that says it is on them', async () => {
    mockedClients.mockResolvedValue([
      { id: 'client-one', name: 'Dallas Fontaine', status: 'active' },
    ] as never)

    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const assigned = within(table).getByText('admin@solaraccountreview.help').closest('tr') as HTMLElement
    fireEvent.click(within(assigned).getByLabelText('Disconnect Dallas Fontaine from admin@solaraccountreview.help'))

    await waitFor(() => expect(vi.mocked(setWorkspaceMailboxClient)).toHaveBeenCalledWith({
      workspaceId: defaultWorkspaceId,
      clientId: 'client-one',
      email: 'admin@solaraccountreview.help',
      assigned: false,
    }))
  })

  it('states that buying mailboxes needs Winnr instead of offering a wizard that cannot run', async () => {
    vi.mocked(getMailboxInfraOverview).mockResolvedValue({
      winnr_connected: false,
      domains: [],
      orders: [],
    } as never)

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: /A Winnr account is required to buy sending domains/i }))
      .toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect Winnr' })).toHaveAttribute('href', '/app/settings')
    // The purchase flow is not offered at all until Winnr is connected.
    expect(screen.queryByLabelText('What is the client-facing brand or agency name?')).not.toBeInTheDocument()
  })

  it('offers no purchase flow to a member who could not complete one', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
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

    renderPage('mailboxes')

    expect(await screen.findByText(/A workspace owner or admin manages them/i)).toBeInTheDocument()
    expect(screen.queryByText('Buy new sending domains')).not.toBeInTheDocument()
    // And the overview is never requested, because the edge refuses it anyway.
    expect(vi.mocked(getMailboxInfraOverview)).not.toHaveBeenCalled()
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

  it('explains a rejected Instantly key instead of rendering a plain disconnect', async () => {
    mockedMailboxes.mockResolvedValueOnce({
      connected: false,
      reason: 'key_rejected',
      provider_workspace_name: 'GOAP Sending',
      accounts: [],
      last_synced_at: null,
      analytics_errors: [],
    })

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Instantly declined the connected key' })).toBeInTheDocument()
    expect(screen.getByText('Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.')).toBeInTheDocument()
  })

  it('distinguishes a mailbox request error from a disconnected workspace', async () => {
    mockedMailboxes.mockRejectedValueOnce(new Error('Mailbox request failed'))

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Mailbox data unavailable' })).toBeInTheDocument()
    expect(screen.getByText('Mailbox request failed')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument()
  })

  it('visualizes deterministic client AI SDR routing without fake replies', async () => {
    renderPage('master-inbox')

    const scope = screen.getByRole('radiogroup', { name: 'Inbox scope' })
    // Two mutually exclusive scopes; Interested only leads.
    expect(within(scope).getAllByRole('radio')).toHaveLength(2)
    expect(within(scope).getByRole('radio', { name: /interested only/i })).toHaveAttribute('aria-checked', 'true')
    expect(within(scope).getByRole('radio', { name: /other replies/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByPlaceholderText('Search conversations')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by client' })).toHaveTextContent('All clients')
    expect(screen.getByRole('combobox', { name: 'Filter by client campaign' })).toHaveTextContent('All campaigns')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Needs reply')
    expect(screen.getByRole('heading', { name: 'Conversations' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conversation thread' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Conversation context' })).not.toBeInTheDocument()
    expect(await screen.findByText('Add a client to create an AI SDR profile')).toBeInTheDocument()
    const routing = screen.getByRole('list', { name: 'AI SDR reply routing' })
    expect(within(routing).getByText('Reply received')).toBeInTheDocument()
    expect(within(routing).getByText('Client resolved')).toBeInTheDocument()
    expect(within(routing).getByText('Client AI SDR loaded')).toBeInTheDocument()
    expect(within(routing).getByText('Review or act')).toBeInTheDocument()
    expect(screen.getByText('No client match, no AI response.')).toBeInTheDocument()
    expect(screen.queryByText('Your master inbox is ready')).not.toBeInTheDocument()

    fireEvent.click(within(scope).getByRole('radio', { name: /other replies/i }))
    expect(within(scope).getByRole('radio', { name: /other replies/i })).toHaveAttribute('aria-checked', 'true')
    // Workflow chips are lifecycle queues and stay available in every scope.
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Needs reply')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Booked')
    expect(screen.getByLabelText('Conversation filters')).toHaveTextContent('Archived')
  })

  it('loads the selected client AI SDR context inside Master Inbox without send authority', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    mockedClients.mockResolvedValueOnce([{
      id: clientId,
      workspace_id: defaultWorkspaceId,
      name: 'Dallas Fontaine',
      email: 'dallas@scalelabs.dev',
      contact_person: 'Dallas Fontaine',
      linkedin_url: null,
      website: 'https://scalelabs.dev',
      status: 'active',
      notes: null,
      ai_sdr_profile_ready: true,
      ai_sdr_profile_completed_fields: 4,
      ai_sdr_profile_total_fields: 6,
      ai_sdr_profile_updated_at: '2026-07-25T00:00:00.000Z',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-25T00:00:00.000Z',
    }])
    mockedSdrContext.mockResolvedValueOnce({
      client_id: clientId,
      workspace_id: defaultWorkspaceId,
      client_name: 'Dallas Fontaine',
      client_status: 'active',
      approved_guest_profile: 'Dallas is a B2B sales and AI implementation leader.',
      calendar_link: null,
      ai_sdr_profile: {
        positioning: 'Dallas is a practical AI implementation and B2B sales leader.',
        topics_and_angles: 'Practical AI adoption, operator leverage, and revenue systems.',
        listener_takeaways: 'A framework for choosing and implementing a useful first AI workflow.',
        proof_points: '',
        ideal_opportunities: '',
        booking_details: 'Use the approved calendar and route sponsorship questions to a human.',
      },
      ai_sdr_profile_updated_at: '2026-07-25T00:00:00.000Z',
      readiness: {
        ready: true,
        completed_fields: 4,
        total_fields: 6,
        missing_fields: ['proof_points', 'ideal_opportunities'],
        missing_core_fields: [],
      },
      safe_to_draft: true,
      delivery_authorized: false,
    })

    renderPage('master-inbox', undefined, `?client=${clientId}`)

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine AI SDR context' })).toBeInTheDocument()
    expect(screen.getByText('Ready for review drafts')).toBeInTheDocument()
    expect(screen.getByText('Dallas is a practical AI implementation and B2B sales leader.')).toBeInTheDocument()
    expect(screen.getByText('Delivery authority is off.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit AI SDR Profile' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}?tab=ai-sdr`,
    )
    expect(mockedSdrContext).toHaveBeenCalledWith(defaultWorkspaceId, clientId)
  })

  it('refuses to compose a reply to an address on the do-not-contact list', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-suppressed',
        thread_id: 'thread-suppressed',
        message_id: 'provider-message-suppressed',
        eaccount: 'sdr@example.com',
        subject: 'Please stop',
        from_email: 'quiet@example.com',
        to_email: 'sdr@example.com',
        body_text: 'Do not email me.',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: false,
        interested: false,
        interest_status: null,
        suppressed: true,
        opt_out_detected: true,
        lead_email: 'quiet@example.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Titan outreach',
          client: { id: clientId, name: 'Dallas Fontaine' },
        },
        lead_context: null,
        thread_key: 'thread-suppressed',
        relationship: null,
      }],
    } as never)
    renderPage('master-inbox')

    fireEvent.click(await screen.findByRole('radio', { name: /Other replies/ }))
    fireEvent.click(await screen.findByText('Please stop'))

    expect(await screen.findByText(/This address is on the do-not-contact list/i)).toBeInTheDocument()
    // The composer is gone entirely, not merely disabled.
    expect(screen.queryByRole('button', { name: 'Send reply' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).not.toBeInTheDocument()
    // And it is already suppressed, so it is stated rather than offered again.
    expect(screen.queryByRole('button', { name: /add to do not contact/i })).not.toBeInTheDocument()
  })

  it('can show what was sent, not only what came back', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-one',
        thread_id: 'thread-one',
        message_id: 'provider-message-one',
        eaccount: 'sdr@example.com',
        subject: 'Re: guest idea',
        from_email: 'morgan@example.com',
        to_email: 'sdr@example.com',
        body_text: 'What is this about?',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: true,
        interested: true,
        interest_status: 1,
        suppressed: false,
        opt_out_detected: false,
        lead_email: 'morgan@example.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Taylor outreach',
          client: { id: clientId, name: 'Taylor Client' },
        },
        lead_context: null,
        thread_key: 'thread-one',
        relationship: null,
      }],
    } as never)
    vi.mocked(getWorkspaceInboxThreadMessages).mockResolvedValue([
      {
        id: 'sent-one',
        direction: 'outbound',
        subject: 'Guest idea for Founder Stories',
        from_email: 'sdr@example.com',
        to_email: 'morgan@example.com',
        body_text: 'Your conversation with Peter Smythe stayed with me.',
        sent_at: '2026-07-20T12:00:00.000Z',
      },
      {
        id: 'reply-one',
        direction: 'inbound',
        subject: 'Re: guest idea',
        from_email: 'morgan@example.com',
        to_email: 'sdr@example.com',
        body_text: 'What is this about?',
        sent_at: '2026-07-21T12:00:00.000Z',
      },
    ] as never)
    renderPage('master-inbox')

    fireEvent.click(await screen.findByText('Re: guest idea'))
    // Not fetched until asked for: one provider call per thread.
    expect(getWorkspaceInboxThreadMessages).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /Show what we sent/i }))
    await waitFor(() => expect(getWorkspaceInboxThreadMessages).toHaveBeenCalledWith(
      defaultWorkspaceId,
      'thread-one',
    ))
    expect(await screen.findByText('We sent')).toBeInTheDocument()
    expect(screen.getByText(/Your conversation with Peter Smythe stayed with me/)).toBeInTheDocument()
    expect(screen.getByText('They replied')).toBeInTheDocument()
  })

  it('says when the reply list is only a window onto a longer inbox', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      truncated: true,
      threads: [],
    } as never)
    renderPage('master-inbox')

    expect(await screen.findByText(/Showing the most recent replies only/i)).toBeInTheDocument()
    expect(screen.getByText(/an older conversation may be missing/i)).toBeInTheDocument()
  })

  it('lets an operator suppress a host who asked to stop, from the reply itself', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-optout',
        thread_id: 'thread-optout',
        message_id: 'provider-message-optout',
        eaccount: 'sdr@example.com',
        subject: 'Do not send correspondence to this email address, please',
        from_email: 'bingram.precision@gmail.com',
        to_email: 'sdr@example.com',
        body_text: 'Do not send correspondence to this email address, please.',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: true,
        interested: false,
        interest_status: null,
        // The automatic prefilter never processed this thread, so nothing
        // suppressed the address — the production case this exists for.
        suppressed: false,
        lead_email: 'bingram.precision@gmail.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Titan outreach',
          client: { id: clientId, name: 'Dallas Fontaine' },
        },
        lead_context: {
          podcast_id: 'show-one',
          podcast_name: 'Titan Solar',
          host_name: 'Brad Ingram',
          stage: 'contacted',
          first_message_at: '2026-07-20T12:00:00.000Z',
          opens: 1,
          replies: 1,
        },
        thread_key: 'thread-optout',
        relationship: null,
      }],
    } as never)
    renderPage('master-inbox')

    fireEvent.click(await screen.findByRole('radio', { name: /Other replies/ }))
    fireEvent.click(await screen.findByText('Do not send correspondence to this email address, please'))
    fireEvent.click(await screen.findByRole('button', { name: /Do not contact/ }))

    // Workspace-wide, so the address is named before it is silenced everywhere.
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    const confirm = within(cancel.closest('[role="dialog"]') as HTMLElement)
    expect(confirm.getByText(/excluded from outreach for every client/i)).toBeInTheDocument()
    expect(addOutreachSuppression).not.toHaveBeenCalled()

    fireEvent.click(confirm.getByRole('button', { name: 'Add to do not contact' }))
    await waitFor(() => expect(addOutreachSuppression).toHaveBeenCalledWith(
      defaultWorkspaceId,
      expect.objectContaining({
        contactEmail: 'bingram.precision@gmail.com',
        reason: 'opted_out',
      }),
    ))
  })

  it('moves a conversation into Interested only when it is marked interested', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-one',
        thread_id: 'thread-one',
        message_id: 'provider-message-one',
        eaccount: 'sdr@example.com',
        subject: 'Re: Titan bankruptcy',
        from_email: 'randy@example.com',
        to_email: 'sdr@example.com',
        body_text: 'How does this relate to my current system?',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: true,
        // The provider's email row still says not interested. This is exactly
        // the state that made marking interested look like it did nothing.
        interested: false,
        interest_status: null,
        lead_email: 'randy@example.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Titan outreach',
          client: { id: clientId, name: 'Dallas Fontaine' },
        },
        lead_context: {
          podcast_id: 'show-one',
          podcast_name: 'Titan Solar',
          host_name: 'Randy Brown',
          stage: 'contacted',
          first_message_at: '2026-07-20T12:00:00.000Z',
          opens: 1,
          replies: 1,
        },
        thread_key: 'thread-one',
        relationship: null,
      }],
    } as never)
    renderPage('master-inbox')

    // It starts under Other replies, so that is where it has to be found.
    fireEvent.click(await screen.findByRole('radio', { name: /Other replies/ }))
    fireEvent.click(await screen.findByText('Re: Titan bankruptcy'))
    fireEvent.click(await screen.findByRole('button', { name: 'Interested' }))

    await waitFor(() => expect(setWorkspaceInboxLeadInterest).toHaveBeenCalledWith(
      defaultWorkspaceId,
      expect.objectContaining({ lead_email: 'randy@example.com', interest_value: 1 }),
    ))
    // The scope follows the conversation rather than letting it vanish.
    await waitFor(() => expect(
      screen.getByRole('radio', { name: /Interested only/ }),
    ).toHaveAttribute('aria-checked', 'true'))
  })

  it('saves a selected Master Inbox conversation to its host relationship', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-one',
        thread_id: 'thread-one',
        message_id: 'provider-message-one',
        eaccount: 'sdr@example.com',
        subject: 'Re: operator systems',
        from_email: 'morgan@example.com',
        to_email: 'sdr@example.com',
        body_text: 'Interested in revisiting this in Q3.',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: true,
        interested: true,
        lead_email: 'morgan@example.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Taylor outreach',
          client: { id: clientId, name: 'Taylor Client' },
        },
        lead_context: {
          podcast_id: 'show-one',
          podcast_name: 'Founder & Operator',
          host_name: 'Morgan Host',
          stage: 'contacted',
          first_message_at: '2026-07-20T12:00:00.000Z',
          opens: 2,
          replies: 1,
        },
        thread_key: 'thread-one',
        relationship: null,
      }],
    })

    renderPage('master-inbox')
    fireEvent.click(await screen.findByRole('button', { name: /morgan@example\.com.*operator systems/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save to relationships' }))

    await waitFor(() => expect(mockedCaptureRelationshipThread).toHaveBeenCalledWith(defaultWorkspaceId, {
      podcastId: 'show-one',
      podcastName: 'Founder & Operator',
      hostName: 'Morgan Host',
      contactEmail: 'morgan@example.com',
      threadKey: 'thread-one',
      clientId,
      messageId: 'message-one',
      subject: 'Re: operator systems',
      fromEmail: 'morgan@example.com',
      toEmail: 'sdr@example.com',
      body: 'Interested in revisiting this in Q3.',
      receivedAt: '2026-07-21T12:00:00.000Z',
      campaignId: 'campaign-one',
      campaignName: 'Taylor outreach',
    }))
  })

  it('collapses to a single notice when Instantly is not connected', async () => {
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({ connected: false, threads: [] } as never)

    renderPage('master-inbox')

    expect(await screen.findByText('Instantly is not connected')).toBeInTheDocument()
    // The split view is sized to the viewport, and the toolbar only describes
    // an inbox that loaded, so neither may render around an empty state.
    expect(screen.queryByLabelText('Search conversations')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Conversation filters')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Inbox conversations')).not.toBeInTheDocument()
  })

  it('replies on the host thread subject and offers no way to change it', async () => {
    const clientId = '22222222-2222-4222-8222-222222222222'
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
      connected: true,
      threads: [{
        id: 'message-one',
        thread_id: 'thread-one',
        message_id: 'provider-message-one',
        eaccount: 'sdr@example.com',
        subject: 'Re: operator systems',
        from_email: 'morgan@example.com',
        to_email: 'sdr@example.com',
        body_text: 'Interested in revisiting this in Q3.',
        received_at: '2026-07-21T12:00:00.000Z',
        is_unread: true,
        interested: true,
        lead_email: 'morgan@example.com',
        campaign: {
          campaign_id: 'campaign-one',
          campaign_name: 'Taylor outreach',
          client: { id: clientId, name: 'Taylor Client' },
        },
        thread_key: 'thread-one',
        relationship: null,
      }],
    } as never)
    vi.mocked(sendWorkspaceInboxReply).mockResolvedValue({} as never)

    renderPage('master-inbox')
    fireEvent.click(await screen.findByRole('button', { name: /morgan@example\.com.*operator systems/i }))

    // The subject is what keeps the reply in the host's existing thread, so it
    // is displayed rather than offered as an input.
    expect(screen.queryByRole('textbox', { name: 'Reply subject' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Reply body'), { target: { value: 'Q3 works well.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }))

    // Already prefixed upstream — the reply must not stack a second "Re:".
    await waitFor(() => expect(sendWorkspaceInboxReply).toHaveBeenCalledWith(
      defaultWorkspaceId,
      expect.objectContaining({ subject: 'Re: operator systems', reply_to_id: 'message-one' }),
    ))
  })

  // The AI draft is persisted server-side and restored on open, but an
  // operator's edits lived only in component state — leaving and returning
  // restored the original draft over their version, which looks like the work
  // survived when it did not.
  it('persists an edited reply draft after the operator pauses typing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const clientId = '22222222-2222-4222-8222-222222222222'
      vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({
        connected: true,
        threads: [{
          id: 'message-one',
          thread_id: 'thread-one',
          message_id: 'provider-message-one',
          eaccount: 'sdr@example.com',
          subject: 'Re: operator systems',
          from_email: 'morgan@example.com',
          to_email: 'sdr@example.com',
          body_text: 'Interested in revisiting this in Q3.',
          received_at: '2026-07-21T12:00:00.000Z',
          is_unread: true,
          interested: true,
          lead_email: 'morgan@example.com',
          campaign: {
            campaign_id: 'campaign-one',
            campaign_name: 'Taylor outreach',
            client: { id: clientId, name: 'Taylor Client' },
          },
          thread_key: 'thread-one',
          relationship: null,
        }],
      } as never)

      renderPage('master-inbox')
      fireEvent.click(await screen.findByRole('button', { name: /morgan@example\.com.*operator systems/i }))
      fireEvent.change(screen.getByLabelText('Reply body'), { target: { value: 'Edited by a human.' } })

      // Nothing saves mid-keystroke; the debounce waits for the pause.
      expect(setWorkspaceInboxThreadStatus).not.toHaveBeenCalledWith(
        defaultWorkspaceId,
        expect.objectContaining({ draft_body: expect.anything() }),
      )
      await vi.advanceTimersByTimeAsync(1_000)

      expect(setWorkspaceInboxThreadStatus).toHaveBeenCalledWith(
        defaultWorkspaceId,
        expect.objectContaining({
          thread_key: 'thread-one',
          client_id: clientId,
          draft_body: 'Edited by a human.',
        }),
      )
    } finally {
      vi.useRealTimers()
    }
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
