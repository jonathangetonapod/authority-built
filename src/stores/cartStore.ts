import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PremiumPodcast } from '@/services/premiumPodcasts'

// Cart item interface
export interface CartItem {
  id: string // Unique cart item ID
  podcastId: string // premium_podcast.id
  podcastName: string
  podcastImage?: string
  price: number // Parsed numeric price (e.g., 3500 from "$3,500")
  priceDisplay: string // Formatted price string (e.g., "$3,500")
  quantity: number // Always 1 for podcasts, but kept for extensibility
}

// Cart store interface
interface CartStore {
  items: CartItem[]
  isOpen: boolean // Controls cart drawer visibility

  // Actions
  addItem: (podcast: PremiumPodcast) => void
  removeItem: (id: string) => void
  clearCart: () => void
  toggleCart: () => void
  openCart: () => void
  closeCart: () => void

  // Computed values
  getTotalItems: () => number
  getTotalPrice: () => number
  getTotalPriceDisplay: () => string
  isInCart: (podcastId: string) => boolean
}

/**
 * Parse price string to number
 * Handles formats like: "$3,500", "$3500", "3500", etc.
 */
export const parsePrice = (priceStr: string): number => {
  // Remove dollar sign, commas, and any spaces
  const cleaned = priceStr.replace(/[$,\s]/g, '')
  const parsed = parseFloat(cleaned)

  // Return 0 if parsing fails
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Format number to price display string
 * Example: 3500 => "$3,500"
 */
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

/**
 * Cart store with Zustand
 * Persisted to localStorage under key "podcast-cart"
 */
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      // Add item to cart
      addItem: (podcast: PremiumPodcast) => {
        const { items } = get()

        // Check if already in cart
        const existingItem = items.find((item) => item.podcastId === podcast.id)
        if (existingItem) {
          // Already in cart, don't add duplicate
          console.log('Item already in cart:', podcast.podcast_name)
          return
        }

        // Parse price
        const price = parsePrice(podcast.price)

        // Create cart item
        const cartItem: CartItem = {
          id: `cart-${Date.now()}-${podcast.id}`,
          podcastId: podcast.id,
          podcastName: podcast.podcast_name,
          podcastImage: podcast.podcast_image_url,
          price,
          priceDisplay: podcast.price,
          quantity: 1,
        }

        // Add to cart
        set({ items: [...items, cartItem] })
        console.log('Added to cart:', podcast.podcast_name, price)
      },

      // Remove item from cart
      removeItem: (id: string) => {
        const { items } = get()
        set({ items: items.filter((item) => item.id !== id) })
        console.log('Removed from cart:', id)
      },

      // Clear entire cart
      clearCart: () => {
        set({ items: [] })
        console.log('Cart cleared')
      },

      // Toggle cart drawer
      toggleCart: () => {
        const { isOpen } = get()
        set({ isOpen: !isOpen })
      },

      // Open cart drawer
      openCart: () => {
        set({ isOpen: true })
      },

      // Close cart drawer
      closeCart: () => {
        set({ isOpen: false })
      },

      // Get total number of items
      getTotalItems: () => {
        const { items } = get()
        return items.reduce((total, item) => total + item.quantity, 0)
      },

      // Get total price (numeric)
      getTotalPrice: () => {
        const { items } = get()
        return items.reduce((total, item) => total + item.price * item.quantity, 0)
      },

      // Get total price (formatted string)
      getTotalPriceDisplay: () => {
        const totalPrice = get().getTotalPrice()
        return formatPrice(totalPrice)
      },

      // Check if podcast is in cart
      isInCart: (podcastId: string) => {
        const { items } = get()
        return items.some((item) => item.podcastId === podcastId)
      },
    }),
    {
      name: 'podcast-cart', // localStorage key
      // Only persist items, not the isOpen state
      partialize: (state) => ({ items: state.items }),
    }
  )
)
