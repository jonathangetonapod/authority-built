import { describe, expect, it } from 'vitest'
import { describeQuiet, quietConversations } from '@/lib/relationshipAttention'

const now = new Date('2026-08-01T12:00:00Z')

const row = (id: string, state: string, lastContactedAt: string | null) => (
  { podcast_id: id, podcast_name: id, derived_state: state, last_contacted_at: lastContactedAt }
)

describe('quietConversations', () => {
  // A live conversation gone silent is a placement dying quietly, and recency
  // sort put exactly these rows at the bottom of the page.
  it('surfaces only live conversations past the quiet threshold', () => {
    const rows = quietConversations([
      row('quiet-6d', 'in_conversation', '2026-07-26T12:00:00Z'),
      row('active-yesterday', 'in_conversation', '2026-07-31T12:00:00Z'),
      row('old-but-booked', 'booked', '2026-07-01T12:00:00Z'),
      row('old-but-declined', 'declined', '2026-07-01T12:00:00Z'),
    ], now)

    expect(rows.map((item) => item.podcast_id)).toEqual(['quiet-6d'])
  })

  it('orders the longest silence first', () => {
    const rows = quietConversations([
      row('quiet-6d', 'in_conversation', '2026-07-26T12:00:00Z'),
      row('quiet-12d', 'in_conversation', '2026-07-20T12:00:00Z'),
    ], now)

    expect(rows.map((item) => item.podcast_id)).toEqual(['quiet-12d', 'quiet-6d'])
  })

  // Five days, not the inbox's two: a relationship touch is a slower cadence,
  // and flagging every three-day gap would bury the genuinely stalled.
  it('leaves the merely unhurried alone', () => {
    expect(quietConversations([
      row('quiet-4d', 'in_conversation', '2026-07-28T12:00:00Z'),
    ], now)).toEqual([])
  })

  it('never flags a row it cannot date', () => {
    expect(quietConversations([
      row('undated', 'in_conversation', null),
      row('garbage', 'in_conversation', 'not a date'),
    ], now)).toEqual([])
  })
})

describe('describeQuiet', () => {
  it('phrases the silence in days', () => {
    expect(describeQuiet('2026-07-26T12:00:00Z', now)).toBe('quiet 6d')
    expect(describeQuiet(null, now)).toBeNull()
  })
})
