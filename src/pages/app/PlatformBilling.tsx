import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Building2, ShieldCheck } from 'lucide-react'
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
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
              <Link to="/app/settings/billing"><ArrowLeft className="mr-2 h-4 w-4" />Your own billing</Link>
            </Button>
            {/* The other half of platform administration. Users, access and
                custom domains live there; money lives here. */}
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link to="/app/manage-workspaces"><Building2 className="mr-2 h-4 w-4" />Workspaces &amp; users</Link>
            </Button>
          </div>
          <div>
            <Badge variant="secondary">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Platform administration
            </Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing administration</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Everything that decides what a workspace pays and what it can spend: what each plan costs across the
              platform, a one-off credit grant to a single agency, and the allowance that agency is granted every
              month. A workspace&rsquo;s own plan, invoices and card live on its billing page, not here.
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
