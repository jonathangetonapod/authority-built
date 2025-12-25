import { ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCartStore } from '@/stores/cartStore'

/**
 * Floating cart button with item count badge
 * Opens the cart drawer when clicked
 */
export const CartButton = () => {
  const { getTotalItems, openCart } = useCartStore()
  const itemCount = getTotalItems()

  // Don't show button if cart is empty
  if (itemCount === 0) {
    return null
  }

  return (
    <Button
      onClick={openCart}
      size="lg"
      className="fixed bottom-6 right-6 md:bottom-auto md:top-24 md:right-8 z-50 rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 h-16 w-16 p-0 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
      aria-label="Open shopping cart"
    >
      <div className="relative">
        <ShoppingCart className="h-6 w-6" />
        {itemCount > 0 && (
          <Badge
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center bg-red-500 border-2 border-white text-xs font-bold"
            variant="destructive"
          >
            {itemCount > 9 ? '9+' : itemCount}
          </Badge>
        )}
      </div>
    </Button>
  )
}
