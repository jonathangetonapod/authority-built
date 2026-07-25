import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageSEO from '@/components/seo/PageSEO'
import { completePortalPasswordReset } from '@/services/clientPortal'

export default function PortalResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await completePortalPasswordReset(token, password)
      navigate('/portal/login', { replace: true, state: { passwordReset: true } })
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'This reset link is invalid or has expired.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <PageSEO title="Reset Portal Password" description="Choose a new client portal password." path="/portal/reset" noindex />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <h1 className="text-2xl font-semibold leading-none tracking-tight">Reset link missing</h1>
            <CardDescription>
              Open the reset link from your email, or request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full h-11">
              <Link to="/portal/forgot">Request a new link</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <PageSEO title="Reset Portal Password" description="Choose a new client portal password." path="/portal/reset" noindex />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
            <Lock className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Choose a new password</h1>
          <CardDescription>
            At least 8 characters. You'll sign in with it right after.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={submitting}
                  className="w-full h-11 pr-10"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                disabled={submitting}
                className="w-full h-11"
              />
            </div>
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-11" disabled={submitting || !password || !confirmation}>
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</>
              ) : (
                'Update password'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
