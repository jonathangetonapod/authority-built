# MCP Prospect Dashboard Server

A Model Context Protocol (MCP) server that automates creating prospect dashboards through Claude Code.

> Operator-only legacy tooling: this stdio process holds a Supabase service-role
> credential and is not a tenant or browser API. Run it only on a trusted
> administrator workstation, never expose it over HTTP, and do not include it in
> the invite-only tenant deployment.

## Features

- **Create Prospect**: Create a new prospect dashboard with just their name - automatically creates Google Sheet
- **Enable Prospect Dashboard**: Publish the dashboard so prospects can view it (sets content_ready=true)
- **Match Podcasts**: AI-powered semantic search to find relevant podcasts for prospects (searches 2,431+ podcasts)

## Installation

1. Clone or navigate to this directory:
```bash
cd mcp-prospect-dashboard
```

2. Install dependencies:
Requires Node 22.22.2 and npm 10.9.7. Install the reviewed lockfile:

```bash
npm ci --ignore-scripts
```

3. Create a `.env` file from the example:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_URL=https://getonapod.com
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
```

5. Build the project:
```bash
npm run build
```

## Configuration for Claude Code

Add this to your Claude Code MCP settings (typically `~/.config/claude/settings.json` or similar):

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
        "OPENAI_API_KEY": "sk-your-openai-api-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-anthropic-api-key"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/mcp-prospect-dashboard` with the actual absolute path to this directory.

## Available Tools

### 1. create_prospect

Creates a new prospect dashboard. Can either create a new Google Sheet or link an existing one.

**Parameters**:
- `prospect_name` (required): Prospect's full name
- `bio` (optional): Bio/background about the prospect
- `profile_picture_url` (optional): URL to profile picture
- `google_sheet_url` (optional): Link to existing Google Sheet. If not provided, creates a new sheet.

**Returns**:
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

### 2. enable_prospect_dashboard

Publishes the prospect dashboard so they can view it. Sets content_ready=true.

**Parameters**:
- `prospect_id` (required): Prospect UUID from create_prospect
- `tagline` (optional): Personalized tagline for the dashboard

**Returns**:
```json
{
  "success": true,
  "dashboard_url": "https://getonapod.com/prospect/abc12345",
  "enabled_at": "2026-01-21T..."
}
```

### 3. match_podcasts_for_prospect

Find matching podcasts for a prospect using AI-powered semantic search. Analyzes the prospect's name and bio, generates an embedding using OpenAI, and searches through 2,431+ podcasts to find the best matches ranked by similarity.

**Parameters**:
- `prospect_name` (required): Prospect's full name
- `prospect_bio` (optional): Prospect bio/background - more detailed = better matches
- `match_threshold` (optional): Minimum similarity score (0.0-1.0). Default: 0.2
- `match_count` (optional): Maximum results to return. Default: 50, Max: 100. **Targets minimum 15 results** - system will automatically lower threshold, but prioritizes quality over quantity when AI filtering is enabled
- `prospect_id` (optional): UUID from create_prospect (required for export_to_sheet)
- `export_to_sheet` (optional): Export results to prospect's Google Sheet. Default: false
- `use_ai_filter` (optional): Enable AI quality filtering (Claude Sonnet 4.5). Default: true (recommended for prospects)

**Returns**:
```json
{
  "success": true,
  "data": {
    "prospect_text": "Name: Sarah Johnson. Background: Marketing expert...",
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
        "relevance_reason": "Perfect fit for SaaS marketing expertise with focus on growth strategies"
      }
    ],
    "total_matches": 50,
    "threshold_used": 0.5,
    "exported_to_sheet": false
  }
}
```

**How It Works (Two-Stage AI Matching)**:
1. **Stage 1 - Semantic Search**: Creates a text representation combining prospect name and bio, generates a 1536-dimension embedding using OpenAI's text-embedding-3-small model, searches database using cosine similarity
2. **Stage 2 - AI Quality Filter (Default)**: Uses Claude Sonnet 4.5 to evaluate each match for true relevance, filters out generic/irrelevant podcasts (scores 5+/10 only), adds detailed explanation for why each podcast is relevant
3. **Smart Fallback**: Targets minimum 15 results - if threshold is too high, automatically does fallback search. Prioritizes quality over quantity
4. Returns podcasts ranked by AI relevance score and similarity
5. Optionally exports matches to the prospect's linked Google Sheet

**Cost**:
- Embeddings: ~$0.00002 per search (OpenAI text-embedding-3-small)
- AI filtering (Claude Sonnet 4.5): ~$0.003-0.006 per search (30 podcasts)
- **Total: ~$0.006 per search** (extremely affordable)

**Performance**:
- Without AI filter: 1-2 seconds
- With AI filter: 3-5 seconds (recommended for prospects)

**Quality Assurance**:
- **AI Relevance Scores** (when use_ai_filter=true):
  - 9-10: Exceptional match, highly recommend
  - 7-8: Strong match, very relevant
  - 6-7: Good match, relevant
  - Below 6: Filtered out automatically

- **Similarity Scores** (embedding-based):
  - 0.4-1.0: Excellent semantic match
  - 0.3-0.4: Good semantic match
  - 0.25-0.3: Moderate semantic match (minimum for fallback)
  - Below 0.25: Too generic, excluded

**Recommendation**: Always use AI filtering (`use_ai_filter: true`) when presenting to prospects to ensure every podcast shown is genuinely relevant.

**Note on Result Count**: With AI filtering enabled, you may receive fewer than 15 results if there aren't enough truly relevant podcasts for the prospect's profile. This is intentional - we prioritize quality over quantity. The AI only approves podcasts with relevance scores of 5+ out of 10, and remaining slots are filled with the highest semantic similarity matches available.

## Usage Examples

Once configured in Claude Code:

### Example 1: Create prospect (no Google Sheet yet)

```
You: Create a prospect for Sarah Johnson

Claude: [Creates prospect using create_prospect]
Result:
✓ Prospect dashboard created successfully
- Name: Sarah Johnson
- Dashboard: https://getonapod.com/prospect/abc12345
- Google Sheet: None (add later)
- Prospect ID: uuid-here
```

### Example 2: Create prospect with bio and link existing sheet

```
You: Create a prospect for Mike Chen with bio "Marketing expert with 15 years experience" and Google Sheet https://docs.google.com/spreadsheets/d/xyz123

Claude: [Creates prospect using create_prospect]
Result:
✓ Prospect dashboard created successfully
- Name: Mike Chen
- Bio: Marketing expert with 15 years experience
- Dashboard: https://getonapod.com/prospect/def67890
- Google Sheet: https://docs.google.com/spreadsheets/d/xyz123 (linked existing)
- Prospect ID: uuid-here
```

### Example 3: Match podcasts for a prospect

```
You: Find matching podcasts for Sarah Johnson who is a marketing consultant specializing in SaaS startups

Claude: [Matches podcasts using match_podcasts_for_prospect]
Result:
✓ Found 50 matching podcasts
- Top match: "SaaS Growth Hacks" (similarity: 0.89)
- "Marketing Masters" (0.85)
- "Startup Stories" (0.81)
... 47 more matches
```

### Example 4: Match podcasts with custom threshold and export

```
You: Find the top 20 best podcast matches for Mike Chen with similarity > 0.7 and export to his Google Sheet

Claude: [Matches podcasts with match_threshold=0.7, match_count=20, export_to_sheet=true]
Result:
✓ Found 18 matching podcasts (above 0.7 threshold)
✓ Exported to Google Sheet: https://docs.google.com/spreadsheets/d/xyz123
```

### Example 5: Enable the dashboard

```
You: Enable the dashboard with tagline "Your personalized podcast opportunities"

Claude: [Enables dashboard using enable_prospect_dashboard]
Result: Dashboard is now live at https://getonapod.com/prospect/abc12345
```

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Start the server:
```bash
npm start
```

## Project Structure

```
mcp-prospect-dashboard/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── config.ts             # Configuration and env validation
│   ├── tools/
│   │   ├── create-dashboard.ts   # Prospect creation tool
│   │   ├── enable-dashboard.ts   # Dashboard enablement tool
│   │   └── match-podcasts.ts     # AI podcast matching tool
│   └── services/
│       ├── supabase.ts       # Supabase client
│       └── openai.ts         # OpenAI client for embeddings
├── package.json
├── tsconfig.json
└── .env
```

## How It Works

1. **create_prospect** creates a prospect dashboard record:
   - Generates a unique 8-character slug
   - Creates a record in `prospect_dashboards` table with content_ready=false
   - If `google_sheet_url` is provided, links to that existing sheet
   - If no sheet URL provided, leaves spreadsheet_url as null (to be added later)
   - Returns dashboard URL and spreadsheet URL (or null)

2. **enable_prospect_dashboard** updates the prospect dashboard:
   - Sets `content_ready=true` to publish the dashboard
   - Optionally sets `personalized_tagline`
   - Returns the public dashboard URL

3. **match_podcasts_for_prospect** finds relevant podcasts using AI:
   - Creates text representation from prospect name and bio
   - Generates 1536-dimension embedding using OpenAI text-embedding-3-small
   - Searches 2,431+ podcasts using cosine similarity via database function
   - Returns matches ranked by similarity score (0.0-1.0)
   - Optionally exports to prospect's Google Sheet via `prospect_podcast_links` table
   - Cost: ~$0.00002 per search, Performance: ~1-2 seconds

The prospect dashboard at `/prospect/{slug}` shows:
- When content_ready=false: "Coming Soon" message
- When content_ready=true: Full dashboard with podcasts from Google Sheet
- Prospects can view their curated podcast opportunities
- Shows at `/admin/prospect-dashboards` for admin management

## Troubleshooting

**Error: Missing required environment variable**
- Make sure your `.env` file has all required variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY)
- Check that the MCP configuration includes the environment variables
- For OPENAI_API_KEY, get yours from https://platform.openai.com/api-keys
- For ANTHROPIC_API_KEY, get yours from https://console.anthropic.com/settings/keys

**Error: Failed to create Google Sheet**
- Verify GOOGLE_SERVICE_ACCOUNT_JSON is configured in Supabase Edge Functions
- Check that the service account has Google Sheets and Drive API access
- Ensure GOOGLE_WORKSPACE_USER_EMAIL is set correctly

**Error: Prospect dashboard slug not found**
- The create-prospect-sheet function generates unique 8-character slugs
- Check that the `prospect_dashboards` table exists
- Verify migration `20260107_prospect_dashboards.sql` was applied

**MCP not showing up in Claude Code**
- Verify the absolute path in your MCP settings is correct
- Make sure you ran `npm run build` after making changes
- Restart Claude Code after updating MCP settings

## License

Proprietary - Get On A Pod
