import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditBalanceChip } from '@/components/workspace/CreditBalanceChip'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
// A second workspace, so a balance read against the wrong one shows up as the
// wrong id rather than passing by coincidence.
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'

const renderChip = (
  canViewBalance = true,
  billingHref = '/app/settings/billing',
  id: string = workspaceId,
) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CreditBalanceChip workspaceId={id} canViewBalance={canViewBalance} billingHref={billingHref} />
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

  // The whole point of the workspaceId prop: the reader may not be a member of
  // the workspace whose number this is.
  it('asks only for the workspace it was handed', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({}) as never)
    renderChip(true, '/app/platform/billing', otherWorkspaceId)

    await screen.findByRole('link', { name: /850 credits remaining/i })
    expect(getWorkspaceBillingOverview).toHaveBeenCalledTimes(1)
    expect(getWorkspaceBillingOverview).toHaveBeenCalledWith(otherWorkspaceId)
  })

  it('asks for nothing before there is a workspace to ask about', async () => {
    renderChip(true, '/app/settings/billing', '')

    await waitFor(() => expect(getWorkspaceBillingOverview).not.toHaveBeenCalled())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  /*
   * The tone is read off the workspace on screen, and against its own allowance
   * — a big number is not automatically a comfortable one.
   */
  it('calls a large balance critical when the allowance dwarfs it', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ balance: 200, monthly_credit_allowance: 2000 }) as never,
    )
    renderChip()

    const link = await screen.findByRole('link', { name: /200 credits remaining/i })
    expect(link.className).toMatch(/destructive/)
  })

  it('warns in amber while the balance is low rather than nearly gone', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ balance: 20, monthly_credit_allowance: 100 }) as never,
    )
    renderChip()

    const link = await screen.findByRole('link', { name: /20 credits remaining/i })
    expect(link.className).toMatch(/amber/)
    expect(link.className).not.toMatch(/destructive/)
  })

  // A healthy balance is a header ornament, not an alarm.
  it('leaves a healthy balance in the quiet tone', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({}) as never)
    renderChip()

    const link = await screen.findByRole('link', { name: /850 credits remaining/i })
    expect(link.className).toMatch(/bg-muted/)
    expect(link.className).not.toMatch(/amber|destructive/)
  })

  /*
   * Switching which workspace is on screen must move the number with it. The
   * balance is cached per workspace, and a cache that forgot which workspace it
   * was for would report one agency's credits under another agency's name.
   */
  it('follows the workspace it is pointed at when the view switches', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockImplementation(((id: string) => (
      Promise.resolve(overview({ balance: id === workspaceId ? 850 : 12 }))
    )) as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const chipFor = (id: string) => (
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CreditBalanceChip workspaceId={id} canViewBalance billingHref="/app/platform/billing" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const { rerender } = render(chipFor(workspaceId))
    await screen.findByRole('link', { name: /850 credits remaining/i })

    rerender(chipFor(otherWorkspaceId))
    await screen.findByRole('link', { name: /12 credits remaining/i })
    expect(screen.queryByText('850')).not.toBeInTheDocument()
    expect(getWorkspaceBillingOverview).toHaveBeenCalledWith(otherWorkspaceId)
  })
})
