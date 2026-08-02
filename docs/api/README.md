# Get On A Pod API Documentation Index

> **Invite-only MVP note:** this index contains historical endpoint detail and
> is not the deployment manifest. Billing, Stripe, HeyGen/video generation,
> magic-link portal auth, AI Sales Director, and several admin modules are
> retired or 410 tombstones. Use the root `README.md` and
> `docs/invite-only-mvp.md` as the release contract. The exact 17 tombstones,
> 90-function deploy allowlist, and two tenant exclusions are recorded in
> `docs/invite-only-edge-manifest.json`; any conflicting example below is
> historical. No provider credential may be placed in a `VITE_` variable.

Welcome to the comprehensive API documentation for **Get On A Pod** - a podcast placement platform that manages client bookings, outreach campaigns, and premium podcast opportunities.

## 🚀 Quick Start Guide

### Authentication Methods

Get On A Pod supports multiple authentication systems:

1. **Admin Authentication** (Supabase Auth + Admin Table)
   - Google OAuth or email/password
   - Admin email validation via `admin_users` table
   - JWT tokens for API access

2. **Client Portal Authentication** (Session-based)
   - Password authentication only
   - Historical magic-link endpoints return HTTP 410
   - Session tokens with 24-hour expiry
   - Admin impersonation for support

3. **Service Role Access** (Backend Functions)
   - Supabase service role key for Edge Functions
   - Used for automated operations and secure data access

### Base URLs

- **Main Application**: `https://getonapod.com`
- **Client Portal**: `https://getonapod.com/portal`
- **Supabase Edge Functions**: `https://your-project.supabase.co/functions/v1/`
- **Supabase Database**: Direct connection via Supabase client

## 📋 API Categories Overview

### [Client Portal System](client-portal.md)
**Complete client-facing interface for podcast management**
- 🔐 **Authentication**: Magic links and password login
- 📊 **Dashboard**: Booking tracking, analytics, calendar view
- 🛍️ **E-commerce**: Addon services and premium placements
- 📚 **Resources**: Educational content and best practices

### [Database Schema](database-schema.md)
**37 tables powering the entire platform**
- 👥 **Core Entities**: Clients, bookings, podcasts, orders
- 💳 **E-commerce**: Customers, orders, premium podcasts, addons
- ✉️ **Communication**: Email logs, outreach messages, campaign replies
- 🔗 **Portal System**: Sessions, tokens, activity logs
- 📊 **Analytics**: Fit analyses, cache statistics, sync history
- 🤖 **AI & Vectors**: Podcast embeddings (pgvector), client/prospect analyses
- 📋 **Outreach**: Outreach actions, approval workflows, guest resources

### [Edge Functions (A-F)](edge-functions-a-f.md)
**16 Functions - Analysis, authentication, automation, and categorization**
- 🤖 **AI Analysis**: `analyze-podcast-fit`, `auto-categorize-podcast`, `classify-reply`; `analyze-sales-call` is retired
- 🔐 **Account Creation**: `create-client-account`; `create-outreach-message` is excluded from the tenant environment
- 💳 **Checkout**: `create-addon-checkout` and `create-checkout-session` are retired tombstones
- 📊 **Data Operations**: `append-prospect-sheet`, `backfill-prospect-podcasts`, `create-prospect-sheet`
- 🔗 **Webhooks**: `campaign-reply-webhook` is excluded from the tenant environment
- 🔍 **SEO**: `check-indexing-status`

### [Edge Functions (D-G)](edge-functions-d-g.md)
**Data operations, generation, analytics, and Google integrations**
- 🗑️ **Data Operations**: `delete-outreach-podcast`, `delete-podcast-from-sheet`, `delete-reply`
- 📥 **Reply Management**: `fetch-and-classify-replies`, `fetch-email-thread`
- 📄 **Content Generation**: `generate-blog-content`, `generate-client-bio`, `generate-guest-resource`, `generate-media-kit-doc`, `generate-podcast-queries`, `generate-podcast-summary`, `generate-reply`, `generate-tagline`
- 📊 **Data Retrieval**: `get-blog-posts`, `get-client-bookings`, `get-client-outreach-podcasts`, `get-client-podcasts`, `get-guest-resources`, `get-outreach-podcasts`, `get-pipeline-analytics`, `get-podcast-demographics`, `get-prospect-dashboard`, `get-prospect-podcasts`, `get-testimonials`, `get-upcoming-bookings`; `get-customer-analytics` is retired

### [Edge Functions (L-S)](edge-functions-l-s.md)
**Login, management, QA, search, and synchronization**
- 🔐 **Authentication**: `login-with-password`, `logout-portal-session`; `send-portal-magic-link` is retired
- 👨‍💼 **Admin Management**: `manage-workspace-users`; `manage-admin-users` is retired
- 📞 **Outreach**: `read-outreach-list`, `score-podcast-compatibility`, `search-podcasts`, `send-outreach-webhook`
- ✉️ **Email**: `send-reply`, `resend-webhook`
- 🔍 **QA**: `qa-review-podcasts`
- 📈 **SEO**: `submit-to-indexing`
- 🔄 **Sync**: `sync-replies`; `sync-fathom-calls` is retired
- 💳 **Payments**: `stripe-webhook` is retired

### [Edge Functions (U-V + Shared)](edge-functions-v-shared.md)
**Order management, validation functions, and shared utilities**
- 📦 **Order Management**: `update-order-status` is retired
- ✅ **Validation**: `validate-portal-session`; `verify-portal-token` is retired
- 🗂️ **Workspace resources**: `workspace-guest-resources` provides audited tenant and platform-owner selected-workspace CRUD
- 📧 **Email Templates**: Workspace invitation and operational emails
- 🗄️ **Podcast Cache**: Central caching system (60-80% API savings)

### [Frontend API Layer](frontend-api-layer.md)
**React-based frontend with TypeScript and React Query**
- ⚛️ **Architecture**: Supabase client, service patterns, context providers
- 🔐 **Auth Contexts**: Admin and client portal authentication
- 📊 **Data Layer**: React Query integration, caching strategies, Zustand state management
- 🎯 **External APIs**: Podscan, HeyGen video, Stripe, Google Calendar, Anthropic Claude
- 🛒 **E-commerce**: Cart store, checkout, orders, premium placements
- 📱 **Components**: Protected routes, error handling, Sentry monitoring
- 🧩 **Services**: 20+ domain-specific service modules

### [Admin Features](admin-features.md)
**24 admin pages for platform management**
- 📊 **Dashboard**: Overview, analytics, calendar
- 👥 **Management**: Clients, customers, prospects, orders, onboarding
- 🎙️ **Podcasts**: Finder, database, premium placements
- 📧 **Outreach**: Platform, messages, automation
- 📝 **Content**: Blog, guest resources, video management

### [MCP Server](mcp-server.md)
**Model Context Protocol server for AI-powered prospect management**
- 🤖 **AI Matching**: Semantic search with pgvector embeddings
- 📊 **Prospect Management**: Create dashboards with structured profiles
- 🔍 **Advanced Search**: Embedding-based similarity with AI filtering (0.30 threshold)
- 📈 **BridgeKit Compatible**: HTTP API bridge for web integration

## 🛠️ Core Architecture

### Technology Stack
```
Frontend:     React + TypeScript + Tailwind + React Query + Zustand
Backend:      Supabase (PostgreSQL + Edge Functions)
Auth:         Supabase Auth + Custom Portal System
AI Services:  OpenAI (embeddings) + Anthropic Claude (analysis/generation)
Video:        Retired (historical endpoints return HTTP 410)
Payments:     Retired (historical endpoints return HTTP 410)
Email:        Resend + Email Bison
Storage:      Supabase Storage (client assets)
Search:       Podscan API + pgvector (embeddings)
Monitoring:   Sentry (error tracking + session replay)
```

### Data Flow Architecture
```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Frontend  │ ── │ Supabase RLS │ ── │  Database   │
│   (React)   │    │ + Functions  │    │(PostgreSQL)│
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │                   │
       ├── External APIs ──┼── AI Services ────┤
       │   (Podscan)       │   (OpenAI/Claude) │
       ├── Email Services ─┼── Monitoring ─────┤
       │   (Resend/Bison)  │   (Sentry)        │
       └── Google APIs ────┴── File Storage ───┘
           (Docs/Calendar)     (Supabase)
```

## 📊 All API Endpoints Summary

### Authentication Endpoints
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `send-portal-magic-link` | Any | Retired tombstone | HTTP 410 |
| `verify-portal-token` | Any | Retired tombstone | HTTP 410 |
| `get-outreach-podcasts-v2` | Any | Retired tombstone | HTTP 410 |
| `get-client-portfolio` | Any | Retired tombstone; use `public-client-dashboard` | HTTP 410 |
| `login-with-password` | POST | Password authentication | None |
| `validate-portal-session` | POST | Validate session token | Service |
| `logout-portal-session` | POST | End user session | None |
| `manage-admin-users` | Any | Retired tombstone | HTTP 410 |

### Client & Prospect Management
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `create-client-account` | POST | Full client onboarding | Optional |
| `create-client-google-sheet` | POST | Create client spreadsheet | Service |
| `create-prospect-sheet` | POST | Create prospect dashboard | Service |
| `append-prospect-sheet` | POST | Add podcasts to prospect | Service |
| `backfill-prospect-podcasts` | POST | Vector search + AI match podcasts | Service |

### AI & Analysis
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `analyze-podcast-fit` | POST | AI podcast analysis | Service |
| `analyze-sales-call` | Any | Retired tombstone | HTTP 410 |
| `auto-categorize-podcast` | POST | AI podcast categorization | None |
| `score-podcast-compatibility` | POST | Compatibility scoring | None |
| `qa-review-podcasts` | POST | QA score podcasts vs prospect bio | Service |
| `classify-reply` | POST | Classify email reply type | Service |

### E-commerce & Payments
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `create-checkout-session` | Any | Retired tombstone | HTTP 410 |
| `create-addon-checkout` | Any | Retired tombstone | HTTP 410 |
| `update-order-status` | Any | Retired tombstone | HTTP 410 |
| `stripe-webhook` | Any | Retired tombstone | HTTP 410 |

### Outreach & Communication
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `read-outreach-list` | POST | Read Google Sheets data | None |
| `send-outreach-webhook` | POST | Notify outreach systems | None |
| `create-outreach-message` | — | Excluded from tenant deploy | Not deployed |
| `create-bison-lead` | POST | Create Email Bison leads | Service |
| `send-reply` | POST | Send Email Bison replies | None |
| `generate-reply` | POST | AI-generate contextual email reply | Service |
| `delete-reply` | POST | Delete reply from Bison + DB | Service |
| `fetch-and-classify-replies` | POST | Bulk fetch + AI classify replies | Service |

### Content Generation
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `generate-blog-content` | POST | AI blog content generation | Bearer |
| `generate-client-bio` | POST | AI client bio generation | Service |
| `generate-media-kit-doc` | POST | Generate Google Doc media kit | Service |
| `generate-podcast-queries` | POST | Generate podcast search queries | Service |
| `generate-podcast-summary` | POST | AI podcast summary | Service |
| `generate-tagline` | POST | AI tagline generation | Service |
| `generate-guest-resource` | POST | Generate guest resource content | Service |

### Analytics
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `get-pipeline-analytics` | POST | Monthly pipeline metrics | Service |
| `get-customer-analytics` | Any | Retired tombstone | HTTP 410 |

### Public and Portal Content
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `get-blog-posts` | POST | Blog listing + single post | None |
| `get-testimonials` | POST | Testimonial feed | None |
| `get-guest-resources` | POST | Workspace/client-visible resource listing | Portal session or platform admin |
| `get-prospect-dashboard` | POST | Secure public prospect page data | None |

### Podcast Data
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `search-podcasts` | POST | Full search/filter/pagination | Service |
| `get-podcast-demographics` | POST | Podscan demographics with cache | None |
| `get-upcoming-bookings` | POST | Upcoming recordings/publications | Service |

### Data Synchronization
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `sync-fathom-calls` | Any | Retired tombstone | HTTP 410 |
| `sync-replies` | POST/GET | Sync email replies | None |

### SEO & Content
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `submit-to-indexing` | POST | Google indexing submission | None |
| `check-indexing-status` | POST | Google indexing status | Service |

### Webhooks
| Function | Method | Purpose | Auth |
|----------|--------|---------|------|
| `campaign-reply-webhook` | POST | Email Bison replies | Webhook |
| `resend-webhook` | POST | Email delivery events | Webhook |

### MCP Tools (AI Assistant Integration)
| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `create_prospect` | Create prospect dashboard | `prospect_name` |
| `match_podcasts` | AI-powered podcast matching | `prospect_name` |

> **Note**: `enable_prospect_dashboard` exists in code but is not currently registered in the MCP server.

## 🔐 Authentication Examples

### Admin Authentication (Frontend)
```javascript
import { supabase } from '@/lib/supabase'

// Google OAuth
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})

// Email/Password
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@example.com',
  password: 'password123'
})
```

### Client Portal Authentication
```javascript
// Password Login
const response = await fetch('/functions/v1/login-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'client@example.com',
    password: 'clientpassword'
  })
})
```

### Edge Function Authentication
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)

// Functions use service role key for database access
```

## 🗄️ Database Quick Access

### Primary Tables
- **`clients`** - Client accounts and portal settings
- **`bookings`** - Podcast booking tracking
- **`podcasts`** - Central podcast cache with vector embeddings
- **`premium_podcasts`** - E-commerce podcast inventory
- **`orders` + `order_items`** - Purchase tracking
- **`client_portal_sessions`** - Portal authentication
- **`campaign_replies`** - Email outreach responses
- **`outreach_messages`** - Outreach email approval queue
- **`prospect_dashboards`** - Prospect profiles with structured fields
- **`client_podcast_analyses`** - Client-specific AI podcast analysis
- **`prospect_podcast_analyses`** - Prospect-specific AI podcast analysis
- **`blog_posts`** - SEO content management
- **`guest_resources`** - Educational content for podcast guests

### Key Features
- **Row Level Security (RLS)** - Data access control
- **pgvector** - Semantic search with embeddings
- **JSONB columns** - Flexible metadata storage
- **Audit logging** - Comprehensive activity tracking
- **Cache optimization** - 60-80% API call reduction

## 🚀 Getting Started

### 1. Environment Setup
```bash
# Required Environment Variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-claude-key

# Email Services
RESEND_API_KEY=your-resend-key
EMAIL_BISON_API_TOKEN=your-bison-token

# External APIs
PODSCAN_API_KEY=your-podscan-key
FATHOM_API_KEY=your-fathom-key

# Frontend-specific browser-safe values only
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=https://your-app.example
VITE_SENTRY_DSN=your-sentry-dsn
```

### 2. Local Development
```bash
# Frontend
npm install
npm run dev

# Edge Functions
supabase functions serve

# MCP Server
cd mcp-prospect-dashboard
npm install
npm run build
npm start
```

### 3. Common Operations

#### Create a New Client
```javascript
const { data, error } = await supabase.functions.invoke('create-client-account', {
  body: {
    name: 'John Smith',
    email: 'john@example.com',
    enable_portal_access: true,
    send_invitation_email: true
  }
})
```

#### Get Client Bookings
```javascript
const { data, error } = await supabase
  .from('bookings')
  .select('*')
  .eq('client_id', clientId)
  .order('created_at', { ascending: false })
```

#### Analyze Podcast Fit
```javascript
const { data, error } = await supabase.functions.invoke('analyze-podcast-fit', {
  body: {
    podcastName: 'The Tim Ferriss Show',
    podcastDescription: 'Five-time #1 New York Times best-selling author...',
    clientName: 'Sarah Johnson',
    clientBio: 'Marketing expert with 15 years of experience...'
  }
})
```

## 📚 Documentation Structure

Each documentation section provides:
- **Complete endpoint reference** with request/response examples
- **Authentication requirements** and security considerations  
- **Error handling patterns** and status codes
- **Integration examples** with practical code samples
- **Database schema details** where relevant
- **Performance considerations** and optimization tips

## 🆘 Support & Troubleshooting

### Common Issues
1. **Authentication Failures** - Check admin_users table and portal_access_enabled
2. **CORS Errors** - Verify allowed origins in Supabase dashboard
3. **Edge Function Timeouts** - Functions have 60-second timeout limit
4. **Database RLS** - Ensure proper row-level security policies
5. **API Rate Limits** - External services have varying limits

### Debug Tips
- Enable Edge Function logs in Supabase dashboard
- Use browser network tab for API inspection
- Check environment variables in function deployments
- Validate JWT tokens using jwt.io

### Contact
- **Technical Issues**: Check function logs and database monitoring
- **API Questions**: Refer to individual endpoint documentation
- **Integration Help**: See integration examples in each section

---

**Last Updated**: March 2026
**Platform Version**: 2.1
**Total Endpoints**: 61 Edge Functions + Direct Database Access + 2 MCP Tools
**Database Tables**: 37 tables with comprehensive relationships
**Frontend Services**: 20+ domain-specific service modules
