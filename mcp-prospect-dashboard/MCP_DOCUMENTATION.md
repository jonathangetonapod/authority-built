# Prospect Dashboard MCP

**Part of vridgekit** - A Model Context Protocol (MCP) server for AI-powered prospect management and podcast matching.

## Overview

The Prospect Dashboard MCP automates the creation and management of prospect dashboards with intelligent podcast recommendations. It uses a sophisticated two-stage AI matching system that combines vector embeddings with Claude's reasoning to find truly relevant podcast opportunities for your prospects.

## What It Does

This MCP provides three core capabilities:

1. **Create Prospect Dashboards** - Automatically generate personalized prospect pages with optional Google Sheets integration
2. **Enable/Publish Dashboards** - Control when prospects can view their curated content
3. **AI-Powered Podcast Matching** - Find relevant podcasts from a database of 2,431+ shows using semantic search + Claude evaluation

## How It Works

### Two-Stage AI Matching System

The podcast matching system uses a hybrid approach that combines the speed of vector search with the intelligence of large language models:

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGE 1: SEMANTIC SEARCH                  │
│                                                              │
│  Prospect Profile → OpenAI Embedding → Vector Database      │
│  "AI entrepreneur"   (1536 dimensions)   (2,431 podcasts)   │
│                                                              │
│  Output: 30-50 podcasts ranked by cosine similarity         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 STAGE 2: CLAUDE EVALUATION                   │
│                                                              │
│  Claude Sonnet 4.5 evaluates each podcast:                  │
│  • Relevance score (5-10 scale)                             │
│  • Detailed explanation of why it matches                    │
│  • Filters out generic/irrelevant matches                    │
│                                                              │
│  Output: 14-15 high-quality, AI-verified matches            │
└─────────────────────────────────────────────────────────────┘
```

### Why Two Stages?

- **Stage 1 (Vector Search)**: Fast, efficient, scales to millions of podcasts
- **Stage 2 (Claude)**: Ensures quality, provides explanations, filters false positives

This approach gives you the best of both worlds: speed + intelligence.

## Architecture

### Tech Stack

- **Vector Database**: Supabase (PostgreSQL + pgvector)
- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **AI Evaluation**: Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
- **Framework**: Model Context Protocol (MCP) SDK
- **Runtime**: Node.js + TypeScript

### Data Flow

```
┌──────────────┐
│ Claude Code  │
│  (User)      │
└──────┬───────┘
       │
       ↓
┌─────────────────────────────────────────┐
│   MCP Server (prospect-dashboard)       │
│                                          │
│  Tools:                                  │
│  • create_prospect                       │
│  • enable_prospect_dashboard             │
│  • match_podcasts_for_prospect          │
└────┬──────────────────────────┬─────────┘
     │                          │
     ↓                          ↓
┌──────────┐            ┌───────────────┐
│ Supabase │            │  AI Services  │
│          │            │               │
│ • Podcasts DB        │ • OpenAI      │
│ • Vector Search      │ • Anthropic   │
│ • Prospect Data      │               │
└──────────┘            └───────────────┘
```

## Installation

### Prerequisites

- Node.js 22.22.2 and npm 10.9.7
- Supabase account with podcast database
- OpenAI API key (for embeddings)
- Anthropic API key (for Claude)

### Setup

1. **Install dependencies:**
```bash
cd mcp-prospect-dashboard
npm ci --ignore-scripts
```

2. **Configure environment variables:**

Create a `.env` file:
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application Configuration
APP_URL=https://getonapod.com

# OpenAI Configuration (for embeddings)
OPENAI_API_KEY=sk-proj-your-openai-key

# Anthropic Configuration (for AI filtering)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

3. **Build the project:**
```bash
npm run build
```

4. **Configure in Claude Desktop:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "prospect-dashboard": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-prospect-dashboard/dist/index.js"
      ],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "APP_URL": "https://getonapod.com",
        "OPENAI_API_KEY": "sk-proj-your-openai-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-anthropic-key"
      }
    }
  }
}
```

## Available Tools

### 1. create_prospect

Creates a new prospect dashboard with optional Google Sheets integration.

**Input:**
```typescript
{
  prospect_name: string;           // Required
  bio?: string;                    // Optional but recommended
  profile_picture_url?: string;    // Optional
  google_sheet_url?: string;       // Optional
}
```

**Output:**
```json
{
  "success": true,
  "prospect": {
    "id": "uuid-here",
    "name": "Sarah Johnson",
    "slug": "abc12345",
    "dashboard_url": "https://getonapod.com/prospect/abc12345",
    "spreadsheet_url": "https://docs.google.com/spreadsheets/d/..."
  }
}
```

**Example:**
```
User: Create a prospect for Sarah Johnson, marketing consultant specializing in SaaS

Claude: [Uses create_prospect tool]
Result: Dashboard created at https://getonapod.com/prospect/abc12345
```

---

### 2. enable_prospect_dashboard

Publishes a prospect dashboard so they can view it (sets content_ready=true).

**Input:**
```typescript
{
  prospect_id: string;    // Required: UUID from create_prospect
  tagline?: string;       // Optional: Personalized tagline
}
```

**Output:**
```json
{
  "success": true,
  "dashboard_url": "https://getonapod.com/prospect/abc12345",
  "enabled_at": "2026-01-29T..."
}
```

---

### 3. match_podcasts_for_prospect

**The flagship feature** - Uses AI to find relevant podcasts for a prospect.

**Input:**
```typescript
{
  prospect_name: string;           // Required
  prospect_bio?: string;           // Optional but highly recommended
  match_threshold?: number;        // 0.0-1.0, default: 0.2
  match_count?: number;            // Default: 50, Max: 100
  prospect_id?: string;            // Required for export
  export_to_sheet?: boolean;       // Default: false
  use_ai_filter?: boolean;         // Default: true (recommended!)
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "prospect_text": "Name: Sarah Johnson. Background: Marketing consultant...",
    "matches": [
      {
        "id": "uuid",
        "podscan_id": "123456",
        "podcast_name": "Marketing Masters",
        "podcast_description": "A podcast about marketing strategies...",
        "podcast_categories": [{"category_name": "Business"}],
        "audience_size": 50000,
        "similarity": 0.89,
        "relevance_score": 9,
        "relevance_reason": "Perfect match for SaaS marketing expertise..."
      }
    ],
    "total_matches": 14,
    "threshold_used": 0.2
  }
}
```

**Example:**
```
User: Find matching podcasts for a tech entrepreneur focused on AI and machine learning

Claude: [Uses match_podcasts_for_prospect with use_ai_filter: true]
Result:
✓ Found 14 AI-verified matches
- The Digital Executive (9/10): "Daily tech podcast featuring Silicon Valley CEOs..."
- This Week in Tech (8/10): "Top-ranked tech podcast covering AI..."
- In Good Company (7/10): "Features interviews with leaders..."
```

## The AI Matching Algorithm

### Detailed Process Flow

```python
def match_podcasts(prospect_name, prospect_bio):
    # 1. Create prospect representation
    prospect_text = f"Name: {prospect_name}. Background: {prospect_bio}"

    # 2. Generate embedding (OpenAI)
    embedding = openai.embeddings.create(
        model="text-embedding-3-small",
        input=prospect_text,
        dimensions=1536
    )

    # 3. Vector search (Supabase)
    initial_matches = supabase.rpc('search_similar_podcasts',
        query_embedding=embedding,
        match_threshold=0.2,
        match_count=60  # Get extra candidates for AI filtering
    )

    # 4. Fallback if needed (ensures 14+ results)
    if len(initial_matches) < 45:
        additional = supabase.rpc('search_similar_podcasts',
            query_embedding=embedding,
            match_threshold=-1.0,  # Get all matches
            match_count=100
        )
        initial_matches = deduplicate(initial_matches + additional)

    # 5. Claude evaluation (AI filtering)
    evaluations = claude.messages.create(
        model="claude-sonnet-4-5-20250929",
        messages=[{
            "role": "user",
            "content": f"""Evaluate these podcasts for: {prospect_text}

            Return JSON array with relevance_score (5-10) and reason.
            Only include scores 5+."""
        }]
    )

    # 6. Combine AI-verified + similarity-sorted
    ai_verified = [m for m in evaluations if m.score >= 5]
    remaining = sort_by_similarity(initial_matches - ai_verified)

    return ai_verified + remaining[:15 - len(ai_verified)]
```

### Quality Guarantees

**AI Relevance Scores:**
- 9-10: Exceptional match, highly recommend
- 7-8: Strong match, very relevant
- 6: Good match, relevant
- 5: Moderately relevant, worth including
- <5: Filtered out automatically

**Semantic Similarity Scores:**
- 0.4-1.0: Excellent semantic match
- 0.3-0.4: Good semantic match
- 0.25-0.3: Moderate match (minimum for fallback)
- <0.25: Too generic, excluded

## Performance & Cost

### Speed
- Without AI filter: 1-2 seconds
- With AI filter: 3-5 seconds (recommended)

### Cost per Search
- Embeddings (OpenAI): ~$0.00002
- AI filtering (Claude): ~$0.003-0.006
- **Total: ~$0.006 per search**

At scale:
- 100 searches: $0.60
- 1,000 searches: $6.00
- 10,000 searches: $60.00

### Database Performance
- 2,431 podcasts with embeddings
- IVFFlat index on embeddings (100 lists)
- Cosine distance operator (`<=>`)
- Search time: 50-200ms

## Use Cases

### 1. Prospect Outreach
```
Create a prospect → Match podcasts → Enable dashboard → Send to prospect
```

### 2. Batch Processing
```
For each prospect in list:
  - Create prospect
  - Match podcasts
  - Export to Google Sheet
  - Enable dashboard
```

### 3. Quality Control
```
Match podcasts with use_ai_filter: true
Review AI relevance scores
Manually approve/reject before sending
```

## Database Schema

### Key Tables

**prospects_dashboards:**
```sql
CREATE TABLE prospect_dashboards (
  id UUID PRIMARY KEY,
  slug VARCHAR(8) UNIQUE,
  prospect_name TEXT,
  prospect_bio TEXT,
  prospect_image_url TEXT,
  spreadsheet_id TEXT,
  spreadsheet_url TEXT,
  content_ready BOOLEAN DEFAULT false,
  personalized_tagline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**podcasts:**
```sql
CREATE TABLE podcasts (
  id UUID PRIMARY KEY,
  podscan_id TEXT UNIQUE,
  podcast_name TEXT,
  podcast_description TEXT,
  podcast_categories JSONB,
  audience_size INTEGER,
  embedding vector(1536),  -- pgvector
  embedding_generated_at TIMESTAMPTZ,
  embedding_model TEXT DEFAULT 'text-embedding-3-small'
);

-- IVFFlat index for fast similarity search
CREATE INDEX podcasts_embedding_idx
  ON podcasts
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

**prospect_podcast_links:**
```sql
CREATE TABLE prospect_podcast_links (
  prospect_id UUID REFERENCES prospect_dashboards(id),
  podcast_id UUID REFERENCES podcasts(id),
  similarity_score FLOAT,
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (prospect_id, podcast_id)
);
```

### Key Function

**search_similar_podcasts:**
```sql
CREATE OR REPLACE FUNCTION search_similar_podcasts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  podscan_id text,
  podcast_name text,
  podcast_description text,
  podcast_categories jsonb,
  audience_size integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.podscan_id,
    p.podcast_name,
    p.podcast_description,
    p.podcast_categories,
    p.audience_size,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM podcasts p
  WHERE p.embedding IS NOT NULL
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

## Best Practices

### For Prospect Matching

1. **Always provide a bio** - More context = better matches
   ```typescript
   // Good
   match_podcasts_for_prospect({
     prospect_name: "Sarah Johnson",
     prospect_bio: "Marketing consultant specializing in SaaS startups, growth hacking, and product-led growth strategies"
   })

   // Bad (limited context)
   match_podcasts_for_prospect({
     prospect_name: "Sarah Johnson"
   })
   ```

2. **Use AI filtering for prospects** - Default is true, keep it that way
   ```typescript
   use_ai_filter: true  // Ensures quality, adds explanations
   ```

3. **Start with default threshold** - Adjust only if needed
   ```typescript
   match_threshold: 0.2  // Default works for most cases
   ```

### For Production

1. **Cache prospect embeddings** (future optimization)
2. **Batch process during off-hours** if doing hundreds
3. **Monitor API costs** with OpenAI and Anthropic dashboards
4. **Log relevance scores** to tune thresholds over time

## Troubleshooting

### Issue: No matches found
**Solution:** Lower the threshold or ensure prospect bio has enough detail
```typescript
match_threshold: 0.15  // More permissive
```

### Issue: Too many irrelevant matches
**Solution:** Ensure AI filtering is enabled
```typescript
use_ai_filter: true  // Should be default
```

### Issue: Slow performance
**Solution:** Disable AI filtering for bulk operations
```typescript
use_ai_filter: false  // Faster, but lower quality
```

### Issue: Missing API keys
**Error:** `Missing required environment variable: ANTHROPIC_API_KEY`

**Solution:** Ensure all keys are in `.env`:
```bash
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Extending the MCP

### Adding New Tools

1. Create tool file in `src/tools/`:
```typescript
// src/tools/my-new-tool.ts
export async function myNewTool(input: MyInput): Promise<MyResponse> {
  // Implementation
}
```

2. Register in `src/index.ts`:
```typescript
import { myNewTool } from './tools/my-new-tool.js';

// Add to ListToolsRequestSchema
{
  name: 'my_new_tool',
  description: '...',
  inputSchema: { ... }
}

// Add to CallToolRequestSchema
case 'my_new_tool':
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(await myNewTool(args), null, 2)
    }]
  };
```

### Adding New AI Models

To use a different model for filtering:
```typescript
// src/tools/match-podcasts.ts
const response = await anthropic.messages.create({
  model: 'claude-opus-4-5-20251101',  // More powerful
  // or
  model: 'claude-haiku-4-5-20250929',  // Faster, cheaper
  ...
});
```

## Version History

### v1.0.0 (January 2026)
- Initial release
- Three core tools: create, enable, match
- Two-stage AI matching (OpenAI + Claude)
- Support for 2,431+ podcasts
- Google Sheets integration

## Contributing to vridgekit

This MCP is part of the larger vridgekit project. To contribute:

1. Follow the MCP SDK conventions
2. Maintain TypeScript strict mode
3. Add comprehensive error handling
4. Update documentation
5. Test with Claude Desktop

## License

Proprietary - Get On A Pod

## Support

For issues or questions about this MCP:
- GitHub: [your-repo]
- Email: [your-email]
- Documentation: This file

---

**Built with ❤️ as part of vridgekit**
