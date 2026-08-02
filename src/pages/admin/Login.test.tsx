import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import Login from './Login'

const auth = {
  accountState: 'signed_out',
  accountError: null as string | null,
  isPlatformAdmin: false,
  refreshAccount: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  user: null as { email: string } | null,
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({}) } },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderLogin(path = '/login') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}><Login /></MemoryRouter>
    </HelmetProvider>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    auth.accountState = 'signed_out'
    auth.accountError = null
    auth.isPlatformAdmin = false
    auth.user = null
    auth.signInWithPassword.mockReset().mockResolvedValue(undefined)
    auth.signInWithGoogle.mockReset().mockResolvedValue(undefined)
    auth.signOut.mockReset()
    auth.refreshAccount.mockReset()
  })

  it('signs in with the email and password given', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' dana@example.com ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith('dana@example.com', 'hunter2'))
  })

  it('offers the way in for someone who has no account', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: 'Request access' })).toHaveAttribute('href', '/register')
  })

  // The toggle used to claim "Show password" while the password was showing.
  it('says what the reveal toggle will do, not what it already did', () => {
    renderLogin()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  // Google is the platform-admin door; a tenant signing in must not be shown it.
  it('shows admin sign-in only on the admin route', () => {
    const { unmount } = renderLogin('/login')
    expect(screen.queryByRole('button', { name: /continue with google/iu })).toBeNull()
    unmount()

    renderLogin('/admin/login')
    expect(screen.getByRole('button', { name: /continue with google/iu })).toBeInTheDocument()
  })

  it('answers a password reset the same way whether or not the account exists', async () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dana@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))

    expect(await screen.findByText(/if that email has an account/iu)).toBeInTheDocument()
  })

  it('explains a suspended account rather than looping the sign-in form', () => {
    auth.user = { email: 'dana@example.com' }
    auth.accountState = 'suspended'
    renderLogin()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/access unavailable/iu)
    expect(screen.getByText(/suspended/iu)).toBeInTheDocument()
    expect(screen.getByText(/dana@example.com/u)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sign in with another account/iu }))
    expect(auth.signOut).toHaveBeenCalled()
  })
})
