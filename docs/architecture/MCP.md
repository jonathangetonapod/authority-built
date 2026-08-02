# MCP Prospect Dashboard Architecture

## Overview

The MCP Prospect Dashboard module is a **Model Context Protocol (MCP) server** that provides AI-powered podcast-prospect matching capabilities. It serves as a bridge between Claude/AI assistants and the Get On A Pod prospect management system, enabling automated dashboard creation, podcast matching, and prospect onboarding workflows.

## What the MCP Server Does

The MCP server provides three core functionalities through a standardized protocol:

1. **Prospect Dashboard Creation** - Creates new prospect dashboards with customizable profiles
2. **Dashboard Publishing** - Enables/publishes dashboards for prospect viewing
3. **AI-Powered Podcast Matching** - Finds relevant podcasts using semantic search and AI filtering

The server runs as a stdio-based MCP service, allowing AI assistants to perform complex prospect management tasks through simple tool calls.

## Available Tools and Parameters

### 1. `create_prospect`

**Purpose**: Create a new prospect dashboard

**Parameters**:
```typescript
{
  prospect_name: string;           // Required - Prospect full name
  bio?: string;                   // Optional - Bio/background information
  profile_picture_url?: string;   // Optional - Profile picture URL
  google_sheet_url?: string;      // Optional - Google Sheet URL to link
}
```

**Returns**:
```typescript
{
  success: boolean;
  prospect?: {
    id: string;                   // UUID for the prospect
    name: string;                 // Prospect name
    slug: string;                 // 8-character random slug
    dashboard_url: string;        // Public dashboard URL
    spreadsheet_url: string | null; // Linked Google Sheet URL
  };
  error?: string;
}
```

**Database Operations**:
- Inserts into `prospect_dashboards` table
- Generates unique 8-character slug
- Extracts Google Sheet ID from URL if provided
- Sets `content_ready: false` initially

### 2. `enable_prospect_dashboard`

**Purpose**: Enable/publish a prospect dashboard for public viewing

**Parameters**:
```typescript
{
  prospect_id: string;            // Required - UUID from create_prospect
  tagline?: string;              // Optional - Personalized tagline
}
```

**Returns**:
```typescript
{
  success: boolean;
  dashboard_url?: string;         // Public dashboard URL
  enabled_at?: string;           // ISO timestamp of enablement
  error?: string;
}
```

**Database Operations**:
- Updates `prospect_dashboards` table
- Sets `content_ready: true`
- Optionally sets `personalized_tagline`

### 3. `match_podcasts_for_prospect`

**Purpose**: Find matching podcasts using AI-powered semantic search

**Parameters**:
```typescript
{
  prospect_name: string;          // Required - Prospect full name
  prospect_bio?: string;         // Optional - Detailed bio (better matches)
  match_threshold?: number;      // Optional - Similarity threshold (0.0-1.0, default: 0.2)
  match_count?: number;          // Optional - Max results (default: 50, max: 100)
  prospect_id?: string;          // Optional - UUID for export functionality
  export_to_sheet?: boolean;     // Optional - Export to Google Sheets (default: false)
  use_ai_filter?: boolean;       // Optional - Use AI quality filtering (default: true)
}
```

**Returns**:
```typescript
{
  success: boolean;
  data?: {
    prospect_text: string;        // Formatted prospect profile for matching
    matches: PodcastMatch[];      // Array of matched podcasts
    total_matches: number;        // Number of matches found
    threshold_used: number;       // Actual threshold used
    exported_to_sheet?: boolean;  // Whether export was successful
    sheet_url?: string;          // Google Sheet URL if exported
  };
  error?: string;
}
```

**PodcastMatch Structure**:
```typescript
{
  id: string;                     // Internal podcast ID
  podscan_id: string;            // External Podscan identifier
  podcast_name: string;          // Podcast name
  podcast_description: string | null; // Description text
  podcast_categories: any;       // Category information
  audience_size: number | null;  // Estimated audience size
  similarity: number;            // Semantic similarity score (0.0-1.0)
  relevance_score?: number;      // AI-evaluated relevance (0-10)
  relevance_reason?: string;     // AI explanation for relevance
}
```

## Supabase Integration

### Database Tables

**1. `prospect_dashboards`**
```sql
- id: UUID (primary key)
- slug: TEXT (unique 8-character identifier)
- prospect_name: TEXT
- prospect_bio: TEXT (nullable)
- prospect_image_url: TEXT (nullable)
- spreadsheet_id: TEXT (nullable, extracted from Google Sheets URL)
- spreadsheet_url: TEXT (nullable)
- content_ready: BOOLEAN (dashboard publication status)
- personalized_tagline: TEXT (nullable)
- created_at: TIMESTAMP
```

**2. `prospect_podcast_links`**
```sql
- prospect_id: UUID (foreign key to prospect_dashboards)
- podcast_id: UUID (foreign key to podcasts table)
- similarity_score: NUMERIC (embedding similarity)
- matched_at: TIMESTAMP
- Primary key: (prospect_id, podcast_id)
```

### Database Functions

**`search_similar_podcasts`**
- Uses pgvector for semantic similarity search
- Parameters: `query_embedding`, `match_threshold`, `match_count`
- Returns podcasts ranked by embedding similarity
- Operates on 7,884 podcasts across 67 categories

### Authentication

- Uses Supabase service role key for full database access
- Required environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## OpenAI Integration

### Embedding Generation

**Model**: `text-embedding-3-small`
**Dimensions**: 1536
**Purpose**: Convert prospect profiles into vector embeddings for semantic search

### Prospect Profile Enhancement

The system creates rich text representations optimized for semantic matching:

```typescript
// Enhanced prospect profile structure
{
  name: string;
  bio?: string;
  industry?: string;
  expertise?: string[];
  target_audience?: string;
  topics?: string[];
  company?: string;
  title?: string;
  content_themes?: string;
  value_proposition?: string;
}
```

**Text Formatting for Embedding**:
1. **Guest Name** - Critical for personal brand matching
2. **Role & Company** - Professional context
3. **Industry** - Category-specific podcast matching
4. **Expertise** - Core competencies for topical alignment
5. **Topics** - Specific subjects for discussion
6. **Target Audience** - Podcast listener demographic matching
7. **Value Proposition** - Unique insights offered
8. **Content Themes** - Overarching message alignment
9. **Background** - Comprehensive bio (truncated at 500 chars)

### Configuration Issues

⚠️ **Note**: The current implementation has a configuration inconsistency:
- `openai.ts` references `config.openai.apiKey`
- `config.ts` does not export this property
- Likely needs environment variable `OPENAI_API_KEY` added to config

## Anthropic Integration

### AI-Powered Podcast Filtering

**Model**: `claude-sonnet-4-5-20250929`
**Purpose**: Evaluate podcast relevance and provide explanatory reasoning

### Evaluation Criteria

The AI evaluates podcasts on a 0-10 scale based on:

1. **Topical Alignment** - Does the podcast cover the guest's expertise areas?
2. **Audience Match** - Would listeners benefit from this guest?
3. **Format Fit** - Does the podcast style suit the guest's profile?
4. **Authority Fit** - Does expertise level match podcast depth?

### Scoring Guidelines

- **9-10**: Perfect match - direct expertise alignment
- **7-8**: Strong match - good topic overlap and audience fit
- **5-6**: Moderate match - some relevance but not ideal
- **0-4**: Poor match - misaligned topics, audience, or format

Only podcasts scoring 5+ are included in final results.

### Configuration Issues

⚠️ **Note**: Similar configuration inconsistency:
- `match-podcasts.ts` references `config.anthropic.apiKey`
- `config.ts` does not export this property
- Likely needs environment variable `ANTHROPIC_API_KEY` added to config

## Prospect/Podcast Matching Logic

### Step-by-Step Matching Process

1. **Profile Creation**
   ```typescript
   const prospectText = createProspectText(name, bio, additionalProfile);
   ```
   - Combines all available prospect information
   - Formats for optimal semantic search
   - Prioritizes expertise, industry, and topics

2. **Embedding Generation**
   ```typescript
   const embedding = await generateProspectEmbedding(prospectText);
   ```
   - Converts text to 1536-dimensional vector
   - Uses OpenAI's text-embedding-3-small model

3. **Similarity Search**
   ```sql
   SELECT * FROM search_similar_podcasts(embedding, threshold, count);
   ```
   - pgvector cosine similarity search
   - Searches 7,884 podcasts across 67 categories
   - Returns matches above similarity threshold

4. **AI Quality Filtering** (if enabled)
   - Sends top candidates to Claude for evaluation
   - Gets relevance scores (0-10) and explanatory reasoning
   - Filters out matches scoring below 5
   - Sorts by AI relevance score, then similarity

5. **Fallback Guarantee**
   - Ensures minimum 15 results returned
   - Lowers threshold if insufficient matches found
   - Balances quality vs. quantity based on AI filtering setting

6. **Export Integration** (optional)
   - Stores matches in `prospect_podcast_links` table
   - Links to prospect's Google Sheet if provided
   - Maintains match history and similarity scores

### Matching Quality Features

- **Semantic Understanding**: Embeddings capture meaning beyond keywords
- **AI Verification**: Human-like evaluation of fit and relevance
- **Explanatory Reasoning**: AI provides specific match rationale
- **Category Diversity**: Searches across 67 podcast categories
- **Scale**: 7,884+ podcasts in database
- **Minimum Results Guarantee**: Always returns at least 15 matches

## Dashboard Creation Flow

### Complete Workflow

1. **Dashboard Creation**
   ```typescript
   // Create prospect dashboard
   const result = await createProspect({
     prospect_name: "John Smith",
     bio: "Marketing expert with 10+ years...",
     profile_picture_url: "https://...",
     google_sheet_url: "https://docs.google.com/spreadsheets/d/..."
   });
   // Returns: { success: true, prospect: { id, slug, dashboard_url, ... }}
   ```

2. **Podcast Matching**
   ```typescript
   // Find matching podcasts
   const matches = await matchPodcastsForProspect({
     prospect_name: "John Smith",
     prospect_bio: "Marketing expert...",
     prospect_id: result.prospect.id,
     match_count: 50,
     use_ai_filter: true,
     export_to_sheet: true
   });
   // Returns: { success: true, data: { matches: [...], total_matches: 45, ... }}
   ```

3. **Dashboard Publishing**
   ```typescript
   // Enable dashboard for prospect viewing
   const published = await enableProspectDashboard({
     prospect_id: result.prospect.id,
     tagline: "Marketing Innovation Expert - 10+ years of proven results"
   });
   // Returns: { success: true, dashboard_url: "https://...", enabled_at: "..." }
   ```

### URL Structure

**Dashboard URL Format**: `{APP_URL}/prospect/{slug}`
- Example: `https://getonapod.com/prospect/abc123xy`
- Public-facing prospect dashboard page
- Shows when `content_ready: true`

### Integration Points

1. **Google Sheets Integration**
   - Extracts spreadsheet ID from full URLs
   - Supports both full URLs and direct IDs
   - Links podcast matches to sheets via `prospect_podcast_links`

2. **Frontend Dashboard**
   - Displays prospect information and matches
   - Shows AI relevance scores and explanations
   - Provides podcast contact information
   - Tracks engagement and outreach status

3. **Workflow Automation**
   - MCP enables AI assistants to manage entire prospect flow
   - Single conversation can create, populate, and publish dashboards
   - Integrates with broader sales and marketing automation

## Environment Requirements

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional (defaults to https://getonapod.com)
APP_URL=https://your-domain.com

# Missing from config but referenced in code
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Technical Architecture

### Dependencies

- **@modelcontextprotocol/sdk**: MCP server framework
- **@supabase/supabase-js**: Database client
- **@anthropic-ai/sdk**: AI evaluation service
- **openai**: Embedding generation (implied dependency)
- **zod**: Input validation and type safety
- **dotenv**: Environment configuration

### Error Handling

- Comprehensive try-catch blocks in all tools
- Validation using Zod schemas
- Graceful fallbacks for AI services
- Detailed error messages in responses

### Performance Considerations

- **Embedding Caching**: Consider caching embeddings for repeat searches
- **AI Filtering Batching**: Processes multiple podcasts in single AI call
- **Database Optimization**: Uses pgvector for efficient similarity search
- **Fallback Strategy**: Multiple search passes for guaranteed results

### Security

- **Service Role Access**: Uses Supabase service role for full database permissions
- **Input Validation**: Zod schemas prevent malformed inputs
- **UUID Safety**: Validates UUIDs for prospect_id parameters
- **API Key Management**: Environment-based configuration (needs completion)

## Future Enhancements

1. **Configuration Fixes**
   - Add missing OpenAI and Anthropic API keys to config
   - Standardize environment variable handling

2. **Caching Layer**
   - Cache embeddings for frequently matched prospects
   - Cache podcast data for faster searches

3. **Advanced Matching**
   - Multi-modal matching (images, audio samples)
   - Industry-specific matching weights
   - Geographic matching for local podcasts

4. **Analytics Integration**
   - Track matching success rates
   - A/B testing for AI filtering strategies
   - Performance metrics and optimization

5. **Batch Operations**
   - Bulk prospect processing
   - Automated re-matching for prospect updates
   - Scheduled matching refreshes