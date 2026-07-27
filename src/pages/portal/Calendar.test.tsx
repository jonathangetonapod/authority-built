import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PortalCalendar from '@/pages/portal/Calendar'

const render = (ui: React.ReactElement) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>,
)
import { usePortalExperience } from '@/hooks/usePortalExperience'
import type { PortalExperienceBooking } from '@/services/clientPortal'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/hooks/usePortalExperience', () => ({ usePortalExperience: vi.fn() }))
vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: () => ({ client: { id: 'client-1', name: 'Taylor' } }) }))
vi.mock('@/services/clientPortal', () => ({ addPortalCalendarEvent: vi.fn(), removePortalCalendarEvent: vi.fn() }))

const mockedUseExperience = vi.mocked(usePortalExperience)

const isoInDays = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const booking = (overrides: Partial<PortalExperienceBooking>): PortalExperienceBooking => ({
  id: 'b1',
  podcast_name: 'Founder Stories',
  podcast_url: null,
  host_name: 'Jamie Rivera',
  scheduled_date: null,
  recording_date: null,
  publish_date: null,
  status: 'booked',
  episode_url: null,
  podcast_image_url: null,
  podcast_description: null,
  audience_size: null,
  itunes_rating: null,
  episode_count: null,
  ...overrides,
})

describe('PortalCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseExperience.mockReturnValue({
      data: {
        bookings: [
          booking({ id: 'b1', podcast_name: 'Founder Stories', recording_date: isoInDays(3), status: 'booked' }),
          booking({ id: 'b2', podcast_name: 'Operator Weekly', publish_date: isoInDays(9), status: 'recorded' }),
          booking({ id: 'b3', podcast_name: 'Cancelled Show', recording_date: isoInDays(5), status: 'cancelled' }),
        ],
      },
      isLoading: false,
      error: null,
    } as never)
  })

  it('lists upcoming recordings and releases, skipping cancelled bookings', async () => {
    render(<PortalCalendar />)

    expect(await screen.findAllByText('Founder Stories')).not.toHaveLength(0)
    expect(screen.getAllByText('Operator Weekly')).not.toHaveLength(0)
    expect(screen.queryByText('Cancelled Show')).not.toBeInTheDocument()
    expect(screen.getByText('Next up')).toBeInTheDocument()
    expect(screen.getByText(/Recording ·/)).toBeInTheDocument()
    expect(screen.getByText(/Episode live ·/)).toBeInTheDocument()
  })

  it('summarises what is ahead and says how far off each date is', async () => {
    render(<PortalCalendar />)

    // The counts answer "what is coming" without reading the grid, and
    // cancelled bookings must not inflate them.
    expect(await screen.findByText('Next recording')).toBeInTheDocument()
    const recordings = screen.getByText('Recordings ahead').closest('div') as HTMLElement
    expect(recordings).toHaveTextContent('1')
    const releases = screen.getByText('Episodes going live').closest('div') as HTMLElement
    expect(releases).toHaveTextContent('1')

    expect(screen.getByText('In 3 days')).toBeInTheDocument()
    expect(screen.getByText('Next week')).toBeInTheDocument()
  })

  it('opens the booking detail dialog from an upcoming event', async () => {
    render(<PortalCalendar />)

    const items = await screen.findAllByText('Founder Stories')
    fireEvent.click(items[items.length - 1])

    expect(await screen.findByText('Hosted by Jamie Rivera')).toBeInTheDocument()
    expect(screen.getByLabelText('Placement timeline')).toBeInTheDocument()
  })

  it('navigates between months', async () => {
    render(<PortalCalendar />)

    const now = new Date()
    const currentTitle = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    expect(await screen.findByText(currentTitle)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    expect(screen.getByText(next.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))).toBeInTheDocument()
  })

  it('shows a recording date and an episode-live date from the same placement', async () => {
    mockedUseExperience.mockReturnValue({
      data: {
        bookings: [
          booking({
            id: 'b9',
            podcast_name: 'Operator Weekly',
            recording_date: isoInDays(4),
            publish_date: isoInDays(11),
            status: 'booked',
          }),
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalCalendar />)

    const next = await screen.findByText('Next up')
    expect(next).toBeInTheDocument()
    expect(screen.getByText(/^Recording ·/)).toBeInTheDocument()
    expect(screen.getByText(/^Episode live ·/)).toBeInTheDocument()
    // Both events reach Next up; a release that lands in a later month has no
    // chip in the current grid, so three renders is the floor.
    expect(screen.getAllByText('Operator Weekly').length).toBeGreaterThanOrEqual(3)
  })

  it('marks dates entered during a conversation as planned', async () => {
    mockedUseExperience.mockReturnValue({
      data: {
        bookings: [
          booking({ id: 'b10', podcast_name: 'Early Talks', scheduled_date: isoInDays(6), status: 'conversation_started' }),
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    render(<PortalCalendar />)

    expect(await screen.findByText(/Recording \(planned\) ·/)).toBeInTheDocument()
  })
})
