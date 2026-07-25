-- Add ai_reason column to separate AI classification reasoning from user notes
ALTER TABLE campaign_replies
ADD COLUMN IF NOT EXISTS ai_reason TEXT;
