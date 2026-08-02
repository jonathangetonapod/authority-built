import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditBalanceWarning } from '@/components/workspace/CreditBalanceWarning'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderWarning = (canManageBilling = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CreditBalanceWarning workspaceId={workspaceId} canManageBilling={canManageBilling} />
    </MemoryRouter>
  </QueryClientProvider>,
)

const overview = (over: Record<string, unknown>) => ({
  enforcement_enabled: true,
  monthly_credit_allowance: 100,
  balance: 100,
  ...over,
})

describe('CreditBalanceWarning', () => {
  beforeEach(() => vi.clearAllMocks())

  // A banner that is always there is one nobody reads on the day it matters.
  it('says nothing while the balance is healthy', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 90 }) as never)
    renderWarning()

    await waitFor(() => expect(getWorkspaceBillingOverview).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns before the balance runs out, not after', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 15 }) as never)
    renderWarning()

    expect(await screen.findByText(/15 credits left/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute('href', '/app/settings/billing')
  })

  it('says what has stopped once the balance is empty', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 0 }) as never)
    renderWarning()

    expect(await screen.findByText(/out of credits/i)).toBeInTheDocument()
    expect(screen.getByText(/will not run until it is topped up/i)).toBeInTheDocument()
  })

  // Nothing is being charged, so there is nothing to warn about.
  it('stays quiet while enforcement is off', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ balance: 0, enforcement_enabled: false }) as never,
    )
    renderWarning()

    await waitFor(() => expect(getWorkspaceBillingOverview).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not nag someone who cannot act on it', async () => {
    renderWarning(false)

    await waitFor(() => expect(getWorkspaceBillingOverview).not.toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
