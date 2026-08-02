# Get On A Pod - Architecture Documentation

> **Invite-only MVP status:** this document includes historical architecture.
> Billing/Stripe, HeyGen/video generation, and client magic links are retired;
> historical mutation endpoints return HTTP 410. AI, Podscan, email, and Google
> credentials are server-only and never belong in `VITE_` variables. Use the
> root `README.md` and `docs/invite-only-mvp.md` as the release contract.

## Overview

Get On A Pod is a comprehensive podcast booking and management platform built with React, TypeScript, Supabase, and various external integrations. This document provides a complete overview of all services, hooks, stores, contexts, utilities, and external API integrations.

## Architecture Summary

The application follows a modular architecture with:
- **Services**: Backend API interactions and business logic
- **Hooks**: Reusable React hooks for UI concerns
- **Stores**: Global state management with Zustand  
- **Contexts**: React contexts for auth and shared state
- **Utilities**: Helper functions and configurations
- **Data**: Static data and configurations

---

## 📡 Services (`/src/services/*.ts`)

### Core Business Services

#### `addonServices.ts` - Add-on Service Management
**Purpose**: Manages additional services that clients can purchase for their podcast bookings.

**Key Interfaces:**
- `AddonService` - Service definition with pricing, features, delivery timeline
- `BookingAddon` - Purchase record linking bookings to services

**Main API Methods:**
- `getActiveAddonServices()` - Get all available addon services
- `getAddonServiceById(serviceId)` - Get specific service details
- `getBookingAddons(bookingId)` - Get addons for a booking
- `getClientAddons(clientId)` - Get all addons for a client
- `createBookingAddon(input)` - Create addon purchase record
- `updateBookingAddonStatus(addonId, status)` - Update delivery status
- `hasBookingAddon(bookingId, serviceId)` - Check if addon exists
- `getAllBookingAddons()` - Admin view of all addons

**Utility Functions:**
- `formatPrice(cents)` - Format price display
- `getAddonStatusColor(status)` - Get status badge styling
- `getAddonStatusText(status)` - Get readable status text

#### `bookings.ts` - Booking Management
**Purpose**: Core booking system for podcast appearances.

**Key Interfaces:**
- `Booking` - Complete booking record with metadata
- `BookingWithClient` - Booking with joined client data

**Main API Methods:**
- `getBookings(options)` - Get bookings with filtering/pagination
- `getBookingById(bookingId)` - Get single booking with client data
- `getBookingsByDate(date)` - Get bookings for specific date
- `getBookingsByMonth(year, month)` - Get bookings for month range
- `createBooking(input)` - Create new booking with podcast metadata
- `updateBooking(bookingId, updates)` - Update booking status/details
- `deleteBooking(bookingId)` - Remove booking
- `getBookingStats()` - Get overall booking statistics
- `getClientBookingStats(clientId)` - Get stats for specific client

**Status Values**: `conversation_started | in_progress | booked | recorded | published | cancelled`

#### `clients.ts` - Client Management
**Purpose**: Manages client accounts, profiles, and portal access.

**Key Interfaces:**
- `Client` - Client profile with contact info, portal access
- `ClientWithStats` - Client with booking statistics

**Main API Methods:**
- `getClients(options)` - Get clients with search/filtering
- `getClientById(clientId)` - Get single client profile
- `createClient(input)` - Create new client account
- `updateClient(clientId, updates)` - Update client information
- `deleteClient(clientId)` - Remove client account
- `setClientPassword(clientId, password)` - Set portal password
- `clearClientPassword(clientId)` - Remove portal access
- `uploadClientPhoto(clientId, file)` - Upload client photo to Supabase Storage
- `removeClientPhoto(clientId, photoUrl)` - Delete client photo
- `getClientStats()` - Get overall client statistics

**Utility Functions:**
- `generatePassword(length)` - Generate secure random password

#### `clientPortal.ts` - Client Portal Authentication
**Purpose**: Authentication system for client portal access.

**Key Interfaces:**
- `ClientPortalSession` - Active session with token and expiry
- `ClientPortalAuthResponse` - Login response with session and client data

**Main API Methods:**
- `loginWithPassword(email, password)` - Password-based login
- `validateSession(sessionToken)` - Validate existing session
- `logout(sessionToken)` - Invalidate session
- `getPortalBookings(sessionToken)` - Get client's bookings
- `getPortalResources(sessionToken)` - Get client's resources

**Session Storage:**
- `sessionStorage.save(session, client)` - Store the opaque session in
  tab-scoped `sessionStorage`, with an in-memory fallback
- `sessionStorage.get()` - Retrieve the tab-scoped or in-memory session
- `sessionStorage.clear()` - Clear stored session
- `sessionStorage.isExpired(session)` - Check if session expired

### Analytics & Data Services

#### `analytics.ts` - Pricing Analytics  
**Purpose**: Generate analytics and insights for premium podcast pricing.

**Key Interfaces:**
- `PricingAnalytics` - Complete analytics with price breakdowns

**Main API Methods:**
- `getPricingAnalytics()` - Generate comprehensive pricing analytics

**Generated Metrics:**
- Average price per listener (CPL)
- Total inventory value
- Price distribution by audience tiers
- Price breakdown by categories
- Top performing podcasts
- Price range distributions

#### `blog.ts` - Blog Management
**Purpose**: Content management system for blog posts with SEO features.

**Key Interfaces:**
- `BlogPost` - Complete blog post with SEO metadata
- `BlogCategory` - Blog categorization
- `CreateBlogPostInput` - Blog creation payload
- `BlogFilters` - Search and filtering options

**Main API Methods:**
- `getAllPosts(filters)` - Get posts with filtering/pagination
- `getPostBySlug(slug)` - Get post by URL slug
- `getPostById(id)` - Get post by ID
- `createPost(post)` - Create new blog post
- `updatePost(input)` - Update existing post
- `deletePost(id)` - Remove blog post
- `publishPost(id)` - Change status from draft to published
- `unpublishPost(id)` - Change status from published to draft
- `incrementViewCount(id)` - Track post views
- `getAllCategories()` - Get blog categories
- `getCategoryBySlug(slug)` - Get category by slug
- `getRelatedPosts(post, limit)` - Get related posts

**Helper Functions:**
- `generateSlug(title)` - Create URL-friendly slug
- `isSlugUnique(slug, excludeId?)` - Check slug availability
- `calculateReadTime(content)` - Estimate reading time
- `generateExcerpt(content, maxLength)` - Create post excerpt
- `generateSchemaMarkup(post)` - Create JSON-LD structured data

#### `podcastDatabase.ts` - Podcast Search & Management
**Purpose**: Core podcast discovery and database operations.

**Key Features:**
- Search podcasts by keywords, categories, audience size
- Filter by various criteria (language, rating, etc.)
- Podcast metadata management
- Integration with external podcast APIs

#### `podcastCache.ts` - Podcast Data Caching
**Purpose**: Performance optimization for podcast data.

**Key Features:**
- Cache frequently accessed podcast data
- Reduce API calls to external services
- Background refresh of stale data

### External API Services

#### `ai.ts` - AI Content Generation
**Purpose**: AI-powered content generation using Anthropic Claude.

**Configuration:**
- Calls a guarded Supabase Edge Function
- Provider key remains in server-side Supabase secret storage

**Main API Methods:**
- `generatePodcastSummary(input)` - Generate "Why This Show" descriptions
- `generatePodcastFeatures(audienceSize)` - Generate feature lists by tier

**AI Features:**
- Compelling podcast summaries for marketing
- Tier-based feature recommendations
- Fallback to template-based content on API failure

#### Stripe payment service (retired)

The browser service is removed. Historical checkout/webhook endpoints are 410
tombstones and the provider webhook must be unregistered during cutover.

#### `podscan.ts` - Podcast Data Provider
**Purpose**: Integration with Podscan API for podcast metadata.

**Features:**
- Search podcast databases
- Get detailed podcast analytics
- Audience size and engagement metrics

#### `googleSheets.ts` - Google Sheets Integration
**Purpose**: Export and synchronization with Google Sheets.

**Features:**
- Export booking data
- Client prospect management
- Automated reporting workflows

#### HeyGen/video service (retired)

The browser service and video worker are retired. Historical endpoints return
HTTP 410; remove the external Railway service and its secrets during cutover.

### Specialized Services

#### `categorization.ts` - Content Categorization
**Purpose**: Automated categorization of podcasts and content.

#### `compatibilityScoring.ts` - Matching Algorithm  
**Purpose**: Score compatibility between guests and podcasts.

#### `guestResources.ts` - Resource Management
**Purpose**: Manage guest resources and media kits.

#### `indexing.ts` - Search Indexing
**Purpose**: Search functionality and content indexing.

#### `orders.ts` - Order Management
**Purpose**: E-commerce order processing and fulfillment.

#### `outreachMessages.ts` - Outreach Campaign Management
**Purpose**: Automated outreach message templates and campaigns.

#### `podcastAnalytics.ts` - Podcast Analytics
**Purpose**: Advanced analytics for podcast performance.

#### `podcastSearchUtils.ts` - Search Utilities
**Purpose**: Helper functions for podcast search and filtering.

#### `premiumPodcasts.ts` - Premium Inventory
**Purpose**: Management of premium podcast placements.

#### `queryGeneration.ts` - Search Query Optimization
**Purpose**: Generate optimized search queries for podcast discovery.

#### `salesCalls.ts` - Sales Process Management
**Purpose**: Track and manage sales calls and conversions.

#### `testimonials.ts` - Social Proof Management
**Purpose**: Collect and display client testimonials.

#### `adminUsers.ts` - Admin Access Control
**Purpose**: Manage admin user accounts and permissions.

**Key Features:**
- Email-based admin authorization
- Cached admin verification
- Admin user CRUD operations

---

## 🎣 Hooks (`/src/hooks/*.ts`)

### UI & Interaction Hooks

#### `useScrollAnimation.ts` - Scroll-triggered Animations
**Purpose**: Trigger animations when elements come into view.

**Usage:**
```typescript
const { ref, isVisible } = useScrollAnimation<HTMLDivElement>(threshold)
```

**Features:**
- Uses Intersection Observer API
- Configurable visibility threshold
- One-time trigger (removes observer after first intersection)
- Generic typed for any HTML element

#### `use-mobile.tsx` - Mobile Device Detection
**Purpose**: Responsive design helper for mobile detection.

**Usage:**
```typescript
const isMobile = useIsMobile()
```

**Features:**
- Uses media query matching (768px breakpoint)
- Real-time updates on resize
- SSR-safe implementation
- Boolean return value

#### `use-toast.ts` - Toast Notifications
**Purpose**: Toast notification management (from shadcn/ui).

**Features:**
- Unified toast notification interface
- Integration with Sonner toast library
- Type-safe toast actions

---

## 🏪 Stores (`/src/stores/*.ts`)

### Global State Management

#### `cartStore.ts` - Shopping Cart State
**Purpose**: Global shopping cart state management using Zustand.

**Key Interfaces:**
- `CartItem` - Individual cart item with product details
- `CartStore` - Complete cart state and actions

**State Properties:**
- `items: CartItem[]` - Current cart items
- `isOpen: boolean` - Cart drawer visibility

**Main Actions:**
- `addItem(podcast)` - Add premium podcast to cart
- `addAddonItem(booking, service, clientId)` - Add addon service to cart
- `removeItem(id)` - Remove specific item
- `clearCart()` - Empty entire cart
- `toggleCart()` - Toggle cart drawer
- `openCart() / closeCart()` - Control cart drawer
- `getTotalItems()` - Count total items
- `getTotalPrice()` - Calculate total price
- `getTotalPriceDisplay()` - Get formatted price string
- `isInCart(podcastId)` - Check if podcast in cart
- `isAddonInCart(bookingId, serviceId)` - Check if addon in cart

**Persistence:**
- Uses Zustand persist middleware
- Stored in localStorage as "podcast-cart"
- Only cart items persisted (not UI state)

**Utility Functions:**
- `parsePrice(priceStr)` - Parse formatted prices to numbers
- `formatPrice(price)` - Format numbers to currency strings

**Supported Item Types:**
1. **Premium Podcasts**: Direct podcast bookings
2. **Addon Services**: Additional services for existing bookings

---

## 🌐 Contexts (`/src/contexts/*.tsx`)

### Authentication & Session Management

#### `AuthContext.tsx` - Admin Authentication
**Purpose**: Authentication context for admin panel access.

**Context Interface:**
- `user: User | null` - Supabase user object
- `session: Session | null` - Supabase session
- `loading: boolean` - Authentication state loading
- `signInWithGoogle()` - OAuth with Google
- `signInWithPassword(email, password)` - Email/password auth
- `signOut()` - Sign out current user

**Key Features:**
- Admin email verification with database lookup
- Automatic session restoration
- Real-time auth state changes
- Fallback admin email support
- Toast notifications for access denial

**Auth Flow:**
1. Check if user email is in admin_users table
2. Allow access only for authorized emails
3. Redirect to admin dashboard on success

#### `ClientPortalContext.tsx` - Client Portal Authentication
**Purpose**: Separate authentication system for client portal access.

**Context Interface:**
- `client: Client | null` - Current client data
- `session: ClientPortalSession | null` - Portal session
- `loading: boolean` - Session loading state
- `isImpersonating: boolean` - Admin impersonation mode
- `loginWithPassword(email, password)` - Password login
- `impersonateClient(client)` - Admin impersonation
- `exitImpersonation()` - Exit impersonation mode
- `logout()` - Sign out of portal

**Key Features:**
- Password-based login (magic links are retired)
- Admin impersonation capabilities
- Tab-scoped `sessionStorage` plus a tested in-memory fallback
- Fixed expiry with automatic logout; no silent token refresh
- Sentry user tracking integration

**Session Management:**
- 24-hour session duration
- Automatic expiration handling
- Session validation with backend
- Secure token storage

---

## 🛠️ Utilities (`/src/lib/*.ts`)

### Configuration & Setup

#### `config.ts` - Authentication Configuration
**Purpose**: Admin authentication and authorization configuration.

**Key Constants:**
- `FALLBACK_ADMIN_EMAIL` - Always-authorized admin email
- `CACHE_TTL` - Admin email cache duration (1 minute)

**Main Functions:**
- `isAdminEmail(email)` - Synchronous admin check (uses cache)
- `isAdminEmailAsync(email)` - Async admin check with DB lookup
- `preloadAdminEmails()` - Preload admin emails into cache

**Caching Strategy:**
- In-memory cache for admin emails
- 1-minute cache TTL for performance
- Fallback to hardcoded admin on DB failures

#### `supabase.ts` - Database Client
**Purpose**: Supabase client configuration and initialization.

**Configuration:**
- Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Validates environment variables on startup
- Exports configured Supabase client

#### `utils.ts` - General Utilities
**Purpose**: Common utility functions for the application.

**Main Functions:**
- `cn(...inputs)` - Combine and merge Tailwind CSS classes

**Dependencies:**
- `clsx` - Conditional class names
- `tailwind-merge` - Merge Tailwind classes intelligently

#### `googleCalendar.ts` - Calendar Integration
**Purpose**: Google Calendar API integration for booking management.

#### `sentry.ts` - Error Monitoring
**Purpose**: Sentry configuration for error tracking and monitoring.

#### `categories.ts` - Content Categories
**Purpose**: Podcast and content categorization definitions.

---

## 📊 Data (`/src/data/*.ts`)

### Static Data & Configurations

#### `blogPosts.ts` - Blog Content Data
**Purpose**: Static blog post data and configuration.

**Key Interfaces:**
- `BlogPost` - Blog post structure with SEO metadata

**Data Included:**
- 6 sample blog posts with complete metadata
- Categories for content organization
- SEO-optimized titles and descriptions
- Realistic publish dates and read times

**Blog Categories:**
- Podcast Marketing
- Guest Tips  
- Strategy
- Podcast Lists
- Content Strategy
- Outreach

**Content Topics:**
1. "Why Podcast Guesting Beats Paid Ads for B2B Lead Generation"
2. "The Ultimate Podcast Guest Prep Checklist: 15 Steps to Nail Every Interview"
3. "The Real ROI of Podcast Guesting: A Data-Driven Analysis"
4. "50 Best Podcasts for SaaS Founders to Target in 2025"
5. "How to Repurpose Your Podcast Interview into 20+ Pieces of Content"
6. "5 Proven Podcast Pitch Templates That Get 60%+ Response Rates"

---

## 🔗 External API Integrations

### Core Integrations

1. **Supabase** - Primary database and authentication
   - PostgreSQL database
   - Real-time subscriptions
   - Row Level Security (RLS)
   - Edge Functions for server-side logic
   - Storage for file uploads

2. **Stripe** - Payment processing
   - Checkout sessions
   - Webhook event handling
   - Subscription management
   - Customer portal

3. **Anthropic Claude** - AI content generation
   - Podcast summary generation
   - Content optimization
   - Client-side API usage

4. **Google APIs**
   - Google Sheets integration
   - Google Calendar booking
   - OAuth authentication

5. **Podscan** - Podcast data provider
   - Podcast search and discovery
   - Audience analytics
   - Rating and review data

6. **HeyGen** - AI video generation
   - Personalized video content
   - Avatar-based messaging

7. **Sentry** - Error monitoring and performance tracking
   - Real-time error reporting
   - Performance monitoring
   - User session tracking

---

## 🗂️ Database Schema Overview

### Core Tables
- `clients` - Client profiles and portal access
- `bookings` - Podcast booking records
- `addon_services` - Available additional services
- `booking_addons` - Purchased addon records
- `admin_users` - Admin access control
- `blog_posts` - Blog content management
- `blog_categories` - Blog organization
- `premium_podcasts` - Premium inventory
- `guest_resources` - Client resource management

### Key Relationships
- Clients → Bookings (1:many)
- Bookings → Booking Addons (1:many)
- Addon Services → Booking Addons (1:many)
- Blog Categories → Blog Posts (1:many)

---

## 🚀 Deployment & Environment

### Environment Variables
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_URL=your_app_url
```

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **State**: Zustand for global state, React Context for auth
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **AI**: guarded server-side provider integrations
- **Monitoring**: Sentry

---

## 📈 Performance Optimizations

### Caching Strategies
1. **Admin Email Caching** - 1-minute cache for admin authorization
2. **Podcast Data Caching** - Reduce external API calls
3. **Session Storage** - tab-scoped `sessionStorage` with an in-memory fallback
   for client portal sessions

### Code Splitting
- Route-based code splitting
- Lazy loading for admin panels
- Dynamic imports for large dependencies

### Database Optimizations
- Indexed queries for common searches
- Pagination for large datasets
- Efficient joins for related data

---

This documentation provides a complete overview of the Get On A Pod architecture. Each service, hook, store, and context serves a specific purpose in creating a comprehensive podcast booking and management platform.
