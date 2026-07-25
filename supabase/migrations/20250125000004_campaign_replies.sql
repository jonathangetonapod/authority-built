-- Campaign Replies Table
-- Simple tracking system for email campaign replies

CREATE TABLE IF NOT EXISTS campaign_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact Information
  email TEXT NOT NULL,
  name TEXT,
  company TEXT,

  -- Reply Details
  reply_content TEXT,
  campaign_name TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),

  -- Classification
  lead_type TEXT CHECK (lead_type IN ('sales', 'podcasts', 'other')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'not_interested', 'converted')),

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_campaign_replies_lead_type ON campaign_replies(lead_type);
CREATE INDEX idx_campaign_replies_status ON campaign_replies(status);
CREATE INDEX idx_campaign_replies_received_at ON campaign_replies(received_at DESC);
CREATE INDEX idx_campaign_replies_email ON campaign_replies(email);

-- RLS Policies (admin only access)
ALTER TABLE campaign_replies ENABLE ROW LEVEL SECURITY;

-- Admin users can do everything
CREATE POLICY "Only admins can manage campaign replies"
  ON campaign_replies
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'jonathan@getonapod.com');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_campaign_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaign_replies_updated_at
  BEFORE UPDATE ON campaign_replies
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_replies_updated_at();
