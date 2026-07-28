import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceClientDetail from '@/pages/app/WorkspaceClientDetail'
import { useAuth } from '@/contexts/AuthContext'
import {
  getWorkspaceClientDetail,
  setWorkspaceClientPassword,
  updateWorkspaceClient,
  updateWorkspaceClientProfile,
  updateWorkspaceClientSdrProfile,
  linkWorkspaceClientProspect,
  type WorkspaceClientDetail as WorkspaceClientDetailData,
} from '@/services/clients'
import { getWorkspaceProspects } from '@/services/prospectDashboards'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clients', () => ({
  setWorkspaceClientSdrMode: vi.fn(),
  saveWorkspaceClientBooking: vi.fn(),
  deleteWorkspaceClientBooking: vi.fn(),
  generatePassword: vi.fn(() => 'Generated-Portal-42!'),
  getWorkspaceClientDetail: vi.fn(),
  setWorkspaceClientPassword: vi.fn(),
  updateWorkspaceClient: vi.fn(),
  updateWorkspaceClientProfile: vi.fn(),
  updateWorkspaceClientSdrProfile: vi.fn(),
  draftWorkspaceClientSdrProfile: vi.fn(),
  linkWorkspaceClientProspect: vi.fn(),
  rotateWorkspaceClientDashboardSlug: vi.fn(),
}))
vi.mock('@/services/prospectDashboards', () => ({
  getWorkspaceProspects: vi.fn().mockResolvedValue({ dashboards: [] }),
}))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))
vi.mock('@/components/workspace/ClientInstantlyCampaignsCard', () => ({
  ClientInstantlyCampaignsCard: () => <div>Instantly campaign links</div>,
}))
vi.mock('@/components/workspace/ClientBookingDialog', () => ({
  ClientBookingDialog: () => <div>Booking dialog</div>,
}))
vi.mock('@/components/workspace/ClientSdrPromptsCard', () => ({
  ClientSdrPromptsCard: () => <div>Client reply instructions</div>,
}))
vi.mock('@/components/workspace/ClientShortlistEditor', () => ({
  ClientShortlistEditor: () => <section id="client-podcast-list">Client podcast editor</section>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedSetPortalPassword = vi.mocked(setWorkspaceClientPassword)
const mockedUpdateClient = vi.mocked(updateWorkspaceClient)
const mockedUpdateProfile = vi.mocked(updateWorkspaceClientProfile)
const mockedUpdateSdrProfile = vi.mocked(updateWorkspaceClientSdrProfile)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const onboardingId = '33333333-3333-4333-8333-333333333333'

const detail: WorkspaceClientDetailData = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    slug: 'acme-workspace',
    status: 'active',
    is_default: false,
    logo_path: null,
    logo_updated_at: null,
  },
  viewer_role: 'owner',
  can_manage: true,
  client: {
    id: clientId,
    workspace_id: workspaceId,
    name: 'Taylor Client',
    email: 'taylor@example.com',
    contact_person: 'Taylor Smith',
    linkedin_url: 'https://linkedin.com/in/taylor',
    website: 'https://taylor.example.com',
    calendar_link: null,
    status: 'active',
    notes: 'High-priority launch in September.',
    bio: 'Taylor helps founders build durable operations.',
    ai_sdr_profile: {
      positioning: 'Taylor is an operations leader who helps growth-stage founders build durable companies.',
      topics_and_angles: 'Sustainable scale, founder leverage, and the operator systems behind durable growth.',
      listener_takeaways: 'A practical framework for diagnosing and fixing the bottleneck behind stalled growth.',
      proof_points: 'Approved operating case studies and media kit only.',
      ideal_opportunities: 'Founder and operations podcasts for growth-stage teams.',
      booking_details: 'Remote interviews preferred. Route sponsorships and unclear scheduling to a human.',
    },
    ai_sdr_profile_updated_at: '2026-07-23T01:00:00.000Z',
    ai_sdr_readiness: {
      ready: true,
      completed_fields: 6,
      total_fields: 6,
      missing_fields: [],
      missing_core_fields: [],
    },
    photo_url: null,
    media_kit_url: 'https://docs.google.com/document/d/example',
    prospect_dashboard_slug: null,
    dashboard_slug: 'taylor-client-123',
    dashboard_enabled: true,
    portal_access_enabled: true,
    portal_last_login_at: '2026-07-22T00:00:00.000Z',
    password_set_at: '2026-07-20T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  },
  dashboard: {
    configured: true,
    enabled: true,
    tagline: 'Podcasts selected for Taylor’s operating expertise.',
    view_count: 14,
    last_viewed_at: '2026-07-22T12:00:00.000Z',
    podcast_count: 12,
    reviewed_count: 8,
    approved_count: 5,
    rejected_count: 3,
    to_review_count: 4,
    analyzed_count: 10,
    last_synced_at: '2026-07-23T08:00:00.000Z',
    last_feedback_at: '2026-07-22T12:00:00.000Z',
  },
  outreach: {
    initial_emails_sent: 43,
    podcasts_contacted: 31,
    pending_review_count: 7,
    approved_count: 4,
    failed_count: 1,
    last_sent_at: '2026-07-23T09:00:00.000Z',
  },
  bookings: [
    {
      id: 'booking-one',
      client_id: clientId,
      podcast_id: 'podcast-one',
      podcast_name: 'Founder Stories',
      podcast_url: 'https://podcasts.example.com/founder-stories',
      host_name: 'Morgan Host',
      scheduled_date: '2099-09-12',
      recording_date: null,
      publish_date: null,
      status: 'booked',
      episode_url: null,
      prep_sent: false,
      notes: null,
      created_at: '2026-07-22T00:00:00.000Z',
      updated_at: '2026-07-22T00:00:00.000Z',
    },
    {
      id: 'booking-two',
      client_id: clientId,
      podcast_id: 'podcast-two',
      podcast_name: 'Operator Weekly',
      podcast_url: null,
      host_name: null,
      scheduled_date: '2026-06-01',
      recording_date: '2026-06-01',
      publish_date: '2099-10-01',
      status: 'recorded',
      episode_url: null,
      prep_sent: true,
      notes: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ],
  onboarding: {
    id: onboardingId,
    workspace_id: workspaceId,
    client_id: clientId,
    recipient_name: 'Taylor Smith',
    recipient_email: 'taylor@example.com',
    status: 'approved',
    invited_at: '2026-07-01T00:00:00.000Z',
    started_at: '2026-07-01T00:00:00.000Z',
    submitted_at: '2026-07-02T00:00:00.000Z',
    approved_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    archived_at: null,
  },
}

function renderPage(path = `/app/clients/${clientId}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/app/clients/:clientId" element={<WorkspaceClientDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceClientDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace', is_default: false },
      membership: { role: 'owner', full_name: 'Workspace Owner' },
      isPlatformAdmin: false,
      signOut: vi.fn(),
    } as never)
    mockedDetail.mockResolvedValue(detail)
    mockedSetPortalPassword.mockResolvedValue(undefined)
    mockedUpdateClient.mockResolvedValue(detail.client)
    mockedUpdateSdrProfile.mockResolvedValue({
      id: clientId,
      workspace_id: workspaceId,
      ai_sdr_profile: {
        ...detail.client.ai_sdr_profile,
        positioning: detail.client.ai_sdr_profile.positioning || '',
        topics_and_angles: detail.client.ai_sdr_profile.topics_and_angles || '',
        listener_takeaways: 'Listeners leave with a repeatable operating-system audit.',
        proof_points: detail.client.ai_sdr_profile.proof_points || '',
        ideal_opportunities: detail.client.ai_sdr_profile.ideal_opportunities || '',
        booking_details: detail.client.ai_sdr_profile.booking_details || '',
      },
      ai_sdr_profile_updated_at: '2026-07-24T00:00:00.000Z',
      ai_sdr_readiness: detail.client.ai_sdr_readiness,
    })
  })

  it('rebuilds the legacy client command center inside the workspace shell', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.getByText('Client command center · Acme Workspace')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Podcast Finder' }).find((link) => (
      link.getAttribute('href')?.includes(`client=${clientId}`)
    ))).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)
    expect(screen.getAllByRole('link', { name: 'Onboarding' }).find((link) => (
      link.getAttribute('href')?.includes(`client=${clientId}`)
    ))).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(screen.getByRole('link', { name: 'Client Campaign' })).toHaveAttribute(
      'href',
      `/app/client-campaigns/${clientId}`,
    )
    expect(screen.getByRole('link', { name: 'Command Center' })).toHaveAttribute(
      'href',
      `/app/client-podcast-system?client=${clientId}`,
    )
    const progress = screen.getByRole('heading', { name: 'Campaign snapshot' }).closest('section')
    expect(progress).not.toBeNull()
    expect(within(progress as HTMLElement).getByText('Booked').nextElementSibling).toHaveTextContent('1')
    expect(within(progress as HTMLElement).getByText('Recorded').nextElementSibling).toHaveTextContent('1')
    const outreach = screen.getByRole('heading', { name: 'Outreach activity' }).closest('section')
    expect(outreach).not.toBeNull()
    expect(within(outreach as HTMLElement).getByText('Initial emails sent').nextElementSibling).toHaveTextContent('43')
    expect(within(outreach as HTMLElement).getByText('Podcasts contacted').nextElementSibling).toHaveTextContent('31')
    expect(within(outreach as HTMLElement).getByText('Awaiting review').nextElementSibling).toHaveTextContent('7')
    expect(screen.getByRole('heading', { name: 'Upcoming recordings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming episode releases' })).toBeInTheDocument()
    expect(screen.getByText('Goes live Oct 1, 2099')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approval dashboard' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Podcast approval dashboard' })).toBeInTheDocument()
    expect(screen.getAllByText('Podcasts selected for Taylor’s operating expertise.')).toHaveLength(1)
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view & edit podcasts/i })).toHaveAttribute('href', '#client-podcast-list')
    expect(screen.getByText('Client podcast editor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /preview as client/i })).toHaveAttribute('href', '/client/taylor-client-123?preview=1')
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
    expect(screen.getByText('Positive').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Negative').nextElementSibling).toHaveTextContent('3')
    expect(screen.getByText('To review').nextElementSibling).toHaveTextContent('4')
    expect(screen.queryByRole('heading', { name: 'Review completion' })).not.toBeInTheDocument()
    expect(screen.queryByText('AI fit insights ready')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Client engagement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard setup' })).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Client portal' }), { button: 0 })
    expect(screen.queryByRole('heading', { name: 'Client portal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open portal login/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('taylor@example.com').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { name: 'Upcoming recordings' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { name: 'Upcoming episode releases' }).length).toBeGreaterThan(0)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Podcast activity' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Podcast activity' })).toBeInTheDocument()
    expect(screen.getByText('Founder Stories')).toBeInTheDocument()
    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding & files' }), { button: 0 })
    expect(screen.getByRole('link', { name: 'Review onboarding' })).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.getByText('Taylor helps founders build durable operations.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View full profile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reorder sidebar pages' })).toBeInTheDocument()
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
  })

  it('gives one client their own calendar, built from the bookings already loaded', async () => {
    renderPage(`/app/clients/${clientId}?tab=calendar`)

    expect(await screen.findByRole('tab', { name: 'Calendar' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('grid', { name: 'Client activity calendar' })).toBeInTheDocument()
    // Every entry is this client, so the client filter is not offered.
    expect(screen.queryByLabelText('Filter by client')).not.toBeInTheDocument()
    // A booking with only a scheduled date still lands on the calendar.
    expect(screen.getByText(/Founder Stories/)).toBeInTheDocument()
    // No extra request: the page's own bookings feed it.
    expect(mockedDetail).toHaveBeenCalledTimes(1)
  })

  it('edits each client-scoped AI SDR section in a focused modal for Master Inbox', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AI SDR Profile' }), { button: 0 })

    expect(screen.getByRole('heading', { name: 'Taylor Client AI SDR Profile' })).toBeInTheDocument()
    expect(screen.getByText('Context ready')).toBeInTheDocument()
    expect(screen.getByText('A practical framework for diagnosing and fixing the bottleneck behind stalled growth.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Master Inbox' })).toHaveAttribute(
      'href',
      `/app/master-inbox?client=${clientId}`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Listener value & takeaways' }))
    const editor = screen.getByRole('dialog', { name: 'Edit Listener value & takeaways' })
    expect(within(editor).getByText('Section 3 of 6')).toBeInTheDocument()
    expect(within(editor).getAllByRole('textbox')).toHaveLength(1)
    const takeaways = within(editor).getByLabelText('Listener value & takeaways')
    fireEvent.change(takeaways, { target: { value: 'Listeners leave with a repeatable operating-system audit.' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save section' }))

    await waitFor(() => expect(mockedUpdateSdrProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      expect.objectContaining({ listener_takeaways: 'Listeners leave with a repeatable operating-system audit.' }),
      '2026-07-23T01:00:00.000Z',
    ))
  })

  it('opens directly to the AI SDR profile from its stable client deep link', async () => {
    renderPage(`/app/clients/${clientId}?tab=ai-sdr`)

    expect(await screen.findByRole('heading', { name: 'Taylor Client AI SDR Profile' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'AI SDR Profile' })).toHaveAttribute('data-state', 'active')
    expect(screen.queryByRole('heading', { name: 'Campaign snapshot' })).not.toBeInTheDocument()
  })

  it('keeps AI SDR profile editing manager-only', async () => {
    mockedDetail.mockResolvedValueOnce({ ...detail, viewer_role: 'member', can_manage: false })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AI SDR Profile' }), { button: 0 })

    expect(screen.getByText('Sustainable scale, founder leverage, and the operator systems behind durable growth.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Guest positioning' })).not.toBeInTheDocument()
  })

  it('keeps long approved profiles compact until the full profile is opened', async () => {
    const longProfile = [
      'PODCAST OUTREACH STRATEGY FOR TAYLOR CLIENT',
      'EXECUTIVE SUMMARY',
      'Taylor helps founders build durable operations and repeatable growth systems. '.repeat(12),
      'FINAL APPROVED TOPIC: The operator playbook for sustainable scale.',
    ].join('\n\n')
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: { ...detail.client, bio: longProfile },
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding & files' }), { button: 0 })

    expect(screen.queryByText(/FINAL APPROVED TOPIC/)).not.toBeInTheDocument()
    expect(screen.getByText(/PODCAST OUTREACH STRATEGY FOR TAYLOR CLIENT/)).toHaveTextContent(/…$/)

    fireEvent.click(screen.getByRole('button', { name: 'View full profile' }))
    const profileDialog = screen.getByRole('dialog', { name: 'Approved client profile' })
    expect(within(profileDialog).getByText(/FINAL APPROVED TOPIC/)).toBeInTheDocument()

    fireEvent.click(within(profileDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Approved client profile' })).not.toBeInTheDocument())
  })

  it('lets a workspace manager edit the approved profile where it is used', async () => {
    mockedUpdateProfile.mockResolvedValue({
      id: clientId,
      workspace_id: workspaceId,
      bio: 'Taylor helps operational leaders turn complexity into durable growth.',
      updated_at: '2026-07-24T00:00:00.000Z',
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding & files' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    const editor = screen.getByRole('dialog', { name: 'Edit approved client profile' })
    const profile = within(editor).getByLabelText('Approved client profile')
    expect(profile).toHaveValue('Taylor helps founders build durable operations.')
    expect(within(editor).getByText(/6 words · 47 \/ 20,000 characters/i)).toBeInTheDocument()

    fireEvent.change(profile, {
      target: { value: 'Taylor helps operational leaders turn complexity into durable growth.' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'Taylor helps operational leaders turn complexity into durable growth.',
      '2026-07-23T00:00:00.000Z',
    ))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit approved client profile' })).not.toBeInTheDocument())
  })

  it('keeps approved profile editing manager-only', async () => {
    mockedDetail.mockResolvedValueOnce({ ...detail, viewer_role: 'member', can_manage: false })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding & files' }), { button: 0 })

    expect(screen.getByRole('button', { name: 'View full profile' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument()
    expect(mockedUpdateProfile).not.toHaveBeenCalled()
  })

  it('treats every configured approval dashboard as live even for a legacy disabled row', async () => {
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: { ...detail.client, dashboard_enabled: false },
      dashboard: {
        ...detail.dashboard,
        enabled: false,
        podcast_count: 0,
        reviewed_count: 0,
        approved_count: 0,
        rejected_count: 0,
        to_review_count: 0,
        analyzed_count: 0,
        last_synced_at: null,
        last_feedback_at: null,
      },
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approval dashboard' }), { button: 0 })

    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not shared')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /preview as client/i })).toHaveAttribute('href', '/client/taylor-client-123?preview=1')
    expect(screen.getByText('Client podcast editor')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Review completion' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /run fresh discovery/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make dashboard live' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
  })

  it('edits internal account notes without leaving the client command center', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Onboarding & files' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }))
    fireEvent.change(screen.getByLabelText('Internal account notes'), {
      target: { value: 'Prefers concise prep notes and Thursday recordings.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }))

    await waitFor(() => expect(mockedUpdateClient).toHaveBeenCalledWith(workspaceId, clientId, {
      name: 'Taylor Client',
      email: 'taylor@example.com',
      contact_person: 'Taylor Smith',
      linkedin_url: 'https://linkedin.com/in/taylor',
      website: 'https://taylor.example.com',
      status: 'active',
      notes: 'Prefers concise prep notes and Thursday recordings.',
    }))
    await waitFor(() => expect(screen.queryByLabelText('Internal account notes')).not.toBeInTheDocument())
  })

  it('lets the workspace owner set and reveal a client portal password once', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Client portal' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Change portal password' }))
    const editor = screen.getByRole('dialog', { name: 'Change portal password' })
    expect(within(editor).getByLabelText('New password')).toHaveValue('Generated-Portal-42!')
    expect(within(editor).getByLabelText('Confirm password')).toHaveValue('Generated-Portal-42!')
    fireEvent.click(within(editor).getByRole('button', { name: 'Save new password' }))

    await waitFor(() => expect(mockedSetPortalPassword).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'Generated-Portal-42!',
    ))
    const receipt = await screen.findByRole('dialog', { name: 'Save the client portal password' })
    expect(within(receipt).getByLabelText('Portal password')).toHaveValue('Generated-Portal-42!')
    expect(within(receipt).getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.click(within(receipt).getByLabelText('I saved this password in a secure place.'))
    fireEvent.click(within(receipt).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save the client portal password' })).not.toBeInTheDocument())
  })

  it('keeps client portal password controls owner-only', async () => {
    mockedDetail.mockResolvedValue({ ...detail, viewer_role: 'admin', can_manage: true })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Client portal' }), { button: 0 })

    expect(screen.queryByRole('button', { name: 'Change portal password' })).not.toBeInTheDocument()
    expect(screen.getByText('Only the workspace owner can manage client portal passwords.')).toBeInTheDocument()
  })

  it('links a prospect page from a searchable list instead of leaving a dead end', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({
      dashboards: [
        { slug: 'prospect-aaa', prospect_name: 'Andre Daughty', prospect_company: 'Daughty Media', prospect_email: 'andre@example.com' },
        { slug: 'prospect-bbb', prospect_name: 'Kari Yasi', prospect_company: null, prospect_email: 'kari@example.com' },
      ],
    } as never)
    vi.mocked(linkWorkspaceClientProspect).mockResolvedValue('prospect-bbb')
    renderPage()

    // The prospect link lives on the Files tab, not the default one.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Files/i }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))
    expect(await screen.findByText('Andre Daughty')).toBeInTheDocument()
    expect(screen.getByText('Kari Yasi')).toBeInTheDocument()

    // The search narrows the list rather than making the operator scan 26 pages.
    fireEvent.change(screen.getByLabelText('Search prospect pages'), { target: { value: 'kari' } })
    expect(screen.queryByText('Andre Daughty')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Kari Yasi'))
    await waitFor(() => expect(linkWorkspaceClientProspect).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'prospect-bbb',
    ))
  })

  it('shows every match rather than truncating the list', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({
      dashboards: Array.from({ length: 40 }, (_value, index) => ({
        slug: `prospect-${index}`,
        prospect_name: `Prospect ${index}`,
        prospect_company: null,
        prospect_email: null,
      })),
    } as never)
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Files/i }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))

    // The 26th onwards used to be unreachable behind a "narrow the search" note.
    expect(await screen.findByText('Prospect 39')).toBeInTheDocument()
    expect(screen.getByText('40 pages available')).toBeInTheDocument()
  })

  it('explains an empty prospect list rather than showing a blank picker', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({ dashboards: [] } as never)
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Files/i }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))
    expect(await screen.findByText('No prospect pages yet')).toBeInTheDocument()
    expect(screen.getByText(/built in Prospect Studio before a client signs/i)).toBeInTheDocument()
  })

  it('fails closed before requesting a malformed client address', async () => {
    renderPage('/app/clients/not-a-client')
    expect(await screen.findByRole('heading', { name: 'Client unavailable' })).toBeInTheDocument()
    expect(screen.getByText('The client address is invalid.')).toBeInTheDocument()
    expect(mockedDetail).not.toHaveBeenCalled()
  })
})
