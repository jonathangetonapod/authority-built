# Podcast Finder Architecture

## Overview

The Podcast Finder is Get On A Pod's comprehensive podcast discovery, compatibility scoring, and outreach system. It consists of two primary modes - AI Search Mode and Charts Mode - with sophisticated AI-powered matching and scoring capabilities.

## System Architecture

### Core Components

```
Frontend (React)
├── /pages/admin/PodcastFinder.tsx         # Main discovery interface
├── /pages/admin/OutreachPlatform.tsx      # Outreach workflow management
└── /components/admin/PodcastOutreachSwiper.tsx  # Podcast review interface

Services Layer
├── /services/podscan.ts                   # Podscan API integration
├── /services/queryGeneration.ts           # AI query generation
├── /services/compatibilityScoring.ts      # AI compatibility scoring
├── /services/categorization.ts            # Auto-categorization
├── /services/podcastSearchUtils.ts        # Search utilities
└── /services/podcastCache.ts              # Caching layer

Backend (Supabase)
├── Edge Functions
│   ├── generate-podcast-queries           # AI query generation
│   ├── score-podcast-compatibility        # AI scoring
│   ├── analyze-podcast-fit                # AI fit analysis
│   └── fetch-podscan-email               # Email fetching
└── Database Tables
    ├── podcasts                          # Centralized podcast data
    ├── podcast_outreach_actions          # Outreach tracking
    ├── outreach_messages                 # Email queue management
    └── prospect_dashboards               # Prospect management
```

## 1. Podcast Search System

### AI Search Mode

#### Query Generation
The system uses Claude AI (Opus 4.5) to generate strategic search queries based on client/prospect data:

**File:** `/supabase/functions/generate-podcast-queries/index.ts`

**Strategy:**
- 1 precise query (exact niche + specific terms)
- 2 broad synonym queries (using OR operators)
- 1 wildcard query (using * for variations)
- 1 adjacent category query (related audiences)

**Example Generated Queries:**
```
'business leadership' OR 'executive coaching'
'startup * podcast' OR 'founder * stories'
'digital marketing' OR 'growth marketing' OR 'content strategy'
'sales * leaders' OR 'revenue growth'
'women in tech' OR 'technology innovation'
```

**Implementation Details:**
```typescript
// Query generation flow
const prompt = `Generate 5 strategic podcast search queries for Podscan.fm
STRATEGIC MIX:
1. ONE precise query (client's exact niche + specific terms)
2. TWO broad synonym queries (use OR to combine 3-5 related terms)
3. ONE wildcard query (use * for variation: startup * podcast)
4. ONE adjacent category query (related but different audience)`

// Advanced search syntax
- Use single quotes 'like this' for exact phrases
- Use * wildcards within quotes for broader matching
- Use Boolean operators (AND, OR, NOT)
- Combine synonyms and related terms for high volume
```

#### Podscan API Integration
**File:** `/src/services/podscan.ts`

**Core Functions:**
```typescript
// Main search function
export async function searchPodcasts(options: SearchOptions): Promise<PodcastSearchResponse>

// Search filters
interface SearchOptions {
  query?: string
  category_ids?: string
  per_page?: number
  order_by?: 'best_match' | 'name' | 'audience_size' | 'rating'
  order_dir?: 'asc' | 'desc'
  search_fields?: string
  language?: string
  region?: string
  min_audience_size?: number
  max_audience_size?: number
  min_episode_count?: number
  has_guests?: boolean
  has_sponsors?: boolean
}
```

**Rate Limiting:** 120 requests/minute, 2000 requests/day

#### Search Workflow
1. User selects client/prospect and generates AI queries
2. Applies optional filters (audience size, region, guest format, etc.)
3. Executes searches with rate-limiting delays (700ms between requests)
4. Auto-regenerates poor-performing queries (0 results)
5. Deduplicates results across all queries
6. Displays paginated results with sorting

### Charts Mode

Alternative discovery method browsing top-ranked podcasts from Apple Podcasts and Spotify charts.

**Key Functions:**
```typescript
export async function getChartCountries(): Promise<ChartCountry[]>
export async function getChartCategories(platform: 'apple' | 'spotify', countryCode: string): Promise<ChartCategory[]>
export async function getTopChartPodcasts(platform: 'apple' | 'spotify', countryCode: string, category: string, limit: number): Promise<ChartPodcast[]>
```

**Features:**
- Dynamic country/category loading from Podscan
- Platform-specific limits (Apple: 200, Spotify: 50)
- Real-time filtering by audience, rating, fit score

## 2. AI Compatibility Scoring System

### Compatibility Algorithm
**File:** `/supabase/functions/score-podcast-compatibility/index.ts`

Uses Claude Haiku 4.5 for fast, parallel compatibility scoring:

```typescript
// Scoring criteria
const prompt = `Rate compatibility (1-10) between client and podcast:

Scoring Guidelines:
- 9-10: Perfect match - expertise directly aligns with podcast focus
- 7-8: Strong match - related topics, good audience overlap  
- 5-6: Moderate match - some relevance but not ideal
- 3-4: Weak match - tangentially related
- 1-2: Poor match - not relevant`
```

**Batch Processing:**
- Processes in chunks of 10 podcasts
- Progress callbacks for UX
- Error handling with graceful degradation
- 500ms delays between batches

### Implementation
**File:** `/src/services/compatibilityScoring.ts`

```typescript
export async function scoreCompatibilityBatch(
  bio: string,
  podcasts: PodcastForScoring[],
  batchSize: number = 10,
  onProgress?: (completed: number, total: number) => void,
  isProspectMode: boolean = false
): Promise<CompatibilityScore[]>
```

**Result Format:**
```typescript
interface CompatibilityScore {
  podcast_id: string
  score: number | null
  reasoning?: string
}
```

## 3. Database Architecture

### Central Podcasts Table
**File:** `/supabase/migrations/20260125_centralized_podcasts_database.sql`

**Purpose:** Centralized podcast data cache to reduce Podscan API calls by 60-80%

```sql
CREATE TABLE public.podcasts (
  -- Primary Identifier
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podscan_id TEXT NOT NULL UNIQUE,

  -- Basic Information
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_image_url TEXT,

  -- Publisher & Host
  publisher_name TEXT,
  host_name TEXT,

  -- Platform Links
  podcast_url TEXT,
  podcast_itunes_id TEXT,
  podcast_spotify_id TEXT,
  rss_url TEXT,

  -- Categories & Classification
  podcast_categories JSONB,
  language TEXT,
  region TEXT,

  -- Content Metadata
  episode_count INTEGER,
  last_posted_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  podcast_has_guests BOOLEAN,
  podcast_has_sponsors BOOLEAN,

  -- Ratings & Reach
  itunes_rating DECIMAL(3,2),
  itunes_rating_count INTEGER,
  spotify_rating DECIMAL(3,2),
  audience_size INTEGER,
  podcast_reach_score INTEGER,

  -- Contact Information
  email TEXT,
  website TEXT,
  social_links JSONB,

  -- Demographics (from Podscan /demographics)
  demographics JSONB,
  demographics_episodes_analyzed INTEGER,
  demographics_fetched_at TIMESTAMPTZ,

  -- Brand Safety
  brand_safety_risk_level TEXT,
  brand_safety_recommendation TEXT,

  -- Cache Management
  podscan_last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  podscan_fetch_count INTEGER DEFAULT 1,
  cache_hit_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Optimization Features:**
- Deduplication across clients/prospects
- Stale data detection
- Cache hit tracking for analytics
- Performance indexes on key fields

### Outreach Management Tables

#### Outreach Actions Tracking
**File:** `/supabase/migrations/20260118_podcast_outreach_system.sql`

```sql
CREATE TABLE podcast_outreach_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
);
```

#### Email Queue Management
**File:** `/supabase/migrations/20260118_outreach_messages.sql`

```sql
CREATE TABLE outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  
  -- Podcast/Host Information
  podcast_id TEXT,
  podcast_name TEXT NOT NULL,
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
    CHECK (status IN ('pending_review', 'approved', 'sent', 'failed')),
  
  -- Metadata
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  email_platform_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4. Outreach Workflow

### Podcast Review Process
**Component:** `/src/components/admin/PodcastOutreachSwiper.tsx`

**Features:**
- Swipeable card interface for podcast review
- Keyboard shortcuts (arrows, space, escape)
- AI fit analysis display
- Bulk approval capabilities
- Progress tracking

**Keyboard Controls:**
- `←/→`: Navigate between podcasts
- `Space/Enter`: Approve for outreach
- `X/Esc`: Skip podcast

### Email Approval System
**Component:** `/src/pages/admin/OutreachPlatform.tsx`

**Workflow:**
1. **Pending Review:** Emails from Clay await approval
2. **Review & Edit:** Admin can modify email content
3. **Bison Integration:** Creates leads in Bison CRM
4. **Send Tracking:** Marks emails as sent with timestamps

**Features:**
- Grouped by client with collapsible sections
- Bulk approval for all client emails
- Client bio viewing for context
- Podscan email fetching integration
- Campaign tracking

### Integration Points

#### Bison CRM Integration
```typescript
// Create lead in Bison and send email
const { data: bisonData } = await supabase.functions.invoke('create-bison-lead', {
  body: { message_id: message.id }
})

// Response includes:
// - lead_id: Bison lead identifier
// - lead_already_existed: boolean
// - campaign_attached: boolean
// - campaign_id: string
```

#### Clay Automation Integration
- Webhook URL per client: `clients.outreach_webhook_url`
- Sends approved podcasts to Clay for email generation
- Receives generated emails in `outreach_messages` table

## 5. Prospect Dashboard System

### Prospect Management
The system supports both client and prospect modes:

**Client Mode:** Uses existing client data and bio
**Prospect Mode:** Creates new prospect records with custom dashboards

**Database Tables:**
```sql
-- prospect_dashboards table
CREATE TABLE prospect_dashboards (
  id UUID PRIMARY KEY,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  prospect_image_url TEXT,
  spreadsheet_url TEXT,
  slug TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true
);

-- prospect_dashboard_podcasts (cache table)
CREATE TABLE prospect_dashboard_podcasts (
  id UUID PRIMARY KEY,
  prospect_dashboard_id UUID REFERENCES prospect_dashboards(id),
  podcast_id TEXT NOT NULL,
  -- ... podcast data fields
);
```

### Google Sheets Integration
**Service:** `/src/services/googleSheets.ts`

**Features:**
- Creates branded prospect dashboards
- Exports selected podcasts to sheets
- Generates shareable dashboard URLs
- Appends new podcasts to existing sheets

**Functions:**
```typescript
export async function createProspectSheet(
  prospectName: string,
  prospectBio: string, 
  podcasts: PodcastExportData[],
  prospectImageUrl?: string
): Promise<{
  spreadsheetId: string
  spreadsheetUrl: string
  sheetTitle: string
  dashboardUrl: string
  rowsAdded: number
}>

export async function appendToProspectSheet(
  prospectId: string,
  podcasts: PodcastExportData[]
): Promise<{
  spreadsheetUrl: string
  rowsAdded: number
}>
```

## 6. Advanced Features

### Demographics Analysis
**File:** `/src/services/podscan.ts`

```typescript
export interface PodcastDemographics {
  episodes_analyzed: number
  age: string
  gender_skew: string
  purchasing_power: string
  education_level: string
  engagement_level: string
  age_distribution: Array<{ age: string; percentage: number }>
  geographic_distribution: Array<{ region: string; percentage: number }>
  professional_industry: Array<{ industry: string; percentage: number }>
  technology_adoption?: {
    profile: string
    confidence_score: number
    reasoning: string
  }
  content_habits?: {
    primary_platforms: string[]
    preferred_formats: string[]
    consumption_context: string[]
  }
  living_environment?: {
    urban: number
    suburban: number
    rural: number
  }
  brand_relationship?: {
    loyalty_level: string
    price_sensitivity: string
    advocacy_potential: string
  }
}
```

### Auto-Categorization
**File:** `/src/services/categorization.ts`

Uses Claude AI to automatically categorize podcasts:
```typescript
export async function autoCategorizePodcast(input: {
  podcastName: string
  description?: string
  whyThisShow?: string
}): Promise<string>
```

### Search Utilities
**File:** `/src/services/podcastSearchUtils.ts`

**Key Functions:**
```typescript
// Deduplication across queries
export function deduplicatePodcasts(podcasts: PodcastData[]): PodcastData[]

// Multi-query search with progress
export async function searchWithProgressiveResults(
  queries: string[],
  baseFilters: SearchOptions,
  onResults: (results: PodcastData[], queryIndex: number, isComplete: boolean) => void
): Promise<PodcastData[]>

// Advanced filtering
export function filterPodcasts(
  podcasts: PodcastData[], 
  criteria: FilterCriteria
): PodcastData[]

// Statistics calculation
export function calculateSearchStatistics(podcasts: PodcastData[]): SearchStatistics
```

## 7. User Flow: Finding to Outreaching

### Complete Workflow

1. **Target Selection**
   - Choose existing client or create new prospect
   - Enter prospect details (name, bio, image)

2. **Query Generation**
   - AI generates 5 strategic search queries
   - User can add custom keywords
   - Manual query editing and regeneration

3. **Search & Filter**
   - Execute searches with rate limiting
   - Apply filters (audience, region, guest format)
   - Auto-regenerate zero-result queries

4. **Compatibility Scoring**
   - AI scores all podcasts (1-10)
   - Batch processing with progress indicators
   - Sort by score, audience size

5. **Selection & Export**
   - Checkbox selection across queries
   - Bulk filtering by score thresholds
   - Export to Google Sheets or prospect dashboard

6. **Outreach Management**
   - Webhook triggers to Clay automation
   - Email generation and queue management
   - Admin review and approval workflow

7. **CRM Integration**
   - Bison lead creation
   - Campaign attachment
   - Status tracking and analytics

## 8. Performance Optimizations

### Caching Strategy
- **Centralized Podcast Storage:** Reduces API calls by 60-80%
- **Demographics Caching:** Expensive API calls cached indefinitely
- **Stale Data Detection:** 7-day freshness tracking
- **Cache Hit Analytics:** Performance monitoring

### API Rate Limiting
- **Podscan Limits:** 120/min, 2000/day
- **Request Spacing:** 700ms delays between searches
- **Batch Processing:** Scoring in chunks of 10
- **Error Handling:** Graceful degradation on failures

### Database Indexes
```sql
-- Performance indexes
CREATE INDEX idx_podcasts_audience_size ON podcasts(audience_size DESC NULLS LAST);
CREATE INDEX idx_podcasts_rating ON podcasts(itunes_rating DESC NULLS LAST);
CREATE INDEX idx_podcasts_categories ON podcasts USING GIN(podcast_categories);
CREATE INDEX idx_podcasts_last_fetched ON podcasts(podscan_last_fetched_at);
```

## 9. Security & Access Control

### Row Level Security (RLS)
```sql
-- Podcasts: Public read, service role write
CREATE POLICY "Public read access to podcasts" ON podcasts FOR SELECT TO public USING (true);
CREATE POLICY "Service role can insert podcasts" ON podcasts FOR INSERT TO service_role WITH CHECK (true);

-- Outreach: Admin-only access
CREATE POLICY "Admin full access for outreach_messages" ON outreach_messages FOR ALL
USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.email = auth.jwt() ->> 'email'));
```

### Authentication
- Supabase JWT authentication required
- Admin role verification for outreach features
- Service role for edge function operations

## 10. Error Handling & Monitoring

### Error Handling Patterns
```typescript
// API error handling with fallbacks
try {
  const results = await searchPodcasts(options)
  return results.podcasts
} catch (error) {
  console.error('Search failed:', error)
  // Continue with other queries
  return []
}

// Graceful AI scoring degradation
try {
  const parsed = JSON.parse(aiResponse)
  return { score: parsed.score, reasoning: parsed.reasoning }
} catch (parseError) {
  // Fallback: extract just the score
  const match = aiResponse.match(/\b([1-9]|10)\b/)
  return { score: match ? parseInt(match[1]) : null, reasoning: undefined }
}
```

### Monitoring Points
- API rate limit tracking
- Cache hit ratios
- AI scoring success rates
- Webhook delivery status
- Email send tracking

## 11. Future Enhancements

### Planned Features
- **Email Platform Integration:** Direct sending via SendGrid/Mailgun
- **Advanced Analytics:** Conversion tracking, response rates
- **ML-Powered Scoring:** Custom models beyond Claude AI
- **Automated Follow-ups:** Sequence management
- **Podcast Host Profiles:** Contact information expansion
- **Calendar Integration:** Booking workflow automation

### Technical Debt
- Migrate from localStorage to database persistence
- Implement proper pagination for large result sets
- Add real-time collaboration features
- Enhance mobile responsiveness
- Implement comprehensive logging

## Conclusion

The Podcast Finder represents a sophisticated, AI-powered podcast discovery and outreach system that streamlines the entire workflow from finding relevant podcasts to managing email campaigns. The architecture emphasizes performance through intelligent caching, user experience through progressive loading and real-time feedback, and scalability through modular design and proper database optimization.

Key technical achievements:
- **60-80% reduction** in API calls through centralized caching
- **AI-powered matching** with Claude integration for queries and scoring
- **Dual-mode discovery** supporting both AI search and chart browsing
- **End-to-end workflow** from discovery to CRM integration
- **Robust error handling** with graceful degradation
- **Performance optimization** through batching and progressive loading

The system successfully bridges the gap between podcast discovery and outreach automation, providing a comprehensive solution for podcast marketing at scale.