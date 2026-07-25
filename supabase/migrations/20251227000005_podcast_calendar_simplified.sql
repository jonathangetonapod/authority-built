-- Simplified Podcast Calendar System
-- Focus: Client-centric booking calendar with status tracking

-- =============================================================================
-- CLIENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  linkedin_url TEXT,
  website TEXT,
  calendar_link TEXT,
  contact_person TEXT,
  first_invoice_paid_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS clients_name_idx ON public.clients(name);
CREATE INDEX IF NOT EXISTS clients_status_idx ON public.clients(status);
CREATE INDEX IF NOT EXISTS clients_created_at_idx ON public.clients(created_at DESC);

COMMENT ON TABLE public.clients IS 'Podcast placement clients';
COMMENT ON COLUMN public.clients.status IS 'active (currently servicing), paused (on hold), churned (no longer a client)';

-- =============================================================================
-- BOOKINGS TABLE (Simplified - no separate podcast table)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Podcast info (stored directly on booking)
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT,

  -- Dates
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'in_progress', 'recorded', 'published', 'cancelled')),

  -- Additional details
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS bookings_client_id_idx ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings(status);
CREATE INDEX IF NOT EXISTS bookings_scheduled_date_idx ON public.bookings(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS bookings_recording_date_idx ON public.bookings(recording_date DESC);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON public.bookings(created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_client_date_idx ON public.bookings(client_id, scheduled_date DESC);

COMMENT ON TABLE public.bookings IS 'Podcast bookings for each client';
COMMENT ON COLUMN public.bookings.status IS 'booked (confirmed booking), in_progress (prepping/coordinating), recorded (recorded but not live), published (episode is live), cancelled';
COMMENT ON COLUMN public.bookings.scheduled_date IS 'When the podcast recording is scheduled';
COMMENT ON COLUMN public.bookings.prep_sent IS 'Whether prep materials have been sent to client';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to clients" ON public.clients;
DROP POLICY IF EXISTS "Admin full access to bookings" ON public.bookings;

CREATE POLICY "Admin full access to clients"
  ON public.clients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access to bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================
GRANT ALL ON public.clients TO authenticated;
GRANT ALL ON public.bookings TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================================================
-- USEFUL VIEWS
-- =============================================================================

-- View: Client overview with booking counts by status
CREATE OR REPLACE VIEW public.client_overview AS
SELECT
  c.id,
  c.name,
  c.email,
  c.status,
  c.created_at,
  COUNT(b.id) as total_bookings,
  COUNT(b.id) FILTER (WHERE b.status = 'booked') as booked_count,
  COUNT(b.id) FILTER (WHERE b.status = 'in_progress') as in_progress_count,
  COUNT(b.id) FILTER (WHERE b.status = 'recorded') as recorded_count,
  COUNT(b.id) FILTER (WHERE b.status = 'published') as published_count,
  MAX(b.scheduled_date) as last_booking_date
FROM public.clients c
LEFT JOIN public.bookings b ON c.id = b.client_id
GROUP BY c.id, c.name, c.email, c.status, c.created_at
ORDER BY c.name;

COMMENT ON VIEW public.client_overview IS 'Client summary with booking counts by status';

-- View: Monthly calendar data (clients x months)
CREATE OR REPLACE VIEW public.calendar_view AS
SELECT
  c.id as client_id,
  c.name as client_name,
  c.status as client_status,
  DATE_TRUNC('month', b.scheduled_date) as month,
  COUNT(*) as booking_count,
  COUNT(*) FILTER (WHERE b.status = 'booked') as booked_count,
  COUNT(*) FILTER (WHERE b.status = 'in_progress') as in_progress_count,
  COUNT(*) FILTER (WHERE b.status = 'recorded') as recorded_count,
  COUNT(*) FILTER (WHERE b.status = 'published') as published_count
FROM public.clients c
LEFT JOIN public.bookings b ON c.id = b.client_id
WHERE b.scheduled_date IS NOT NULL
GROUP BY c.id, c.name, c.status, DATE_TRUNC('month', b.scheduled_date)
ORDER BY c.name, month DESC;

COMMENT ON VIEW public.calendar_view IS 'Monthly breakdown of bookings per client for calendar grid';

-- View: Daily calendar (which clients have podcasts on which day)
CREATE OR REPLACE VIEW public.daily_bookings AS
SELECT
  b.scheduled_date,
  b.status,
  c.id as client_id,
  c.name as client_name,
  b.podcast_name,
  b.host_name,
  b.episode_url,
  b.notes,
  b.prep_sent
FROM public.bookings b
JOIN public.clients c ON b.client_id = c.id
WHERE b.scheduled_date IS NOT NULL
  AND b.status != 'cancelled'
ORDER BY b.scheduled_date DESC, c.name;

COMMENT ON VIEW public.daily_bookings IS 'Daily view of all bookings with client info';

-- =============================================================================
-- SAMPLE QUERIES (commented out)
-- =============================================================================

-- Get all bookings for a specific month:
-- SELECT * FROM calendar_view
-- WHERE month = '2025-01-01'::date;

-- Get upcoming bookings this week:
-- SELECT * FROM daily_bookings
-- WHERE scheduled_date >= CURRENT_DATE
--   AND scheduled_date < CURRENT_DATE + INTERVAL '7 days';

-- Get client progress summary:
-- SELECT * FROM client_overview
-- WHERE status = 'active'
-- ORDER BY total_bookings DESC;
