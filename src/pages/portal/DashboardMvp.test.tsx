import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

  it('celebrates a fully reviewed shortlist instead of nagging', async () => {
    const reviewed = overview()
    reviewed.review = { ...reviewed.review, awaiting_count: 0, approved_count: 6 }
    mockedGetExperience.mockResolvedValue(reviewed)

    renderPage()

    expect(await screen.findByText(/Shortlist reviewed — 6 approved/)).toBeInTheDocument()
    expect(screen.queryByText(/waiting for your review/)).not.toBeInTheDocument()
  })
})
