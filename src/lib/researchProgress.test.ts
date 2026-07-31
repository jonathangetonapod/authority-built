import { describe, expect, it } from 'vitest'
import {
  isResearchRunStale,
  RESEARCH_LOCK_STALE_AFTER_MS,
  RESEARCH_UI_STALE_AFTER_MS,
} from '@/lib/researchProgress'

const NOW = Date.parse('2026-07-31T12:00:00.000Z')
const agoMs = (ms: number) => new Date(NOW - ms).toISOString()

describe('isResearchRunStale', () => {
  // The case this exists for: a run wrote progress on 2026-07-29 and never
  // reached a terminal status, and the modal spun on it for two days.
  it('calls a run stale when nothing has been written for days', () => {
    expect(isResearchRunStale(
      { status: 'running', updated_at: '2026-07-29T12:42:38.669Z' },
      NOW,
    )).toBe(true)
  })

  it('leaves a run that wrote a moment ago alone', () => {
    expect(isResearchRunStale({ status: 'running', updated_at: agoMs(5_000) }, NOW)).toBe(false)
    expect(isResearchRunStale({ status: 'queued', updated_at: agoMs(60_000) }, NOW)).toBe(false)
  })

  // The threshold sits above the backend's lock expiry on purpose: this is
  // judged on the browser's clock, and a viewer running fast must not be told
  // a live run has stopped.
  it('stays patient past the point the backend would reclaim the lock', () => {
    const justPastLock = RESEARCH_LOCK_STALE_AFTER_MS + 1_000
    expect(justPastLock).toBeLessThan(RESEARCH_UI_STALE_AFTER_MS)
    expect(isResearchRunStale({ status: 'running', updated_at: agoMs(justPastLock) }, NOW)).toBe(false)
  })

  it('gives up once past its own threshold', () => {
    expect(isResearchRunStale(
      { status: 'running', updated_at: agoMs(RESEARCH_UI_STALE_AFTER_MS - 1_000) },
      NOW,
    )).toBe(false)
    expect(isResearchRunStale(
      { status: 'running', updated_at: agoMs(RESEARCH_UI_STALE_AFTER_MS + 1_000) },
      NOW,
    )).toBe(true)
  })

  // A finished run is not stale however old it is, or reopening an old podcast
  // would report that its completed research had stopped.
  it('never calls a settled run stale', () => {
    for (const status of ['completed', 'failed', 'blocked']) {
      expect(isResearchRunStale({ status, updated_at: '2020-01-01T00:00:00.000Z' }, NOW)).toBe(false)
    }
  })

  // An unusable timestamp is not evidence of death. Guessing turns a field we
  // failed to read into a false "your run stopped".
  it('holds its judgement when there is no usable timestamp', () => {
    expect(isResearchRunStale(null, NOW)).toBe(false)
    expect(isResearchRunStale(undefined, NOW)).toBe(false)
    expect(isResearchRunStale({ status: 'running' }, NOW)).toBe(false)
    expect(isResearchRunStale({ status: 'running', updated_at: '' }, NOW)).toBe(false)
    expect(isResearchRunStale({ status: 'running', updated_at: 'not a date' }, NOW)).toBe(false)
  })

  // A server clock slightly ahead of the browser yields a future timestamp.
  // That is the opposite of stale and must never read as elapsed time.
  it('treats a timestamp from the future as fresh', () => {
    expect(isResearchRunStale({ status: 'running', updated_at: agoMs(-60_000) }, NOW)).toBe(false)
  })
})
