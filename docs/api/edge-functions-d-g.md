# Supabase Edge Functions API Reference (D-G)

> **MVP status warning:** this file preserves historical request/response
> detail. `docs/invite-only-edge-manifest.json` is authoritative for deployed,
> retired (HTTP 410), and tenant-excluded functions; conflicting examples here
> are not supported release behavior.

This document provides comprehensive documentation for all Supabase Edge Functions with names starting with D-G in the Get On A Pod platform.

## Table of Contents

- [Delete Functions](#delete-functions)
  - [delete-outreach-podcast](#delete-outreach-podcast)
  - [delete-podcast-from-sheet](#delete-podcast-from-sheet)
  - [delete-reply](#delete-reply)
- [Export Functions](#export-functions)
  - [export-to-google-sheets](#export-to-google-sheets)
- [Fetch Functions](#fetch-functions)
  - [fetch-and-classify-replies](#fetch-and-classify-replies)
  - [fetch-email-thread](#fetch-email-thread)
  - [fetch-podscan-email](#fetch-podscan-email)
- [Generate Functions](#generate-functions)
  - [generate-blog-content](#generate-blog-content)
  - [generate-client-bio](#generate-client-bio)
  - [generate-guest-resource](#generate-guest-resource)
  - [generate-media-kit-doc](#generate-media-kit-doc)
  - [generate-podcast-queries](#generate-podcast-queries)
  - [generate-podcast-summary](#generate-podcast-summary)
  - [generate-reply](#generate-reply)
  - [generate-tagline](#generate-tagline)
- [Get Functions](#get-functions)
  - [get-blog-posts](#get-blog-posts)
  - [get-client-bookings](#get-client-bookings)
  - [get-client-outreach-podcasts](#get-client-outreach-podcasts)
  - [get-client-podcasts](#get-client-podcasts)
  - [get-customer-analytics](#get-customer-analytics)
  - [get-guest-resources](#get-guest-resources)
  - [get-outreach-podcasts](#get-outreach-podcasts)
  - [get-pipeline-analytics](#get-pipeline-analytics)
  - [get-podcast-demographics](#get-podcast-demographics)
  - [get-prospect-dashboard](#get-prospect-dashboard)
  - [get-prospect-podcasts](#get-prospect-podcasts)
  - [get-testimonials](#get-testimonials)
  - [get-upcoming-bookings](#get-upcoming-bookings)

## Delete Functions

### delete-outreach-podcast

Deletes a specific podcast from a client's Google Sheet by finding and removing the row containing the specified podcast ID.

**Endpoint:** `/functions/v1/delete-outreach-podcast`  
**Method:** `POST`  
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "clientId": "uuid",
  "podcastId": "string"
}
```

**Parameters:**
- `clientId` (string, required): The client's UUID in the database
- `podcastId` (string, required): The Podscan podcast ID to delete

#### Response Format
```json
{
  "success": true,
  "message": "Deleted podcast from row 5",
  "deletedRow": 5
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Podcast ID not found in sheet"
}
```

#### Description
1. Retrieves the client's Google Sheet URL from the database
2. Authenticates with Google using service account credentials
3. Reads column E to find the row containing the specified podcast ID
4. Deletes the entire row using Google Sheets batch update API
5. Returns confirmation with the row number that was deleted

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/delete-outreach-podcast \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000",
    "podcastId": "podcast123"
  }'
```

---

### delete-podcast-from-sheet

Deletes a podcast from a Google Sheet by spreadsheet ID and podcast ID, providing more direct access without requiring client lookup.

**Endpoint:** `/functions/v1/delete-podcast-from-sheet`  
**Method:** `POST`  
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "spreadsheetId": "string",
  "podcastId": "string"
}
```

**Parameters:**
- `spreadsheetId` (string, required): Google Sheets spreadsheet ID
- `podcastId` (string, required): The Podscan podcast ID to delete

#### Response Format
```json
{
  "success": true,
  "message": "Deleted podcast from row 3",
  "deletedPodcastId": "podcast123"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Podcast ID not found in sheet"
}
```

#### Description
Similar to delete-outreach-podcast but works directly with spreadsheet ID instead of requiring client lookup. Searches column E for the podcast ID and deletes the matching row.

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/delete-podcast-from-sheet \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "podcastId": "podcast456"
  }'
```

---

### delete-reply

Deletes a campaign reply from the Email Bison API and the local database.

**Endpoint:** `/functions/v1/delete-reply`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "reply_id": "string"
}
```

**Parameters:**
- `reply_id` (string, required): The campaign reply UUID from the local database

#### Response Format
```json
{
  "success": true,
  "data": {
    "reply_id": "uuid-string",
    "bison_deleted": true              // Whether the reply was also deleted from Bison
  }
}
```

**Error Responses:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "reply_id is required"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Reply not found: uuid-string"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Database delete failed: error message"
}
```

#### Description
1. Fetches the reply record from the `campaign_replies` table to get the `bison_reply_id`
2. If a `bison_reply_id` exists and `EMAIL_BISON_API_TOKEN` is configured, sends a DELETE request to the Bison API
3. Deletes the reply from the local `campaign_replies` table
4. Returns success with a flag indicating whether Bison deletion also succeeded

#### Features
- **Dual Deletion**: Removes from both Bison API and local database
- **Graceful Bison Failure**: If Bison delete fails, still proceeds with local database deletion
- **Audit Logging**: Logs deletion details for each step

#### Required Environment Variables
- `EMAIL_BISON_API_TOKEN` - Optional, for Bison API deletion

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/delete-reply \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reply_id": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

---

## Export Functions

### export-to-google-sheets

Exports new podcast data to a client's Google Sheet, rejects entries without a stable Podscan ID, and caches successful exports in both the central catalog and the client's history.

**Endpoint:** `/functions/v1/export-to-google-sheets`  
**Method:** `POST`  
**Authentication:** Authenticated workspace bearer token with `workspaceId`, or the legacy platform-admin/service path when `workspaceId` is omitted

#### Request Body
```json
{
  "clientId": "uuid",
  "workspaceId": "uuid",
  "podcasts": [
    {
      "podcast_name": "The Joe Rogan Experience",
      "podcast_description": "Long form conversation podcast",
      "itunes_rating": 4.8,
      "episode_count": 2000,
      "podscan_podcast_id": "podcast123",
      "audience_size": 11000000,
      "publisher_name": "Joe Rogan",
      "podcast_url": "https://example.com",
      "podcast_email": "contact@example.com",
      "rss_feed": "https://rss.example.com",
      "compatibility_score": 85,
      "compatibility_reasoning": "Great fit due to...",
      "podcast_image_url": "https://image.example.com/thumb.jpg",
      "podcast_categories": [
        {
          "category_id": "cat1",
          "category_name": "Business"
        }
      ],
      "language": "en",
      "region": "US"
    }
  ]
}
```

**Parameters:**
- `clientId` (string, required): The client's UUID
- `workspaceId` (string, recommended): Workspace UUID used for tenant authorization and client scoping
- `podcasts` (array, required): Array of podcast objects to export

**Podcast Object Fields:**
- `podcast_name` (string, required): Name of the podcast
- `podcast_description` (string, optional): Description of the podcast
- `itunes_rating` (number, optional): iTunes rating (0-5)
- `episode_count` (number, optional): Number of episodes
- `podscan_podcast_id` or `podcast_id` (string, required): Podscan ID
- `audience_size` (number, optional): Estimated audience size
- `publisher_name` (string, optional): Publisher/host name
- Other fields are optional and stored in cache

#### Response Format
```json
{
  "success": true,
  "rowsAdded": 5,
  "updatedRange": "Sheet1!A2:E6",
  "duplicatesSkipped": 2,
  "duplicatePodcastIds": ["podcast123", "podcast456"],
  "cacheSaved": 5,
  "cacheSkipped": 0,
  "cacheErrors": 0
}
```

#### Description
1. Looks up client's Google Sheet URL from database
2. Authenticates with Google using service account with domain-wide delegation
3. Resolves the actual first sheet and reads its stable Podcast ID column
4. Removes sheet-history duplicates and repeated IDs within the request, case-insensitively
5. Appends only new rows to the Google Sheet
6. Saves new podcasts to the central catalog and the client's history
7. Returns append, duplicate, and caching statistics

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/export-to-google-sheets \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000",
    "podcasts": [
      {
        "podcast_name": "Tech Talk Daily",
        "podcast_description": "Daily tech news and insights",
        "itunes_rating": 4.5,
        "episode_count": 365,
        "podscan_podcast_id": "tech-talk-daily"
      }
    ]
  }'
```

---

## Fetch Functions

### fetch-and-classify-replies

Bulk fetches interested replies from the Bison API, inserts new ones into the database, classifies all unclassified replies with AI, and updates thread status for already-classified replies.

**Endpoint:** `/functions/v1/fetch-and-classify-replies`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
No request body required. The function fetches all interested replies from the Bison API automatically.

#### Response Format
```json
{
  "success": true,
  "data": {
    "total_interested": 25,            // Total interested replies from Bison
    "new_replies": 8,                  // New replies inserted into database
    "classified": 12,                  // Replies classified with AI this run
    "skipped": 5,                      // Already-classified replies (thread status updated only)
    "results": [
      {
        "id": "uuid-string",
        "email": "host@podcast.com",
        "classification": "fulfillment",
        "confidence": "high",
        "awaiting_reply": true,
        "reason": "Podcast host is asking about scheduling the guest interview"
      }
    ]
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "EMAIL_BISON_API_TOKEN not configured"
}
```

#### Description
1. Fetches all interested replies from Bison API (`status=interested&folder=inbox`)
2. For each reply, checks if it already exists in the local `campaign_replies` table
3. **Already classified**: Fetches thread from Bison, updates `awaiting_reply` status and thread metadata only
4. **Exists but unclassified**: Fetches thread, classifies with Claude Haiku, updates classification and thread status
5. **Brand new**: Inserts into database with status `new`, then fetches thread, classifies, and updates

#### Features
- **Full Pipeline**: Combines fetch, insert, and classify into a single operation
- **Thread Status Tracking**: Determines who sent the last message (awaiting reply from us or from them)
- **AI Classification**: Uses Claude Haiku 4.5 with three categories (SALES/FULFILLMENT/OTHER)
- **Idempotent**: Safe to call repeatedly; already-classified replies are skipped with only thread status updated
- **Thread Context**: Fetches full conversation threads from Bison for accurate classification
- **Fallback Parsing**: Handles malformed AI responses with keyword-based extraction

#### Thread Status Fields Updated
- `awaiting_reply` - Boolean: true if the lead replied last (we owe them a reply)
- `last_reply_from` - Name of the person who sent the last message
- `thread_checked_at` - ISO timestamp of last thread status check
- `thread_message_count` - Total messages in the thread

#### Required Environment Variables
- `ANTHROPIC_API_KEY` - Required for AI classification
- `EMAIL_BISON_API_TOKEN` - Required for fetching replies from Bison

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/fetch-and-classify-replies \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

---

### fetch-email-thread

Fetches an email conversation thread from the Email Bison API using a reply ID.

**Endpoint:** `/functions/v1/fetch-email-thread`  
**Method:** `POST`  
**Authentication:** Email Bison API token required via environment variables

#### Request Body
```json
{
  "replyId": "string"
}
```

**Parameters:**
- `replyId` (string, required): The reply ID from Email Bison

#### Response Format
```json
{
  "success": true,
  "data": {
    "thread_id": "thread123",
    "messages": [
      {
        "id": "msg1",
        "subject": "Podcast Booking Request",
        "body": "Hi, I'd like to...",
        "from": "guest@example.com",
        "to": "host@podcast.com",
        "sent_at": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

#### Description
Makes a GET request to the Email Bison API to retrieve the full conversation thread associated with a specific reply. Used for viewing email context in the outreach management system.

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/fetch-email-thread \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "replyId": "reply_abc123"
  }'
```

---

### fetch-podscan-email

Fetches or retrieves cached email contact information for a podcast from Podscan API.

**Endpoint:** `/functions/v1/fetch-podscan-email`  
**Method:** `POST`  
**Authentication:** Podscan API key required via environment variables

#### Request Body
```json
{
  "podcast_id": "string"
}
```

**Parameters:**
- `podcast_id` (string, required): The Podscan podcast ID

#### Response Format
```json
{
  "success": true,
  "email": "contact@podcast.com",
  "podcast_id": "podcast123",
  "cached": false,
  "fetched_at": "2024-01-15T10:30:00Z"
}
```

**Cached Response:**
```json
{
  "success": true,
  "email": "contact@podcast.com",
  "podcast_id": "podcast123", 
  "cached": true,
  "fetched_at": "2024-01-14T08:15:00Z"
}
```

#### Description
1. First checks if email is already cached in `podcast_emails` table
2. If not cached, fetches from Podscan API `/podcasts/{id}` endpoint
3. Extracts email from `reach.email` field
4. Caches result in database for future requests
5. Returns email address or null if not available

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/fetch-podscan-email \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "podcast_id": "the-tim-ferriss-show"
  }'
```

---

## Generate Functions

### generate-blog-content

Generates SEO-optimized blog content using Claude AI for the Get On A Pod website.

**Endpoint:** `/functions/v1/generate-blog-content`
**Method:** `POST`
**Authentication:** Bearer token required (`Authorization: Bearer {token}`). The function verifies the user via Supabase Auth (`auth.getUser`). Returns 401 if missing or invalid.

#### Request Body
```json
{
  "topic": "How to Prepare for Your First Podcast Interview",
  "category": "preparation",
  "keywords": "podcast interview, preparation, first time",
  "tone": "professional",
  "wordCount": 1500
}
```

**Parameters:**
- `topic` (string, required): The blog post topic
- `category` (string, optional): Content category
- `keywords` (string, optional): Target SEO keywords
- `tone` (string, optional): Writing tone (default: "professional")
- `wordCount` (number, optional): Target word count (default: 1500)

#### Response Format
```json
{
  "success": true,
  "data": {
    "content": "<h2>Introduction</h2><p>Getting ready for your first podcast interview...</p>",
    "metaDescription": "Learn how to prepare for your first podcast interview with these expert tips...",
    "wordCount": 1547,
    "readTimeMinutes": 8
  }
}
```

#### Description
1. Uses Claude AI to generate comprehensive blog content
2. Creates structured HTML with proper headings and formatting
3. Generates SEO meta description
4. Calculates estimated reading time
5. Includes call-to-action for Get On A Pod services

#### Content Structure
- Compelling introduction (150-200 words)
- 3-5 main sections with H2 headings
- Scannable format with bullet points and lists
- Professional, encouraging tone
- Call-to-action linking to Premium Podcast Placements

#### Error Responses
```json
// 401 Unauthorized
{
  "success": false,
  "error": "Missing authorization header"
}

// 401 Unauthorized
{
  "success": false,
  "error": "Unauthorized"
}

// 400 Bad Request
{
  "success": false,
  "error": "Topic is required"
}
```

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-blog-content \
  -H "Authorization: Bearer YOUR_USER_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "5 Mistakes to Avoid in Podcast Interviews",
    "category": "best_practices",
    "keywords": "podcast mistakes, interview tips",
    "tone": "friendly",
    "wordCount": 1200
  }'
```

---

### generate-client-bio

Generates compelling guest bios for podcast booking pitches using client onboarding information.

**Endpoint:** `/functions/v1/generate-client-bio`  
**Method:** `POST`  
**Authentication:** Anthropic API key required via environment variables

#### Request Body
```json
{
  "name": "Sarah Johnson",
  "title": "CEO",
  "company": "TechStart Inc",
  "bio": "Sarah has 15 years of experience in startup leadership...",
  "expertise": ["startup growth", "leadership", "tech innovation"],
  "compellingStory": "Built her company from 2 employees to 200+ in 3 years",
  "uniqueJourney": "Overcame significant challenges as a female founder in tech",
  "topicsConfident": ["scaling startups", "leadership challenges", "work-life balance"],
  "passions": "Mentoring other entrepreneurs and promoting diversity in tech",
  "audienceValue": "Practical insights for scaling businesses and leadership development",
  "personalStories": "Story about pivoting during COVID and coming out stronger",
  "hobbies": "Rock climbing and cooking",
  "futureVision": "Democratizing access to technology for underserved communities",
  "specificAngles": "Female leadership in male-dominated industries",
  "idealAudience": "Entrepreneurs, startup founders, business leaders",
  "goals": ["increase brand awareness", "thought leadership", "attract talent"],
  "socialFollowers": "50K on LinkedIn, 25K on Twitter",
  "previousPodcasts": "Featured on 5 podcasts including Business Weekly"
}
```

**Required Parameters:**
- `name` (string): Client's full name
- `bio` (string): Professional background
- `compellingStory` (string): Key story or achievement

**Optional Parameters:**
- `title`, `company`, `expertise`, `uniqueJourney`, `topicsConfident`, `passions`, `audienceValue`, `personalStories`, `hobbies`, `futureVision`, `specificAngles`, `idealAudience`, `goals`, `socialFollowers`, `previousPodcasts`

#### Response Format
```json
{
  "success": true,
  "bio": "Sarah Johnson is a powerhouse CEO who transformed TechStart Inc from a scrappy 2-person team into a thriving 200+ employee company in just three years. As a female founder in the male-dominated tech industry, Sarah brings a unique perspective on leadership, scaling, and navigating challenges with resilience and innovation.\n\nWith 15 years of startup leadership experience, Sarah has mastered the art of rapid growth while maintaining company culture and values. Her journey hasn't been without obstacles – she successfully pivoted her business model during COVID-19, emerging stronger and more focused than ever. This experience, combined with her passion for mentoring other entrepreneurs, makes her an invaluable voice for business leaders facing their own scaling challenges.\n\nWhen she's not building the future of technology, Sarah can be found rock climbing or experimenting in the kitchen. Her mission extends beyond business success – she's working toward democratizing access to technology for underserved communities. Sarah's authentic leadership style, practical insights, and compelling personal story make her an engaging guest who delivers real value to any audience of entrepreneurs and business leaders."
}
```

#### Description
Creates compelling, professional bios that:
- Start with a strong hook highlighting unique achievements
- Showcase expertise and credibility
- Emphasize what makes them different
- Focus on value they bring to audiences
- Include specific accomplishments and results
- Maintain conversational yet professional tone
- Are 3-4 paragraphs optimized for podcast booking

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-client-bio \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mike Chen",
    "company": "EcoSolutions",
    "bio": "Environmental engineer turned entrepreneur...",
    "compellingStory": "Developed zero-waste manufacturing process adopted by Fortune 500 companies",
    "expertise": ["sustainability", "green technology", "manufacturing"],
    "topicsConfident": ["environmental innovation", "sustainable business practices"],
    "passions": "Creating environmentally responsible business solutions"
  }'
```

---

### generate-guest-resource

Creates beautifully formatted resource documents for podcast guests using Claude AI.

**Endpoint:** `/functions/v1/generate-guest-resource`  
**Method:** `POST`  
**Authentication:** Anthropic API key required via environment variables

#### Request Body
```json
{
  "topic": "How to Sound Professional During Remote Podcast Interviews",
  "category": "technical_setup",
  "resourceType": "guide"
}
```

**Parameters:**
- `topic` (string, required): The resource topic
- `category` (string, optional): Resource category (`preparation`, `technical_setup`, `best_practices`, `promotion`, `examples`, `templates`)
- `resourceType` (string, optional): Type of resource (default: "guide")

#### Response Format
```json
{
  "success": true,
  "data": {
    "content": "<h2>Pre-Interview Setup</h2><h3>Audio Equipment Checklist</h3><ul><li>✅ Test your microphone and audio levels</li></ul><blockquote><strong>💡 Pro Tip:</strong> Always send a thank-you email within 24 hours.</blockquote>",
    "wordCount": 956,
    "readTimeMinutes": 5
  }
}
```

#### Description
Generates comprehensive, actionable resource documents with:
- Professional HTML structure using semantic tags
- Clear section headings (H2) and subheadings (H3) 
- Bullet points, numbered lists, and checklists
- Pro tip callouts using blockquotes
- Specific examples and scripts
- 800-1200 word comprehensive content
- ASCII character encoding for proper rendering

#### Content Categories
- **preparation**: Helping guests prepare for interviews
- **technical_setup**: Audio/video quality and technical setup
- **best_practices**: Tips for successful podcast appearances
- **promotion**: Maximizing impact of podcast appearances
- **examples**: Real examples and case studies
- **templates**: Scripts and frameworks for guests

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-guest-resource \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Podcast Interview Follow-up Best Practices",
    "category": "promotion",
    "resourceType": "checklist"
  }'
```

---

### generate-media-kit-doc

Generates a professionally formatted Google Doc media kit for a prospect using AI-generated content and Google Docs API.

**Endpoint:** `/functions/v1/generate-media-kit-doc`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "dashboardId": "string",            // Required: Prospect dashboard ID
  "prospectName": "string",           // Required: Prospect name
  "prospectBio": "string",            // Required: Prospect biography
  "prospectTitle": "string",          // Optional: Job title
  "prospectCompany": "string",        // Optional: Company name
  "prospectIndustry": "string",       // Optional: Industry
  "prospectExpertise": ["string"],    // Optional: Areas of expertise
  "prospectTopics": ["string"],       // Optional: Speaking topics
  "prospectTargetAudience": "string", // Optional: Target audience
  "prospectImageUrl": "string",       // Optional: Prospect photo URL
  "dashboardSlug": "string"           // Optional: Dashboard slug for linking
}
```

#### Response Format
```json
{
  "success": true,
  "docUrl": "https://docs.google.com/document/d/abc123/edit",
  "docId": "abc123"
}
```

**Error Responses:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "dashboardId, prospectName, and prospectBio are required"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "ANTHROPIC_API_KEY not configured"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to create Google Doc: error details"
}
```

#### Description
1. Generates media kit content (about bio, credentials, speaking topics) using Claude Haiku 4.5
2. Authenticates with Google using service account with domain-wide delegation
3. Creates a blank Google Doc with a branded title
4. Inserts structured, formatted content using Google Docs batch update API:
   - GOAP logo and prospect photo (with graceful failure if images don't load)
   - Title, name, and subtitle
   - About section with multi-paragraph bio
   - Key Credentials as bullet points
   - Speaking Topics with titles and descriptions
   - Podcast Opportunities section with dashboard link
   - About Get On A Pod section
   - How It Works (5-step process)
   - What Sets Us Apart differentiators
   - Call-to-action with dashboard link
   - Professional footer
5. Sets the document to public read access (anyone with link)
6. Saves the document URL to the `prospect_dashboards` table

#### Document Sections
- **Header**: GOAP logo, title "PODCAST GUEST MEDIA KIT"
- **Prospect Profile**: Name, title, company, photo
- **About**: AI-generated 2-3 paragraph professional bio
- **Key Credentials**: 5-7 bullet points of achievements
- **Speaking Topics**: 4-6 topics with titles and descriptions
- **Podcast Opportunities**: Link to personalized dashboard
- **About GOAP**: Agency description
- **How It Works**: 5-step process breakdown
- **What Sets Us Apart**: 5 differentiators as bullets
- **CTA**: Dashboard link and contact info
- **Footer**: Branding and tagline

#### Required Environment Variables
- `ANTHROPIC_API_KEY` - Required for content generation
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Required for Google API access
- `GOOGLE_WORKSPACE_USER_EMAIL` - Required for domain-wide delegation

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-media-kit-doc \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dashboardId": "123e4567-e89b-12d3-a456-426614174000",
    "prospectName": "Sarah Martinez",
    "prospectBio": "Digital marketing consultant with 15 years of experience...",
    "prospectTitle": "CEO",
    "prospectCompany": "GrowthLab",
    "dashboardSlug": "abc12345"
  }'
```

---

### generate-podcast-queries

Generates strategic podcast search queries for Podscan.fm using advanced search syntax.

**Endpoint:** `/functions/v1/generate-podcast-queries`  
**Method:** `POST`  
**Authentication:** Anthropic API key required via environment variables

#### Request Body (Generate 5 Queries)
```json
{
  "clientName": "John Smith",
  "clientBio": "Serial entrepreneur with expertise in SaaS and marketing automation",
  "clientEmail": "john@example.com"
}
```

#### Request Body (Regenerate Single Query)
```json
{
  "clientName": "John Smith", 
  "clientBio": "Serial entrepreneur with expertise in SaaS and marketing automation",
  "oldQuery": "marketing automation OR growth hacking"
}
```

#### Request Body (Prospect Mode)
```json
{
  "prospectName": "Jane Doe",
  "prospectBio": "Financial advisor specializing in retirement planning"
}
```

**Parameters:**
- For clients: `clientName`, `clientBio` (required), `clientEmail` (optional)
- For prospects: `prospectName`, `prospectBio` (required)
- For regeneration: Include `oldQuery` to replace a poor-performing query

#### Response Format (5 Queries)
```json
{
  "queries": [
    "'SaaS marketing' OR 'software marketing' OR 'B2B marketing'",
    "'startup * podcast' OR 'entrepreneur * stories'", 
    "'marketing automation' AND 'growth strategies'",
    "'business leadership' OR 'executive coaching'",
    "'tech * founders' OR 'software * entrepreneurship'"
  ]
}
```

#### Response Format (Single Query)
```json
{
  "query": "'marketing strategy' OR 'digital marketing' OR 'growth marketing'"
}
```

#### Description
Generates strategic podcast search queries using:

**Advanced Search Syntax:**
- Single quotes for exact phrases: `'digital marketing'`
- Wildcards within quotes: `'startup * podcast'`
- Boolean operators: `OR`, `AND`, `NOT`
- Combines related terms for maximum coverage

**Query Strategy (5-query mode):**
1. One precise query (exact niche + specific terms)
2. Two broad synonym queries (using OR for 3-5 related terms)
3. One wildcard query (using * for variations)
4. One adjacent category query (related audience)

**Quality Guidelines:**
- Targets 100-300 podcasts per query
- Avoids client/prospect names or brands
- Uses synonyms and related industries
- Designed to appear in podcast titles

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-podcast-queries \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientName": "Lisa Wang",
    "clientBio": "E-commerce expert and founder of a $10M online retail business"
  }'
```

---

### generate-podcast-summary

Generates compelling "Why This Show" descriptions for podcasts to help with guest booking.

**Endpoint:** `/functions/v1/generate-podcast-summary`  
**Method:** `POST`  
**Authentication:** Anthropic API key required via environment variables

#### Request Body
```json
{
  "podcast_name": "The Tim Ferriss Show",
  "audience_size": 800000,
  "episode_count": 700,
  "rating": 4.8,
  "reach_score": 95,
  "description": "Long-form conversations with world-class performers",
  "categories": ["Business", "Education", "Self-Improvement"],
  "publisher_name": "Tim Ferriss"
}
```

**Parameters:**
- `podcast_name` (string, required): Name of the podcast
- `audience_size` (number, optional): Estimated audience size
- `episode_count` (number, optional): Number of episodes
- `rating` (number, optional): iTunes rating
- `reach_score` (number, optional): Reach/influence score
- `description` (string, optional): Podcast description
- `categories` (array, optional): Podcast categories
- `publisher_name` (string, optional): Host/publisher name

#### Response Format
```json
{
  "summary": "The Tim Ferriss Show offers unparalleled access to a highly engaged audience of 800,000+ ambitious professionals and entrepreneurs. With an exceptional 4.8-star rating and 700+ episodes, this show has established itself as a premier destination for business insights and personal optimization strategies. Appearing on Tim's show provides guests with significant credibility and exposure to decision-makers who actively seek out high-performance strategies and innovative business approaches."
}
```

#### Description
Creates compelling 2-3 sentence descriptions that:
- Emphasize audience quality and engagement potential
- Highlight credibility and reach metrics
- Focus on business value for potential guests
- Use professional, persuasive tone
- Maximize appeal for booking decisions

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-podcast-summary \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "podcast_name": "Marketing School", 
    "audience_size": 150000,
    "episode_count": 2000,
    "rating": 4.6,
    "categories": ["Marketing", "Business"],
    "publisher_name": "Neil Patel & Eric Siu"
  }'
```

---

### generate-reply

Uses Claude Sonnet to generate contextual email reply drafts based on the full email thread and lead classification.

**Endpoint:** `/functions/v1/generate-reply`
**Method:** `POST`
**Authentication:** None (uses server-side environment variables `ANTHROPIC_API_KEY` and `EMAIL_BISON_API_TOKEN`; no caller authentication is performed)

#### Request Body
```json
{
  "bisonReplyId": "number",           // Required: Bison reply ID for thread fetching
  "name": "string",                   // Optional: Contact name
  "email": "string",                  // Optional: Contact email
  "company": "string",               // Optional: Contact company
  "leadType": "string",              // Optional: "sales", "fulfillment", or "other"
  "aiReason": "string",              // Optional: AI classification note for context
  "customPrompt": "string"           // Optional: Override the default prompt entirely
}
```

#### Response Format
```json
{
  "success": true,
  "data": {
    "reply": "Thanks for your interest! We'd love to set up a quick 15-minute call to discuss how we can help you get booked on top podcasts...",
    "defaultPrompt": "You are writing an email reply on behalf of GOAP..."
  }
}
```

**Error Responses:**
```json
// 400 Bad Request
{
  "success": false,
  "error": "bisonReplyId is required"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to fetch thread: 404"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "ANTHROPIC_API_KEY not configured"
}
```

#### Description
1. Fetches the full conversation thread from the Bison API using the reply ID
2. Builds a context-aware prompt based on the lead type:
   - **Sales**: Focus on moving prospect toward booking a call or learning about GOAP services
   - **Fulfillment**: Focus on coordinating scheduling and providing guest info to podcast host
   - **Other**: Generic contextual response
3. Calls Claude Sonnet to generate a natural, concise reply
4. Returns the generated reply text along with the default prompt used (for customization)

#### Features
- **Thread-Aware**: Reads full email conversation for context-appropriate replies
- **Lead-Type Routing**: Different reply strategies based on classification (sales vs fulfillment)
- **Custom Prompts**: Supports overriding the default prompt with a custom one
- **Tone Matching**: AI matches the formality level of the conversation
- **Clean Output**: Generates plain text only, no HTML/markdown, no signatures, no generic filler phrases
- **Prompt Transparency**: Returns the default prompt so users can customize and regenerate

#### Required Environment Variables
- `ANTHROPIC_API_KEY` - Required for Claude Sonnet generation
- `EMAIL_BISON_API_TOKEN` - Required for fetching thread context

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-reply \
  -H "Content-Type: application/json" \
  -d '{
    "bisonReplyId": 12345,
    "name": "Jane Doe",
    "email": "jane@podcast.com",
    "company": "Tech Podcast Network",
    "leadType": "fulfillment",
    "aiReason": "Host is asking about guest scheduling"
  }'
```

---

### generate-tagline

Generates personalized dashboard taglines for prospects based on their goals and the number of curated podcasts.

**Endpoint:** `/functions/v1/generate-tagline`  
**Method:** `POST`  
**Authentication:** Anthropic API key required via environment variables

#### Request Body
```json
{
  "prospectName": "Sarah Martinez",
  "prospectBio": "Digital marketing consultant helping small businesses grow their online presence through strategic content marketing and SEO",
  "podcastCount": 12,
  "dashboardId": "dash_abc123"
}
```

**Parameters:**
- `prospectName` (string, required): Prospect's name
- `prospectBio` (string, required): Prospect's background/bio
- `podcastCount` (number, required): Number of curated podcasts
- `dashboardId` (string, optional): Dashboard ID to save tagline to database

#### Response Format
```json
{
  "success": true,
  "tagline": "We've curated 12 podcasts perfect for sharing your expertise in strategic digital marketing growth"
}
```

#### Description
Creates personalized one-liners that:
- Start with "We've curated {count} podcasts perfect for..."
- Reference specific goals/mission from prospect's bio
- Are warm, exciting, and compelling
- Are 10-20 words maximum
- Focus on THEIR unique objective, not generic expertise
- Automatically save to database if dashboardId provided

#### Example Taglines
- "We've curated 15 podcasts perfect for spreading your message on sustainable investing"
- "We've curated 8 podcasts perfect for your campaign to revolutionize healthcare"  
- "We've curated 9 podcasts perfect for amplifying your mission to empower entrepreneurs"

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/generate-tagline \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prospectName": "David Kim",
    "prospectBio": "Cybersecurity expert and founder of SecureNet, focused on helping businesses protect against data breaches",
    "podcastCount": 18,
    "dashboardId": "dash_xyz789"
  }'
```

---

## Get Functions

### get-blog-posts

Retrieves blog posts with support for paginated listing, single post lookup by slug, search, category filtering, and admin/public access modes.

**Endpoint:** `/functions/v1/get-blog-posts`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables (no caller auth required)

#### Request Body (Paginated List)
```json
{
  "status": "published",              // Optional (admin only): Filter by status ("published", "draft")
  "category": "uuid-category-id",     // Optional: Filter by blog_categories UUID
  "search": "podcast tips",           // Optional: Search in title, content, and excerpt
  "page": 1,                          // Optional: Page number (default: 1)
  "page_size": 10,                    // Optional: Items per page (default: 10)
  "admin": false                      // Optional: If true, includes draft posts
}
```

#### Request Body (Single Post by Slug)
```json
{
  "slug": "how-to-prepare-for-podcast",  // Returns single post
  "admin": false                          // Optional: If true, allows viewing drafts
}
```

#### Response Format (Paginated List)
```json
{
  "success": true,
  "posts": [
    {
      "id": "uuid",
      "title": "How to Prepare for Your First Podcast",
      "slug": "how-to-prepare-for-podcast",
      "content": "<h2>Introduction</h2>...",
      "meta_description": "Learn how to prepare...",
      "excerpt": "A comprehensive guide...",
      "category_id": "uuid",
      "tags": ["podcast", "preparation"],
      "featured_image_url": "https://example.com/image.jpg",
      "featured_image_alt": "Podcast preparation guide",
      "author_name": "Get On A Pod Team",
      "published_at": "2024-01-15T10:30:00Z",
      "view_count": 150,
      "read_time_minutes": 8,
      "blog_categories": {
        "id": "uuid",
        "name": "Preparation",
        "slug": "preparation"
      }
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 10
}
```

#### Response Format (Single Post)
```json
{
  "success": true,
  "post": {
    "id": "uuid",
    "title": "How to Prepare for Your First Podcast",
    "slug": "how-to-prepare-for-podcast",
    "content": "<h2>Introduction</h2>...",
    "meta_description": "Learn how to prepare...",
    "excerpt": "A comprehensive guide...",
    "category_id": "uuid",
    "tags": ["podcast", "preparation"],
    "featured_image_url": "https://example.com/image.jpg",
    "featured_image_alt": "Podcast preparation guide",
    "author_name": "Get On A Pod Team",
    "status": "published",
    "published_at": "2024-01-15T10:30:00Z",
    "view_count": 151,
    "read_time_minutes": 8,
    "schema_markup": {},
    "blog_categories": {
      "id": "uuid",
      "name": "Preparation",
      "slug": "preparation"
    }
  }
}
```

#### Error Responses
```json
// 404 Not Found
{
  "success": false,
  "error": "Post not found"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Internal server error"
}
```

#### Features
- **Dual Mode**: Supports both paginated listing and single post retrieval by slug
- **Public/Admin Access**: Public access only shows published posts; admin flag unlocks drafts
- **Search**: Case-insensitive search across title, content, and excerpt
- **Category Filtering**: Filter by blog category UUID
- **View Count Tracking**: Automatically increments view count on single post access via RPC with manual fallback
- **Pagination**: Standard page/page_size with total count
- **Sorting**: Posts ordered by published_at (newest first), then created_at

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-blog-posts \
  -H "Content-Type: application/json" \
  -d '{
    "search": "podcast interview",
    "page": 1,
    "page_size": 5
  }'
```

---

### get-client-bookings

Retrieves bookings and outreach messages for a specific client, with session validation for client portal access.

**Endpoint:** `/functions/v1/get-client-bookings`  
**Method:** `POST`  
**Authentication:** Session token validation or admin access

#### Request Body
```json
{
  "sessionToken": "session_abc123",
  "clientId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Parameters:**
- `sessionToken` (string, optional): Client portal session token for authentication
- `clientId` (string, required): Client's UUID

**Note:** If no sessionToken provided, allows admin impersonation access.

#### Response Format
```json
{
  "bookings": [
    {
      "id": "booking123",
      "podcast_name": "Tech Talk Daily",
      "host_name": "John Host",
      "scheduled_date": "2024-02-15T14:00:00Z",
      "status": "confirmed",
      "notes": "Discussing AI trends",
      "created_at": "2024-01-10T10:00:00Z"
    }
  ],
  "outreachMessages": [
    {
      "id": "msg456",
      "podcast_name": "Business Weekly",
      "host_email": "host@bizweekly.com",
      "subject": "Guest booking opportunity",
      "sent_at": "2024-01-12T09:30:00Z",
      "status": "sent",
      "podcast_image_url": "https://image.example.com/thumb.jpg",
      "audience_size": 50000,
      "itunes_rating": 4.5,
      "episode_count": 200
    }
  ]
}
```

#### Description
1. Validates session token against `client_portal_sessions` table if provided
2. Checks session expiration and client ID matching
3. Fetches bookings from `bookings` table for the client
4. Fetches sent outreach messages from `outreach_messages` table
5. Enriches outreach messages with podcast metadata
6. Returns combined data for client dashboard display

#### Session Validation
- Validates token exists and matches client ID
- Checks expiration time
- Returns 401 for invalid/expired sessions
- Allows admin access without session token

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-client-bookings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionToken": "sess_abc123def456",
    "clientId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

---

### get-client-outreach-podcasts

Retrieves podcast IDs from a client's Google Sheet for outreach management.

**Endpoint:** `/functions/v1/get-client-outreach-podcasts`  
**Method:** `POST`  
**Authentication:** Google Service Account with domain-wide delegation

#### Request Body
```json
{
  "clientId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Parameters:**
- `clientId` (string, required): Client's UUID

#### Response Format
```json
{
  "success": true,
  "podcastIds": [
    "podcast123",
    "podcast456", 
    "podcast789"
  ],
  "total": 3
}
```

**No Sheet Response:**
```json
{
  "success": true,
  "podcastIds": [],
  "total": 0
}
```

#### Description
1. Looks up client's Google Sheet URL from database
2. Extracts spreadsheet ID from URL
3. Authenticates with Google using service account
4. Reads column E (Podscan Podcast ID) from first sheet
5. Returns array of podcast IDs for frontend to fetch details
6. Handles missing/invalid sheets gracefully

**Note:** Returns only IDs, not full podcast details, due to DNS limitations in Edge Functions for external API calls.

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-client-outreach-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

---

### get-client-podcasts

Comprehensive function to fetch and manage client dashboard podcasts with caching, AI analysis, and multiple operation modes.

**Endpoint:** `/functions/v1/get-client-podcasts`  
**Method:** `POST`  
**Authentication:** Multiple APIs (Google Sheets, Podscan, Anthropic)

#### Request Body (Basic Mode)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "clientId": "123e4567-e89b-12d3-a456-426614174000",
  "clientName": "John Smith",
  "clientBio": "SaaS entrepreneur and marketing expert"
}
```

#### Request Body (Advanced Modes)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "clientId": "123e4567-e89b-12d3-a456-426614174000",
  "cacheOnly": true,
  "skipAiAnalysis": false,
  "aiAnalysisOnly": true,
  "checkStatusOnly": false
}
```

**Parameters:**
- `spreadsheetId` (string, required): Google Sheets ID containing podcast data
- `clientId` (string, required): Client's UUID  
- `clientName` (string, conditional): Required for AI analysis
- `clientBio` (string, conditional): Required for AI analysis
- `cacheOnly` (boolean, optional): Return only cached data, skip fetching
- `skipAiAnalysis` (boolean, optional): Skip AI analysis for new podcasts  
- `aiAnalysisOnly` (boolean, optional): Only run AI analysis on cached podcasts
- `checkStatusOnly` (boolean, optional): Return status info without processing

#### Response Format (Standard)
```json
{
  "success": true,
  "podcasts": [
    {
      "podcast_id": "podcast123",
      "podcast_name": "Tech Innovation Weekly",
      "podcast_description": "Weekly discussions on emerging tech trends",
      "podcast_image_url": "https://image.example.com/thumb.jpg",
      "podcast_url": "https://techweekly.com",
      "publisher_name": "Sarah Tech",
      "itunes_rating": 4.7,
      "episode_count": 156,
      "audience_size": 75000,
      "podcast_categories": [
        {
          "category_id": "tech",
          "category_name": "Technology"
        }
      ],
      "demographics": {
        "age_groups": {"25-34": 35, "35-44": 40},
        "gender": {"male": 60, "female": 40},
        "episodes_analyzed": 50
      },
      "ai_clean_description": "A technology podcast focused on emerging innovations and their business impact",
      "ai_fit_reasons": [
        "Perfect audience of tech-savvy entrepreneurs and business leaders",
        "Regular discussions on SaaS and marketing automation align with expertise",
        "Host actively seeks guests with proven scaling experience"
      ],
      "ai_pitch_angles": [
        {
          "title": "From Startup to Scale: SaaS Growth Strategies",
          "description": "Share proven tactics for scaling SaaS companies from initial product-market fit to sustainable growth engines"
        }
      ],
      "ai_analyzed_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 15,
  "cached": 12,
  "fetched": 3,
  "stoppedEarly": false,
  "remaining": 0,
  "cachePerformance": {
    "cacheHitRate": 80.0,
    "apiCallsSaved": 24,
    "costSavings": 0.24
  },
  "stats": {
    "fromSheet": 15,
    "fromCache": 12,
    "podscanFetched": 3,
    "aiAnalysesGenerated": 3,
    "demographicsFetched": 3,
    "cachedWithAi": 10,
    "cachedWithDemographics": 8
  }
}
```

#### Response Format (Status Check)
```json
{
  "success": true,
  "podcastIds": ["podcast123", "podcast456"],
  "status": {
    "totalInSheet": 15,
    "cached": 12,
    "missing": 3,
    "withAi": 10,
    "withoutAi": 5,
    "withDemographics": 8
  }
}
```

#### Response Format (AI Analysis Only)
```json
{
  "success": true,
  "aiComplete": true,
  "stoppedEarly": false,
  "analyzed": 5,
  "remaining": 0,
  "total": 15
}
```

#### Operation Modes

**1. Standard Mode (Default)**
- Reads podcast IDs from Google Sheet column E
- Checks central podcast cache for existing data
- Fetches missing podcasts from Podscan API
- Runs AI analysis for fit assessment and pitch angles
- Fetches podcast demographics
- Caches everything for future use

**2. Cache Only Mode (`cacheOnly: true`)**
- Returns only data already cached in database
- Skips Google Sheets reading and API calls
- Fastest response time for dashboards

**3. AI Analysis Only (`aiAnalysisOnly: true`)**
- Runs AI analysis on cached podcasts lacking analysis
- Processes 30 podcasts concurrently (3 batches of 10)
- Stops early if approaching timeout limit
- Requires clientName and clientBio

**4. Check Status Only (`checkStatusOnly: true`)**
- Returns statistics without processing data
- Shows cache status and analysis completion
- Used for progress tracking

#### Caching Strategy
- **Central Cache**: Shared `podcasts` table used by all clients
- **Client-Specific**: AI analyses stored in `client_podcast_analyses`
- **Cache Benefits**: Eliminates redundant API calls, significant cost savings
- **Stale Cleanup**: Removes podcasts no longer in Google Sheet

#### AI Analysis Features
- **Fit Assessment**: Why the podcast matches the client
- **Pitch Angles**: 3 specific episode topic ideas
- **Clean Descriptions**: Concise podcast summaries
- **Personalized**: Unique analysis per client based on their bio

#### Performance Features
- **Concurrent Processing**: Multiple API calls in parallel
- **Timeout Protection**: Stops early to avoid function timeouts
- **Cost Tracking**: Reports API call savings and estimated cost reduction
- **Progress Monitoring**: Detailed stats for optimization

#### Example Request (Standard)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-client-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "clientId": "123e4567-e89b-12d3-a456-426614174000",
    "clientName": "Jennifer Smith",
    "clientBio": "Marketing automation expert and SaaS founder with 10+ years experience scaling B2B companies"
  }'
```

#### Example Request (Cache Only)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-client-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000",
    "cacheOnly": true
  }'
```

---

### get-customer-analytics

Returns revenue and customer statistics aggregated from orders and customers tables, with optional date range filtering.

**Endpoint:** `/functions/v1/get-customer-analytics`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "date_from": "2024-01-01T00:00:00Z",   // Optional: Start date filter (ISO timestamp)
  "date_to": "2024-12-31T23:59:59Z"      // Optional: End date filter (ISO timestamp)
}
```

All parameters are optional. If no body is provided, returns all-time statistics.

#### Response Format
```json
{
  "success": true,
  "analytics": {
    "total_customers": 150,
    "total_revenue": 45750.00,           // Sum of paid order amounts (rounded to 2 decimals)
    "avg_order_value": 305.00,           // Average paid order value (rounded to 2 decimals)
    "total_orders": 175,                 // All orders regardless of status
    "orders_by_status": {
      "paid": 150,
      "pending": 10,
      "refunded": 5,
      "failed": 10
    }
  }
}
```

#### Error Responses
```json
// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to fetch customer count: error message"
}
```

#### Features
- **Date Range Filtering**: Optional `date_from` and `date_to` filters applied to both customers and orders
- **Revenue Calculation**: Only includes orders with `status = 'paid'` in revenue totals
- **Order Breakdown**: Groups orders by status for pipeline visibility
- **Precise Rounding**: All monetary values rounded to 2 decimal places

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-customer-analytics \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "date_from": "2024-01-01T00:00:00Z",
    "date_to": "2024-03-31T23:59:59Z"
  }'
```

---

### get-guest-resources

Returns the published guest resources visible to one authenticated client
portal. The server validates the client's opaque portal session, derives the
client's active workspace, and applies all-client or exact selected-client
visibility before pagination. Omitting the portal token is allowed only for an
authenticated platform administrator using explicit client impersonation.

**Endpoint:** `/functions/v1/get-guest-resources`
**Method:** `POST`
**Authentication:** Exact client portal session, or platform-administrator JWT

#### Request Body
```json
{
  "clientId": "123e4567-e89b-12d3-a456-426614174000",
  "sessionToken": "123e4567-e89b-12d3-a456-426614174001",
  "category": "preparation",           // Optional: Filter by resource category
  "type": "article",                   // Optional: article, video, download, or link
  "featured_only": false,              // Optional: Only return featured resources (default: false)
  "limit": 50,                         // Optional: Max results (default: 50)
  "offset": 0                          // Optional: Offset for pagination (default: 0)
}
```

`clientId` is always required. `sessionToken` is required for a real portal
client and must match that client. A platform administrator may omit it only
while using the explicit impersonation path.

#### Response Format
```json
{
  "success": true,
  "resources": [
    {
      "id": "uuid",
      "title": "How to Sound Professional on Remote Podcast Interviews",
      "description": "A comprehensive guide to audio setup and presentation",
      "content": "<h2>Pre-Interview Setup</h2>...",
      "category": "technical_setup",
      "type": "article",
      "url": "https://example.com/resource",
      "file_url": "https://storage.example.com/file.pdf",
      "featured": true,
      "display_order": 1,
      "published_at": "2024-01-10T10:00:00Z",
      "updated_at": "2024-01-15T12:00:00Z"
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0
}
```

The portal projection deliberately excludes `workspace_id`, lifecycle state,
visibility rules, template provenance, actor IDs, and sibling client IDs.

#### Error Responses
```json
// 401 Unauthorized
{
  "error": "Session expired or invalid",
  "code": "INVALID_PORTAL_SESSION"
}
```

#### Features
- **Category Filtering**: Filter by resource category (preparation, technical_setup, best_practices, promotion, examples, templates)
- **Type Filtering**: Filter by article, video, download, or link
- **Featured Filter**: Optionally return only featured resources
- **Pagination**: Supports limit/offset pagination with total count
- **Isolation**: Workspace and audience are derived server-side from the validated client
- **Sorting**: Featured resources first, then `display_order`, title, and stable resource ID

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-guest-resources \
  -H "apikey: YOUR_PUBLIC_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000",
    "sessionToken": "123e4567-e89b-12d3-a456-426614174001",
    "category": "preparation",
    "featured_only": true,
    "limit": 10
  }'
```

---

### get-outreach-podcasts

Enhanced version of outreach podcast fetching with improved caching and error handling.

**Endpoint:** `/functions/v1/get-outreach-podcasts`  
**Method:** `POST`  
**Authentication:** Google Service Account + Podscan API key

#### Request Body
```json
{
  "clientId": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Parameters:**
- `clientId` (string, required): Client's UUID

#### Response Format
```json
{
  "success": true,
  "podcasts": [
    {
      "podcast_id": "podcast123",
      "podcast_name": "Business Growth Podcast", 
      "podcast_description": "Weekly insights on scaling businesses",
      "podcast_image_url": "https://image.example.com/thumb.jpg",
      "podcast_url": "https://bizgrowth.com",
      "publisher_name": "Mike Business",
      "itunes_rating": 4.6,
      "episode_count": 89,
      "audience_size": 45000
    }
  ],
  "total": 8
}
```

#### Description
1. Reads podcast IDs from client's Google Sheet column E
2. Checks central podcast cache for existing data  
3. Fetches missing/stale podcasts from Podscan API in batches
4. Updates central cache for future use
5. Returns complete podcast details with metadata
6. Handles sheet access errors gracefully

#### Key Improvements Over V1
- Uses central podcast caching system
- Batch processing for API calls (5 concurrent)
- Better error handling and logging
- Returns full podcast metadata, not just IDs
- Automatic cache updates

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-outreach-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

---

### get-pipeline-analytics

Returns monthly pipeline metrics including booking status breakdown, completion rate, and active client count.

**Endpoint:** `/functions/v1/get-pipeline-analytics`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "month": 3,                           // Optional: Month number 1-12 (default: current month)
  "year": 2026                          // Optional: Year (default: current year)
}
```

All parameters are optional. If no body is provided, returns current month's metrics.

#### Response Format
```json
{
  "success": true,
  "pipeline": {
    "total": 25,                        // Total bookings for the month
    "by_status": {
      "conversation_started": 5,
      "booked": 8,
      "in_progress": 4,
      "published": 6,
      "cancelled": 2
    },
    "completion_rate": 24.00,           // Percentage of bookings with "published" status
    "active_clients": 18,              // Total clients with status "active"
    "month": 3,
    "year": 2026
  }
}
```

#### Error Responses
```json
// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to fetch bookings: error message"
}
```

#### Features
- **Monthly Filtering**: Filters bookings by `scheduled_date` matching the requested month/year
- **Status Breakdown**: Groups bookings by status for pipeline visibility
- **Completion Rate**: Calculates percentage of bookings reaching "published" status
- **Active Clients**: Returns count of clients with `status = 'active'`
- **Default to Current Month**: Automatically uses current month/year if not specified

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-pipeline-analytics \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "month": 3,
    "year": 2026
  }'
```

---

### get-podcast-demographics

Fetches podcast demographic data from the Podscan API with a 30-day cache layer in the local database. Looks up podcasts by either `podscan_id` or internal UUID.

**Endpoint:** `/functions/v1/get-podcast-demographics`
**Method:** `POST`
**Authentication:** Podscan API key required via environment variables

#### Request Body
```json
{
  "podcast_id": "string"               // Required: Podscan podcast ID or internal UUID
}
```

#### Response Format (Cached)
```json
{
  "success": true,
  "demographics": {
    "episodes_analyzed": 50,
    "age_groups": {"25-34": 35, "35-44": 40, "45-54": 15, "18-24": 10},
    "gender": {"male": 60, "female": 38, "other": 2},
    "topics": ["technology", "business", "startups"],
    "locations": {"US": 55, "UK": 15, "CA": 10}
  },
  "cached": true
}
```

#### Response Format (Fresh from API)
```json
{
  "success": true,
  "demographics": {
    "episodes_analyzed": 50,
    "age_groups": {"25-34": 35, "35-44": 40},
    "gender": {"male": 60, "female": 40},
    "topics": ["technology", "business"]
  },
  "cached": false
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "success": false,
  "error": "podcast_id is required"
}

// 404 Not Found
{
  "success": false,
  "error": "Podcast not found: podcast123"
}

// 404 Not Found
{
  "success": false,
  "error": "Demographics not available for this podcast"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "PODSCAN_API_KEY not configured"
}
```

#### Features
- **30-Day Cache**: Returns cached demographics if fetched within the last 30 days
- **Dual Lookup**: Tries `podscan_id` first, falls back to internal UUID
- **Auto-Cache**: Fresh API results are automatically cached in the `podcasts` table
- **Non-Fatal Cache Errors**: If caching fails, the fresh data is still returned
- **Validation**: Checks for valid demographics data (requires `episodes_analyzed` field)

#### Required Environment Variables
- `PODSCAN_API_KEY` - Required for Podscan demographics API calls

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-podcast-demographics \
  -H "Content-Type: application/json" \
  -d '{
    "podcast_id": "the-tim-ferriss-show"
  }'
```

---

### get-prospect-dashboard

Securely retrieves public prospect dashboard data by slug, including feedback entries. Increments view count on each access.

**Endpoint:** `/functions/v1/get-prospect-dashboard`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables (no caller auth required — public endpoint)

#### Request Body
```json
{
  "slug": "string"                      // Required: Dashboard URL slug
}
```

#### Response Format
```json
{
  "success": true,
  "dashboard": {
    "id": "uuid",
    "slug": "abc12345",
    "prospect_name": "Sarah Martinez",
    "prospect_bio": "Digital marketing consultant...",
    "prospect_image_url": "https://example.com/photo.jpg",
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "is_active": true,
    "show_pricing_section": true,
    "personalized_tagline": "We've curated 12 podcasts perfect for...",
    "media_kit_url": "https://docs.google.com/document/d/abc123/edit",
    "loom_video_url": "https://www.loom.com/share/abc123",
    "loom_thumbnail_url": "https://cdn.loom.com/sessions/thumbnails/abc123.jpg",
    "loom_video_title": "Your Personalized Podcast Strategy",
    "show_loom_video": true,
    "testimonial_ids": ["uuid1", "uuid2"],
    "show_testimonials": true,
    "view_count": 5
  },
  "feedback": [
    {
      "id": "uuid",
      "prospect_dashboard_id": "uuid",
      "podcast_id": "podcast123",
      "status": "approved",
      "notes": "Great fit!",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "success": false,
  "error": "slug is required"
}

// 404 Not Found
{
  "success": false,
  "error": "Dashboard not found"
}

// 404 Not Found (inactive)
{
  "success": false,
  "error": "This dashboard link is no longer active"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Internal server error"
}
```

#### Features
- **Public Access**: No authentication required — designed for prospect-facing dashboard pages
- **Slug-Based Lookup**: Finds dashboard by URL-friendly slug
- **Active Check**: Returns 404 for inactive dashboards
- **View Count Tracking**: Atomically increments `view_count` and updates `last_viewed_at` on each access
- **Feedback Included**: Returns all `prospect_podcast_feedback` entries for the dashboard
- **Parallel Operations**: Fetches feedback and increments view count concurrently

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-prospect-dashboard \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "abc12345"
  }'
```

---

### get-prospect-podcasts

Comprehensive prospect dashboard podcast management with the same advanced features as get-client-podcasts but optimized for prospect workflows.

**Endpoint:** `/functions/v1/get-prospect-podcasts`  
**Method:** `POST`  
**Authentication:** Multiple APIs (Google Sheets, Podscan, Anthropic)

#### Request Body (Standard Mode)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", 
  "prospectDashboardId": "dash_abc123",
  "prospectName": "David Wilson",
  "prospectBio": "Financial advisor specializing in retirement planning for executives"
}
```

#### Request Body (Operation Modes)
```json
{
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
  "prospectDashboardId": "dash_abc123", 
  "cacheOnly": true,
  "skipAiAnalysis": false,
  "aiAnalysisOnly": true,
  "checkStatusOnly": false
}
```

**Parameters:**
- `spreadsheetId` (string, required): Google Sheets ID containing curated podcasts
- `prospectDashboardId` (string, required): Prospect dashboard UUID
- `prospectName` (string, conditional): Required for AI analysis
- `prospectBio` (string, conditional): Required for AI analysis  
- `cacheOnly` (boolean, optional): Return only cached data with analyses
- `skipAiAnalysis` (boolean, optional): Skip AI fit analysis for new podcasts
- `aiAnalysisOnly` (boolean, optional): Only run AI analysis on cached podcasts
- `checkStatusOnly` (boolean, optional): Return status without processing

#### Response Format (Standard)
```json
{
  "success": true,
  "podcasts": [
    {
      "podcast_id": "podcast123",
      "podcast_name": "Retirement Planning Weekly",
      "podcast_description": "Expert advice on retirement and financial planning",
      "podcast_image_url": "https://image.example.com/thumb.jpg", 
      "podcast_url": "https://retirementweekly.com",
      "publisher_name": "Susan Finance",
      "itunes_rating": 4.8,
      "episode_count": 245,
      "audience_size": 125000,
      "podcast_categories": [
        {
          "category_id": "finance",
          "category_name": "Business/Finance"
        }
      ],
      "demographics": {
        "age_groups": {"45-54": 40, "55-64": 35},
        "income_levels": {"$75k+": 80},
        "episodes_analyzed": 75
      },
      "ai_clean_description": "A trusted resource for retirement planning advice targeting high-income professionals", 
      "ai_fit_reasons": [
        "Perfect audience of executives approaching retirement age",
        "Regular coverage of advanced retirement strategies aligns with expertise",
        "Host actively seeks financial advisors with executive client experience"
      ],
      "ai_pitch_angles": [
        {
          "title": "Executive Retirement Planning Mistakes to Avoid",
          "description": "Share insights on the top planning errors executives make and how proper guidance prevents costly missteps"
        }
      ],
      "ai_analyzed_at": "2024-01-15T14:20:00Z"
    }
  ],
  "total": 20,
  "cached": 18,
  "fetched": 2,
  "stoppedEarly": false,
  "remaining": 0,
  "cachePerformance": {
    "cacheHitRate": 90.0,
    "apiCallsSaved": 36,
    "costSavings": 0.36
  }
}
```

#### Response Format (Fast Path Cache Only)
```json
{
  "success": true,
  "podcasts": [/* full podcast objects with AI analyses */],
  "total": 15,
  "cached": 15,
  "missing": 0,
  "fastPath": true
}
```

#### Key Features

**Prospect-Specific Design**
- Stores AI analyses in `prospect_podcast_analyses` table (separate from clients)
- Each prospect gets personalized fit analysis and pitch angles
- Maintains linkage between prospect dashboards and central podcast cache

**Fast Path Optimization**
- When `cacheOnly: true` and `prospectDashboardId` provided, skips Google Sheets entirely
- Uses JOIN query to fetch podcasts with analyses in single database call
- Perfect for serving completed prospect dashboards

**Central Cache Benefits**
- Same podcasts available across all prospects and clients
- Massive API call savings when podcasts are reused
- Demographic data shared but AI analysis personalized

**Advanced Operation Modes**
- **Cache Only**: Ultra-fast dashboard serving
- **AI Analysis Only**: Batch process AI analysis (30 concurrent)
- **Check Status**: Progress monitoring for dashboard completion
- **Standard**: Full processing with caching and analysis

**Intelligent Stale Data Cleanup**
- Automatically removes prospect podcast analyses for podcasts no longer in sheet
- Prevents outdated data accumulation
- Maintains data integrity

#### Example Request (Standard Mode)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-prospect-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "prospectDashboardId": "dash_prospect_123", 
    "prospectName": "Maria Rodriguez",
    "prospectBio": "HR technology consultant helping enterprise companies optimize their talent management systems"
  }'
```

#### Example Request (Fast Path)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-prospect-podcasts \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prospectDashboardId": "dash_prospect_123",
    "cacheOnly": true
  }'
```

---

### get-testimonials

Retrieves testimonials with filtering by active status and featured status, ordered by display order.

**Endpoint:** `/functions/v1/get-testimonials`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables (no caller auth required)

#### Request Body
```json
{
  "featured_only": false,              // Optional: Only return featured testimonials (default: false)
  "active_only": true,                 // Optional: Only return active testimonials (default: true)
  "limit": 20                          // Optional: Max results (default: 20)
}
```

All parameters are optional. If no body is provided, returns all active testimonials.

#### Response Format
```json
{
  "success": true,
  "testimonials": [
    {
      "id": "uuid",
      "video_url": "https://www.youtube.com/watch?v=abc123",
      "client_name": "Sarah Johnson",
      "client_title": "CEO",
      "client_company": "GrowthLab Inc",
      "client_photo_url": "https://example.com/photo.jpg",
      "quote": "Get On A Pod transformed our thought leadership strategy...",
      "is_featured": true,
      "display_order": 1,
      "is_active": true,
      "created_at": "2024-01-10T10:00:00Z"
    }
  ],
  "total": 8
}
```

#### Error Responses
```json
// 500 Internal Server Error
{
  "success": false,
  "error": "Internal server error"
}
```

#### Features
- **Active Filtering**: Default behavior only returns active testimonials (suitable for public pages)
- **Featured Filter**: Optionally return only featured/highlighted testimonials
- **Limit Control**: Configurable result count
- **Sorting**: Ordered by `display_order` ascending, then `created_at` descending
- **Video Support**: Includes `video_url` for video testimonials

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-testimonials \
  -H "Content-Type: application/json" \
  -d '{
    "featured_only": true,
    "limit": 5
  }'
```

---

### get-upcoming-bookings

Retrieves upcoming podcast recordings and publications within a configurable time window, with optional filtering by type.

**Endpoint:** `/functions/v1/get-upcoming-bookings`
**Method:** `POST`
**Authentication:** Service Role Key required via environment variables

#### Request Body
```json
{
  "days_ahead": 30,                    // Optional: Days to look ahead (default: 30, must be >= 1)
  "type": "all"                        // Optional: "recordings", "publications", or "all" (default: "all")
}
```

All parameters are optional. If no body is provided, returns all upcoming bookings within 30 days.

#### Response Format
```json
{
  "success": true,
  "bookings": [
    {
      "id": "uuid",
      "podcast_name": "Tech Innovation Weekly",
      "podcast_url": "https://techweekly.com",
      "host_name": "Sarah Tech",
      "client_id": "uuid",
      "client_name": "John Smith",
      "recording_date": "2026-04-01T14:00:00Z",
      "publish_date": "2026-04-15T10:00:00Z",
      "status": "booked",
      "prep_sent": true,
      "episode_url": null,
      "notes": "Discussing AI trends in marketing",
      "type": "recording"
    }
  ],
  "total": 12
}
```

#### Error Responses
```json
// 400 Bad Request
{
  "success": false,
  "error": "days_ahead must be a positive number"
}

// 400 Bad Request
{
  "success": false,
  "error": "Invalid type 'invalid'. Must be one of: recordings, publications, all"
}

// 500 Internal Server Error
{
  "success": false,
  "error": "Failed to fetch upcoming recordings: error message"
}
```

#### Features
- **Dual Query**: Separately fetches upcoming recordings and publications with appropriate date/status filters
- **Recording Filters**: Only includes bookings with status `conversation_started`, `booked`, or `in_progress` for recordings
- **Publication Filters**: Includes all bookings with upcoming `publish_date` regardless of status
- **Client Join**: Includes client name and email via join on `clients` table
- **Deduplication**: When type is `all`, deduplicates bookings that appear in both recording and publication queries
- **Type Annotation**: Each booking includes a `type` field ("recording" or "publication")
- **Configurable Window**: `days_ahead` controls how far into the future to look
- **Sorted**: Recordings sorted by `recording_date`, publications by `publish_date`

#### Example Request
```bash
curl -X POST https://your-project.supabase.co/functions/v1/get-upcoming-bookings \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "days_ahead": 14,
    "type": "recordings"
  }'
```

---

## Error Handling

All functions implement consistent error handling with CORS support:

```json
{
  "success": false,
  "error": "Detailed error message explaining what went wrong"
}
```

Common error scenarios:
- **400 Bad Request**: Missing required parameters
- **401 Unauthorized**: Invalid session tokens or missing API keys
- **404 Not Found**: Resources not found (clients, sheets, podcasts)
- **500 Internal Server Error**: API failures, database errors, or processing issues

## Environment Variables Required

Functions require the following environment variables to be configured:

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Google service account credentials for Sheets API
- `GOOGLE_WORKSPACE_USER_EMAIL`: Email for domain-wide delegation
- `ANTHROPIC_API_KEY`: Claude AI API key for content generation
- `PODSCAN_API_KEY`: Podscan API key for podcast data
- `EMAIL_BISON_API_TOKEN`: Email Bison API token for email operations

## Rate Limiting and Performance

- **Concurrent Processing**: Most functions use batch processing with controlled concurrency
- **Timeout Protection**: Functions implement early termination to avoid timeout limits
- **Caching Strategy**: Extensive use of central caching to minimize API calls
- **Cost Optimization**: Track and report API call savings and estimated cost reductions

## Usage Notes

1. **Authentication**: Functions use service-to-service authentication via environment variables
2. **CORS**: All functions support CORS for browser-based applications
3. **Caching**: Aggressive caching strategy significantly reduces API costs and improves performance
4. **Error Recovery**: Functions handle partial failures gracefully and provide detailed error information
5. **Scalability**: Designed to handle multiple concurrent requests efficiently
