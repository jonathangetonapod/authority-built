import { describe, expect, it } from 'vitest'
import { describeNextSend, projectNextSend } from '@/lib/nextSend'

const base = {
  leadStatus: 1,
  campaignStatus: 1,
  lastContactAt: null as string | null,
  sendDays: [1, 2, 3, 4, 5],
  windowStart: '09:00',
  timezone: 'America/Detroit',
  followUpOneDelayDays: 6,
}
// A Wednesday, inside the window.
const wed = new Date('2026-08-05T14:00:00Z')

describe('projectNextSend', () => {
  // Instantly reports none of these as "nothing more will send", so the reason
  // has to be derived and stated rather than left as an empty cell.
  it('says nothing further is coming when the sequence is over', () => {
    for (const [status, fragment] of [[3, /finished/i], [-1, /bounced/i], [-2, /unsubscribed/i], [-3, /skipped/i]] as const) {
      const result = projectNextSend({ ...base, leadStatus: status }, wed)
      expect(result.kind, String(status)).toBe('none')
      if (result.kind === 'none') expect(result.reason).toMatch(fragment)
    }
  })

  it('separates a hold somebody can lift from an ending they cannot', () => {
    expect(projectNextSend({ ...base, leadStatus: 2 }, wed).kind).toBe('held')
    expect(projectNextSend({ ...base, campaignStatus: 2 }, wed).kind).toBe('held')
    expect(projectNextSend({ ...base, sendDays: [] }, wed).kind).toBe('held')
  })

  // Never contacted, campaign live, inside a sending day: the first email is
  // due now, and that is not a guess about which step comes next.
  it('is due now when nothing has been sent and the campaign is sending', () => {
    const result = projectNextSend(base, wed)
    expect(result.kind).toBe('due')
    if (result.kind === 'due') expect(result.at.getTime()).toBe(wed.getTime())
  })

  // Six days after a Wednesday is a Tuesday, which is a sending day.
  it('waits the follow-up gap after the last email', () => {
    const result = projectNextSend({ ...base, lastContactAt: '2026-08-05T14:00:00Z' }, wed)
    expect(result.kind).toBe('due')
    if (result.kind === 'due') expect(result.at.toISOString().slice(0, 10)).toBe('2026-08-11')
  })

  // Six days after a Thursday is a Wednesday... but with a weekend-only gap the
  // walk-forward has to skip to the next allowed day rather than land on one
  // the campaign never sends on.
  it('skips forward to a day the campaign actually sends on', () => {
    const result = projectNextSend(
      { ...base, sendDays: [1], lastContactAt: '2026-08-05T14:00:00Z' },
      wed,
    )
    expect(result.kind).toBe('due')
    // 11 Aug is a Tuesday; the next Monday is the 17th.
    if (result.kind === 'due') expect(result.at.toISOString().slice(0, 10)).toBe('2026-08-17')
  })

  // The provider gives no forward-looking field at all, so this is arithmetic
  // and must never read as a promise.
  it('never claims more than the earliest it could go', () => {
    const result = projectNextSend({ ...base, lastContactAt: '2026-08-05T14:00:00Z' }, wed)
    expect(describeNextSend(result)).toMatch(/^No earlier than/)
    if (result.kind === 'due') expect(result.approximate).toBe(true)
  })
})
