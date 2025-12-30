import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Video, FileText, Package, Users, ExternalLink, Check } from 'lucide-react'
import type { Booking } from '@/services/bookings'
import type { AddonService, BookingAddon } from '@/services/addonServices'
import { formatPrice } from '@/services/addonServices'

interface UpgradeHeroBannerProps {
  publishedBookings: Booking[]
  services: AddonService[]
  existingAddons: BookingAddon[]
  onPurchaseClick: (booking: Booking, service: AddonService) => void
}

export function UpgradeHeroBanner({
  publishedBookings,
  services,
  existingAddons,
  onPurchaseClick
}: UpgradeHeroBannerProps) {
  const [selectedService, setSelectedService] = useState<AddonService | null>(null)

  // Count unique episodes that have at least one addon purchased
  const episodesWithAddons = new Set(existingAddons.map(addon => addon.booking_id))
  const availableEpisodesCount = publishedBookings.length - episodesWithAddons.size

  if (availableEpisodesCount === 0 || services.length === 0) {
    return null
  }

  // Get icon for service
  const getServiceIcon = (serviceName: string) => {
    if (serviceName.toLowerCase().includes('clip')) return Video
    if (serviceName.toLowerCase().includes('blog') || serviceName.toLowerCase().includes('seo')) return FileText
    if (serviceName.toLowerCase().includes('bundle') || serviceName.toLowerCase().includes('complete')) return Package
    return Sparkles
  }

  // Get gradient colors for service
  const getServiceGradient = (index: number) => {
    const gradients = [
      'from-purple-600 to-pink-600',
      'from-blue-600 to-cyan-600',
      'from-orange-600 to-red-600',
    ]
    return gradients[index % gradients.length]
  }

  // Filter episodes available for a specific service
  const getAvailableEpisodes = (service: AddonService) => {
    return publishedBookings.filter(booking =>
      !existingAddons.some(addon =>
        addon.booking_id === booking.id && addon.service_id === service.id
      )
    )
  }

  return (
    <>
      {/* Hero Banner */}
      <div className="mb-6 rounded-xl border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-8 shadow-2xl">
        <div className="max-w-6xl mx-auto">
          {/* Hero Header */}
          <div className="text-center text-white mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Sparkles className="h-10 w-10 animate-pulse" />
              <h2 className="text-4xl font-bold tracking-tight">
                MAXIMIZE YOUR REACH
              </h2>
              <Sparkles className="h-10 w-10 animate-pulse" />
            </div>

            <p className="text-xl mb-2 text-white/90">
              Transform {availableEpisodesCount} published {availableEpisodesCount === 1 ? 'episode' : 'episodes'} into high-performing content
            </p>

            <p className="text-lg text-white/80">
              Choose the perfect package for your goals
            </p>
          </div>

          {/* Service Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {services.map((service, index) => {
              const Icon = getServiceIcon(service.name)
              const gradient = getServiceGradient(index)
              const availableForService = getAvailableEpisodes(service)
              const isBestValue = service.name.toLowerCase().includes('bundle')

              return (
                <Card key={service.id} className="relative overflow-hidden hover:shadow-2xl transition-all hover:scale-105">
                  {isBestValue && (
                    <div className="absolute top-4 right-4 z-10">
                      <Badge className="bg-green-600 text-white border-0">
                        Best Value
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="pb-4">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${gradient} flex items-center justify-center mb-3`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{service.name}</CardTitle>
                    <CardDescription className="text-sm">
                      {service.short_description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pb-4">
                    <div className="mb-4">
                      <div className="text-3xl font-bold text-foreground">
                        {formatPrice(service.price_cents)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {service.delivery_days} day delivery
                      </div>
                    </div>

                    <div className="space-y-2">
                      {service.features.slice(0, 4).map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{feature}</span>
                        </div>
                      ))}
                      {service.features.length > 4 && (
                        <div className="text-xs text-muted-foreground italic">
                          +{service.features.length - 4} more features
                        </div>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter>
                    <Button
                      onClick={() => setSelectedService(service)}
                      disabled={availableForService.length === 0}
                      className={`w-full bg-gradient-to-r ${gradient} hover:opacity-90 text-white font-semibold`}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {availableForService.length === 0 ? 'No Episodes Available' : 'Select Episodes'}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Episode Selection Sheet */}
      <Sheet open={!!selectedService} onOpenChange={() => setSelectedService(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedService && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-6 w-6 text-purple-600" />
                  Add {selectedService.name}
                </SheetTitle>
                <SheetDescription>
                  Select an episode to add {selectedService.name} ({formatPrice(selectedService.price_cents)})
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {getAvailableEpisodes(selectedService).map((booking) => (
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
                            onPurchaseClick(booking, selectedService)
                            setSelectedService(null)
                          }}
                          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Purchase {selectedService.name} - {formatPrice(selectedService.price_cents)}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
