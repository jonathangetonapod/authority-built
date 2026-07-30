import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Coins, Crown, History, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getWorkspaceBillingOverview, grantWorkspaceCredits } from '@/services/workspaceStaff'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type CreditReason =
  | 'customer_support'
  | 'service_recovery'
  | 'trial_bonus'
  | 'contract_adjustment'
  | 'other'

interface WorkspaceCreditGrantPreviewProps {
  workspaceId: string
  workspaceName: string
  // Null when the owner has been invited but has not accepted yet. The ledger
  // can still be credited; there is simply no name to put against it.
  ownerName: string | null
  ownerEmail: string | null
  actorEmail: string
}

interface PreviewAdjustment {
  id: number
  amount: number
  reason: CreditReason
  note: string
  // Null when the grant landed but the resulting balance could not be read.
  balanceAfter: number | null
}

const quickAmounts = [25, 50, 100, 250]

const reasonLabels: Record<CreditReason, string> = {
  customer_support: 'Customer support',
  service_recovery: 'Service recovery',
  trial_bonus: 'Trial or launch bonus',
  contract_adjustment: 'Contract adjustment',
  other: 'Other',
}

function creditAmount(value: string): number | null {
  if (!/^\d+$/u.test(value)) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= 10_000
    ? amount
    : null
}

export function WorkspaceCreditGrantPreview({
  workspaceId,
  workspaceName,
  ownerName,
  ownerEmail,
  actorEmail,
}: WorkspaceCreditGrantPreviewProps) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [adjustments, setAdjustments] = useState<PreviewAdjustment[]>([])

  const overviewQueryKey = ['workspace-credit-grants', workspaceId, 'overview'] as const
  const overviewQuery = useQuery({
    queryKey: overviewQueryKey,
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    retry: false,
    staleTime: 30_000,
  })
  // Null until the balance is actually known. It used to fall back to 0, so a
  // single failed read — there are no retries — rendered a confident "0" and
  // projected "0 → 250". An admin who topped this workspace up an hour ago
  // would read that as the grant never landing, and grant again.
  const knownBalance = typeof overviewQuery.data?.balance === 'number'
    ? overviewQuery.data.balance
    : null

  const parsedAmount = useMemo(() => creditAmount(amount), [amount])
  const trimmedNote = note.trim()
  const grantMutation = useMutation({
    mutationFn: () => grantWorkspaceCredits(workspaceId, {
      amount: parsedAmount ?? 0,
      reason: reason || 'other',
      note: trimmedNote,
    }),
    onSuccess: (result) => {
      setAdjustments((current) => [{
        id: Date.now(),
        amount: result.granted,
        reason: (reason || 'other') as CreditReason,
        note: trimmedNote,
        balanceAfter: result.balance ?? (knownBalance === null ? null : knownBalance + result.granted),
      }, ...current])
      void queryClient.invalidateQueries({ queryKey: overviewQueryKey })
      setAmount('100')
      setReason('')
      setNote('')
      setReviewOpen(false)
      toast.success(`${result.granted.toLocaleString()} credits added to ${workspaceName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The credit grant could not be recorded.')
    },
  })
  // The note is optional. The reason still is not: it is what the ledger entry
  // is filed under, and it costs one click rather than a sentence per grant.
  const formReady = parsedAmount !== null && reason !== '' && !grantMutation.isPending
  const projectedBalance = (knownBalance ?? 0) + (parsedAmount || 0)

  const confirmPreview = () => {
    if (parsedAmount === null || reason === '' || grantMutation.isPending) return
    grantMutation.mutate()
  }

  return (
    <>
      <section
        id="workspace-credits"
        className="min-w-0 scroll-mt-28 space-y-4"
        aria-labelledby="workspace-credits-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Waterfall access</p>
            <h2 id="workspace-credits-title" className="mt-1 text-2xl font-semibold tracking-tight">Workspace credits</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Add complimentary credits for support, onboarding, or account adjustments without changing the workspace plan.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-emerald-300 bg-emerald-50 text-emerald-800">
            Live · grants apply immediately
          </Badge>
        </div>

        <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="grid min-w-0 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)]">
              <div className="relative overflow-hidden bg-slate-950 p-6 text-white sm:p-7">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">
                    <Coins className="mr-1.5 h-3.5 w-3.5" />Internal balance
                  </Badge>
                  <p className="mt-8 text-sm text-white/65">Available now</p>
                  {knownBalance === null ? (
                    <div className="mt-1">
                      <p className="text-2xl font-semibold tracking-tight text-white/70">
                        {overviewQuery.isLoading ? 'Loading…' : 'Unavailable'}
                      </p>
                      {!overviewQuery.isLoading && (
                        <button
                          type="button"
                          className="mt-1 text-sm text-violet-200 underline underline-offset-2"
                          onClick={() => void overviewQuery.refetch()}
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-5xl font-semibold tracking-tight" aria-label={`${knownBalance} credits available`}>
                      {knownBalance.toLocaleString()}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-white/65">Waterfall credits</p>

                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/15 text-amber-200">
                        <Crown className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/50">Current owner</p>
                        {ownerName ? (
                          <>
                            <p className="mt-1 truncate font-semibold">{ownerName}</p>
                            {ownerEmail && <p className="truncate text-sm text-white/60">{ownerEmail}</p>}
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-white/60">Nobody has accepted the invite yet</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Named after the workspace, never after the owner: these two
                      are often the same person, and "granted to X, not to this
                      person" under a card showing X reads as a contradiction. */}
                  <div className="mt-4 flex gap-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.08] p-3 text-xs leading-5 text-violet-100/80">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                    <p>Credits belong to the workspace, not to whoever owns it today. They stay put if ownership changes.</p>
                  </div>
                </div>
              </div>

              <form
                className="min-w-0 space-y-6 p-6 sm:p-7"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (formReady) setReviewOpen(true)
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <Plus className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold">Add credits manually</h3>
                      <p className="text-xs text-muted-foreground">Adds spendable credits to the workspace ledger. No charge or plan change.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="workspace-credit-amount">Credits to add</Label>
                  <div className="relative max-w-sm">
                    <Input
                      id="workspace-credit-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={10_000}
                      step={1}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="pr-20 text-base font-semibold"
                      aria-describedby="workspace-credit-amount-help"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">credits</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map((quickAmount) => (
                      <Button
                        key={quickAmount}
                        type="button"
                        size="sm"
                        variant={amount === String(quickAmount) ? 'secondary' : 'outline'}
                        aria-label={`Set credit amount to ${quickAmount}`}
                        onClick={() => setAmount(String(quickAmount))}
                      >
                        +{quickAmount}
                      </Button>
                    ))}
                  </div>
                  <p id="workspace-credit-amount-help" className={`text-xs ${amount && parsedAmount === null ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {amount && parsedAmount === null ? 'Enter a whole number from 1 to 10,000.' : 'Choose a quick amount or enter a custom grant.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace-credit-reason">Reason</Label>
                  <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
                    <SelectTrigger id="workspace-credit-reason" className="max-w-xl">
                      <SelectValue placeholder="Choose why credits are being added" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(reasonLabels) as Array<[CreditReason, string]>).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace-credit-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="workspace-credit-note"
                    value={note}
                    maxLength={300}
                    placeholder="Example: Added after onboarding call so the team can test direct-email search."
                    onChange={(event) => setNote(event.target.value)}
                    aria-describedby="workspace-credit-note-help"
                    className="min-h-24 max-w-xl resize-y"
                  />
                  <p id="workspace-credit-note-help" className="text-xs text-muted-foreground">
                    Workspace members will not see this note.
                  </p>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Balance after grant</p>
                    {knownBalance === null ? (
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                        The current balance could not be read, so this cannot be projected. The grant will still be added.
                      </p>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
                        <span>{knownBalance.toLocaleString()}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-violet-700">{projectedBalance.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <Button type="submit" disabled={!formReady} className="shrink-0">
                    Review credit grant
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/70 bg-muted/15">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" />Recent manual adjustments</CardTitle>
              <CardDescription>Grants you make here, with who made them, why, and the balance that followed.</CardDescription>
            </div>
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">Internal history</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {adjustments.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><History className="h-5 w-5" /></span>
                <p className="mt-3 text-sm font-semibold">No manual grants this session</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Grants recorded here also appear in the workspace's billing activity and audit log.</p>
              </div>
            ) : (
              <div className="divide-y">
                {adjustments.map((adjustment) => (
                  <div key={adjustment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{reasonLabels[adjustment.reason]}</p><Badge variant="outline" className="text-[10px]">Just now</Badge></div>
                        {adjustment.note && <p className="mt-1 truncate text-xs text-muted-foreground">{adjustment.note}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">Granted by {actorEmail}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-base font-semibold text-emerald-700">+{adjustment.amount.toLocaleString()} credits</p>
                      <p className="text-xs text-muted-foreground">
                        {adjustment.balanceAfter === null
                          ? 'Balance unavailable'
                          : `Balance ${adjustment.balanceAfter.toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <AlertDialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add {parsedAmount?.toLocaleString() || 0} credits to {workspaceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm the target and balance before recording a manual workspace adjustment.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 rounded-2xl border bg-muted/20 p-4 text-sm">
            <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">Workspace</span><span className="text-right font-medium">{workspaceName}</span></div>
            <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">Current owner</span><span className="text-right"><span className="block font-medium">{ownerName}</span><span className="block text-xs text-muted-foreground">{ownerEmail}</span></span></div>
            <div className="flex items-center justify-between gap-4 border-t pt-3"><span className="text-muted-foreground">Reason</span><span className="font-medium">{reason ? reasonLabels[reason] : '—'}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Balance change</span>{knownBalance === null ? (<span className="text-right font-medium">+{parsedAmount?.toLocaleString() || 0}, from a balance that could not be read</span>) : (<span className="flex items-center gap-2 font-semibold"><span>{knownBalance.toLocaleString()}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-violet-700">{projectedBalance.toLocaleString()}</span></span>)}</div>
            <div className="border-t pt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal note</p><p className="mt-1 leading-6">{trimmedNote || '—'}</p></div>
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
            Confirming immediately adds these credits to the workspace balance and records the grant in the ledger and audit log.
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={grantMutation.isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={grantMutation.isPending}
              onClick={(event) => { event.preventDefault(); confirmPreview() }}
            >
              {grantMutation.isPending ? 'Adding…' : 'Add credits'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
