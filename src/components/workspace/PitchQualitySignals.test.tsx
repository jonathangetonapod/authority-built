import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgencyRelationshipNotice } from '@/components/workspace/PitchQualitySignals'
import type { ClientShortlistAgencyRelationship } from '@/services/clientShortlist'

const relationship = (
  overrides: Partial<ClientShortlistAgencyRelationship> = {},
): ClientShortlistAgencyRelationship => ({
  podcast_id: 'podcast-one',
  state: 'none',
  touch_count: 0,
  last_contacted_at: null,
  last_client_name: null,
  booked_client_name: null,
  booked_at: null,
  booked_episode_url: null,
  replied_client_name: null,
  contact_email: null,
  same_contact_other_show: false,
  manual_stage: null,
  summary: null,
  ...overrides,
})

describe('AgencyRelationshipNotice', () => {
  it('renders declined history as a warm exchange instead of crashing', () => {
    render(<AgencyRelationshipNotice relationship={relationship({
      state: 'declined',
      touch_count: 2,
      last_contacted_at: '2026-07-20T12:00:00.000Z',
    })} />)

    expect(screen.getByText('This host passed on an earlier idea')).toBeInTheDocument()
    expect(screen.getByText(/briefly acknowledge the exchange/i)).toBeInTheDocument()
  })

  it('shows curated context even when no outreach is recorded', () => {
    render(<AgencyRelationshipNotice relationship={relationship({
      manual_stage: 'warm',
      summary: 'Met the producer at Podcast Movement; prefers concise angles.',
    })} />)

    expect(screen.getByText('Relationship context saved')).toBeInTheDocument()
    expect(screen.getByText('Relationship stage: Warm')).toBeInTheDocument()
    expect(screen.getByText(/Met the producer at Podcast Movement/i)).toBeInTheDocument()
  })

  it('stays hidden for a genuinely unknown show', () => {
    const { container } = render(<AgencyRelationshipNotice relationship={relationship()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the day a live quiet window clears', () => {
    render(<AgencyRelationshipNotice relationship={relationship({
      state: 'pitched',
      touch_count: 1,
      last_client_name: 'Dallas Fontaine',
      last_contacted_at: '2026-07-15T12:00:00.000Z',
      cooldown: {
        window_days: 60,
        days_since_contact: 12,
        days_remaining: 48,
        resumes_on: '2026-09-13',
      },
    })} />)

    expect(screen.getByText(/Inside the 60-day quiet window/i)).toBeInTheDocument()
    expect(screen.getByText(/12 days ago/i)).toBeInTheDocument()
    expect(screen.getByText(/Sep 13, 2026/i)).toBeInTheDocument()
    // Warning, never a block: the operator keeps the decision.
    expect(screen.getByText(/You can still send/i)).toBeInTheDocument()
  })

  it('leaves a served quiet window unmentioned', () => {
    render(<AgencyRelationshipNotice relationship={relationship({
      state: 'pitched',
      touch_count: 1,
      last_contacted_at: '2026-01-05T12:00:00.000Z',
      cooldown: null,
    })} />)

    expect(screen.getByText('Pitched before, no reply')).toBeInTheDocument()
    expect(screen.queryByText(/quiet window/i)).not.toBeInTheDocument()
  })
})
