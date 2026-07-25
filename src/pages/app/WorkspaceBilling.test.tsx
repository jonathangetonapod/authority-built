import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'
import WorkspaceBilling from '@/pages/app/WorkspaceBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedOverview = vi.mocked(getWorkspaceBillingOverview)

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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={['/app/settings/billing']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

  it('keeps Waterfall pack selection in Settings billing', () => {
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
    expect(screen.getByText('Available on Solo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select 100 credits for $39' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select 500 credits for $149' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select 2,000 credits for $399' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Select 2,000 credits for $399' }))
    expect(screen.getByRole('button', { name: 'Select 2,000 credits for $399' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('High volume')).toBeInTheDocument()
    expect(screen.queryByText(/per verified email/i)).not.toBeInTheDocument()
    expect(screen.getByText('One-time purchase; your plan will not change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to secure checkout · $399' })).toBeInTheDocument()
    expect(screen.getByText(/No charge for unsuccessful searches/i)).toBeInTheDocument()
    expect(screen.getByText('Global cache first')).toBeInTheDocument()
    expect(screen.getByText(/reuse the verified contact for 0 credits/i)).toBeInTheDocument()
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
    expect(screen.getAllByText('Credits added').length).toBeGreaterThan(1)
    expect(screen.getByText('+25')).toBeInTheDocument()
  })

  it('returns members without Settings access to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
