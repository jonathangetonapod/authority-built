-- Cache table for prospect dashboard podcasts
-- Stores BOTH podcast data (from Podscan) AND AI analysis (from Claude)
-- This eliminates slow API calls on every page load

CREATE TABLE IF NOT EXISTS prospect_dashboard_podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,

  -- Podcast data (from Podscan API)
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating NUMERIC,
  episode_count INTEGER,
  audience_size INTEGER,
  podcast_categories JSONB,
  last_posted_at TIMESTAMPTZ,

  -- AI Analysis (from Claude API)
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,  -- Array of strings
  ai_pitch_angles JSONB, -- Array of {title, description}
  ai_analyzed_at TIMESTAMPTZ, -- When AI analysis was done

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one podcast per dashboard
  UNIQUE(prospect_dashboard_id, podcast_id)
);

-- Index for fast lookups by dashboard
CREATE INDEX idx_prospect_dashboard_podcasts_dashboard_id ON prospect_dashboard_podcasts(prospect_dashboard_id);

-- Index for finding podcasts by ID
CREATE INDEX idx_prospect_dashboard_podcasts_podcast_id ON prospect_dashboard_podcasts(podcast_id);

-- Enable RLS
ALTER TABLE prospect_dashboard_podcasts ENABLE ROW LEVEL SECURITY;

-- Public read access (prospects can view their podcasts)
CREATE POLICY "Public read access for prospect_dashboard_podcasts"
  ON prospect_dashboard_podcasts
  FOR SELECT
  USING (true);

-- Admin write access
CREATE POLICY "Admin write access for prospect_dashboard_podcasts"
  ON prospect_dashboard_podcasts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access for prospect_dashboard_podcasts"
  ON prospect_dashboard_podcasts
  FOR ALL
  USING (auth.role() = 'service_role');

-- Add last_synced_at to track when podcasts were last fetched from source
ALTER TABLE prospect_dashboards ADD COLUMN IF NOT EXISTS podcasts_last_synced_at TIMESTAMPTZ;
