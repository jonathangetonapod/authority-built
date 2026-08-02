import type {
  HostRelationshipDerivedState,
  HostRelationshipManualStage,
  HostRelationshipSummary,
} from '@/services/hostRelationships'

/**
 * What a relationship with a host is called, in one place.
 *
 * These labels started on the relationship book, which is the only page that
 * used them. The podcast database now needs the same words: someone browsing
 * podcasts to pitch has to see that this host already passed, or is mid
 * conversation, or is marked do not contact — and a second vocabulary invented
 * there would mean the same relationship reading two different ways depending
 * on which page you opened.
 */

export const RELATIONSHIP_STATE_VIEW: Record<
  HostRelationshipDerivedState,
  { label: string; className: string }
> = {
  in_conversation: { label: 'In conversation', className: 'border-sky-200 bg-sky-50 text-sky-900' },
  booked: { label: 'Placed a guest', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  replied: { label: 'Replied', className: 'border-violet-200 bg-violet-50 text-violet-900' },
  declined: { label: 'Passed', className: 'border-amber-200 bg-amber-50 text-amber-900' },
  suppressed: { label: 'Do not contact', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
  pitched: { label: 'Pitched, no reply', className: 'border-muted bg-muted/50 text-muted-foreground' },
  none: { label: 'Not contacted', className: 'border-muted bg-muted/30 text-muted-foreground' },
}

export const RELATIONSHIP_MANUAL_STAGE_VIEW: Record<
  HostRelationshipManualStage,
  { label: string; className: string }
> = {
  nurturing: { label: 'Nurturing', className: 'border-indigo-200 bg-indigo-50 text-indigo-900' },
  warm: { label: 'Warm relationship', className: 'border-orange-200 bg-orange-50 text-orange-900' },
  do_not_contact: { label: 'Marked do not contact', className: 'border-destructive/30 bg-destructive/5 text-destructive' },
}

export interface RelationshipBadge {
  label: string
  className: string
}

/**
 * The one thing worth saying about a relationship where there is room for one
 * badge, not two.
 *
 * A person's own do-not-contact overrides whatever the outreach data implies,
 * because it is the only marking that exists to stop somebody pitching, and it
 * would be worse than useless underneath a cheerful "Replied". Otherwise the
 * derived state wins: it is what actually happened, where a manual stage is
 * only what someone meant to happen next.
 *
 * A relationship that has never been contacted returns null. On the podcast
 * database that is every podcast in the catalogue, and a badge on all of them
 * says nothing while making the ones that matter harder to see.
 */
export function relationshipBadge(
  relationship: Pick<HostRelationshipSummary, 'derived_state' | 'manual_stage'>,
): RelationshipBadge | null {
  if (relationship.manual_stage === 'do_not_contact') {
    return RELATIONSHIP_MANUAL_STAGE_VIEW.do_not_contact
  }
  if (relationship.derived_state !== 'none') {
    return RELATIONSHIP_STATE_VIEW[relationship.derived_state] ?? null
  }
  if (relationship.manual_stage) {
    return RELATIONSHIP_MANUAL_STAGE_VIEW[relationship.manual_stage]
  }
  return null
}
