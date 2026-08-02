# Components Architecture Documentation

## Overview

This document provides a comprehensive overview of all custom components in the Get On A Pod application. The component structure is organized by function and follows established patterns for reusability, props handling, and integration with the broader application architecture.

## Component Structure

```
src/components/
├── *.tsx                    # Root components (landing page, common)
├── admin/                   # Admin dashboard components
├── blog/                   # Blog-related components
├── portal/                 # Client portal components
├── pricing/               # Pricing and feature components
└── ui/                    # shadcn/ui primitives (excluded from this doc)
```

---

## Root Components

### Cart System

#### `CartButton.tsx`
**Purpose**: Floating cart button with item count badge
**Props**: None (uses cart store)
**Key Features**:
- Shows only when cart has items
- Displays item count with badge
- Fixed positioning (mobile: bottom-right, desktop: top-right)
- Gradient styling with hover effects
- Opens cart drawer on click

**Usage**: Used globally on pages with purchasing functionality

#### `CartDrawer.tsx`
**Purpose**: Slide-out cart drawer showing cart contents
**Props**: None (uses cart store)
**Key Features**:
- Sheet component that slides in from right
- Empty state with CTA to continue browsing
- Item management (remove items)
- Price calculations and display
- Checkout and continue browsing buttons
- Supports both podcast placements and addon services

**Usage**: Triggered by CartButton, provides full cart management

### Authentication & Navigation

#### `ClientProtectedRoute.tsx`
**Purpose**: Protected route wrapper for client portal pages
**Props**:
- `children: React.ReactNode` - Components to protect
**Key Features**:
- Loading state handling
- Redirects to login if unauthorized
- Preserves attempted URL for post-login redirect
- Includes `PortalAccessDenied` component for error states

**Usage**: Wraps all client portal pages

#### `ProtectedRoute.tsx`
**Purpose**: Similar to ClientProtectedRoute but for admin routes
**Props**:
- `children: React.ReactNode` - Components to protect
**Key Features**:
- Admin authentication checking
- Redirect handling for unauthorized access

#### `Navbar.tsx`
**Purpose**: Main site navigation with responsive design
**Props**: None
**Key Features**:
- Scroll-based styling changes
- Mobile hamburger menu
- Internal and external link handling
- Calendly integration for booking
- Responsive navigation items

**Usage**: Used on all public pages

#### `NavLink.tsx`
**Purpose**: Enhanced React Router NavLink with custom styling
**Props**:
- `className?: string` - Base classes
- `activeClassName?: string` - Active state classes
- `pendingClassName?: string` - Pending state classes
- Standard NavLink props

**Usage**: Used within navigation components for styled routing

### Error Handling

#### `ErrorBoundary.tsx`
**Purpose**: React error boundary with Sentry integration
**Props**:
- `children: React.ReactNode` - Components to wrap
**Key Features**:
- Sentry error reporting
- Development vs production error display
- Reload and retry functionality
- Styled error UI with helpful messaging

**Usage**: Wraps the entire application

### Landing Page Sections

#### `HeroSection.tsx`
**Purpose**: Main landing page hero section
**Props**: None
**Key Features**:
- Large typography with gradient effects
- Dual CTA buttons (book call, get free list)
- Responsive design with animation
- Background gradient effects
- Calendly integration

#### `HowItWorksSection.tsx`
**Purpose**: Explains the 4-step process
**Props**: None
**Key Features**:
- 4-step process visualization
- Scroll animations
- Icon-based step representation
- Responsive grid layout
- Call-to-action at bottom

#### `ProblemSection.tsx`
**Purpose**: Highlights client pain points
**Props**: None
**Key Features**:
- Problem identification
- Scroll-based animations
- Responsive text sizing

#### `SolutionSection.tsx`
**Purpose**: Presents the solution to identified problems
**Props**: None
**Key Features**:
- Solution-focused messaging
- Visual elements and icons
- Responsive design

#### `WhatYouGetSection.tsx`
**Purpose**: Details what clients receive
**Props**: None
**Key Features**:
- Feature list presentation
- Visual indicators
- Benefit-focused content

#### `WhoItsForSection.tsx`
**Purpose**: Target audience identification
**Props**: None
**Key Features**:
- Audience segmentation
- Clear value propositions
- Responsive layout

#### `WhyProSection.tsx`
**Purpose**: Explains why choose Pro plan
**Props**: None
**Key Features**:
- Pro plan benefits
- Comparison elements
- Visual differentiation

#### `GuaranteeSection.tsx`
**Purpose**: Displays service guarantees
**Props**: None
**Key Features**:
- Three guarantee cards with icons
- Trust badges and checkmarks
- Gradient backgrounds
- Responsive grid layout
- Strong messaging about results guarantee

#### `PodcastShowcaseSection.tsx`
**Purpose**: Shows podcasts they've booked clients on
**Props**: None
**Key Features**:
- Dynamic podcast grid from API
- Fallback data for API failures
- Statistics display (placements, reach, shows)
- Clickable podcast cards opening analytics modal
- Loading states and error handling

#### `PricingSection.tsx`
**Purpose**: Displays pricing plans and Stripe integration
**Props**: None
**Key Features**:
- Two plan comparison (Starter/Pro)
- Stripe Buy Button integration
- Feature detail modal integration
- Calendly booking integration
- Responsive design with hover effects

#### `FAQSection.tsx`
**Purpose**: Wrapper for FAQ component
**Props**: None
**Key Features**:
- Simple wrapper around PricingFAQ
- Scroll animation integration
- Clean section styling

#### `FinalCTASection.tsx`
**Purpose**: Final call-to-action before footer
**Props**: None
**Key Features**:
- Strong CTA messaging
- Calendly integration
- Gradient background
- Responsive typography

#### `Footer.tsx`
**Purpose**: Site footer with navigation and copyright
**Props**: None
**Key Features**:
- Navigation links
- External link handling
- Responsive layout
- Copyright information

#### `LeadMagnetSection.tsx`
**Purpose**: Email capture for free podcast list
**Props**: None
**Key Features**:
- Email form handling
- Toast notifications
- Scroll animations
- Social proof messaging

#### `SocialProofSection.tsx`
**Purpose**: Displays client testimonials and results
**Props**: None
**Key Features**:
- Testimonial carousel or grid
- Client results highlighting
- Trust building elements

#### `SocialProofNotifications.tsx`
**Purpose**: Popup notifications showing recent activity
**Props**: None
**Key Features**:
- Recent booking notifications
- Social proof through activity
- Timed appearance/disappearance

### Advanced Components

#### `GuestResourceEditor.tsx`
**Purpose**: Rich text editor with AI generation for guest resources
**Props**:
- `content: string` - Current content
- `onChange: (content: string) => void` - Content change handler
- `category?: string` - Resource category
- `placeholder?: string` - Editor placeholder
- `className?: string` - Additional styling

**Key Features**:
- TipTap rich text editor
- AI content generation via Supabase functions
- Full toolbar with formatting options
- Word count and read time calculation
- Image and link support
- Markdown and HTML output

**Usage**: Used in admin for creating guest resources

#### `PodcastAnalyticsModal.tsx`
**Purpose**: Detailed podcast analytics display
**Props**:
- `podcast: PodcastData | null` - Podcast data
- `isOpen: boolean` - Modal open state
- `onClose: () => void` - Close handler

**Key Features**:
- Comprehensive podcast metrics
- Reach score, episodes, rating display
- Audience insights and recommendations
- Category and metadata display
- Responsive modal design

**Usage**: Triggered from PodcastShowcaseSection

---

## Admin Components

### Layout & Navigation

#### `DashboardLayout.tsx`
**Purpose**: Admin dashboard layout with sortable navigation
**Props**:
- `children: React.ReactNode` - Page content

**Key Features**:
- Drag-and-drop sortable navigation
- Persistent nav order in localStorage
- Responsive sidebar with mobile menu
- User profile section with logout
- Comprehensive admin navigation items
- Auth integration

**Usage**: Wraps all admin pages

#### `GlobalCacheStats.tsx`
**Purpose**: Displays podcast cache statistics
**Props**: None
**Key Features**:
- Real-time cache metrics
- Statistics breakdown by source
- Estimated savings calculation
- Auto-refresh functionality
- Loading and error states

**Usage**: Used in admin dashboard for cache monitoring

#### `LeadSwipeCard.tsx`
**Purpose**: Tinder-style interface for managing leads
**Props**:
- `replies: CampaignReply[]` - Lead data
- `currentIndex: number` - Current position
- `onSwipeLeft/Right/Up/Down` - Swipe handlers
- `onMarkAs*` - Lead categorization handlers
- `onNext/Previous` - Navigation handlers

**Key Features**:
- Touch/mouse swipe gestures
- Keyboard navigation support
- Lead categorization (Sales, Premium, Client)
- Action buttons for archive, qualify, reply
- Progress indicator
- Responsive design with mobile optimization

**Usage**: Used in admin for lead management

#### `PodcastOutreachSwiper.tsx`
**Purpose**: Swiper interface for podcast outreach management
**Props**: Similar to LeadSwipeCard
**Key Features**:
- Podcast-specific lead handling
- Outreach campaign management
- Swipe-based workflow
- Integration with outreach platform

---

## Blog Components

#### `BlogCard.tsx`
**Purpose**: Blog post card for listings
**Props**:
- `post: BlogPost` - Blog post data

**Key Features**:
- Featured image support with fallback
- Category badge display
- Read time calculation
- Responsive card layout
- Hover effects and animations
- Link integration to full post

**Usage**: Used in blog listing pages

#### `BlogSEO.tsx`
**Purpose**: SEO meta tags for blog posts
**Props**:
- Blog post metadata

**Key Features**:
- Dynamic meta tag generation
- Open Graph support
- Twitter Card support
- Structured data

#### `RichTextEditor.tsx`
**Purpose**: Rich text editor for blog content
**Props**:
- Standard rich text editor props

**Key Features**:
- Full formatting toolbar
- Content management
- Image and media support

---

## Portal Components

#### `PortalLayout.tsx`
**Purpose**: Client portal layout wrapper
**Props**:
- `children: React.ReactNode` - Portal content

**Key Features**:
- Client-specific navigation
- User profile dropdown
- Impersonation mode support with banner
- Admin exit functionality
- Responsive design
- Footer with support links

**Usage**: Wraps all client portal pages

#### `AddonUpsellBanner.tsx`
**Purpose**: Promotes addon services to clients
**Props**: Addon service data
**Key Features**:
- Service promotion
- Upsell messaging
- Call-to-action integration

#### `UpgradeHeroBanner.tsx`
**Purpose**: Promotes plan upgrades
**Props**: Plan and upgrade data
**Key Features**:
- Upgrade benefits highlighting
- Plan comparison
- CTA for upgrade process

---

## Pricing Components

#### `PricingFAQ.tsx`
**Purpose**: Comprehensive FAQ for pricing and services
**Props**:
- `className?: string` - Additional styling
- `variant?: 'default' | 'compact'` - Display variant

**Key Features**:
- Organized by categories (Podcasts & Booking, Command Center & Analytics, Pricing & Plans)
- Accordion-style collapsible sections
- Responsive design
- Comprehensive coverage of common questions

**Usage**: Used in pricing section and standalone FAQ pages

#### `FeatureDetailModal.tsx`
**Purpose**: Modal showing detailed feature information
**Props**:
- `selectedFeature: string | null` - Feature to display
- `onClose: () => void` - Close handler

**Key Features**:
- Feature-specific detail display
- Modal interaction
- Rich feature descriptions
- Integration with pricing section

**Usage**: Triggered from pricing feature lists

---

## Common Patterns & Reusability

### Animation Patterns
Most landing page components use the `useScrollAnimation` hook for entrance animations:
- Fade in and translate Y on scroll
- Staggered delays for multiple elements
- Responsive animation timing

### State Management
- **Cart Store**: Global cart state using Zustand
- **Auth Context**: Authentication state management
- **Client Portal Context**: Portal-specific state with impersonation support

### Responsive Design
- Mobile-first approach
- Consistent breakpoint usage
- Touch-friendly interfaces on mobile
- Desktop-optimized layouts

### Loading States
- Skeleton loaders where appropriate
- Spinner indicators for async operations
- Error boundaries for error handling
- Graceful fallbacks

### Integration Patterns
- **Calendly**: Consistent booking integration across components
- **Stripe**: Payment processing with embedded buy buttons
- **Supabase**: Database and function integration
- **API Services**: Centralized service layer usage

### Accessibility
- ARIA labels and descriptions
- Keyboard navigation support
- Screen reader considerations
- Focus management

## Component Dependencies

### External Libraries
- **React Router**: Navigation and routing
- **Lucide React**: Icon system
- **TipTap**: Rich text editing
- **DND Kit**: Drag and drop functionality
- **TanStack Query**: Data fetching and caching
- **Sonner**: Toast notifications

### Internal Dependencies
- **shadcn/ui**: Base UI components
- **Custom hooks**: Scroll animations, auth, etc.
- **Service layer**: API integrations
- **Context providers**: Global state management
- **Utility functions**: Styling and helpers

This architecture provides a scalable, maintainable component system with clear separation of concerns, consistent patterns, and strong integration with the overall application architecture.