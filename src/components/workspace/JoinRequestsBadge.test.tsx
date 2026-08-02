import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinRequestsBadge } from './JoinRequestsBadge'
import { countWaitingJoinRequests } from '@/services/accessRequests'

vi.mock('@/services/accessRequests', () => ({ countWaitingJoinRequests: vi.fn() }))

const count = vi.mocked(countWaitingJoinRequests)

function renderBadge(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><JoinRequestsBadge enabled={enabled} /></QueryClientProvider>,
  )
}

describe('JoinRequestsBadge', () => {
  beforeEach(() => count.mockReset().mockResolvedValue(0))

  it('says the number, not just a red dot', async () => {
    count.mockResolvedValue(3)
    renderBadge()
    expect(await screen.findByText('3')).toBeInTheDocument()
    // A colour is not a message. The count has to reach a screen reader too.
    expect(screen.getByText('3 requests to join are waiting')).toBeInTheDocument()
  })

  it('reads as one request rather than "1 requests"', async () => {
    count.mockResolvedValue(1)
    renderBadge()
    expect(await screen.findByText('1 request to join is waiting')).toBeInTheDocument()
  })

  it('shows nothing when nobody is waiting', async () => {
    renderBadge()
    await waitFor(() => expect(count).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('caps the label so a long number cannot stretch the button', async () => {
    count.mockResolvedValue(42)
    renderBadge()
    expect(await screen.findByText('9+')).toBeInTheDocument()
    expect(screen.getByText('42 requests to join are waiting')).toBeInTheDocument()
  })

  // Nobody but a platform admin can read the table, so asking would be a
  // request per page load that always comes back empty.
  it('does not ask at all when the viewer is not a platform admin', async () => {
    renderBadge(false)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(count).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
