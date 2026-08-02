import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSubscriptionStatus } from '@/components/workspace/WorkspaceSubscriptionStatus'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceSubscriptionStatus workspaceId={workspaceId} workspaceName="Juliana Munoz" />
  </QueryClientProvider>,
)

describe('WorkspaceSubscriptionStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('names the status and says what happens next', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active',
      plan_key: 'founding_member',
      base_price_cents: 3900,
      current_period_end: '2026-09-01T00:00:00Z',
      has_subscription: true,
      stripe_customer_id: 'cus_123',
    } as never)
    renderCard()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    // A status word alone tells an operator nothing about what happens next.
    expect(screen.getByText(/renewing on schedule/i)).toBeInTheDocument()
    expect(screen.getByText('$39.00/mo')).toBeInTheDocument()
  })

  it('distinguishes a paused subscription from a cancelled one', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'paused', plan_key: 'standard', base_price_cents: 3900, has_subscription: true,
    } as never)
    renderCard()

    expect(await screen.findByText('Paused')).toBeInTheDocument()
    expect(screen.getByText(/No allowance is granted while paused/i)).toBeInTheDocument()
  })

  it('says a cancellation is coming while the status still reads active', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active',
      plan_key: 'standard',
      base_price_cents: 3900,
      cancel_at_period_end: true,
      current_period_end: '2026-09-01T00:00:00Z',
      has_subscription: true,
    } as never)
    renderCard()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/^Ends /)).toBeInTheDocument()
  })

  it('links to the customer in Stripe when there is one', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active', plan_key: 'standard', base_price_cents: 3900, stripe_customer_id: 'cus_abc',
    } as never)
    renderCard()

    expect(await screen.findByRole('link', { name: /Open in Stripe/i }))
      .toHaveAttribute('href', 'https://dashboard.stripe.com/customers/cus_abc')
  })

  it('says so when no Stripe customer exists yet', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', base_price_cents: 3900, has_subscription: false,
    } as never)
    renderCard()

    expect(await screen.findByText(/No Stripe customer yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open in Stripe/i })).not.toBeInTheDocument()
  })
})
