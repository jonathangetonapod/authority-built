import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShoppingBag, ArrowLeft, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useCartStore, type CartItem } from '@/stores/cartStore'
import { createCheckoutSession, createAddonCheckoutSession } from '@/services/stripe'
import { useClientPortal } from '@/contexts/ClientPortalContext'
import { toast } from 'sonner'

export default function Checkout() {
  const navigate = useNavigate()
  const { items, getTotalPriceDisplay, getTotalItems, clearCart } = useCartStore()
  const { client } = useClientPortal()

  const [isProcessing, setIsProcessing] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
  })

  // Separate items by type
  const premiumPodcasts = items.filter(item => item.type === 'premium_podcast')
  const addonServices = items.filter(item => item.type === 'addon_service')
  const hasMultipleTypes = premiumPodcasts.length > 0 && addonServices.length > 0

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      toast.error('Your cart is empty', {
        description: 'Add some podcasts to your cart first',
      })
      navigate('/premium-placements')
    }
  }, [items, navigate])

  // Form validation
  const isFormValid = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return (
      formData.email.trim() !== '' &&
      emailRegex.test(formData.email) &&
      formData.fullName.trim() !== ''
    )
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Check for mixed cart
    if (hasMultipleTypes) {
      toast.error('Mixed cart detected', {
        description: 'Please checkout premium podcasts and addon services separately',
      })
      return
    }

    // Only validate form fields for premium podcasts (addon services use client session)
    if (premiumPodcasts.length > 0 && !isFormValid()) {
      toast.error('Please fill in all required fields correctly')
      return
    }

    // For addon services, ensure client is logged in
    if (addonServices.length > 0 && !client) {
      toast.error('Please log in to purchase addon services')
      return
    }

    if (isProcessing) {
      return // Prevent duplicate submissions
    }

    try {
      setIsProcessing(true)
      toast.info('Creating checkout session...')

      let url: string

      // Handle addon services checkout
      if (addonServices.length > 0) {
        // Validate all addons have required data
        const validAddons = addonServices.filter(
          addon => addon.bookingId && addon.serviceId
        )

        if (validAddons.length === 0) {
          throw new Error('Invalid addon service data')
        }

        // Map to the format expected by the edge function
        const addonsData = validAddons.map(addon => ({
          bookingId: addon.bookingId!,
          serviceId: addon.serviceId!,
        }))

        const response = await createAddonCheckoutSession(addonsData, client!.id)
        url = response.url
      }
      // Handle premium podcast checkout
      else {
        const response = await createCheckoutSession(
          items,
          formData.email,
          formData.fullName
        )
        url = response.url
      }

      console.log('✅ Session created, redirecting to Stripe')

      // Redirect to Stripe Checkout
      window.location.href = url
    } catch (error: any) {
      console.error('❌ Checkout error:', error)
      toast.error('Checkout failed', {
        description: error.message || 'Please try again',
      })
      setIsProcessing(false)
    }
  }

  // Don't render if cart is empty
  if (items.length === 0) {
    return null
  }

  const totalItems = getTotalItems()
  const totalPrice = getTotalPriceDisplay()

  // Determine back navigation based on cart contents
  const backPath = addonServices.length > 0 ? '/portal/dashboard' : '/premium-placements'
  const backLabel = addonServices.length > 0 ? 'Back to Dashboard' : 'Back to Podcasts'

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="border-b bg-surface-subtle">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate(backPath)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Button>
            <h1 className="text-xl font-bold">Checkout</h1>
            <div className="w-32" /> {/* Spacer for centering */}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 max-w-6xl mx-auto">
          {/* Order Summary - Left Column (Desktop) / Top (Mobile) */}
          <div className="order-2 lg:order-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Order Summary
                </CardTitle>
                <CardDescription>
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} in your order
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Mixed Cart Warning */}
                {hasMultipleTypes && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your cart contains both podcast placements and addon services.
                      Please checkout these separately.
                    </AlertDescription>
                  </Alert>
                )}


                {/* Items List */}
                <div className="space-y-4 mb-6">
                  {items.map((item) => {
                    const isAddon = item.type === 'addon_service'
                    const image = isAddon ? item.episodeImage : item.podcastImage
                    const title = isAddon
                      ? `${item.serviceName} for ${item.episodeName}`
                      : item.podcastName

                    return (
                      <div key={item.id} className="flex gap-4">
                        {/* Image */}
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {image ? (
                            <img
                              src={image}
                              alt={title || 'Item'}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm leading-tight line-clamp-2 mb-1">
                            {title}
                          </h4>
                          <p className="text-sm text-muted-foreground">Qty: 1</p>
                        </div>

                        {/* Price */}
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold">{item.priceDisplay}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Separator className="my-6" />

                {/* Totals */}
                <div className="space-y-2">
                  <div className="flex justify-between text-base">
                    <span>Subtotal</span>
                    <span className="font-semibold">{totalPrice}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Processing Fee</span>
                    <span>Included</span>
                  </div>
                  <Separator className="my-4" />
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span className="text-primary">{totalPrice}</span>
                  </div>
                </div>

                {/* What's Next Info */}
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">What happens next?</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Secure payment via Stripe</li>
                    <li>• Instant order confirmation</li>
                    <li>• We'll contact you to schedule</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Checkout Form - Right Column (Desktop) / Bottom (Mobile) */}
          <div className="order-1 lg:order-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {addonServices.length > 0 ? 'Confirm Purchase' : 'Contact Information'}
                </CardTitle>
                <CardDescription>
                  {addonServices.length > 0
                    ? 'Review your addon service purchase'
                    : "We'll send your order confirmation to this email"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Only show contact form for premium podcasts */}
                  {premiumPodcasts.length > 0 && (
                    <>
                      {/* Email Field */}
                      <div className="space-y-2">
                        <Label htmlFor="email">
                          Email Address <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="sarah@example.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          disabled={isProcessing}
                        />
                      </div>

                      {/* Full Name Field */}
                      <div className="space-y-2">
                        <Label htmlFor="fullName">
                          Full Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="fullName"
                          type="text"
                          placeholder="Sarah Johnson"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          required
                          disabled={isProcessing}
                        />
                      </div>
                    </>
                  )}

                  {/* Show client info for addon services */}
                  {addonServices.length > 0 && client && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Purchasing as:</p>
                      <p className="text-sm text-muted-foreground">{client.name}</p>
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                    </div>
                  )}

                  <Separator className="my-6" />

                  {/* Payment Info */}
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      You'll be redirected to Stripe's secure payment page to complete your
                      purchase. Payment information is never stored on our servers.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                    disabled={
                      hasMultipleTypes ||
                      (premiumPodcasts.length > 0 && !isFormValid()) ||
                      (addonServices.length > 0 && !client) ||
                      isProcessing
                    }
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>Continue to Payment</>
                    )}
                  </Button>

                  {/* Disabled Button Feedback */}
                  {hasMultipleTypes && (
                    <p className="text-center text-xs text-destructive">
                      Please remove either premium podcasts or addon services to continue
                    </p>
                  )}
                  {addonServices.length > 0 && !client && (
                    <p className="text-center text-xs text-destructive">
                      Please log in to purchase addon services
                    </p>
                  )}

                  {/* Security Badge */}
                  <p className="text-center text-xs text-muted-foreground">
                    🔒 Secured by Stripe • Your payment information is encrypted
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
