-- Add prospect image URL field to prospect_dashboards
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS prospect_image_url TEXT;

-- Add comment
COMMENT ON COLUMN prospect_dashboards.prospect_image_url IS 'Profile picture or logo URL for the prospect';
