# Blog System Setup Guide

## 🎯 Overview

The Authority Lab blog system is an AI-powered, SEO-optimized blog integrated into the main React application with:
- AI content generation using Claude API
- Google Indexing API for fast indexation
- Rich text editor (TipTap)
- Full SEO optimization (meta tags, schema markup, sitemap)
- Admin CRUD interface

---

## ✅ What's Already Done

### Database
- ✅ 3 tables created: `blog_posts`, `blog_categories`, `blog_indexing_log`
- ✅ Row Level Security (RLS) policies configured
- ✅ 5 categories seeded (Podcast Strategy, Content Marketing, etc.)

### Frontend
- ✅ Blog listing page with search and filters (`/blog`)
- ✅ Individual blog post pages (`/blog/:slug`)
- ✅ Admin blog management (`/admin/blog`)
- ✅ Rich text editor with AI generation (`/admin/blog/new`)
- ✅ BlogCard, BlogSEO, and BlogPost components
- ✅ React Helmet for dynamic meta tags

### Backend
- ✅ Edge Functions created (not yet deployed):
  - `generate-blog-content` - AI content generation
  - `submit-to-indexing` - Google Indexing API
- ✅ Blog services (CRUD operations)
- ✅ Sitemap generation script

---

## 🚀 Deployment Steps

### 1. Deploy Edge Functions

Run the deployment script:

```bash
# Deploy both Edge Functions at once
./scripts/deploy-edge-functions.sh

# Or deploy individually:
npx supabase functions deploy generate-blog-content
npx supabase functions deploy submit-to-indexing
```

### 2. Set Environment Secrets

Set the required secrets in Supabase:

```bash
# Anthropic API Key (for AI generation)
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...

# Google Indexing API Token (optional - for indexation)
npx supabase secrets set GOOGLE_INDEXING_TOKEN=ya29...

# Supabase Service Role Key (for admin operations)
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Where to find these:**
- **ANTHROPIC_API_KEY**: Get from https://console.anthropic.com/
- **GOOGLE_INDEXING_TOKEN**: See "Google Indexing API Setup" below
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase Dashboard → Settings → API → service_role key

### 3. Verify Deployment

```bash
# Check function status
npx supabase functions list

# View function logs
npx supabase functions logs generate-blog-content
npx supabase functions logs submit-to-indexing
```

---

## 🔑 Google Indexing API Setup (Optional but Recommended)

The Google Indexing API allows your blog posts to be indexed within hours instead of weeks.

### Step-by-Step:

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Create a new project (e.g., "Authority Lab Blog")

2. **Enable Indexing API**
   - Go to API & Services → Library
   - Search for "Indexing API"
   - Click "Enable"

3. **Create Service Account**
   - Go to IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Name: "blog-indexing"
   - Click "Create and Continue"
   - Skip role assignment, click "Done"

4. **Create Service Account Key**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create New Key"
   - Choose "JSON"
   - Download the JSON file (keep it secure!)

5. **Add Service Account to Search Console**
   - Go to https://search.google.com/search-console
   - Select your property (getonapod.com)
   - Go to Settings → Users and permissions
   - Click "Add user"
   - Paste the service account email from the JSON file
   - Select "Owner" permission
   - Click "Add"

6. **Get Access Token**

   Option A: Use the JSON file directly (recommended for production):
   ```bash
   # Install Google Auth Library
   npm install google-auth-library

   # Use in Edge Function (see submit-to-indexing/index.ts)
   ```

   Option B: Get a temporary token (for testing):
   ```bash
   # Install gcloud CLI: https://cloud.google.com/sdk/docs/install
   gcloud auth application-default login
   gcloud auth application-default print-access-token
   ```

7. **Set the Secret**
   ```bash
   npx supabase secrets set GOOGLE_INDEXING_TOKEN=ya29...
   ```

---

## 🔍 Google Search Console API Setup (Verify Indexing Status)

The Google Search Console API allows you to verify if your blog posts are **actually indexed** by Google (not just submitted).

### Differences from Indexing API

| Feature | Indexing API | Search Console API |
|---------|-------------|-------------------|
| Purpose | Submit URLs to Google | Check if URLs are indexed |
| Auth | Service Account | OAuth 2.0 |
| Token Lifespan | 1 hour | Refresh token (permanent) |
| Quota | 200 requests/minute | 2,000 requests/day |

### Step-by-Step Setup:

#### 1. Enable Search Console API

- Go to https://console.cloud.google.com/
- Navigate to "APIs & Services" > "Library"
- Search for "Google Search Console API"
- Click "Enable"

#### 2. Create OAuth 2.0 Credentials

- Go to "APIs & Services" > "Credentials"
- Click "Create Credentials" > "OAuth client ID"
- Application type: "Web application"
- Name: "Authority Lab Blog - Search Console"
- Authorized redirect URIs:
  - `http://localhost:3000/oauth/callback` (for setup)
  - `https://getonapod.com/oauth/callback` (optional, for production)
- Click "Create"
- Download the JSON file with your credentials

#### 3. Get Refresh Token

Run the authorization script to obtain a refresh token:

```bash
# Install dependencies (if not already installed)
npm install google-auth-library

# Run authorization script
node scripts/get-google-refresh-token.js path/to/oauth-client.json
```

This will:
1. Start a local HTTP server on port 3000
2. Display a URL to visit in your browser
3. Ask you to sign in with Google account that has Search Console access
4. Display your refresh token after authorization

**Important:** The Google account must have "Owner" permission on the getonapod.com Search Console property.

#### 4. Store Credentials in Supabase

```bash
# Set OAuth credentials as Supabase secrets
npx supabase secrets set \
  GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN="1//0g..." \
  GOOGLE_SEARCH_CONSOLE_CLIENT_ID="123456789-abc..." \
  GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET="GOCSPX-xyz..."
```

**Note:** These credentials don't expire (unless you revoke access), so you only need to set them once.

#### 5. Deploy Edge Function

```bash
# Deploy the check-indexing-status function
npx supabase functions deploy check-indexing-status
```

#### 6. Test the Integration

In the admin dashboard (`/admin/blog`):
1. Find a published post that's been submitted to Google
2. Click the "Check Status" button (magnifying glass icon)
3. Wait 2-3 seconds for the API response
4. See toast notification with indexing status

### How It Works

1. **Submission** (Google Indexing API): Notifies Google that URL exists
2. **Verification** (Search Console API): Checks if Google actually indexed it
3. **Database Update**: Sets `indexed_by_google_at` timestamp when confirmed
4. **UI Badge**: Shows "Indexed" (green) when verified

### Quota Management

- **Daily Limit:** 2,000 requests per day per project
- **Rate Limiting:** Frontend waits 500ms between batch checks
- **Best Practice:** Check posts individually or in small batches

### Troubleshooting

#### "OAuth token refresh failed"
- Your refresh token may be invalid or revoked
- Re-run `get-google-refresh-token.js` to get a new one
- Check that secrets are set correctly in Supabase:
  ```bash
  npx supabase secrets list
  ```

#### "URL not found in Search Console property"
- Post may be too new (not yet discovered by Google)
- Ensure post was submitted via Indexing API first
- Verify Search Console property includes https://getonapod.com

#### "Daily quota exceeded"
- You've made 2,000+ API calls today
- Wait until tomorrow (quota resets at midnight Pacific Time)
- Avoid batch checking large numbers of posts

#### "Permission denied"
- OAuth account lacks access to Search Console property
- Verify the Google account has "Owner" permission in Search Console
- Go to https://search.google.com/search-console > Settings > Users

### Monitoring

View function logs:
```bash
npx supabase functions logs check-indexing-status --tail
```

Check indexing log in database:
```sql
SELECT * FROM blog_indexing_log
WHERE action = 'check_status'
ORDER BY created_at DESC
LIMIT 20;
```

View posts indexed status:
```sql
SELECT
  title,
  submitted_to_google_at,
  indexed_by_google_at,
  google_indexing_status
FROM blog_posts
WHERE status = 'published'
ORDER BY indexed_by_google_at DESC NULLS LAST
LIMIT 10;
```

---

## 📝 Usage Guide

### Creating a Blog Post with AI

1. **Go to Admin Dashboard**
   - Navigate to `/admin/blog`
   - Click "New Post"

2. **Enter Basic Info**
   - Title: "How to Get Booked on Top Podcasts in 2025"
   - Category: Select from dropdown
   - Tags: Add relevant tags

3. **Generate Content with AI**
   - Click "Generate with AI" button in editor
   - Enter prompt: "Tips for entrepreneurs to get booked on business podcasts"
   - Optional: Add focus keywords
   - Click "Generate"
   - Wait 15-30 seconds for Claude to generate content

4. **Edit and Enhance**
   - Review AI-generated content
   - Edit with rich text toolbar (bold, headings, lists, links)
   - Upload featured image
   - Adjust meta description for SEO
   - Add focus keyword

5. **Preview and Publish**
   - Click "Save Draft" to save without publishing
   - Click "Publish" when ready
   - Post goes live immediately at `/blog/your-slug`
   - Automatically submitted to Google Indexing API

### Managing Blog Posts

**View All Posts**
- Go to `/admin/blog`
- See stats: Total, Published, Drafts, Views
- Filter by status, category, or search

**Edit a Post**
- Click edit icon on any post
- Make changes
- Click "Save Draft" or "Publish"

**Unpublish a Post**
- Click globe icon to toggle publish status
- Post moves to drafts

**Delete a Post**
- Click trash icon
- Confirm deletion

**Resubmit to Google**
- Click refresh icon (only shows if not indexed)
- Resubmits URL to Google Indexing API

---

## 🔍 SEO Features

### Auto-Generated on Publish:
- ✅ Meta title and description
- ✅ Open Graph tags (Facebook)
- ✅ Twitter Card tags
- ✅ Canonical URLs
- ✅ Schema.org JSON-LD structured data
- ✅ XML sitemap entry
- ✅ Google Indexing API submission

### Manual Optimization:
- Focus keyword tracking
- Custom meta descriptions
- Featured images with alt text
- Read time calculation
- Category and tag taxonomies

---

## 🛠️ Technical Architecture

### Frontend (`/src`)
```
pages/
  Blog.tsx                    # Blog listing with search/filters
  BlogPost.tsx                # Individual post detail page
  admin/
    BlogManagement.tsx        # Admin post list
    BlogEditor.tsx            # Create/edit posts
components/
  blog/
    BlogCard.tsx              # Post preview card
    BlogSEO.tsx               # SEO meta tags
    RichTextEditor.tsx        # TipTap editor with AI
services/
  blog.ts                     # CRUD operations
  indexing.ts                 # Google Indexing API client
```

### Backend (`/supabase`)
```
migrations/
  20250125_blog_system.sql    # Database schema
functions/
  generate-blog-content/      # AI content generation
    index.ts
  submit-to-indexing/         # Google Indexing API
    index.ts
```

### Scripts (`/scripts`)
```
generate-sitemap.ts           # XML sitemap generator
deploy-edge-functions.sh      # Deployment script
```

---

## 📊 Database Schema

### blog_posts
- `id` - UUID primary key
- `slug` - Unique URL slug
- `title` - Post title
- `content` - HTML content from editor
- `excerpt` - Short summary
- `meta_description` - SEO meta description
- `featured_image_url` - Image URL
- `focus_keyword` - Primary SEO keyword
- `schema_markup` - JSON-LD structured data
- `category_id` - Foreign key to blog_categories
- `tags` - Array of tag strings
- `status` - 'draft' or 'published'
- `published_at` - Timestamp
- `view_count` - Page views
- `read_time_minutes` - Calculated read time
- `submitted_to_google_at` - Indexing submission time
- `indexed_by_google_at` - Indexing confirmation time
- `author_name` - Author display name

### blog_categories
- `id` - UUID primary key
- `name` - Category name
- `slug` - URL slug
- `description` - Category description
- `display_order` - Sort order

### blog_indexing_log
- `id` - UUID primary key
- `post_id` - Foreign key to blog_posts
- `url` - Submitted URL
- `service` - 'google'
- `action` - 'submit', 'update', 'check_status'
- `status` - 'success', 'failed', 'pending'
- `response_data` - JSON response from API
- `created_at` - Timestamp

---

## 🧪 Testing

### Test AI Generation
```bash
# Call Edge Function directly
curl -X POST 'https://ysjwveqnwjysldpfqzov.supabase.co/functions/v1/generate-blog-content' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "How to prepare for a podcast interview",
    "category": "Podcast Strategy",
    "keywords": "podcast, interview, preparation",
    "wordCount": 1500
  }'
```

### Test Sitemap Generation
```bash
npm run sitemap
# Check public/sitemap.xml
```

### Test Full Build
```bash
npm run build
# Sitemap should generate before build
```

---

## 🐛 Troubleshooting

### Edge Function Deployment Fails
```bash
# Check you're logged in to Supabase
npx supabase login

# Link to your project
npx supabase link --project-ref ysjwveqnwjysldpfqzov

# Try deploying again
npx supabase functions deploy generate-blog-content
```

### AI Generation Not Working
- Check ANTHROPIC_API_KEY is set correctly
- Check function logs: `npx supabase functions logs generate-blog-content`
- Verify API key at https://console.anthropic.com/

### Google Indexing API Fails
- Verify GOOGLE_INDEXING_TOKEN is valid (tokens expire!)
- Check service account has Owner permission in Search Console
- Check function logs: `npx supabase functions logs submit-to-indexing`

### Sitemap Not Generating
- Check environment variables are set
- Run manually: `npm run sitemap`
- Check console output for errors

---

## 📈 Next Steps

### Content Strategy
1. Create 5-10 initial posts using AI generation
2. Optimize meta descriptions and focus keywords
3. Add internal links to premium placements
4. Share on social media

### SEO Optimization
1. Submit sitemap to Google Search Console
2. Monitor indexation status in admin panel
3. Track organic traffic in analytics
4. Optimize top-performing posts

### Growth Tactics
1. Publish 2-3 posts per week
2. Target long-tail keywords (low competition)
3. Link between related blog posts
4. Add CTAs to premium placements
5. Build email list from blog traffic

---

## 🎉 You're Ready!

The blog system is fully functional and ready to use. Start creating content and watch your organic traffic grow!

**Questions?** Check the code comments or reach out for support.
