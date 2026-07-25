-- Prospect Dashboards: Store shareable dashboard links for prospects
-- These link to Google Sheets and provide a read-only visual dashboard experience

CREATE TABLE IF NOT EXISTS prospect_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  prospect_name TEXT NOT NULL,
  prospect_bio TEXT,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);

-- Index for fast slug lookups (public access)
CREATE INDEX idx_prospect_dashboards_slug ON prospect_dashboards(slug);

-- Index for admin listing
CREATE INDEX idx_prospect_dashboards_created_at ON prospect_dashboards(created_at DESC);

-- RLS Policies
ALTER TABLE prospect_dashboards ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything
CREATE POLICY "Admin users can manage prospect dashboards"
  ON prospect_dashboards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Public read access for active dashboards (via slug lookup)
-- This allows the public prospect view page to fetch data
CREATE POLICY "Public can view active prospect dashboards"
  ON prospect_dashboards
  FOR SELECT
  TO anon
  USING (is_active = true);
