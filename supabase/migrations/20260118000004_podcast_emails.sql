-- Create table to store podcast emails from Podscan
CREATE TABLE IF NOT EXISTS podcast_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id TEXT NOT NULL UNIQUE,
  email TEXT,
  source TEXT DEFAULT 'podscan',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by podcast_id
CREATE INDEX idx_podcast_emails_podcast_id ON podcast_emails(podcast_id);

-- Enable RLS
ALTER TABLE podcast_emails ENABLE ROW LEVEL SECURITY;

-- Admin full access policy
CREATE POLICY "Admin full access for podcast_emails"
  ON podcast_emails FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_podcast_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_podcast_emails_timestamp
  BEFORE UPDATE ON podcast_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_podcast_emails_updated_at();

-- Comment
COMMENT ON TABLE podcast_emails IS 'Stores podcast contact emails fetched from Podscan API';
COMMENT ON COLUMN podcast_emails.podcast_id IS 'Podscan podcast ID (e.g., pd_abc123)';
COMMENT ON COLUMN podcast_emails.email IS 'Contact email for the podcast from Podscan';
COMMENT ON COLUMN podcast_emails.source IS 'Source of the email (podscan, manual, etc)';
