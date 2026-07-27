import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

/** Outreach state the platform derives; never edited by hand. */
export type HostRelationshipDerivedState =
  | 'none' | 'pitched' | 'replied' | 'declined' | 'in_conversation' | 'booked' | 'suppressed'

/** The operator's own read of the relationship, independent of outreach. */
export type HostRelationshipManualStage = 'nurturing' | 'warm' | 'do_not_contact'

export type HostRelationshipClientIntent =
  | 'considering' | 'pitched' | 'placed' | 'declined' | 'ruled_out'

export interface HostRelationshipSummary {
  podcast_id: string
  podcast_name: string | null
  podcast_image_url: string | null
  host_name: string | null
  contact_email: string | null
  derived_state: HostRelationshipDerivedState
  manual_stage: HostRelationshipManualStage | null
  summary: string | null
  last_contacted_at: string | null
  touch_count: number
  booked_client_name: string | null
  client_count: number
  note_count: number
  last_note_at: string | null
  curated: boolean
}

export interface HostRelationshipEvent {
  id: string
  client_id: string | null
  kind: 'note' | 'call' | 'meeting' | 'stage_change' | 'system'
  body: string
  occurred_at: string
}

export interface HostRelationshipClient {
  client_id: string
  client_name: string | null
  intent: HostRelationshipClientIntent
  note: string | null
  created_at: string
}

export interface HostRelationshipThread {
  thread_key: string
  client_id: string | null
  client_name: string | null
  provider: 'instantly'
  latest_message_id: string | null
  subject: string | null
  lead_email: string | null
  from_email: string | null
  to_email: string | null
  latest_message_body: string | null
  latest_message_at: string | null
  campaign_id: string | null
  campaign_name: string | null
  created_at: string
  updated_at: string
}

export interface HostRelationshipDetail {
  relationship: {
    podcast_id: string
    podcast_name: string | null
    host_name: string | null
    contact_email: string | null
    manual_stage: HostRelationshipManualStage | null
    summary: string | null
    updated_at: string
  } | null
  derived: { state: HostRelationshipDerivedState; last_client_name: string | null; booked_client_name: string | null } | null
  clients: HostRelationshipClient[]
  events: HostRelationshipEvent[]
  threads: HostRelationshipThread[]
}

async function invokeHostRelationships<T>(body: Record<string, unknown>, message: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-host-relationships', { body })
  if (error) throw await toFunctionError(error, message)
  return data as T
}

export async function listHostRelationships(workspaceId: string): Promise<HostRelationshipSummary[]> {
  const data = await invokeHostRelationships<{ relationships: HostRelationshipSummary[] }>(
    { action: 'list', workspace_id: workspaceId.toLowerCase() },
    'The relationship book could not be loaded.',
  )
  return Array.isArray(data.relationships) ? data.relationships : []
}

export async function getHostRelationship(workspaceId: string, podcastId: string): Promise<HostRelationshipDetail> {
  const data = await invokeHostRelationships<HostRelationshipDetail>(
    { action: 'detail', workspace_id: workspaceId.toLowerCase(), podcast_id: podcastId },
    'The relationship could not be loaded.',
  )
  return {
    relationship: data.relationship ?? null,
    derived: data.derived ?? null,
    clients: Array.isArray(data.clients) ? data.clients : [],
    events: Array.isArray(data.events) ? data.events : [],
    threads: Array.isArray(data.threads) ? data.threads : [],
  }
}

export async function createHostRelationship(
  workspaceId: string,
  input: {
    podcastId?: string | null
    podcastName: string
    hostName?: string | null
    contactEmail?: string | null
    manualStage?: HostRelationshipManualStage | null
    summary?: string | null
  },
): Promise<{ podcast_id: string; created: boolean }> {
  const data = await invokeHostRelationships<{
    relationship: { podcast_id: string }
    created: boolean
  }>({
    action: 'create',
    workspace_id: workspaceId.toLowerCase(),
    ...(input.podcastId ? { podcast_id: input.podcastId } : {}),
    podcast_name: input.podcastName,
    host_name: input.hostName ?? null,
    contact_email: input.contactEmail ?? null,
    manual_stage: input.manualStage ?? null,
    summary: input.summary ?? null,
  }, 'The relationship could not be created.')
  if (!data?.relationship?.podcast_id) throw new Error('The relationship could not be created.')
  return { podcast_id: data.relationship.podcast_id, created: data.created === true }
}

export async function captureHostRelationshipThread(
  workspaceId: string,
  input: {
    podcastId?: string | null
    podcastName?: string | null
    hostName?: string | null
    contactEmail?: string | null
    threadKey: string
    clientId?: string | null
    provider?: 'instantly'
    messageId?: string | null
    subject?: string | null
    fromEmail?: string | null
    toEmail?: string | null
    body?: string | null
    receivedAt?: string | null
    campaignId?: string | null
    campaignName?: string | null
  },
): Promise<{
  podcast_id: string
  relationship_created: boolean
  thread_saved: boolean
  show_identified?: boolean
}> {
  return await invokeHostRelationships({
    action: 'thread-capture',
    workspace_id: workspaceId.toLowerCase(),
    podcast_id: input.podcastId ?? null,
    podcast_name: input.podcastName ?? null,
    host_name: input.hostName ?? null,
    contact_email: input.contactEmail ?? null,
    thread_key: input.threadKey,
    client_id: input.clientId ?? null,
    provider: input.provider ?? 'instantly',
    message_id: input.messageId ?? null,
    subject: input.subject ?? null,
    from_email: input.fromEmail ?? null,
    to_email: input.toEmail ?? null,
    body_text: input.body ?? null,
    received_at: input.receivedAt ?? null,
    campaign_id: input.campaignId ?? null,
    campaign_name: input.campaignName ?? null,
  }, 'The conversation could not be saved to the relationship book.')
}

export async function saveHostRelationship(
  workspaceId: string,
  input: {
    podcastId: string
    podcastName?: string | null
    hostName?: string | null
    contactEmail?: string | null
    manualStage?: HostRelationshipManualStage | null
    summary?: string | null
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    action: 'upsert',
    workspace_id: workspaceId.toLowerCase(),
    podcast_id: input.podcastId,
  }

  // This endpoint is a patch, not a replacement. Omitting an optional field
  // must preserve the operator's existing notes and stage; explicit null still
  // clears a field when that is what the caller requested.
  if (input.podcastName !== undefined) body.podcast_name = input.podcastName
  if (input.hostName !== undefined) body.host_name = input.hostName
  if (input.contactEmail !== undefined) body.contact_email = input.contactEmail
  if (input.manualStage !== undefined) body.manual_stage = input.manualStage
  if (input.summary !== undefined) body.summary = input.summary

  await invokeHostRelationships(body, 'The relationship could not be saved.')
}

export async function addHostRelationshipNote(
  workspaceId: string,
  input: { podcastId: string; body: string; kind?: 'note' | 'call' | 'meeting'; clientId?: string | null },
): Promise<void> {
  await invokeHostRelationships({
    action: 'note-add',
    workspace_id: workspaceId.toLowerCase(),
    podcast_id: input.podcastId,
    body_text: input.body,
    kind: input.kind ?? 'note',
    client_id: input.clientId ?? null,
  }, 'The note could not be saved.')
}

export async function linkHostRelationshipClient(
  workspaceId: string,
  input: { podcastId: string; clientId: string; intent?: HostRelationshipClientIntent; note?: string | null },
): Promise<void> {
  await invokeHostRelationships({
    action: 'client-link',
    workspace_id: workspaceId.toLowerCase(),
    podcast_id: input.podcastId,
    client_id: input.clientId,
    intent: input.intent ?? 'considering',
    note: input.note ?? null,
  }, 'The client could not be linked to this host.')
}

export async function unlinkHostRelationshipClient(
  workspaceId: string,
  input: { podcastId: string; clientId: string },
): Promise<void> {
  await invokeHostRelationships({
    action: 'client-unlink',
    workspace_id: workspaceId.toLowerCase(),
    podcast_id: input.podcastId,
    client_id: input.clientId,
  }, 'The client could not be removed from this host.')
}

/** Why an address is silenced. An opt-out is the host's decision, not ours. */
export type OutreachSuppressionReason = 'opted_out' | 'bounced' | 'manual'

export interface OutreachSuppression {
  contact_email: string
  reason: OutreachSuppressionReason
  /** 'inbox_auto' came from the reply prefilter; 'manual' from an operator. */
  source: 'inbox_auto' | 'manual'
  note: string | null
  created_at: string
  created_by_email: string | null
  host_name: string | null
  podcast_name: string | null
  podcast_id: string | null
  touch_count: number
}

export async function listOutreachSuppressions(workspaceId: string): Promise<OutreachSuppression[]> {
  const data = await invokeHostRelationships<{ suppressions: OutreachSuppression[] }>(
    { action: 'suppression-list', workspace_id: workspaceId.toLowerCase() },
    'The do-not-contact list could not be loaded.',
  )
  return Array.isArray(data.suppressions) ? data.suppressions : []
}

export async function addOutreachSuppression(
  workspaceId: string,
  input: { contactEmail: string; reason?: OutreachSuppressionReason; note?: string | null },
): Promise<void> {
  await invokeHostRelationships({
    action: 'suppression-add',
    workspace_id: workspaceId.toLowerCase(),
    contact_email: input.contactEmail,
    reason: input.reason ?? 'manual',
    note: input.note ?? null,
  }, 'The address could not be added to the do-not-contact list.')
}

/**
 * Reinstating means this platform will email someone recorded as not wanting
 * to hear from us, so the note is required rather than optional — it is what
 * the audit log carries alongside the deleted row's original evidence.
 */
export async function removeOutreachSuppression(
  workspaceId: string,
  input: { contactEmail: string; note: string },
): Promise<void> {
  await invokeHostRelationships({
    action: 'suppression-remove',
    workspace_id: workspaceId.toLowerCase(),
    contact_email: input.contactEmail,
    note: input.note,
  }, 'The address could not be removed from the do-not-contact list.')
}
