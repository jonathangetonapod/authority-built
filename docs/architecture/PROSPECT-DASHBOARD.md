# Prospect Dashboard System Architecture

## Overview

The Prospect Dashboard system is a comprehensive solution for engaging potential clients in Get On A Pod's podcast booking service. It creates personalized, no-login-required dashboards where prospects can view AI-curated podcast opportunities, see detailed fit analysis, and provide feedback that feeds directly into the sales process.

## Core Components

### 1. **Frontend Components**

#### `/src/pages/prospect/ProspectView.tsx` (156KB)
The main prospect dashboard interface - a comprehensive React component that provides:

**Key Features:**
- **Personalized Hero Section**: Shows prospect name, image, personalized tagline, and custom Loom video
- **AI-Powered Insights**: Real-time podcast fit analysis with pitch angles and audience demographics
- **Interactive Filtering**: Search, category filters, feedback status, audience size, episode count
- **Podcast Cards**: Rich visual cards showing ratings, audience size, categories, and quick approve/reject buttons
- **Side Panel**: Detailed podcast analysis including demographics charts, AI reasoning, and feedback forms
- **Pricing Section**: Embedded Stripe checkout with feature explanations
- **Tutorial System**: Step-by-step guide for first-time users
- **Social Proof**: Testimonials and success metrics
- **Mobile-Optimized**: Responsive design with touch interactions

**Technical Architecture:**
- Uses React Query for intelligent caching and background updates
- Implements infinite scroll with pagination
- Real-time AI analysis with progress tracking
- Optimistic UI updates for instant feedback
- Background preloading of podcast analyses
- Comprehensive analytics and cache performance tracking

#### `/src/pages/Onboarding.tsx` (63KB)
A sophisticated multi-step onboarding form that converts prospects into clients:

**Six-Step Process:**
1. **Basic Information**: Name, email, company, website, social following
2. **Professional Profile**: Bio, expertise areas, LinkedIn, previous podcast experience
3. **Your Story**: Compelling narratives, unique journey, personal stories
4. **Expertise & Topics**: Speaking topics, passions, hobbies, audience value
5. **Goals & Audience**: Target audience, objectives, specific podcast interests
6. **Final Details**: Future vision, availability, calendar link, headshot upload

**Advanced Features:**
- **Auto-save Progress**: Stores form data in localStorage to survive page refreshes
- **Email Validation**: Real-time duplicate checking against existing clients
- **AI Bio Generation**: Creates professional bio from all onboarding responses
- **File Upload**: Professional headshot with base64 encoding for persistence
- **Animations**: Smooth transitions, confetti celebrations, step validation
- **Account Creation**: Automatically creates client portal access with secure credentials

### 2. **MCP Server** (`/mcp-prospect-dashboard/`)

Model Context Protocol server that provides AI agents with prospect dashboard tools.

#### Core Tools:

**`create_prospect`**
```typescript
interface CreateProspectInput {
  prospect_name: string;
  bio?: string;
  profile_picture_url?: string;
  google_sheet_url?: string;
}
```
- Creates new prospect dashboard with unique slug
- Links to Google Sheet for podcast data
- Returns dashboard URL for sharing

**`enable_prospect_dashboard`**
```typescript
interface EnableInput {
  prospect_id: string;
  tagline?: string;
}
```
- Publishes dashboard by setting `content_ready = true`
- Adds personalized tagline
- Makes dashboard publicly accessible

**`match_podcasts_for_prospect`**
```typescript
interface MatchInput {
  prospect_name: string;
  prospect_bio?: string;
  match_threshold?: number;
  match_count?: number;
  use_ai_filter?: boolean;
  export_to_sheet?: boolean;
}
```
- **Semantic Search**: Generates embeddings from prospect profile
- **AI Quality Filter**: Claude Sonnet evaluates relevance (0-10 scale)
- **Database Integration**: Searches 7,884+ cached podcasts
- **Smart Fallback**: Guarantees minimum 15 results
- **Export Integration**: Populates Google Sheets with matches

### 3. **Database Schema**

#### Core Tables:

**`prospect_dashboards`**
```sql
CREATE TABLE prospect_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  prospect_image_url TEXT,
  spreadsheet_id TEXT,
  spreadsheet_url TEXT,
  content_ready BOOLEAN DEFAULT false,
  show_pricing_section BOOLEAN DEFAULT true,
  personalized_tagline TEXT,
  media_kit_url TEXT,
  loom_video_url TEXT,
  loom_thumbnail_url TEXT,
  loom_video_title TEXT,
  show_loom_video BOOLEAN DEFAULT false,
  testimonial_ids TEXT[],
  show_testimonials BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`podcasts` (Centralized Cache)**
```sql
CREATE TABLE podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podscan_id TEXT NOT NULL UNIQUE,
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_image_url TEXT,
  publisher_name TEXT,
  podcast_url TEXT,
  podcast_categories JSONB,
  episode_count INTEGER,
  itunes_rating DECIMAL(3,2),
  audience_size INTEGER,
  demographics JSONB,
  email TEXT,
  website TEXT,
  cache_hit_count INTEGER DEFAULT 0,
  podscan_last_fetched_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`prospect_podcast_analyses`**
```sql
CREATE TABLE prospect_podcast_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID REFERENCES prospect_dashboards(id),
  podcast_id UUID REFERENCES podcasts(id),
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,
  UNIQUE(prospect_dashboard_id, podcast_id)
);
```

**`prospect_podcast_feedback`**
```sql
CREATE TABLE prospect_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID REFERENCES prospect_dashboards(id),
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prospect_dashboard_id, podcast_id)
);
```

### 4. **Supabase Edge Functions**

#### **`get-prospect-podcasts`** (Core Data Pipeline)
The main data orchestration function with sophisticated caching and AI analysis:

**Multi-Mode Operation:**
- **Cache-Only Mode**: Fast path using database cache only
- **Full Mode**: Fetches missing podcasts from Podscan API
- **AI Analysis Mode**: Runs Claude Sonnet analysis on cached podcasts
- **Status Check Mode**: Reports cache statistics without fetching

**Intelligent Caching:**
```typescript
// 60-80% API call reduction through centralized cache
const { cached, missing } = await getCachedPodcasts(supabase, podcastIds, 7)

// Cache performance logging
console.log('✅ Cache hit rate:', cacheHitRate + '%')
console.log('💰 API calls saved:', apiCallsSaved)
console.log('💵 Cost savings: $' + costSavings)
```

**AI Analysis Pipeline:**
```typescript
// Concurrent batch processing for performance
const BATCH_SIZE = 10
const CONCURRENT_BATCHES = 3 // 30 podcasts at once

// Claude Sonnet 4.0 analysis
const analysis = await analyzePodcastFit({
  podcast: podcastData,
  prospectName: prospect.name,
  prospectBio: prospect.bio
})

// Returns personalized insights:
// - clean_description: Simplified podcast description
// - fit_reasons: 3-4 specific reasons why it's a great match
// - pitch_angles: 3 episode topic ideas with titles and descriptions
```

**Google Sheets Integration:**
- Reads podcast IDs from column E of linked Google Sheet
- Supports dynamic sheet name detection
- Cleans up stale cache entries when podcasts are removed
- Service account authentication with JWT tokens

#### **`analyze-podcast-fit`**
Dedicated Claude Sonnet analysis for individual podcasts:

```typescript
const prompt = `Analyze why this podcast is a great match for this client.

PODCAST: ${podcastInfo}
CLIENT: ${clientBio}

Return JSON with:
- clean_description: Clear podcast summary (1-2 sentences)
- fit_reasons: Array of 3-4 specific match reasons
- pitch_angles: Array of 3 episode ideas with titles & descriptions`
```

#### **`create-client-account`**
Handles onboarding completion:
- **AI Bio Generation**: Synthesizes all onboarding responses into professional bio
- **Portal Account**: Creates client portal access with secure password
- **Google Sheet**: Creates dedicated client podcast tracking sheet
- **Dashboard Link**: Creates prospect dashboard if needed
- **Email Invitation**: Sends welcome email with credentials
- **Headshot Processing**: Handles image upload and storage

#### **`generate-tagline`**
AI-powered personalized tagline generation:
```typescript
// Creates custom taglines like:
// "We've curated 47 podcasts perfect for your marketing psychology expertise"
// "These 23 shows need your unique insights on conversion optimization"
```

## Data Flow Architecture

### 1. **Prospect Creation Flow (SDR/Bison → Dashboard)**

```
SDR Input → create_prospect → Database Entry → Google Sheet
    ↓
Podcast Matching → AI Analysis → Dashboard Population → URL Generation
    ↓
Prospect Engagement → Feedback Collection → Sales Handoff
```

**Step-by-Step:**
1. **SDR Creates Prospect**: Uses MCP tools to create dashboard with name, bio, photo
2. **Podcast Matching**: AI semantic search finds relevant podcasts
3. **Sheet Population**: Matched podcasts exported to Google Sheet (Column E = Podcast IDs)
4. **AI Analysis**: Claude analyzes each podcast against prospect profile
5. **Dashboard Ready**: Set `content_ready = true` to publish
6. **Prospect Engagement**: Prospect receives dashboard URL, reviews podcasts
7. **Feedback Collection**: Approvals/rejections stored in database
8. **Conversion**: Approved prospects become clients via onboarding flow

### 2. **Onboarding.tsx Data Flow (Prospect → Client)**

```
Form Submission → AI Bio Generation → Account Creation → Sheet Creation
    ↓
Portal Access → Email Invitation → Client Onboarding Complete
```

**Detailed Process:**
1. **Multi-Step Form**: 6-step form with auto-save and validation
2. **Data Synthesis**: All responses combined for AI bio generation
3. **Client Creation**: New client record with generated bio and structured notes
4. **Portal Setup**: Authentication credentials and portal URL
5. **Sheet Integration**: Dedicated Google Sheet for podcast tracking
6. **Dashboard Link**: Prospect dashboard converted to client dashboard
7. **Email Notification**: Welcome email with credentials and next steps

### 3. **Podcast Data Pipeline**

```
Google Sheet IDs → Cache Check → Podscan API → AI Analysis → Database Storage
    ↓
Frontend Request → Fast Cache Response → UI Rendering
```

**Multi-Layer Caching:**
- **Level 1**: Centralized `podcasts` table (shared across all prospects)
- **Level 2**: Prospect-specific `prospect_podcast_analyses` table
- **Level 3**: Frontend React Query cache (5-minute TTL)
- **Level 4**: Browser localStorage for form auto-save

**Performance Optimizations:**
- **Semantic Deduplication**: Same podcasts reused across prospects
- **Batch Processing**: 30 concurrent API calls during cache population
- **Background Analysis**: AI analysis runs asynchronously
- **Progressive Loading**: Frontend shows cached data first, fills in AI analysis

## Approval/Rejection Workflow

### Frontend Interaction
```tsx
// Quick approve/reject buttons on cards
<button onClick={() => saveFeedback(podcastId, 'approved')}>
  <ThumbsUp />
</button>

// Detailed side panel with notes
<Textarea 
  value={notes}
  placeholder="Why do you like/dislike this podcast?"
/>
```

### Database Updates
```sql
-- Upsert feedback (allows changing mind)
INSERT INTO prospect_podcast_feedback (
  prospect_dashboard_id,
  podcast_id,
  podcast_name,
  status,
  notes
) VALUES (?, ?, ?, ?, ?)
ON CONFLICT (prospect_dashboard_id, podcast_id)
DO UPDATE SET
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_at = NOW()
```

### Sales Team Access
- **Real-time Dashboard**: Admin can see all prospect feedback
- **Filter Views**: Approved/rejected/pending review
- **Notes Collection**: Detailed feedback for pitch refinement
- **Conversion Tracking**: Approved podcasts → actual bookings

## AI Analysis System

### Semantic Search Pipeline
```typescript
// 1. Generate prospect embedding
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-large",
  input: `${prospectName}: ${prospectBio}`
})

// 2. Vector similarity search
const matches = await supabase.rpc('search_similar_podcasts', {
  query_embedding: embedding.data[0].embedding,
  match_threshold: 0.2,
  match_count: 100
})

// 3. AI quality filter
const filtered = await anthropic.messages.create({
  model: 'claude-sonnet-4-5',
  messages: [{
    role: 'user', 
    content: `Evaluate podcast relevance for prospect...`
  }]
})
```

### Quality Scoring
Claude Sonnet evaluates each podcast on a 0-10 scale:
- **9-10**: Perfect match - guest expertise directly aligns
- **7-8**: Strong match - good topic overlap and audience fit  
- **5-6**: Moderate match - some relevance but not ideal
- **0-4**: Poor match - misaligned topics/audience

Only podcasts scoring 5+ are included in final results.

### Personalized Insights
For each matched podcast, the system generates:

**Fit Reasons** (3-4 specific explanations):
```json
[
  "Your marketing psychology expertise aligns perfectly with their audience of growth hackers",
  "They frequently discuss conversion optimization, your core specialty",
  "Host interviews experts about behavioral science applications in business"
]
```

**Pitch Angles** (3 episode topics):
```json
[
  {
    "title": "The Psychology Behind High-Converting Landing Pages",
    "description": "Explore cognitive biases that drive purchase decisions and how to ethically apply them in web design."
  }
]
```

## Pricing Display and Checkout Flow

### Dynamic Pricing Cards
```tsx
// Two-tier pricing with Stripe integration
<div className="grid md:grid-cols-2 gap-6">
  <PricingCard 
    name="Starter"
    price="$1,000"
    features={['2 podcasts/month', 'Command Center', 'Analytics']}
    stripeButtonId="buy_btn_1So6wjDUPtBnbWkaAkoqwcLf"
  />
  <PricingCard 
    name="Pro" 
    price="$2,000"
    features={['3+ podcasts/month', 'Blog posts', 'Video clips']}
    stripeButtonId="buy_btn_1So79ZDUPtBnbWkaaZSbIvKU"
    popular={true}
  />
</div>
```

### Feature Explanation Modal
Interactive feature explanations with click handlers:
```tsx
<li onClick={() => setSelectedPricingFeature('Podcast Command Center')}>
  <Check className="h-4 w-4" />
  Podcast Command Center
  <Info className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
</li>
```

### Conversion Integration
- **Stripe Checkout**: Embedded buy buttons with live environment keys
- **Calendly Integration**: "Book a Call" CTAs link to scheduling
- **Lead Tracking**: Pricing interactions logged for sales follow-up

## Database Flow: Prospect → Client Conversion

### Before Conversion (Prospect)
```sql
-- Prospect exists only in prospect_dashboards
SELECT id, prospect_name, prospect_bio, slug 
FROM prospect_dashboards 
WHERE slug = 'abc123def';

-- Their feedback tracked separately
SELECT podcast_id, status, notes 
FROM prospect_podcast_feedback 
WHERE prospect_dashboard_id = ?;
```

### During Onboarding
```sql
-- New client account created
INSERT INTO clients (
  name, email, bio, notes, 
  portal_access_enabled,
  prospect_dashboard_slug  -- Link back to original dashboard
);

-- Google Sheet created for client
INSERT INTO google_sheets (client_id, spreadsheet_id, url);
```

### After Conversion (Client)
```sql
-- Full client record with portal access
SELECT c.*, pd.slug as original_dashboard
FROM clients c 
LEFT JOIN prospect_dashboards pd ON pd.slug = c.prospect_dashboard_slug;

-- Podcast approvals can inform initial outreach
SELECT podcast_id, notes 
FROM prospect_podcast_feedback 
WHERE prospect_dashboard_id = (
  SELECT id FROM prospect_dashboards 
  WHERE slug = c.prospect_dashboard_slug
);
```

## MCP Tools Integration

### AI Agent Workflow
```typescript
// Agent creates prospect from lead
const prospect = await mcpClient.call('create_prospect', {
  prospect_name: 'Sarah Chen',
  bio: 'CMO at TechFlow, expert in growth marketing...',
  profile_picture_url: 'https://...'
})

// Agent finds matching podcasts
const matches = await mcpClient.call('match_podcasts_for_prospect', {
  prospect_name: 'Sarah Chen',
  prospect_bio: '...',
  match_count: 50,
  use_ai_filter: true,
  export_to_sheet: true,
  prospect_id: prospect.prospect.id
})

// Agent enables dashboard when ready
await mcpClient.call('enable_prospect_dashboard', {
  prospect_id: prospect.prospect.id,
  tagline: 'We\'ve curated 47 podcasts perfect for your growth marketing expertise'
})
```

### Human-AI Collaboration
- **AI handles**: Podcast discovery, initial matching, data processing
- **Human handles**: Final prospect selection, personalization, relationship building
- **System bridges**: MCP tools provide structured interface between AI and humans

## Performance & Scalability

### Caching Strategy
- **60-80% API Call Reduction**: Centralized podcast cache eliminates duplicate Podscan calls
- **Progressive Loading**: Show cached data immediately, fill in AI analysis asynchronously  
- **Smart Invalidation**: 7-day TTL with manual refresh capability
- **Cost Optimization**: Estimated $0.01 savings per cached podcast lookup

### Concurrent Processing
```typescript
// 30 podcasts analyzed simultaneously
const BATCH_SIZE = 10
const CONCURRENT_BATCHES = 3

// Timeout protection
const MAX_RUNTIME_MS = 50000
if (Date.now() - startTime > MAX_RUNTIME_MS) {
  stoppedEarly = true
  break
}
```

### Database Optimization
- **Indexes**: All foreign keys and search fields indexed
- **RLS Policies**: Row-level security for multi-tenant data isolation
- **JSONB Fields**: Efficient storage for categories, demographics, AI results
- **Views**: Pre-computed joins for common queries

## Security & Privacy

### Public Access Design
- **No Authentication Required**: Prospects access via unique slug URL
- **Data Isolation**: RLS policies prevent cross-prospect data access
- **Minimal PII**: Only stores what's necessary for dashboard functionality
- **GDPR Compliance**: Clear data usage, ability to deactivate dashboards

### API Security
```typescript
// Service account authentication for Google Sheets
const jwt = await createJWT(serviceAccount, scopes)
const accessToken = await exchangeJWTForToken(jwt)

// Rate limiting and timeout protection
const timeoutMs = 50000
const signal = AbortSignal.timeout(timeoutMs)
```

## Monitoring & Analytics

### Built-in Analytics
```sql
-- Cache performance tracking
SELECT 
  COUNT(*) as total_podcasts,
  SUM(cache_hit_count) as total_cache_hits,
  (SUM(cache_hit_count) * 2) as estimated_api_calls_saved
FROM podcasts;

-- Prospect engagement metrics  
SELECT 
  COUNT(*) as total_views,
  AVG(view_count) as avg_views_per_prospect,
  COUNT(*) FILTER (WHERE last_viewed_at > NOW() - INTERVAL '24 hours') as recent_views
FROM prospect_dashboards;
```

### Performance Logging
```typescript
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📊 [CACHE PERFORMANCE] Request completed')
console.log('   ✅ Cache hit rate:', cacheHitRate + '%')
console.log('   💰 API calls saved:', apiCallsSaved)
console.log('   💵 Cost savings: $' + costSavings)
console.log('   🌍 Benefits all prospects globally')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
```

## Future Enhancements

### Planned Features
- **Video Integration**: HeyGen AI-generated personalized videos
- **Advanced Analytics**: Detailed prospect behavior tracking
- **A/B Testing**: Different dashboard layouts and messaging
- **CRM Integration**: Direct sync with sales pipeline
- **Mobile App**: Native iOS/Android prospect engagement

### Technical Debt
- **Type Safety**: Improve TypeScript coverage across edge functions
- **Error Handling**: More robust error boundaries and user feedback
- **Testing**: Comprehensive E2E testing for critical user flows
- **Performance**: Implement service worker for offline caching

## Summary

The Prospect Dashboard system represents a sophisticated, scalable solution for prospect engagement that combines:

- **AI-Powered Personalization**: Every dashboard is uniquely tailored using semantic search and Claude Sonnet analysis
- **Seamless User Experience**: No-login-required access with mobile-optimized design
- **Intelligent Caching**: 60-80% reduction in API calls through centralized podcast database
- **Comprehensive Analytics**: Built-in performance tracking and cost optimization
- **Sales Integration**: Direct feedback collection that informs human sales process
- **Conversion Optimization**: Embedded pricing and smooth onboarding flow

The system successfully bridges the gap between automated prospect identification and human sales engagement, providing a scalable way to deliver personalized value to prospects while collecting structured feedback that enhances the overall sales process.
