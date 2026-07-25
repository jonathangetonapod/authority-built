-- Add podcast details fields to bookings table
-- These fields will store data fetched from Podscan API

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS podcast_id TEXT,
  ADD COLUMN IF NOT EXISTS audience_size INTEGER,
  ADD COLUMN IF NOT EXISTS podcast_description TEXT,
  ADD COLUMN IF NOT EXISTS itunes_rating DECIMAL(2,1),
  ADD COLUMN IF NOT EXISTS itunes_rating_count INTEGER,
  ADD COLUMN IF NOT EXISTS episode_count INTEGER,
  ADD COLUMN IF NOT EXISTS podcast_image_url TEXT,
  ADD COLUMN IF NOT EXISTS rss_url TEXT;

-- Add indexes for filtering by audience size and ratings
CREATE INDEX IF NOT EXISTS bookings_audience_size_idx ON public.bookings(audience_size DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS bookings_podcast_id_idx ON public.bookings(podcast_id);

-- Add comments
COMMENT ON COLUMN public.bookings.podcast_id IS 'Podscan podcast ID (e.g., pd_dpmk29nb4z9ev8nz)';
COMMENT ON COLUMN public.bookings.audience_size IS 'Estimated audience size from Podscan';
COMMENT ON COLUMN public.bookings.podcast_description IS 'Full podcast description from Podscan';
COMMENT ON COLUMN public.bookings.itunes_rating IS 'iTunes rating average (0-5)';
COMMENT ON COLUMN public.bookings.itunes_rating_count IS 'Number of iTunes ratings';
COMMENT ON COLUMN public.bookings.episode_count IS 'Total number of episodes';
COMMENT ON COLUMN public.bookings.podcast_image_url IS 'Podcast cover art URL';
COMMENT ON COLUMN public.bookings.rss_url IS 'Podcast RSS feed URL';
