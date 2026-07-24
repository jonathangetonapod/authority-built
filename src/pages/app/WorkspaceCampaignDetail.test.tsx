import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceCampaignDetail from '@/pages/app/WorkspaceCampaignDetail'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail, type WorkspaceClientDetail } from '@/services/clients'
import {
  getWorkspaceCampaign,
  setWorkspaceCampaignRunning,
  type WorkspaceCampaignDetailResponse,
  type WorkspaceClientCampaign,
} from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  saveWorkspaceCampaignPitch: vi.fn(),
  setWorkspaceCampaignRunning: vi.fn(),
  updateWorkspaceCampaignContact: vi.fn(),
  updateWorkspaceCampaignSettings: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: { children: React.ReactNode; platformWorkspace?: { baseHref: string } }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref || '/app'}>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedShortlist = vi.mocked(getClientShortlist)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedCampaign = vi.mocked(getWorkspaceCampaign)
const mockedRunning = vi.mocked(setWorkspaceCampaignRunning)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const detail = {
  workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme', status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
  viewer_role: 'owner', can_manage: true,
  client: { id: clientId, workspace_id: workspaceId, name: 'Dallas Fontaine', email: 'dallas@example.com', contact_person: 'Dallas', linkedin_url: null, website: null, status: 'active', notes: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', bio: 'Founder and speaker', photo_url: null, calendar_link: null, media_kit_url: null, prospect_dashboard_slug: null, dashboard_slug: null, dashboard_enabled: false, portal_access_enabled: false, portal_last_login_at: null, password_set_at: null },
  dashboard: { configured: false, enabled: false, tagline: null, view_count: 0, last_viewed_at: null, podcast_count: 2, reviewed_count: 1, approved_count: 1, rejected_count: 0, to_review_count: 1, analyzed_count: 2, last_synced_at: null, last_feedback_at: null },
  outreach: { initial_emails_sent: 8, podcasts_contacted: 7, pending_review_count: 0, approved_count: 0, failed_count: 0, last_sent_at: '2026-07-22T00:00:00Z' },
  bookings: [], onboarding: null,
} as WorkspaceClientDetail

const podcasts = [
  {
    id: 'shortlist-one', client_id: clientId, podcast_id: 'podcast-one', podcast_name: 'Founder Show', podcast_email: 'host@founder.example', publisher_name: 'Jamie Host', podcast_url: 'https://founder.example.com', podcast_image_url: null, visibility: 'visible', feedback_status: 'approved', display_order: 0, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', feedback_updated_at: '2026-07-22T00:00:00Z', ai_fit_reasons: ['Dallas has direct founder experience.'], ai_pitch_angles: [{ title: 'Scaling with focus', description: 'A practical founder conversation.' }],
  },
  {
    id: 'shortlist-two', client_id: clientId, podcast_id: 'podcast-two', podcast_name: 'Operator Stories', podcast_email: null, publisher_name: null, podcast_url: null, podcast_image_url: null, visibility: 'visible', feedback_status: 'approved', display_order: 1, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', feedback_updated_at: '2026-07-22T00:00:00Z', ai_fit_reasons: null, ai_pitch_angles: null,
  },
] as ClientShortlistPodcast[]

const sentTargets = [
  {
    id: 'target-one', shortlist_podcast_id: 'shortlist-one', podcast_id: 'podcast-one', podcast_name: 'Founder Show', podcast_url: 'https://founder.example.com', host_name: 'Jamie Host', contact_email: 'host@founder.example', selection_source: 'client_positive', wave_started_on: '2026-07-22', research_notes: 'A researched founder audience.', pitch_subject: 'A tailored guest idea', pitch_body: 'A reviewed opening pitch.', follow_up_1_subject: 'Re: A tailored guest idea', follow_up_1_body: 'A reviewed first follow-up.', follow_up_2_subject: 'Re: A tailored guest idea', follow_up_2_body: 'A reviewed final follow-up.', status: 'ready', instantly_lead_id: null, instantly_lead_status: null, email_open_count: 0, email_reply_count: 0, approved_at: null, launched_at: null, last_activity_at: null, last_error: null, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z',
  },
  {
    id: 'target-two', shortlist_podcast_id: 'shortlist-two', podcast_id: 'podcast-two', podcast_name: 'Operator Stories', podcast_url: null, host_name: null, contact_email: null, selection_source: 'client_positive', wave_started_on: '2026-07-22', research_notes: null, pitch_subject: null, pitch_body: null, follow_up_1_subject: null, follow_up_1_body: null, follow_up_2_subject: null, follow_up_2_body: null, status: 'draft', instantly_lead_id: null, instantly_lead_status: null, email_open_count: 0, email_reply_count: 0, approved_at: null, launched_at: null, last_activity_at: null, last_error: null, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z',
  },
] as WorkspaceCampaignDetailResponse['targets']

const campaignState = {
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
  campaign: null,
  targets: sentTargets,
} as WorkspaceCampaignDetailResponse

const activeCampaign = {
  id: 'campaign-one', workspace_id: workspaceId, client_id: clientId, name: 'Dallas Fontaine Podcast Outreach', status: 'active', instantly_campaign_id: 'instantly-one', instantly_campaign_status: 1, sender_accounts: ['active@example.com'], timezone: 'America/New_York', daily_limit: 30, analytics: { emails_sent_count: 0, contacted_count: 0, open_count_unique: 0, reply_count_unique: 0, bounced_count: 0, unsubscribed_count: 0, total_interested: 0, total_meeting_booked: 0 }, target_counts: { total: 2, needs_contact: 1, needs_pitch: 1, ready: 0, in_outreach: 0, replied: 0, failed: 0 }, target_shortlist_podcast_ids: ['shortlist-one', 'shortlist-two'], last_synced_at: null, last_error: null, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z',
} as WorkspaceClientCampaign

function renderPage(platformWorkspaceId?: string) {
  const base = platformWorkspaceId ? `/app/workspaces/${workspaceId}` : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${base}/client-campaigns/${clientId}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path={`${base}/client-campaigns/:clientId`} element={<WorkspaceCampaignDetail platformWorkspaceId={platformWorkspaceId} />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceCampaignDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, workspace: { id: workspaceId, name: 'Acme Workspace' } } as never)
    mockedDetail.mockResolvedValue(detail)
    mockedShortlist.mockResolvedValue({ client: { id: clientId, name: 'Dallas Fontaine' }, podcasts })
    mockedCampaign.mockResolvedValue(campaignState)
    mockedRunning.mockResolvedValue({ ...activeCampaign, status: 'paused' })
  })

  it('opens with campaign analytics and keeps the saved sequence under Podcasts', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Campaign active')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Analytics' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Podcasts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sequences' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Options' })).toBeInTheDocument()
    expect(screen.queryByText('Bookings')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /write pitches/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sync instantly/i })).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Podcasts' }), { button: 0 })
    expect(screen.queryByLabelText('Campaign podcast filters')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /All podcasts/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Needs contact')).not.toBeInTheDocument()
    expect(screen.queryByText('Needs pitch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Current wave|podcasts in view/i)).not.toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Sequence' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Outreach status' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'Client decision' })).not.toBeInTheDocument()
    expect(within(table).queryByText('Operator Stories')).not.toBeInTheDocument()
    const founderRow = within(table).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    expect(within(founderRow as HTMLElement).getByText('3 emails ready')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('Ready for outreach')).toBeInTheDocument()
    fireEvent.click(within(founderRow as HTMLElement).getByRole('button', { name: /view sequence/i }))
    expect(await screen.findByRole('heading', { name: 'Founder Show' })).toBeInTheDocument()
    expect(screen.getByText('Dallas has direct founder experience.')).toBeInTheDocument()
    expect(screen.getByLabelText('Subject line')).toBeEnabled()
    expect(screen.getByLabelText('Opening email')).toBeEnabled()
    expect(screen.getByLabelText('Follow-up 1 reply')).toBeEnabled()
    expect(screen.getByLabelText('Follow-up 2 reply')).toBeEnabled()
    expect(screen.queryByLabelText('Follow-up 1 subject')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Follow-up 2 subject')).not.toBeInTheDocument()
    expect(screen.getByText(/reply in the original thread/i)).toBeInTheDocument()
    expect(screen.getByText(/reply in the same thread/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /approve & start outreach/i })).not.toBeInTheDocument()
  })

  it('shows only podcasts sent through the Write Pitch modal', async () => {
    mockedCampaign.mockResolvedValueOnce({ ...campaignState, targets: [sentTargets[1]] })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'No podcasts in this campaign' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('Operator Stories')).not.toBeInTheDocument()
  })

  it('uses the identical campaign workspace in a platform-selected workspace', async () => {
    renderPage(workspaceId)

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', `/app/workspaces/${workspaceId}`)
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
    expect(mockedShortlist).toHaveBeenCalledWith(workspaceId, clientId)
    expect(mockedCampaign).toHaveBeenCalledWith(workspaceId, clientId)
  })

  it('shows every Instantly mailbox in campaign options while disabling unavailable accounts', async () => {
    mockedCampaign.mockResolvedValueOnce({
      ...campaignState,
      integration: {
        ...campaignState.integration,
        connected: true,
        status: 'connected',
        accounts: [
          { email: 'active@example.com', first_name: 'Active', last_name: 'Sender', status: 1, warmup_status: 1, daily_limit: 40 },
          { email: 'paused@example.com', first_name: 'Paused', last_name: 'Sender', status: 0, warmup_status: 0, daily_limit: 20 },
        ],
        active_account_count: 1,
      },
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Options' }), { button: 0 })
    expect(screen.getByText('Select one or more accounts to send emails from.')).toBeInTheDocument()
    expect(screen.getByText('active@example.com')).toBeInTheDocument()
    expect(screen.getByText('paused@example.com')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Use active@example.com' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Use paused@example.com' })).toBeDisabled()
  })

  it('places campaign controls at the top and bottom of Options and swaps pause to resume', async () => {
    mockedCampaign.mockResolvedValue({ ...campaignState, campaign: activeCampaign })
    mockedRunning.mockResolvedValueOnce({ ...activeCampaign, status: 'paused' })
    renderPage()

    expect(await screen.findByText('Campaign active')).toBeInTheDocument()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Options' }), { button: 0 })
    const pauseButtons = screen.getAllByRole('button', { name: 'Pause Campaign' })
    expect(pauseButtons).toHaveLength(2)
    expect(pauseButtons[0]).toHaveClass('bg-destructive')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument()

    fireEvent.click(pauseButtons[0])
    await waitFor(() => expect(mockedRunning).toHaveBeenCalledWith(workspaceId, clientId, false))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Resume Campaign' })).toHaveLength(2))
    expect(screen.getByText('Campaign inactive · Paused')).toBeInTheDocument()
  })

  it('turns a draft campaign launch action into a red pause action', async () => {
    const draftCampaign = { ...activeCampaign, status: 'draft' as const, instantly_campaign_status: 0 }
    mockedCampaign.mockResolvedValue({ ...campaignState, campaign: draftCampaign })
    mockedRunning.mockResolvedValueOnce({ ...activeCampaign, status: 'active' })
    renderPage()

    expect(await screen.findByText('Campaign inactive · Not launched')).toBeInTheDocument()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Options' }), { button: 0 })
    const launchButtons = screen.getAllByRole('button', { name: 'Launch Campaign' })
    expect(launchButtons).toHaveLength(1)
    fireEvent.click(launchButtons[0])

    await waitFor(() => expect(mockedRunning).toHaveBeenCalledWith(workspaceId, clientId, true))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pause Campaign' })).toHaveLength(2))
    expect(screen.getByText('Campaign active')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pause Campaign' })[0]).toHaveClass('bg-destructive')
  })

  it('explains that every podcast has a reviewed three-email sequence before Instantly sends it', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sequences' }), { button: 0 })
    expect(screen.getByText(/Research and all three messages are prepared for each show/i)).toBeInTheDocument()
    expect(screen.getByText(/Message preparation belongs in Podcasts/i)).toBeInTheDocument()
  })
})
