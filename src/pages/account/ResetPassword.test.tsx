import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResetPassword from './ResetPassword'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'

const auth = { user: { email: 'dana@example.com' } as { email: string } | null, loading: false }

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser: vi.fn(), signOut: vi.fn() } },
}))
vi.mock('@/lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))

const updateUser = vi.mocked(supabase.auth.updateUser)
const signOut = vi.mocked(supabase.auth.signOut)

/** Reports where the router ended up, so a redirect is observable. */
const Landed = () => {
  const location = useLocation()
  return <div data-testid="landed">{location.pathname}{JSON.stringify(location.state)}</div>
}

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/reset-password']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<Landed />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

const fill = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } })
}

describe('ResetPassword', () => {
  beforeEach(() => {
    auth.user = { email: 'dana@example.com' }
    auth.loading = false
    updateUser.mockReset().mockResolvedValue({ error: null } as never)
    signOut.mockReset().mockResolvedValue({ error: null } as never)
    vi.mocked(queryClient.clear).mockReset()
  })

  /*
   * The point of a reset is that the old credential stops working. If the local
   * sign-out and cache clear were dropped, the session held by whoever was
   * already signed in survives the reset — which is the exact thing the reset
   * exists to undo.
   */
  it('drops the local session and sends the user back to sign in', async () => {
    renderPage()
    fill('Correct-Horse-9!')
    fireEvent.click(screen.getByRole('button', { name: /update password/iu }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'Correct-Horse-9!' }))
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(queryClient.clear).toHaveBeenCalled()
    expect(await screen.findByTestId('landed')).toHaveTextContent('/login')
    expect(screen.getByTestId('landed')).toHaveTextContent('passwordChanged')
  })

  it('refuses a password the policy rejects, without calling the server', async () => {
    renderPage()
    for (const [password, confirmation, expected] of [
      ['short', 'short', /at least 12 characters/iu],
      ['Tmp-Something-9!', 'Tmp-Something-9!', /does not start with Tmp-/iu],
      ['alllowercase123!', 'alllowercase123!', /uppercase, lowercase, a digit, and a symbol/iu],
      ['Correct-Horse-9!', 'Correct-Horse-8!', /do not match/iu],
    ] as Array<[string, string, RegExp]>) {
      fill(password, confirmation)
      fireEvent.click(screen.getByRole('button', { name: /update password/iu }))
      expect(await screen.findByRole('alert')).toHaveTextContent(expected)
    }
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('keeps the session when the update failed, rather than signing out anyway', async () => {
    updateUser.mockResolvedValue({ error: new Error('token expired') } as never)
    renderPage()
    fill('Correct-Horse-9!')
    fireEvent.click(screen.getByRole('button', { name: /update password/iu }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be updated/iu)
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByTestId('landed')).toBeNull()
  })

  it('says the link expired instead of showing a form that cannot work', () => {
    auth.user = null
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/reset link expired/iu)
    expect(screen.getByRole('link', { name: /back to sign in/iu })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('New password')).toBeNull()
  })

  // One toggle governs both fields; revealing only the first is a trap when the
  // two disagree, which is the whole reason to reveal them.
  it('reveals both password fields together', () => {
    renderPage()
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('type', 'text')
  })
})
