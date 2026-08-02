import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMonthlyAllowance } from '@/components/workspace/WorkspaceMonthlyAllowance'
import { getWorkspaceBillingOverview, setWorkspaceMonthlyAllowance } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  setWorkspaceMonthlyAllowance: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceMonthlyAllowance workspaceId={workspaceId} workspaceName="Juliana Munoz" />
  </QueryClientProvider>,
)

describe('WorkspaceMonthlyAllowance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ monthly_credit_allowance: 100 } as never)
    vi.mocked(setWorkspaceMonthlyAllowance).mockResolvedValue(500)
  })

  it('shows the figure the renewal actually reads', async () => {
    renderCard()
    await waitFor(() => expect(
      (screen.getByLabelText('Credits per month') as HTMLInputElement).value,
    ).toBe('100'))
  })

  it('saves a new allowance for this workspace', async () => {
    renderCard()
    await waitFor(() => expect((screen.getByLabelText('Credits per month') as HTMLInputElement).value).toBe('100'))

    fireEvent.change(screen.getByLabelText('Credits per month'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /Save allowance/i }))

    await waitFor(() => expect(setWorkspaceMonthlyAllowance).toHaveBeenCalledWith(workspaceId, 500))
  })

  it('will not save a figure that has not changed', async () => {
    renderCard()
    await waitFor(() => expect((screen.getByLabelText('Credits per month') as HTMLInputElement).value).toBe('100'))

    expect(screen.getByRole('button', { name: /Save allowance/i })).toBeDisabled()
  })

  it('refuses a figure that is not a whole number of credits', async () => {
    renderCard()
    await waitFor(() => expect((screen.getByLabelText('Credits per month') as HTMLInputElement).value).toBe('100'))

    fireEvent.change(screen.getByLabelText('Credits per month'), { target: { value: 'lots' } })

    expect(await screen.findByText(/whole number of credits between 0 and 1,000,000/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save allowance/i })).toBeDisabled()
  })

  // The obvious expectation is that a bigger number lands in the balance now.
  it('says when the new figure takes effect', async () => {
    renderCard()
    expect(await screen.findByText(/Takes effect at the next monthly grant/i)).toBeInTheDocument()
  })
})
