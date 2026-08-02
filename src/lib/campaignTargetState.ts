/**
 * Whether a podcast has already gone into the campaign.
 *
 * The pitch dialog computed this to decide whether to lock the sequence, but
 * the shortlist row it opens from could not see it, so a podcast already in
 * active outreach still offered "Write Pitch" — a button promising work the
 * next screen refuses to let you do. The predicate lives here so the label and
 * the lock are the same judgement rather than two that can disagree.
 */

/** The statuses that mean outreach has left the building. */
export const ACTIVE_OUTREACH_STATUSES = ['launching', 'in_outreach', 'replied', 'completed']

export function isTargetInActiveOutreach(
  target: { instantly_lead_id?: string | null; status?: string | null } | null | undefined,
): boolean {
  if (!target) return false
  // A lead id means the provider already has the person, whatever the row's
  // status has caught up to saying.
  if (target.instantly_lead_id) return true
  return ACTIVE_OUTREACH_STATUSES.includes(target.status ?? '')
}

/**
 * What the button on a shortlist row should say.
 *
 * Three states, and only one of them is an invitation to write something: a
 * podcast in outreach can be opened and read but not rewritten, and one that
 * was contacted before is a deliberate second attempt rather than a first.
 */
export function pitchActionLabel(
  input: { inActiveOutreach: boolean; previouslyContacted: boolean },
): string {
  if (input.inActiveOutreach) return 'View Pitch'
  return input.previouslyContacted ? 'Write Re-pitch' : 'Write Pitch'
}
