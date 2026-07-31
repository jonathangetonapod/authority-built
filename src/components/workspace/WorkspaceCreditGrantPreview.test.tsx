import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceBillingOverview, grantWorkspaceCredits } from '@/services/workspaceStaff'
import { WorkspaceCreditGrantPreview } from '@/components/workspace/WorkspaceCreditGrantPreview'

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: toastSuccess } }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
}))

const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedGrant = vi.mocked(grantWorkspaceCredits)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const overview = {
  plan_key: 'founding_member',
  billing_status: 'trialing',
  base_price_cents: 3900,
  per_client_price_cents: 3900,
  included_active_clients: 1,
  monthly_credit_allowance: 25,
  enforcement_enabled: false,
  balance: 10,
  expiring_credits: 0,
  next_expiry_at: null,
  usage_this_month: {},
  prices: {},
  recent_activity: [],
}

function renderPanel(props: Partial<Parameters<typeof WorkspaceCreditGrantPreview>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCreditGrantPreview
        workspaceId={workspaceId}
        workspaceName="Acme Workspace"
        ownerName="Workspace Owner"
        ownerEmail="owner@example.com"
        actorEmail="platform@example.com"
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('WorkspaceCreditGrantPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedOverview.mockResolvedValue(overview as never)
    mockedGrant.mockResolvedValue({ granted: 100, balance: 110 })
  })

  it('previews a manual credit grant with an explicit reason and confirmation', async () => {
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    const review = within(section).getByRole('button', { name: 'Review credit grant' })
    expect(review).toBeDisabled()

    fireEvent.click(within(section).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    // The reason alone arms the grant: a written justification on every top-up
    // was friction the audit row did not need, so the note is optional now.
    expect(review).toBeEnabled()

    fireEvent.change(within(section).getByLabelText(/Internal note/), {
      target: { value: 'Onboarding courtesy for the new workspace.' },
    })
    fireEvent.click(review)

    const confirmation = screen.getByRole('alertdialog', { name: 'Add 100 credits to Acme Workspace?' })
    expect(within(confirmation).getByText('Workspace Owner')).toBeInTheDocument()
    expect(within(confirmation).getByText('Customer support')).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add credits' }))

    expect(await within(section).findByText('Granted by platform@example.com')).toBeInTheDocument()
    expect(within(section).getByText('Balance 110')).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith('100 credits added to Acme Workspace.')
  })

  // The credit goes to the workspace ledger, so an owner who has not accepted
  // their invite is a missing name, not a reason to refuse the grant.
  it('still offers the grant for a workspace with no owner on the roster', async () => {
    renderPanel({ ownerName: null, ownerEmail: null })

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(section).getByText('Nobody has accepted the invite yet')).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    expect(within(section).getByRole('button', { name: 'Review credit grant' })).toBeEnabled()
  })

  // The balance used to fall back to 0 when the read failed, and there are no
  // retries. An admin who topped this workspace up an hour ago would read the
  // 0 as the grant never landing, and grant a second time.
  it('does not report a balance of zero when the balance could not be read', async () => {
    mockedOverview.mockRejectedValue(new Error('Billing data could not be loaded.'))
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(await within(section).findByText('Unavailable')).toBeInTheDocument()
    expect(within(section).queryByLabelText('0 credits available')).not.toBeInTheDocument()
    expect(within(section).getByText(/could not be read, so this cannot be projected/i)).toBeInTheDocument()
  })

  // Named after the workspace rather than the owner: a workspace called after
  // the person who owns it turned "granted to X, not to this person" into a
  // sentence that contradicted the card above it.
  it('names the workspace, not the owner, as what the credits belong to', async () => {
    renderPanel()

    const section = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(section).getByText(/credits belong to the workspace, not to whoever owns it today/i))
      .toBeInTheDocument()
  })
})
