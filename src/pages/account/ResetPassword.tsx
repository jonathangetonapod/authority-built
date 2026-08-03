import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/queryClient'
import { AuthShell } from '@/components/landing/AuthShell'

const TEMPORARY_PASSWORD_PREFIX = 'Tmp-'

function passwordPolicyError(password: string, confirmation: string): string | null {
  if (password.length < 12) return 'Use at least 12 characters.'
  if (new TextEncoder().encode(password).length > 72) return 'Use no more than 72 UTF-8 bytes.'
  if (password.startsWith(TEMPORARY_PASSWORD_PREFIX)) return 'Choose a password that does not start with Tmp-.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
    return 'Include uppercase, lowercase, a digit, and a symbol.'
  }
  if (password !== confirmation) return 'Passwords do not match.'
  return null
}

const ResetPassword = () => {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const policyError = passwordPolicyError(password, confirmation)
    if (policyError) {
      setError(policyError)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setPassword('')
      setConfirmation('')
      await supabase.auth.signOut({ scope: 'local' })
      queryClient.clear()
      navigate('/login', { replace: true, state: { passwordChanged: true } })
    } catch (updateError) {
      console.error('[ResetPassword] Update failed:', updateError)
      setError('The password could not be updated. Request a new reset link and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="gp-page gp-auth-loading" role="status">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <span className="sr-only">Opening your reset link</span>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthShell
        title="Reset link expired | Get On A Pod"
        description="This password reset link can no longer be used."
        path="/reset-password"
        tone="notice"
        heading="Reset link expired."
        footer={<>No account yet? <Link to="/register">Request to join</Link></>}
      >
        <p className="gp-auth-reason">
          This password reset link is invalid or has expired. Request a new one from the sign-in page.
        </p>
        <div className="gp-auth-actions">
          <Link className="gp-btn gp-btn-primary" to="/login">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Choose a new password | Get On A Pod"
      description="Set a new password for your Get On A Pod account."
      path="/reset-password"
      heading="Choose a new password."
      standfirst={`Resetting the password for ${user.email}.`}
      footer={<>Remembered it? <Link to="/login">Back to sign in</Link></>}
    >
      <form className="gp-form" onSubmit={handleSubmit}>
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
            At least 12 characters with uppercase, lowercase, a digit, and a symbol.
          </span>
        </div>

        <div className="gp-field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmation}
            disabled={submitting}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>

        {error && <p className="gp-form-error" role="alert">{error}</p>}

        <button type="submit" className="gp-btn gp-btn-primary gp-btn-block" disabled={submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}

export default ResetPassword
