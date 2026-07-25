-- Add podcast_name column to prospect_podcast_feedback table
ALTER TABLE prospect_podcast_feedback ADD COLUMN IF NOT EXISTS podcast_name TEXT;

-- Add comment
COMMENT ON COLUMN prospect_podcast_feedback.podcast_name IS 'Cached podcast name for display purposes';
