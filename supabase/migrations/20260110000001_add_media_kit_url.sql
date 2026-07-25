-- Add media kit URL field to prospect_dashboards
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS media_kit_url TEXT;

-- Add comment
COMMENT ON COLUMN prospect_dashboards.media_kit_url IS 'Link to prospect media kit or one-pager document';
