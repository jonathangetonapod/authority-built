import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalOutreach from '@/pages/portal/Outreach'
import { usePortalExperience } from '@/hooks/usePortalExperience'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/hooks/usePortalExperience', () => ({ usePortalExperience: vi.fn() }))

const mockedUseExperience = vi.mocked(usePortalExperience)

describe('PortalOutreach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseExperience.mockReturnValue({
      data: {
        outreach: {
          emails_sent: 42,
          podcasts_contacted: 18,
          replies: 5,
          meetings_booked: 2,
          in_outreach_count: 7,
          replied_count: 3,
          completed_count: 1,
        },
        outreach_targets: [
          {
            id: 't1',
            podcast_name: 'Founder Stories',
            podcast_image_url: null,
            stage: 'contacted',
            first_message_at: '2026-07-20T10:00:00.000Z',
            last_activity_at: '2026-07-24T10:00:00.000Z',
            opens: 3,
            replies: 0,
          },
          {
            id: 't2',
            podcast_name: 'Operator Weekly',
            podcast_image_url: null,
            stage: 'replied',
            first_message_at: '2026-07-10T10:00:00.000Z',
            last_activity_at: '2026-07-12T10:00:00.000Z',
            opens: 5,
            replies: 1,
          },
          {
            id: 't3',
            podcast_name: 'Growth Lab',
            podcast_image_url: null,
            stage: 'preparing',
            first_message_at: null,
            last_activity_at: null,
            opens: 0,
            replies: 0,
          },
        ],
        bookings: [
          { id: 'b1', podcast_name: 'Live Show', status: 'published', publish_date: '2026-07-01', scheduled_date: null, recording_date: null, episode_url: null, podcast_url: null, host_name: null, podcast_image_url: null, podcast_description: null, audience_size: null, itunes_rating: null, episode_count: null },
        ],
      },
      isLoading: false,
      error: null,
    } as never)
  })

  it('shows outreach stat tiles and the per-podcast activity feed', async () => {
    render(<PortalOutreach />)

    expect(await screen.findByText('Podcasts contacted')).toBeInTheDocument()
    expect(screen.getByText('Podcasts contacted').nextElementSibling).toHaveTextContent('18')
    expect(screen.getByText('Meetings booked').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Founder Stories')).toBeInTheDocument()
    expect(screen.getByText(/First message sent Jul 20, 2026/)).toBeInTheDocument()
    // Appears as both a stage badge and a pipeline row label.
    expect(screen.getAllByText('Host replied').length).toBeGreaterThan(0)
    expect(screen.getByText('Your personalized pitch is being prepared')).toBeInTheDocument()
    expect(screen.getByText(/5 opens · 1 reply/)).toBeInTheDocument()
  })

  it('summarizes the pipeline from outreach stages and booking statuses', async () => {
    render(<PortalOutreach />)

    const pipeline = await screen.findByLabelText('Placement pipeline')
    expect(pipeline).toHaveTextContent('Message sent')
    expect(pipeline).toHaveTextContent('Host replied')
    expect(pipeline).toHaveTextContent('Published')
    expect(screen.getByLabelText('Bar chart of outreach messages sent per month')).toBeInTheDocument()
  })

  it('renders friendly empty states without outreach data', async () => {
    mockedUseExperience.mockReturnValue({
      data: { outreach: null, outreach_targets: [], bookings: [] },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalOutreach />)

    expect(await screen.findByText(/Outreach activity appears here once your team starts contacting/)).toBeInTheDocument()
    expect(screen.getByText(/Your pipeline fills in as soon as/)).toBeInTheDocument()
  })
})
