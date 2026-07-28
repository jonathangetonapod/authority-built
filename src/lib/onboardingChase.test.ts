import { describe, expect, it } from 'vitest'
import { onboardingChaseState, type OnboardingChaseInput } from '@/lib/onboardingChase'

const NOW = Date.parse('2026-07-28T12:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString()
}

function daysAhead(days: number): string {
  return new Date(NOW + days * 86_400_000).toISOString()
}

function instance(overrides: Partial<OnboardingChaseInput> = {}): OnboardingChaseInput {
  return {
    status: 'invited',
    invited_at: daysAgo(1),
    viewed_at: null,
    started_at: null,
    submitted_at: null,
    changes_requested_at: null,
    capability_expires_at: daysAhead(13),
    archived_at: null,
    ...overrides,
  }
}

describe('onboardingChaseState', () => {
  it('leaves a fresh invitation alone', () => {
    const state = onboardingChaseState(instance(), NOW)
    expect(state.needsChasing).toBe(false)
    expect(state.ageDays).toBe(1)
    expect(state.expiresInDays).toBe(13)
  })

  it('flags an invitation that was never opened', () => {
    const state = onboardingChaseState(instance({ invited_at: daysAgo(5) }), NOW)
    expect(state.needsChasing).toBe(true)
    expect(state.reason).toBe('Sent 5 days ago and never opened')
  })

  it('waits the full window before calling an unopened invitation cold', () => {
    expect(onboardingChaseState(instance({ invited_at: daysAgo(2) }), NOW).needsChasing).toBe(false)
    expect(onboardingChaseState(instance({ invited_at: daysAgo(3) }), NOW).needsChasing).toBe(true)
  })

  it('tells a client who started from one who only looked', () => {
    const started = onboardingChaseState(instance({
      status: 'in_progress',
      invited_at: daysAgo(9),
      viewed_at: daysAgo(9),
      started_at: daysAgo(8),
    }), NOW)
    expect(started.reason).toBe('Started 9 days ago and not finished')

    const looked = onboardingChaseState(instance({
      invited_at: daysAgo(9),
      viewed_at: daysAgo(9),
    }), NOW)
    expect(looked.reason).toBe('Opened 9 days ago and not started')
  })

  it('flags a link about to die even on a young invitation', () => {
    const state = onboardingChaseState(instance({ capability_expires_at: daysAhead(2) }), NOW)
    expect(state.needsChasing).toBe(true)
    expect(state.reason).toBe('The link expires in 2 days')
  })

  it('says a live onboarding whose link already died', () => {
    // The status is still invited because nothing sweeps it; the client gets an
    // error rather than a form, and nobody is told.
    const state = onboardingChaseState(instance({ capability_expires_at: daysAgo(1) }), NOW)
    expect(state.reason).toBe('The link has expired')
    expect(state.expiresInDays).toBe(-1)
  })

  it('puts a dead link ahead of a nudge the client could not act on', () => {
    // Telling somebody to chase is wrong when the form cannot be opened.
    const state = onboardingChaseState(instance({
      invited_at: daysAgo(20),
      capability_expires_at: daysAgo(2),
    }), NOW)
    expect(state.reason).toBe('The link has expired')
  })

  it('keeps chasing a change request the client never answered', () => {
    // The database leaves submitted_at set when answers are sent back, so a
    // check on submitted_at alone would call this finished forever.
    const state = onboardingChaseState(instance({
      status: 'changes_requested',
      invited_at: daysAgo(30),
      viewed_at: daysAgo(30),
      started_at: daysAgo(29),
      submitted_at: daysAgo(20),
      changes_requested_at: daysAgo(9),
    }), NOW)
    expect(state.needsChasing).toBe(true)
    expect(state.reason).toBe('Changes requested 9 days ago with no reply')
  })

  it('stops once the client resubmits after a change request', () => {
    const state = onboardingChaseState(instance({
      status: 'changes_requested',
      invited_at: daysAgo(30),
      viewed_at: daysAgo(30),
      started_at: daysAgo(29),
      changes_requested_at: daysAgo(9),
      submitted_at: daysAgo(1),
    }), NOW)
    expect(state.needsChasing).toBe(false)
  })

  it('gives a fresh change request the same grace as a new invitation', () => {
    const state = onboardingChaseState(instance({
      status: 'changes_requested',
      invited_at: daysAgo(30),
      viewed_at: daysAgo(30),
      submitted_at: daysAgo(20),
      changes_requested_at: daysAgo(2),
    }), NOW)
    expect(state.needsChasing).toBe(false)
  })

  it('stops chasing once the client has submitted', () => {
    const state = onboardingChaseState(instance({
      status: 'submitted',
      invited_at: daysAgo(30),
      viewed_at: daysAgo(30),
      started_at: daysAgo(30),
      submitted_at: daysAgo(1),
      capability_expires_at: daysAgo(1),
    }), NOW)
    expect(state.needsChasing).toBe(false)
    expect(state.reason).toBeNull()
  })

  it.each(['approved', 'expired', 'revoked'] as const)('never chases a %s onboarding', (status) => {
    expect(onboardingChaseState(instance({ status, invited_at: daysAgo(40) }), NOW).needsChasing).toBe(false)
  })

  it('never chases an archived onboarding', () => {
    const state = onboardingChaseState(instance({ invited_at: daysAgo(40), archived_at: daysAgo(2) }), NOW)
    expect(state.needsChasing).toBe(false)
  })

  it('stays quiet rather than guessing when a date is unusable', () => {
    const state = onboardingChaseState(instance({ invited_at: 'not a date' }), NOW)
    expect(state.ageDays).toBeNull()
    expect(state.needsChasing).toBe(false)
  })
})
