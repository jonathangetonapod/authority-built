-- Add read status to campaign_replies
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false;

-- Create index for filtering by read status
CREATE INDEX IF NOT EXISTS idx_campaign_replies_read ON campaign_replies(read);
