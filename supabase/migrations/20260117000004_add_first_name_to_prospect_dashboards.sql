-- Add first_name column for HeyGen personalization
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS first_name TEXT;

COMMENT ON COLUMN prospect_dashboards.first_name IS 'First name of the prospect for HeyGen video personalization';
