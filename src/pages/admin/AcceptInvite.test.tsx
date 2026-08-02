import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AcceptInvite from './AcceptInvite'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const auth = {
  accountState: 'pending',
  membership: { id: 'membership-1', role: 'owner', full_name: '' } as Record<string, unknown> | null,
  refreshAccount: vi.fn(),
  user: { email: 'dana@example.com', user_metadata: {} } as Record<string, unknown> | null,
  workspace: { name: 'Northwind Media' } as Record<string, unknown> | null,
}

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const updateUser = vi.mocked(supabase.auth.updateUser)
const invoke = vi.mocked(supabase.functions.invoke)

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter><AcceptInvite /></MemoryRouter>
    </HelmetProvider>,
  )
}

const fill = (password: string, confirmation = password) => {
  fireEvent.change(screen.getByLabelText('Create password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } })
}

describe('AcceptInvite', () => {
  beforeEach(() => {
    auth.accountState = 'pending'
    auth.membership = { id: 'membership-1', role: 'owner', full_name: '' }
    auth.user = { email: 'dana@example.com', user_metadata: {} }
    auth.workspace = { name: 'Northwind Media' }
    auth.refreshAccount.mockReset().mockResolvedValue(true)
    updateUser.mockReset().mockResolvedValue({ error: null } as never)
    invoke.mockReset().mockResolvedValue({ data: {}, error: null } as never)
    vi.mocked(toast.error).mockReset()
  })

  it('names the workspace and the email the invitation is for', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/accept your invitation/iu)
    expect(screen.getByText(/Northwind Media/u)).toBeInTheDocument()
    expect(screen.getByText(/dana@example\.com/u)).toBeInTheDocument()
  })

  /*
   * The requirements sit beside the field, not inside its label. When they were
   * inside, the field's accessible name became "Create password 12+ characters
   * with uppercase, lowercase..." and a screen reader then read the same text
   * again from aria-describedby.
   */
  it('names the password field by its label alone, and describes it separately', () => {
    renderPage()
    const field = screen.getByLabelText('Create password')
    expect(field).toHaveAttribute('aria-describedby', 'invite-password-requirements')
    expect(document.getElementById('invite-password-requirements')).toHaveTextContent(/12\+ characters/u)
  })

  it('sets the password and accepts the invitation for this membership', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Dana Reyes ' } })
    fill('Correct-Horse-9!')
    fireEvent.click(screen.getByRole('button', { name: /accept invitation/iu }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({
      password: 'Correct-Horse-9!',
      data: { full_name: 'Dana Reyes' },
    }))
    expect(invoke).toHaveBeenCalledWith('accept-workspace-invite', {
      body: { membership_id: 'membership-1' },
    })
  })

  it('refuses a password that does not meet the stated rules', async () => {
    renderPage()
    fill('short')
    fireEvent.click(screen.getByRole('button', { name: /accept invitation/iu }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that does not match', async () => {
    renderPage()
    fill('Correct-Horse-9!', 'Correct-Horse-8!')
    fireEvent.click(screen.getByRole('button', { name: /accept invitation/iu }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Passwords do not match.'))
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('sends someone with no live invitation somewhere they can act', () => {
    auth.accountState = 'expired'
    renderPage()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/invitation unavailable/iu)
    expect(screen.getByRole('link', { name: /back to sign in/iu })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /request access/iu })).toHaveAttribute('href', '/register')
  })
})
