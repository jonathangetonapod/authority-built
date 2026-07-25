import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addWorkspaceCampaignPodcasts,
  connectWorkspaceInstantly,
  getWorkspaceCampaignOverview,
  getWorkspaceMailboxes,
  getWorkspaceResearchPromptOverrides,
  launchWorkspaceCampaignPitch,
  prepareWorkspaceCampaignPodcast,
  resetWorkspaceResearchPrompt,
  saveWorkspaceCampaign,
  setWorkspaceResearchPrompt,
  updateWorkspaceCampaignContact,
} from '@/services/workspaceCampaigns'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const shortlistPodcastId = '33333333-3333-4333-8333-333333333333'

const integration = {
  connected: false,
  status: 'disconnected' as const,
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
}

describe('workspaceCampaigns service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the campaign overview through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({
      data: { integration, can_manage_campaigns: true, campaigns: [] },
      error: null,
    } as never)

    await expect(getWorkspaceCampaignOverview(workspaceId)).resolves.toMatchObject({ campaigns: [] })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'overview', workspace_id: workspaceId },
    })
  })

  it('loads mailboxes through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        connected: true,
        provider_workspace_name: 'Solar workspace',
        accounts: [],
        last_synced_at: '2026-07-24T12:00:00.000Z',
        analytics_errors: [],
      },
      error: null,
    } as never)

    await expect(getWorkspaceMailboxes(workspaceId)).resolves.toMatchObject({ connected: true })
    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'mailboxes', workspace_id: workspaceId },
    })
  })

  it('sends the owner key only to the authenticated connection action', async () => {
    invoke.mockResolvedValueOnce({ data: { integration }, error: null } as never)

    await connectWorkspaceInstantly(workspaceId, 'instantly-v2-owner-key')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'connect-instantly',
        workspace_id: workspaceId,
        api_key: 'instantly-v2-owner-key',
      },
    })
  })

  it('maps campaign drafts and explicit pitch launches to narrow actions', async () => {
    invoke
      .mockResolvedValueOnce({ data: { campaign: null, targets: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { campaign: null, targets: [] }, error: null } as never)

    await saveWorkspaceCampaign({
      workspaceId,
      clientId,
      name: 'Client Podcast Outreach',
      timezone: 'America/New_York',
      dailyLimit: 30,
      senderAccounts: ['sender@example.com'],
      shortlistPodcastIds: [shortlistPodcastId],
      providerCampaignId: '77777777-7777-4777-8777-777777777777',
    })
    await launchWorkspaceCampaignPitch({
      workspaceId,
      clientId,
      shortlistPodcastId,
      subject: 'A tailored guest idea',
      pitchBody: 'A reviewed opening pitch.',
      followUpOneSubject: 'Re: A tailored guest idea',
      followUpOneBody: 'A reviewed first follow-up.',
      followUpTwoSubject: 'Re: A tailored guest idea',
      followUpTwoBody: 'A reviewed final follow-up.',
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-client-campaigns', {
      body: {
        action: 'upsert',
        workspace_id: workspaceId,
        client_id: clientId,
        name: 'Client Podcast Outreach',
        timezone: 'America/New_York',
        daily_limit: 30,
        sender_accounts: ['sender@example.com'],
        shortlist_podcast_ids: [shortlistPodcastId],
        provider_campaign_id: '77777777-7777-4777-8777-777777777777',
      },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-client-campaigns', {
      body: {
        action: 'launch-pitch',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        subject: 'A tailored guest idea',
        pitch_body: 'A reviewed opening pitch.',
        follow_up_1_subject: 'Re: A tailored guest idea',
        follow_up_1_body: 'A reviewed first follow-up.',
        follow_up_2_subject: 'Re: A tailored guest idea',
        follow_up_2_body: 'A reviewed final follow-up.',
      },
    })
  })

  it('pushes a researched three-email package into the existing client campaign', async () => {
    invoke.mockResolvedValueOnce({ data: { added: true, campaign: {}, target: {} }, error: null } as never)

    await prepareWorkspaceCampaignPodcast({
      workspaceId,
      clientId,
      shortlistPodcastId,
      researchNotes: 'Recent episodes and audience notes.',
      hostName: 'Jamie Host',
      contactEmail: 'host@example.com',
      subject: 'A tailored guest idea',
      pitchBody: 'A reviewed opening pitch.',
      followUpOneSubject: 'Re: A tailored guest idea',
      followUpOneBody: 'A reviewed first follow-up.',
      followUpTwoSubject: 'Re: A tailored guest idea',
      followUpTwoBody: 'A reviewed final follow-up.',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'prepare-podcast',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        research_notes: 'Recent episodes and audience notes.',
        host_name: 'Jamie Host',
        contact_email: 'host@example.com',
        subject: 'A tailored guest idea',
        pitch_body: 'A reviewed opening pitch.',
        follow_up_1_subject: 'Re: A tailored guest idea',
        follow_up_1_body: 'A reviewed first follow-up.',
        follow_up_2_subject: 'Re: A tailored guest idea',
        follow_up_2_body: 'A reviewed final follow-up.',
      },
    })
  })

  it('saves a campaign-local host contact without mutating the podcast database', async () => {
    invoke.mockResolvedValueOnce({ data: { target: { id: 'target-one' } }, error: null } as never)

    await updateWorkspaceCampaignContact({
      workspaceId,
      clientId,
      shortlistPodcastId,
      contactEmail: 'host@example.com',
      hostName: 'Jamie Host',
    })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'update-contact',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_id: shortlistPodcastId,
        contact_email: 'host@example.com',
        host_name: 'Jamie Host',
      },
    })
  })

  it('appends podcasts to an existing client campaign through a narrow action', async () => {
    invoke.mockResolvedValueOnce({ data: { added: 1, campaign: {}, targets: [] }, error: null } as never)

    await addWorkspaceCampaignPodcasts({ workspaceId, clientId, shortlistPodcastIds: [shortlistPodcastId] })

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'add-podcasts',
        workspace_id: workspaceId,
        client_id: clientId,
        shortlist_podcast_ids: [shortlistPodcastId],
      },
    })
  })
})

describe('workspace research prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const workspaceId = '11111111-1111-4111-8111-111111111111'

  it('loads prompt overrides through the campaigns function', async () => {
    invoke.mockResolvedValueOnce({
      data: { overrides: { podcast_research: { content: 'Custom research prompt', updated_at: '2026-07-26T00:00:00.000Z' } } },
      error: null,
    } as never)

    const overrides = await getWorkspaceResearchPromptOverrides(workspaceId)

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'prompts-get', workspace_id: workspaceId },
    })
    expect(overrides.podcast_research?.content).toBe('Custom research prompt')
  })

  it('saves a prompt override with the exact payload', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await setWorkspaceResearchPrompt(workspaceId, 'write_email', 'New pitch instructions')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: {
        action: 'prompts-set',
        workspace_id: workspaceId,
        prompt_id: 'write_email',
        content: 'New pitch instructions',
      },
    })
  })

  it('resets a prompt override', async () => {
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null } as never)

    await resetWorkspaceResearchPrompt(workspaceId, 'find_topics')

    expect(invoke).toHaveBeenCalledWith('workspace-client-campaigns', {
      body: { action: 'prompts-reset', workspace_id: workspaceId, prompt_id: 'find_topics' },
    })
  })
})
