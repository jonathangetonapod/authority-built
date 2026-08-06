import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditBalanceChip } from '@/components/workspace/CreditBalanceChip'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderChip = (canViewBalance = true, billingHref = '/app/settings/billing') => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CreditBalanceChip workspaceId={workspaceId} canViewBalance={canViewBalance} billingHref={billingHref} />
    </MemoryRouter>
  </QueryClientProvider>,
)

const overview = (over: Record<string, unknown>) => ({
  enforcement_enabled: true,
  monthly_credit_allowance: 100,
  balance: 850,
  ...over,
})

describe('CreditBalanceChip', () => {
  beforeEach(() => vi.clearAllMocks())

  // The number that decides whether the next research run happens was two
  // navigations away from the work that spends it.
  it('shows the balance in the shell, linked to billing', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({}) as never)
    renderChip()

    const link = await screen.findByRole('link', { name: /850 credits remaining/i })
    expect(link).toHaveAttribute('href', '/app/settings/billing')
    expect(screen.getByText('850')).toBeInTheDocument()
  })

  it('turns the chip itself into the warning when the balance is low', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 8 }) as never)
    renderChip()

    const link = await screen.findByRole('link', { name: /8 credits remaining/i })
    expect(link.className).toMatch(/destructive/)
  })

  // A number about nothing.
  it('shows nothing while enforcement is off', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ enforcement_enabled: false }) as never,
    )
    renderChip()

    await waitFor(() => expect(getWorkspaceBillingOverview).toHaveBeenCalled())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not show a balance to someone who may not read it', async () => {
    renderChip(false)

    await waitFor(() => expect(getWorkspaceBillingOverview).not.toHaveBeenCalled())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  /*
   * A platform admin supporting an agency reads the number but acts on it from
   * the platform screen, so reading and acting are separate: the balance shows,
   * and it does not lead to the agency's own billing page.
   */
  it('sends the number where the reader can act on it', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({}) as never)
    renderChip(true, '/app/platform/billing')

    const link = await screen.findByRole('link', { name: /850 credits remaining/i })
    expect(link).toHaveAttribute('href', '/app/platform/billing')
  })
})
