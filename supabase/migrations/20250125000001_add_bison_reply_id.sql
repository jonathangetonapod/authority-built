-- Add Email Bison reply ID for thread fetching
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS bison_reply_id INTEGER;

-- Create index for looking up by Bison reply ID
CREATE INDEX IF NOT EXISTS idx_campaign_replies_bison_reply_id ON campaign_replies(bison_reply_id);
