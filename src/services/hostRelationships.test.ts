import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addHostRelationshipNote,
  captureHostRelationshipThread,
  createHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationships,
  saveHostRelationship,
  unlinkHostRelationshipClient,
} from '@/services/hostRelationships'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const canonicalWorkspaceId = workspaceId.toLowerCase()
const clientId = '22222222-2222-4222-8222-222222222222'

describe('hostRelationships service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads a workspace-scoped book and normalizes missing detail arrays', async () => {
    const relationship = { podcast_id: 'show-one', derived_state: 'replied' }
    invoke
      .mockResolvedValueOnce({ data: { relationships: [relationship] }, error: null } as never)
      .mockResolvedValueOnce({ data: { relationship: null, derived: null }, error: null } as never)

    await expect(listHostRelationships(workspaceId)).resolves.toEqual([relationship])
    await expect(getHostRelationship(workspaceId, 'show-one')).resolves.toEqual({
      relationship: null,
      derived: null,
      clients: [],
      events: [],
      threads: [],
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-host-relationships', {
      body: { action: 'list', workspace_id: canonicalWorkspaceId },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-host-relationships', {
      body: { action: 'detail', workspace_id: canonicalWorkspaceId, podcast_id: 'show-one' },
    })
  })

  it('patches only fields the caller supplied so a summary cannot erase the stage', async () => {
    invoke.mockResolvedValue({ data: { relationship: { podcast_id: 'show-one' } }, error: null } as never)

    await saveHostRelationship(workspaceId, { podcastId: 'show-one', summary: 'Prefers concise pitches.' })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: {
        action: 'upsert',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'show-one',
        summary: 'Prefers concise pitches.',
      },
    })
    const body = (invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body
    expect(body).not.toHaveProperty('manual_stage')
    expect(body).not.toHaveProperty('contact_email')
  })

  it('preserves explicit null when a manager returns the stage to derived activity', async () => {
    invoke.mockResolvedValue({ data: { relationship: { podcast_id: 'show-one' } }, error: null } as never)

    await saveHostRelationship(workspaceId, { podcastId: 'show-one', manualStage: null })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: {
        action: 'upsert',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'show-one',
        manual_stage: null,
      },
    })
  })

  it('uses narrow actions for interactions and client associations', async () => {
    invoke.mockResolvedValue({ data: {}, error: null } as never)

    await addHostRelationshipNote(workspaceId, {
      podcastId: 'show-one',
      body: 'Asked us to circle back in Q3.',
      kind: 'call',
      clientId,
    })
    await linkHostRelationshipClient(workspaceId, {
      podcastId: 'show-one',
      clientId,
      intent: 'considering',
    })
    await unlinkHostRelationshipClient(workspaceId, { podcastId: 'show-one', clientId })

    expect(invoke.mock.calls.map((call) => (call[1] as { body: { action: string } }).body.action)).toEqual([
      'note-add',
      'client-link',
      'client-unlink',
    ])
    expect((invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toMatchObject({
      workspace_id: canonicalWorkspaceId,
      podcast_id: 'show-one',
      body_text: 'Asked us to circle back in Q3.',
      kind: 'call',
      client_id: clientId,
    })
  })

  it('creates manual relationships and captures durable inbox thread snapshots', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { relationship: { podcast_id: 'manual-one' }, created: true },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { podcast_id: 'show-one', relationship_created: false, thread_saved: true },
        error: null,
      } as never)

    await expect(createHostRelationship(workspaceId, {
      podcastName: 'The Operator Room',
      hostName: 'Alex Host',
      contactEmail: 'alex@example.com',
      manualStage: 'warm',
      summary: 'Met at an event.',
    })).resolves.toEqual({ podcast_id: 'manual-one', created: true })
    await expect(captureHostRelationshipThread(workspaceId, {
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
      body: 'Let us talk in Q3.',
      receivedAt: '2026-07-21T12:00:00.000Z',
      campaignId: 'campaign-one',
      campaignName: 'Taylor outreach',
    })).resolves.toEqual({ podcast_id: 'show-one', relationship_created: false, thread_saved: true })

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-host-relationships', {
      body: expect.objectContaining({
        action: 'create',
        workspace_id: canonicalWorkspaceId,
        podcast_name: 'The Operator Room',
        contact_email: 'alex@example.com',
      }),
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-host-relationships', {
      body: expect.objectContaining({
        action: 'thread-capture',
        workspace_id: canonicalWorkspaceId,
        podcast_id: 'show-one',
        thread_key: 'thread-one',
        body_text: 'Let us talk in Q3.',
      }),
    })
  })

  it('captures a thread with no known show without inventing a name', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        podcast_id: 'manual-unknown',
        relationship_created: true,
        thread_saved: true,
        show_identified: false,
      },
      error: null,
    } as never)

    // A reply with no campaign context sends podcast_name null on purpose: the
    // server resolves the show from the address, and an unnamed row is
    // repairable in a way a placeholder name is not.
    await expect(captureHostRelationshipThread(workspaceId, {
      podcastName: null,
      hostName: null,
      contactEmail: 'unknown-host@example.com',
      threadKey: 'thread-two',
    })).resolves.toEqual({
      podcast_id: 'manual-unknown',
      relationship_created: true,
      thread_saved: true,
      show_identified: false,
    })

    expect(invoke).toHaveBeenCalledWith('workspace-host-relationships', {
      body: expect.objectContaining({
        action: 'thread-capture',
        workspace_id: canonicalWorkspaceId,
        podcast_id: null,
        podcast_name: null,
        host_name: null,
        contact_email: 'unknown-host@example.com',
        thread_key: 'thread-two',
      }),
    })
  })
})
