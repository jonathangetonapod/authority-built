import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, ArrowRight, Video, Users, ExternalLink } from 'lucide-react'
import type { Booking } from '@/services/bookings'
import type { AddonService, BookingAddon } from '@/services/addonServices'
import { formatPrice } from '@/services/addonServices'

interface UpgradeHeroBannerProps {
  publishedBookings: Booking[]
  service: AddonService
  existingAddons: BookingAddon[]
  onPurchaseClick: (booking: Booking) => void
}

export function UpgradeHeroBanner({
  publishedBookings,
  service,
  existingAddons,
  onPurchaseClick
}: UpgradeHeroBannerProps) {
  const [showOpportunities, setShowOpportunities] = useState(false)

  // Filter out episodes that already have this addon
  const availableEpisodes = publishedBookings.filter(booking =>
    !existingAddons.some(addon => addon.booking_id === booking.id)
  )

  if (availableEpisodes.length === 0) {
    return null
  }

  return (
    <>
      {/* Hero Banner */}
      <div className="mb-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-8 shadow-2xl">
        <div className="max-w-4xl mx-auto text-center text-white">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="h-10 w-10 animate-pulse" />
            <h2 className="text-4xl font-bold tracking-tight">
              MAXIMIZE YOUR REACH
            </h2>
            <Sparkles className="h-10 w-10 animate-pulse" />
          </div>

          <p className="text-xl mb-2 text-white/90">
            Turn {availableEpisodes.length} published {availableEpisodes.length === 1 ? 'episode' : 'episodes'} into viral clips
          </p>

          <p className="text-lg mb-6 text-white/80">
            Starting at {formatPrice(service.price_cents)}/episode
          </p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
              <Video className="h-4 w-4 mr-1" />
              5 Clips Per Episode
            </Badge>
            <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
              <Sparkles className="h-4 w-4 mr-1" />
              Hook-First Editing
            </Badge>
            <Badge className="bg-white/20 text-white border-white/30 text-sm py-1 px-3">
              <Users className="h-4 w-4 mr-1" />
              Maximize Engagement
            </Badge>
          </div>

          <Button
            size="lg"
            onClick={() => setShowOpportunities(true)}
            className="bg-white text-purple-600 hover:bg-gray-100 font-bold text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all hover:scale-105"
          >
            View Opportunities
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Opportunities Sheet */}
      <Sheet open={showOpportunities} onOpenChange={setShowOpportunities}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-2xl">
              <Sparkles className="h-6 w-6 text-purple-600" />
              Available Upgrade Opportunities
            </SheetTitle>
            <SheetDescription>
              Select an episode to add the {service.name}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {availableEpisodes.map((booking) => (
              <Card key={booking.id} className="p-4 hover:shadow-lg transition-shadow">
                <div className="flex gap-4">
                  {booking.podcast_image_url && (
                    <img
                      src={booking.podcast_image_url}
                      alt={booking.podcast_name}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg mb-1 truncate">
                      {booking.podcast_name}
                    </h3>

                    {booking.host_name && (
                      <p className="text-sm text-muted-foreground mb-2">
                        Host: {booking.host_name}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {booking.audience_size && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {booking.audience_size.toLocaleString()} listeners
                        </Badge>
                      )}
                      {booking.publish_date && (
                        <Badge variant="secondary" className="text-xs">
                          Published {new Date(booking.publish_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Badge>
                      )}
                    </div>

                    {booking.episode_url && (
                      <a
                        href={booking.episode_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 mb-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Listen to Episode
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    <Button
                      onClick={() => {
                        onPurchaseClick(booking)
                        setShowOpportunities(false)
                      }}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Add {service.name} - {formatPrice(service.price_cents)}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
