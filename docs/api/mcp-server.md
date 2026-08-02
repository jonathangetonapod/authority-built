# MCP Prospect Dashboard Server - API Documentation

## Overview

The MCP Prospect Dashboard Server is a Model Context Protocol (MCP) server that provides automated prospect dashboard management for podcast booking and outreach. It's designed to be BridgeKit-compatible, allowing HTTP access to MCP tools through BridgeKit's MCP-to-HTTP bridge.

**Server Info:**
- **Name**: `prospect-dashboard`
- **Version**: `1.0.0`
- **Protocol**: Model Context Protocol (MCP)
- **Transport**: STDIO
- **BridgeKit Compatible**: Yes (via MCP bridge)

## Architecture

The server is built with:
- **Language**: TypeScript/Node.js
- **Framework**: @modelcontextprotocol/sdk
- **Database**: Supabase (PostgreSQL)
- **AI Services**: OpenAI (embeddings), Anthropic Claude (filtering)
- **Validation**: Zod schemas

## Environment Configuration

Required environment variables:

```bash
# Supabase Configuration
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Application Configuration  
APP_URL=https://getonapod.com

# AI Service Keys (Required for match_podcasts)
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## BridgeKit Integration

### HTTP Endpoints

When deployed with BridgeKit's MCP-to-HTTP bridge, the following HTTP endpoints become available:

```bash
# List available tools
GET /tools

# Execute tools
POST /tools/{tool_name}
Content-Type: application/json

{
  "arguments": {
    "parameter_name": "value"
  }
}
```

### Example BridgeKit Usage

```bash
# List all available MCP tools
curl -X GET http://your-bridgekit-server/tools

# Create a new prospect
curl -X POST http://your-bridgekit-server/tools/create_prospect \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "prospect_name": "Sarah Johnson",
      "bio": "Marketing expert with 15 years experience"
    }
  }'
```

## Available MCP Tools

### 1. `create_prospect`

Creates a new prospect dashboard with automatic slug generation and optional Google Sheets integration.

#### Description
Use when user says things like "create a new prospect called NAME" or "add prospect NAME" or "create prospect for NAME". Optionally accepts bio, profile picture URL, and Google Sheet URL to link.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prospect_name` | `string` | ✅ | Prospect's full name |
| `bio` | `string` | ❌ | Bio/background information (optional) |
| `profile_picture_url` | `string` | ❌ | Profile picture URL (optional) |
| `google_sheet_url` | `string` | ❌ | Google Sheet URL to link (optional) |
| `industry` | `string` | ❌ | Industry vertical e.g. SaaS, Healthcare, Finance (optional) |
| `expertise` | `string[]` | ❌ | Areas of expertise for better podcast matching (optional) |
| `topics` | `string[]` | ❌ | Topics the prospect can speak on (optional) |
| `target_audience` | `string` | ❌ | Description of the prospect's target audience (optional) |
| `company` | `string` | ❌ | Company name (optional) |
| `title` | `string` | ❌ | Job title (optional) |

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "prospect_name": {
      "type": "string",
      "description": "Prospect full name"
    },
    "bio": {
      "type": "string",
      "description": "Bio/background (optional)"
    },
    "profile_picture_url": {
      "type": "string",
      "description": "Profile picture URL (optional)"
    },
    "google_sheet_url": {
      "type": "string",
      "description": "Google Sheet URL to link (optional)"
    },
    "industry": {
      "type": "string",
      "description": "Industry vertical e.g. SaaS, Healthcare, Finance (optional)"
    },
    "expertise": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Areas of expertise for better podcast matching (optional)"
    },
    "topics": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Topics the prospect can speak on (optional)"
    },
    "target_audience": {
      "type": "string",
      "description": "Description of the prospect target audience (optional)"
    },
    "company": {
      "type": "string",
      "description": "Company name (optional)"
    },
    "title": {
      "type": "string",
      "description": "Job title (optional)"
    }
  },
  "required": ["prospect_name"]
}
```

#### Return Value
```json
{
  "success": true,
  "prospect": {
    "id": "uuid-string",
    "name": "Sarah Johnson", 
    "slug": "abc12345",
    "dashboard_url": "https://getonapod.com/prospect/abc12345",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/xyz123" 
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

#### Implementation Details
- Generates unique 8-character alphanumeric slug for dashboard URL
- Creates record in `prospect_dashboards` table with `content_ready=true` (dashboard is published immediately)
- Extracts spreadsheet ID from Google Sheets URLs automatically
- Stores structured profile fields (`industry`, `expertise`, `topics`, `target_audience`, `company`, `title`) for richer podcast matching

---

### 2. `enable_prospect_dashboard` (NOT REGISTERED)

> **Note:** This tool exists as implementation code in `src/tools/enable-dashboard.ts` but is **not registered** in `index.ts` and therefore **not available** via MCP. The `create_prospect` tool now sets `content_ready=true` by default, making this tool unnecessary for most workflows. It is documented here for reference only.

Enables/publishes a prospect dashboard so the prospect can view it. Sets `content_ready=true` and optionally adds a personalized tagline.

#### Description
Enable/publish a prospect dashboard so the prospect can view it. Sets content_ready=true and optionally adds a tagline.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prospect_id` | `string` | ✅ | Prospect UUID from create_prospect |
| `tagline` | `string` | ❌ | Optional personalized tagline for the dashboard |

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "prospect_id": {
      "type": "string",
      "description": "Prospect UUID from create_prospect"
    },
    "tagline": {
      "type": "string",
      "description": "Optional personalized tagline for the dashboard"
    }
  },
  "required": ["prospect_id"]
}
```

#### Return Value
```json
{
  "success": true,
  "dashboard_url": "https://getonapod.com/prospect/abc12345",
  "enabled_at": "2026-01-21T10:30:00.000Z"
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

#### Implementation Details
- Updates `content_ready` field to `true` in database
- Optionally sets `personalized_tagline` if provided
- Dashboard becomes publicly accessible at the generated URL
- Returns ISO timestamp of when dashboard was enabled

---

### 3. `match_podcasts`

Advanced AI-powered podcast matching using semantic search. Analyzes prospect profiles and returns ranked podcast recommendations with AI-quality filtering.

#### Description
Match a prospect to relevant podcasts using AI-powered semantic search. Finds podcasts that align with the prospect's expertise, topics, and audience. When `prospect_id` is provided, structured profile fields (industry, expertise, topics, etc.) are fetched from the database for richer embeddings, and previously rejected podcasts are excluded from results. Guarantees at least 15 results.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prospect_name` | `string` | ✅ | - | Prospect's full name |
| `prospect_bio` | `string` | ❌ | - | Prospect bio/background - more detailed = better matches |
| `prospect_id` | `string` | ❌ | - | Prospect dashboard UUID - enables feedback exclusion and structured field lookup |
| `match_threshold` | `number` | ❌ | `0.30` | Minimum similarity score (0.0-1.0) |
| `match_count` | `number` | ❌ | `50` | Maximum results to return (1-100) |
| `use_ai_filter` | `boolean` | ❌ | `true` | Use AI quality filtering (recommended) |
| `export_to_sheet` | `boolean` | ❌ | `false` | Export results to linked Google Sheet |

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "prospect_name": {
      "type": "string",
      "description": "Prospect full name"
    },
    "prospect_bio": {
      "type": "string",
      "description": "Bio/background for matching (optional)"
    },
    "prospect_id": {
      "type": "string",
      "description": "Prospect dashboard UUID - enables feedback exclusion and structured field lookup (optional)"
    },
    "match_threshold": {
      "type": "number",
      "description": "Minimum similarity threshold 0-1 (default: 0.30)"
    },
    "match_count": {
      "type": "number",
      "description": "Maximum number of matches to return (default: 50)"
    },
    "use_ai_filter": {
      "type": "boolean",
      "description": "Use AI to filter and rank results (default: true)"
    },
    "export_to_sheet": {
      "type": "boolean",
      "description": "Export matches to the prospect Google Sheet (default: false)"
    }
  },
  "required": ["prospect_name"]
}
```

#### Return Value
```json
{
  "success": true,
  "data": {
    "prospect_text": "Guest: Sarah Johnson\nRole: Marketing Director at TechCorp\nBackground: Marketing expert with 15 years experience...",
    "matches": [
      {
        "id": "podcast-uuid",
        "podscan_id": "podscan-id",
        "podcast_name": "Marketing Mastery Podcast",
        "podcast_description": "Weekly conversations with marketing leaders...", 
        "podcast_categories": [
          {"category_name": "Business"},
          {"category_name": "Marketing"}
        ],
        "audience_size": 50000,
        "similarity": 0.85,
        "relevance_score": 9,
        "relevance_reason": "Perfect alignment with guest's marketing expertise and podcast's focus on advanced marketing strategies for executives"
      }
    ],
    "total_matches": 42,
    "threshold_used": 0.30,
    "exported_to_sheet": true,
    "sheet_url": "https://docs.google.com/spreadsheets/d/xyz123"
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": "Validation error: Prospect name is required"
}
```

#### AI Features

**Embedding Generation:**
- Uses OpenAI `text-embedding-3-small` model (1536 dimensions)
- Creates rich prospect profile text combining name, bio, expertise, industry
- Optimizes text representation for semantic search accuracy

**AI Quality Filtering:**
- Uses Anthropic Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) for podcast relevance evaluation
- Scores podcasts 0-10 based on topical alignment, audience match, format fit
- Only returns podcasts scoring 5+ for quality assurance
- Provides specific relevance explanations for each match

**Feedback Exclusion:**
- When `prospect_id` is provided, queries `prospect_podcast_feedback` table
- Excludes podcasts previously rejected by the prospect
- Fetches structured profile fields for richer embeddings

**Semantic Search:**
- Searches the full podcast database using PostgreSQL pgvector for cosine similarity
- Guarantees minimum 15 results through fallback search strategies (lowers threshold to -1.0 if needed)
- When AI filtering is enabled, fetches up to 100 candidates for evaluation
- Combines similarity scores with AI relevance ratings for final ranking

#### Google Sheets Export

When `export_to_sheet=true` and `prospect_id` is provided:
- Creates `prospect_podcast_links` records in database
- Links podcasts to prospect with similarity scores and timestamps
- Returns Google Sheets URL for external access
- Supports upsert operations (updates existing matches)

#### Implementation Details
- **Validation**: Uses Zod schemas for robust input validation
- **Error Handling**: Graceful degradation with fallback search strategies
- **Performance**: Efficient database functions for vector similarity search
- **Scalability**: Batched AI processing for large result sets

## Database Schema

### Tables Used

#### `prospect_dashboards`
```sql
CREATE TABLE prospect_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(8) UNIQUE NOT NULL,
  prospect_name VARCHAR NOT NULL,
  prospect_bio TEXT,
  prospect_image_url TEXT,
  spreadsheet_id VARCHAR,
  spreadsheet_url TEXT,
  personalized_tagline TEXT,
  content_ready BOOLEAN DEFAULT FALSE,
  prospect_industry TEXT,
  prospect_expertise TEXT[],
  prospect_topics TEXT[],
  prospect_target_audience TEXT,
  prospect_company TEXT,
  prospect_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `prospect_podcast_links` 
```sql
CREATE TABLE prospect_podcast_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospect_dashboards(id),
  podcast_id UUID REFERENCES podcasts(id),
  similarity_score DECIMAL(5,4),
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prospect_id, podcast_id)
);
```

#### `prospect_podcast_feedback`
```sql
CREATE TABLE prospect_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID REFERENCES prospect_dashboards(id),
  podcast_id UUID REFERENCES podcasts(id),
  podcast_name TEXT,
  status TEXT, -- 'approved' | 'rejected'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `podcasts`
Existing table with podcast records including:
- `id`, `podscan_id`, `podcast_name`, `podcast_description`
- `podcast_categories` (JSONB)
- `audience_size`, `embedding` (vector)

### Database Functions

#### `search_similar_podcasts`
```sql
CREATE OR REPLACE FUNCTION search_similar_podcasts(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE (
  id uuid,
  podscan_id text,
  podcast_name text,
  podcast_description text,
  podcast_categories jsonb,
  audience_size integer,
  similarity double precision
)
```

## Error Handling

### Common Error Types

#### Validation Errors
```json
{
  "success": false,
  "error": "Validation error: Prospect name is required"
}
```

#### Database Errors
```json
{
  "success": false,
  "error": "Failed to create prospect: duplicate key value violates unique constraint"
}
```

#### AI Service Errors
```json
{
  "success": false,
  "error": "Failed to generate embedding: OpenAI API key not configured"
}
```

#### Export Errors
```json
{
  "success": false,
  "error": "No Google Sheet linked to this prospect"
}
```

## Installation & Setup

### 1. Install Dependencies

**Current dependencies:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "@supabase/supabase-js": "^2.89.0", 
    "zod": "^3.25.0",
    "dotenv": "^16.0.0"
  }
}
```

**Missing dependencies** (required by code but not in package.json):
```bash
npm install openai @anthropic-ai/sdk
```

### 2. Environment Setup
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Build and Run
```bash
npm run build
npm start
```

### 4. MCP Configuration

Add to Claude Code settings:
```json
{
  "mcpServers": {
    "prospect-dashboard": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-key",
        "APP_URL": "https://getonapod.com",
        "OPENAI_API_KEY": "your-openai-key",
        "ANTHROPIC_API_KEY": "your-anthropic-key"
      }
    }
  }
}
```

## Performance & Limits

### Rate Limits
- **OpenAI Embeddings**: Subject to OpenAI API limits
- **Anthropic Claude**: Subject to Anthropic API limits  
- **Database**: Supabase connection pooling limits

### Response Times
- `create_prospect`: ~200-500ms
- `enable_prospect_dashboard`: ~100-300ms (not registered; call via Supabase directly)
- `match_podcasts`: ~2-15s (depends on AI filtering)

### Data Limits
- **Podcast Database**: Growing database of podcasts across many categories (check `podcasts` table for current count)
- **Search Results**: Maximum 100 matches per request
- **Guaranteed Minimum**: 15 results (with fallback strategies)
- **Bio Length**: Truncated at 500 characters for embedding

## Security Considerations

### Authentication
- Uses Supabase service role key for database access
- No built-in authentication (relies on MCP client security)

### Data Privacy
- Prospect information stored in database
- AI services (OpenAI/Anthropic) receive prospect data for processing
- No data retention policies implemented

### Input Validation  
- Zod schemas validate all inputs
- SQL injection protection via Supabase client
- UUID validation for database references

## Troubleshooting

### Common Issues

**"Missing required environment variable"**
- Ensure all environment variables are set in both `.env` and MCP config
- Check that AI service API keys are provided for podcast matching

**"Failed to generate embedding"**  
- Verify `OPENAI_API_KEY` is valid and has credits
- Check OpenAI API rate limits and quotas

**"Database search failed"**
- Verify Supabase connection and service role permissions
- Check that `search_similar_podcasts` function exists
- Ensure `podcasts` table has embedding column populated

**"No Google Sheet linked to this prospect"**
- Provide `google_sheet_url` when creating prospect, or
- Export is only available when prospect has linked spreadsheet

### Debug Mode

Enable detailed logging by setting:
```bash
NODE_ENV=development
```

## Development Notes

### Code Structure
```
src/
├── index.ts                    # MCP server setup and tool routing
├── config.ts                   # Environment configuration
├── tools/
│   ├── create-dashboard.ts     # Prospect creation logic
│   ├── enable-dashboard.ts     # Dashboard publishing logic  
│   └── match-podcasts.ts       # AI-powered podcast matching
└── services/
    ├── openai.ts              # OpenAI embedding generation
    └── supabase.ts            # Database client
```

### Future Enhancements
- Webhook support for real-time updates
- Batch podcast matching for multiple prospects
- Advanced filtering options (industry, audience size)
- Integration with calendar scheduling
- Email notification system
- Custom branding options for dashboards

---

**Last Updated**: March 2026  
**Version**: 1.0.0  
**License**: Proprietary - Get On A Pod