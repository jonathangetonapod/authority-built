/**
 * What a refused send actually means, and the one thing that resolves it.
 *
 * The edge function refuses with a precise code and a sentence written for the
 * person who has to act. That sentence is accurate but it ends the interaction:
 * "this host has already replied" leaves the operator holding a finished draft
 * with nowhere to take it. Each refusal here carries the move that follows it,
 * so a dead end becomes a next step.
 *
 * An unmapped code returns null on purpose. The raw server message is a better
 * fallback than invented guidance, and a new refusal added to the function
 * should degrade to the honest text rather than to something plausible.
 */

import type { WorkspaceModule } from '@/lib/workspaceRoutes'

export type CampaignErrorRemedy =
  /** Temporary. Running the same action again is the whole fix. */
  | { kind: 'retry'; label: string }
  /** Fixable in this dialog, on the contact step. */
  | { kind: 'contact'; label: string }
  /** The work belongs on another page. */
  | { kind: 'link'; label: string; module: WorkspaceModule }
  /** Nothing to offer: the refusal is final and correct. */
  | { kind: 'none' }

export interface CampaignErrorGuidance {
  title: string
  explanation: string
  remedy: CampaignErrorRemedy
}

const GUIDANCE: Record<string, CampaignErrorGuidance> = {
  CAMPAIGN_CONTACT_REQUIRED: {
    title: 'This podcast has no contact email yet',
    explanation: 'The pitch is written and saved. It needs an address to send to before it can join the campaign.',
    remedy: { kind: 'contact', label: 'Add a contact email' },
  },
  CAMPAIGN_CONTACT_SUPPRESSED: {
    title: 'This host asked not to be contacted',
    explanation: 'The block covers every client in this workspace, not just this one, so the pitch cannot be added for anybody. If it was set by mistake, it can be lifted in Relationships.',
    remedy: { kind: 'link', label: 'Open Relationships', module: 'relationships' },
  },
  CAMPAIGN_CONTACT_IN_CONVERSATION: {
    title: 'A conversation with this host is already open',
    explanation: 'Cold outreach on top of a live thread reads as a different agency writing twice. Continue the existing conversation instead.',
    remedy: { kind: 'link', label: 'Open Master Inbox', module: 'master-inbox' },
  },
  CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH: {
    title: 'This address is already in the campaign',
    explanation: 'The same contact is in outreach under another show. One person receiving two pitches from the same campaign experiences both, whatever the shows are called here.',
    remedy: { kind: 'link', label: 'Open the campaign', module: 'client-campaigns' },
  },
  CAMPAIGN_PITCH_LOCKED: {
    title: 'This pitch can no longer be edited',
    explanation: 'The host has already been sent a step of the sequence, or has replied. What they read cannot be unsent, so the copy is frozen to keep our record matching their inbox.',
    remedy: { kind: 'link', label: 'Open Master Inbox', module: 'master-inbox' },
  },
  CAMPAIGN_SETUP_IN_PROGRESS: {
    title: 'The campaign is still being created',
    explanation: 'Instantly is setting this campaign up. Nothing was lost — the draft is intact and sending it again in a moment will work.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_RELATIONSHIP_CHECK_FAILED: {
    title: 'The outreach history could not be checked',
    explanation: 'This check is what stops a pitch reaching someone who opted out, so the send stops rather than skipping it. Nothing was sent.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  CAMPAIGN_CONTACT_DEDUPE_FAILED: {
    title: 'The contact could not be checked for duplicates',
    explanation: 'The send stopped before creating anything, so this podcast is not in the campaign and no email went out.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_LEAD_NOT_CREATED: {
    title: 'Instantly did not add this contact',
    explanation: 'The campaign is connected but the contact was not accepted. Nothing was sent to the host.',
    remedy: { kind: 'retry', label: 'Try again' },
  },
  INSTANTLY_NOT_CONNECTED: {
    title: 'Instantly is not connected',
    explanation: 'Pitches can be written and saved without it, but joining a campaign needs the workspace API key. The workspace owner can add it on Client Campaigns.',
    remedy: { kind: 'link', label: 'Open Client Campaigns', module: 'client-campaigns' },
  },
  CAMPAIGN_SENDER_REQUIRED: {
    title: 'The campaign has no sending account',
    explanation: 'A campaign needs at least one active Instantly mailbox before it can send anything.',
    remedy: { kind: 'link', label: 'Open Mailboxes', module: 'mailboxes' },
  },
  CAMPAIGN_TARGET_NOT_APPROVED: {
    title: 'This podcast is not approved yet',
    explanation: 'Only podcasts the client has approved can join a campaign. The pitch stays saved until approval arrives.',
    remedy: { kind: 'none' },
  },
}

export function campaignErrorGuidance(
  code: string | null | undefined,
): CampaignErrorGuidance | null {
  if (!code) return null
  return GUIDANCE[code] || null
}

/**
 * `toFunctionError` puts the refusal code on `name`, falling back to a marker
 * when the response carried none. That marker is not a code.
 */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  return error.name && error.name !== 'EdgeFunctionError' && error.name !== 'Error'
    ? error.name
    : null
}
