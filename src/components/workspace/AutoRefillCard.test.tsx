import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoRefillCard } from '@/components/workspace/AutoRefillCard'
import { setWorkspaceAutoRefill, type WorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ setWorkspaceAutoRefill: vi.fn() }))

const mockedSet = vi.mocked(setWorkspaceAutoRefill)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const overview = (over: Partial<WorkspaceBillingOverview> = {}): WorkspaceBillingOverview => ({
  has_saved_card: true,
  refill_threshold_credits: 50,
  refill_pack_credits: 300,
  refill_monthly_cap_cents: null,
  ...over,
} as WorkspaceBillingOverview)

const renderCard = (ov: WorkspaceBillingOverview) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <AutoRefillCard workspaceId={workspaceId} overview={ov} />
  </QueryClientProvider>,
)

describe('AutoRefillCard monthly cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSet.mockResolvedValue({ threshold: 50, pack: 300, monthlyCapCents: 10000 })
  })

  it('shows the saved cap and can change it, sending cents to the server', async () => {
    renderCard(overview({ refill_monthly_cap_cents: 10000 }))

    // The saved $100 cap is reflected, not left at "No monthly limit".
    expect(screen.getByLabelText('Don’t spend more than')).toHaveTextContent('$100 / month')

    fireEvent.click(screen.getByLabelText('Don’t spend more than'))
    fireEvent.click(await screen.findByRole('option', { name: '$250 / month' }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(workspaceId, {
      thresholdCredits: 50,
      packCredits: 300,
      monthlyCapCents: 25000,
    }))
  })

  it('sends null when the cap is set to no limit', async () => {
    mockedSet.mockResolvedValue({ threshold: 50, pack: 300, monthlyCapCents: null })
    renderCard(overview({ refill_monthly_cap_cents: 5000 }))

    fireEvent.click(screen.getByLabelText('Don’t spend more than'))
    fireEvent.click(await screen.findByRole('option', { name: 'No monthly limit' }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(mockedSet).toHaveBeenCalledWith(workspaceId, {
      thresholdCredits: 50,
      packCredits: 300,
      monthlyCapCents: null,
    }))
  })

  it('changing only the cap arms Save (the cap is part of the dirty check)', async () => {
    renderCard(overview({ refill_monthly_cap_cents: null }))

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Don’t spend more than'))
    fireEvent.click(await screen.findByRole('option', { name: '$500 / month' }))
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled()
  })
})
