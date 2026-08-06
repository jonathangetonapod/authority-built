import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalDashboardMvp from '@/pages/portal/DashboardMvp'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { getPortalExperience, type PortalExperienceOverview } from '@/services/clientPortal'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: vi.fn() }))
vi.mock('@/services/clientPortal', () => ({ getPortalExperience: vi.fn(), removePortalCalendarEvent: vi.fn() }))

const mockedUseClientPortal = vi.mocked(useClientPortal)
const mockedGetExperience = vi.mocked(getPortalExperience)

const clientId = '11111111-1111-4111-8111-111111111111'

function overview(): PortalExperienceOverview {
  return {
    profile: {
      name: 'Taylor Client',
      photo_url: null,
      bio: null,
      media_kit_url: 'https://example.com/media-kit.pdf',
      calendar_link: null,
      dashboard_tagline: 'Your podcast tour at a glance.',
    },
    review: {
      dashboard_slug: 'taylor-ab12cd34ef',
      total_visible: 6,
      awaiting_count: 4,
      approved_count: 2,
      rejected_count: 0,
    },
    outreach: {
      emails_sent: 42,
      podcasts_contacted: 18,
      replies: 5,
      meetings_booked: 2,
      in_outreach_count: 7,
      replied_count: 3,
      completed_count: 1,
    },
    pitch_profile: {
      professional_bio: 'Taylor helps founders scale operations.',
      positioning_summary: 'Operations expert',
      key_messages: ['Scale without chaos'],
      story_angles: ['From startup to exit'],
      talking_points: ['Hiring your first ops lead'],
      ideal_audience: 'Founders',
    },
    bookings: [
      {
        id: 'b1',
        podcast_name: 'Founder Stories',
        podcast_url: 'https://founderstories.example.com',
        host_name: 'Jamie Rivera',
        scheduled_date: '2099-03-01',
        recording_date: '2099-03-05',
        publish_date: null,
        status: 'booked',
        episode_url: null,
        podcast_image_url: null,
        podcast_description: null,
        audience_size: 12400,
        itunes_rating: 4.8,
        episode_count: 210,
      },
      {
        id: 'b2',
        podcast_name: 'Operator Weekly',
        podcast_url: null,
        host_name: null,
        scheduled_date: '2026-01-10',
        recording_date: '2026-01-12',
        publish_date: '2026-02-01',
        status: 'published',
        episode_url: 'https://podcasts.example.com/operator-weekly/42',
        podcast_image_url: 'https://images.example.com/operator.jpg',
        podcast_description: null,
        audience_size: null,
        itunes_rating: null,
        episode_count: null,
      },
    ],
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PortalDashboardMvp />
    </QueryClientProvider>,
  )
}

describe('PortalDashboardMvp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseClientPortal.mockReturnValue({
      client: { id: clientId, name: 'Taylor Client', dashboard_slug: 'taylor-ab12cd34ef' },
    } as never)
    mockedGetExperience.mockResolvedValue(overview())
  })

  it('renders the review call-to-action with live counts and the journey stats', async () => {
    renderPage()

    expect(await screen.findByText('4 podcasts are waiting for your review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review shortlist/i }))
      .toHaveAttribute('href', '/client/taylor-ab12cd34ef')
    expect(screen.getByText('Podcasts contacted').nextElementSibling).toHaveTextContent('18')
    expect(screen.getByText('Replies').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Your podcast tour at a glance.')).toBeInTheDocument()
    expect(mockedGetExperience).toHaveBeenCalledWith(clientId)
  })

  it('shows rich placements with episode links and the approved guest profile', async () => {
    renderPage()

    // Appears in both the upcoming recordings list and the placement list.
    expect(await screen.findAllByText('Founder Stories')).toHaveLength(2)
    expect(screen.getByText(/Hosted by Jamie Rivera/)).toBeInTheDocument()
    expect(screen.getByText(/12.4K listeners/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /listen/i }))
      .toHaveAttribute('href', 'https://podcasts.example.com/operator-weekly/42')
    expect(screen.getByRole('link', { name: /your media kit/i }))
      .toHaveAttribute('href', 'https://example.com/media-kit.pdf')
    expect(screen.getByText('Your guest profile')).toBeInTheDocument()
    expect(screen.getByText('Scale without chaos')).toBeInTheDocument()
    expect(screen.getByText('Hiring your first ops lead')).toBeInTheDocument()
  })

  /*
   * The value story: the combined audience of confirmed shows is the number a
   * client repeats to other people, and the raw counts never said it.
   * Confirmed shows only — b1 (booked, 12,400) counts, and a conversation
   * would not.
   */
  it('sums the combined audience of secured shows into the stats row', async () => {
    renderPage()

    expect(await screen.findByText('Combined audience')).toBeInTheDocument()
    expect(screen.getByText('Combined audience').nextElementSibling).toHaveTextContent('12.4K')
  })

  it('celebrates an episode that went live this week, with a link to send on', async () => {
    const fresh = overview()
    const liveDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    fresh.bookings[1] = { ...fresh.bookings[1], publish_date: liveDate }
    mockedGetExperience.mockResolvedValue(fresh)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    renderPage()

    expect(await screen.findByText('New episode live')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://podcasts.example.com/operator-weekly/42'))
  })

  // A month-old episode is a row, not news: the hero stands down.
  it('does not celebrate an episode past the news window', async () => {
    renderPage()

    expect(await screen.findAllByText('Operator Weekly')).toBeTruthy()
    expect(screen.queryByText('New episode live')).not.toBeInTheDocument()
  })

  /*
   * A confirmed booking without a date yet is the most reassuring thing the
   * upcoming panel can show, and requiring an upcoming date dropped exactly
   * those rows from it.
   */
  it('keeps a confirmed but undated booking in the upcoming panel as "Date coming"', async () => {
    const withUndated = overview()
    withUndated.bookings.push({
      ...withUndated.bookings[0],
      id: 'b3',
      podcast_name: 'Undated Confirmed Show',
      scheduled_date: null,
      recording_date: null,
      publish_date: null,
      status: 'booked',
    })
    mockedGetExperience.mockResolvedValue(withUndated)

    renderPage()

    // Once in upcoming, once in placements.
    expect(await screen.findAllByText('Undated Confirmed Show')).toHaveLength(2)
    expect(screen.getByText('Date coming')).toBeInTheDocument()
  })

  it('opens the placement details from an upcoming row, where prep lives', async () => {
    renderPage()

    // The upcoming row is a button; the placements list renders plain rows.
    fireEvent.click(await screen.findByRole('button', { name: /Founder Stories/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Founder Stories')
  })

  // Live first: the server orders by scheduled date, which buried a published
  // episode under whatever conversation started most recently.
  it('lists the live episode above the booked show', async () => {
    renderPage()

    const placements = (await screen.findAllByText(/Founder Stories|Operator Weekly/))
      .map((node) => node.textContent)
    expect(placements.indexOf('Operator Weekly')).toBeLessThan(placements.lastIndexOf('Founder Stories'))
  })

  it('celebrates a fully reviewed shortlist instead of nagging', async () => {
    const reviewed = overview()
    reviewed.review = { ...reviewed.review, awaiting_count: 0, approved_count: 6 }
    mockedGetExperience.mockResolvedValue(reviewed)

    renderPage()

    expect(await screen.findByText(/Shortlist reviewed — 6 approved/)).toBeInTheDocument()
    expect(screen.queryByText(/waiting for your review/)).not.toBeInTheDocument()
  })
})
