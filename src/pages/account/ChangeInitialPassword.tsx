import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (accountState !== 'password_change_required' || !membership) {
    const message = accountState === 'expired'
      ? 'This temporary password has expired. Ask a platform administrator for a replacement.'
      : accountState === 'suspended'
        ? 'This workspace account is suspended. Contact a platform administrator.'
        : accountError || 'This account cannot complete temporary password setup.'
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Password setup unavailable</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" className="w-full" disabled={submitting} onClick={() => void leaveAccount()}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Sign out and use the newest credential
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <CardTitle>Replace your temporary password</CardTitle>
          <CardDescription>
            Create a private password before entering your workspace. You will sign in again after this change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                  aria-describedby="password-requirements"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p id="password-requirements" className="text-xs text-muted-foreground">
                12+ characters with uppercase, lowercase, a number, and a symbol; 72 UTF-8 bytes maximum.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={submitting}
              />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Securing account…' : 'Change password'}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={submitting} onClick={() => void leaveAccount()}>
              <LogOut className="mr-2 h-4 w-4" />Sign out and use another credential
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default ChangeInitialPassword
