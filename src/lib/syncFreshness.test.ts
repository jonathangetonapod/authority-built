import { describe, expect, it } from 'vitest'
import { describeSyncFreshness } from '@/lib/syncFreshness'

const now = Date.parse('2026-08-01T12:00:00Z')
const ago = (ms: number) => new Date(now - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('describeSyncFreshness', () => {
  it('says nothing when there are no campaigns to describe', () => {
    expect(describeSyncFreshness([], now)).toBeNull()
  })

  it('reads a recent sync as fresh', () => {
    expect(describeSyncFreshness([ago(30_000)], now)).toEqual({ label: 'Totals synced just now', stale: false })
    expect(describeSyncFreshness([ago(9 * MINUTE)], now)).toEqual({ label: 'Totals synced 9 minutes ago', stale: false })
    expect(describeSyncFreshness([ago(3 * HOUR)], now)).toEqual({ label: 'Totals synced 3 hours ago', stale: false })
  })

  it('singularizes a one-unit age', () => {
    expect(describeSyncFreshness([ago(HOUR)], now).label).toBe('Totals synced 1 hour ago')
    expect(describeSyncFreshness([ago(DAY + HOUR)], now).label).toBe('Totals synced 1 day ago')
  })

  // The point of the whole helper: the weakest link sets the age, because the
  // totals include the campaign that has not reported in a week.
  it('reports the oldest sync, not the newest', () => {
    const freshness = describeSyncFreshness([ago(MINUTE), ago(7 * DAY), ago(2 * MINUTE)], now)

    expect(freshness).toEqual({ label: 'Totals synced 7 days ago', stale: true })
  })

  it('marks anything past a day as stale', () => {
    expect(describeSyncFreshness([ago(23 * HOUR)], now).stale).toBe(false)
    expect(describeSyncFreshness([ago(25 * HOUR)], now).stale).toBe(true)
  })

  it('names campaigns that have never synced instead of hiding them behind the ones that did', () => {
    expect(describeSyncFreshness([ago(MINUTE), null], now)).toEqual({
      label: '1 campaign has never synced from Instantly',
      stale: true,
    })
    expect(describeSyncFreshness([ago(MINUTE), null, undefined], now)).toEqual({
      label: '2 campaigns have never synced from Instantly',
      stale: true,
    })
  })

  it('does not claim freshness for timestamps it cannot read', () => {
    expect(describeSyncFreshness([null], now)).toEqual({
      label: 'Totals have never been synced from Instantly',
      stale: true,
    })
    expect(describeSyncFreshness(['not-a-date'], now)).toEqual({
      label: 'Totals have never been synced from Instantly',
      stale: true,
    })
  })

  // A workstation clock running fast would otherwise render a negative age.
  it('does not turn a future timestamp into an age', () => {
    expect(describeSyncFreshness([new Date(now + HOUR).toISOString()], now)).toEqual({
      label: 'Totals synced just now',
      stale: false,
    })
  })
})
