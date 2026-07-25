-- Add archived field to campaign_replies
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Create index for archived field (for filtering)
CREATE INDEX IF NOT EXISTS idx_campaign_replies_archived ON campaign_replies(archived);

-- Add archived_at timestamp to track when it was archived
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
