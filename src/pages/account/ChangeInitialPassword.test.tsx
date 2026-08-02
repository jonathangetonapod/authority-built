import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChangeInitialPassword from '@/pages/account/ChangeInitialPassword'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { changeInitialPassword } from '@/services/workspaceUsers'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/workspaceUsers', () => ({ changeInitialPassword: vi.fn() }))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } },
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedChange = vi.mocked(changeInitialPassword)
const mockedLocalSignOut = vi.mocked(supabase.auth.signOut)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  // The page sets its own document title now, which needs the provider the app
  // wraps everything in.
  render(
    <HelmetProvider>
      <MemoryRouter
        initialEntries={['/change-password']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/change-password" element={<ChangeInitialPassword />} />
          <Route path="/login" element={<Location />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function authState(state: string, options?: { membership?: boolean; error?: string | null }) {
  mockedUseAuth.mockReturnValue({
    accountError: options?.error ?? null,
    accountState: state,
    membership: options?.membership === false ? null : {
      id: '11111111-1111-4111-8111-111111111111',
    },
    signOut: vi.fn().mockResolvedValue(undefined),
    user: { email: 'owner@example.com' },
  } as never)
}

describe('ChangeInitialPassword', () => {
  beforeEach(() => {
    mockedChange.mockReset()
    mockedLocalSignOut.mockClear()
  })

  it('changes the password, clears the local session, and requires a fresh sign-in', async () => {
    authState('password_change_required')
    mockedChange.mockResolvedValue(undefined)
    renderPage()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Private Password 42!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Private Password 42!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(mockedChange).toHaveBeenCalledWith(expect.objectContaining({
      membership_id: '11111111-1111-4111-8111-111111111111',
      new_password: 'Private Password 42!',
    })))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(mockedLocalSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('clears a stale credential session when the backend requires reauthentication', async () => {
    authState('password_change_required')
    const stale = new Error('Sign in again with the newest temporary password')
    stale.name = 'REAUTHENTICATION_REQUIRED'
    mockedChange.mockRejectedValue(stale)
    renderPage()

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Private Password 42!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'Private Password 42!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(mockedLocalSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('renders an actionable expired state instead of a blank page', async () => {
    authState('expired')
    renderPage()

    expect(screen.getByText(/temporary password has expired/i)).toBeInTheDocument()
    // The old assertion was toBeEnabled(), which could never fail: the button's
    // disabled prop is `submitting`, and that is false at first render. Assert
    // the outcome a person would notice — leaving the dead end for sign-in —
    // rather than which of the two sign-out paths ran.
    fireEvent.click(screen.getByRole('button', { name: /sign out and use the newest credential/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })
})
