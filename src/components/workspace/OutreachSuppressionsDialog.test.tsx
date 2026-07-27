import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OutreachSuppressionsDialog } from '@/components/workspace/OutreachSuppressionsDialog'
import {
  addOutreachSuppression,
  listOutreachSuppressions,
  removeOutreachSuppression,
  type OutreachSuppression,
} from '@/services/hostRelationships'

vi.mock('@/services/hostRelationships', () => ({
  addOutreachSuppression: vi.fn(),
  listOutreachSuppressions: vi.fn(),
  removeOutreachSuppression: vi.fn(),
}))

const mockedList = vi.mocked(listOutreachSuppressions)
const mockedAdd = vi.mocked(addOutreachSuppression)
const mockedRemove = vi.mocked(removeOutreachSuppression)

const workspaceId = '11111111-1111-4111-8111-111111111111'

const suppression = (overrides: Partial<OutreachSuppression> = {}): OutreachSuppression => ({
  contact_email: 'morgan@example.com',
  reason: 'opted_out',
  source: 'inbox_auto',
  note: 'Detected in a reply for client Dallas Fontaine',
  created_at: '2026-07-20T12:00:00.000Z',
  created_by_email: null,
  host_name: 'Morgan Host',
  podcast_name: 'Founder &amp; Operator',
  podcast_id: 'show-one',
  touch_count: 3,
  ...overrides,
})

const renderDialog = (canManage = true) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OutreachSuppressionsDialog
      workspaceId={workspaceId}
      canManage={canManage}
      open
      onOpenChange={() => undefined}
    />
  </QueryClientProvider>,
)

describe('OutreachSuppressionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue([suppression()])
    mockedAdd.mockResolvedValue(undefined)
    mockedRemove.mockResolvedValue(undefined)
  })

  it('shows who is behind an address and how much outreach preceded the opt-out', async () => {
    renderDialog()

    expect(await screen.findByText('morgan@example.com')).toBeInTheDocument()
    expect(screen.getByText('Morgan Host · Founder & Operator')).toBeInTheDocument()
    expect(screen.getByText(/Detected in a reply on Jul 20, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/3 pitches sent before this/)).toBeInTheDocument()
  })

  it('adds an address for the whole workspace, not one campaign', async () => {
    renderDialog()
    await screen.findByText('morgan@example.com')

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'quiet@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Add to list/i }))

    await waitFor(() => expect(mockedAdd).toHaveBeenCalledWith(workspaceId, {
      contactEmail: 'quiet@example.com',
      reason: 'opted_out',
      note: null,
    }))
  })

  it('refuses to reinstate an address until a reason is written down', async () => {
    renderDialog()
    await screen.findByText('morgan@example.com')

    fireEvent.click(screen.getByRole('button', { name: /Reinstate/i }))

    const confirm = await screen.findByRole('button', { name: /Reinstate address/i })
    expect(confirm).toBeDisabled()
    // The host's own words are shown next to the decision to undo them.
    expect(screen.getByText(/a reply from it asked to stop/i)).toBeInTheDocument()
    // Once in the row, and again beside the button that would undo it.
    expect(screen.getAllByText(/Detected in a reply for client Dallas Fontaine/)).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Why is this safe?'), {
      target: { value: 'They unsubscribed from the newsletter, not from us.' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith(workspaceId, {
      contactEmail: 'morgan@example.com',
      note: 'They unsubscribed from the newsletter, not from us.',
    }))
  })

  it('lets a member read the list without offering them the controls', async () => {
    renderDialog(false)

    expect(await screen.findByText('morgan@example.com')).toBeInTheDocument()
    expect(screen.getByText(/Owners and admins change the list/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reinstate/i })).not.toBeInTheDocument()
  })

  it('explains an empty list rather than showing a bare panel', async () => {
    mockedList.mockResolvedValue([])
    renderDialog()

    expect(await screen.findByText('Nobody is suppressed')).toBeInTheDocument()
    expect(screen.getByText(/stops for every client/i)).toBeInTheDocument()
  })
})
