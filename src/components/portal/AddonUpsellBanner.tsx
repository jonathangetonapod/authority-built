import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Check, Clock, Download } from 'lucide-react'
import type { AddonService, BookingAddon } from '@/services/addonServices'
import { formatPrice } from '@/services/addonServices'

interface AddonUpsellBannerProps {
  bookingId: string
  service: AddonService
  existingAddon?: BookingAddon | null
  onPurchaseClick: () => void
}

export function AddonUpsellBanner({
  bookingId,
  service,
  existingAddon,
  onPurchaseClick
}: AddonUpsellBannerProps) {
  const [showDetails, setShowDetails] = useState(false)

  // If addon already purchased, show status banner
  if (existingAddon) {
    return (
      <div className="mb-4 rounded-lg border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-5 w-5 text-green-600" />
              <h3 className="font-semibold text-lg">
                {service.name}
              </h3>
              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {existingAddon.status === 'pending' && '⏳ Paid - Pending'}
                {existingAddon.status === 'in_progress' && '🎬 In Progress'}
                {existingAddon.status === 'delivered' && '✅ Delivered'}
                {existingAddon.status === 'cancelled' && '❌ Cancelled'}
              </Badge>
            </div>

            {existingAddon.status === 'delivered' && existingAddon.google_drive_url ? (
              <div className="flex items-center gap-2 mt-3">
                <Button
                  onClick={() => window.open(existingAddon.google_drive_url!, '_blank')}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Your Clips
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {existingAddon.status === 'pending' && `We'll start working on your clips shortly. Expected delivery: ${service.delivery_days} business days.`}
                {existingAddon.status === 'in_progress' && `Your clips are being edited. Expected delivery: ${service.delivery_days} business days from purchase.`}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Otherwise, show upsell banner
  return (
    <>
      <div className="mb-4 rounded-lg border bg-gradient-to-r from-purple-50 via-pink-50 to-orange-50 dark:from-purple-950 dark:via-pink-950 dark:to-orange-950 p-6 shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              <h3 className="font-bold text-xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Turn Your Episode Into Viral Clips!
              </h3>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              {service.short_description || service.description}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {service.features.slice(0, 3).map((feature, idx) => (
                <Badge key={idx} variant="secondary" className="bg-white/50 dark:bg-black/30">
                  <Check className="h-3 w-3 mr-1" />
                  {feature}
                </Badge>
              ))}
              <Badge variant="secondary" className="bg-white/50 dark:bg-black/30">
                <Clock className="h-3 w-3 mr-1" />
                {service.delivery_days} business days
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={onPurchaseClick}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-lg"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Add {service.name} - {formatPrice(service.price_cents)}
              </Button>

              <Button
                variant="ghost"
                onClick={() => setShowDetails(true)}
                className="text-sm"
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-purple-600" />
              {service.name}
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              {service.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">What's Included:</h4>
              <ul className="space-y-2">
                {service.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-3xl font-bold">{formatPrice(service.price_cents)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Delivery</p>
                  <p className="text-lg font-semibold">{service.delivery_days} business days</p>
                </div>
              </div>
            </div>

            <Button
              onClick={() => {
                setShowDetails(false)
                onPurchaseClick()
              }}
              size="lg"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Purchase Now - {formatPrice(service.price_cents)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
