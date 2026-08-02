# Database Schema Documentation

## Overview

This document describes the principal database structures for the getonapod-app podcast placement platform. The database is built on Supabase (PostgreSQL) with the **pgvector** extension enabled for vector similarity search. It spans client management, podcast discovery, booking systems, e-commerce, blog content, outreach automation, AI-powered podcast analysis, and analytics.

### Shared-database workspace model

GOAP uses one shared PostgreSQL database; it does **not** create a separate database for each user or workspace. Workspace-enabled records carry a `workspace_id` that references `public.workspaces`. Database constraints, service-only functions, and workspace-aware application services keep one workspace's records separate from another's.

Guest Resources follows this model explicitly. Private-workspace resources live in `workspace_guest_resources`, selected-client assignments include the same `workspace_id`, and composite foreign keys prevent an assignment from connecting a resource to a client in another workspace. The legacy `guest_resources` catalog remains the default-workspace/platform template source.

### Extensions
- **pgvector** (`vector`) — Enables vector similarity search for semantic podcast matching using OpenAI embeddings

## Core Business Entities

### 1. Clients Table
**Purpose**: Stores information about podcast placement clients

```sql
public.clients (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  first_invoice_paid_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  notes TEXT,
  
  -- Portal access fields
  portal_access_enabled BOOLEAN DEFAULT false,
  portal_last_login_at TIMESTAMPTZ,
  portal_invitation_sent_at TIMESTAMPTZ,
  
  -- Client media assets
  bio TEXT,
  photo_url TEXT,
  media_kit_url TEXT,
  google_sheet_url TEXT,
  prospect_dashboard_url TEXT,

  -- Client approval dashboard
  dashboard_slug TEXT UNIQUE,
  dashboard_tagline TEXT,
  dashboard_view_count INTEGER DEFAULT 0,
  dashboard_last_viewed_at TIMESTAMPTZ,
  show_pricing_section BOOLEAN DEFAULT true,

  -- Outreach integration
  outreach_webhook_url TEXT,
  bison_campaign_id TEXT, -- Bison Campaign ID for tracking outreach campaigns

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**:
- One-to-many with `bookings`
- One-to-many with `client_portal_*` tables
- One-to-many with `booking_addons`
- One-to-many with `client_dashboard_podcasts`
- One-to-many with `client_podcast_feedback`
- One-to-many with `client_podcast_analyses`
- One-to-many with `outreach_messages`
- One-to-many with `podcast_outreach_actions`

### 2. Bookings Table
**Purpose**: Tracks podcast bookings and their status throughout the lifecycle

```sql
public.bookings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Podcast information
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT,
  podcast_id TEXT, -- Podscan ID
  podcast_description TEXT,
  podcast_image_url TEXT,
  rss_url TEXT,
  
  -- Booking dates
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,
  
  -- Status tracking
  status TEXT DEFAULT 'booked' CHECK (status IN ('booked', 'in_progress', 'recorded', 'published', 'cancelled')),
  
  -- Podcast metadata
  itunes_rating DECIMAL(2,1),
  itunes_rating_count INTEGER,
  episode_count INTEGER,
  audience_size INTEGER,
  
  -- Additional details
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN DEFAULT false,
  hidden BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**:
- Many-to-one with `clients`
- One-to-many with `booking_addons`

### 3. Podcasts Table (Centralized Cache)
**Purpose**: Central repository for podcast data to reduce API calls to Podscan

```sql
public.podcasts (
  id UUID PRIMARY KEY,
  podscan_id TEXT UNIQUE NOT NULL,
  
  -- Basic information
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_guid TEXT,
  podcast_image_url TEXT,
  
  -- Publisher & Host
  publisher_name TEXT,
  host_name TEXT,
  
  -- Platform links
  podcast_url TEXT,
  podcast_itunes_id TEXT,
  podcast_spotify_id TEXT,
  rss_url TEXT,
  
  -- Categories & classification
  podcast_categories JSONB, -- [{category_id: string, category_name: string}]
  language TEXT, -- ISO code
  region TEXT, -- Country code
  
  -- Content metadata
  episode_count INTEGER,
  last_posted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  podcast_has_guests BOOLEAN,
  podcast_has_sponsors BOOLEAN,
  
  -- Ratings (iTunes)
  itunes_rating DECIMAL(3,2),
  itunes_rating_count INTEGER,
  itunes_rating_count_bracket TEXT,
  
  -- Ratings (Spotify)
  spotify_rating DECIMAL(3,2),
  spotify_rating_count INTEGER,
  spotify_rating_count_bracket TEXT,
  
  -- Audience metrics
  audience_size INTEGER,
  podcast_reach_score INTEGER,
  
  -- Contact information
  podscan_email TEXT, -- Contact email extracted from Podscan API (reach.email field)
  website TEXT,
  social_links JSONB, -- [{platform: string, url: string}]

  -- Demographics (full JSONB from Podscan)
  demographics JSONB,
  demographics_episodes_analyzed INTEGER,
  demographics_fetched_at TIMESTAMPTZ,

  -- Brand safety
  brand_safety_framework TEXT,
  brand_safety_risk_level TEXT,
  brand_safety_recommendation TEXT,

  -- Vector embedding for semantic search (pgvector)
  embedding vector(1536), -- OpenAI text-embedding-3-small
  embedding_generated_at TIMESTAMPTZ,
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  embedding_text_length INTEGER,

  -- Cache management
  podscan_last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  podscan_fetch_count INTEGER DEFAULT 1,
  cache_hit_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Key Features**:
- Deduplicates podcast data across the platform (60-80% API call savings)
- Tracks cache hit statistics
- Full demographics and brand safety data from Podscan
- Vector embeddings enable semantic similarity search via pgvector (ivfflat index with cosine distance)

## E-commerce Tables

### 4. Customers Table
**Purpose**: E-commerce customers (separate from clients)

```sql
public.customers (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 5. Orders Table
**Purpose**: E-commerce orders with Stripe integration

```sql
public.orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Stripe payment data
  stripe_checkout_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  
  -- Order details
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
  currency TEXT DEFAULT 'usd',
  
  -- Customer snapshot
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
)
```

### 6. Order Items Table
**Purpose**: Line items for orders

```sql
public.order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  premium_podcast_id UUID NOT NULL REFERENCES premium_podcasts(id),
  
  -- Item snapshot at purchase
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  price_at_purchase DECIMAL(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 7. Premium Podcasts Table
**Purpose**: Curated premium podcast placements for purchase

```sql
public.premium_podcasts (
  id UUID PRIMARY KEY,
  podscan_id TEXT UNIQUE NOT NULL,
  podcast_name TEXT NOT NULL,
  podcast_image_url TEXT,
  audience_size TEXT,
  episode_count TEXT,
  rating TEXT,
  reach_score TEXT,
  why_this_show TEXT,
  whats_included TEXT[] DEFAULT '{}',
  price TEXT NOT NULL,
  my_cost TEXT, -- Internal cost tracking
  category TEXT,
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
)
```

## Add-on Services System

### 8. Addon Services Table
**Purpose**: Catalog of available add-on services (clips, transcription, etc.)

```sql
public.addon_services (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  short_description TEXT,
  price_cents INTEGER NOT NULL,
  stripe_product_id TEXT UNIQUE,
  stripe_price_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true,
  features JSONB DEFAULT '[]',
  delivery_days INTEGER DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 9. Booking Addons Table
**Purpose**: Track addon service purchases per booking

```sql
public.booking_addons (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES addon_services(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Payment info
  stripe_payment_intent_id TEXT UNIQUE,
  amount_paid_cents INTEGER NOT NULL,
  
  -- Fulfillment
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'delivered', 'cancelled')),
  google_drive_url TEXT,
  admin_notes TEXT,
  
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 10. Client Podcast Bookings Table
**Purpose**: Calendar/booking relationship table linking clients to podcasts with scheduling information

```sql
public.client_podcast_bookings (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE RESTRICT,

  -- Scheduling information
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'recorded', 'published', 'cancelled')),

  -- Additional details
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**:
- Many-to-one with `clients`
- Many-to-one with `podcasts`

## Blog & Content System

### 11. Blog Categories Table
**Purpose**: Categories for organizing blog posts

```sql
public.blog_categories (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 12. Blog Posts Table
**Purpose**: Blog content with SEO features

```sql
public.blog_posts (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  featured_image_url TEXT,
  featured_image_alt TEXT,
  
  -- SEO fields
  focus_keyword TEXT,
  schema_markup JSONB,
  
  -- Taxonomy
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  
  -- Publishing
  status TEXT CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  
  -- Analytics
  view_count INTEGER DEFAULT 0,
  read_time_minutes INTEGER DEFAULT 5,
  read_status TEXT DEFAULT 'unread',
  
  -- Google Indexing tracking
  submitted_to_google_at TIMESTAMPTZ,
  indexed_by_google_at TIMESTAMPTZ,
  google_indexing_status TEXT,
  
  author_name TEXT DEFAULT 'Get On A Pod Team',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
)
```

### 13. Blog Indexing Log Table
**Purpose**: Track Google Indexing API submissions

```sql
public.blog_indexing_log (
  id UUID PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  service TEXT NOT NULL, -- 'google'
  action TEXT NOT NULL, -- 'submit', 'update', 'check_status'
  status TEXT NOT NULL, -- 'success', 'failed', 'pending'
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Client Portal System

### 14. Client Portal Tokens Table
**Purpose**: One-time magic link tokens for passwordless authentication

```sql
public.client_portal_tokens (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  
  CONSTRAINT token_not_expired CHECK (expires_at > created_at)
)
```

### 15. Client Portal Sessions Table
**Purpose**: Active client sessions after successful authentication

```sql
public.client_portal_sessions (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  
  CONSTRAINT session_not_expired CHECK (expires_at > created_at)
)
```

### 16. Client Portal Activity Log Table
**Purpose**: Comprehensive audit log of client portal activity

```sql
public.client_portal_activity_log (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES client_portal_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'request_magic_link', 'login_success', 'logout', etc.
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Prospect & Lead Management

### 17. Prospect Dashboards Table
**Purpose**: Shareable dashboard links for prospects

```sql
public.prospect_dashboards (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  first_name TEXT,
  prospect_image_url TEXT,

  -- Structured prospect fields (for richer embedding generation)
  prospect_industry TEXT,
  prospect_expertise TEXT[],
  prospect_topics TEXT[],
  prospect_target_audience TEXT,
  prospect_company TEXT,
  prospect_title TEXT,

  -- Spreadsheet integration
  spreadsheet_id TEXT,
  spreadsheet_url TEXT,

  -- Video & media
  loom_video_url TEXT,
  heygen_video_url TEXT,
  background_video_url TEXT,

  -- Social proof
  testimonials JSONB DEFAULT '[]',

  -- Display controls
  content_ready BOOLEAN DEFAULT false,
  show_pricing_section BOOLEAN DEFAULT true,
  personalized_tagline TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
)
```

### 18. Prospect Dashboard Podcasts Cache Table
**Purpose**: Cache podcast data for prospect dashboards

```sql
public.prospect_dashboard_podcasts (
  id UUID PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL, -- Podscan ID
  podcast_name TEXT,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating DECIMAL,
  episode_count INTEGER,
  audience_size INTEGER,
  podcast_categories JSONB,
  last_posted_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 19. Prospect Podcast Feedback Table
**Purpose**: Prospect approval/rejection of individual podcasts with optional notes

```sql
public.prospect_podcast_feedback (
  id UUID PRIMARY KEY,
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL, -- Podscan podcast ID
  status TEXT CHECK (status IN ('approved', 'rejected')), -- null means not reviewed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(prospect_dashboard_id, podcast_id)
)
```

**Relationships**:
- Many-to-one with `prospect_dashboards`

## Analytics & Tracking

### 20. Podcast Fit Analyses Table
**Purpose**: Cache AI-generated podcast fit analyses

```sql
public.podcast_fit_analyses (
  id UUID PRIMARY KEY,
  podcast_id TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  clean_description TEXT,
  fit_reasons JSONB DEFAULT '[]',
  pitch_angles JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(podcast_id, client_id)
)
```

### 21. Podcast Fit Analysis Cache Table
**Purpose**: General-purpose cache for podcast fitness analyses

```sql
public.podcast_fit_analysis_cache (
  id UUID PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  analysis_result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 22. Campaign Replies Table
**Purpose**: Track email campaign responses

```sql
public.campaign_replies (
  id UUID PRIMARY KEY,
  bison_reply_id TEXT UNIQUE,
  campaign_id TEXT,
  sender_email TEXT,
  sender_name TEXT,
  subject TEXT,
  content TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

## Email & Communication

### 23. Email Logs Table
**Purpose**: Track all email delivery via Resend

```sql
public.email_logs (
  id UUID PRIMARY KEY,
  resend_email_id TEXT UNIQUE,
  email_type TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'complained', 'failed')),
  bounce_type TEXT,
  complaint_type TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 24. Email Bounces Table
**Purpose**: Email suppression list for bounced addresses

```sql
public.email_bounces (
  id UUID PRIMARY KEY,
  email_address TEXT UNIQUE NOT NULL,
  bounce_type TEXT NOT NULL,
  bounce_count INTEGER DEFAULT 1,
  first_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  last_bounced_at TIMESTAMPTZ DEFAULT NOW(),
  suppressed BOOLEAN DEFAULT false,
  suppressed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 25. Podcast Emails Table
**Purpose**: Store podcast contact emails

```sql
public.podcast_emails (
  id UUID PRIMARY KEY,
  podcast_id TEXT NOT NULL,
  email TEXT NOT NULL,
  source TEXT, -- 'manual', 'scraped', 'podscan'
  verified BOOLEAN DEFAULT false,
  bounced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(podcast_id, email)
)
```

## Outreach & Messaging

### 26. Outreach Messages Table
**Purpose**: Queue for outreach emails from Clay automation to be reviewed and sent via approval workflow

```sql
public.outreach_messages (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Podcast/Host Information
  podcast_id TEXT,
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT NOT NULL,
  host_email TEXT NOT NULL,

  -- Email Content
  subject_line TEXT NOT NULL,
  email_body TEXT NOT NULL,

  -- Campaign Tracking
  bison_campaign_id TEXT,
  personalization_data JSONB,

  -- Status Management
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'sent', 'failed', 'archived')),
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),

  -- Sending
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  email_platform_response JSONB,
  error_message TEXT,

  -- Metadata
  created_by TEXT DEFAULT 'clay',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Status Flow**: `pending_review` -> `approved` -> `sent` (or `failed` / `archived`)

### 27. Podcast Outreach Actions Table
**Purpose**: Tracks outreach sent/skipped per podcast per client

```sql
public.podcast_outreach_actions (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('sent', 'skipped')),
  webhook_sent_at TIMESTAMPTZ,
  webhook_response_status INTEGER,
  webhook_response_body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast_outreach UNIQUE (client_id, podcast_id)
)
```

### 28. Sales Calls Table
**Purpose**: Track sales calls and their outcomes

```sql
public.sales_calls (
  id UUID PRIMARY KEY,
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_linkedin TEXT,
  contact_company TEXT,
  call_date TIMESTAMPTZ,
  call_duration_minutes INTEGER,
  call_type TEXT DEFAULT 'discovery' CHECK (call_type IN ('discovery', 'demo', 'closing', 'onboarding')),
  outcome TEXT,
  notes TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  deal_value_estimate INTEGER,
  hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 29. Sales Call Analysis Table
**Purpose**: AI-generated analysis scores and insights for sales calls

```sql
public.sales_call_analysis (
  id UUID PRIMARY KEY,
  sales_call_id UUID REFERENCES sales_calls(id) ON DELETE CASCADE,
  overall_score DECIMAL(3,1) CHECK (overall_score >= 0 AND overall_score <= 10),
  discovery_score DECIMAL(3,1) CHECK (discovery_score >= 0 AND discovery_score <= 10),
  objection_handling_score DECIMAL(3,1) CHECK (objection_handling_score >= 0 AND objection_handling_score <= 10),
  closing_score DECIMAL(3,1) CHECK (closing_score >= 0 AND closing_score <= 10),
  engagement_score DECIMAL(3,1) CHECK (engagement_score >= 0 AND engagement_score <= 10),
  talk_listen_ratio_talk INTEGER,
  talk_listen_ratio_listen INTEGER,
  questions_asked_count INTEGER,
  recommendations JSONB,
  strengths JSONB,
  weaknesses JSONB,
  key_moments JSONB,
  sentiment_analysis JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

**Relationships**:
- Many-to-one with `sales_calls`

## Administrative Tables

### 30. Admin Users Table
**Purpose**: Manage admin access to the platform

```sql
public.admin_users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 31. Sync History Table
**Purpose**: Track data synchronization operations

```sql
public.sync_history (
  id UUID PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  error_details TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
)
```

## Guest Resources

### 32. Platform Guest Resources Table

**Purpose**: Default-workspace resource catalog and seed templates for private workspaces

```sql
public.guest_resources (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT, -- Canonical safe HTML for articles
  category resource_category NOT NULL,
  type resource_type NOT NULL,

  -- Type-specific fields
  url TEXT, -- Safe HTTP(S) URL for videos or external links
  file_url TEXT, -- Safe HTTP(S) URL for downloadable content

  -- Metadata
  featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

The workspace migration normalizes and validates this catalog before using it as a template source. Existing private workspaces receive a one-time snapshot during migration, and a new private workspace receives a snapshot when it is created. Later edits to the platform catalog do not live-sync into existing workspace copies.

`file_url` stores a URL only. This schema does not provide a Guest Resources upload or file-management subsystem.

**Custom Types**:
- `resource_type`: `'article'`, `'video'`, `'download'`, `'link'`
- `resource_category`: `'preparation'`, `'technical_setup'`, `'best_practices'`, `'promotion'`, `'examples'`, `'templates'`

### 33. Guest Resource Views Table

**Purpose**: Legacy view records associated with the platform `guest_resources` catalog

```sql
public.guest_resource_views (
  id UUID PRIMARY KEY,
  resource_id UUID REFERENCES guest_resources(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
)
```

The workspace-aware `/portal/resources` path does not write this table and does not currently expose workspace Guest Resources analytics.

### Private-workspace Guest Resource Tables

These three tables implement customizable Guest Resources for tenant workspaces inside the shared database.

#### `workspace_guest_resources`

Stores the workspace-owned resource snapshot and its publishing controls:

```sql
public.workspace_guest_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT,
  category resource_category NOT NULL,
  type resource_type NOT NULL,
  url TEXT,
  file_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  visibility TEXT NOT NULL DEFAULT 'all_clients'
    CHECK (visibility IN ('all_clients', 'selected_clients')),
  source_template_id UUID REFERENCES guest_resources(id) ON DELETE SET NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
)
```

Published articles require meaningful canonical HTML. Published videos and links require `url`; published downloads require `file_url`. A workspace copy keeps `source_template_id` for provenance, but its content is independent after cloning.

#### `workspace_guest_resource_clients`

Stores selected-client visibility assignments:

```sql
public.workspace_guest_resource_clients (
  workspace_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, client_id),
  FOREIGN KEY (resource_id, workspace_id)
    REFERENCES workspace_guest_resources(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (client_id, workspace_id)
    REFERENCES clients(id, workspace_id) ON DELETE CASCADE
)
```

The composite foreign keys make cross-workspace resource/client assignments invalid at the database boundary.

#### `workspace_guest_resource_quota_counters`

Provides a serialized counter row for each workspace:

```sql
public.workspace_guest_resource_quota_counters (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  resource_count INTEGER NOT NULL DEFAULT 0 CHECK (resource_count BETWEEN 0 AND 1000),
  content_char_count BIGINT NOT NULL DEFAULT 0
    CHECK (content_char_count BETWEEN 0 AND 5000000)
)
```

Triggers update the counter atomically as resource rows change, enforcing at most 1,000 resources and 5,000,000 stored content characters per workspace. The default workspace's counter tracks the platform catalog; private counters track their respective workspace tables.

### Guest Resource service RPCs

- `workspace_guest_resource_operation_v1(...)` is executable only by `service_role`. It supports `list`, `create`, `update`, and `delete`, binds the supplied actor to a current fresh Auth context, replaces selected-client assignments atomically, and writes mutation events to `workspace_audit_log`. Workspace owners/admins can manage their own workspace; the platform owner can manage an explicitly selected active private workspace without receiving a tenant membership.
- `portal_guest_resources_for_client_v1(...)` is executable only by `service_role`. It derives the workspace from the client, revalidates the exact hashed portal session inside the read transaction (or accepts the service-only platform-admin preview branch), and returns only published resources visible to that client. For private workspaces, visibility is either `all_clients` or a matching row in `workspace_guest_resource_clients`; default-workspace clients retain the platform catalog.

The workspace resource and assignment tables use forced RLS with service-role-only policies. Browser roles do not query them directly. The portal RPC projects only client-facing fields and does not return `workspace_id`, status, visibility rules, assignment IDs, actor IDs, or template provenance.

## Client Podcast Approval Dashboard

### 34. Client Dashboard Podcasts Table
**Purpose**: Cache of podcasts from a client's Google Sheet for the approval dashboard

```sql
public.client_dashboard_podcasts (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating DECIMAL(3,2),
  episode_count INTEGER,
  audience_size INTEGER,
  last_posted_at TIMESTAMPTZ,

  -- Cached AI analysis
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  -- Cached demographics
  demographics JSONB,
  demographics_fetched_at TIMESTAMPTZ,

  -- Categories
  podcast_categories JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast UNIQUE (client_id, podcast_id)
)
```

### 35. Client Podcast Feedback Table
**Purpose**: Client approval/rejection of individual podcasts before outreach

```sql
public.client_podcast_feedback (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast_feedback UNIQUE (client_id, podcast_id)
)
```

## AI Podcast Analysis

### 36. Client Podcast Analyses Table
**Purpose**: Client-specific AI analysis of podcasts (based on client bio), separated from universal podcast metadata

```sql
public.client_podcast_analyses (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Client-Specific)
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast_analysis UNIQUE (client_id, podcast_id)
)
```

### 37. Prospect Podcast Analyses Table
**Purpose**: Prospect-specific AI analysis of podcasts (based on prospect bio)

```sql
public.prospect_podcast_analyses (
  id UUID PRIMARY KEY,
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Prospect-Specific)
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_prospect_podcast_analysis UNIQUE (prospect_dashboard_id, podcast_id)
)
```

## Entity Relationship Summary

### Core Business Flow
1. **Clients** book podcast placements -> **Bookings**
2. **Bookings** can have **Booking Addons** (additional services)
3. **Podcasts** table serves as central cache for podcast data with vector embeddings
4. **Premium Podcasts** are available for e-commerce purchase by **Customers**
5. **Prospect Dashboards** showcase potential placements to prospects

### Podcast Approval & Outreach
1. **Client Dashboard Podcasts** cache podcast data from the client's Google Sheet
2. **Client Podcast Feedback** records client approval/rejection of individual podcasts
3. **Podcast Outreach Actions** tracks whether outreach was sent or skipped per podcast
4. **Outreach Messages** queues emails for approval before sending
5. **Client Podcast Analyses** and **Prospect Podcast Analyses** store AI-generated fit analyses

### Content & Communication
1. **Blog Posts** are categorized by **Blog Categories**
2. **Email Logs** track all outbound communication
3. **Guest Resources** provide a platform template catalog plus independent, `workspace_id`-scoped copies that can target all clients or selected clients
4. **Sales Calls** track business development activities

### Authentication & Security
1. **Admin Users** manage the platform
2. **Client Portal Tokens/Sessions** enable passwordless client access
3. All activity is logged in **Client Portal Activity Log**
4. Workspace Guest Resource mutations are audited in **Workspace Audit Log**

## Key Database Functions

### Helper Functions

1. **`is_podcast_stale()`** - Check if podcast cache is stale (configurable stale_days parameter, default 7)
2. **`upsert_podcast()`** - Insert or update podcast data (accepts JSONB, handles ON CONFLICT)
3. **`increment_podcast_cache_hit()`** - Track single podcast cache usage
4. **`batch_increment_podcast_cache_hits()`** - Batch increment cache hit counts for multiple podcasts in a single UPDATE
5. **`cleanup_expired_portal_data()`** - Clean expired tokens/sessions
6. **`get_client_portal_stats()`** - Portal usage statistics
7. **`search_similar_podcasts()`** - Vector similarity search using pgvector cosine distance; pre-filters for guest acceptance, activity recency, and exclusion lists; returns top N matches above a similarity threshold
8. **`generate_client_dashboard_slug()`** - Trigger function that auto-generates URL slugs from client names (handles duplicates with random suffix)
9. **`auto_increment_fetch_count()`** - Trigger function that auto-increments `podscan_fetch_count` when `podscan_last_fetched_at` is updated
10. **`workspace_guest_resource_operation_v1()`** - Service-only, membership-gated workspace resource operations and audit logging
11. **`portal_guest_resources_for_client_v1()`** - Service-only client-derived Guest Resources projection with portal-session revalidation

### Trigger Functions (updated_at)

These trigger functions auto-update the `updated_at` column on row changes:

1. **`update_updated_at_column()`** - Generic updated_at trigger
2. **`update_podcasts_updated_at()`** - For `podcasts` table
3. **`update_outreach_messages_updated_at()`** - For `outreach_messages` table
4. **`update_client_podcast_analyses_updated_at()`** - For `client_podcast_analyses` table
5. **`update_prospect_podcast_analyses_updated_at()`** - For `prospect_podcast_analyses` table

### Views

1. **`client_overview`** - Client summary with booking counts
2. **`calendar_view`** - Monthly booking breakdown
3. **`daily_bookings`** - Daily booking schedule
4. **`podcast_cache_statistics`** - Cache performance metrics (total podcasts, email/demographics coverage, cache hits, API calls saved)
5. **`client_podcasts_with_analyses`** - Joins `podcasts` with `client_podcast_analyses` for easy access to client-specific AI analysis alongside podcast data
6. **`prospect_podcasts_with_analyses`** - Joins `podcasts` with `prospect_podcast_analyses` for easy access to prospect-specific AI analysis alongside podcast data
7. **`podcast_cache_statistics_detailed`** - Extended cache stats with coverage percentages, efficiency metrics, and estimated cost savings
8. **`podcast_growth_stats`** - Tracks podcast additions over time (daily, weekly, monthly)
9. **`top_cached_podcasts`** - Top 20 most frequently reused podcasts from cache
10. **`recently_added_podcasts`** - Last 20 podcasts added to the database
11. **`podcast_category_stats`** - Category distribution and average audience metrics
12. **`podcast_audience_distribution`** - Distribution of podcasts by audience size brackets
13. **`podcast_rating_distribution`** - Distribution of podcasts by iTunes rating

## Row Level Security (RLS) Policies

### Access Patterns

1. **Admin Access**: Full CRUD access for authenticated admin users
2. **Client Portal Access**: Clients can only access their own data via portal sessions
3. **Public Access**: Published blog posts, active premium podcasts, prospect dashboards
4. **Service Role**: Edge functions have elevated access for automation
5. **Workspace Guest Resources**: Browser roles have no direct table access; authenticated operations and portal reads cross service-only Edge Function/RPC boundaries

### Security Context

- Client portal access uses `current_setting('app.current_client_id', true)` 
- Admin access verified via `admin_users` table lookup
- Public data filtered by `is_active` or `status = 'published'` flags

## Storage Buckets

### Client Assets Bucket
- **Purpose**: Store client photos, media kits, and other assets
- **Policies**: Authenticated users (admins) can upload, public read access

### Prospect Images Bucket  
- **Purpose**: Store prospect dashboard images
- **Policies**: Public read access, admin upload access

## Performance Optimizations

### Indexing Strategy
- Unique indexes on all external IDs (Stripe, Podscan)
- Composite indexes on common query patterns (client_id + date, client_id + podcast_id)
- JSONB GIN indexes for metadata searches (categories, demographics)
- Partial indexes on filtered queries (active records only, guest-accepting podcasts)
- **IVFFlat vector index** on `podcasts.embedding` for fast cosine similarity search (lists = 100)

### Caching Strategy
- Central `podcasts` table reduces API calls by 60-80%
- Cache hit tracking for analytics (single and batch increment functions)
- Stale data detection and refresh mechanisms
- `client_dashboard_podcasts` caches per-client podcast data including AI analyses and demographics

## Migration History
The database evolved through 75+ migration files from 2025-01-07 to 2026-03-18, indicating active development and iterative improvements to the schema.
