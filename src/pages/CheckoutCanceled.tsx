import { useNavigate } from 'react-router-dom'
import { XCircle, ArrowLeft, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCartStore } from '@/stores/cartStore'

export default function CheckoutCanceled() {
  const navigate = useNavigate()
  const { openCart, getTotalItems } = useCartStore()

  const itemCount = getTotalItems()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          {/* Cancel Icon */}
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <XCircle className="h-12 w-12 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          <CardTitle className="text-3xl md:text-4xl font-bold mb-2">
            Payment Canceled
          </CardTitle>
          <CardDescription className="text-base">
            Your payment was canceled. No charges have been made to your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Cart Status */}
          {itemCount > 0 && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Good news!</strong> Your cart items have been saved. You can try checking
                out again or continue shopping.
              </p>
            </div>
          )}

          {/* Why did this happen? */}
          <div className="space-y-3">
            <h3 className="font-semibold">Why did this happen?</h3>
            <ul className="text-sm text-muted-foreground space-y-2 pl-4">
              <li>• You clicked the back button or closed the payment window</li>
              <li>• Your payment method was declined</li>
              <li>• The session expired due to inactivity</li>
              <li>• You chose to cancel the payment</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            {itemCount > 0 ? (
              <>
                <Button
                  size="lg"
                  className="flex-1 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                  onClick={() => navigate('/checkout')}
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    openCart()
                    navigate('/premium-placements')
                  }}
                >
                  View Cart ({itemCount})
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                onClick={() => navigate('/premium-placements')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Continue Shopping
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate('/')}
          >
            Return to Home
          </Button>

          {/* Support Info */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            Need help?{' '}
            <a href="mailto:support@getonapod.com" className="text-primary hover:underline">
              Contact our support team
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
