import { useState } from 'react'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const { requestMagicLink, client } = useClientPortal()
  const navigate = useNavigate()

  // If already logged in, redirect to dashboard
  if (client) {
    navigate('/portal/dashboard', { replace: true })
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await requestMagicLink(email)
      setSuccess(true)
    } catch (err) {
      console.error('Failed to request magic link:', err)
      setError(err instanceof Error ? err.message : 'Failed to send login link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
            <Mail className="h-8 w-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Client Portal Login</CardTitle>
          <CardDescription>
            Enter your email to receive a secure login link
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Check your email!</h3>
                <p className="text-sm text-muted-foreground">
                  We've sent a login link to <strong>{email}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
                  The link will expire in 15 minutes for your security.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSuccess(false)
                  setEmail('')
                }}
                className="w-full"
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full"
                  autoFocus
                />
              </div>

              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending login link...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Login Link
                  </>
                )}
              </Button>

              <div className="text-center text-xs text-muted-foreground space-y-1">
                <p>No password required. We'll email you a secure login link.</p>
                <p className="mt-2">
                  Having trouble? Contact{' '}
                  <a href="mailto:support@getonapod.com" className="text-primary hover:underline">
                    support@getonapod.com
                  </a>
                </p>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Branding Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold">Get On A Pod</span>
        </p>
      </div>
    </div>
  )
}
