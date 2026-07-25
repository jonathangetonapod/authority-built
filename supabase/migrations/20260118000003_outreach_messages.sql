-- Create outreach_messages table for email approval queue
CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Podcast/Host Information
  podcast_id TEXT,
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT NOT NULL,
  host_email TEXT NOT NULL,
  
  -- Email Content
  subject_line TEXT NOT NULL,
  email_body TEXT NOT NULL,
  
  -- Campaign Tracking
  bison_campaign_id TEXT,
  personalization_data JSONB,
  
  -- Status Management
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'sent', 'failed', 'archived')),
  priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
  
  -- Sending
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  email_platform_response JSONB,
  error_message TEXT,
  
  -- Metadata
  created_by TEXT DEFAULT 'clay',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT outreach_messages_client_id_idx CHECK (client_id IS NOT NULL),
  CONSTRAINT outreach_messages_host_email_valid CHECK (host_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_messages_client ON outreach_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_campaign ON outreach_messages(bison_campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_messages_created ON outreach_messages(created_at DESC);

-- RLS Policies
ALTER TABLE outreach_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access for outreach_messages"
  ON outreach_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_outreach_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outreach_messages_updated_at
  BEFORE UPDATE ON outreach_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_outreach_messages_updated_at();

COMMENT ON TABLE outreach_messages IS 'Queue for outreach emails from Clay to be reviewed and sent';
COMMENT ON COLUMN outreach_messages.bison_campaign_id IS 'Bison Campaign ID from Clay automation';
COMMENT ON COLUMN outreach_messages.status IS 'pending_review: needs approval, approved: ready to send, sent: already sent, failed: send failed, archived: removed from active queue';
