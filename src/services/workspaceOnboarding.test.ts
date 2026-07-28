import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveOnboardingAnswers,
  getClientOnboarding,
  getOnboardingLink,
  listWorkspaceOnboarding,
  saveClientOnboarding,
  startWorkspaceOnboarding,
  type OnboardingDefinition,
} from '@/services/workspaceOnboarding'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const templateId = '33333333-3333-4333-8333-333333333333'
const versionId = '44444444-4444-4444-8444-444444444444'
const instanceId = '55555555-5555-4555-8555-555555555555'
const clientId = '66666666-6666-4666-8666-666666666666'

const definition: OnboardingDefinition = {
  schema_version: 1,
  intro_title: 'Welcome',
  intro_body: 'Tell us about yourself.',
  completion_message: 'Thanks.',
  sections: [{
    id: 'basics',
    title: 'Basics',
    description: '',
    questions: [{
      id: 'full_name',
      type: 'short_text',
      label: 'Full name',
      description: '',
      required: true,
      placeholder: '',
      mapping: 'client.name',
    }],
  }],
}

const summary = {
  id: instanceId,
  workspace_id: workspaceId,
  client_id: clientId,
  template_version_id: versionId,
  template_id: templateId,
  template_name: 'Guest intake',
  template_version: 1,
  client_name: 'Client One',
  recipient_name: 'Casey Client',
  recipient_email: 'casey@example.com',
  status: 'invited',
  capability_generation: 1,
  capability_expires_at: '2026-08-05T00:00:00.000Z',
  current_revision: 0,
  created_at: '2026-07-22T00:00:00.000Z',
  updated_at: '2026-07-22T00:00:00.000Z',
  invited_at: '2026-07-22T00:00:00.000Z',
  viewed_at: null,
  started_at: null,
  submitted_at: null,
  changes_requested_at: null,
  approved_at: null,
  revoked_at: null,
  archived_at: null,
  progress_section: 0,
  draft_lock_version: 0,
  open_comment_count: 0,
  profile_status: null,
}

const detail = {
  ...summary,
  definition,
  answers: {},
  revisions: [],
  comments: [],
  profile: null,
  assets: [],
  assigned_membership_ids: [],
}

const listResponse = {
  workspace: { id: workspaceId, name: 'Agency', logo_path: null, logo_updated_at: null },
  viewer_role: 'owner',
  can_manage: true,
  templates: [{
    id: templateId,
    workspace_id: workspaceId,
    name: 'Guest intake',
    description: '',
    status: 'published',
    definition,
    reminder_days: [],
    published_version: 1,
    is_default: true,
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    archived_at: null,
  }],
  clients: [],
  assignable_members: [],
  instances: [summary],
}

describe('workspaceOnboarding service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes the selected workspace and rejects cross-workspace rows', async () => {
    invoke.mockResolvedValueOnce({ data: listResponse, error: null })
    await expect(listWorkspaceOnboarding(workspaceId.toUpperCase())).resolves.toMatchObject({
      workspace: { id: workspaceId },
      instances: [{ id: instanceId }],
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: { action: 'list', workspace_id: workspaceId },
    })

    invoke.mockResolvedValueOnce({
      data: { ...listResponse, instances: [{ ...summary, workspace_id: otherWorkspaceId }] },
      error: null,
    })
    await expect(listWorkspaceOnboarding(workspaceId)).rejects.toThrow(
      'The onboarding response did not match the workspace.',
    )
  })

  it('creates one scoped invitation without requesting platform email delivery', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: detail,
        onboarding_url: 'https://getonapod.com/onboarding/redacted-test-token',
        delivery: { status: 'skipped' },
      },
      error: null,
    })
    const input = {
      template_id: templateId,
      client_id: clientId,
      new_client: null,
      recipient_name: 'Casey Client',
      recipient_email: 'casey@example.com',
      expires_in_days: 14,
      assigned_membership_ids: [],
      experience: {
        intro_title: 'Welcome, Casey',
        intro_body: 'Tell Agency about yourself.',
        completion_message: 'Thanks. Agency will review this.',
        accent_color: '#0F766E',
      },
    }
    await expect(startWorkspaceOnboarding(workspaceId, input)).resolves.toMatchObject({
      delivery: { status: 'skipped' },
      onboarding_url: expect.stringContaining('/onboarding/'),
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'start',
        workspace_id: workspaceId,
        ...input,
        send_email: false,
        experience: {
          ...input.experience,
          brand_logo: null,
        },
      },
    })
  })

  it('retrieves the current secure link without rotating its generation', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: detail,
        onboarding_url: 'https://getonapod.com/onboarding/redacted-current-token',
      },
      error: null,
    })

    await expect(getOnboardingLink(workspaceId, instanceId)).resolves.toMatchObject({
      instance: { id: instanceId, capability_generation: 1 },
      onboarding_url: expect.stringContaining('/onboarding/'),
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'get_link',
        workspace_id: workspaceId,
        instance_id: instanceId,
      },
    })
  })

  it('approves submitted answers without requiring a pitch profile', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        instance: {
          ...detail,
          status: 'approved',
          approved_at: '2026-07-23T12:00:00.000Z',
        },
      },
      error: null,
    })

    await expect(approveOnboardingAnswers(workspaceId, instanceId)).resolves.toMatchObject({
      instance: { id: instanceId, status: 'approved' },
    })
    expect(invoke).toHaveBeenCalledWith('workspace-onboarding', {
      body: {
        action: 'approve_answers',
        workspace_id: workspaceId,
        instance_id: instanceId,
      },
    })
  })

  it('keeps the capability in function request bodies and never uses browser storage', async () => {
    const clientView = {
      id: instanceId,
      workspace: { name: 'Agency', logo_url: null },
      accent_color: '#0F766E',
      recipient_name: 'Casey',
      status: 'in_progress',
      expires_at: '2026-08-05T00:00:00.000Z',
      current_revision: 0,
      definition,
      answers: { full_name: 'Casey' },
      current_section: 0,
      lock_version: 2,
      comments: [],
      assets: [],
    }
    invoke
      .mockResolvedValueOnce({ data: { onboarding: clientView }, error: null })
      .mockResolvedValueOnce({ data: { onboarding: { ...clientView, lock_version: 3 } }, error: null })

    await getClientOnboarding('private-capability')
    await saveClientOnboarding('private-capability', { full_name: 'Casey Client' }, 0, 2)

    expect(invoke).toHaveBeenNthCalledWith(1, 'client-onboarding', {
      // The hostname the link was opened on travels with every client call.
      body: { action: 'get', token: 'private-capability', hostname: 'localhost' },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'client-onboarding', {
      body: {
        action: 'save',
        token: 'private-capability',
        answers: { full_name: 'Casey Client' },
        current_section: 0,
        expected_lock_version: 2,
        hostname: 'localhost',
      },
    })
  })
})
