# AI Sales Director - Complete Setup Guide

This guide will help you set up the AI Sales Director feature from scratch. Follow these steps to get a fully functional AI-powered sales call analysis system.

---

## Overview

The AI Sales Director:
- 🔄 Syncs sales calls automatically from Fathom
- 🤖 Uses Claude Haiku 4.5 to classify calls (sales vs non-sales)
- 📊 Uses Claude Sonnet 4.5 to analyze sales calls using **Corey Jackson's Scalable Sales Framework**
- 📈 Provides analytics, insights, and recommendations
- ⏱️ Tracks performance over time with charts and metrics

---

## Prerequisites

Before starting, make sure you have:

1. **Supabase Project** - A Supabase project (create one at https://supabase.com)
2. **Fathom Account** - Access to Fathom meeting recordings (https://fathom.video)
3. **Anthropic API Key** - Claude API access (https://console.anthropic.com)
4. **Supabase CLI** - Install: `npm install -g supabase`

---

## Step 1: Database Setup

Run these SQL migrations in order via Supabase Dashboard → SQL Editor:

### Migration 1: Core Tables (20250126_sales_calls.sql)

```sql
-- Create sales_calls table to store Fathom call recordings
CREATE TABLE IF NOT EXISTS sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id BIGINT UNIQUE NOT NULL,
  title TEXT,
  meeting_title TEXT,
  fathom_url TEXT,
  share_url TEXT,
  scheduled_start_time TIMESTAMPTZ,
  scheduled_end_time TIMESTAMPTZ,
  recording_start_time TIMESTAMPTZ,
  recording_end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  transcript JSONB,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sales_call_analysis table to store AI analysis
CREATE TABLE IF NOT EXISTS sales_call_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_call_id UUID REFERENCES sales_calls(id) ON DELETE CASCADE,
  overall_score DECIMAL(3,1) CHECK (overall_score >= 0 AND overall_score <= 10),
  discovery_score DECIMAL(3,1) CHECK (discovery_score >= 0 AND discovery_score <= 10),
  objection_handling_score DECIMAL(3,1) CHECK (objection_handling_score >= 0 AND objection_handling_score <= 10),
  closing_score DECIMAL(3,1) CHECK (closing_score >= 0 AND closing_score <= 10),
  engagement_score DECIMAL(3,1) CHECK (engagement_score >= 0 AND engagement_score <= 10),
  talk_listen_ratio_talk INTEGER,
  talk_listen_ratio_listen INTEGER,
  questions_asked_count INTEGER,
  recommendations JSONB,
  strengths JSONB,
  weaknesses JSONB,
  key_moments JSONB,
  sentiment_analysis JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sales_calls_recording_id ON sales_calls(recording_id);
CREATE INDEX IF NOT EXISTS idx_sales_calls_recording_start_time ON sales_calls(recording_start_time DESC);
CREATE INDEX IF NOT EXISTS idx_sales_call_analysis_sales_call_id ON sales_call_analysis(sales_call_id);
CREATE INDEX IF NOT EXISTS idx_sales_call_analysis_overall_score ON sales_call_analysis(overall_score DESC);

-- Enable RLS
ALTER TABLE sales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_call_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies (allow authenticated users to read/write)
CREATE POLICY "Allow authenticated users to read sales calls"
  ON sales_calls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert sales calls"
  ON sales_calls FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update sales calls"
  ON sales_calls FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to read analysis"
  ON sales_call_analysis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert analysis"
  ON sales_call_analysis FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update analysis"
  ON sales_call_analysis FOR UPDATE
  TO authenticated
  USING (true);
```

### Migration 2: Call Type Classification (20250126_add_call_type.sql)

```sql
-- Add call_type column to sales_calls table
CREATE TYPE call_type AS ENUM ('sales', 'non-sales', 'unclassified');

ALTER TABLE sales_calls
ADD COLUMN IF NOT EXISTS call_type call_type DEFAULT 'unclassified';

-- Create index for filtering by call type
CREATE INDEX IF NOT EXISTS idx_sales_calls_call_type ON sales_calls(call_type);
```

### Migration 3: Hidden Calls Feature (20250126_add_hidden_to_sales_calls.sql)

```sql
-- Add hidden column to sales_calls table
ALTER TABLE sales_calls
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- Create index for filtering hidden calls
CREATE INDEX IF NOT EXISTS idx_sales_calls_hidden ON sales_calls(hidden);
```

### Migration 4: Corey Jackson Framework (20250127_corey_jackson_framework.sql)

```sql
-- Add Corey Jackson Framework scoring columns to sales_call_analysis table

ALTER TABLE sales_call_analysis
ADD COLUMN IF NOT EXISTS frame_control_score DECIMAL(3,1) CHECK (frame_control_score >= 0 AND frame_control_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_current_state_score DECIMAL(3,1) CHECK (discovery_current_state_score >= 0 AND discovery_current_state_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_desired_state_score DECIMAL(3,1) CHECK (discovery_desired_state_score >= 0 AND discovery_desired_state_score <= 10),
ADD COLUMN IF NOT EXISTS discovery_cost_of_inaction_score DECIMAL(3,1) CHECK (discovery_cost_of_inaction_score >= 0 AND discovery_cost_of_inaction_score <= 10),
ADD COLUMN IF NOT EXISTS watt_tiedowns_score DECIMAL(3,1) CHECK (watt_tiedowns_score >= 0 AND watt_tiedowns_score <= 10),
ADD COLUMN IF NOT EXISTS bridge_gap_score DECIMAL(3,1) CHECK (bridge_gap_score >= 0 AND bridge_gap_score <= 10),
ADD COLUMN IF NOT EXISTS sellback_score DECIMAL(3,1) CHECK (sellback_score >= 0 AND sellback_score <= 10),
ADD COLUMN IF NOT EXISTS price_drop_score DECIMAL(3,1) CHECK (price_drop_score >= 0 AND price_drop_score <= 10),
ADD COLUMN IF NOT EXISTS close_celebration_score DECIMAL(3,1) CHECK (close_celebration_score >= 0 AND close_celebration_score <= 10),
ADD COLUMN IF NOT EXISTS framework_adherence_score DECIMAL(3,1) CHECK (framework_adherence_score >= 0 AND framework_adherence_score <= 10);

-- Add framework-specific insights as JSONB
ALTER TABLE sales_call_analysis
ADD COLUMN IF NOT EXISTS framework_insights JSONB;

COMMENT ON COLUMN sales_call_analysis.frame_control_score IS 'Intro + Frame Control: Setting tone, authority, timing confirmation';
COMMENT ON COLUMN sales_call_analysis.discovery_current_state_score IS 'Discovery - Current State: Understanding where they are now';
COMMENT ON COLUMN sales_call_analysis.discovery_desired_state_score IS 'Discovery - Desired State: Understanding their goal';
COMMENT ON COLUMN sales_call_analysis.discovery_cost_of_inaction_score IS 'Discovery - Cost of Inaction: Uncovering the pain of staying stuck';
COMMENT ON COLUMN sales_call_analysis.watt_tiedowns_score IS 'WATT Tie-downs: Micro-commitments building YES momentum';
COMMENT ON COLUMN sales_call_analysis.bridge_gap_score IS 'Bridge the Gap: Positioning offer as solution';
COMMENT ON COLUMN sales_call_analysis.sellback_score IS 'Sellback: Having prospect sell themselves on solution';
COMMENT ON COLUMN sales_call_analysis.price_drop_score IS 'Price Drop: Minimizing and pausing after price reveal';
COMMENT ON COLUMN sales_call_analysis.close_celebration_score IS 'Close & Celebrate: Taking payment and celebrating the win';
COMMENT ON COLUMN sales_call_analysis.framework_adherence_score IS 'Overall adherence to Corey Jackson framework';
COMMENT ON COLUMN sales_call_analysis.framework_insights IS 'Detailed insights about framework execution';
```

---

## Step 2: Get API Keys

### Fathom API Key

1. Go to https://app.fathom.video
2. Navigate to **Settings → API**
3. Click **Generate API Key**
4. Copy the key (starts with `fathom_...`)

### Anthropic API Key

1. Go to https://console.anthropic.com
2. Navigate to **API Keys**
3. Click **Create Key**
4. Copy the key (starts with `sk-ant-...`)

---

## Step 3: Deploy Edge Functions

The AI Sales Director uses 3 Supabase Edge Functions:

### Option A: Deploy from this repository

If you have access to this codebase:

```bash
# Navigate to project directory
cd /path/to/authority-built

# Login to Supabase CLI (if not already logged in)
supabase login

# Link to your Supabase project
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set \
  FATHOM_API_KEY="your_fathom_key" \
  ANTHROPIC_API_KEY="your_anthropic_key"

# Deploy all three functions
supabase functions deploy sync-fathom-calls
supabase functions deploy classify-sales-call
supabase functions deploy analyze-sales-call
```

### Option B: Copy function code manually

If you need to set up in a separate project:

1. **Create function directories:**
   ```bash
   mkdir -p supabase/functions/sync-fathom-calls
   mkdir -p supabase/functions/classify-sales-call
   mkdir -p supabase/functions/analyze-sales-call
   ```

2. **Copy these files from this repository:**
   - `supabase/functions/sync-fathom-calls/index.ts` → Your project
   - `supabase/functions/classify-sales-call/index.ts` → Your project
   - `supabase/functions/analyze-sales-call/index.ts` → Your project

3. **Deploy:**
   ```bash
   # Set secrets first
   supabase secrets set \
     FATHOM_API_KEY="your_fathom_key" \
     ANTHROPIC_API_KEY="your_anthropic_key"

   # Deploy
   supabase functions deploy sync-fathom-calls
   supabase functions deploy classify-sales-call
   supabase functions deploy analyze-sales-call
   ```

---

## Step 4: Frontend Setup

### Option A: Same Organization (Easiest)

If Jay is using the same deployment:

1. **Create Jay's user account** in Supabase Dashboard → Authentication → Users
2. **Grant admin access** (depends on your auth setup)
3. **Jay can access:** Navigate to `/admin/ai-sales-director` in the app

### Option B: Separate Deployment

If Jay needs his own deployment:

1. **Copy frontend files:**
   - `src/pages/admin/AISalesDirector.tsx`
   - `src/services/salesCalls.ts`
   - `src/types/salesCalls.ts` (if exists)

2. **Install dependencies:**
   ```bash
   npm install recharts @tanstack/react-query
   ```

3. **Update environment variables:**
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Add route to your app:**
   ```tsx
   // In your router
   <Route path="/admin/ai-sales-director" element={<AISalesDirector />} />
   ```

5. **Build and deploy:**
   ```bash
   npm run build
   npm start
   ```

---

## Step 5: First Sync

Once everything is set up:

1. **Login** to the application
2. **Navigate** to `/admin/ai-sales-director`
3. **Click "Sync from Fathom"**
4. **Select date range** (e.g., "Last 30 days")
5. **Wait for sync** - This will:
   - Fetch all meetings from Fathom
   - Classify them as sales/non-sales
   - Store in database

6. **Analyze calls:**
   - Click "Analyze" on any sales call
   - Claude Sonnet will analyze using Corey Jackson framework
   - View detailed insights, scores, and recommendations

---

## Step 6: Test Everything

### Test Checklist:

- [ ] Can sync calls from Fathom
- [ ] Calls appear in "Recent Call Analysis" section
- [ ] Can classify calls (sales/non-sales badge)
- [ ] Can analyze a sales call
- [ ] Analysis shows framework breakdown
- [ ] Recommendations are readable (click to expand)
- [ ] Analytics section shows graphs
- [ ] Time period filter works
- [ ] Pagination works (5 calls per page)

---

## Costs & Usage

### API Costs (Approximate):

- **Fathom API:** Free tier includes API access
- **Claude Haiku 4.5** (Classification): ~$0.001 per call
- **Claude Sonnet 4.5** (Analysis): ~$0.05-0.15 per call
- **Supabase:** Free tier supports moderate usage

### Example Monthly Cost:
- 100 calls/month classified: ~$0.10
- 50 calls/month analyzed: ~$2.50-7.50
- **Total: ~$3-8/month**

---

## Troubleshooting

### "Failed to sync calls"
- ✅ Check Fathom API key is correct
- ✅ Ensure `FATHOM_API_KEY` is set in Supabase secrets
- ✅ Check edge function logs in Supabase Dashboard

### "Failed to analyze"
- ✅ Check Anthropic API key is valid
- ✅ Ensure `ANTHROPIC_API_KEY` is set in Supabase secrets
- ✅ Check Claude API quota/credits

### "No calls showing up"
- ✅ Verify sync completed successfully
- ✅ Check if calls are hidden (toggle "Show Hidden")
- ✅ Try syncing with different date range

### "Analytics not loading"
- ✅ Ensure at least one call is analyzed
- ✅ Check browser console for errors
- ✅ Try refreshing the page

---

## Support

If you need help:

1. Check Supabase Edge Function logs
2. Check browser console for frontend errors
3. Review this setup guide
4. Check the Claude API dashboard for usage/errors

---

## What's Next?

Once set up, you can:

- 📊 **Track performance** over time with analytics
- 🎯 **Get AI recommendations** for improving sales calls
- 📈 **Identify patterns** in successful vs unsuccessful calls
- 🔄 **Automatic syncing** - Set up scheduled syncs (future feature)
- 🏆 **Compare team members** - Add multi-user support (future feature)

---

## Quick Reference

### Key URLs:
- **Dashboard:** `/admin/ai-sales-director`
- **Supabase Dashboard:** `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`
- **Fathom:** `https://app.fathom.video`
- **Claude API:** `https://console.anthropic.com`

### Key Commands:
```bash
# Deploy functions
supabase functions deploy sync-fathom-calls
supabase functions deploy classify-sales-call
supabase functions deploy analyze-sales-call

# Set secrets
supabase secrets set FATHOM_API_KEY="..." ANTHROPIC_API_KEY="..."

# View function logs
supabase functions logs sync-fathom-calls
```

### Database Tables:
- `sales_calls` - Stores call metadata from Fathom
- `sales_call_analysis` - Stores AI analysis results

---

**Ready to use!** Once you've completed all steps, navigate to `/admin/ai-sales-director` and start analyzing your sales calls with AI.
