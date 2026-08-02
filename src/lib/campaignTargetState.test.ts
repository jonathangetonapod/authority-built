import { describe, expect, it } from 'vitest'
import { isTargetInActiveOutreach, pitchActionLabel } from '@/lib/campaignTargetState'

describe('isTargetInActiveOutreach', () => {
  it('is false for a podcast that has never been sent', () => {
    expect(isTargetInActiveOutreach(null)).toBe(false)
    expect(isTargetInActiveOutreach(undefined)).toBe(false)
    expect(isTargetInActiveOutreach({ status: 'draft', instantly_lead_id: null })).toBe(false)
    expect(isTargetInActiveOutreach({ status: 'ready', instantly_lead_id: null })).toBe(false)
  })

  it('is true once outreach has left the building', () => {
    for (const status of ['launching', 'in_outreach', 'replied', 'completed']) {
      expect(isTargetInActiveOutreach({ status, instantly_lead_id: null })).toBe(true)
    }
  })

  // The provider already has the person; the row's status catching up is our
  // bookkeeping, not their inbox.
  it('is true when a lead exists whatever the status says', () => {
    expect(isTargetInActiveOutreach({ status: 'draft', instantly_lead_id: 'lead-1' })).toBe(true)
  })
})

describe('pitchActionLabel', () => {
  it('does not offer to write what the next screen will not let you write', () => {
    expect(pitchActionLabel({ inActiveOutreach: true, previouslyContacted: false })).toBe('View Pitch')
    // In outreach outranks prior contact: the sequence is locked either way.
    expect(pitchActionLabel({ inActiveOutreach: true, previouslyContacted: true })).toBe('View Pitch')
  })

  it('distinguishes a second attempt from a first', () => {
    expect(pitchActionLabel({ inActiveOutreach: false, previouslyContacted: true })).toBe('Write Re-pitch')
    expect(pitchActionLabel({ inActiveOutreach: false, previouslyContacted: false })).toBe('Write Pitch')
  })
})
