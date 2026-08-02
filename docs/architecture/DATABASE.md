# Get On A Pod Database Architecture

> **Invite-only MVP warning:** this is a historical schema survey. The six
> `20260720*` migrations, SQL verifier, root README, and
> `docs/invite-only-mvp.md` define the release boundary. Magic-link and
> plaintext portal authentication described below are retired.

## Overview

Get On A Pod uses Supabase (PostgreSQL) as its primary database with a comprehensive system for managing podcast placements, client relationships, content creation, and sales operations. The database is designed around several core domains:

- **Client Management & Portal**: Client accounts, authentication, and portal access
- **Podcast Management**: Centralized podcast database with caching and AI analysis
- **Booking & Calendar System**: Podcast appearance scheduling and tracking
- **Content & Blog Management**: SEO-optimized blog system with automated indexing
- **E-commerce**: Customer orders and payments via Stripe
- **Sales & Analytics**: Call tracking, outreach management, and performance analytics

---

## Core Tables & Relationships

### 1. CLIENT MANAGEMENT

#### `clients`
Primary client management table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Client company/person name |
| `email` | TEXT | Primary contact email |
| `linkedin_url` | TEXT | LinkedIn profile |
| `website` | TEXT | Client website |
| `calendar_link` | TEXT | Calendly/booking link |
| `contact_person` | TEXT | Contact person name |
| `first_invoice_paid_date` | DATE | First payment date |
| `status` | TEXT | `active`, `paused`, `churned` |
| `notes` | TEXT | Internal notes |
| `bio` | TEXT | Client background/bio |
| `photo_url` | TEXT | Profile image |
| `personalized_tagline` | TEXT | Custom tagline |
| `content_ready` | BOOLEAN | Ready for content creation |
| `portal_access_enabled` | BOOLEAN | Can access client portal |
| `portal_last_login_at` | TIMESTAMPTZ | Last portal login |
| `portal_invitation_sent_at` | TIMESTAMPTZ | Portal invite timestamp |
| `portal_password` | TEXT | Retired compatibility column; constrained to `NULL` |
| `google_sheet_url` | TEXT | Associated Google Sheet |
| `prospect_dashboard` | BOOLEAN | Has prospect dashboard |
| `media_kit_url` | TEXT | Media kit URL |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

**Relationships:**
- One-to-many with `client_podcast_bookings` (bookings)
- One-to-many with `client_portal_sessions` (sessions)
- One-to-many with `client_portal_activity_log` (activity)

#### `admin_users`
Administrative user management.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | TEXT | Admin email (UNIQUE) |
| `name` | TEXT | Admin name |
| `added_by` | TEXT | Who added this admin |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

**RLS Policies:**
- Only authenticated users can read
- Only service role can insert/update/delete

---

### 2. CLIENT PORTAL AUTHENTICATION

#### `client_portal_tokens`
One-time magic link tokens for passwordless auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | References `clients.id` |
| `token` | TEXT | Unique secure token |
| `expires_at` | TIMESTAMPTZ | Token expiration (15 min) |
| `used_at` | TIMESTAMPTZ | When consumed |
| `ip_address` | TEXT | Request IP |
| `user_agent` | TEXT | Browser info |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `client_portal_sessions`
Active client sessions (24-hour expiry).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | References `clients.id` |
| `session_token` | TEXT | Unique session ID |
| `expires_at` | TIMESTAMPTZ | Session expiration |
| `last_active_at` | TIMESTAMPTZ | Last activity |
| `ip_address` | TEXT | Request IP |
| `user_agent` | TEXT | Browser info |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `client_portal_activity_log`
Audit trail for all portal actions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | References `clients.id` |
| `session_id` | UUID | References `client_portal_sessions.id` |
| `action` | TEXT | Action type (login, logout, etc.) |
| `metadata` | JSONB | Additional context |
| `ip_address` | TEXT | Request IP |
| `user_agent` | TEXT | Browser info |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### 3. PODCAST MANAGEMENT

#### `podcasts` (Central Cache)
**The heart of the system** - centralized podcast database serving all clients and prospects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `podscan_id` | TEXT | Podscan API ID (UNIQUE) |
| `podcast_name` | TEXT | Podcast title |
| `podcast_description` | TEXT | Description |
| `podcast_guid` | TEXT | RSS GUID |
| `podcast_image_url` | TEXT | Cover art URL |
| `publisher_name` | TEXT | Publisher/Network |
| `host_name` | TEXT | Host name |
| `podcast_url` | TEXT | Main website |
| `podcast_itunes_id` | TEXT | iTunes ID |
| `podcast_spotify_id` | TEXT | Spotify ID |
| `rss_url` | TEXT | RSS feed URL |
| `podcast_categories` | JSONB | Category array |
| `language` | TEXT | ISO language code |
| `region` | TEXT | Country code |
| `episode_count` | INTEGER | Number of episodes |
| `last_posted_at` | TIMESTAMPTZ | Last episode date |
| `is_active` | BOOLEAN | Currently active |
| `podcast_has_guests` | BOOLEAN | Accepts guests |
| `podcast_has_sponsors` | BOOLEAN | Has sponsorships |
| `itunes_rating` | DECIMAL(3,2) | iTunes rating |
| `itunes_rating_count` | INTEGER | iTunes review count |
| `itunes_rating_count_bracket` | TEXT | Rating bracket |
| `spotify_rating` | DECIMAL(3,2) | Spotify rating |
| `spotify_rating_count` | INTEGER | Spotify review count |
| `spotify_rating_count_bracket` | TEXT | Rating bracket |
| `audience_size` | INTEGER | Estimated audience |
| `podcast_reach_score` | INTEGER | Reach score |
| `email` | TEXT | Contact email |
| `website` | TEXT | Website |
| `social_links` | JSONB | Social media links |
| `demographics` | JSONB | Full demographics data |
| `demographics_episodes_analyzed` | INTEGER | Episodes analyzed |
| `demographics_fetched_at` | TIMESTAMPTZ | When demographics fetched |
| `brand_safety_framework` | TEXT | Brand safety info |
| `brand_safety_risk_level` | TEXT | Risk level |
| `brand_safety_recommendation` | TEXT | Safety recommendation |
| `podscan_last_fetched_at` | TIMESTAMPTZ | Last API fetch |
| `podscan_fetch_count` | INTEGER | Total fetches |
| `cache_hit_count` | INTEGER | Cache reuse count |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

**Key Features:**
- **Deduplication**: Saves 60-80% on Podscan API calls
- **Universal Cache**: Shared across all clients and prospects
- **Rich Metadata**: Demographics, ratings, audience size
- **Performance Optimized**: Multiple indexes for fast queries

#### `premium_podcasts`
Curated premium podcasts for sale.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Podcast name |
| `description` | TEXT | Description |
| `image_url` | TEXT | Image URL |
| `price` | DECIMAL(10,2) | Price |
| `my_cost` | DECIMAL(10,2) | Internal cost |
| `category` | TEXT | Category |
| `is_active` | BOOLEAN | Available for purchase |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

---

### 4. BOOKING & CALENDAR SYSTEM

#### `client_podcast_bookings` (was `bookings`)
The main calendar/scheduling table.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | References `clients.id` |
| `podcast_id` | UUID | References `podcasts.id` |
| `scheduled_date` | DATE | Booking date |
| `recording_date` | DATE | Actual recording date |
| `publish_date` | DATE | Episode publish date |
| `status` | TEXT | `scheduled`, `recorded`, `published`, `cancelled` |
| `episode_url` | TEXT | Published episode URL |
| `notes` | TEXT | Booking notes |
| `prep_sent` | BOOLEAN | Prep materials sent |
| `podcast_description` | TEXT | Snapshot description |
| `itunes_rating` | DECIMAL(3,2) | Rating at booking time |
| `itunes_rating_count` | INTEGER | Review count |
| `episode_count` | INTEGER | Episodes at booking time |
| `audience_size` | INTEGER | Audience size |
| `podcast_image_url` | TEXT | Image URL |
| `rss_url` | TEXT | RSS feed |
| `call_type` | TEXT | Call type |
| `hidden` | BOOLEAN | Hide from view |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

**Views:**
- `client_monthly_bookings`: Monthly breakdown per client
- `booking_details`: Complete booking info with client and podcast details

---

### 5. PROSPECT MANAGEMENT

#### `prospect_dashboards`
Shareable prospect dashboard links.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `slug` | TEXT | URL slug (UNIQUE) |
| `prospect_name` | TEXT | Prospect name |
| `first_name` | TEXT | First name |
| `prospect_bio` | TEXT | Prospect background |
| `prospect_image` | TEXT | Profile image |
| `spreadsheet_id` | TEXT | Google Sheet ID |
| `spreadsheet_url` | TEXT | Google Sheet URL |
| `loom_video_url` | TEXT | Loom video URL |
| `testimonials` | JSONB | Testimonial data |
| `background_video_url` | TEXT | Background video |
| `heygen_video_url` | TEXT | HeyGen video |
| `show_pricing_section` | BOOLEAN | Show pricing |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `created_by` | UUID | References `auth.users.id` |
| `is_active` | BOOLEAN | Dashboard active |
| `view_count` | INTEGER | View counter |
| `last_viewed_at` | TIMESTAMPTZ | Last viewed |

#### `prospect_dashboard_podcasts`
**DEPRECATED** - Replaced by centralized `podcasts` table.

#### `prospect_podcast_analyses`
Prospect-specific AI analyses linking to central podcasts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `prospect_dashboard_id` | UUID | References `prospect_dashboards.id` |
| `podcast_id` | UUID | References `podcasts.id` |
| `ai_clean_description` | TEXT | AI-generated description |
| `ai_fit_reasons` | TEXT[] | Why podcast fits |
| `ai_pitch_angles` | JSONB | Pitch angle suggestions |
| `ai_analyzed_at` | TIMESTAMPTZ | When AI analyzed |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `prospect_podcast_feedback`
Feedback on podcast suggestions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `prospect_dashboard_id` | UUID | References `prospect_dashboards.id` |
| `podcast_id` | UUID | References `podcasts.id` |
| `feedback_type` | TEXT | `thumbs_up`, `thumbs_down`, `interested` |
| `notes` | TEXT | Feedback notes |
| `podcast_name` | TEXT | Podcast name snapshot |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### 6. BLOG SYSTEM

#### `blog_categories`
Blog category taxonomy.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Category name (UNIQUE) |
| `slug` | TEXT | URL slug (UNIQUE) |
| `description` | TEXT | Category description |
| `display_order` | INTEGER | Sort order |
| `is_active` | BOOLEAN | Category active |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `blog_posts`
Main blog content with SEO optimization.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `slug` | TEXT | URL slug (UNIQUE) |
| `title` | TEXT | Post title |
| `meta_description` | TEXT | SEO meta description |
| `content` | TEXT | Rich HTML content |
| `excerpt` | TEXT | Post excerpt |
| `featured_image_url` | TEXT | Featured image |
| `featured_image_alt` | TEXT | Alt text |
| `focus_keyword` | TEXT | SEO focus keyword |
| `schema_markup` | JSONB | JSON-LD structured data |
| `category_id` | UUID | References `blog_categories.id` |
| `tags` | TEXT[] | Post tags |
| `status` | TEXT | `draft`, `published` |
| `published_at` | TIMESTAMPTZ | Publish timestamp |
| `view_count` | INTEGER | View counter |
| `read_time_minutes` | INTEGER | Estimated read time |
| `submitted_to_google_at` | TIMESTAMPTZ | Google indexing submission |
| `indexed_by_google_at` | TIMESTAMPTZ | When indexed |
| `google_indexing_status` | TEXT | Indexing status |
| `author_name` | TEXT | Author name |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |
| `created_by` | UUID | References `auth.users.id` |

#### `blog_indexing_log`
Google Indexing API submission tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `post_id` | UUID | References `blog_posts.id` |
| `url` | TEXT | Submitted URL |
| `service` | TEXT | Service (google) |
| `action` | TEXT | Action (submit, update, check_status) |
| `status` | TEXT | Result (success, failed, pending) |
| `response_data` | JSONB | API response |
| `error_message` | TEXT | Error details |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### 7. E-COMMERCE SYSTEM

#### `customers`
Customer management with purchase history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | TEXT | Customer email (UNIQUE) |
| `full_name` | TEXT | Customer name |
| `stripe_customer_id` | TEXT | Stripe customer ID (UNIQUE) |
| `total_orders` | INTEGER | Order count (cached) |
| `total_spent` | DECIMAL(10,2) | Total spent (cached) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

#### `orders`
Order management with Stripe integration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `customer_id` | UUID | References `customers.id` |
| `stripe_checkout_session_id` | TEXT | Stripe session ID (UNIQUE) |
| `stripe_payment_intent_id` | TEXT | Stripe payment intent |
| `status` | TEXT | `pending`, `paid`, `failed`, `refunded` |
| `total_amount` | DECIMAL(10,2) | Order total |
| `currency` | TEXT | Currency code |
| `customer_email` | TEXT | Email snapshot |
| `customer_name` | TEXT | Name snapshot |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |
| `paid_at` | TIMESTAMPTZ | Payment timestamp |

#### `order_items`
Order line items with pricing snapshots.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `order_id` | UUID | References `orders.id` |
| `premium_podcast_id` | UUID | References `premium_podcasts.id` |
| `podcast_name` | TEXT | Name snapshot |
| `podcast_image_url` | TEXT | Image snapshot |
| `price_at_purchase` | DECIMAL(10,2) | Price snapshot |
| `quantity` | INTEGER | Quantity |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### 8. SALES & OUTREACH

#### `sales_calls`
Call tracking and analysis.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `fathom_video_id` | TEXT | Fathom video ID |
| `summary` | TEXT | Call summary |
| `transcript` | TEXT | Call transcript |
| `duration` | INTEGER | Duration in seconds |
| `participants` | TEXT[] | Participant list |
| `call_date` | TIMESTAMPTZ | Call date |
| `call_type` | TEXT | Call type |
| `hidden` | BOOLEAN | Hide from view |
| `archived` | BOOLEAN | Archived status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `campaign_replies`
Email campaign reply tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | TEXT | Email thread ID |
| `message_id` | TEXT | Message ID |
| `subject` | TEXT | Email subject |
| `body` | TEXT | Email body |
| `sender_email` | TEXT | Sender email |
| `sender_name` | TEXT | Sender name |
| `received_at` | TIMESTAMPTZ | Received timestamp |
| `read_status` | BOOLEAN | Read status |
| `bison_reply_id` | TEXT | Bison reply ID |
| `bison_campaign_id` | TEXT | Bison campaign ID |
| `bison_lead_id` | TEXT | Bison lead ID |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `outreach_messages`
Outreach message templates and tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | References `clients.id` |
| `podcast_id` | TEXT | Podcast ID |
| `message_content` | TEXT | Message content |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `podcast_emails`
Podcast contact information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `podcast_id` | TEXT | Podcast ID |
| `podscan_email` | TEXT | Contact email |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### 9. AI & ANALYTICS

#### `podcast_fit_analysis_cache`
Cached AI analyses for podcast compatibility.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `client_name` | TEXT | Client name |
| `podcast_id` | TEXT | Podcast ID |
| `analysis_result` | JSONB | AI analysis result |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `sync_history`
Synchronization history tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `sync_type` | TEXT | Type of sync |
| `status` | TEXT | Sync status |
| `details` | JSONB | Sync details |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `email_delivery_tracking`
Email delivery analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `resend_email_id` | TEXT | Resend email ID |
| `to_email` | TEXT | Recipient email |
| `subject` | TEXT | Email subject |
| `template_name` | TEXT | Template used |
| `status` | TEXT | Delivery status |
| `event_type` | TEXT | Event type |
| `event_data` | JSONB | Event details |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update |

---

## Row Level Security (RLS) Policies

### Admin Access Pattern
Most tables use admin-only access with email-based authentication:

```sql
CREATE POLICY "Admin users can manage [table]"
  ON [table] FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');
```

### Public Access Patterns

#### Read-Only Public Access
- `blog_posts` (published only): Public can read published posts
- `blog_categories`: Public can read active categories
- `premium_podcasts`: Public can read active listings
- `podcasts`: Public read access for shared cache
- `prospect_dashboards`: Public can view active dashboards

#### Client Portal Access
Dynamic policies using session context:

```sql
CREATE POLICY "Clients can view own profile"
  ON clients FOR SELECT TO anon
  USING (id::text = current_setting('app.current_client_id', true));
```

### Service Role Policies
High-privilege operations for edge functions:

```sql
CREATE POLICY "Service role can manage [table]"
  ON [table] FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## Database Functions & Triggers

### Automated Timestamp Updates

#### `update_updated_at_column()`
Automatically updates `updated_at` on row modifications:

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied to: `clients`, `podcasts`, `orders`, `customers`, `blog_posts`, `bookings`

### Podcast Cache Management

#### `upsert_podcast_cache(podscan_id TEXT, podcast_data JSONB)`
Intelligent upsert for central podcast cache with conflict resolution and fetch counting.

#### `increment_podcast_cache_hit(podscan_id TEXT)`
Tracks cache reuse for analytics and API cost savings.

#### `is_podcast_stale(last_fetch TIMESTAMPTZ, stale_days INTEGER)`
Determines if cached podcast data needs refreshing (default 7 days).

### Portal Management

#### `cleanup_expired_portal_data()`
Removes expired tokens and sessions:
- Deletes tokens >1 day old
- Deletes expired sessions
- Optionally archives old activity logs

#### `get_client_portal_stats()`
Returns portal usage analytics:
- Total clients with access
- Active session count
- Logins in last 24h/7d

### Statistics & Analytics

#### `podcast_cache_statistics` (VIEW)
Real-time analytics on podcast cache performance:
- Total podcasts cached
- Podcasts with demographics/email
- Active podcast count
- Stale podcast count
- Cache hit statistics
- API call savings estimates

---

## Edge Functions

The database is heavily integrated with Supabase Edge Functions for complex operations:

### Authentication & Portal
- **`login-with-password`**: Password-based client authentication
- **`send-portal-magic-link`**: Passwordless authentication
- **`validate-portal-session`**: Session validation
- **`verify-portal-token`**: Token verification
- **`logout-portal-session`**: Session cleanup

### Podcast Management
- **`get-prospect-podcasts`**: AI-powered podcast fetching and analysis
- **`get-client-podcasts`**: Client-specific podcast data
- **`analyze-podcast-fit`**: AI compatibility analysis
- **`score-podcast-compatibility`**: Podcast scoring
- **`fetch-podscan-email`**: Contact information retrieval

### Content & Outreach
- **`generate-podcast-queries`**: AI query generation
- **`generate-tagline`**: Personalized taglines
- **`generate-client-bio`**: Bio generation
- **`create-outreach-message`**: Outreach automation
- **`send-outreach-webhook`**: Outreach tracking

### E-commerce & Payments
- **`create-checkout-session`**: Stripe checkout
- **`create-addon-checkout`**: Addon purchasing
- **`stripe-webhook`**: Payment processing

### Integration & Sync
- **`sync-fathom-calls`**: Call data synchronization
- **`sync-replies`**: Email reply processing
- **`campaign-reply-webhook`**: Campaign tracking
- **`resend-webhook`**: Email delivery tracking

### Google Sheets Integration
- **`create-client-google-sheet`**: Sheet creation
- **`export-to-google-sheets`**: Data export
- **`append-prospect-sheet`**: Sheet updates

### Analytics & AI
- **`analyze-sales-call`**: Call analysis
- **`classify-sales-call`**: Call classification
- **`generate-blog-content`**: Content generation
- **`submit-to-indexing`**: SEO indexing

---

## Performance Optimizations

### Indexing Strategy

#### Primary Access Patterns
- **Email lookups**: `clients.email`, `customers.email`, `admin_users.email`
- **Slug lookups**: `blog_posts.slug`, `blog_categories.slug`, `prospect_dashboards.slug`
- **Date ranges**: All `created_at`, `updated_at`, `scheduled_date`, `published_at`
- **Status filtering**: All `status`, `is_active` columns

#### JSONB Indexing
- **GIN indexes** for category searches: `podcasts.podcast_categories`
- **Demographics queries**: `podcasts.demographics`
- **Metadata searches**: Various JSONB columns

#### Composite Indexes
- **Calendar queries**: `(client_id, scheduled_date DESC)`
- **Cache lookups**: `(podscan_id, podscan_last_fetched_at)`
- **Portal activity**: `(client_id, created_at DESC)`

### Cache Architecture

#### Central Podcast Database
The `podcasts` table serves as a **universal cache**:
- **Shared across all clients and prospects**
- **60-80% reduction in Podscan API calls**
- **Cost savings tracking with analytics**
- **Intelligent staleness detection**

#### Cache Hit Tracking
- `cache_hit_count`: Tracks reuse for analytics
- `podscan_fetch_count`: Tracks total API calls
- **Real-time savings calculations**

---

## Issues & Inconsistencies Found

### 1. **Legacy Table Coexistence**
- `prospect_dashboard_podcasts` table still exists but is **DEPRECATED**
- Should be cleaned up after full migration to central `podcasts` table
- May cause confusion during development

### 2. **Inconsistent Naming Conventions**
- `client_podcast_bookings` vs older `bookings` table name
- `podscan_email` field in multiple tables (inconsistent)
- Some tables use `podcast_id` (TEXT), others use UUID references

### 3. **Portal Credential Boundary (July 2026)**
- `clients.portal_password` is retired and constrained to `NULL`.
- Versioned PBKDF2-SHA256 verifiers live only in the service-role-only
  `client_portal_credentials` table.
- Opaque portal session tokens are held by the client; only SHA-256 verifiers
  are stored in `client_portal_sessions`.

### 4. **Missing Foreign Key Constraints**
- Some `podcast_id` fields are TEXT without FK constraints
- `prospect_podcast_analyses.podcast_id` should CASCADE on podcast deletion
- `order_items.premium_podcast_id` uses RESTRICT but others don't

### 5. **Redundant Data Storage**
- Podcast data duplicated across multiple cache tables
- `bookings` table stores podcast snapshots that may become stale
- Consider normalizing further or implement update cascades

### 6. **RLS Policy Gaps**
- Some tables lack comprehensive RLS policies
- `sync_history` and `email_delivery_tracking` may need tighter access control
- Service role policies too permissive in some cases

### 7. **Index Optimization Opportunities**
- Missing partial indexes for `WHERE is_active = true` patterns
- `podcast_categories` JSONB could benefit from more specific GIN indexes
- Some foreign key columns lack indexes

### 8. **Data Type Inconsistencies**
- Ratings stored as both `DECIMAL(3,2)` and `INTEGER`
- Dates vs timestamps not consistently applied
- Some TEXT fields could be ENUMs for better validation

---

## Recommendations

### Immediate Fixes
1. **Hash portal passwords** before production deployment
2. **Add missing foreign key constraints** where appropriate
3. **Clean up deprecated tables** after migration verification
4. **Standardize podcast_id references** (UUID vs TEXT)

### Performance Improvements
1. **Add partial indexes** for common filtered queries
2. **Optimize JSONB indexing** for specific search patterns
3. **Consider partitioning** large log tables by date
4. **Implement query result caching** for analytics views

### Security Enhancements
1. **Audit RLS policies** for completeness
2. **Restrict service role access** to specific operations
3. **Add rate limiting** to edge functions
4. **Implement session timeout handling**

### Architectural Improvements
1. **Complete migration to central podcast cache**
2. **Normalize redundant podcast data storage**
3. **Implement soft deletion** for audit trails
4. **Add data validation triggers** for critical fields

---

## Conclusion

The Get On A Pod database represents a sophisticated, feature-rich system designed to handle complex podcast placement operations at scale. The central podcast caching architecture is particularly well-designed, providing significant API cost savings while maintaining data consistency across clients.

The system successfully balances performance, functionality, and flexibility, though some areas need attention for production readiness, particularly around security and data normalization.

The extensive use of Edge Functions for business logic keeps the database focused on data integrity while providing a robust API layer for complex operations.
