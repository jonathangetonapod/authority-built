import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KeyRound, Loader2, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageSEO from '@/components/seo/PageSEO'
import { requestPortalPasswordReset } from '@/services/clientPortal'

export default function PortalForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()
  const brandingSlug = searchParams.get('b') || ''
  const loginHref = brandingSlug ? `/portal/login?b=${encodeURIComponent(brandingSlug)}` : '/portal/login'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await requestPortalPasswordReset(email.trim().toLowerCase())
      setRequested(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The reset request could not be sent.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <PageSEO title="Reset Portal Password" description="Request a client portal password reset link." path="/portal/forgot" noindex />
      <Card className="w-full max-w-md">
        {requested ? (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <MailCheck className="h-8 w-8 text-emerald-700" />
              </div>
              <h1 className="text-2xl font-semibold leading-none tracking-tight">Check your email</h1>
              <CardDescription>
                If {email.trim()} has a portal account, a reset link is on the way. It expires in 60 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="w-full h-11">
                <Link to={loginHref}>Back to sign in</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
                <KeyRound className="h-8 w-8 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-semibold leading-none tracking-tight">Reset your password</h1>
              <CardDescription>
                Enter your portal email and we'll send you a reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={submitting}
                    className="w-full h-11"
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full h-11" disabled={submitting || !email}>
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</>
                  ) : (
                    'Send reset link'
                  )}
                </Button>
                <Button asChild variant="ghost" className="w-full h-11">
                  <Link to={loginHref}>Back to sign in</Link>
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
