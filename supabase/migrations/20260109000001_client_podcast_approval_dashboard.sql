-- Client Podcast Approval Dashboard
-- Allows clients to review and approve/reject podcasts before outreach

-- Add dashboard_slug to clients table for public URL access
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_slug TEXT UNIQUE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_tagline TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_view_count INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dashboard_last_viewed_at TIMESTAMPTZ;

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_clients_dashboard_slug ON clients(dashboard_slug) WHERE dashboard_slug IS NOT NULL;

-- Cache table for client podcasts (from their Google Sheet)
CREATE TABLE IF NOT EXISTS client_dashboard_podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  podcast_description TEXT,
  podcast_image_url TEXT,
  podcast_url TEXT,
  publisher_name TEXT,
  itunes_rating DECIMAL(3,2),
  episode_count INTEGER,
  audience_size INTEGER,
  last_posted_at TIMESTAMPTZ,
  -- Cached AI analysis
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,
  -- Cached demographics
  demographics JSONB,
  demographics_fetched_at TIMESTAMPTZ,
  -- Categories
  podcast_categories JSONB,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure unique podcast per client
  CONSTRAINT unique_client_podcast UNIQUE (client_id, podcast_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_dashboard_podcasts_client ON client_dashboard_podcasts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_dashboard_podcasts_podcast ON client_dashboard_podcasts(podcast_id);

-- Client podcast feedback table
CREATE TABLE IF NOT EXISTS client_podcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  status TEXT CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Ensure one feedback per podcast per client
  CONSTRAINT unique_client_podcast_feedback UNIQUE (client_id, podcast_id)
);

-- Indexes for feedback
CREATE INDEX IF NOT EXISTS idx_client_podcast_feedback_client ON client_podcast_feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_client_podcast_feedback_status ON client_podcast_feedback(status);

-- RLS Policies

-- Enable RLS
ALTER TABLE client_dashboard_podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_podcast_feedback ENABLE ROW LEVEL SECURITY;

-- Client dashboard podcasts: Public read (for dashboard view), admin write
CREATE POLICY "Public read access for client_dashboard_podcasts"
  ON client_dashboard_podcasts
  FOR SELECT
  USING (true);

CREATE POLICY "Admin write access for client_dashboard_podcasts"
  ON client_dashboard_podcasts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Client podcast feedback: Public read/write (clients submit feedback without auth)
CREATE POLICY "Public read access for client_podcast_feedback"
  ON client_podcast_feedback
  FOR SELECT
  USING (true);

CREATE POLICY "Public insert access for client_podcast_feedback"
  ON client_podcast_feedback
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update access for client_podcast_feedback"
  ON client_podcast_feedback
  FOR UPDATE
  USING (true);

-- Function to auto-generate dashboard slug from client name
CREATE OR REPLACE FUNCTION generate_client_dashboard_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.dashboard_slug IS NULL AND NEW.name IS NOT NULL THEN
    NEW.dashboard_slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    -- Remove leading/trailing dashes
    NEW.dashboard_slug := TRIM(BOTH '-' FROM NEW.dashboard_slug);
    -- Handle duplicates by appending random suffix
    IF EXISTS (SELECT 1 FROM clients WHERE dashboard_slug = NEW.dashboard_slug AND id != NEW.id) THEN
      NEW.dashboard_slug := NEW.dashboard_slug || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate slug on insert/update
DROP TRIGGER IF EXISTS trigger_generate_client_dashboard_slug ON clients;
CREATE TRIGGER trigger_generate_client_dashboard_slug
  BEFORE INSERT OR UPDATE OF name ON clients
  FOR EACH ROW
  EXECUTE FUNCTION generate_client_dashboard_slug();

-- Update existing clients to have slugs
UPDATE clients
SET dashboard_slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE dashboard_slug IS NULL AND name IS NOT NULL;
