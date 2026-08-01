import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceRelationships from '@/pages/app/WorkspaceRelationships'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import {
  addHostRelationshipNote,
  createHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationships,
  saveHostRelationship,
  type HostRelationshipDetail,
  type HostRelationshipSummary,
} from '@/services/hostRelationships'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({
    children,
    platformWorkspace,
  }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref?: string }
  }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref}>{children}</div>,
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({
  addHostRelationshipNote: vi.fn(),
  createHostRelationship: vi.fn(),
  getHostRelationship: vi.fn(),
  linkHostRelationshipClient: vi.fn(),
  listHostRelationships: vi.fn(),
  saveHostRelationship: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedAdminWorkspace = vi.mocked(getAdminWorkspaceView)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedList = vi.mocked(listHostRelationships)
const mockedDetail = vi.mocked(getHostRelationship)
const mockedSave = vi.mocked(saveHostRelationship)
const mockedAddNote = vi.mocked(addHostRelationshipNote)
const mockedCreate = vi.mocked(createHostRelationship)
const mockedLinkClient = vi.mocked(linkHostRelationshipClient)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const platformWorkspaceId = '99999999-9999-4999-8999-999999999999'
const clientId = '22222222-2222-4222-8222-222222222222'

const relationship: HostRelationshipSummary = {
  podcast_id: 'show-one',
  podcast_name: 'Founder &amp; Operator',
  podcast_image_url: 'https://cdn.example.com/founder-operator.jpg',
  host_name: 'Morgan Host',
  contact_email: 'morgan@example.com',
  derived_state: 'replied',
  manual_stage: null,
  summary: 'Prefers practical operator stories.',
  last_contacted_at: '2026-07-20T12:00:00.000Z',
  touch_count: 1,
  booked_client_name: null,
  client_count: 1,
  note_count: 1,
  last_note_at: '2026-07-21T12:00:00.000Z',
  curated: true,
}

const detail: HostRelationshipDetail = {
  relationship: {
    podcast_id: 'show-one',
    podcast_name: 'Founder & Operator',
    host_name: 'Morgan Host',
    contact_email: 'morgan@example.com',
    manual_stage: null,
    summary: 'Prefers practical operator stories.',
    updated_at: '2026-07-21T12:00:00.000Z',
  },
  derived: { state: 'replied', last_client_name: 'Taylor Client', booked_client_name: null },
  clients: [{
    client_id: clientId,
    client_name: 'Taylor Client',
    intent: 'pitched',
    note: null,
    created_at: '2026-07-20T12:00:00.000Z',
  }],
  events: [{
    id: 'event-one',
    client_id: clientId,
    kind: 'note',
    body: 'Asked for a tighter angle next time.',
    occurred_at: '2026-07-21T12:00:00.000Z',
  }],
  threads: [{
    thread_key: 'thread-one',
    client_id: clientId,
    client_name: 'Taylor Client',
    provider: 'instantly',
    latest_message_id: 'message-one',
    subject: 'Re: operator systems',
    lead_email: 'morgan@example.com',
    from_email: 'morgan@example.com',
    to_email: 'sdr@example.com',
    latest_message_body: 'Interested in revisiting this in Q3.',
    latest_message_at: '2026-07-21T12:00:00.000Z',
    campaign_id: 'campaign-one',
    campaign_name: 'Taylor outreach',
    created_at: '2026-07-21T12:00:00.000Z',
    updated_at: '2026-07-21T12:00:00.000Z',
  }],
}

function renderPage(props: { platformWorkspaceId?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/relationships']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceRelationships {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceRelationships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
    } as never)
    mockedList.mockResolvedValue([relationship])
    mockedDetail.mockResolvedValue(detail)
    mockedClients.mockResolvedValue([
      { id: clientId, name: 'Taylor Client', status: 'active' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Jordan Client', status: 'active' },
    ] as never)
    mockedSave.mockResolvedValue(undefined)
    mockedAddNote.mockResolvedValue(undefined)
    mockedLinkClient.mockResolvedValue(undefined)
    mockedCreate.mockResolvedValue({ podcast_id: 'manual-relationship-one', created: true })
    mockedAdminWorkspace.mockResolvedValue({
      workspace: {
        id: platformWorkspaceId,
        name: 'Selected Agency',
        slug: 'selected-agency',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer: { workspace_id: platformWorkspaceId, email: 'owner@example.com', full_name: 'Owner', role: 'owner' },
      clients: [],
    })
  })

  it('lets a manager curate the stage, timeline, and client plan', async () => {
    renderPage()

    expect(await screen.findByText('Founder & Operator')).toBeInTheDocument()
    expect(screen.getByText('Replied')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    const summary = await screen.findByLabelText('What we know about this host')
    fireEvent.change(summary, { target: { value: 'Warm, direct, and prefers concise pitches.' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Relationship stage' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Warm relationship' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save relationship' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      summary: 'Warm, direct, and prefers concise pitches.',
      manualStage: 'warm',
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Interaction type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Call' }))
    fireEvent.change(screen.getByLabelText('Add an internal note'), { target: { value: 'Call went well.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log call' }))
    await waitFor(() => expect(mockedAddNote).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      body: 'Call went well.',
      kind: 'call',
    }))

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Overview' }), { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('combobox', { name: 'Choose a client' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Jordan Client' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save client' }))
    await waitFor(() => expect(mockedLinkClient).toHaveBeenCalledWith(workspaceId, {
      podcastId: 'show-one',
      clientId: '33333333-3333-4333-8333-333333333333',
      intent: 'considering',
    }))
    expect(screen.getByText('Re: operator systems')).toBeInTheDocument()
    expect(screen.getByText('Interested in revisiting this in Q3.')).toBeInTheDocument()
  })

  it('works as a simple owner CRM with artwork, fast search, threads, and one activity log', async () => {
    renderPage()

    expect(await screen.findByRole('img', { name: 'Founder & Operator cover' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/founder-operator.jpg',
    )
    fireEvent.change(screen.getByLabelText('Search relationships'), { target: { value: 'morgan@example.com' } })
    expect(screen.getByText('Founder & Operator')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Notes 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Threads 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Activity 2' })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Threads 1' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('Re: operator systems')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Activity 2' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('Activity log')).toBeInTheDocument()
    expect(screen.getByText('Internal note added')).toBeInTheDocument()
    expect(screen.getByText('Interested in revisiting this in Q3.')).toBeInTheDocument()
  })

  // The header counted live conversations; which of them had gone silent —
  // the actionable fact — was invisible, buried by the recency sort.
  it('surfaces live conversations going quiet, longest silence first', async () => {
    const quietDate = new Date(Date.now() - 8 * 86_400_000).toISOString()
    mockedList.mockResolvedValue([
      { ...relationship, podcast_id: 'show-quiet', podcast_name: 'Gone Quiet FM', derived_state: 'in_conversation', last_contacted_at: quietDate },
      { ...relationship, podcast_id: 'show-fresh', podcast_name: 'Fresh Talk', derived_state: 'in_conversation', last_contacted_at: new Date().toISOString() },
      relationship,
    ])
    renderPage()

    expect(await screen.findByText('A live conversation is going quiet')).toBeInTheDocument()
    const chip = screen.getByRole('button', { name: /Gone Quiet FM.*quiet 8d/ })
    expect(chip).toBeInTheDocument()
    // A conversation touched today is unhurried, not stalled.
    expect(screen.queryByRole('button', { name: /Fresh Talk.*quiet/ })).not.toBeInTheDocument()

    // The chip opens the relationship rather than leaving the operator to find
    // it at the bottom of a recency-sorted list.
    fireEvent.click(chip)
    expect(await screen.findByRole('heading', { name: 'Gone Quiet FM' })).toBeInTheDocument()
  })

  it('lets a manager add a relationship before outreach exists', async () => {
    renderPage()
    await screen.findByText('Founder & Operator')

    fireEvent.click(screen.getByRole('button', { name: 'Add relationship' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Podcast or show'), { target: { value: 'The Operator Room' } })
    fireEvent.change(within(dialog).getByLabelText('Host name'), { target: { value: 'Alex Host' } })
    fireEvent.change(within(dialog).getByLabelText('Host email'), { target: { value: 'alex@example.com' } })
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Relationship stage' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Warm relationship' }))
    fireEvent.change(within(dialog).getByLabelText('What should the team remember?'), {
      target: { value: 'Met at the operator summit.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add relationship' }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(workspaceId, {
      podcastName: 'The Operator Room',
      hostName: 'Alex Host',
      contactEmail: 'alex@example.com',
      manualStage: 'warm',
      summary: 'Met at the operator summit.',
    }))
  })

  it('pages a growing relationship book and resets pagination for search', async () => {
    mockedList.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({
      ...relationship,
      podcast_id: `show-${index + 1}`,
      podcast_name: `Relationship Show ${String(index + 1).padStart(2, '0')}`,
      host_name: `Host ${index + 1}`,
      contact_email: `host-${index + 1}@example.com`,
    })))

    renderPage()

    expect(await screen.findByText('Relationship Show 01')).toBeInTheDocument()
    expect(screen.getByText('Relationship Show 25')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 26')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–25 of 30 relationships')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Relationship Show 26')).toBeInTheDocument()
    expect(screen.queryByText('Relationship Show 01')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 26–30 of 30 relationships')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search relationships'), { target: { value: 'Show 01' } })
    expect(screen.getByText('Relationship Show 01')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Relationship pagination' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sort relationships')).toBeInTheDocument()
  })

  it('gives ordinary members relationship context without mutation controls', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
    } as never)

    renderPage()
    await screen.findByText('Founder & Operator')
    expect(screen.getByText(/owners and admins curate stages/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(await screen.findByText('Prefers practical operator stories.')).toBeInTheDocument()
    expect(screen.getByText('Asked for a tighter angle next time.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save relationship' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add relationship' })).not.toBeInTheDocument()
    expect(mockedClients).not.toHaveBeenCalled()
  })

  it('keeps platform admins inside the explicitly selected workspace shell', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
    } as never)

    renderPage({ platformWorkspaceId })

    expect(await screen.findByText('Founder & Operator')).toBeInTheDocument()
    expect(mockedAdminWorkspace).toHaveBeenCalledWith(platformWorkspaceId, expect.any(AbortSignal))
    expect(mockedList).toHaveBeenCalledWith(platformWorkspaceId)
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute(
      'data-base-href',
      `/app/workspaces/${platformWorkspaceId}`,
    )
  })

  it('separates an unreachable cover from a show that has no name yet', async () => {
    mockedList.mockResolvedValue([
      relationship,
      {
        ...relationship,
        podcast_id: 'manual-unknown',
        podcast_name: null,
        podcast_image_url: null,
        contact_email: 'unknown-host@example.com',
      },
    ])

    renderPage()

    // A show can take its artwork private long after the feed keeps pointing
    // there, so the tile must degrade to a deliberate stand-in rather than the
    // browser's broken-image glyph.
    const cover = await screen.findByRole('img', { name: 'Founder & Operator cover' })
    fireEvent.error(cover)
    await waitFor(() => {
      expect(screen.queryByRole('img', { name: 'Founder & Operator cover' })).not.toBeInTheDocument()
    })
    expect(screen.getByTitle('Founder & Operator — cover art unavailable')).toBeInTheDocument()

    // An unnamed row is a different job for the operator and has to say so
    // rather than looking like one more show whose art failed to load.
    expect(screen.getByTitle('Show not identified yet')).toBeInTheDocument()
  })
})
