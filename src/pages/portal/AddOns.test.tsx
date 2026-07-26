import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PortalAddOns from '@/pages/portal/AddOns'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import { requestPortalAddon } from '@/services/clientPortal'

vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/hooks/usePortalExperience', () => ({ usePortalExperience: vi.fn() }))
vi.mock('@/contexts/ClientPortalContext', () => ({ useClientPortal: vi.fn() }))
vi.mock('@/services/clientPortal', () => ({ requestPortalAddon: vi.fn() }))

const mockedUseExperience = vi.mocked(usePortalExperience)
const mockedUseClientPortal = vi.mocked(useClientPortal)
const mockedRequestAddon = vi.mocked(requestPortalAddon)

const publishedBooking = (id: string, name: string) => ({
  id,
  podcast_name: name,
  status: 'published',
  publish_date: '2026-06-01',
  scheduled_date: null,
  recording_date: null,
  episode_url: `https://episodes.example.com/${id}`,
  podcast_url: null,
  host_name: 'Jamie Rivera',
  podcast_image_url: null,
  podcast_description: null,
  audience_size: null,
  itunes_rating: null,
  episode_count: null,
})

describe('PortalAddOns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseClientPortal.mockReturnValue({ client: { id: '11111111-1111-4111-8111-111111111111', name: 'Taylor' } } as never)
    mockedRequestAddon.mockResolvedValue(undefined as never)
    mockedUseExperience.mockReturnValue({
      data: {
        bookings: [
          publishedBooking('b1', 'Founder Stories'),
          { ...publishedBooking('b2', 'Still Recording'), status: 'recorded' },
        ],
      },
      isLoading: false,
      error: null,
    } as never)
  })

  it('requires a published episode before a per-episode package can be requested', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PortalAddOns />
      </QueryClientProvider>,
    )

    const request = await screen.findByRole('button', { name: 'Request this package' })
    expect(request).toBeDisabled()
    expect(screen.queryByText('Still Recording')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Founder Stories'))
    expect(request).toBeEnabled()

    fireEvent.click(request)
    expect(await screen.findByText('Request received')).toBeInTheDocument()
    expect(screen.getByText('Growth · Founder Stories')).toBeInTheDocument()
    expect(screen.getByText(/no payment has been taken/)).toBeInTheDocument()
  })

  it('lets the always-on plan be requested without picking an episode', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PortalAddOns />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /Authority/ }))
    expect(screen.getByText('Covers every new episode')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Request this package' }))
    expect(await screen.findByText('Request received')).toBeInTheDocument()
    expect(screen.getByText('Authority')).toBeInTheDocument()
  })

  it('explains that clips need a published episode when none exist', async () => {
    mockedUseExperience.mockReturnValue({
      data: { bookings: [] },
      isLoading: false,
      error: null,
    } as never)

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PortalAddOns />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/Clips are cut from published episodes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request this package' })).toBeDisabled()
  })
})
