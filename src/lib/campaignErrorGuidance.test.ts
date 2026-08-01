import { describe, expect, it } from 'vitest'
import {
  campaignErrorGuidance,
  campaignErrorReport,
  errorCode,
  errorStatus,
} from '@/lib/campaignErrorGuidance'

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

  // A campaign deleted in Instantly leaves the client mapped to an ID that
  // 404s on every send. The refusal is permanent until setup is re-run, so a
  // retry here would loop an operator forever.
  it('sends a deleted Instantly campaign to the page that rebuilds it', () => {
    const guidance = campaignErrorGuidance('INSTANTLY_RESOURCE_NOT_FOUND')

    expect(guidance?.title).toBe('The Instantly campaign for this client no longer exists')
    expect(guidance?.remedy).toEqual({
      kind: 'link',
      label: 'Open Client Campaigns',
      module: 'client-campaigns',
    })
  })

  // A bad key, a missing scope, and a dead mapping all surface on the same
  // button, and they are fixed by different people. They must not collapse
  // into one message.
  it('separates the provider faults that need a reconnect', () => {
    for (const code of [
      'INSTANTLY_KEY_REJECTED',
      'INSTANTLY_SCOPE_REQUIRED',
      'INSTANTLY_WORKSPACE_MISMATCH',
      'INSTANTLY_CREDENTIAL_INVALID',
    ]) {
      expect(campaignErrorGuidance(code)?.remedy, code).toEqual({
        kind: 'link',
        label: 'Open Client Campaigns',
        module: 'client-campaigns',
      })
    }
    const titles = new Set(
      ['INSTANTLY_KEY_REJECTED', 'INSTANTLY_SCOPE_REQUIRED', 'INSTANTLY_WORKSPACE_MISMATCH']
        .map((code) => campaignErrorGuidance(code)?.title),
    )
    expect(titles.size).toBe(3)
  })

  it('offers a retry for the provider faults that pass on their own', () => {
    for (const code of ['INSTANTLY_RATE_LIMITED', 'INSTANTLY_REQUEST_FAILED', 'INSTANTLY_RESPONSE_INVALID']) {
      expect(campaignErrorGuidance(code)?.remedy.kind, code).toBe('retry')
    }
  })

  it('sends an unavailable sender to Mailboxes and a dead plan nowhere', () => {
    expect(campaignErrorGuidance('INSTANTLY_SENDER_UNAVAILABLE')?.remedy).toEqual({
      kind: 'link',
      label: 'Open Mailboxes',
      module: 'mailboxes',
    })
    expect(campaignErrorGuidance('INSTANTLY_PLAN_REQUIRED')?.remedy).toEqual({ kind: 'none' })
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

describe('errorStatus', () => {
  it('reads the status toFunctionError left on the error', () => {
    const error = Object.assign(new Error('refused'), { status: 409 })

    expect(errorStatus(error)).toBe(409)
  })

  it('has no status for a failure that never reached a response', () => {
    expect(errorStatus(new Error('Failed to fetch'))).toBeNull()
    expect(errorStatus(Object.assign(new Error('x'), { status: 'nope' }))).toBeNull()
    expect(errorStatus(null)).toBeNull()
  })
})

describe('campaignErrorReport', () => {
  it('names the code, the status, and what it happened on', () => {
    const report = campaignErrorReport({
      code: 'INSTANTLY_RESOURCE_NOT_FOUND',
      status: 409,
      message: 'The mapped Instantly resource no longer exists',
      context: { client: 'Dallas Fontaine', podcast: 'Digital Wisdom' },
    })

    expect(report).toBe([
      'code: INSTANTLY_RESOURCE_NOT_FOUND',
      'status: 409',
      'message: The mapped Instantly resource no longer exists',
      'client: Dallas Fontaine',
      'podcast: Digital Wisdom',
    ].join('\n'))
  })

  // A report is pasted into a message to somebody else. Blank lines read as
  // missing information rather than as inapplicable context.
  it('drops the context nobody filled in', () => {
    const report = campaignErrorReport({
      code: null,
      status: null,
      message: 'Failed to fetch',
      context: { client: 'Dallas Fontaine', podcast: undefined, campaign: '   ' },
    })

    expect(report).toBe([
      'code: none',
      'status: none',
      'message: Failed to fetch',
      'client: Dallas Fontaine',
    ].join('\n'))
  })
})
