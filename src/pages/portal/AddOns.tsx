import { useMemo, useState } from 'react'
import { Check, CheckCircle2, Clapperboard, Headphones, Loader2, RefreshCw, Scissors, Sparkles } from 'lucide-react'

import { PortalLayout } from '@/components/portal/PortalLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePortalExperience } from '@/hooks/usePortalExperience'
import type { PortalExperienceBooking } from '@/services/clientPortal'

interface ClippingPackage {
  id: string
  name: string
  clipCount: string
  price: string
  description: string
  highlights: string[]
  featured?: boolean
}

// Front-end only for now: pricing is a placeholder and no payment is taken —
// a request simply signals interest to the workspace team.
const CLIPPING_PACKAGES: ClippingPackage[] = [
  {
    id: 'starter',
    name: 'Starter',
    clipCount: '3 clips',
    price: '$297',
    description: 'A taste of what one great episode can do on social.',
    highlights: ['3 short-form clips from one episode', 'Captions and clean framing', 'Ready for LinkedIn, Reels, and Shorts'],
  },
  {
    id: 'growth',
    name: 'Growth',
    clipCount: '10 clips',
    price: '$797',
    description: 'A full content drop from your strongest appearance.',
    highlights: ['10 clips from one episode', 'Hook-first editing and captions', 'Thumbnail frames for each clip', 'Posting guide included'],
    featured: true,
  },
  {
    id: 'authority',
    name: 'Authority',
    clipCount: '20 clips / month',
    price: '$1,497/mo',
    description: 'Every appearance turned into an always-on clip engine.',
    highlights: ['Clips from every new episode', 'Monthly highlight reel', 'Priority turnaround', 'Dedicated editor'],
  },
]

export default function PortalAddOns() {
  const overviewQuery = usePortalExperience()
  const [selectedPackageId, setSelectedPackageId] = useState<string>('growth')
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null)
  const [requestedSummary, setRequestedSummary] = useState<string | null>(null)

  const publishedEpisodes = useMemo(
    () => (overviewQuery.data?.bookings ?? []).filter((booking) => booking.status === 'published'),
    [overviewQuery.data],
  )
  const selectedPackage = CLIPPING_PACKAGES.find((pkg) => pkg.id === selectedPackageId) ?? CLIPPING_PACKAGES[0]
  const needsEpisode = selectedPackage.id !== 'authority'
  const selectedEpisode: PortalExperienceBooking | null = needsEpisode
    ? publishedEpisodes.find((booking) => booking.id === selectedEpisodeId) ?? null
    : null

  const submitRequest = () => {
    const summary = needsEpisode && selectedEpisode
      ? `${selectedPackage.name} · ${selectedEpisode.podcast_name}`
      : selectedPackage.name
    setRequestedSummary(summary)
  }

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add-ons</h1>
          <p className="mt-1 text-muted-foreground">
            Get more from every appearance with services your team can add on.
          </p>
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Clapperboard className="h-5 w-5" /></div>
              <div>
                <p className="font-semibold">Podcast clipping service</p>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Your episodes carry your best moments — we cut them into short, captioned clips
                  built for social, so each appearance keeps working long after it airs.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {requestedSummary ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="text-lg font-semibold">Request received</p>
              <p className="max-w-md text-sm text-muted-foreground">
                You asked for <span className="font-medium text-foreground">{requestedSummary}</span>.
                Your team will confirm the details with you — no payment has been taken.
              </p>
              <Button variant="outline" size="sm" onClick={() => setRequestedSummary(null)}>
                Request something else
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              {CLIPPING_PACKAGES.map((pkg) => {
                const selected = pkg.id === selectedPackageId
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`rounded-xl border bg-card p-5 text-left transition-shadow hover:shadow-sm ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{pkg.name}</p>
                      {pkg.featured && (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10"><Sparkles className="mr-1 h-3 w-3" />Most popular</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-2xl font-bold">{pkg.price}</p>
                    <p className="text-sm text-muted-foreground">{pkg.clipCount}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>
                    <ul className="mt-3 space-y-1.5">
                      {pkg.highlights.map((highlight) => (
                        <li key={highlight} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Scissors className="h-4 w-4 text-muted-foreground" />
                  {needsEpisode ? 'Which episode should we clip?' : 'Covers every new episode'}
                </CardTitle>
                <CardDescription>
                  {needsEpisode
                    ? 'Pick one of your published appearances.'
                    : 'The Authority plan automatically clips each appearance as it goes live.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {needsEpisode && (
                  overviewQuery.isLoading ? (
                    <div className="flex min-h-24 items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" /> Loading your episodes…
                    </div>
                  ) : overviewQuery.error ? (
                    <div className="flex min-h-24 flex-col items-center justify-center gap-3 text-center">
                      <p className="text-sm text-destructive">We could not load your episodes.</p>
                      <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()}>
                        <RefreshCw className="mr-2 h-4 w-4" /> Try again
                      </Button>
                    </div>
                  ) : publishedEpisodes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Clips are cut from published episodes — as soon as your first appearance goes live it will appear here.
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Published episodes">
                      {publishedEpisodes.map((booking) => {
                        const selected = booking.id === selectedEpisodeId
                        return (
                          <li key={booking.id}>
                            <button
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setSelectedEpisodeId(selected ? null : booking.id)}
                              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/20 ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
                            >
                              {booking.podcast_image_url ? (
                                <img src={booking.podcast_image_url} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                                  <Headphones className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{booking.podcast_name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {booking.host_name ? `with ${booking.host_name}` : 'Published episode'}
                                </span>
                              </span>
                              {selected && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Requesting <span className="font-medium text-foreground">{selectedPackage.name}</span>
                    {selectedEpisode ? <> for <span className="font-medium text-foreground">{selectedEpisode.podcast_name}</span></> : null}.
                    Your team confirms before anything is billed.
                  </p>
                  <Button onClick={submitRequest} disabled={needsEpisode && !selectedEpisode}>
                    Request this package
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PortalLayout>
  )
}
