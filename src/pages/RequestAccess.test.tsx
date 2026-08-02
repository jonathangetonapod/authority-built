import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequestAccess from './RequestAccess'
import { requestWorkspaceAccess } from '@/services/accessRequests'

vi.mock('@/services/accessRequests', () => ({ requestWorkspaceAccess: vi.fn() }))

const request = vi.mocked(requestWorkspaceAccess)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter><RequestAccess /></MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('RequestAccess', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(undefined)
  })

  it('names itself a request, and points at the door for people who have an account', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/request access/iu)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    // The invite-only promise, said before the button rather than after.
    expect(screen.getByText(/does not create an account/iu)).toBeInTheDocument()
  })

  it('sends the request from this page too, not only from the landing page', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'dana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /request access/iu }))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/request received/iu)).toBeInTheDocument()
  })
})
