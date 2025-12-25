import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShoppingBag, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useCartStore } from '@/stores/cartStore'
import { createCheckoutSession, redirectToCheckout } from '@/services/stripe'
import { toast } from 'sonner'

export default function Checkout() {
  const navigate = useNavigate()
  const { items, getTotalPriceDisplay, getTotalItems, clearCart } = useCartStore()

  const [isProcessing, setIsProcessing] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
  })

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

    if (!isFormValid()) {
      toast.error('Please fill in all required fields correctly')
      return
    }

    if (isProcessing) {
      return // Prevent duplicate submissions
    }

    try {
      setIsProcessing(true)
      toast.info('Creating checkout session...')

      // Create Stripe Checkout Session
      const { sessionId, url } = await createCheckoutSession(
        items,
        formData.email,
        formData.fullName
      )

      console.log('✅ Session created, redirecting to Stripe:', sessionId)

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

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal Header */}
      <header className="border-b bg-surface-subtle">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => navigate('/premium-placements')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Podcasts
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
                  {totalItems} {totalItems === 1 ? 'podcast' : 'podcasts'} in your order
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Items List */}
                <div className="space-y-4 mb-6">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      {/* Podcast Image */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {item.podcastImage ? (
                          <img
                            src={item.podcastImage}
                            alt={item.podcastName}
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
                          {item.podcastName}
                        </h4>
                        <p className="text-sm text-muted-foreground">Qty: 1</p>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold">{item.priceDisplay}</p>
                      </div>
                    </div>
                  ))}
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
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  We'll send your order confirmation to this email
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
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
                    disabled={!isFormValid() || isProcessing}
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
