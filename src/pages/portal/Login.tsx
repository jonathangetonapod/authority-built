import { useEffect, useState } from 'react'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import PageSEO from '@/components/seo/PageSEO'
import { supabase } from '@/lib/supabase'
import { safeExternalUrl } from '@/lib/externalUrl'
import { currentHostname } from '@/lib/workspaceHost'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i

interface LoginBranding {
  name: string
  logo_url: string | null
}

export default function PortalLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [linkBranding, setLinkBranding] = useState<LoginBranding | null>(null)

  const { loginWithPassword, client, branding, loading: portalLoading } = useClientPortal()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const brandingSlug = searchParams.get('b') || ''
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset === true
  const forgotHref = brandingSlug ? `/portal/forgot?b=${encodeURIComponent(brandingSlug)}` : '/portal/forgot'

  useEffect(() => {
    if (!brandingSlug || !SLUG_PATTERN.test(brandingSlug) || brandingSlug.length > 180) return
    let cancelled = false
    supabase.functions
      .invoke('public-client-dashboard', { body: { action: 'metadata', slug: brandingSlug.toLowerCase(), hostname: currentHostname() } })
      .then(({ data, error: metadataError }) => {
        if (cancelled || metadataError) return
        const workspace = data?.metadata?.workspace
        if (workspace && typeof workspace.name === 'string' && workspace.name.trim()) {
          setLinkBranding({
            name: workspace.name.trim(),
            logo_url: typeof workspace.logo_url === 'string' ? workspace.logo_url : null,
          })
        }
      })
      .catch(() => {
        // Branding is cosmetic; the neutral login stays fully functional.
      })
    return () => {
      cancelled = true
    }
  }, [brandingSlug])

  useEffect(() => {
    if (!client || portalLoading) return
    const requestedPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    const destination = requestedPath?.startsWith('/portal/') && requestedPath !== '/portal/login'
      ? requestedPath
      : '/portal/dashboard'
    navigate(destination, { replace: true })
  }, [client, location.state, navigate, portalLoading])

  if (portalLoading || client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading portal" />
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await loginWithPassword(email, password)
      // Context will handle navigation
    } catch (err) {
      console.error('Failed to login:', err)
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  const agencyName = linkBranding?.name || branding?.name || null
  const agencyLogoUrl = linkBranding?.logo_url ? safeExternalUrl(linkBranding.logo_url) : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <PageSEO
        title="Client Portal Login"
        description="Log in to your client portal to review approvals, outreach activity, bookings, and live episodes."
        path="/portal/login"
        noindex
      />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          {agencyLogoUrl ? (
            <img
              src={agencyLogoUrl}
              alt={`${agencyName || 'Agency'} logo`}
              className="mx-auto mb-2 h-16 w-16 rounded-2xl object-contain"
            />
          ) : (
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
              <Lock className="h-8 w-8 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            {agencyName ? `${agencyName} Client Portal` : 'Client Portal'}
          </h1>
          <CardDescription>
            Sign in with your email and password
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordReset && (
            <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" role="status">
              Password updated. Sign in with your new password.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-11 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Login
                </>
              )}
            </Button>
            <Link to={forgotHref} className="mx-auto block text-center text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </form>

          <div className="mt-6 text-center text-xs text-muted-foreground border-t pt-4">
            <p>
              {agencyName
                ? `Need help signing in? Contact your ${agencyName} team.`
                : 'Need help signing in? Contact your agency team.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
