-- Podcast Calendar Management System Migration
-- Creates tables for managing clients, podcasts, and booking calendar

-- =============================================================================
-- CLIENTS TABLE
-- =============================================================================
-- Stores client information for podcast placement services
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  email TEXT,
  first_invoice_paid_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients(name);
CREATE INDEX IF NOT EXISTS clients_email_idx ON public.clients(email);
CREATE INDEX IF NOT EXISTS clients_status_idx ON public.clients(status);
CREATE INDEX IF NOT EXISTS clients_created_at_idx ON public.clients(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.clients IS 'Stores client information for podcast placement services';
COMMENT ON COLUMN public.clients.status IS 'Client status: active (currently servicing), paused (temporarily on hold), churned (no longer a client)';
COMMENT ON COLUMN public.clients.first_invoice_paid_date IS 'Date when the client made their first payment';

-- =============================================================================
-- PODCASTS TABLE (Master Podcast Database)
-- =============================================================================
-- Stores the master list of all podcasts across all clients
CREATE TABLE IF NOT EXISTS public.podcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  description TEXT,
  ratings INTEGER CHECK (ratings >= 0 AND ratings <= 5),
  audience_size INTEGER CHECK (audience_size >= 0),
  host_name TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for searching and filtering
CREATE INDEX IF NOT EXISTS podcasts_name_idx ON public.podcasts(name);
CREATE INDEX IF NOT EXISTS podcasts_category_idx ON public.podcasts(category);
CREATE INDEX IF NOT EXISTS podcasts_audience_size_idx ON public.podcasts(audience_size DESC);
CREATE INDEX IF NOT EXISTS podcasts_is_active_idx ON public.podcasts(is_active);
CREATE INDEX IF NOT EXISTS podcasts_created_at_idx ON public.podcasts(created_at DESC);

-- Add comments
COMMENT ON TABLE public.podcasts IS 'Master database of all podcasts used across client placements';
COMMENT ON COLUMN public.podcasts.ratings IS 'Podcast rating from 0 to 5';
COMMENT ON COLUMN public.podcasts.audience_size IS 'Estimated audience size/downloads per episode';
COMMENT ON COLUMN public.podcasts.is_active IS 'Whether the podcast is currently active and accepting guests';

-- =============================================================================
-- CLIENT_PODCAST_BOOKINGS TABLE (The Calendar)
-- =============================================================================
-- Stores the relationship between clients and podcasts with scheduling info
CREATE TABLE IF NOT EXISTS public.client_podcast_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE RESTRICT,

  -- Scheduling information
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'recorded', 'published', 'cancelled')),

  -- Additional details
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for queries and filtering
CREATE INDEX IF NOT EXISTS bookings_client_id_idx ON public.client_podcast_bookings(client_id);
CREATE INDEX IF NOT EXISTS bookings_podcast_id_idx ON public.client_podcast_bookings(podcast_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.client_podcast_bookings(status);
CREATE INDEX IF NOT EXISTS bookings_scheduled_date_idx ON public.client_podcast_bookings(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS bookings_recording_date_idx ON public.client_podcast_bookings(recording_date DESC);
CREATE INDEX IF NOT EXISTS bookings_publish_date_idx ON public.client_podcast_bookings(publish_date DESC);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON public.client_podcast_bookings(created_at DESC);

-- Composite index for calendar view (client + date range queries)
CREATE INDEX IF NOT EXISTS bookings_client_date_idx ON public.client_podcast_bookings(client_id, scheduled_date DESC);

-- Add comments
COMMENT ON TABLE public.client_podcast_bookings IS 'Calendar of podcast bookings for each client';
COMMENT ON COLUMN public.client_podcast_bookings.status IS 'Booking status: scheduled (booked but not recorded), recorded (recorded but not published), published (live), cancelled (booking cancelled)';
COMMENT ON COLUMN public.client_podcast_bookings.scheduled_date IS 'When the podcast appearance is scheduled';
COMMENT ON COLUMN public.client_podcast_bookings.recording_date IS 'Actual date the recording took place';
COMMENT ON COLUMN public.client_podcast_bookings.publish_date IS 'Date the episode was published';
COMMENT ON COLUMN public.client_podcast_bookings.prep_sent IS 'Whether pre-interview prep materials have been sent to the client';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_podcast_bookings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (for re-running migration)
DROP POLICY IF EXISTS "Admin full access to clients" ON public.clients;
DROP POLICY IF EXISTS "Admin full access to podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Admin full access to bookings" ON public.client_podcast_bookings;

-- CLIENTS: Admin-only access
CREATE POLICY "Admin full access to clients"
  ON public.clients
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PODCASTS: Admin-only access
CREATE POLICY "Admin full access to podcasts"
  ON public.podcasts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- BOOKINGS: Admin-only access
CREATE POLICY "Admin full access to bookings"
  ON public.client_podcast_bookings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Reuse existing update_updated_at_column function if it exists, or create it
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for clients table
DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for podcasts table
DROP TRIGGER IF EXISTS update_podcasts_updated_at ON public.podcasts;
CREATE TRIGGER update_podcasts_updated_at
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for bookings table
DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.client_podcast_bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.client_podcast_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions to authenticated users (admins)
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.podcasts TO authenticated;
GRANT ALL ON public.client_podcast_bookings TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================================================
-- USEFUL VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View: Monthly bookings per client (for calendar grid view)
CREATE OR REPLACE VIEW public.client_monthly_bookings AS
SELECT
  c.id as client_id,
  c.name as client_name,
  DATE_TRUNC('month', b.scheduled_date) as month,
  COUNT(*) as booking_count,
  COUNT(*) FILTER (WHERE b.status = 'scheduled') as scheduled_count,
  COUNT(*) FILTER (WHERE b.status = 'recorded') as recorded_count,
  COUNT(*) FILTER (WHERE b.status = 'published') as published_count
FROM public.clients c
LEFT JOIN public.client_podcast_bookings b ON c.id = b.client_id
WHERE c.status = 'active' AND b.scheduled_date IS NOT NULL
GROUP BY c.id, c.name, DATE_TRUNC('month', b.scheduled_date)
ORDER BY c.name, month DESC;

COMMENT ON VIEW public.client_monthly_bookings IS 'Monthly breakdown of bookings per client for calendar view';

-- View: Booking details (joins all three tables for easy querying)
CREATE OR REPLACE VIEW public.booking_details AS
SELECT
  b.id as booking_id,
  b.scheduled_date,
  b.recording_date,
  b.publish_date,
  b.status,
  b.episode_url,
  b.notes,
  b.prep_sent,
  b.created_at,
  b.updated_at,
  c.id as client_id,
  c.name as client_name,
  c.email as client_email,
  c.contact_person,
  p.id as podcast_id,
  p.name as podcast_name,
  p.url as podcast_url,
  p.host_name,
  p.audience_size,
  p.ratings,
  p.category
FROM public.client_podcast_bookings b
JOIN public.clients c ON b.client_id = c.id
JOIN public.podcasts p ON b.podcast_id = p.id
ORDER BY b.scheduled_date DESC NULLS LAST;

COMMENT ON VIEW public.booking_details IS 'Complete booking information with client and podcast details';

-- =============================================================================
-- VERIFICATION QUERIES (commented out - for manual testing)
-- =============================================================================

-- Uncomment to verify tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('clients', 'podcasts', 'client_podcast_bookings');

-- Uncomment to verify views were created:
-- SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name IN ('client_monthly_bookings', 'booking_details');

-- Uncomment to verify indexes were created:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('clients', 'podcasts', 'client_podcast_bookings');

-- Uncomment to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('clients', 'podcasts', 'client_podcast_bookings');
