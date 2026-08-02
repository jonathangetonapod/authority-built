import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceDomainsCard } from '@/components/workspace/WorkspaceDomainsCard'
import {
  addWorkspaceDomain,
  listWorkspaceDomains,
  refreshWorkspaceDomain,
  removeWorkspaceDomain,
  setPrimaryWorkspaceDomain,
  type WorkspaceDomain,
} from '@/services/workspaceDomains'

vi.mock('@/services/workspaceDomains', () => ({
  addWorkspaceDomain: vi.fn(),
  listWorkspaceDomains: vi.fn(),
  refreshWorkspaceDomain: vi.fn(),
  removeWorkspaceDomain: vi.fn(),
  setPrimaryWorkspaceDomain: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const domain = (overrides: Partial<WorkspaceDomain> = {}): WorkspaceDomain => ({
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspaceId,
  hostname: 'podcasts.theiragency.com',
  status: 'awaiting_dns',
  is_primary: false,
  dns_record_type: 'CNAME',
  dns_record_name: 'podcasts.theiragency.com',
  dns_record_value: 'target.up.railway.app',
  last_error: null,
  activated_at: null,
  first_activated_at: null,
  last_checked_at: null,
  created_at: '2026-08-01T00:00:00Z',
  workspace: { id: workspaceId, name: 'Iveth Gonalez', slug: 'iveth' },
  ...overrides,
})

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceDomainsCard workspaces={[{ id: workspaceId, name: 'Iveth Gonalez' }]} />
  </QueryClientProvider>,
)

const typeHostname = (value: string) => {
  fireEvent.change(screen.getByLabelText('Hostname'), { target: { value } })
}

const chooseWorkspace = async () => {
  fireEvent.click(screen.getByRole('combobox', { name: /workspace/i }))
  fireEvent.click(await screen.findByRole('option', { name: 'Iveth Gonalez' }))
}

describe('WorkspaceDomainsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listWorkspaceDomains).mockResolvedValue([])
    vi.mocked(addWorkspaceDomain).mockResolvedValue(domain())
    vi.mocked(refreshWorkspaceDomain).mockResolvedValue('active')
    vi.mocked(setPrimaryWorkspaceDomain).mockResolvedValue()
    vi.mocked(removeWorkspaceDomain).mockResolvedValue()
  })

  it('states the whole flow before the form rather than through it', async () => {
    renderCard()
    expect(await screen.findByText('How this works')).toBeInTheDocument()
    expect(screen.getByText(/Use a subdomain, not their root domain/i)).toBeInTheDocument()
    expect(screen.getByText(/Proxy status must be DNS only/i)).toBeInTheDocument()
    expect(screen.getByText(/Every workspace serves from getonapod.com/i)).toBeInTheDocument()
  })

  // The mistake is caught in the field, not by the server after a round trip.
  it('refuses a bare name and names the fix', async () => {
    renderCard()
    await chooseWorkspace()
    typeHostname('podcasts')

    expect(await screen.findByText(/needs a dot in it/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add domain/i })).toBeDisabled()
  })

  it('refuses our own address before a real domain is registered anywhere', async () => {
    renderCard()
    await chooseWorkspace()
    typeHostname('app.getonapod.com')

    expect(await screen.findByText(/our address, not theirs/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add domain/i })).toBeDisabled()
    expect(addWorkspaceDomain).not.toHaveBeenCalled()
  })

  it('sends the hostname it shows, not the URL that was pasted', async () => {
    renderCard()
    await chooseWorkspace()
    typeHostname('https://podcasts.theiragency.com/dashboard')

    expect(await screen.findByText(/Will be added as/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add domain/i }))

    await waitFor(() => expect(addWorkspaceDomain).toHaveBeenCalledWith(workspaceId, 'podcasts.theiragency.com'))
  })

  // Allowed, because an unused root domain is a real case — but the warning
  // says what it would do, and the fix is one click.
  it('warns on a root domain and swaps in the subdomain when offered', async () => {
    renderCard()
    await chooseWorkspace()
    typeHostname('theiragency.com')

    expect(await screen.findByText(/takes their website down with it/i)).toBeInTheDocument()
    // Still addable: the warning informs, it does not block.
    expect(screen.getByRole('button', { name: /Add domain/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /Use podcasts.theiragency.com instead/i }))
    expect((screen.getByLabelText('Hostname') as HTMLInputElement).value).toBe('podcasts.theiragency.com')
    await waitFor(() => expect(screen.queryByText(/takes their website down with it/i)).not.toBeInTheDocument())
  })

  it('says whose turn it is on a waiting domain, and prints the exact record', async () => {
    vi.mocked(listWorkspaceDomains).mockResolvedValue([domain()])
    renderCard()

    expect(await screen.findByText(/Waiting on the agency/i)).toBeInTheDocument()
    expect(screen.getByText('target.up.railway.app')).toBeInTheDocument()
    // Beside the record, where someone stares when it has not moved.
    expect(screen.getByText(/Proxy status has to be DNS only/i)).toBeInTheDocument()
    expect(screen.getByText(/Check is only there if you want an answer sooner/i)).toBeInTheDocument()
  })

  // The copied message is the artifact that leaves the product and does the
  // actual work, so the step that most often gets missed has to be in it.
  it('puts the Cloudflare step in the message sent to the agency', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.mocked(listWorkspaceDomains).mockResolvedValue([domain()])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /Copy instructions/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())

    const message: string = writeText.mock.calls[0][0]
    expect(message).toContain('CNAME')
    expect(message).toContain('podcasts.theiragency.com')
    expect(message).toContain('target.up.railway.app')
    expect(message).toMatch(/"DNS only", not "Proxied"/)
    expect(message).toMatch(/grey, not orange/)
    // Says why waiting will not save them, because that is what they will do.
    expect(message).toMatch(/waiting longer never fixes it/i)
  })

  // The state that used to be unreachable: DNS done, certificate pending. It
  // must not send anyone back to DNS to fix what the provider has confirmed.
  it('stops pointing at DNS once the record has propagated', async () => {
    vi.mocked(listWorkspaceDomains).mockResolvedValue([domain({ status: 'provisioning' })])
    renderCard()

    expect(await screen.findByText(/now confirmed in place/i)).toBeInTheDocument()
    expect(screen.getByText(/certificate is being issued/i)).toBeInTheDocument()
    expect(screen.queryByText(/Proxy status has to be DNS only/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copy instructions/i })).not.toBeInTheDocument()
  })

  it('tells someone looking at a failure what to do about it', async () => {
    vi.mocked(listWorkspaceDomains).mockResolvedValue([
      domain({ status: 'failed', last_error: 'The DNS record has not been created yet' }),
    ])
    renderCard()

    expect(await screen.findByText(/press Check/i)).toBeInTheDocument()
    expect(screen.getByText('The DNS record has not been created yet')).toBeInTheDocument()
  })

  it('says what a serving domain gives their clients, and how long it has', async () => {
    vi.mocked(listWorkspaceDomains).mockResolvedValue([domain({
      status: 'active',
      is_primary: true,
      activated_at: '2026-08-01T00:00:00Z',
      // Deliberately older than activated_at: a domain that dipped and
      // recovered re-mints activated_at, and "serving since" must not restart.
      first_activated_at: '2026-06-15T00:00:00Z',
    })])
    renderCard()

    expect(await screen.findByText(/Live\./i)).toBeInTheDocument()
    // Locale decides the order of the parts, so assert the date, not a format.
    expect(screen.getByText(/Serving since .*Jun.*2026/i)).toBeInTheDocument()
    expect(screen.getByText('Links use this')).toBeInTheDocument()
    // Nothing left to set up, so the DNS record block is gone.
    expect(screen.queryByText('target.up.railway.app')).not.toBeInTheDocument()
  })

  // Removing deletes the domain at the provider, so it does not happen off a
  // trash icon — and the dialog says what cannot be taken back.
  it('confirms removal by naming what it costs', async () => {
    vi.mocked(listWorkspaceDomains).mockResolvedValue([domain({ status: 'active', is_primary: true })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /Remove podcasts.theiragency.com/i }))
    const dialog = within(await screen.findByRole('alertdialog'))
    expect(dialog.getByText(/Any link already sent on this address stops working/i)).toBeInTheDocument()
    expect(dialog.getByText(/new links will go out on getonapod.com instead/i)).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(removeWorkspaceDomain).not.toHaveBeenCalled())
  })
})
