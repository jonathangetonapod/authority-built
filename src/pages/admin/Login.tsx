import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Chrome, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { AuthShell } from '@/components/landing/AuthShell'

const Login = () => {
  const {
    accountState,
    accountError,
    isPlatformAdmin,
    refreshAccount,
    signInWithGoogle,
    signInWithPassword,
    signOut,
    user,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetRequested, setResetRequested] = useState(false)
  const locationState = location.state as {
    from?: { pathname?: string }
    passwordChanged?: boolean
    signInAgain?: boolean
  } | null
  const attemptedPath = locationState?.from?.pathname
  const passwordChanged = locationState?.passwordChanged === true
  const signInAgain = locationState?.signInAgain === true

  useEffect(() => {
    if (accountState === 'pending') {
      navigate('/accept-invite', { replace: true })
      return
    }

    if (accountState === 'password_change_required' || accountState === 'reauthentication_required') {
      navigate('/change-password', { replace: true })
      return
    }

    if (accountState === 'active') {
      const fallback = '/app/clients'
      // Both the legacy /admin subtree and the platform-only
      // /app/workspaces/:id/* subtree are admin-gated. Honoring a non-admin's
      // saved destination into either lands them on an access-denied screen
      // instead of their own home, so those are only followed for admins.
      const adminOnlyPath = attemptedPath
        && (attemptedPath.startsWith('/admin') || attemptedPath.startsWith('/app/workspaces/'))
      const destination = attemptedPath && (isPlatformAdmin || !adminOnlyPath)
        ? attemptedPath
        : fallback
      navigate(destination, { replace: true })
    }
  }, [accountState, attemptedPath, isPlatformAdmin, navigate])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
    } catch (error) {
      console.error('Error signing in:', error)
      toast.error('Failed to sign in with Google. Please try again.')
    }
  }

  const handlePasswordSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email || !password) {
      toast.error('Enter your email and password.')
      return
    }

    setIsSubmitting(true)
    try {
      await signInWithPassword(email.trim(), password)
    } catch (error) {
      // Supabase tells these apart: "Invalid login credentials" for a wrong
      // password OR an unknown address, but "Email not confirmed" — and others —
      // only for an address that does exist. Routing those to a different
      // sentence let anyone test whether someone has an account here. Every
      // verdict the server reaches now gets one answer; only a request that
      // never reached a server says something else, because that is about the
      // connection and not about the account.
      const message = error instanceof Error ? error.message : ''
      const neverReachedServer = /failed to fetch|networkerror|load failed/iu.test(message)
      toast.error(neverReachedServer
        ? 'Could not reach the server. Check your connection and try again.'
        : 'Invalid email or password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('Enter your email above, then choose Forgot password.')
      return
    }
    setIsSubmitting(true)
    try {
      const appOrigin = import.meta.env.VITE_APP_URL || window.location.origin
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL('/reset-password', appOrigin).toString(),
      })
    } catch {
      // Identical messaging either way prevents account enumeration.
    } finally {
      setIsSubmitting(false)
      setResetRequested(true)
    }
  }

  if (user && accountState === 'loading') {
    return (
      <div className="gp-page gp-auth-loading" role="status">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking your account</span>
      </div>
    )
  }

  if (user && ['suspended', 'expired', 'no_membership', 'error'].includes(accountState)) {
    return (
      <AuthShell
        title="Access unavailable | Get On A Pod"
        description="This account cannot open a workspace right now."
        path="/login"
        tone="notice"
        heading="Access unavailable."
        footer={<>Need a workspace? <Link to="/register">Request to join</Link></>}
      >
        <p className="gp-auth-reason">
          {accountState === 'suspended'
            ? 'Your workspace access is suspended.'
            : accountState === 'expired'
              ? 'Your invitation has expired. Ask whoever invited you for a new one.'
              : accountError || 'This account has not been invited to an active workspace.'}
        </p>
        <p className="gp-auth-note">Signed in as {user.email}</p>
        <div className="gp-auth-actions">
          {accountState === 'error' && (
            <button type="button" className="gp-btn gp-btn-primary" onClick={() => void refreshAccount()}>
              Try again
            </button>
          )}
          <button type="button" className="gp-btn gp-btn-ghost" onClick={() => void signOut()}>
            Sign in with another account
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Sign in | Get On A Pod"
      description="Sign in to your Get On A Pod workspace."
      path="/login"
      heading="Welcome back."
      standfirst="Use the email from your invitation, or the account an administrator created for you."
      footer={<>No workspace yet? <Link to="/register">Request to join</Link></>}
    >
      <form className="gp-form" onSubmit={handlePasswordSignIn}>
        {(passwordChanged || signInAgain) && (
          <p className="gp-auth-status" role="status">
            {passwordChanged
              ? 'Password changed. Sign in with your new password.'
              : 'Your password was changed. Sign in with the new one.'}
          </p>
        )}

        <div className="gp-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={isSubmitting}
            onChange={(event) => {
              setEmail(event.target.value)
              // Sending a reset hid the control. Correcting the address is
              // exactly what someone does when it went to the wrong one, so
              // changing it offers the control again.
              setResetRequested(false)
            }}
          />
        </div>

        <div className="gp-field">
          {/* The reset control sits beside the label, not inside it: a button
              within a <label> joins the field's accessible name and changes as
              it is pressed. */}
          <div className="gp-field-head">
            <label htmlFor="password">Password</label>
            {!resetRequested && (
              <button
                type="button"
                className="gp-auth-link"
                disabled={isSubmitting}
                onClick={() => void handleForgotPassword()}
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="gp-field-with-toggle">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              disabled={isSubmitting}
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
        </div>

        {resetRequested && (
          // Said the same way whether or not that email has an account.
          <p className="gp-auth-status" role="status">
            If that email has an account, a password reset link is on the way.
            Wrong address? Change it above and ask again.
          </p>
        )}

        <button type="submit" className="gp-btn gp-btn-primary gp-btn-block" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="gp-auth-alt">
        <span className="gp-auth-rule">Admin sign-in</span>
        <button type="button" className="gp-btn gp-btn-quiet gp-btn-block" onClick={handleGoogleSignIn}>
          <Chrome className="h-4 w-4" aria-hidden="true" />
          Continue with Google
        </button>
      </div>
    </AuthShell>
  )
}

export default Login
