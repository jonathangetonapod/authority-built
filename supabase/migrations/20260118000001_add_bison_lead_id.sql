-- Add bison_lead_id column to track Bison leads
ALTER TABLE outreach_messages
ADD COLUMN IF NOT EXISTS bison_lead_id INTEGER;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_outreach_messages_bison_lead_id ON outreach_messages(bison_lead_id);

-- Comment
COMMENT ON COLUMN outreach_messages.bison_lead_id IS 'ID of the lead created in Bison/EmailBison system';
