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
  getWorkspaceTargetLeadStatus,
  setWorkspaceCampaignRunning,
  type WorkspaceCampaignDetailResponse,
  type WorkspaceClientCampaign,
} from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
  getWorkspaceTargetLeadStatus: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  setWorkspaceCampaignRunning: vi.fn(),
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
    id: 'target-one', shortlist_podcast_id: 'shortlist-one', podcast_id: 'podcast-one', podcast_name: 'Founder Show', podcast_url: 'https://founder.example.com', host_name: 'Jamie Host', contact_email: 'host@founder.example', selection_source: 'client_positive', wave_started_on: '2026-07-22', research_notes: 'A researched founder audience.', pitch_subject: 'A tailored guest idea', pitch_body: 'A reviewed opening pitch.', follow_up_1_subject: 'Re: A tailored guest idea', follow_up_1_body: 'A reviewed first follow-up.', follow_up_2_subject: 'Re: A tailored guest idea', follow_up_2_body: 'A reviewed final follow-up.', status: 'ready', instantly_lead_id: null, instantly_lead_status: null, email_open_count: 0, email_reply_count: 0, approved_at: null, launched_at: null, last_activity_at: null, last_error: null, prior_outreach_at: null, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z',
  },
  {
    id: 'target-two', shortlist_podcast_id: 'shortlist-two', podcast_id: 'podcast-two', podcast_name: 'Operator Stories', podcast_url: null, host_name: null, contact_email: null, selection_source: 'client_positive', wave_started_on: '2026-07-22', research_notes: null, pitch_subject: null, pitch_body: null, follow_up_1_subject: null, follow_up_1_body: null, follow_up_2_subject: null, follow_up_2_body: null, status: 'draft', instantly_lead_id: null, instantly_lead_status: null, email_open_count: 0, email_reply_count: 0, approved_at: null, launched_at: null, last_activity_at: null, last_error: null, prior_outreach_at: null, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z',
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

function renderPage(platformWorkspaceId?: string, query = '') {
  const base = platformWorkspaceId ? `/app/workspaces/${workspaceId}` : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${base}/client-campaigns/${clientId}${query}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

  // The campaign list deep-links to the work: "Launch 2 staged pitches" has to
  // arrive on Podcasts, not drop the operator on Analytics to navigate again.
  it('opens the tab named in the address', async () => {
    renderPage(undefined, '?tab=leads')

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Podcasts' })).toHaveAttribute('aria-selected', 'true'))
  })

  it('falls back to analytics when the tab in the address is not real', async () => {
    renderPage(undefined, '?tab=not-a-tab')

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Analytics' })).toHaveAttribute('aria-selected', 'true'))
  })

  it('says why an active campaign is sending nothing', async () => {
    mockedCampaign.mockResolvedValue({
      ...campaignState,
      campaign: { ...activeCampaign, provider_not_sending_status: 3 },
    } as never)

    renderPage()
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Schedule' }), { button: 0 })

    // The provider reports this on every sync and it used to be discarded, so
    // a live campaign with no sends explained itself nowhere.
    expect(await screen.findByText(/reached its daily sending limit/i)).toBeInTheDocument()
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

    const summary = screen.getByLabelText('Podcast outreach summary')
    expect(within(summary).getByText('In campaign')).toBeInTheDocument()
    expect(within(summary).getByText('Emailed')).toBeInTheDocument()
    expect(within(summary).getByText('Opened')).toBeInTheDocument()
    expect(within(summary).getByText('Replied')).toBeInTheDocument()
    expect(within(summary).getByText('Reply rate')).toBeInTheDocument()
    expect(within(summary).getByText('0%')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Delivery' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Opens' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Replies' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'Sequence' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'Client decision' })).not.toBeInTheDocument()
    expect(within(table).queryByText('Operator Stories')).not.toBeInTheDocument()
    const founderRow = within(table).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    expect(within(founderRow as HTMLElement).getByText('Not emailed')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('Ready for campaign')).toBeInTheDocument()
    fireEvent.click(within(founderRow as HTMLElement).getByRole('button', { name: /view details/i }))
    expect(await screen.findByRole('heading', { name: 'Founder Show' })).toBeInTheDocument()
    expect(screen.getByText('Final contact and approved three-email sequence for this campaign.')).toBeInTheDocument()
    expect(screen.getAllByText('Final sequence').length).toBeGreaterThan(0)
    expect(screen.getByText('A tailored guest idea')).toBeInTheDocument()
    expect(screen.getByText('A reviewed opening pitch.')).toBeInTheDocument()
    expect(screen.getByText('A reviewed first follow-up.')).toBeInTheDocument()
    expect(screen.getByText('A reviewed final follow-up.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText(/reply in the original thread/i)).toBeInTheDocument()
    expect(screen.getByText(/reply in the same thread/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save contact' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve & start outreach/i })).not.toBeInTheDocument()
    const pitchContext = screen.getByText('Pitch context').closest('details')
    expect(pitchContext).not.toHaveAttribute('open')
  })

  it('shows delivery and engagement for an emailed podcast lead', async () => {
    mockedCampaign.mockResolvedValueOnce({
      ...campaignState,
      targets: [{
        ...sentTargets[0],
        status: 'replied',
        instantly_lead_id: 'lead-one',
        instantly_lead_status: 1,
        email_open_count: 3,
        email_reply_count: 1,
        launched_at: '2026-07-23T00:00:00Z',
        last_activity_at: '2026-07-24T00:00:00Z',
      }],
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    const summary = screen.getByLabelText('Podcast outreach summary')
    expect(within(summary).getByText('100%')).toBeInTheDocument()

    const founderRow = within(screen.getByRole('table')).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    expect(within(founderRow as HTMLElement).getByText('Replied')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('Follow-ups stopped')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('3')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('1')).toBeInTheDocument()
  })

  it('labels preserved legacy outreach instead of presenting it as ready to email again', async () => {
    mockedCampaign.mockResolvedValueOnce({
      ...campaignState,
      targets: [{ ...sentTargets[0], prior_outreach_at: '2026-07-10T00:00:00Z' }],
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    const founderRow = within(screen.getByRole('table')).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    expect(within(founderRow as HTMLElement).getByText('Previously contacted')).toBeInTheDocument()
    expect(within(founderRow as HTMLElement).getByText('Earlier client outreach')).toBeInTheDocument()

    fireEvent.click(within(founderRow as HTMLElement).getByRole('button', { name: /view details/i }))
    expect(await screen.findByText(/A second launch is blocked to prevent duplicate contact/i)).toBeInTheDocument()
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

    // Activating also changes what Send to Client Campaign does, so it is
    // confirmed rather than fired straight off the button.
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    const confirm = within(cancel.closest('[role="dialog"]') as HTMLElement)
    expect(confirm.getByText(/This also changes Send to Client Campaign/i)).toBeInTheDocument()
    expect(confirm.getByText(/without a separate launch step/i)).toBeInTheDocument()
    expect(mockedRunning).not.toHaveBeenCalled()

    fireEvent.click(confirm.getByRole('button', { name: 'Launch Campaign' }))
    await waitFor(() => expect(mockedRunning).toHaveBeenCalledWith(workspaceId, clientId, true))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pause Campaign' })).toHaveLength(2))
    expect(screen.getByText('Campaign active')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pause Campaign' })[0]).toHaveClass('bg-destructive')
  })

  it('shows the sending window Instantly actually holds, not an assumed one', async () => {
    mockedCampaign.mockResolvedValue({
      ...campaignState,
      campaign: {
        ...activeCampaign,
        timezone: 'America/Bogota',
        last_synced_at: '2026-07-27T12:00:00Z',
        provider_email_gap: 15,
        provider_not_sending_status: null,
        provider_schedule: {
          name: 'Weekdays',
          from: '09:00',
          to: '17:00',
          timezone: 'America/Bogota',
          // 0..4 true is what the campaign body actually sets. Under the stated
          // Sunday-first convention that is Sunday through Thursday, which is
          // exactly the thing a hardcoded "Monday–Friday" could never reveal.
          days: [true, true, true, true, true, false, false],
        },
      },
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Schedule' }), { button: 0 })
    expect(await screen.findByText('Sunday–Thursday')).toBeInTheDocument()
    expect(screen.getByText('9:00 AM–5:00 PM')).toBeInTheDocument()
    expect(screen.getByText('15 min')).toBeInTheDocument()
    // The mapping is documented nowhere by the provider, so the page says where
    // it actually came from rather than presenting it as a known fact.
    expect(screen.getByText(/does not state the mapping anywhere/i)).toBeInTheDocument()
    expect(screen.getByText(/confirmed against a real campaign/i)).toBeInTheDocument()
    // No mismatch warning when the two agree.
    expect(screen.queryByText(/Save the schedule to push your timezone across/i)).not.toBeInTheDocument()
  })

  it('flags a campaign whose provider timezone disagrees with the one set here', async () => {
    mockedCampaign.mockResolvedValue({
      ...campaignState,
      campaign: {
        ...activeCampaign,
        timezone: 'America/Bogota',
        provider_schedule: {
          name: 'Weekdays',
          from: '09:00',
          to: '17:00',
          timezone: 'America/New_York',
          days: [false, true, true, true, true, true, false],
        },
      },
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Schedule' }), { button: 0 })
    expect(await screen.findByText('Monday–Friday')).toBeInTheDocument()
    expect(screen.getByText(/Instantly is sending in America\/New_York/i)).toBeInTheDocument()
  })

  it('leaves the window blank rather than guessing when nothing has been synced', async () => {
    mockedCampaign.mockResolvedValue({
      ...campaignState,
      campaign: { ...activeCampaign, provider_schedule: null, provider_email_gap: null },
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Schedule' }), { button: 0 })
    expect(await screen.findByText('Nothing read yet')).toBeInTheDocument()
    expect(screen.getByText(/deliberately blank rather than guessed/i)).toBeInTheDocument()
    expect(screen.queryByText('Monday–Friday')).not.toBeInTheDocument()
  })

  // The steps used to describe their own timings in prose — "Wait 3 days" while
  // Instantly waited 6. Reading a real message, at a stated day, is the point.

/** The shared fixture has no lead; these tests need one that is in outreach. */
function withStagedLead() {
  mockedCampaign.mockResolvedValue({
    ...campaignState,
    targets: [
      { ...sentTargets[0], status: 'in_outreach', instantly_lead_id: 'lead-one', instantly_lead_status: 1 },
      sentTargets[1],
    ],
  } as WorkspaceCampaignDetailResponse)
}

  // Everything else on this page is as fresh as the last sync. A lead moves on
  // its own — it opens, it bounces, it replies — so this one is asked live.
  it('reads where a host stands from Instantly rather than from the last sync', async () => {
    vi.mocked(getWorkspaceTargetLeadStatus).mockResolvedValue({
      lead: {
        id: 'lead-one',
        email: 'host@founder.example',
        status: 1,
        email_open_count: 3,
        email_reply_count: 1,
        email_click_count: 2,
        email_opened_step: 1,
        email_replied_step: 2,
        lt_interest_status: 2,
        verification_status: 1,
        timestamp_last_contact: '2026-07-30T00:00:00Z',
        timestamp_last_open: '2026-07-31T00:00:00Z',
        timestamp_last_reply: '2026-08-01T00:00:00Z',
        timestamp_last_click: null,
      },
      deleted_upstream: false,
      checked_at: '2026-08-01T12:00:00Z',
    })
    withStagedLead()
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Founder Show/ }))

    expect(await screen.findByText('Sequence running')).toBeInTheDocument()
    expect(screen.getByText('Meeting booked')).toBeInTheDocument()
    expect(screen.getByText('Address verified')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(getWorkspaceTargetLeadStatus).toHaveBeenCalledWith(expect.objectContaining({
      shortlistPodcastId: 'shortlist-one',
    }))
  })

  // Verified against a real lead: Instantly omits these fields entirely rather
  // than returning null, so an uncontacted lead renders as zeros and "Not yet"
  // everywhere — true, and indistinguishable from a broken panel.
  it('says nothing has been sent rather than showing a grid of zeros', async () => {
    vi.mocked(getWorkspaceTargetLeadStatus).mockResolvedValue({
      lead: {
        id: 'lead-one',
        email: 'host@founder.example',
        status: 1,
        email_open_count: 0,
        email_reply_count: 0,
        email_click_count: 0,
        email_opened_step: null,
        email_replied_step: null,
        lt_interest_status: null,
        verification_status: null,
        timestamp_last_contact: null,
        timestamp_last_open: null,
        timestamp_last_reply: null,
        timestamp_last_click: null,
      },
      deleted_upstream: false,
      checked_at: '2026-08-01T12:00:00Z',
    })
    withStagedLead()
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Founder Show/ }))

    expect(await screen.findByText(/nothing has been sent to this host yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Last opened')).not.toBeInTheDocument()
  })

  // A lead deleted upstream is an answer, not a fault: nothing is running
  // because there is nothing left to run.
  it('says plainly when the lead no longer exists in Instantly', async () => {
    vi.mocked(getWorkspaceTargetLeadStatus).mockResolvedValue({
      lead: null,
      deleted_upstream: true,
      checked_at: '2026-08-01T12:00:00Z',
    })
    withStagedLead()
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Founder Show/ }))

    expect(await screen.findByText(/no longer exists in Instantly/i)).toBeInTheDocument()
  })

  it('shows each step of the sequence with the message a host actually receives', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sequences' }), { button: 0 })
    // Step one opens by default, previewing a podcast that has copy written.
    expect(await screen.findByText('A reviewed opening pitch.')).toBeInTheDocument()
    expect(screen.getByText('A tailored guest idea')).toBeInTheDocument()
    expect(screen.getByText(/As written for Founder Show/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /First follow-up/ }))
    expect(await screen.findByText('A reviewed first follow-up.')).toBeInTheDocument()
    // A blank subject is the mechanism that keeps it in one thread, so the
    // screen says so rather than leaving it looking like missing copy.
    expect(screen.getByText(/replies into the opening email/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Final follow-up/ }))
    expect(await screen.findByText('A reviewed final follow-up.')).toBeInTheDocument()
  })

  // The wait belongs on the connector between two steps, where the delay
  // happens, rather than in a settings block that made the reader map a number
  // back onto a step.
  it('edits each wait between the steps it separates', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sequences' }), { button: 0 })
    const waits = await screen.findAllByRole('spinbutton')
    expect(waits).toHaveLength(2)
    expect(waits[0]).toHaveValue(6)
    expect(waits[1]).toHaveValue(7)

    fireEvent.change(waits[0], { target: { value: '4' } })
    // Every day the sequence states moves with it, including the last.
    expect(await screen.findByRole('button', { name: /Step 2.*Day 4/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 3.*Day 11/ })).toBeInTheDocument()
  })

  // Timings come from the campaign. Written as prose they drifted, and said
  // "Wait 3 days" for a year while the campaign waited six.
  it('states which day each step lands on, from the campaign settings', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sequences' }), { button: 0 })
    // Scoped to the step list: the selected step repeats its day as a badge.
    expect(await screen.findByRole('button', { name: /Step 1.*Opening pitch.*Day 0/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 2.*First follow-up.*Day 6/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 3.*Final follow-up.*Day 13/ })).toBeInTheDocument()
  })
})
