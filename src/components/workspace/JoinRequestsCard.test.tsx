import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinRequestsCard } from './JoinRequestsCard'
import { listJoinRequests, setJoinRequestStatus, type JoinRequest } from '@/services/accessRequests'
import { inviteWorkspaceUser } from '@/services/workspaceUsers'

vi.mock('@/services/accessRequests', () => ({
  listJoinRequests: vi.fn(),
  setJoinRequestStatus: vi.fn(),
}))
vi.mock('@/services/workspaceUsers', () => ({ inviteWorkspaceUser: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const list = vi.mocked(listJoinRequests)
const move = vi.mocked(setJoinRequestStatus)
const sendInvite = vi.mocked(inviteWorkspaceUser)

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const request = (over: Partial<JoinRequest>): JoinRequest => ({
  id: 'r1',
  email: 'dana@example.com',
  full_name: 'Dana Reyes',
  company: 'Northwind Media',
  website: null,
  audience: 'agency',
  clients_now: '4–10',
  notes: null,
  status: 'new',
  handled_at: null,
  handled_note: null,
  created_at: daysAgo(1),
  ...over,
})

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}><JoinRequestsCard /></QueryClientProvider>)
}

describe('JoinRequestsCard', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([])
    move.mockReset().mockResolvedValue(undefined)
    sendInvite.mockReset().mockResolvedValue(undefined as never)
  })

  it('says the queue is empty rather than showing a fault', async () => {
    renderCard()
    expect(await screen.findByText(/no one has asked to join yet/iu)).toBeInTheDocument()
  })

  /*
   * Whoever has waited longest is the one at risk of being forgotten, so the
   * waiting ones lead and the oldest of those is first. Ordering by created_at
   * alone would bury a two-week-old request under yesterday's declines.
   */
  it('leads with whoever has waited longest, and counts them', async () => {
    list.mockResolvedValue([
      request({ id: 'fresh', full_name: 'Fresh Waiter', created_at: daysAgo(1) }),
      request({ id: 'done', full_name: 'Already Invited', status: 'invited', created_at: daysAgo(30) }),
      request({ id: 'stale', full_name: 'Stale Waiter', created_at: daysAgo(12) }),
    ])
    renderCard()

    await screen.findByText('Stale Waiter')
    // Read the first cell of each body row, not every button on the page —
    // the action buttons are also called "Mark invited".
    const rows = screen.getAllByRole('row').slice(1)
    const names = rows
      .map((row) => within(row).queryAllByRole('cell')[0]?.textContent ?? '')
      .filter(Boolean)
      .map((text) => text.split('dana@')[0])
    expect(names).toEqual(['Stale Waiter', 'Fresh Waiter', 'Already Invited'])
    expect(screen.getByText('2 waiting')).toBeInTheDocument()
    expect(screen.getByText('12 days')).toBeInTheDocument()
  })

  it('moves a request and offers the way back from a misclick', async () => {
    // The refetch after the mutation returns the moved row, so the undo has to
    // be queued before the click rather than after it.
    list.mockResolvedValueOnce([request({})])
    list.mockResolvedValue([request({ status: 'declined', handled_at: daysAgo(0) })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(move).toHaveBeenCalledWith('r1', 'declined'))
    expect(await screen.findByRole('button', { name: /move back to waiting/iu })).toBeInTheDocument()
  })

  /*
   * Sending mails a stranger and creates a workspace in their name, so it asks
   * first and says who and what. A table row should not be able to do that on
   * one stray click.
   */
  it('asks before sending, naming the person and the workspace', async () => {
    list.mockResolvedValue([request({ company: 'Northwind Media' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dana@example.com')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Northwind Media/u).length).toBeGreaterThan(0)
    expect(sendInvite).not.toHaveBeenCalled()
  })

  it('sends the invitation, then records it — in that order', async () => {
    list.mockResolvedValue([request({ company: 'Northwind Media' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith({
      email: 'dana@example.com',
      full_name: 'Dana Reyes',
      workspace_name: 'Northwind Media',
    }))
    expect(move).toHaveBeenCalledWith('r1', 'invited')
  })

  // Marking it invited when no email left the building is the lie the old
  // "Mark invited" button could tell.
  it('does not record an invitation that failed to send', async () => {
    sendInvite.mockRejectedValue(new Error('invite email delivery is not configured'))
    list.mockResolvedValue([request({})])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalled())
    expect(move).not.toHaveBeenCalled()
  })

  it('falls back to their own name when they gave no company', async () => {
    list.mockResolvedValue([request({ company: null })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_name: 'Dana Reyes' }),
    ))
  })

  // The queue is for deciding, so what they wrote has to be reachable.
  it('opens what they said, and a way to reply to them', async () => {
    list.mockResolvedValue([request({ notes: 'Using a spreadsheet and Instantly.', website: 'https://northwind.example' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Dana Reyes' }))
    expect(screen.getByText(/using a spreadsheet and instantly/iu)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reply/iu })).toHaveAttribute('href', expect.stringContaining('dana@example.com'))
    // safeExternalUrl normalises through URL.toString(), which adds the slash.
    expect(screen.getByRole('link', { name: /their site/iu })).toHaveAttribute('href', 'https://northwind.example/')
  })

  it('shows why the queue could not be loaded instead of an empty one', async () => {
    list.mockRejectedValue(new Error('permission denied for table workspace_access_requests'))
    renderCard()

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/iu)
    expect(screen.queryByText(/no one has asked to join yet/iu)).toBeNull()
  })
})
