import { useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, CreditCard, Sparkles } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface WaterfallCreditPack {
  credits: number
  price: number
  label?: string
}

const waterfallCreditPacks: WaterfallCreditPack[] = [
  { credits: 100, price: 39 },
  { credits: 500, price: 149, label: 'Recommended' },
  { credits: 2_000, price: 399, label: 'High volume' },
]

const WorkspaceBilling = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin } = useAuth()
  const [selectedCredits, setSelectedCredits] = useState(500)

  if (!canManageWorkspaceStaff && !isPlatformAdmin) return <Navigate to="/app/clients" replace />

  const selectedPack = waterfallCreditPacks.find((pack) => pack.credits === selectedCredits)
    || waterfallCreditPacks[1]

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-6xl space-y-8 pb-12">
        <header className="space-y-5 border-b border-border/70 pb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit"><Link to="/app/settings"><ArrowLeft className="mr-2 h-4 w-4" />Back to settings</Link></Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary"><CreditCard className="mr-1.5 h-3.5 w-3.5" />Settings</Badge><Badge className="border-violet-200 bg-violet-100 text-violet-800 hover:bg-violet-100">Available on Solo</Badge></div>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Billing & credits</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">Manage Waterfall email credits without changing your workspace plan.</p>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1.5">One-time top-ups</Badge>
          </div>
        </header>

        <ol aria-label="Credit purchase steps" className="grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-3">
          <li className="flex items-center gap-3 border-b bg-violet-50/60 px-4 py-3.5 sm:border-b-0 sm:border-r">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-700 text-xs font-semibold text-white">1</span>
            <span><span className="block text-sm font-semibold">Select credits</span><span className="block text-xs text-muted-foreground">Choose the right pack</span></span>
          </li>
          <li className="flex items-center gap-3 border-b px-4 py-3.5 sm:border-b-0 sm:border-r">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">2</span>
            <span><span className="block text-sm font-semibold">Review checkout</span><span className="block text-xs text-muted-foreground">Confirm payment details</span></span>
          </li>
          <li className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">3</span>
            <span><span className="block text-sm font-semibold">Credits added</span><span className="block text-xs text-muted-foreground">Return to your pitch</span></span>
          </li>
        </ol>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-5" aria-labelledby="waterfall-credit-packs-title">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Email enrichment</p><h2 id="waterfall-credit-packs-title" className="mt-1 text-2xl font-semibold">Waterfall credit packs</h2><p className="mt-1 text-sm text-muted-foreground">Choose a pack for verified direct-email searches. Top-ups are available on every paid plan.</p></div>

            <div className="grid gap-4 sm:grid-cols-3">
              {waterfallCreditPacks.map((pack) => {
                const selected = selectedCredits === pack.credits
                return (
                  <button
                    key={pack.credits}
                    type="button"
                    aria-label={`Select ${pack.credits.toLocaleString()} credits for $${pack.price}`}
                    aria-pressed={selected}
                    className={`relative flex min-h-56 flex-col rounded-2xl border p-5 text-left transition-all ${selected ? 'border-violet-500 bg-violet-50/60 shadow-sm ring-1 ring-violet-200' : 'bg-card hover:border-violet-300 hover:bg-violet-50/20'}`}
                    onClick={() => setSelectedCredits(pack.credits)}
                  >
                    <div className="flex min-h-6 items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {pack.label && <Badge variant="secondary" className="bg-violet-100 text-[10px] text-violet-800 hover:bg-violet-100">{pack.label}</Badge>}
                      </div>
                      {selected && <CheckCircle2 className="h-4 w-4 text-violet-700" />}
                    </div>
                    <Coins className="mt-5 h-5 w-5 text-violet-700" />
                    <p className="mt-3 text-3xl font-semibold">{pack.credits.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Waterfall credits</p>
                    <div className="mt-auto pt-5"><p className="text-xl font-semibold">${pack.price}</p><p className="text-xs text-muted-foreground">One-time credit pack</p></div>
                  </button>
                )
              })}
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader><CardTitle className="text-lg">How Waterfall credits work</CardTitle><CardDescription>Simple successful-result billing across every plan.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><p className="text-sm font-semibold">Global cache first</p><p className="mt-1 text-xs leading-5 text-muted-foreground">If any workspace already unlocked the podcast, you reuse the verified contact for 0 credits.</p></div>
                <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">1 credit on first global success</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Only the platform's first successful verified direct-email lookup is eligible for a credit charge.</p></div>
                <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">Failed searches are free</p><p className="mt-1 text-xs leading-5 text-muted-foreground">No verified email means no Waterfall credit is charged.</p></div>
                <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-semibold">Top-ups stay available</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Purchased credits remain while your paid subscription is active.</p></div>
              </CardContent>
            </Card>
          </section>

          <aside className="lg:sticky lg:top-28">
            <Card className="overflow-hidden border-violet-200 shadow-sm">
              <CardHeader className="bg-violet-50/70"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Sparkles className="h-5 w-5" /></div><CardTitle className="pt-2">Order summary</CardTitle><CardDescription>One-time credit purchase</CardDescription></CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="border-b pb-4">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-2xl font-semibold">{selectedPack.credits.toLocaleString()}</p><p className="text-xs text-muted-foreground">Waterfall credits</p></div><p className="text-xl font-semibold">${selectedPack.price}</p></div>
                </div>
                <div className="flex items-center justify-between"><p className="text-sm font-semibold">Pack total</p><p className="text-2xl font-semibold">${selectedPack.price}</p></div>
                <div className="space-y-2 text-xs text-muted-foreground"><p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />One-time purchase; your plan will not change</p><p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />Monthly included credits are used first</p><p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />No charge for unsuccessful searches</p></div>
                <Button type="button" className="w-full" onClick={() => toast.info('Secure checkout will be connected when billing is ready.')}><CreditCard className="mr-2 h-4 w-4" />Continue to secure checkout · ${selectedPack.price}<ArrowRight className="ml-2 h-4 w-4" /></Button>
                <p className="text-center text-[11px] leading-4 text-muted-foreground">You will review payment details and any applicable tax before anything is charged. Checkout is not connected yet.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceBilling
