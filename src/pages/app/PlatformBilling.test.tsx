import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { listGrantableWorkspaces } from '@/services/adminWorkspaces'
import { listBillingPlans } from '@/services/workspaceStaff'
import PlatformBilling from '@/pages/app/PlatformBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/adminWorkspaces', () => ({ listGrantableWorkspaces: vi.fn() }))
vi.mock('@/services/workspaceStaff', () => ({
  listBillingPlans: vi.fn(),
  updateBillingPlanPrice: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
  getWorkspaceBillingOverview: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedWorkspaces = vi.mocked(listGrantableWorkspaces)
const mockedPlans = vi.mocked(listBillingPlans)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/platform/billing']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/platform/billing" element={<PlatformBilling />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PlatformBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedWorkspaces.mockResolvedValue([
      { id: '22222222-2222-4222-8222-222222222222', name: 'Northwind Agency', slug: 'northwind', status: 'active', is_default: false },
    ] as never)
    mockedPlans.mockResolvedValue([
      { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 3900, monthly_credit_allowance: 100, stripe_price_id: 'price_x', is_purchasable: true },
    ] as never)
  })

  it('carries both platform billing tools on one page', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
    } as never)
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Plan pricing' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top up a workspace' })).toBeInTheDocument()
    expect(mockedPlans).toHaveBeenCalled()
    expect(mockedWorkspaces).toHaveBeenCalled()
  })

  it('leads back to the workspace own billing', async () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'jonathan@getonapod.com' },
    } as never)
    renderPage()

    expect(await screen.findByRole('link', { name: /Your own billing/ }))
      .toHaveAttribute('href', '/app/settings/billing')
  })

  // Setting what every workspace pays is not a tenant capability. The edge
  // actions refuse a non-admin anyway, so rendering the page would only build
  // a screen whose every button 403s.
  it('sends anyone who is not a platform admin away', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, user: { id: 'x' } } as never)
    renderPage()

    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
    expect(mockedPlans).not.toHaveBeenCalled()
    expect(mockedWorkspaces).not.toHaveBeenCalled()
  })
})
