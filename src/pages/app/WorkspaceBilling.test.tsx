import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import { listGrantableWorkspaces } from '@/services/adminWorkspaces'
import WorkspaceBilling from '@/pages/app/WorkspaceBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  createWorkspaceCreditCheckout: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({ listGrantableWorkspaces: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedWorkspaces = vi.mocked(listGrantableWorkspaces)

const overviewFixture = {
  plan_key: 'founding_member',
  billing_status: 'trialing',
  base_price_cents: 3900,
  per_client_price_cents: 3900,
  included_active_clients: 1,
  monthly_credit_allowance: 25,
  enforcement_enabled: false,
  balance: 42,
  expiring_credits: 25,
  next_expiry_at: '2026-09-01T00:00:00.000Z',
  usage_this_month: { dashboard_build: { total: 3, byo: 1 } },
  prices: { dashboard_build: 5, semantic_search: 0 },
  recent_activity: [
    { id: 'entry-1', entry_type: 'grant', amount: 25, operation_type: null, reference_kind: 'allowance_period', created_at: '2026-07-01T00:00:00.000Z' },
  ],
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
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: false,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage('/app/settings/billing?checkout=success')

    // Stripe redirects here; the credits are granted by the webhook, which is
    // a separate thing that can be missing while the payment still succeeds.
    expect(await screen.findByText(/Waiting for your credits/)).toBeInTheDocument()
    expect(screen.getByText(/the payment went through but the credits did not/i)).toBeInTheDocument()
  })

  it('advertises only the packs the server will actually charge', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: false,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(screen.getByRole('heading', { name: 'Billing & credits' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute('href', '/app/settings')

    // These mirror CREDIT_PACKS in workspace-credit-checkout. The page used to
    // carry a second, unwired list at $0.39/credit beside a real one charging
    // $0.98, and a button admitting checkout "will be connected".
    expect(await screen.findByRole('button', { name: 'Buy for $29' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $69' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $149' })).toBeInTheDocument()
    expect(screen.queryByText(/Secure checkout will be connected/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Select .* credits for/ })).not.toBeInTheDocument()
  })

  it('shows the live credit balance, usage, and dry-run notice', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: false,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(mockedOverview).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(screen.getByText(/credits are not being charged yet/i)).toBeInTheDocument()
    expect(screen.getAllByText('Prospect dashboard builds').length).toBeGreaterThan(0)
    expect(screen.getByText('3 (1 on your key)')).toBeInTheDocument()
    expect(screen.getByText('Founding member')).toBeInTheDocument()
    // Once, in the activity list. The second was the purchase stepper's dead
    // third step, which no longer renders.
    expect(screen.getAllByText('Credits added')).toHaveLength(1)
    expect(screen.getByText('+25')).toBeInTheDocument()
  })

  it('offers a platform administrator the workspace top-up', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    mockedWorkspaces.mockResolvedValue([
      { id: '22222222-2222-4222-8222-222222222222', name: 'Northwind Agency', slug: 'northwind', status: 'active', is_default: false },
    ] as never)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Top up a workspace' })).toBeInTheDocument()
    expect(mockedWorkspaces).toHaveBeenCalled()
  })

  // The picker used to run off the roster of workspaces whose owner can be
  // acted on, so an agency whose owner had been invited but had not accepted
  // was absent from the list and could not be credited at all. The grant lands
  // on the workspace ledger, so the owner is a name to show, not a condition.
  it('lists a workspace whose owner has not accepted yet', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    mockedWorkspaces.mockResolvedValue([
      { id: '33333333-3333-4333-8333-333333333333', name: 'Unaccepted Agency', slug: 'unaccepted', status: 'active', is_default: false },
    ] as never)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Top up a workspace' })).toBeInTheDocument()
    // listGrantableWorkspaces does not filter on owner reachability at all, so
    // the workspace reaches the picker for the admin to select.
    expect(mockedWorkspaces).toHaveBeenCalled()
    expect(screen.queryByText(/no reachable owner to credit/i)).not.toBeInTheDocument()
  })

  it('drops the inert purchase stepper that never advanced', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: false,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    // Checkout happens on Stripe's domain, so steps two and three could never
    // light up. It was decoration rendering below the platform admin tools.
    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Credit purchase steps' })).not.toBeInTheDocument()
    expect(screen.queryByText('Review checkout')).not.toBeInTheDocument()
  })

  // The grant is refused for anyone but a platform admin at the edge function,
  // so offering it to a workspace owner would only render a button that 403s.
  it('never offers the top-up to a workspace owner who is not a platform admin', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: false,
      canManageWorkspaceStaff: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com' },
      workspace: { id: '11111111-1111-4111-8111-111111111111' },
    } as never)
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Top up a workspace' })).not.toBeInTheDocument()
    expect(mockedWorkspaces).not.toHaveBeenCalled()
  })

  it('returns members without Settings access to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
