import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBillingPlans, updateBillingPlanPrice } from '@/services/workspaceStaff'
import { PlatformPlanPricing } from '@/components/workspace/PlatformPlanPricing'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  listBillingPlans: vi.fn(),
  updateBillingPlanPrice: vi.fn(),
}))

const mockedList = vi.mocked(listBillingPlans)
const mockedUpdate = vi.mocked(updateBillingPlanPrice)

const plans = [
  { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 3900, monthly_credit_allowance: 100, stripe_price_id: 'price_founding', is_purchasable: true },
  { plan_key: 'standard', display_name: 'Standard', base_price_cents: 9900, monthly_credit_allowance: 100, stripe_price_id: null, is_purchasable: true },
  { plan_key: 'comped', display_name: 'Complimentary', base_price_cents: 0, monthly_credit_allowance: 0, stripe_price_id: null, is_purchasable: false },
]

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PlatformPlanPricing />
    </QueryClientProvider>,
  )
}

describe('PlatformPlanPricing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows each plan at the price it is actually sold at', async () => {
    mockedList.mockResolvedValue(plans as never)
    renderPanel()

    expect(await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-founding_member' })).toHaveValue('39.00')
    expect(screen.getByLabelText('Per month (USD)', { selector: '#plan-price-standard' })).toHaveValue('99.00')
    expect(screen.getByText('price_founding')).toBeInTheDocument()
  })

  // A plan with no Stripe price cannot be subscribed to, and the edge function
  // refuses it. Saying so here beats a customer finding out at checkout.
  it('flags a purchasable plan that has no Stripe price yet', async () => {
    mockedList.mockResolvedValue(plans as never)
    renderPanel()

    expect(await screen.findByText('No Stripe price yet')).toBeInTheDocument()
  })

  // Complimentary is assigned, not sold, so there is nothing to price.
  it('offers no price field for a plan that is not sold', async () => {
    mockedList.mockResolvedValue(plans as never)
    renderPanel()

    await screen.findByText('Complimentary')
    expect(screen.getByText('Assigned, not sold')).toBeInTheDocument()
    expect(screen.queryByLabelText('Per month (USD)', { selector: '#plan-price-comped' })).not.toBeInTheDocument()
  })

  it('sends the new price in cents, and only once it differs', async () => {
    mockedList.mockResolvedValue(plans as never)
    mockedUpdate.mockResolvedValue(plans as never)
    renderPanel()

    const field = await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-founding_member' })
    const save = screen.getAllByRole('button', { name: 'Save' })[0]
    // Unchanged: nothing to do, and a new Stripe price for the same amount
    // would be pure churn.
    expect(save).toBeDisabled()

    fireEvent.change(field, { target: { value: '49.50' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('founding_member', 4950, 100))
  })

  // Standard is seeded at 9900 with no Stripe Price. Comparing only the number
  // left Save disabled at exactly the amount that needed creating, so the plan
  // could not be set up without first typing a price nobody wanted.
  it('can create the first price at the amount already shown', async () => {
    mockedList.mockResolvedValue(plans as never)
    mockedUpdate.mockResolvedValue(plans as never)
    renderPanel()

    await screen.findByText('No Stripe price yet')
    const save = screen.getAllByRole('button', { name: 'Save' })[1]
    expect(save).toBeEnabled()

    fireEvent.click(save)
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('standard', 9900, 100))
  })

  // Once a plan has a Price, saving the same number again is churn.
  it('leaves save disabled for a priced plan at an unchanged amount', async () => {
    mockedList.mockResolvedValue(plans as never)
    renderPanel()

    await screen.findByText('price_founding')
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled()
  })

  // A plan's allowance is what a workspace gets each month, and it moves with
  // the plan. Editing it alone is a change worth saving.
  it('saves an allowance change on its own', async () => {
    mockedList.mockResolvedValue(plans as never)
    mockedUpdate.mockResolvedValue(plans as never)
    renderPanel()

    const credits = await screen.findByLabelText('Credits/month', { selector: '#plan-credits-founding_member' })
    const save = screen.getAllByRole('button', { name: 'Save' })[0]
    expect(save).toBeDisabled()

    fireEvent.change(credits, { target: { value: '250' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('founding_member', 3900, 250))
  })

  it('refuses an amount that is not money', async () => {
    mockedList.mockResolvedValue(plans as never)
    renderPanel()

    const field = await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-founding_member' })
    fireEvent.change(field, { target: { value: '12.345' } })
    expect(screen.getAllByRole('button', { name: 'Save' })[0]).toBeDisabled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('says so when the plans cannot be loaded, rather than showing an empty list', async () => {
    mockedList.mockRejectedValue(new Error('nope'))
    renderPanel()

    expect(await screen.findByRole('alert')).toHaveTextContent('The plans could not be loaded.')
  })
})
