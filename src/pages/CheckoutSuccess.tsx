import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ArrowRight, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCartStore } from '@/stores/cartStore'

export default function CheckoutSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { clearCart } = useCartStore()

  const sessionId = searchParams.get('session_id')

  // Clear cart on mount
  useEffect(() => {
    clearCart()
  }, [clearCart])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          {/* Success Icon */}
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <CardTitle className="text-3xl md:text-4xl font-bold mb-2">
            Order Confirmed! 🎉
          </CardTitle>
          <CardDescription className="text-base">
            Thank you for your purchase. Your order has been successfully placed.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Order ID */}
          {sessionId && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Order ID</p>
              <p className="font-mono text-sm">{sessionId.substring(0, 24)}...</p>
            </div>
          )}

          {/* What's Next Section */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              What happens next?
            </h3>
            <div className="space-y-3 pl-7">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">Email Confirmation</p>
                  <p className="text-sm text-muted-foreground">
                    You'll receive an order confirmation email within the next few minutes
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">We'll Reach Out</p>
                  <p className="text-sm text-muted-foreground">
                    Our team will contact you within 24-48 hours to schedule your podcast
                    placements
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">Pre-Interview Prep</p>
                  <p className="text-sm text-muted-foreground">
                    We'll prepare you with talking points, show details, and host information
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  4
                </div>
                <div>
                  <p className="font-medium">Recording & Publishing</p>
                  <p className="text-sm text-muted-foreground">
                    We'll coordinate the recording and ensure your episode goes live
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              size="lg"
              className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              onClick={() => navigate('/')}
            >
              Return to Home
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => navigate('/premium-placements')}
            >
              Browse More Podcasts
            </Button>
          </div>

          {/* Support Info */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            Questions about your order?{' '}
            <a href="mailto:support@getonapod.com" className="text-primary hover:underline">
              Contact our support team
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
