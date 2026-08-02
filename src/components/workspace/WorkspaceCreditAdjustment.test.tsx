import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceCreditAdjustment } from '@/components/workspace/WorkspaceCreditAdjustment'
import { adjustWorkspaceCredits, getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  adjustWorkspaceCredits: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceCreditAdjustment workspaceId={workspaceId} workspaceName="Juliana Munoz" />
  </QueryClientProvider>,
)

describe('WorkspaceCreditAdjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ balance: 850 } as never)
    vi.mocked(adjustWorkspaceCredits).mockResolvedValue({ removed: 100, balance: 750 })
  })

  it('removes a stated number of credits with a reason', async () => {
    renderCard()
    await screen.findByLabelText('Credits to remove')

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'duplicate onboarding grant' } })
    fireEvent.click(screen.getByRole('button', { name: /Remove credits/i }))

    await waitFor(() => expect(adjustWorkspaceCredits).toHaveBeenCalledWith(workspaceId, {
      amount: 100,
      reason: 'duplicate onboarding grant',
    }))
  })

  it('will not remove credits without a reason', async () => {
    renderCard()
    await screen.findByLabelText('Credits to remove')

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '100' } })

    expect(screen.getByRole('button', { name: /Remove credits/i })).toBeDisabled()
  })

  // Refused rather than clamped: asking for more than exists is a mistake
  // about the number, and quietly taking what is there would hide it.
  it('refuses to take more than the workspace has', async () => {
    renderCard()
    await screen.findByLabelText('Credits to remove')

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '900' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'oops' } })

    expect(await screen.findByText(/only has 850 credits/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove credits/i })).toBeDisabled()
  })

  it('shows what the balance becomes before committing', async () => {
    renderCard()
    await screen.findByLabelText('Credits to remove')

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '100' } })

    expect(await screen.findByText(/from 850 to 750/i)).toBeInTheDocument()
  })
})
