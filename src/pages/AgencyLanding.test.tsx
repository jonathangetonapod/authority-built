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

  // jsdom has no canvas context and no IntersectionObserver. The page must
  // render its content anyway: an effect is how the reveal animates, never how
  // the words become readable.
  it('renders its content without a canvas or an observer', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    const panel = document.querySelector('.gp-tabs')
    expect(panel?.classList.contains('gp-shown')).toBe(true)
  })

  // The panel is chosen by React, not by an effect writing to the DOM, so a
  // re-render — a hash change, say — cannot put the tabs back to the first one.
  it('opens the panel for the tab that was picked, and survives a re-render', () => {
    renderPage()
    expect(document.getElementById('p-pr')).toHaveAttribute('hidden')

    fireEvent.click(screen.getByRole('tab', { name: 'PR / comms agency' }))
    expect(document.getElementById('p-pr')).not.toHaveAttribute('hidden')
    expect(document.getElementById('p-agency')).toHaveAttribute('hidden')

    // Typing into the form re-renders its own subtree; the tab must not move.
    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana' } })
    expect(document.getElementById('p-pr')).not.toHaveAttribute('hidden')
  })

  // noValidate turns off the browser's own check, so something has to replace
  // it — otherwise a blank form is sent, refused by the edge function, and
  // burns one of the caller's five requests for the day.
  it('refuses to send an incomplete request instead of spending one on the server', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /request access/iu }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/add your name/iu)
    expect(screen.getByLabelText(/your name/iu)).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /request access/iu }))
    expect(request).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/work email we can reply to/iu)
  })

  it('sends an access request and confirms it, without creating an account', async () => {
    renderPage()

    fireEvent.change(screen.getByLabelText(/your name/iu), { target: { value: 'Dana Reyes' } })
    fireEvent.change(screen.getByLabelText(/work email/iu), { target: { value: 'dana@example.com' } })
    fireEvent.change(screen.getByLabelText(/what you run/iu), { target: { value: 'freelancer' } })
    fireEvent.click(screen.getByRole('button', { name: /request access/iu }))

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
    fireEvent.click(screen.getByRole('button', { name: /request access/iu }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already come from here today/iu)
    expect(screen.getByLabelText(/your name/iu)).toHaveValue('Dana Reyes')
  })
})
