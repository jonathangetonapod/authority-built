import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, XCircle, CheckCircle2 } from 'lucide-react'

export default function PortalAuth() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { loginWithToken } = useClientPortal()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('error')
      setError('No login token provided. Please request a new login link.')
      return
    }

    // Auto-verify token on mount
    const verifyToken = async () => {
      try {
        await loginWithToken(token)
        setStatus('success')
        // Redirect to dashboard immediately - no delay needed
        navigate('/portal/dashboard', { replace: true })
      } catch (err) {
        console.error('Token verification failed:', err)
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to verify login link')
      }
    }

    verifyToken()
  }, [searchParams, loginWithToken, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        {status === 'loading' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <CardTitle className="text-xl">Verifying your login...</CardTitle>
              <CardDescription>
                Please wait while we log you in securely.
              </CardDescription>
            </CardHeader>
          </>
        )}

        {status === 'success' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-xl">Login successful!</CardTitle>
              <CardDescription>
                Redirecting to your portal...
              </CardDescription>
            </CardHeader>
          </>
        )}

        {status === 'error' && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">Login Failed</CardTitle>
              <CardDescription>
                {error}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 text-xs bg-muted rounded-md space-y-1">
                <p className="font-medium">Common reasons:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>The login link has expired (15 minutes)</li>
                  <li>The link has already been used</li>
                  <li>The link is invalid or corrupted</li>
                </ul>
              </div>
              <Button
                onClick={() => navigate('/portal/login')}
                className="w-full"
              >
                Request New Login Link
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Need help?{' '}
                <a href="mailto:support@getonapod.com" className="text-primary hover:underline">
                  Contact support
                </a>
              </p>
            </CardContent>
          </>
        )}
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
