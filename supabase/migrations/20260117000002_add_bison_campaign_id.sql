-- Add bison_campaign_id to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS bison_campaign_id TEXT;

COMMENT ON COLUMN clients.bison_campaign_id IS 'Bison Campaign ID for tracking outreach campaigns';
