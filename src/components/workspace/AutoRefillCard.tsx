import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { setWorkspaceAutoRefill, type WorkspaceBillingOverview } from '@/services/workspaceStaff'

interface AutoRefillCardProps {
  workspaceId: string
  overview: WorkspaceBillingOverview | undefined
  onSaved?: () => void
}

// The packs the checkout sells. An automatic top-up buys one of these, at the
// same price — a figure that only existed here would be a price nobody agreed.
const PACKS = [
  { credits: 100, label: '100 credits · $29' },
  { credits: 300, label: '300 credits · $69' },
  { credits: 800, label: '800 credits · $149' },
]

const THRESHOLDS = [10, 25, 50, 100, 200]

/**
 * Let a workspace agree to being topped up without being present.
 *
 * Offered only where there is a card to charge. Stripe refuses an off-session
 * payment against a card that was never saved with consent, so a workspace that
 * has only ever paid as a guest is told what to do rather than shown a switch
 * that would fail.
 */
export function AutoRefillCard({ workspaceId, overview, onSaved }: AutoRefillCardProps) {
  const queryClient = useQueryClient()
  const configured = typeof overview?.refill_threshold_credits === 'number'
  const [enabled, setEnabled] = useState(configured)
  const [threshold, setThreshold] = useState(String(overview?.refill_threshold_credits ?? 50))
  const [pack, setPack] = useState(String(overview?.refill_pack_credits ?? 300))

  useEffect(() => {
    setEnabled(typeof overview?.refill_threshold_credits === 'number')
    if (typeof overview?.refill_threshold_credits === 'number') {
      setThreshold(String(overview.refill_threshold_credits))
    }
    if (typeof overview?.refill_pack_credits === 'number') {
      setPack(String(overview.refill_pack_credits))
    }
  }, [overview?.refill_threshold_credits, overview?.refill_pack_credits])

  const saveMutation = useMutation({
    mutationFn: () => setWorkspaceAutoRefill(
      workspaceId,
      enabled ? { thresholdCredits: Number(threshold), packCredits: Number(pack) } : null,
    ),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] })
      /*
       * The page that renders this card holds its own query under a different
       * key, and the overview prop comes from there — without telling it to
       * re-read, the card kept computing dirty against pre-save state, the
       * Save button stayed armed, and a second click re-sent the same save.
       */
      onSaved?.()
      toast.success(saved.threshold === null
        ? 'Automatic top-ups switched off.'
        : `We will buy ${saved.pack} credits when you reach ${saved.threshold} or fewer.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Automatic top-ups could not be saved.'),
  })

  const hasCard = overview?.has_saved_card === true
  const dirty = enabled !== configured
    || (enabled && (
      Number(threshold) !== overview?.refill_threshold_credits
      || Number(pack) !== overview?.refill_pack_credits
    ))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4" />Automatic top-ups</CardTitle>
        <CardDescription>
          Keep working when credits run out, instead of stopping mid-task. We buy a pack on your saved card and the
          credits arrive within a minute.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasCard ? (
          // Told, rather than shown a switch Stripe would refuse.
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">
            Buy a credit pack once to save a card. Automatic top-ups can be switched on after that.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="auto-refill-enabled" className="text-sm font-medium">
                Buy credits automatically when I run low
              </Label>
              <Switch
                id="auto-refill-enabled"
                checked={enabled}
                disabled={saveMutation.isPending}
                onCheckedChange={setEnabled}
              />
            </div>

            {enabled && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="auto-refill-threshold">When my balance reaches (or drops below)</Label>
                  <Select value={threshold} onValueChange={setThreshold} disabled={saveMutation.isPending}>
                    <SelectTrigger id="auto-refill-threshold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {THRESHOLDS.map((value) => (
                        <SelectItem key={value} value={String(value)}>{value} credits</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auto-refill-pack">Buy</Label>
                  <Select value={pack} onValueChange={setPack} disabled={saveMutation.isPending}>
                    <SelectTrigger id="auto-refill-pack"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PACKS.map((option) => (
                        <SelectItem key={option.credits} value={String(option.credits)}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Said before they agree, not after they are charged. */}
            <p className="text-xs leading-5 text-muted-foreground">
              {enabled
                ? `Your saved card will be charged for ${PACKS.find((option) => String(option.credits) === pack)?.label ?? 'a pack'} without asking first, at most once a day, and only when the balance is at or below ${threshold}. Switch this off any time.`
                : 'Nothing is charged automatically while this is off. Credits stop when the balance reaches zero.'}
            </p>

            <Button
              type="button"
              size="sm"
              className="w-fit"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {enabled ? 'Save automatic top-ups' : 'Turn off automatic top-ups'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
