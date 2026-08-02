# Get On A Pod - Pages Architecture

> **Invite-only MVP warning:** the root README is authoritative for current
> routes. Billing/checkout and the AI Sales Director, admin videos, admin blog,
> customers/orders/analytics, premium placements, and settings surfaces are
> retired or redirected in this release.

This document provides a comprehensive overview of all pages in the Get On A Pod application, their routes, functionality, data flows, and user access controls.

## Application Overview

Get On A Pod is a sophisticated podcast booking and client management platform that helps experts get booked on podcasts to build authority. The application has multiple user types and complex workflows spanning marketing, sales, client management, and service delivery.

## Route Structure

The application uses React Router for client-side routing with protected routes based on user authentication and authorization.

### Route Protection Layers

- **ProtectedRoute**: Requires admin authentication via AuthContext
- **ClientProtectedRoute**: Requires client portal authentication via ClientPortalContext
- **Public Routes**: No authentication required
- **Public with Slug**: Accessible via unique slug/ID without authentication

---

## Root/Public Pages

### Index (`/`)
**File**: `/src/pages/Index.tsx`  
**Access**: Public

**Purpose**: Main marketing landing page and primary sales funnel entry point.

**Key Features**:
- Complete marketing funnel with multiple conversion sections
- Hero section with value proposition
- Problem/solution narrative flow
- Social proof and testimonials
- Podcast showcase section
- Pricing section with multiple tiers
- Lead magnets and FAQ section
- Social proof notifications (live conversion indicators)

**Data Flows**: 
- Static content sections with dynamic social proof notifications
- No backend integration - pure marketing page

**User Roles**: All visitors

---

### Resources (`/resources`)
**File**: `/src/pages/Resources.tsx`  
**Access**: Public

**Purpose**: Lead generation page offering free resources in exchange for email addresses.

**Key Features**:
- Grid of downloadable lead magnets
- Email capture functionality
- Resource categories (Research, Pitching, Positioning, Content, PR, Strategy)
- CTA section driving to paid services

**Data Flows**: 
- Email collection (currently simulated)
- Resource delivery system integration

**User Roles**: All visitors

---

### Premium Placements (`/premium-placements`)
**File**: `/src/pages/PremiumPlacements.tsx`  
**Access**: Public

**Purpose**: E-commerce page for booking guaranteed podcast placements.

**Key Features**:
- **Complex filtering system**: Search, category, audience size, price range
- **Advanced sorting**: Featured, price (asc/desc), audience size, name
- **Shopping cart integration**: Add items, view cart, checkout flow
- **Podcast cards with expandable details**: Features, audience metrics, pricing
- **Real-time availability**: Active/inactive podcast status
- **Premium badges**: Featured and special status indicators

**Data Flows**:
- `getActivePremiumPodcasts()`: Fetches available podcast placements
- Cart state management via Zustand store
- Integration with Stripe for payment processing

**User Roles**: All visitors

---

### Blog (`/blog`)
**File**: `/src/pages/Blog.tsx`  
**Access**: Public

**Purpose**: Content marketing hub with SEO-optimized articles.

**Key Features**:
- **Dynamic blog post grid** with search and filtering
- **Category-based filtering** system
- **Newsletter subscription** integration
- **Responsive card layout** with featured images
- **Performance optimized** with React Query caching

**Data Flows**:
- `getAllPosts()`: Fetches published blog posts with filtering
- `getAllCategories()`: Fetches available blog categories
- Real-time search with debounced API calls

**User Roles**: All visitors

---

### Blog Post (`/blog/:slug`)
**File**: `/src/pages/BlogPost.tsx`  
**Access**: Public

**Purpose**: Individual blog post display with full content and related posts.

**Key Features**:
- **Rich text content** with proper formatting
- **Author information** and metadata
- **Related posts** suggestions
- **Social sharing** functionality
- **SEO optimization** with meta tags
- **Reading time estimation**
- **View count tracking**

**Data Flows**:
- `getPostBySlug()`: Fetches individual post by URL slug
- `incrementViewCount()`: Tracks post views
- `getRelatedPosts()`: Fetches suggested related content

**User Roles**: All visitors

---

### Course (`/course`)
**File**: `/src/pages/Course.tsx`  
**Access**: Public

**Purpose**: Course landing page (implementation details not fully examined)

---

### What to Expect (`/what-to-expect`)
**File**: `/src/pages/WhatToExpect.tsx`  
**Access**: Public

**Purpose**: Process explanation page for prospective clients

---

### Onboarding (`/onboarding`)
**File**: `/src/pages/Onboarding.tsx`  
**Access**: Public

**Purpose**: Client onboarding flow initiation

---

### Checkout (`/checkout`)
**File**: `/src/pages/Checkout.tsx`  
**Access**: Public

**Purpose**: E-commerce checkout page for premium placements and addon services.

**Key Features**:
- **Dual checkout types**: Premium podcasts vs. addon services
- **Form validation**: Email, name, and service-specific requirements
- **Mixed cart protection**: Prevents incompatible item combinations
- **Order summary**: Detailed item breakdown with images and pricing
- **Stripe integration**: Secure payment processing
- **Client context support**: Addon services for authenticated clients

**Data Flows**:
- `createCheckoutSession()`: Creates Stripe session for premium podcasts
- `createAddonCheckoutSession()`: Creates Stripe session for client addons
- Cart state from Zustand store
- Client authentication via ClientPortalContext

**User Roles**: All visitors (with context-specific features for authenticated clients)

---

### Checkout Success/Canceled (`/checkout/success`, `/checkout/canceled`)
**Files**: `/src/pages/CheckoutSuccess.tsx`, `/src/pages/CheckoutCanceled.tsx`  
**Access**: Public

**Purpose**: Post-checkout flow pages with appropriate messaging and next steps.

---

### Analytics Test (`/test-analytics`)
**File**: `/src/pages/AnalyticsTest.tsx`  
**Access**: Public

**Purpose**: Testing page for analytics implementation (no auth required)

---

## Admin Pages

Canonical `/app/*` workspace pages require `ProtectedRoute` and use
`WorkspaceLayout`. Legacy platform-only tools under `/admin/*` use
`DashboardLayout`.

### My Workspace Overview (`/app/overview`)
**File**: `/src/pages/app/WorkspaceOverview.tsx`
**Access**: Active workspace accounts and platform administrators

**Purpose**: Shared landing page for the currently selected workspace.

**Key Features**:
- **Unified shell**: The same section order and controls in every workspace
- **My Workspace identity**: Friendly label for the platform owner's default workspace
- **Workspace switching**: Platform-only selector in the top-right header
- **Module entry points**: Onboarding, Podcast Finder, Clients, Guest Resources, and Settings
- **Fail-closed rollout**: Non-tenant-safe modules remain disabled

**Data Flows**:
- The default view uses the active account workspace from `AuthContext`.
- Selected workspaces use `getAdminWorkspaceView()` while retaining the platform actor.

**User Roles**: Workspace member, workspace manager, or platform administrator

---

### Clients Management (`/admin/clients`)
**File**: `/src/pages/admin/ClientsManagement.tsx`  
**Access**: Admin only

**Purpose**: Comprehensive client relationship and analytics management.

**Key Features**:
- **Triple view modes**: 
  - All Clients: Complete client list with lifetime stats
  - Monthly View: Month-by-month client activity
  - Analytics: Charts, growth metrics, and insights
- **Month navigation**: Timeline-based client activity analysis
- **Advanced filtering**: Name, email, status (active/paused/churned)
- **Portal access management**: Enable/disable client dashboard access
- **Analytics dashboard**: 
  - Client growth over time (line chart)
  - Status distribution (bar chart)
  - New client acquisition trends
  - Configurable time ranges (30d/60d/90d/6mo/1yr/all)
- **Booking metrics**: Total, booked, in-progress, recorded, published counts per client
- **Client CRUD operations**: Create, delete with confirmation dialogs

**Data Flows**:
- `getClients()`: Complete client database
- `getBookings()`: All bookings for metrics calculation
- `createClient()`, `deleteClient()`: Client management operations
- Complex analytics calculations and chart data generation

**User Roles**: Admin staff

---

### Client Detail (`/admin/clients/:id`)
**File**: `/src/pages/admin/ClientDetail.tsx`  
**Access**: Admin only

**Purpose**: Individual client management and booking oversight (referenced but not fully examined)

**Features**: Detailed client profile and booking management

---

### Podcast Finder (`/admin/podcast-finder`)
**File**: `/src/pages/admin/PodcastFinder.tsx`  
**Access**: Admin only

**Purpose**: Research tool for finding new podcast opportunities

---

### Prospect Dashboards (`/admin/prospect-dashboards`)
**File**: `/src/pages/admin/ProspectDashboards.tsx`  
**Access**: Admin only

**Purpose**: Management of prospect-specific dashboards and opportunities

---

### Podcast Database (`/admin/podcast-database`)
**File**: `/src/pages/admin/PodcastDatabase.tsx`  
**Access**: Admin only

**Purpose**: Central podcast database management and curation

---

### Calendar Dashboard (`/admin/calendar`)
**File**: `/src/pages/admin/CalendarDashboard.tsx`  
**Access**: Admin only

**Purpose**: Calendar view of all bookings, recordings, and publications

---

### Upcoming Recordings (`/admin/upcoming`)
**File**: `/src/pages/admin/UpcomingRecordings.tsx`  
**Access**: Admin only

**Purpose**: Focused view on upcoming podcast recordings requiring attention

---

### Going Live (`/admin/going-live`)
**File**: `/src/pages/admin/UpcomingGoingLive.tsx`  
**Access**: Admin only

**Purpose**: Management of episodes about to be published

---

### Outreach Platform (`/admin/outreach-platform`)
**File**: `/src/pages/admin/OutreachPlatform.tsx`  
**Access**: Admin only

**Purpose**: Outreach campaign management and tracking

---

### Retired administrator routes

`/admin/ai-sales-director`, `/admin/blog` (including its editor routes), and
`/admin/videos` are removed from the invite-only MVP. Their page source files
are deleted and the legacy URLs redirect to `/app/overview`.

---

### Premium Placements Management (`/admin/premium-placements`)
**File**: `/src/pages/admin/PremiumPlacementsManagement.tsx`  
**Access**: Admin only

**Purpose**: Backend management of premium podcast placement inventory

---

### Guest Resources Management (`/admin/guest-resources`)
**File**: `/src/pages/admin/GuestResourcesManagement.tsx`  
**Access**: Admin only

**Purpose**: Management of resources provided to podcast guests

---

### Customers Management (`/admin/customers`)
**File**: `/src/pages/admin/CustomersManagement.tsx`  
**Access**: Admin only

**Purpose**: Customer relationship management and support

---

### Leads Management (`/admin/leads`)
**File**: `/src/pages/admin/LeadsManagement.tsx`  
**Access**: Admin only

**Purpose**: Lead tracking and conversion management

---

### Orders Management (`/admin/orders`)
**File**: `/src/pages/admin/OrdersManagement.tsx`  
**Access**: Admin only

**Purpose**: Order fulfillment and addon service management

---

### Settings (`/admin/settings`)
**File**: `/src/pages/admin/Settings.tsx`  
**Access**: Admin only

**Purpose**: System configuration and admin preferences

---

### Analytics (`/admin/analytics`)
**File**: `/src/pages/admin/Analytics.tsx`  
**Access**: Admin only

**Purpose**: Business intelligence and performance analytics

---

### Admin Login (`/admin/login`)
**File**: `/src/pages/admin/Login.tsx`  
**Access**: Public (login page)

**Purpose**: Admin authentication portal

---

### Admin Onboarding (`/admin/onboarding`)
**File**: `/src/pages/admin/Onboarding.tsx`  
**Access**: Admin only

**Purpose**: New admin user setup and training

---

### Admin Callback (`/admin/callback`)
**File**: `/src/pages/admin/Callback.tsx`  
**Access**: Public (OAuth callback)

**Purpose**: Authentication callback handler for admin OAuth flows

---

## Client Portal Pages

Client portal pages require authentication via `ClientProtectedRoute` and use portal-specific layouts.

### Portal Dashboard (`/portal/dashboard`)
**File**: `/src/pages/portal/Dashboard.tsx`  
**Access**: Authenticated clients only

**Purpose**: Comprehensive client dashboard - the heart of the client experience.

**Key Features**:
- **Analytics & Insights**:
  - Time-range filtering (7d/14d/30d/60d/90d/all)
  - Booking status distribution charts
  - Audience reach metrics and trending
  - Top podcast performance analysis
- **Booking Management**:
  - Complete booking lifecycle tracking
  - Status-based filtering (all/in_progress/booked/recorded/published)
  - Search and advanced sorting capabilities
  - Individual booking details with AI podcast fit analysis
  - Demographics data integration via Podscan API
- **Calendar Integration**:
  - Visual calendar with scheduled/recording/publish dates
  - Google Calendar export functionality
  - Monthly navigation and day detail views
- **Action Items & Next Steps**:
  - Recording preparation reminders
  - Going live notifications
  - Episode sharing prompts
  - Follow-up tracking
  - Completion status management
- **Outreach Management**:
  - Podcast research from Google Sheets integration
  - AI-powered podcast fit analysis with caching
  - Podcast demographics and audience insights
  - Approval/rejection workflow
  - Notes and feedback system
- **Premium Placements**:
  - Browse additional podcast opportunities
  - Advanced filtering (category, audience, price)
  - Shopping cart functionality for instant booking
  - Integrated checkout process
- **Addon Services**:
  - Browse available service add-ons
  - Episode-specific service selection
  - Order tracking and status management

**Data Flows**:
- `getClientBookings()`: Complete client booking history and status
- `getClientOutreachPodcasts()`: Google Sheets integration for research
- `getActivePremiumPodcasts()`: Available instant-book opportunities
- `getActiveAddonServices()`: Service catalog
- `analyzePodcastFit()`: AI analysis with caching
- `getPodcastDemographics()`: Audience data via Podscan
- Cart and order management via Zustand store

**Performance Features**:
- Extensive caching strategies for AI analyses and demographics
- Preloading of podcast fit analyses in background
- LocalStorage persistence for analysis cache
- Optimized re-renders with useMemo and useCallback
- Pagination for large datasets

**User Roles**: Authenticated clients

---

### Portal Resources (`/portal/resources`)
**File**: `/src/pages/portal/Resources.tsx`  
**Access**: Authenticated clients only

**Purpose**: Client-specific resources and materials hub

---

### Portal Login (`/portal/login`)
**File**: `/src/pages/portal/Login.tsx`  
**Access**: Public (login page)

**Purpose**: Client authentication portal

---

### Portal Auth (`/portal/auth`)
**File**: `/src/pages/portal/Auth.tsx`  
**Access**: Public (auth handler)

**Purpose**: Client authentication callback and session management

---

## Public Client-Facing Pages

### Prospect View (`/prospect/:slug`)
**File**: `/src/pages/prospect/ProspectView.tsx`  
**Access**: Public (via unique slug)

**Purpose**: Personalized prospect dashboard for reviewing curated podcast opportunities.

**Key Features**:
- **Personalized Experience**:
  - Dynamic greeting with prospect name and photo
  - AI-generated personalized tagline
  - Custom reach and rating statistics
- **Podcast Opportunity Management**:
  - Grid view of curated podcast opportunities
  - AI-powered fit analysis for each podcast (cached for performance)
  - Detailed podcast demographics via Podscan API
  - Approval/rejection workflow with notes
- **Advanced Filtering & Search**:
  - Real-time search with debounced queries
  - Category-based filtering with dynamic chips
  - Feedback status filtering (approved/rejected/not_reviewed)
  - Episode count and audience size filters
  - Sorting by audience size and name
- **Rich Podcast Details**:
  - Expandable side panel with full podcast information
  - AI analysis of guest fit with pitch angles
  - Demographic breakdowns (age, gender, location, interests)
  - Host information and show statistics
- **Tutorial & Onboarding**:
  - Interactive tutorial for first-time visitors
  - Tour mode accessible via URL parameter
  - Tutorial completion tracking in localStorage
- **Video Integration**:
  - Optional Loom video message from host
  - Custom video thumbnails and titles
  - Modal video player with loading states
- **Feedback Management**:
  - Confetti celebrations for approvals
  - Progress tracking across all opportunities
  - Bulk review capabilities
  - Notes system for detailed feedback

**Data Flows**:
- Edge Function: `get-prospect-podcasts` - Fetches curated opportunities from Google Sheets
- Edge Function: `analyze-podcast-fit` - AI analysis of guest-podcast compatibility
- Edge Function: `generate-tagline` - Personalized messaging
- `getPodcastDemographics()` - Audience insights via Podscan API
- Supabase: `prospect_dashboards` and `prospect_podcast_feedback` tables
- Extensive caching for AI analyses and demographics

**Performance Optimizations**:
- Database-cached AI analyses loaded instantly
- Background preloading of podcast fit analysis
- Optimized image loading with lazy loading
- Debounced search to reduce API calls
- localStorage caching for tutorial state

**User Roles**: Prospects (via unique dashboard links)

---

### Client Approval View (`/client/:slug`)
**File**: `/src/pages/client/ClientApprovalView.tsx`  
**Access**: Public (via unique slug)

**Purpose**: Client-facing approval dashboard for reviewing podcast opportunities.

**Key Features**:
- **Similar to ProspectView but for existing clients**:
  - Client-specific branding and messaging
  - Integration with client database vs. prospect database
  - Same core functionality with client-specific data flows
- **Client Data Integration**:
  - Fetches from `clients` table instead of `prospect_dashboards`
  - Uses `client_podcast_feedback` for approval tracking
  - Google Sheets integration via client's sheet URL

**Data Flows**:
- Edge Function: `get-client-podcasts` - Client-specific podcast opportunities
- Similar AI analysis and demographics flows as ProspectView
- Supabase: `clients` and `client_podcast_feedback` tables

**User Roles**: Clients (via unique dashboard links)

---

### Not Found (`*`)
**File**: `/src/pages/NotFound.tsx`  
**Access**: Public

**Purpose**: 404 error page for undefined routes

---

## Data Flow Patterns

### Authentication Flows

1. **Admin Authentication**:
   - OAuth-based login via `/admin/login`
   - Session management via AuthContext
   - Protected routes check authentication status

2. **Client Portal Authentication**:
   - Login via `/portal/login`
   - Session management via ClientPortalContext
   - Separate authentication system from admin

3. **Public Dashboard Access**:
   - Slug-based access for prospects and clients
   - No authentication required
   - Unique slug validation for access control

### State Management

1. **Global State**:
   - **React Query**: Server state caching and synchronization
   - **Zustand**: Cart state management
   - **Context APIs**: Authentication and client portal state

2. **Local State**:
   - **useState**: Component-level UI state
   - **useLocalStorage**: Persistent preferences (tutorial completion, etc.)
   - **localStorage**: AI analysis caching for performance

### API Integration Patterns

1. **Supabase Direct**:
   - Real-time database operations
   - Authentication and authorization
   - File uploads and storage

2. **Edge Functions**:
   - AI analysis processing
   - Google Sheets integration
   - Complex business logic
   - Third-party API orchestration

3. **External APIs**:
   - **Stripe**: Payment processing
   - **Podscan**: Podcast demographics
   - **Google Calendar**: Calendar integration
   - **Loom**: Video integration

### Caching Strategies

1. **React Query**:
   - 5-minute cache for frequently accessed data
   - 30-second cache for real-time data
   - Background refetching for fresh data

2. **AI Analysis Caching**:
   - Database-level caching for AI analyses
   - localStorage for client-side persistence
   - Background preloading for performance

3. **Image and Asset Caching**:
   - Lazy loading for podcast images
   - Optimized loading strategies
   - Responsive image handling

## Performance Considerations

### Page Load Optimization

1. **Code Splitting**: Dynamic imports for large pages
2. **Image Optimization**: Lazy loading and responsive images
3. **Bundle Optimization**: Optimized webpack configuration

### Runtime Performance

1. **Memo Optimization**: Expensive calculations memoized
2. **Virtual Scrolling**: For large datasets (where implemented)
3. **Debounced Operations**: Search and API calls optimized

### Caching Strategy

1. **Multi-level Caching**: Database → localStorage → memory
2. **Background Processing**: AI analysis preloading
3. **Intelligent Cache Invalidation**: Time-based and event-based

---

## Security Model

### Route Protection

1. **Admin Routes**: Require admin authentication
2. **Client Portal**: Separate authentication system
3. **Public Dashboards**: Slug-based access control
4. **Rate Limiting**: API endpoint protection

### Data Access Control

1. **Row Level Security**: Supabase RLS policies
2. **API Authorization**: Edge function authentication
3. **Client Data Isolation**: Strict tenant isolation

### Content Security

1. **XSS Protection**: Sanitized content rendering
2. **CSRF Protection**: Token-based request validation
3. **Secure Defaults**: Conservative permission model

---

This architecture supports a complex multi-tenant SaaS platform with sophisticated workflows for podcast booking, client management, and business operations while maintaining excellent user experience and performance characteristics.
