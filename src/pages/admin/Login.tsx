import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chrome, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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
  const adminEntry = location.pathname.startsWith('/admin') || attemptedPath?.startsWith('/admin') === true

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
      const destination = attemptedPath && (isPlatformAdmin || !attemptedPath.startsWith('/admin'))
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
      const message = error instanceof Error ? error.message : ''
      toast.error(message.includes('Invalid login credentials')
        ? 'Invalid email or password.'
        : 'Unable to sign in. Please try again.')
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user && ['suspended', 'expired', 'no_membership', 'error'].includes(accountState)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access unavailable</CardTitle>
            <CardDescription>
              {accountState === 'suspended'
                ? 'Your workspace access is suspended.'
                : accountState === 'expired'
                  ? 'Your invitation has expired. Ask a platform administrator for a new invitation.'
                : accountError || 'This account has not been invited to an active workspace.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
            {accountState === 'error' && (
              <Button className="w-full" onClick={() => void refreshAccount()}>
                Try again
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => void signOut()}>
              Sign in with another account
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
          <CardDescription className="text-center">
            Use the email from your invitation or the account created for you by an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(passwordChanged || signInAgain) && (
            <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
              {passwordChanged
                ? 'Password changed. Sign in with your new password.'
                : 'Your credentials changed. Sign in again with the newest password.'}
            </p>
          )}
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
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
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
            {resetRequested ? (
              <p className="text-center text-sm text-muted-foreground" role="status">
                If that email has an account, a password reset link is on the way.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={isSubmitting}
                className="mx-auto block text-sm text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </form>

          {adminEntry && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><Separator className="w-full" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Admin sign-in</span>
                </div>
              </div>

              <Button onClick={handleGoogleSignIn} variant="outline" className="w-full" size="lg">
                <Chrome className="mr-2 h-5 w-5" />
                Continue with Google
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Login
