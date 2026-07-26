import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

      const refreshed = await refreshAccount()
      if (!refreshed) throw new Error('Your invitation was accepted. Sign in again to refresh access.')
      toast.success('Invitation accepted.')
      navigate('/app/clients', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to accept this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  if (accountState === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  if (!user || accountState === 'signed_out') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Open your invitation</CardTitle>
            <CardDescription>The invitation link is invalid or has expired. Sign in with the invited email or ask for a new invitation.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild className="w-full"><Link to="/login">Go to sign in</Link></Button></CardContent>
        </Card>
      </div>
    )
  }

  if (accountState !== 'pending' || !membership) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation unavailable</CardTitle>
            <CardDescription>
              {accountState === 'expired'
                ? `The invitation for ${user.email} has expired.`
                : `No active invitation matches ${user.email}.`} Ask a workspace administrator to send a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline" className="w-full"><Link to="/login">Back to sign in</Link></Button></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Accept your invitation</CardTitle>
          <CardDescription>
            Join {workspace?.name || 'your workspace'} as {membership.role} using {user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={acceptInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full name</Label>
              <Input id="invite-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Create password</Label>
              <Input id="invite-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-describedby="invite-password-requirements" />
              <p id="invite-password-requirements" className="text-xs text-muted-foreground">12+ characters with uppercase, lowercase, a number, and a symbol; 72 UTF-8 bytes maximum.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password-confirm">Confirm password</Label>
              <Input id="invite-password-confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Accepting...' : 'Accept invitation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default AcceptInvite
