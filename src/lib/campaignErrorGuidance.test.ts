import { describe, expect, it } from 'vitest'
import { campaignErrorGuidance, errorCode } from '@/lib/campaignErrorGuidance'

describe('campaignErrorGuidance', () => {
  it('sends a locked pitch to the conversation that locked it', () => {
    const guidance = campaignErrorGuidance('CAMPAIGN_PITCH_LOCKED')

    expect(guidance?.title).toBe('This pitch can no longer be edited')
    expect(guidance?.remedy).toEqual({ kind: 'link', label: 'Open Master Inbox', module: 'master-inbox' })
  })

  it('sends a suppression to the page where it can be lifted', () => {
    expect(campaignErrorGuidance('CAMPAIGN_CONTACT_SUPPRESSED')?.remedy).toEqual({
      kind: 'link',
      label: 'Open Relationships',
      module: 'relationships',
    })
  })

  it('keeps a missing contact in the dialog, on the step that fixes it', () => {
    expect(campaignErrorGuidance('CAMPAIGN_CONTACT_REQUIRED')?.remedy).toEqual({
      kind: 'contact',
      label: 'Add a contact email',
    })
  })

  // Setup races and failed checks are temporary: running the action again is
  // the whole fix, and nothing reached a host.
  it('offers a retry for the refusals that are only temporary', () => {
    for (const code of [
      'CAMPAIGN_SETUP_IN_PROGRESS',
      'CAMPAIGN_RELATIONSHIP_CHECK_FAILED',
      'CAMPAIGN_CONTACT_DEDUPE_FAILED',
      'INSTANTLY_LEAD_NOT_CREATED',
    ]) {
      expect(campaignErrorGuidance(code)?.remedy.kind, code).toBe('retry')
    }
  })

  it('offers nothing when the refusal is final and correct', () => {
    expect(campaignErrorGuidance('CAMPAIGN_TARGET_NOT_APPROVED')?.remedy).toEqual({ kind: 'none' })
  })

  // A refusal added to the edge function later must degrade to the server's own
  // words rather than to guidance somebody invented for it.
  it('has nothing to say about a code it does not know', () => {
    expect(campaignErrorGuidance('SOME_NEW_REFUSAL')).toBeNull()
    expect(campaignErrorGuidance(null)).toBeNull()
    expect(campaignErrorGuidance(undefined)).toBeNull()
    expect(campaignErrorGuidance('')).toBeNull()
  })
})

describe('errorCode', () => {
  it('reads the code toFunctionError left on the error', () => {
    const error = new Error('This host has already replied. (CAMPAIGN_PITCH_LOCKED)')
    error.name = 'CAMPAIGN_PITCH_LOCKED'

    expect(errorCode(error)).toBe('CAMPAIGN_PITCH_LOCKED')
  })

  it('does not mistake the uncoded markers for a code', () => {
    const uncoded = new Error('Failed to fetch')
    uncoded.name = 'EdgeFunctionError'

    expect(errorCode(uncoded)).toBeNull()
    expect(errorCode(new Error('plain'))).toBeNull()
    expect(errorCode('not an error')).toBeNull()
    expect(errorCode(null)).toBeNull()
  })
})
