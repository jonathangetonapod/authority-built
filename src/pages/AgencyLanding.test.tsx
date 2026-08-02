import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AgencyLanding from './AgencyLanding'
import { requestWorkspaceAccess } from '@/services/accessRequests'

vi.mock('@/services/accessRequests', () => ({ requestWorkspaceAccess: vi.fn() }))

const request = vi.mocked(requestWorkspaceAccess)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <HelmetProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter><AgencyLanding /></MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('AgencyLanding', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(undefined)
  })

  it('renders its content and points at the two doors', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/more podcasts, in less time/iu)
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /skip to content/iu })).toHaveAttribute('href', '#tour')
  })

  /*
   * Every screenshot is a file dropped into public/shots. Until one is there the
   * frame must degrade to a placeholder rather than a broken-image icon, and the
   * page must still be readable.
   */
  it('falls back to a named placeholder when a screenshot is missing', () => {
    renderPage()
    const hero = screen.getByAltText(/the workspace/iu)
    fireEvent.error(hero)
    expect(screen.queryByAltText(/the workspace/iu)).toBeNull()
    expect(screen.getByText(/shots\/hero\.png/u)).toBeInTheDocument()
  })

  // Three controls used to compute to "Request access"; the submit button now
  // says what it does, so a rotor can tell them apart.
  it('gives the submit button a name of its own', () => {
    renderPage()
    expect(screen.getAllByRole('link', { name: 'Request to join' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument()
  })

  it('refuses to send an incomplete request instead of spending one on the server', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/add your name/iu)
    expect(screen.getByLabelText(/your name/iu)).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/work email we can reply to/iu)
  })

  it('sends an access request and confirms it, without creating an account', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'dana@example.com' } })
    fireEvent.change(screen.getByLabelText(/what you run/iu), { target: { value: 'freelancer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    expect(request.mock.calls[0][0]).toMatchObject({
      fullName: 'Dana Reyes',
      email: 'dana@example.com',
      audience: 'freelancer',
    })
    expect(await screen.findByText(/request received/iu)).toBeInTheDocument()
  })

  it('shows why the request failed and keeps what was typed', async () => {
    request.mockRejectedValue(new Error('A few requests have already come from here today.'))
    renderPage()

    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'dana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already come from here today/iu)
    expect(screen.getByLabelText(/your name/iu)).toHaveValue('Dana Reyes')
  })
})
