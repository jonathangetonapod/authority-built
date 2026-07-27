import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgencyRelationshipNotice } from '@/components/workspace/PitchQualitySignals'
import type { ClientShortlistAgencyRelationship } from '@/services/clientShortlist'

const relationship = (
  overrides: Partial<ClientShortlistAgencyRelationship> = {},
): ClientShortlistAgencyRelationship => ({
  state: 'none',
  touch_count: 0,
  last_contacted_at: null,
  last_client_name: null,
  booked_client_name: null,
  booked_at: null,
  booked_episode_url: null,
  replied_client_name: null,
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
})
