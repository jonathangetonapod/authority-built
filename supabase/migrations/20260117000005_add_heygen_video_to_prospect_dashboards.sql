-- Add HeyGen video tracking columns to prospect_dashboards table
ALTER TABLE prospect_dashboards
ADD COLUMN IF NOT EXISTS heygen_video_id TEXT,
ADD COLUMN IF NOT EXISTS heygen_video_status TEXT,
ADD COLUMN IF NOT EXISTS heygen_video_url TEXT,
ADD COLUMN IF NOT EXISTS heygen_video_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS heygen_video_generated_at TIMESTAMPTZ;

-- Add comment for clarity
COMMENT ON COLUMN prospect_dashboards.heygen_video_id IS 'HeyGen video ID returned from API';
COMMENT ON COLUMN prospect_dashboards.heygen_video_status IS 'Status: pending, waiting, processing, completed, failed';
COMMENT ON COLUMN prospect_dashboards.heygen_video_url IS 'Final HeyGen video URL (expires in 7 days from HeyGen)';
COMMENT ON COLUMN prospect_dashboards.heygen_video_thumbnail_url IS 'HeyGen video thumbnail URL';
COMMENT ON COLUMN prospect_dashboards.heygen_video_generated_at IS 'Timestamp when HeyGen video generation was initiated';
