import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, icsCalendarFile, icsDownloadHref, icsFileName } from '@/lib/calendarLinks'

const STAMPED = new Date('2026-07-28T05:03:00.000Z')

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

describe('icsCalendarFile', () => {
  it('writes an all-day event every calendar can read', () => {
    const file = icsCalendarFile({
      title: 'Recording: Founder Stories',
      day: '2026-08-04',
      details: 'Client: Dallas Fontaine',
      location: 'https://example.com/show',
      uid: 'item-one:recording',
    }, STAMPED) as string

    expect(file.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(file.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(file).toContain('DTSTART;VALUE=DATE:20260804')
    // Exclusive end, for the same reason the Google link uses one.
    expect(file).toContain('DTEND;VALUE=DATE:20260805')
    expect(file).toContain('SUMMARY:Recording: Founder Stories')
    expect(file).toContain('DESCRIPTION:Client: Dallas Fontaine')
    expect(file).toContain('LOCATION:https://example.com/show')
    expect(file).toContain('UID:item-one:recording@getonapod.com')
    expect(file).toContain('DTSTAMP:20260728T050300Z')
    // Every line ends CRLF: a bare newline makes the file unreadable to Outlook.
    expect(file.split('\r\n').every((line) => !line.includes('\n'))).toBe(true)
  })

  it('escapes the characters that would otherwise truncate a field', () => {
    const file = icsCalendarFile({
      title: 'Recording: Sales, Growth; Scale',
      day: '2026-08-04',
      details: 'Line one\nLine two',
    }, STAMPED) as string

    expect(file).toContain('SUMMARY:Recording: Sales\\, Growth\\; Scale')
    expect(file).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('folds a long line and keeps every piece inside the octet limit', () => {
    const file = icsCalendarFile({
      title: `Recording: ${'Extremely Long Podcast Name '.repeat(6)}`,
      day: '2026-08-04',
    }, STAMPED) as string
    const lines = file.split('\r\n')

    expect(lines.length).toBeGreaterThan(12)
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    // A folded line continues with a single leading space, and unfolding
    // reproduces the original summary.
    const unfolded = file.replace(/\r\n /gu, '')
    expect(unfolded).toContain('SUMMARY:Recording: Extremely Long Podcast Name Extremely')
  })

  it('counts octets rather than characters when folding', () => {
    // Every one of these is two octets, so a 75-character line is 150 octets.
    const file = icsCalendarFile({ title: `Recording ${'é'.repeat(80)}`, day: '2026-08-04' }, STAMPED) as string
    for (const line of file.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(file.replace(/\r\n /gu, '')).toContain(`SUMMARY:Recording ${'é'.repeat(80)}`)
  })

  it('refuses the same inputs the Google link refuses', () => {
    expect(icsCalendarFile({ title: '', day: '2026-08-04' })).toBeNull()
    expect(icsCalendarFile({ title: 'A', day: '2026-08' })).toBeNull()
    expect(icsDownloadHref({ title: 'A', day: '' })).toBeNull()
  })
})

describe('icsDownloadHref', () => {
  it('carries the file inline so the anchor has nothing to revoke', () => {
    const href = icsDownloadHref({ title: 'Recording: Founder Stories', day: '2026-08-04' }, STAMPED) as string

    expect(href.startsWith('data:text/calendar;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(href.slice('data:text/calendar;charset=utf-8,'.length)))
      .toContain('BEGIN:VEVENT')
  })
})

describe('icsFileName', () => {
  it('names the file after the event and its day', () => {
    expect(icsFileName('Recording: Founder Stories — Dallas Fontaine', '2026-08-04'))
      .toBe('recording-founder-stories-dallas-fontaine-2026-08-04.ics')
    // A title made entirely of punctuation still has to produce a filename.
    expect(icsFileName('///', '2026-08-04')).toBe('event-2026-08-04.ics')
  })
})
