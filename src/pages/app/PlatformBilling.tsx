import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlatformCreditTopUp } from '@/components/workspace/PlatformCreditTopUp'
import { PlatformPlanPricing } from '@/components/workspace/PlatformPlanPricing'

/**
 * Platform billing administration: crediting an agency, and setting what a plan
 * costs everyone.
 *
 * These used to sit on top of /app/settings/billing, which is a workspace's own
 * plan and balance. One page cannot be both — an agency owner reading their
 * balance and a platform admin pricing the product are different jobs, and
 * stacking them meant the platform owner scrolled past their own billing to
 * reach the tools they came for.
 */
const PlatformBilling = () => {
  const { isPlatformAdmin, user } = useAuth()

  if (!isPlatformAdmin) return <Navigate to="/app/clients" replace />

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-12">
        <header className="space-y-5 border-b border-border/70 pb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
            <Link to="/app/settings/billing"><ArrowLeft className="mr-2 h-4 w-4" />Back to your billing</Link>
          </Button>
          <div>
            <Badge variant="secondary">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Platform administration
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing administration</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Credit an agency&rsquo;s balance, and set what each plan costs across every workspace.
            </p>
          </div>
        </header>

        <PlatformPlanPricing />
        <PlatformCreditTopUp actorEmail={user?.email || 'Platform administrator'} />
      </div>
    </WorkspaceLayout>
  )
}

export default PlatformBilling
