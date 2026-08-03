import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { AuthShell } from '@/components/landing/AuthShell'

/** The role is an enum; this is the sentence it appears in. */
const ROLE_WORDS: Record<string, string> = {
  owner: 'the owner',
  admin: 'an administrator',
  member: 'a member',
}

const AcceptInvite = () => {
  const {
    accountState,
    membership,
    refreshAccount,
    user,
    workspace,
  } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || membership?.full_name || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  /*
   * Acceptance and the account re-read are two calls, and only the first one
   * decides whether this person is a member. When the re-read failed, the
   * membership it had just cleared sent this page to "no active invitation
   * matches" — telling someone who had in fact just been provisioned to go
   * and ask for another invitation. This remembers what actually happened.
   */
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    const suggestedName = user?.user_metadata?.full_name || membership?.full_name || ''
    setFullName((current) => current || suggestedName)
  }, [membership?.full_name, user?.user_metadata?.full_name])

  useEffect(() => {
    if (accountState === 'password_change_required' || accountState === 'reauthentication_required') {
      navigate('/change-password', { replace: true })
      return
    }
    if (accountState === 'active') {
      navigate('/app/clients', { replace: true })
    }
  }, [accountState, navigate])

  const acceptInvite = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!membership) {
      toast.error('No pending invitation was found for this account.')
      return
    }
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
      toast.error('Use at least 12 characters and no more than 72 UTF-8 bytes.')
      return
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      toast.error('Use uppercase, lowercase, number, and symbol characters.')
      return
    }
    if (password.startsWith('Tmp-')) {
      toast.error('Choose a new password instead of using a temporary-password format.')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
        data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
      })
      if (passwordError) throw passwordError

      const { error: acceptanceError } = await supabase.functions.invoke('accept-workspace-invite', {
        body: { membership_id: membership.id },
      })
      if (acceptanceError) {
        throw await toFunctionError(acceptanceError, 'Unable to accept this invitation.')
      }

      setAccepted(true)

      const refreshed = await refreshAccount()
      // The invitation is accepted either way. A failed re-read is a stale
      // session, not a failed acceptance, and the screen below says so.
      if (!refreshed) return
      toast.success('Invitation accepted.')
      navigate('/app/clients', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to accept this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  if (accountState === 'loading') {
    return (
      <div className="gp-page gp-auth-loading" role="status">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <span className="sr-only">Opening your invitation</span>
      </div>
    )
  }

  if (!user || accountState === 'signed_out') {
    return (
      <AuthShell
        title="Open your invitation | Get On A Pod"
        description="Open a Get On A Pod workspace invitation."
        path="/accept-invite"
        tone="notice"
        heading="Open your invitation."
        footer={<>No invitation yet? <Link to="/register">Request to join</Link></>}
      >
        <p className="gp-auth-reason">
          You are not signed in. Open the button in your invitation email, or sign in with the address
          it was sent to. If the link has already been used, signing in is all that is left to do.
        </p>
        <div className="gp-auth-actions">
          <Link className="gp-btn gp-btn-primary" to="/login">Go to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  if (accepted && accountState !== 'active') {
    return (
      <AuthShell
        title="Invitation accepted | Get On A Pod"
        description="Your Get On A Pod workspace is ready."
        path="/accept-invite"
        tone="notice"
        heading="You're in."
        footer={<>Wrong account? <Link to="/login">Sign in as someone else</Link></>}
      >
        <p className="gp-auth-reason">
          Your invitation is accepted and your password is set. Sign in to open your workspace.
        </p>
        <div className="gp-auth-actions">
          <Link className="gp-btn gp-btn-primary" to="/login">Go to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  if (accountState !== 'pending' || !membership) {
    return (
      <AuthShell
        title="Invitation unavailable | Get On A Pod"
        description="This invitation can no longer be accepted."
        path="/accept-invite"
        tone="notice"
        heading="Invitation unavailable."
        footer={<>Need a new one? <Link to="/register">Request to join</Link></>}
      >
        <p className="gp-auth-reason">
          {accountState === 'expired'
            ? `The invitation for ${user.email} has expired.`
            : `No active invitation matches ${user.email}.`} Ask whoever invited you to send a new one.
        </p>
        <div className="gp-auth-actions">
          <Link className="gp-btn gp-btn-ghost" to="/login">Back to sign in</Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Accept your invitation | Get On A Pod"
      description="Set your name and password to finish joining a Get On A Pod workspace."
      path="/accept-invite"
      heading="Accept your invitation."
      standfirst={`Join ${workspace?.name || 'your workspace'} as ${ROLE_WORDS[membership.role] ?? 'a member'}, using ${user.email}.`}
      footer={<>Wrong account? <Link to="/login">Sign in as someone else</Link></>}
    >
      <form className="gp-form" onSubmit={acceptInvite}>
        {/* Password managers need the account this password belongs to, in the
            same form, or they file it against nothing and the person is locked
            out of the account they just created. */}
        <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />

        <div className="gp-field">
          <label htmlFor="invite-name">Full name</label>
          <input
            id="invite-name"
            autoComplete="name"
            value={fullName}
            disabled={submitting}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>

        <div className="gp-field">
          <label htmlFor="invite-password">Create password</label>
          {/* This is the first password the account ever has, and a typo is
              only caught after the round trip. Let people see what they typed. */}
          <div className="gp-field-with-toggle">
            <input
              id="invite-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby="invite-password-requirements"
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
          {/* The rules are stated before the attempt, not returned as an error
              after one. */}
          <span id="invite-password-requirements" className="gp-field-hint">
            12+ characters with uppercase, lowercase, a number, and a symbol; 72 UTF-8 bytes maximum.
          </span>
        </div>

        <div className="gp-field">
          <label htmlFor="invite-password-confirm">Confirm password</label>
          <input
            id="invite-password-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            disabled={submitting}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        <button type="submit" className="gp-btn gp-btn-primary gp-btn-block" disabled={submitting}>
          {submitting ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </AuthShell>
  )
}

export default AcceptInvite
