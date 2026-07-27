import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientShortlistEditor } from '@/components/workspace/ClientShortlistEditor'
import {
  addClientShortlistPodcasts,
  ensureClientShortlistEpisodes,
  generateClientShortlistPitch,
  getClientAutopilot,
  getClientShortlist,
  getClientShortlistResearchDocument,
  runClientShortlistEmailSearch,
  runClientShortlistResearch,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
  type ClientShortlistPodcast,
} from '@/services/clientShortlist'
import { getWorkspaceCampaign, getWorkspaceResearchPromptOverrides, prepareWorkspaceCampaignPodcast } from '@/services/workspaceCampaigns'

vi.mock('@/services/clientShortlist', () => ({
  addClientShortlistPodcasts: vi.fn(),
  ensureClientShortlistEpisodes: vi.fn().mockResolvedValue({ episodes: [], last_posted_at: null, episodes_fetched_at: null }),
  generateClientShortlistPitch: vi.fn(),
  getClientShortlistResearchDocument: vi.fn(),
  getClientAutopilot: vi.fn(),
  setClientAutopilot: vi.fn(),
  getClientShortlist: vi.fn(),
  runClientShortlistEmailSearch: vi.fn(),
  runClientShortlistResearch: vi.fn(),
  searchClientPodcastCatalog: vi.fn(),
  updateClientShortlistPodcast: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
  prepareWorkspaceCampaignPodcast: vi.fn(),
  getWorkspaceResearchPromptOverrides: vi.fn().mockResolvedValue({}),
  setWorkspaceResearchPrompt: vi.fn().mockResolvedValue(undefined),
  resetWorkspaceResearchPrompt: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

function podcast(overrides: Partial<ClientShortlistPodcast> = {}): ClientShortlistPodcast {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    client_id: clientId,
    podcast_id: 'podcast-one',
    podcast_name: 'Founder Stories',
    podcast_description: 'Conversations with company builders.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/founder-stories',
    publisher_name: 'Example Media',
    itunes_rating: 4.8,
    episode_count: 120,
    audience_size: 24_000,
    last_posted_at: '2026-07-20T00:00:00.000Z',
    podcast_categories: [
      { category_id: 'business', category_name: 'Business' },
      { category_id: 'entrepreneurship', category_name: 'Entrepreneurship' },
    ],
    podcast_email: 'hello@founderstories.fm',
    ai_clean_description: null,
    ai_fit_reasons: null,
    ai_pitch_angles: null,
    ai_analyzed_at: '2026-07-21T00:00:00.000Z',
    // Legacy ai_analyzed_at alone no longer unlocks the pitch flow — the
    // fixture must have completed the real prompt pipeline.
    research_progress: {
      status: 'completed',
      current_stage: null,
      completed_stages: ['podcast_profile', 'recent_episodes', 'host_profile', 'guest_patterns', 'guest_fit', 'pitch_angles'],
      started_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:02:00.000Z',
    },
    visibility: 'visible',
    display_order: 0,
    is_featured: true,
    featured_order: 0,
    operator_notes: null,
    archived_at: null,
    feedback_status: 'approved',
    feedback_notes: 'This one looks great.',
    feedback_updated_at: '2026-07-22T00:00:00.000Z',
    prior_outreach_at: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

function renderEditor(viewerRole: 'owner' | 'admin' | 'member' | 'platform_admin' = 'owner') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClientShortlistEditor
          workspaceId={workspaceId}
          clientId={clientId}
          clientName="Taylor Client"
          clientBio="Taylor helps founders turn complicated ideas into practical growth systems."
          viewerRole={viewerRole}
          databaseHref={`/app/podcast-database?client=${clientId}`}
          finderHref={`/app/podcast-finder?client=${clientId}`}
          campaignHref={`/app/client-campaigns/${clientId}`}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClientShortlistEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ensureClientShortlistEpisodes).mockResolvedValue({ episodes: [], last_posted_at: null, episodes_fetched_at: null })
    vi.mocked(getWorkspaceResearchPromptOverrides).mockResolvedValue({})
    // Research and email searches stay pending so tests can assert the in-flight UI.
    vi.mocked(runClientShortlistResearch).mockImplementation(() => new Promise(() => {}))
    vi.mocked(runClientShortlistEmailSearch).mockImplementation(() => new Promise(() => {}))
    vi.mocked(generateClientShortlistPitch).mockResolvedValue({
      subject: 'Research-backed pitch subject',
      body: 'Research-backed pitch body',
    } as never)
    vi.mocked(getClientShortlistResearchDocument).mockResolvedValue(null)
    vi.mocked(getClientAutopilot).mockResolvedValue(null)
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [
        podcast(),
        podcast({
          id: '44444444-4444-4444-8444-444444444444',
          podcast_id: 'podcast-two',
          podcast_name: 'Operator Weekly',
          feedback_status: null,
          feedback_notes: null,
          is_featured: false,
          featured_order: null,
          display_order: 1,
        }),
        podcast({
          id: '55555555-5555-4555-8555-555555555555',
          podcast_id: 'podcast-archived',
          podcast_name: 'Archived Show',
          visibility: 'archived',
          feedback_status: 'rejected',
          feedback_notes: null,
          is_featured: false,
          featured_order: null,
          display_order: 2,
          archived_at: '2026-07-23T00:00:00.000Z',
        }),
      ],
    })
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([])
    vi.mocked(addClientShortlistPodcasts).mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['podcast-new'] })
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast())
    vi.mocked(getWorkspaceCampaign).mockResolvedValue({
      integration: {} as never,
      can_manage_campaigns: true,
      campaign: {
        id: 'campaign-one',
        name: 'Taylor Client Podcast Outreach',
        instantly_campaign_id: '77777777-7777-4777-8777-777777777777',
      } as never,
      targets: [],
    })
    vi.mocked(prepareWorkspaceCampaignPodcast).mockResolvedValue({
      added: true,
      campaign: { name: 'Taylor Client Podcast Outreach' } as never,
      target: {} as never,
    })
  })

  it('shows the client-visible list, feedback, featured order, and archived dedupe history', async () => {
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Client podcast list' })).toBeInTheDocument()
    expect(screen.getAllByText('Founder Stories').length).toBeGreaterThan(0)
    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.getByText('This one looks great.', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Founder Stories is featured')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured recommendations' })).not.toBeInTheDocument()
    expect(screen.getByText('/ 6', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Archived Show')).not.toBeInTheDocument()
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Hidden\b/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse database' })).toHaveAttribute(
      'href',
      `/app/podcast-database?client=${clientId}`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(screen.getByLabelText('Internal notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Archived 1' }))
    expect(screen.getByText('Archived Show')).toBeInTheDocument()
    expect(screen.getAllByText('Archived', { exact: true }).length).toBeGreaterThan(0)
  })

  it('hides the empty featured panel and keeps featuring in the actions menu', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ is_featured: false, featured_order: null })],
    })
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'All podcasts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured recommendations' })).not.toBeInTheDocument()
    const actions = screen.getByRole('button', { name: 'Actions for Founder Stories' })
    actions.focus()
    fireEvent.keyDown(actions, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: 'Add to featured' })).toBeInTheDocument()
  })

  it('shows a stern relationship warning before any credit-bearing pitch work, then allows a reviewed re-pitch', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        prior_outreach_at: '2026-07-10T00:00:00.000Z',
        agency_relationship: {
          podcast_id: 'podcast-one',
          state: 'pitched',
          touch_count: 1,
          last_contacted_at: '2026-07-10T00:00:00.000Z',
          last_client_name: 'Earlier Client',
          booked_client_name: null,
          booked_at: null,
          booked_episode_url: null,
          replied_client_name: null,
          contact_email: 'host@founderstories.fm',
          same_contact_other_show: false,
          manual_stage: null,
          summary: 'The first angle focused on founder operations.',
        },
      })],
    })
    renderEditor()

    expect((await screen.findAllByLabelText('Founder Stories was previously contacted')).length).toBeGreaterThan(0)
    const writePitch = screen.getByRole('button', { name: 'Write Pitch for Founder Stories' })
    expect(writePitch).toHaveTextContent('Write Re-pitch')
    fireEvent.click(writePitch)

    expect(await screen.findByText("Warning: you've reached out to this podcast already")).toBeInTheDocument()
    expect(screen.getByText('CRM match · Podcast ID podcast-one')).toBeInTheDocument()
    expect(screen.getByText(/Nothing that can use research credits, pitch credits, or external contact enrichment will run/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()
    expect(vi.mocked(ensureClientShortlistEpisodes)).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'I reviewed the prior relationship and still want to prepare this pitch' }))
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()
    await waitFor(() => expect(vi.mocked(ensureClientShortlistEpisodes)).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-one',
      true,
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Write Pitch for Founder Stories' }))
    expect(await screen.findByRole('checkbox', { name: 'I reviewed the prior relationship and still want to prepare this pitch' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Outreach history' })).toBeInTheDocument()
    expect(screen.getByText(/prepare a re-pitch/i)).toBeInTheDocument()
  })

  it('does not allow a do-not-contact relationship to be overridden from pitch preparation', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        agency_relationship: {
          podcast_id: 'podcast-one',
          state: 'suppressed',
          touch_count: 1,
          last_contacted_at: '2026-07-10T00:00:00.000Z',
          last_client_name: 'Earlier Client',
          booked_client_name: null,
          booked_at: null,
          booked_episode_url: null,
          replied_client_name: null,
          contact_email: 'host@founderstories.fm',
          same_contact_other_show: false,
          manual_stage: 'do_not_contact',
          summary: 'Host asked not to receive another pitch.',
        },
      })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByRole('region', { name: 'Relationship review required' })).toBeInTheDocument()
    expect(screen.getByText('This instruction cannot be overridden from the pitch workflow.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /reviewed the prior relationship/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()
    expect(vi.mocked(ensureClientShortlistEpisodes)).not.toHaveBeenCalled()
  })

  it('lets an owner mark a podcast approved or passed directly from its actions menu', async () => {
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast({
      podcast_id: 'podcast-two',
      podcast_name: 'Operator Weekly',
      feedback_status: 'approved',
    }))
    renderEditor()
    await screen.findByText('Operator Weekly')

    const actions = screen.getByRole('button', { name: 'Actions for Operator Weekly' })
    actions.focus()
    fireEvent.keyDown(actions, { key: 'Enter', code: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Mark approved/i }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-two',
      { feedback_status: 'approved' },
    ))
    expect(screen.queryByRole('menuitem', { name: /Hide from client/i })).not.toBeInTheDocument()
  })

  it('opens a Write Pitch workspace for research, contact finding, and outreach preparation', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByRole('heading', { name: 'Write a pitch for Founder Stories' })).toBeInTheDocument()
    const podcastContext = within(await screen.findByRole('region', { name: 'Podcast context' }))
    expect(podcastContext.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(podcastContext.getByText('Example Media')).toBeInTheDocument()
    expect(podcastContext.queryByText('Conversations with company builders.')).not.toBeInTheDocument()
    expect(podcastContext.queryByText('24K')).not.toBeInTheDocument()
    const showDetailsButton = podcastContext.getByRole('button', { name: 'Show details' })
    expect(showDetailsButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(showDetailsButton)
    expect(podcastContext.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
    expect(podcastContext.getByRole('heading', { name: 'Show overview' })).toBeInTheDocument()
    expect(podcastContext.getByRole('heading', { name: 'Host and show' })).toBeInTheDocument()
    expect(podcastContext.getByRole('heading', { name: 'Audience snapshot' })).toBeInTheDocument()
    expect(podcastContext.getByText('Conversations with company builders.')).toBeInTheDocument()
    expect(podcastContext.getByText('24K')).toBeInTheDocument()
    expect(podcastContext.getByText('4.8')).toBeInTheDocument()
    expect(podcastContext.getByText('120')).toBeInTheDocument()
    expect(podcastContext.getByText('Jul 20, 2026')).toBeInTheDocument()
    expect(podcastContext.getByText('Business')).toBeInTheDocument()
    expect(podcastContext.getByText(/This one looks great/)).toBeInTheDocument()
    expect(podcastContext.getByRole('link', { name: 'Open show' })).toHaveAttribute('href', 'https://example.com/founder-stories')
    expect(screen.getByRole('heading', { name: 'Find the email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use free podcast email' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('hello@founderstories.fm')).toBeInTheDocument()
    expect(screen.getByText('Free · Podscan')).toBeInTheDocument()
    expect(screen.getByText('One shared contact network')).toBeInTheDocument()
    expect(screen.getByText(/it is reused for 0 credits/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Enter email manually' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 credit on success')).toBeInTheDocument()
    expect(screen.getByText(/stronger route for reply potential/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try waterfall enrichment' }))
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Waterfall enrichment plan')).toBeInTheDocument()
    expect(screen.getByText('Identify host')).toBeInTheDocument()
    expect(screen.getByText('Confirm identity')).toBeInTheDocument()
    expect(screen.getByText('Verify email')).toBeInTheDocument()
    expect(screen.getByText(/No verified direct email means no credit is charged/i)).toBeInTheDocument()
    const billingLink = screen.getByRole('link', { name: 'Buy credits in Billing' })
    expect(billingLink).toHaveAttribute('href', '/app/settings/billing')
    expect(billingLink).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Billing opens in a new tab so this pitch stays here/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start direct email search' }))
    expect(screen.getByText('Direct email search in progress')).toBeInTheDocument()
    expect(screen.getByText(/reopening this podcast returns to the same job/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start direct email search' })).not.toBeInTheDocument()
    expect(screen.queryByText('Contact record')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Host or producer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Research and Pitch' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Finalize the selected pitch' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Research notes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opening email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter email manually' }))
    expect(screen.getByRole('button', { name: 'Enter email manually' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Waterfall enrichment plan')).not.toBeInTheDocument()
    const manualEmail = screen.getByLabelText('Email address')
    const continueButton = screen.getByRole('button', { name: 'Continue to research' })
    const pitchActions = screen.getByRole('contentinfo', { name: 'Pitch actions' })
    expect(pitchActions).toHaveClass('pb-5', 'sm:pb-6')
    expect(pitchActions.firstElementChild).toHaveClass('rounded-2xl', 'p-4')
    expect(continueButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step 2: Research & pitch locked until an email is ready' })).toBeDisabled()
    fireEvent.change(manualEmail, { target: { value: 'not-an-email' } })
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(continueButton).toBeDisabled()
    fireEvent.change(manualEmail, { target: { value: 'host@founderstories.fm' } })
    expect(continueButton).toBeEnabled()
    fireEvent.click(continueButton)

    expect(screen.getByRole('heading', { name: 'Research and Pitch' })).toBeInTheDocument()
    expect(screen.getByText('Included with your plan')).toBeInTheDocument()
    expect(screen.getByText('Research ready · 6 of 6 steps complete')).toBeInTheDocument()
    const researchStepsButton = screen.getByRole('button', { name: 'View steps' })
    expect(researchStepsButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(researchStepsButton)
    expect(screen.getByRole('button', { name: 'Hide steps' })).toHaveAttribute('aria-expanded', 'true')
    const researchProgress = within(screen.getByRole('list', { name: 'Podcast research progress' }))
    expect(researchProgress.getByText('Reading the podcast profile')).toBeInTheDocument()
    expect(researchProgress.getByText('Confirming the host')).toBeInTheDocument()
    expect(researchProgress.getByText('Reviewing recent episodes')).toBeInTheDocument()
    expect(researchProgress.getByText('Checking guest patterns')).toBeInTheDocument()
    expect(researchProgress.getByText('Matching guest expertise')).toBeInTheDocument()
    expect(researchProgress.getByText('Preparing pitch angles')).toBeInTheDocument()
    expect(screen.getByText(/every stage is saved with this podcast/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recommended pitch angles' })).toBeInTheDocument()
    const sequencePreview = within(screen.getByRole('region', { name: 'Pitch and follow-ups' }))
    expect(sequencePreview.getByRole('article', { name: 'Opening pitch preview' })).toHaveTextContent('Guest idea for Founder Stories: Taylor Client')
    expect(sequencePreview.getByRole('article', { name: 'First follow-up preview' })).toHaveTextContent('Just following up')
    expect(sequencePreview.getByRole('article', { name: 'Second follow-up preview' })).toHaveTextContent('One last note')
    expect(sequencePreview.queryByRole('button', { name: 'Edit outputs' })).not.toBeInTheDocument()
    expect(sequencePreview.getByText(/Read-only preview/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Podcast context' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Research notes')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Find the email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use free podcast email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try waterfall enrichment' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opening email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Finalize selected pitch' }))

    expect(screen.getByRole('heading', { name: 'Finalize the selected pitch' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Podcast context' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Sequence emails' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Email 1: Opening pitch' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Opening email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Follow-up 1 reply')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Email 2: Follow-up' }))
    expect(screen.getByLabelText('Follow-up 1 reply')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Email 3: Close the loop' }))
    expect(screen.getByLabelText('Follow-up 2 reply')).toBeInTheDocument()
    expect(screen.queryByLabelText('Follow-up 1 subject')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Follow-up 2 subject')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Find the email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Research and Pitch' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Research notes')).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing sends from this modal/i)).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: 'Send to Client Campaign' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    fireEvent.click(saveButton)

    await waitFor(() => expect(prepareWorkspaceCampaignPodcast).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId,
      shortlistPodcastId: '33333333-3333-4333-8333-333333333333',
      contactEmail: 'host@founderstories.fm',
      subject: 'Guest idea for Founder Stories: Taylor Client',
      pitchBody: expect.stringContaining('Founder Stories'),
      followUpOneBody: expect.stringContaining('Just following up'),
      followUpTwoBody: expect.stringContaining('One last note'),
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Write a pitch for Founder Stories' })).not.toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Write Pitch for Operator Weekly' })).not.toBeInTheDocument()
  })

  it('keeps client fit in podcast context and offers three complete sequence directions', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        ai_fit_reasons: [
          'Taylor gives the audience a practical operating framework.',
          'The client has credible experience for the show topic.',
        ],
        ai_pitch_angles: [
          { title: 'Build a durable growth system', description: 'A practical operating playbook for founders.' },
          { title: 'Turn complexity into momentum', description: 'How leaders simplify difficult growth decisions.' },
          { title: 'Scale without adding chaos', description: 'Systems that keep a growing company focused.' },
        ],
      })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    const podcastContext = within(await screen.findByRole('region', { name: 'Podcast context' }))
    fireEvent.click(podcastContext.getByRole('button', { name: 'Show details' }))
    expect(podcastContext.getByRole('heading', { name: 'Why Taylor Client fits' })).toBeInTheDocument()
    expect(podcastContext.getByText('Taylor gives the audience a practical operating framework.')).toBeInTheDocument()
    fireEvent.click(podcastContext.getByRole('button', { name: 'Hide details' }))

    fireEvent.click(screen.getByRole('button', { name: 'Continue to research' }))
    expect(screen.queryByRole('heading', { name: 'Why Taylor Client fits' })).not.toBeInTheDocument()
    expect(screen.getByText('Option 1 of 3')).toBeInTheDocument()
    const firstOption = screen.getByRole('button', { name: 'Select sequence 1: Build a durable growth system' })
    const secondOption = screen.getByRole('button', { name: 'Select sequence 2: Turn complexity into momentum' })
    const thirdOption = screen.getByRole('button', { name: 'Select sequence 3: Scale without adding chaos' })
    expect(firstOption).toHaveAttribute('aria-pressed', 'true')
    expect(secondOption).toHaveAttribute('aria-pressed', 'false')
    expect(thirdOption).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('article', { name: 'Opening pitch preview' })).toHaveTextContent('Build a durable growth system')

    fireEvent.click(secondOption)
    expect(secondOption).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Option 2 of 3')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Opening pitch preview' })).toHaveTextContent('Turn complexity into momentum')
  })

  it('lets only the workspace owner customize the prompt for each research stage', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to research' }))

    const editPrompts = screen.getByRole('button', { name: 'Edit stage prompts' })
    expect(editPrompts).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(editPrompts)

    const promptSettings = within(screen.getByRole('region', { name: 'Workspace research prompts' }))
    expect(screen.getByRole('button', { name: 'Close prompt editor' })).toHaveAttribute('aria-expanded', 'true')
    expect(promptSettings.getByText('Owner controls')).toBeInTheDocument()
    expect(promptSettings.getByRole('navigation', { name: 'Research prompt stages' })).toBeInTheDocument()
    const podcastResearchStage = promptSettings.getByRole('button', { name: /Podcast research/ })
    expect(podcastResearchStage).toHaveAttribute('aria-pressed', 'true')
    const prompt = promptSettings.getByLabelText('Prompt for Podcast research')
    expect((prompt as HTMLTextAreaElement).value).toContain('{{client_name}}')
    expect((prompt as HTMLTextAreaElement).value).toContain('HOST INFORMATION')

    fireEvent.change(prompt, { target: { value: 'Use {{podcast_name}} to create a concise workspace-specific show brief.' } })
    expect(promptSettings.getByRole('button', { name: 'Save prompt' })).toBeEnabled()
    const { setWorkspaceResearchPrompt } = await import('@/services/workspaceCampaigns')
    fireEvent.click(promptSettings.getByRole('button', { name: 'Save prompt' }))
    await waitFor(() => expect(vi.mocked(setWorkspaceResearchPrompt)).toHaveBeenCalledWith(
      workspaceId,
      'podcast_research',
      'Use {{podcast_name}} to create a concise workspace-specific show brief.',
    ))

    fireEvent.click(promptSettings.getByRole('button', { name: /Host identification/ }))
    expect((promptSettings.getByLabelText('Prompt for Host identification') as HTMLTextAreaElement).value).toContain('Identify ALL podcast hosts')
  })

  it('runs regeneration only from Research and Pitch through every saved prompt', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to research' }))

    expect(screen.getByRole('button', { name: 'Regenerate' })).toHaveAttribute(
      'title',
      'Runs every research stage using the saved prompt for each stage, then writes the sequence',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    expect(screen.getByRole('heading', { name: 'Research and Pitch' })).toBeInTheDocument()
    expect(screen.getByText('Reading the podcast profile · 0 of 6 prompts complete')).toBeInTheDocument()
    expect(screen.getByText(/Running your saved workspace prompts against live podcast data/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(vi.mocked(runClientShortlistResearch)).toHaveBeenCalledWith(
        workspaceId,
        clientId,
        '33333333-3333-4333-8333-333333333333',
        false,
      )
    })
    const researchProgress = within(screen.getByRole('list', { name: 'Podcast research progress' }))
    expect(researchProgress.getByText('In progress')).toBeInTheDocument()
    expect(researchProgress.getAllByText('Waiting')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Regenerating' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit stage prompts' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Finalize selected pitch' })).toBeDisabled()
    expect(screen.getAllByText(/all six saved workspace prompts run in order/i).length).toBeGreaterThan(0)
  })

  it('keeps workspace research prompt controls owner-only', async () => {
    renderEditor('admin')
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to research' }))

    expect(screen.queryByRole('button', { name: 'Edit stage prompts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Workspace research prompts' })).not.toBeInTheDocument()
  })

  it('reuses a globally unlocked direct email after the modal is closed and reopened', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        email_unlock: {
          status: 'unlocked',
          current_stage: null,
          completed_stages: ['identify_contact', 'find_email', 'verify_email'],
          email: 'direct@founderstories.fm',
          host_name: 'Jamie Host',
          unlocked_at: '2026-07-24T12:00:00.000Z',
        },
      })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByText('Globally unlocked direct email · 0 credits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Globally unlocked').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0 additional credits').length).toBeGreaterThan(0)
    expect(screen.getByText(/permanently available to every workspace/i)).toBeInTheDocument()
    expect(screen.queryByText('direct@founderstories.fm')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start direct email search' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    expect(await screen.findByText('Globally unlocked direct email · 0 credits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()
  })

  it('keeps a newly started email search visible when the visual modal is reopened', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Try waterfall enrichment' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start direct email search' }))
    expect(screen.getByText('Direct email search in progress')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    expect(await screen.findByText('Direct email search in progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()
  })

  it('restores an in-progress email search and lets the owner use the free inbox instead', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        email_unlock: {
          status: 'running',
          current_stage: 'find_email',
          completed_stages: ['identify_contact'],
          started_at: '2026-07-24T12:00:00.000Z',
          updated_at: '2026-07-24T12:01:00.000Z',
        },
      })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByText('Direct email search in progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Confirming the right contact')).toBeInTheDocument()
    expect(screen.getByText('Searching trusted sources')).toBeInTheDocument()
    expect(screen.getByText('Verifying the email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Use free podcast email' }))
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()
    expect(screen.getByText(/keeps going if you close this modal/i)).toBeInTheDocument()
  })

  it('shows a no-charge retry state when a direct email was not found', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        email_unlock: {
          status: 'not_found',
          current_stage: null,
          completed_stages: ['identify_contact', 'find_email'],
          message: 'We could not verify a direct host email for this show.',
        },
      })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByText('No direct email found yet')).toBeInTheDocument()
    expect(screen.getByText('You were not charged')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try waterfall enrichment' }))
    expect(screen.getByText('No verified direct email · No charge')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try search again' }))
    expect(screen.getByText('Direct email search in progress')).toBeInTheDocument()
  })

  it('keeps research read-only and saves edits only from Finalize Pitch', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to research' }))
    expect(screen.queryByRole('button', { name: 'Edit outputs' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opening email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Finalize selected pitch' }))
    expect(screen.queryByRole('button', { name: /Regenerate/ })).not.toBeInTheDocument()
    expect(screen.getByText('All edits saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save edits' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'A tailored Founder Stories idea' } })
    fireEvent.change(screen.getByLabelText('Opening email'), { target: { value: 'Hey Example,\n\nHere is the revised opening pitch.' } })
    expect(screen.getByText('Unsaved edits')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Client Campaign' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save edits' }))
    expect(screen.getByText('All edits saved')).toBeInTheDocument()

    const sendToCampaign = screen.getByRole('button', { name: 'Send to Client Campaign' })
    await waitFor(() => expect(sendToCampaign).toBeEnabled())
    fireEvent.click(sendToCampaign)

    await waitFor(() => expect(prepareWorkspaceCampaignPodcast).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId,
      shortlistPodcastId: '33333333-3333-4333-8333-333333333333',
      contactEmail: 'hello@founderstories.fm',
      subject: 'A tailored Founder Stories idea',
      pitchBody: 'Hey Example,\n\nHere is the revised opening pitch.',
      followUpOneSubject: 'Re: A tailored Founder Stories idea',
      followUpTwoSubject: 'Re: A tailored Founder Stories idea',
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Write a pitch for Founder Stories' })).not.toBeInTheDocument())
  })

  it('shows live backend research progress and holds the pitch until every stage finishes', async () => {
    const runningPodcast = podcast({
      research_progress: {
        status: 'running',
        current_stage: 'recent_episodes',
        completed_stages: ['podcast_profile', 'host_profile'],
        started_at: '2026-07-24T12:00:00.000Z',
        updated_at: '2026-07-24T12:01:00.000Z',
      },
    })
    const completedPodcast = podcast({
      research_progress: {
        status: 'completed',
        current_stage: null,
        completed_stages: ['podcast_profile', 'host_profile', 'recent_episodes', 'guest_patterns', 'guest_fit', 'pitch_angles'],
        started_at: '2026-07-24T12:00:00.000Z',
        updated_at: '2026-07-24T12:02:00.000Z',
      },
      ai_analyzed_at: '2026-07-24T12:02:00.000Z',
    })
    vi.mocked(getClientShortlist)
      .mockResolvedValueOnce({
        client: { id: clientId, name: 'Taylor Client' },
        podcasts: [runningPodcast],
      })
      .mockResolvedValueOnce({
        client: { id: clientId, name: 'Taylor Client' },
        podcasts: [completedPodcast],
      })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to research' }))

    expect(screen.getByText('Reviewing recent episodes · 2 of 6 steps complete')).toBeInTheDocument()
    const researchProgress = within(screen.getByRole('list', { name: 'Podcast research progress' }))
    expect(researchProgress.getAllByText('Done')).toHaveLength(2)
    expect(researchProgress.getByText('In progress')).toBeInTheDocument()
    expect(researchProgress.getAllByText('Waiting')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'View steps' })).not.toBeInTheDocument()
    expect(screen.getByText(/research continues in the background/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalize selected pitch' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step 3: Finalize pitch locked until research is complete' })).toBeDisabled()

    await waitFor(() => expect(screen.getByText('Research ready · 6 of 6 steps complete')).toBeInTheDocument(), { timeout: 4_000 })
    expect(screen.getByRole('button', { name: 'Finalize selected pitch' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Go to step 3: Finalize pitch' })).toBeEnabled()
  })

  it('requires a valid manually entered email when no public podcast email is available', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ podcast_email: null })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByText('No public email found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use free podcast email' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step 2: Research & pitch locked until an email is ready' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Archive podcast' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter email manually' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'producer@example.com' } })
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()
    expect(screen.queryByText('Contact record')).not.toBeInTheDocument()
  })

  it('offers the existing archive flow when no email can be supplied', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ podcast_email: null })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Archive podcast' }))
    expect(await screen.findByRole('heading', { name: 'Archive this podcast?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive podcast' }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-one',
      { visibility: 'archived' },
    ))
  })

  it('keeps the pitch design visible when campaign setup is not ready', async () => {
    vi.mocked(getWorkspaceCampaign).mockResolvedValueOnce({
      integration: {} as never,
      can_manage_campaigns: true,
      campaign: null,
      targets: [],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByRole('heading', { name: 'Write a pitch for Founder Stories' })).toBeInTheDocument()
    const continueToResearch = screen.getByRole('button', { name: 'Continue to research' })
    await waitFor(() => expect(continueToResearch).toBeEnabled())
    fireEvent.click(continueToResearch)
    fireEvent.click(screen.getByRole('button', { name: 'Finalize selected pitch' }))
    expect(screen.getByText('You can finalize the pitch now')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Campaign setup' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(screen.getByRole('button', { name: 'Send to Client Campaign' })).toBeDisabled()
    expect(prepareWorkspaceCampaignPodcast).not.toHaveBeenCalled()
  })

  it('shows no more than ten podcasts on each list page', async () => {
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: Array.from({ length: 12 }, (_, index) => podcast({
        id: `shortlist-row-${index + 1}`,
        podcast_id: `podcast-${index + 1}`,
        podcast_name: `Podcast ${index + 1}`,
        display_order: index,
        is_featured: false,
        featured_order: null,
      })),
    })
    renderEditor()

    expect(await screen.findByRole('button', { name: 'View details for Podcast 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View details for Podcast 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View details for Podcast 11' })).not.toBeInTheDocument()
    expect(screen.getByText('Showing 10 of 12 podcasts')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('button', { name: 'View details for Podcast 11' })).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 12 podcasts')).toBeInTheDocument()
  })

  it('sorts all podcasts by audience or rating', async () => {
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [
        podcast({ id: 'row-small', podcast_id: 'small-show', podcast_name: 'Small Show', audience_size: 1_000, itunes_rating: 4.9, is_featured: false, featured_order: null }),
        podcast({ id: 'row-large', podcast_id: 'large-show', podcast_name: 'Large Show', audience_size: 100_000, itunes_rating: 4.1, is_featured: false, featured_order: null }),
        podcast({ id: 'row-medium', podcast_id: 'medium-show', podcast_name: 'Medium Show', audience_size: 25_000, itunes_rating: 4.6, is_featured: false, featured_order: null }),
      ],
    })
    renderEditor()
    await screen.findByRole('button', { name: 'View details for Small Show' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort podcasts' }), { target: { value: 'audience_desc' } })
    expect(screen.getAllByRole('button', { name: /View details for/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'View details for Large Show',
      'View details for Medium Show',
      'View details for Small Show',
    ])

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort podcasts' }), { target: { value: 'rating_desc' } })
    expect(screen.getAllByRole('button', { name: /View details for/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'View details for Small Show',
      'View details for Medium Show',
      'View details for Large Show',
    ])
  })

  it('searches the shared catalog and adds a selected podcast directly to the database list', async () => {
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([
      {
        podcast_id: 'podcast-new',
        podcast_name: 'The New Show',
        podcast_description: null,
        podcast_image_url: null,
        podcast_url: 'https://example.com/new-show',
        publisher_name: 'New Media',
        itunes_rating: 4.6,
        episode_count: 42,
        audience_size: 8_000,
        last_posted_at: '2026-07-21T00:00:00.000Z',
        podcast_categories: null,
        language: 'en',
        region: 'US',
        podcast_email: null,
        rss_feed: null,
        already_added: false,
        existing_visibility: null,
      },
    ])
    renderEditor()
    await screen.findByRole('heading', { name: 'Client podcast list' })

    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    fireEvent.change(screen.getByPlaceholderText('Search by podcast or publisher…'), { target: { value: 'new show' } })
    expect(await screen.findByText('The New Show')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select The New Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 selected' }))

    await waitFor(() => expect(addClientShortlistPodcasts).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      [expect.objectContaining({ podcast_id: 'podcast-new', podcast_name: 'The New Show' })],
    ))
  })

  it('saves workspace-only notes from the podcast detail view', async () => {
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast({ operator_notes: 'Strong fit for the launch.' }))
    renderEditor()
    await screen.findByRole('heading', { name: 'Client podcast list' })

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    fireEvent.change(screen.getByLabelText('Internal notes'), { target: { value: 'Strong fit for the launch.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save internal notes' }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-one',
      { operator_notes: 'Strong fit for the launch.' },
    ))
  })
})
