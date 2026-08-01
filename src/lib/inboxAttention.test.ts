import { describe, expect, it } from 'vitest'
import {
  describeWait,
  sortThreadsForAttention,
  waitIsOverdue,
  type InboxAttentionStatus,
} from '@/lib/inboxAttention'

const now = new Date('2026-08-01T12:00:00Z')

const thread = (id: string, receivedAt: string | null, status: InboxAttentionStatus) => (
  { id, received_at: receivedAt, status }
)

describe('sortThreadsForAttention', () => {
  // The old sort was newest-first everywhere, which put a fresh handled thread
  // above a host who had been waiting three days for an answer.
  it('puts the longest-waiting unanswered host first', () => {
    const sorted = sortThreadsForAttention([
      thread('fresh-replied', '2026-08-01T11:00:00Z', 'replied'),
      thread('waiting-3d', '2026-07-29T11:00:00Z', 'needs_reply'),
      thread('waiting-1h', '2026-08-01T11:00:00Z', 'needs_reply'),
    ], (item) => item.status)

    expect(sorted.map((item) => item.id)).toEqual(['waiting-3d', 'waiting-1h', 'fresh-replied'])
  })

  it('ranks unanswered above review above handled above archived', () => {
    const sorted = sortThreadsForAttention([
      thread('archived', '2026-08-01T11:00:00Z', 'archived'),
      thread('booked', '2026-08-01T10:00:00Z', 'booked'),
      thread('review', '2026-08-01T09:00:00Z', 'review'),
      thread('needs', '2026-08-01T08:00:00Z', 'needs_reply'),
    ], (item) => item.status)

    expect(sorted.map((item) => item.id)).toEqual(['needs', 'review', 'booked', 'archived'])
  })

  // Recency is the right order only once nothing is owed.
  it('keeps handled threads newest first', () => {
    const sorted = sortThreadsForAttention([
      thread('older', '2026-07-30T11:00:00Z', 'replied'),
      thread('newer', '2026-08-01T11:00:00Z', 'replied'),
    ], (item) => item.status)

    expect(sorted.map((item) => item.id)).toEqual(['newer', 'older'])
  })
})

describe('describeWait', () => {
  it('phrases the wait at the scale it is felt', () => {
    expect(describeWait('2026-08-01T11:30:00Z', now)).toBe('waiting <1h')
    expect(describeWait('2026-08-01T05:00:00Z', now)).toBe('waiting 7h')
    expect(describeWait('2026-07-29T12:00:00Z', now)).toBe('waiting 3d')
  })

  // A missing or garbage timestamp must not render as "waiting 20,000d".
  it('says nothing when there is nothing to say', () => {
    expect(describeWait(null, now)).toBeNull()
    expect(describeWait('not a date', now)).toBeNull()
    expect(describeWait('2026-08-02T12:00:00Z', now)).toBeNull()
  })
})

describe('waitIsOverdue', () => {
  // Two days of silence after a warm reply is where the booking starts dying.
  it('turns at two days', () => {
    expect(waitIsOverdue('2026-07-30T13:00:00Z', now)).toBe(false)
    expect(waitIsOverdue('2026-07-30T11:00:00Z', now)).toBe(true)
    expect(waitIsOverdue(null, now)).toBe(false)
  })
})
