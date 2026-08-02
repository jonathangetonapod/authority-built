import { describe, expect, it } from 'vitest'
import {
  RELATIONSHIP_MANUAL_STAGE_VIEW,
  RELATIONSHIP_STATE_VIEW,
  relationshipBadge,
} from '@/lib/relationshipLabels'

const summary = (
  derived_state: Parameters<typeof relationshipBadge>[0]['derived_state'],
  manual_stage: Parameters<typeof relationshipBadge>[0]['manual_stage'] = null,
) => ({ derived_state, manual_stage })

describe('relationshipBadge', () => {
  it('says nothing about a host nobody has contacted', () => {
    // Every podcast in the catalogue is this one. A badge on all of them says
    // nothing and hides the ones that matter.
    expect(relationshipBadge(summary('none'))).toBeNull()
  })

  it('reports what actually happened', () => {
    expect(relationshipBadge(summary('booked'))?.label).toBe('Placed a guest')
    expect(relationshipBadge(summary('declined'))?.label).toBe('Passed')
    expect(relationshipBadge(summary('in_conversation'))?.label).toBe('In conversation')
  })

  // The only marking that exists to stop somebody pitching, so it cannot sit
  // underneath a cheerful "Replied".
  it('lets a person\'s do-not-contact override the outreach data', () => {
    expect(relationshipBadge(summary('replied', 'do_not_contact'))?.label)
      .toBe('Marked do not contact')
    expect(relationshipBadge(summary('booked', 'do_not_contact'))?.label)
      .toBe('Marked do not contact')
  })

  it('falls back to the manual stage only when nothing has happened yet', () => {
    expect(relationshipBadge(summary('none', 'warm'))?.label).toBe('Warm relationship')
    // What happened outranks what someone meant to happen next.
    expect(relationshipBadge(summary('replied', 'warm'))?.label).toBe('Replied')
  })

  it('names every state, so a new one cannot render blank', () => {
    for (const view of Object.values(RELATIONSHIP_STATE_VIEW)) {
      expect(view.label.length).toBeGreaterThan(0)
      expect(view.className.length).toBeGreaterThan(0)
    }
    for (const view of Object.values(RELATIONSHIP_MANUAL_STAGE_VIEW)) {
      expect(view.label.length).toBeGreaterThan(0)
    }
  })
})
