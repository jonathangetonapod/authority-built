import { describe, expect, it } from 'vitest'
import { googleCalendarUrl } from '@/lib/calendarLinks'

describe('googleCalendarUrl', () => {
  it('builds an all-day event ending the following day', () => {
    const url = googleCalendarUrl({ title: 'Recording: Founder Stories', day: '2026-08-04' })
    const params = new URL(url as string).searchParams

    expect(url).toContain('https://calendar.google.com/calendar/render?')
    expect(params.get('action')).toBe('TEMPLATE')
    expect(params.get('text')).toBe('Recording: Founder Stories')
    // Google treats the end of an all-day range as exclusive: same-day start
    // and end produces a zero-length event some calendars silently drop.
    expect(params.get('dates')).toBe('20260804/20260805')
  })

  it('rolls the exclusive end across month and year boundaries', () => {
    expect(new URL(googleCalendarUrl({ title: 'A', day: '2026-08-31' }) as string).searchParams.get('dates'))
      .toBe('20260831/20260901')
    expect(new URL(googleCalendarUrl({ title: 'A', day: '2026-12-31' }) as string).searchParams.get('dates'))
      .toBe('20261231/20270101')
    // 2028 is a leap year, so February keeps a 29th.
    expect(new URL(googleCalendarUrl({ title: 'A', day: '2028-02-28' }) as string).searchParams.get('dates'))
      .toBe('20280228/20280229')
  })

  it('carries optional details and location, and omits them when blank', () => {
    const withExtras = new URL(googleCalendarUrl({
      title: 'Recording',
      day: '2026-08-04',
      details: 'Hosted by Jamie Rivera',
      location: 'https://example.com/show',
    }) as string).searchParams
    expect(withExtras.get('details')).toBe('Hosted by Jamie Rivera')
    expect(withExtras.get('location')).toBe('https://example.com/show')

    const bare = new URL(googleCalendarUrl({
      title: 'Recording',
      day: '2026-08-04',
      details: '   ',
      location: null,
    }) as string).searchParams
    expect(bare.has('details')).toBe(false)
    expect(bare.has('location')).toBe(false)
  })

  it('returns null rather than a link that lands on an error page', () => {
    expect(googleCalendarUrl({ title: '', day: '2026-08-04' })).toBeNull()
    expect(googleCalendarUrl({ title: '   ', day: '2026-08-04' })).toBeNull()
    // A timestamp is not a calendar day, and neither is a partial date.
    expect(googleCalendarUrl({ title: 'A', day: '2026-08-04T10:00:00Z' })).toBeNull()
    expect(googleCalendarUrl({ title: 'A', day: '2026-08' })).toBeNull()
    expect(googleCalendarUrl({ title: 'A', day: '' })).toBeNull()
  })
})
