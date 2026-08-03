import { useEffect, useRef, useState } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '@/components/landing/AuthShell'
import { useAuth } from '@/contexts/AuthContext'
import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import { changeInitialPassword } from '@/services/workspaceUsers'

const ChangeInitialPassword = () => {
  const { accountError, accountState, membership, signOut, user } = useAuth()
  const navigate = useNavigate()
  const attemptId = useRef(crypto.randomUUID())
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const leaveAccount = async () => {
    setSubmitting(true)
    try {
      await signOut()
    } catch {
      await supabase.auth.signOut({ scope: 'local' })
      queryClient.clear()
    } finally {
      navigate('/login', { replace: true, state: { signInAgain: true } })
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (accountState === 'loading') return
    if (!user || accountState === 'signed_out') {
      navigate('/login', { replace: true })
      return
    }
    if (accountState === 'reauthentication_required') {
      void supabase.auth.signOut({ scope: 'local' }).finally(() => {
        queryClient.clear()
        navigate('/login', { replace: true, state: { signInAgain: true } })
      })
      return
    }
    if (accountState === 'active') {
      navigate('/app/clients', { replace: true })
    }
  }, [accountState, navigate, user])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!membership) {
      setError('The temporary-password account could not be found.')
      return
    }
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
      setError('Use at least 12 characters and no more than 72 UTF-8 bytes.')
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Use uppercase, lowercase, number, and symbol characters.')
      return
    }
    if (password.startsWith('Tmp-')) {
      setError('Choose a new password instead of reusing a temporary password.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await changeInitialPassword({
        membership_id: membership.id,
        attempt_id: attemptId.current,
        new_password: password,
      })
      setPassword('')
      setConfirmation('')
      await supabase.auth.signOut({ scope: 'local' })
      queryClient.clear()
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'REAUTHENTICATION_REQUIRED') {
        setPassword('')
        setConfirmation('')
        await supabase.auth.signOut({ scope: 'local' })
        queryClient.clear()
        navigate('/login', { replace: true, state: { signInAgain: true } })
        return
      }
      setError(caught instanceof Error ? caught.message : 'The password could not be changed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (accountState === 'loading' || accountState === 'reauthentication_required') {
    return (
      <div className="gp-page gp-auth-loading" role="status">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking your account</span>
      </div>
    )
  }

  if (accountState !== 'password_change_required' || !membership) {
    const message = accountState === 'expired'
      ? 'This temporary password has expired. Ask a platform administrator for a replacement.'
      : accountState === 'suspended'
        ? 'This workspace account is suspended. Contact a platform administrator.'
        : accountError || 'This account cannot complete temporary password setup.'
    return (
      <AuthShell
        title="Password setup unavailable | Get On A Pod"
        description="This account cannot finish setting a password."
        path="/change-password"
        tone="notice"
        heading="Password setup unavailable."
        footer={accountState === 'pending'
          ? <>Your invitation is still open. <Link to="/accept-invite">Accept it</Link></>
          : <>Need a new invitation? <Link to="/register">Request to join</Link></>}
      >
        <p className="gp-auth-reason">{message}</p>
        <div className="gp-auth-actions">
          <button type="button" className="gp-btn gp-btn-ghost" disabled={submitting} onClick={() => void leaveAccount()}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign in with another account
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Replace your temporary password | Get On A Pod"
      description="Choose a private password before entering your workspace."
      path="/change-password"
      heading="Replace your temporary password."
      standfirst="Choose a private password before entering your workspace. You will sign in again after this change."
      footer={<>Wrong account? <Link to="/login">Sign in as someone else</Link></>}
    >
      <form className="gp-form" onSubmit={submit}>
        {/* The account this password belongs to, so a password manager
            has something to file it against. Without it the credential is
            skipped or misfiled, and the person is locked out of the account
            they just set a password for. */}
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />

        <div className="gp-field">
          <label htmlFor="new-password">New password</label>
          <div className="gp-field-with-toggle">
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby="password-requirements"
              value={password}
              disabled={submitting}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="gp-reveal"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <span id="password-requirements" className="gp-field-hint">
            12+ characters with uppercase, lowercase, a number, and a symbol; 72 UTF-8 bytes maximum.
          </span>
        </div>

        <div className="gp-field">
          <label htmlFor="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmation}
            disabled={submitting}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        {error && <p className="gp-form-error" role="alert">{error}</p>}

        <button type="submit" className="gp-btn gp-btn-primary gp-btn-block" disabled={submitting}>
          {submitting ? 'Securing account…' : 'Change password'}
        </button>
        <button type="button" className="gp-btn gp-btn-ghost gp-btn-block" disabled={submitting} onClick={() => void leaveAccount()}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign in with another account
        </button>
      </form>
    </AuthShell>
  )
}

export default ChangeInitialPassword
