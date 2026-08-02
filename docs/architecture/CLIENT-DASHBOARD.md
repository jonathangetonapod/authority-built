# Client Dashboard System Architecture

> **Invite-only MVP warning:** the magic-link flow described below is retired
> and its same-name functions return HTTP 410. The supported portal uses the
> hash-only password/session flow documented in the root README and
> `docs/invite-only-mvp.md`; historical examples are not deployment guidance.

## Overview

The Client Dashboard system in Get On A Pod provides a comprehensive portal for clients to manage their podcast booking journey. It consists of two main interfaces: a **Public Client Approval View** for reviewing podcast opportunities and a **Secure Client Portal** for managing bookings, viewing analytics, and accessing resources.

## Table of Contents

1. [Authentication System](#authentication-system)
2. [Client Approval Dashboard](#client-approval-dashboard)
3. [Client Portal](#client-portal)
4. [Database Schema](#database-schema)
5. [Edge Functions](#edge-functions)
6. [Client Journey](#client-journey)
7. [Security Implementation](#security-implementation)
8. [Analytics & Demographics](#analytics--demographics)

---

## Authentication System

### Overview
The system supports two authentication methods:
1. **Magic Link Authentication** - Passwordless login via email
2. **Password-based Authentication** - Username/password login
3. **Admin Impersonation** - Admins can view client portals

### Authentication Flow

#### 1. Magic Link Flow
```
Client Request → Edge Function → Database → Email Sent → Token Click → Session Creation
```

**Components:**
- **Frontend**: `src/pages/portal/Auth.tsx`
- **Service**: `src/services/clientPortal.ts#requestMagicLink()`
- **Edge Function**: `supabase/functions/send-portal-magic-link/`
- **Verification**: `supabase/functions/verify-portal-token/`

**Process:**
1. Client enters email on login page
2. `requestMagicLink()` calls `send-portal-magic-link` Edge Function
3. Token stored in `client_portal_tokens` table (15-minute expiry)
4. Email sent with magic link containing token
5. Client clicks link → `Auth.tsx` extracts token from URL
6. `loginWithToken()` calls `verify-portal-token` Edge Function
7. Token validated, marked as used, session created
8. Client redirected to dashboard

#### 2. Password Flow
```
Client Credentials → Validation → Session Creation → Dashboard Access
```

**Components:**
- **Frontend**: `src/pages/portal/Login.tsx`
- **Service**: `src/services/clientPortal.ts#loginWithPassword()`
- **Edge Function**: `supabase/functions/login-with-password/`

**Process:**
1. Client enters email and password
2. `loginWithPassword()` calls Edge Function
3. The Edge Function validates the password against the server-only
   `client_portal_credentials` PBKDF2-SHA256 verifier.
4. A session is created transactionally in `client_portal_sessions`; only a
   SHA-256 verifier is stored in the database.
5. A minimal client DTO and opaque token are stored in tab-scoped
   `sessionStorage`.

#### 3. Session Management
**Context**: `src/contexts/ClientPortalContext.tsx`

**Features:**
- **Automatic session restore** from tab-scoped `sessionStorage` on page load,
  with an in-memory fallback when browser storage is unavailable
- **Session validation** with backend on restore
- **Auto-logout** when session expires (24-hour default)
- **Impersonation support** for admin testing

**Session Storage:**
```typescript
interface ClientPortalSession {
  session_token: string    // UUID-based token
  expires_at: string       // 24-hour expiry
  client_id: string        // Associated client
}
```

### Database Tables

#### `client_portal_sessions`
```sql
CREATE TABLE client_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `client_portal_tokens`
```sql
CREATE TABLE client_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `client_portal_activity_log`
```sql
CREATE TABLE client_portal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES client_portal_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- 'login_success', 'login_failed', 'logout'
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Client Approval Dashboard

### Overview
**File**: `src/pages/client/ClientApprovalView.tsx`

Public-facing dashboard where clients review and approve podcast opportunities. No authentication required - accessed via unique slug.

### Key Features

#### 1. **Podcast Opportunity Review**
- Grid view of curated podcast matches
- AI-powered fit analysis for each podcast
- Quick approve/reject buttons
- Detailed podcast information panel

#### 2. **AI-Powered Insights**
**Service**: Podcast fit analysis via Edge Functions
- **Why it's a good fit** - Personalized reasons
- **Suggested pitch angles** - Conversation topics
- **Audience demographics** - Who they'll reach

#### 3. **Advanced Filtering & Search**
```typescript
// Filter options available
const filters = {
  search: string,              // Podcast name/description search
  categories: string[],        // Podcast categories
  feedbackStatus: 'all' | 'approved' | 'rejected' | 'not_reviewed',
  episodeCount: 'any' | 'under50' | '50to100' | '100to200' | '200plus',
  audienceSize: 'any' | 'under1k' | '1kto5k' | '5kto10k' | '10kto25k' | '25kto50k' | '50kto100k' | '100kplus',
  sortBy: 'default' | 'audience_desc' | 'audience_asc'
}
```

#### 4. **Feedback System**
**Database Table**: `client_podcast_feedback`
```sql
CREATE TABLE client_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, podcast_id)
);
```

#### 5. **Real-time Analytics & Progress Tracking**
- Total audience reach calculation
- Average podcast ratings
- Review progress tracking
- Approval/rejection statistics

#### 6. **Interactive Tutorial System**
5-step guided tutorial for first-time users:
1. Welcome & overview
2. Browse podcasts explanation
3. AI insights demonstration
4. Approval process walkthrough
5. Next steps information

### Technical Implementation

#### **Data Loading Strategy**
1. **Lazy Loading**: Dashboard loads immediately with skeleton UI
2. **Background Podcast Loading**: Podcasts loaded via Google Sheets API
3. **AI Analysis Caching**: Fit analyses cached in database
4. **Progressive Enhancement**: Features activate as data loads

#### **Performance Optimizations**
- **Pagination**: 18 podcasts per page
- **Search Debouncing**: 300ms delay on search input
- **Image Lazy Loading**: Podcast images load on demand
- **Analysis Preloading**: Background AI analysis generation

#### **State Management**
```typescript
// Key state elements
interface DashboardState {
  // Data
  dashboard: ClientDashboard | null
  podcasts: OutreachPodcast[]
  feedbackMap: Map<string, PodcastFeedback>
  
  // UI State
  selectedPodcast: OutreachPodcast | null
  searchQuery: string
  currentPage: number
  sortBy: string
  filters: FilterState
  
  // AI Analysis
  analysisCache: Map<string, PodcastFitAnalysis>
  demographics: PodcastDemographics | null
  
  // Loading states
  loading: boolean
  isAnalyzing: boolean
  isSavingFeedback: boolean
}
```

---

## Client Portal

### Overview
**Main File**: `src/pages/portal/Dashboard.tsx`
**Layout**: `src/components/portal/PortalLayout.tsx`
**Resources**: `src/pages/portal/Resources.tsx`

Secure, authenticated portal for existing clients to manage their podcast booking journey.

### Portal Features

#### 1. **Dashboard Analytics**
**Comprehensive booking overview with multiple time ranges:**

```typescript
type TimeRange = 7 | 14 | 30 | 60 | 90 | 'all'

interface DashboardStats {
  totalAudienceReach: number      // Combined audience of all bookings
  publishedCount: number          // Successfully published episodes
  avgRating: number              // Average iTunes rating
  topPodcasts: Booking[]         // Highest reach podcasts
  statusDistribution: StatusPieChart[]  // Booking status breakdown
  upcomingRecordings: Booking[]   // Next 30 days
  goingLiveSoon: Booking[]       // Publishing soon
}
```

#### 2. **Booking Management**
**Complete lifecycle tracking:**

```typescript
interface Booking {
  // Basic Info
  id: string
  client_id: string
  podcast_name: string
  host_name: string | null
  
  // Status Tracking
  status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
  
  // Scheduling
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  
  // Podcast Details
  podcast_description: string | null
  audience_size: number | null
  itunes_rating: number | null
  episode_count: number | null
  episode_url: string | null
  
  // Metadata
  created_at: string
  updated_at: string
}
```

**Status Workflow:**
```
Conversation Started → In Progress → Booked → Recorded → Published
                                   ↓
                               Cancelled (any time)
```

#### 3. **Activity Timeline**
**Real-time feed of all client activities:**
- Podcast publications
- Recording completions
- Booking confirmations
- Outreach messages sent
- Conversation initiations

#### 4. **Premium Placement Marketplace**
**Browse and purchase podcast placements:**
- Featured podcast opportunities
- Audience size filtering
- Price range filtering
- Category-based browsing
- Direct cart integration

#### 5. **Outreach Management**
**Google Sheets integration for podcast discovery:**
- View curated podcast opportunities
- AI-powered fit analysis
- Demographic insights
- Bulk outreach to team
- Progress tracking

#### 6. **Guest Resources Hub**
**Comprehensive resource library:**

```typescript
interface GuestResource {
  id: string
  title: string
  description: string
  content: string | null       // HTML content for articles
  type: 'article' | 'video' | 'download' | 'link'
  category: 'preparation' | 'technical_setup' | 'best_practices' | 'promotion' | 'examples' | 'templates'
  featured: boolean
  url: string | null          // External links/videos
  file_url: string | null     // Download files
  created_at: string
}
```

**Categories:**
- **Preparation** - Interview prep and talking points
- **Technical Setup** - Recording equipment and software
- **Best Practices** - Proven strategies for success
- **Promotion** - Marketing your appearances
- **Examples** - Sample pitches and templates
- **Templates** - Ready-to-use materials

#### 7. **Addon Services Integration**
**Additional services clients can purchase:**
- Episode selection interfaces
- Service status tracking
- Booking-specific addons
- Purchase history

### Technical Architecture

#### **Data Fetching Strategy**
```typescript
// Primary data query combining all client data
const { data: clientData, isLoading } = useQuery({
  queryKey: ['client-bookings', client?.id],
  queryFn: () => getClientBookings(client!.id),
  enabled: !!client,
  staleTime: 0,
  refetchOnWindowFocus: true,
  refetchOnMount: true
})

// Data includes:
interface ClientPortalData {
  bookings: Booking[]              // All client bookings
  outreachMessages: OutreachMessage[]  // Sent outreach messages
}
```

#### **Real-time Features**
- **Auto-refresh** on window focus
- **Optimistic updates** for quick UI feedback
- **Background sync** for data consistency
- **Polling strategy** for time-sensitive data

#### **Chart & Analytics Integration**
**Using Recharts for data visualization:**
- Audience reach bar charts
- Booking status pie charts
- Timeline activity graphs
- Demographic breakdowns

---

## Database Schema

### Core Tables

#### `clients`
```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  first_invoice_paid_date DATE,
  status TEXT CHECK (status IN ('active', 'paused', 'churned')) DEFAULT 'active',
  notes TEXT,
  bio TEXT,
  photo_url TEXT,
  google_sheet_url TEXT,
  media_kit_url TEXT,
  prospect_dashboard_slug TEXT UNIQUE,
  outreach_webhook_url TEXT,
  bison_campaign_id TEXT,
  
  -- Portal Access Fields
  portal_access_enabled BOOLEAN DEFAULT FALSE,
  portal_password TEXT CHECK (portal_password IS NULL), -- retired
  portal_last_login_at TIMESTAMPTZ,
  portal_invitation_sent_at TIMESTAMPTZ,
  password_set_at TIMESTAMPTZ,
  password_set_by TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Password verifiers are stored separately in `client_portal_credentials`, which
is service-role-only and intentionally absent from frontend types.

#### `bookings`
```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT,
  podcast_name TEXT NOT NULL,
  host_name TEXT,
  podcast_description TEXT,
  audience_size INTEGER,
  itunes_rating DECIMAL(3,2),
  episode_count INTEGER,
  episode_url TEXT,
  
  -- Status & Scheduling
  status TEXT NOT NULL CHECK (status IN (
    'conversation_started',
    'in_progress', 
    'booked',
    'recorded',
    'published',
    'cancelled'
  )) DEFAULT 'conversation_started',
  scheduled_date TIMESTAMPTZ,
  recording_date TIMESTAMPTZ,
  publish_date TIMESTAMPTZ,
  
  -- Metadata
  booking_source TEXT,  -- 'outreach', 'premium', 'direct'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `client_podcast_feedback`
```sql
CREATE TABLE client_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, podcast_id)
);
```

#### `outreach_messages`
```sql
CREATE TABLE outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT,
  podcast_name TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### **Podcast Analytics Tables**

#### `client_dashboard_podcasts`
```sql
CREATE TABLE client_dashboard_podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_url TEXT,
  podcast_image_url TEXT,
  publisher_name TEXT,
  itunes_rating DECIMAL(3,2),
  episode_count INTEGER,
  audience_size INTEGER,
  last_posted_at TIMESTAMPTZ,
  
  -- AI Analysis Cache
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,  -- Array of {title, description} objects
  
  -- Demographics Cache
  demographics JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, podcast_id)
);
```

#### `podcast_fit_analyses`
```sql
CREATE TABLE podcast_fit_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  podcast_id TEXT,
  podcast_name TEXT,
  podcast_description TEXT,
  analysis TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, booking_id)
);
```

#### `guest_resources`
```sql
CREATE TABLE guest_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT,  -- HTML content for articles
  type TEXT NOT NULL CHECK (type IN ('article', 'video', 'download', 'link')),
  category TEXT NOT NULL CHECK (category IN (
    'preparation',
    'technical_setup', 
    'best_practices',
    'promotion',
    'examples',
    'templates'
  )),
  featured BOOLEAN DEFAULT FALSE,
  url TEXT,       -- External links/videos
  file_url TEXT,  -- Download files
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Edge Functions

### Authentication Functions

#### `send-portal-magic-link`
**File**: `supabase/functions/send-portal-magic-link/index.ts`

**Purpose**: Send magic link email for passwordless login

**Flow**:
1. Validate email format and client existence
2. Check if portal access enabled for client
3. Generate secure token (UUID + timestamp)
4. Store token in `client_portal_tokens` with 15-minute expiry
5. Send email via Resend/SendGrid with magic link
6. Log activity

**Security**:
- Token single-use enforcement
- Short expiration window
- Rate limiting per email
- Client portal access validation

#### `verify-portal-token`
**File**: `supabase/functions/verify-portal-token/index.ts`

**Purpose**: Verify magic link token and create session

**Flow**:
1. Validate token format and existence
2. Check token not already used
3. Verify token not expired
4. Validate client portal access still enabled
5. Mark token as used
6. Create new session (24-hour expiry)
7. Update client last login timestamp
8. Log successful login
9. Return session + client data

#### `validate-portal-session`
**File**: `supabase/functions/validate-portal-session/index.ts`

**Purpose**: Validate existing session tokens

**Flow**:
1. Find session by token
2. Check expiration
3. Update last_used_at timestamp
4. Return client data

#### `logout-portal-session`
**File**: `supabase/functions/logout-portal-session/index.ts`

**Purpose**: Invalidate session on logout

**Flow**:
1. Find session by token
2. Mark session as expired
3. Log logout activity

### Data Functions

#### `get-client-bookings`
**File**: `supabase/functions/get-client-bookings/index.ts`

**Purpose**: Fetch all client bookings and outreach data securely

**Authorization Strategy**:
```typescript
// Session-based auth for client portal
if (sessionToken) {
  const session = await validateSession(sessionToken)
  if (!session || session.client_id !== clientId) {
    return unauthorized()
  }
}
// Admin impersonation (no session token) allowed
```

**Data Returned**:
```typescript
interface Response {
  bookings: Booking[]              // All client bookings
  outreachMessages: OutreachMessage[]  // Enriched with podcast metadata
}
```

#### `get-client-podcasts`
**File**: `supabase/functions/get-client-podcasts/index.ts`

**Purpose**: Load podcast opportunities from Google Sheets

**Features**:
- Google Sheets API integration
- Podcast metadata enrichment
- AI analysis caching
- Demographics data integration

#### `analyze-podcast-fit`
**File**: `supabase/functions/analyze-podcast-fit/index.ts`

**Purpose**: Generate AI-powered fit analysis

**AI Analysis Output**:
```typescript
interface PodcastFitAnalysis {
  clean_description: string      // Enhanced podcast description
  fit_reasons: string[]          // Why it's a good fit
  pitch_angles: Array<{          // Suggested conversation topics
    title: string
    description: string
  }>
}
```

### Security Functions

#### `create-client-account`
**Purpose**: Admin function to enable portal access

#### `generate-client-bio` 
**Purpose**: AI-powered bio generation for clients

---

## Client Journey

### 1. **Discovery Phase**
```
Admin creates Google Sheet → Podcasts curated → AI analysis runs
→ Client receives approval dashboard link
```

### 2. **Approval Phase**
```
Client opens dashboard → Reviews podcasts → Uses AI insights 
→ Approves/rejects opportunities → Provides feedback notes
```

### 3. **Onboarding Phase**
```
Admin enables portal access → Sets password → Sends invitation
→ Client receives login credentials → First portal login
```

### 4. **Active Management Phase**
```
Portal dashboard access → Booking tracking → Resource access
→ Progress monitoring → Analytics review
```

### 5. **Ongoing Optimization**
```
Outreach management → Premium placements → Performance analytics
→ Resource utilization → Continuous improvement
```

---

## Security Implementation

### Authentication Security
1. **Token Security**:
   - Cryptographically secure UUID tokens
   - Single-use enforcement
   - Short expiration windows (15 minutes for magic links)
   - Automatic cleanup of expired tokens

2. **Session Security**:
   - 24-hour session expiry
   - Secure token generation
   - IP and User-Agent logging
   - Automatic session invalidation

3. **Password Security**:
   - bcrypt hashing (configurable rounds)
   - Strong password generation
   - Admin-controlled password setting
   - Password reset via magic links

### Data Access Control
1. **Row Level Security (RLS)**:
   - Client data isolation
   - Session-based access control
   - Admin override capabilities

2. **Edge Function Authorization**:
   - Session token validation
   - Client ID matching enforcement
   - Admin impersonation support
   - Activity logging

3. **API Security**:
   - Service role key protection
   - CORS headers management
   - Request validation
   - Error message sanitization

### Privacy Protection
1. **Data Minimization**:
   - Client-specific data filtering
   - Sensitive field exclusion
   - Metadata scrubbing

2. **Audit Trail**:
   - Complete activity logging
   - IP address tracking
   - Session lifecycle recording
   - Authentication attempt logging

---

## Analytics & Demographics

### Podcast Demographics Integration
**Service**: `src/services/podscan.ts`

**Data Structure**:
```typescript
interface PodcastDemographics {
  age: string                    // Primary age group
  gender_skew: string           // Gender distribution
  purchasing_power: string      // Economic segment
  education_level: string       // Education demographic
  engagement_level: string      // Audience engagement
  episodes_analyzed: number     // Data quality indicator
  
  // Detailed Breakdowns
  age_distribution: Array<{
    age: string
    percentage: number
  }>
  
  professional_industry: Array<{
    industry: string
    percentage: number
  }>
  
  geographic_distribution: Array<{
    region: string
    percentage: number
  }>
  
  living_environment: {
    urban: number
    suburban: number  
    rural: number
  }
  
  content_habits: {
    primary_platforms: string[]
    content_frequency: string
    preferred_formats: string[]
  }
  
  brand_relationship: {
    loyalty_level: string
    price_sensitivity: string
    brand_switching_frequency: string
    advocacy_potential: string
  }
  
  technology_adoption: {
    profile: string
    reasoning: string
  }
}
```

### Analytics Dashboard Features
1. **Audience Reach Calculation**:
   - Total cumulative audience across all bookings
   - Per-episode listener estimates
   - Geographic reach analysis

2. **Performance Metrics**:
   - Booking conversion rates
   - Status distribution analytics
   - Timeline progression tracking

3. **Demographic Insights**:
   - Visual charts using Recharts
   - Interactive audience breakdowns
   - Industry and geographic mapping

4. **Trend Analysis**:
   - Time-range filtering (7/14/30/60/90 days, all-time)
   - Growth trajectory visualization
   - Seasonal pattern identification

---

## Conclusion

The Client Dashboard system provides a comprehensive, secure, and user-friendly platform for managing podcast guest bookings. It combines powerful AI-driven insights, robust authentication, detailed analytics, and seamless user experiences to support the complete client journey from opportunity discovery through ongoing booking management.

The system's modular architecture, comprehensive security measures, and rich feature set make it a robust solution for scaling podcast guest placement services while maintaining high standards of data protection and user experience.
