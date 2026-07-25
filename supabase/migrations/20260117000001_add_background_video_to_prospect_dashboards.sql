-- Add background video tracking columns to prospect_dashboards table
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS background_video_url TEXT,
ADD COLUMN IF NOT EXISTS background_video_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS background_video_status TEXT DEFAULT 'not_generated';

-- Add check constraint for status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prospect_dashboards_background_video_status_check'
  ) THEN
    ALTER TABLE prospect_dashboards
    ADD CONSTRAINT prospect_dashboards_background_video_status_check
    CHECK (background_video_status IN ('not_generated', 'processing', 'completed', 'failed'));
  END IF;
END $$;

-- Add index for querying by status
CREATE INDEX IF NOT EXISTS idx_prospect_dashboards_video_status
ON prospect_dashboards(background_video_status);

-- Add comment for documentation
COMMENT ON COLUMN prospect_dashboards.background_video_url IS 'URL to the Playwright-recorded dashboard video (for HeyGen background)';
COMMENT ON COLUMN prospect_dashboards.background_video_generated_at IS 'Timestamp when the background video was last generated';
COMMENT ON COLUMN prospect_dashboards.background_video_status IS 'Status of background video generation: not_generated, processing, completed, failed';
