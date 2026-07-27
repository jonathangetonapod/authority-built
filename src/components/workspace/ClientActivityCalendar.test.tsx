import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ClientActivityCalendar,
  activitiesFromItems,
} from '@/components/workspace/ClientActivityCalendar'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

const item = (overrides: Partial<ClientPodcastSystemItem> = {}): ClientPodcastSystemItem => ({
  id: 'item-one',
  client: { id: 'client-one', name: 'Dallas Fontaine', status: 'active', photo_url: null },
  podcast: {
    id: null,
    podscan_id: 'show-one',
    name: 'Founder &amp; Operator',
    description: null,
    image_url: null,
    url: 'https://founderstories.fm',
    publisher_name: null,
    host_name: 'Morgan Host',
    audience_size: null,
    last_posted_at: null,
  },
  stage: 'booked',
  outcome: 'open',
  terminal: false,
  has_conflict: false,
  next_action: null,
  contact: { available: true, source: 'campaign', email: 'morgan@example.com', verified_at: null },
  decision: { status: 'approved', notes: null, updated_at: null },
  analysis: { source: 'none', clean_description: null, fit_reasons: [], pitch_angles: [], analyzed_at: null },
  campaign: null,
  legacy_outreach_at: null,
  booking: null,
  operator_notes: null,
  shortlist_created_at: '2026-07-01T12:00:00.000Z',
  shortlist_updated_at: '2026-07-01T12:00:00.000Z',
  last_activity_at: null,
  ...overrides,
} as ClientPodcastSystemItem)

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'booking-one',
  match: 'podcast_id',
  status: 'booked',
  host_name: 'Morgan Host',
  scheduled_date: null,
  recording_date: '2026-08-12',
  publish_date: '2026-08-26',
  episode_url: null,
  prep_sent: false,
  notes: null,
  created_at: '2026-07-01T12:00:00.000Z',
  updated_at: '2026-07-01T12:00:00.000Z',
  ...overrides,
})

describe('activitiesFromItems', () => {
  it('turns one placement into its recording and its release', () => {
    const activities = activitiesFromItems([item({ booking: booking() as never })])
    expect(activities.map((entry) => [entry.kind, entry.day])).toEqual([
      ['recording', '2026-08-12'],
      ['release', '2026-08-26'],
    ])
    // Entities decoded once, here, so every surface reads the same name.
    expect(activities[0].podcastName).toBe('Founder & Operator')
  })

  it('falls back to the scheduled date when no recording date is set yet', () => {
    const activities = activitiesFromItems([item({
      booking: booking({ recording_date: null, publish_date: null, scheduled_date: '2026-09-02' }) as never,
    })])
    expect(activities).toEqual([expect.objectContaining({ kind: 'recording', day: '2026-09-02' })])
  })

  it('marks a cancelled placement rather than dropping or hiding its dates', () => {
    const activities = activitiesFromItems([item({
      booking: booking({ status: 'cancelled' }) as never,
    })])
    expect(activities.every((entry) => entry.cancelled)).toBe(true)
  })

  it('reads outreach from a campaign launch or the legacy ledger', () => {
    const fromCampaign = activitiesFromItems([item({
      campaign: { launched_at: '2026-07-20T09:00:00.000Z' } as never,
    })])
    expect(fromCampaign).toEqual([expect.objectContaining({ kind: 'outreach', day: '2026-07-20' })])

    const fromLegacy = activitiesFromItems([item({ legacy_outreach_at: '2026-06-11T09:00:00.000Z' })])
    expect(fromLegacy).toEqual([expect.objectContaining({ kind: 'outreach', day: '2026-06-11' })])
  })

  it('produces nothing for a podcast with no dates at all', () => {
    expect(activitiesFromItems([item()])).toEqual([])
  })
})

describe('ClientActivityCalendar', () => {
  it('offers a Google Calendar link carrying the client and show across', async () => {
    render(<ClientActivityCalendar items={[item({
      booking: booking({ recording_date: '2099-08-12', publish_date: null }) as never,
    })]} />)

    const upcoming = screen.getByText('Next up').closest('div')?.parentElement as HTMLElement
    const link = within(upcoming).getByRole('link', { name: /Add to Google Calendar/i })
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('calendar.google.com')
    // Parsed rather than string-matched: URLSearchParams encodes spaces as '+',
    // which decodeURIComponent does not undo.
    const params = new URL(href).searchParams
    expect(params.get('text')).toBe('Recording: Founder & Operator — Dallas Fontaine')
    expect(params.get('details')).toContain('Client: Dallas Fontaine')
    expect(params.get('details')).toContain('Host: Morgan Host')
    // All-day events end on the following day; the same day twice is a
    // zero-length event some calendars silently drop.
    expect(params.get('dates')).toBe('20990812/20990813')
  })

  it('keeps a cancelled placement out of Next up while leaving it on the grid', () => {
    render(<ClientActivityCalendar items={[item({
      booking: booking({ recording_date: '2099-08-12', publish_date: null, status: 'cancelled' }) as never,
    })]} />)

    expect(screen.getByText('Nothing scheduled ahead')).toBeInTheDocument()
  })

  it('filters the calendar down to one kind of activity', () => {
    render(<ClientActivityCalendar items={[item({
      booking: booking({ recording_date: '2099-08-12', publish_date: '2099-08-26' }) as never,
    })]} />)

    expect(screen.getAllByText('Dallas Fontaine').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Filter by activity')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter by client')).toBeInTheDocument()
  })

  it('explains an empty calendar rather than showing a bare grid', () => {
    render(<ClientActivityCalendar items={[]} />)

    expect(screen.getByText('Nothing scheduled this month')).toBeInTheDocument()
    expect(screen.getByText('Nothing scheduled ahead')).toBeInTheDocument()
  })

  it('moves between months and back to today', () => {
    render(<ClientActivityCalendar items={[]} />)

    const heading = screen.getByRole('grid', { name: 'Client activity calendar' })
    expect(heading).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('grid', { name: 'Client activity calendar' })).toBeInTheDocument()
  })
})
