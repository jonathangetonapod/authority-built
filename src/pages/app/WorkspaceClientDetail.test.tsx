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
  type WorkspaceClientDetail as WorkspaceClientDetailData,
} from '@/services/clients'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clients', () => ({
  generatePassword: vi.fn(() => 'Generated-Portal-42!'),
  getWorkspaceClientDetail: vi.fn(),
  setWorkspaceClientPassword: vi.fn(),
  updateWorkspaceClient: vi.fn(),
}))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))
vi.mock('@/components/workspace/ClientShortlistEditor', () => ({
  ClientShortlistEditor: () => <section id="client-podcast-list">Client podcast editor</section>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedSetPortalPassword = vi.mocked(setWorkspaceClientPassword)
const mockedUpdateClient = vi.mocked(updateWorkspaceClient)
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
    expect(screen.getByRole('heading', { name: 'Client portal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open portal login/i })).toHaveAttribute('href', '/portal/login')
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

  it('fails closed before requesting a malformed client address', async () => {
    renderPage('/app/clients/not-a-client')
    expect(await screen.findByRole('heading', { name: 'Client unavailable' })).toBeInTheDocument()
    expect(screen.getByText('The client address is invalid.')).toBeInTheDocument()
    expect(mockedDetail).not.toHaveBeenCalled()
  })
})
