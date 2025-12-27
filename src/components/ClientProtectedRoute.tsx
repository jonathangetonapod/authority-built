import { Navigate, useLocation } from 'react-router-dom'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { Loader2, ShieldX } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ClientProtectedRouteProps {
  children: React.ReactNode
}

export const ClientProtectedRoute = ({ children }: ClientProtectedRouteProps) => {
  const { client, loading } = useClientPortal()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (!client) {
    // Redirect to portal login, preserving the attempted URL
    return <Navigate to="/portal/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

/**
 * Error component for portal access issues
 */
export const PortalAccessDenied = ({ message, onRetry }: { message?: string, onRetry?: () => void }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Access Denied</CardTitle>
          <CardDescription>
            {message || 'You do not have access to the client portal. Please contact support for assistance.'}
          </CardDescription>
        </CardHeader>
        {onRetry && (
          <CardContent className="text-center">
            <Button onClick={onRetry} variant="outline" className="w-full">
              Try Again
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
