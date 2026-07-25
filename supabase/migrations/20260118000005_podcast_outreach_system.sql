-- Table to track outreach actions (sent/skipped) per podcast per client
CREATE TABLE IF NOT EXISTS podcast_outreach_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id TEXT NOT NULL,
  podcast_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('sent', 'skipped')),
  webhook_sent_at TIMESTAMPTZ,
  webhook_response_status INTEGER,
  webhook_response_body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_client_podcast_outreach UNIQUE (client_id, podcast_id)
);

CREATE INDEX idx_podcast_outreach_actions_client ON podcast_outreach_actions(client_id);
CREATE INDEX idx_podcast_outreach_actions_podcast ON podcast_outreach_actions(podcast_id);
CREATE INDEX idx_podcast_outreach_actions_action ON podcast_outreach_actions(action);

ALTER TABLE podcast_outreach_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access for podcast_outreach_actions"
  ON podcast_outreach_actions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE admin_users.email = auth.jwt() ->> 'email'
    )
  );

-- Add webhook URL column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS outreach_webhook_url TEXT;
COMMENT ON COLUMN clients.outreach_webhook_url IS 'Webhook URL to trigger when podcast is approved for outreach';
