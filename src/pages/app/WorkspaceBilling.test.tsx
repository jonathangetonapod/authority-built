import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  createWorkspaceBillingPortal,
  createWorkspaceSubscriptionCheckout,
  getWorkspaceBillingOverview,
} from '@/services/workspaceStaff'
import WorkspaceBilling from '@/pages/app/WorkspaceBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  createWorkspaceCreditCheckout: vi.fn(),
  createWorkspaceBillingPortal: vi.fn(),
  createWorkspaceSubscriptionCheckout: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedPortal = vi.mocked(createWorkspaceBillingPortal)
const mockedSubscribe = vi.mocked(createWorkspaceSubscriptionCheckout)

const workspaceId = '11111111-1111-4111-8111-111111111111'

const overviewFixture = {
  plan_key: 'founding_member',
  billing_status: 'trialing',
  base_price_cents: 3900,
  per_client_price_cents: 3900,
  included_active_clients: 1,
  monthly_credit_allowance: 100,
  enforcement_enabled: false,
  has_subscription: false,
  balance: 42,
  expiring_credits: 25,
  next_expiry_at: '2026-09-01T00:00:00.000Z',
  usage_this_month: {
    dashboard_build: { total: 3, byo: 1 },
    research_run: { total: 4, byo: 0 },
  },
  credits_spent_this_month: 50,
  prices: { dashboard_build: 5, research_run: 10 },
  recent_activity: [
    { id: 'entry-1', entry_type: 'grant', amount: 25, operation_type: null, reference_kind: 'allowance_period', created_at: '2026-07-01T00:00:00.000Z' },
  ],
}

function asOwner(extra: Record<string, unknown> = {}) {
  mockedUseAuth.mockReturnValue({
    isPlatformAdmin: false,
    canManageWorkspaceStaff: true,
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    workspace: { id: workspaceId },
    ...extra,
  } as never)
}

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage(path = '/app/settings/billing') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/settings/billing" element={<WorkspaceBilling />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceBilling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('waits for the credits to actually land, and says what it means if they do not', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage('/app/settings/billing?checkout=success')

    expect(await screen.findByText(/Waiting for your credits/)).toBeInTheDocument()
    expect(screen.getByText(/the payment went through but the credits did not/i)).toBeInTheDocument()
  })

  // Selling a pack while the same page says the balance will not move is asking
  // for money for something the product has just said it is not doing.
  it('offers nothing to buy while credits are not being charged', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText(/credits are not being charged yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy for $29' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Buy credits' })).not.toBeInTheDocument()
  })

  it('offers the packs the server will actually charge once charging is on', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, enforcement_enabled: true } as never)
    renderPage()

    // These mirror CREDIT_PACKS in workspace-credit-checkout.
    expect(await screen.findByRole('button', { name: 'Buy for $29' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $69' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $149' })).toBeInTheDocument()
    expect(screen.queryByText(/credits are not being charged yet/i)).not.toBeInTheDocument()
  })

  // The page used to list run counts with no prices, so nobody could work out
  // where their credits had gone. The cost of each operation was being fetched
  // and thrown away.
  it('prices each operation so the usage adds up to the total', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    const research = (await screen.findByText('AI research runs')).closest('tr')!
    // 4 runs, none on their own key, at 10 credits each.
    expect(within(research).getByText('4')).toBeInTheDocument()
    expect(within(research).getByText('10')).toBeInTheDocument()
    expect(within(research).getByText('40')).toBeInTheDocument()

    // 3 dashboard builds, 1 on their own key and therefore free, at 5 each.
    const dashboards = screen.getByText('Prospect dashboard builds').closest('tr')!
    expect(within(dashboards).getByText(/1 on your own key, free/i)).toBeInTheDocument()
    expect(within(dashboards).getByText('10')).toBeInTheDocument()

    // 40 + 10 at today's rates. The meter reports the ledger instead, because a
    // price that moved mid-month makes the two disagree and only the ledger
    // matches the balance above it.
    expect(screen.getByText(/Total at today/).closest('tr')).toHaveTextContent('50')
    expect(screen.getByText("50% of this month's included credits used.")).toBeInTheDocument()
  })

  it('shows the balance and what is expiring', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(mockedOverview).toHaveBeenCalledWith(workspaceId)
    expect(screen.getByText(/25 expire Sep 1, 2026/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Monthly allowance used' })).toHaveAttribute('aria-valuenow', '50')
  })

  // billing_status was fetched and never rendered, so a workspace whose payment
  // had failed was told nothing until something stopped working.
  it('says when a payment has failed', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, billing_status: 'past_due' } as never)
    renderPage()

    expect(await screen.findByText('Payment overdue')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('A payment did not go through.')
  })

  it('sends a subscribed workspace to the Stripe portal', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, has_subscription: true } as never)
    mockedPortal.mockResolvedValue('https://billing.stripe.com/session/test')
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Manage plan' }))
    expect(mockedPortal).toHaveBeenCalledWith(workspaceId)
    expect(mockedSubscribe).not.toHaveBeenCalled()
  })

  it('sends a workspace with no subscription to checkout instead', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    mockedSubscribe.mockResolvedValue('https://checkout.stripe.com/session/test')
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Choose a plan' }))
    expect(mockedSubscribe).toHaveBeenCalledWith(workspaceId, 'founding_member')
    expect(mockedPortal).not.toHaveBeenCalled()
  })

  // Platform administration is a different job for a different person. It used
  // to sit on top of this page, so the platform owner scrolled past their own
  // billing to reach it, and it is gone from here entirely.
  it('links a platform admin out to billing administration rather than hosting it', async () => {
    asOwner({ isPlatformAdmin: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' } })
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByRole('link', { name: /Billing administration/ }))
      .toHaveAttribute('href', '/app/platform/billing')
    expect(screen.queryByRole('heading', { name: 'Top up a workspace' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Plan pricing' })).not.toBeInTheDocument()
  })

  it('shows a workspace owner no route into platform administration', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Billing administration/ })).not.toBeInTheDocument()
  })

  it('tells an agency owner the billing failed to load rather than rendering nothing', async () => {
    asOwner()
    mockedOverview.mockRejectedValue(new Error('Billing data could not be loaded.'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Your billing could not be loaded.')
    expect(screen.getByText(/Nothing has been charged/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('returns members without Settings access to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
