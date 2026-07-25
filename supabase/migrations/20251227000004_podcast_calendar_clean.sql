-- Clean Podcast Calendar System Migration
-- Drop everything and recreate from scratch

-- =============================================================================
-- DROP EXISTING OBJECTS (if any)
-- =============================================================================
DROP VIEW IF EXISTS public.daily_bookings CASCADE;
DROP VIEW IF EXISTS public.calendar_view CASCADE;
DROP VIEW IF EXISTS public.client_overview CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;

-- =============================================================================
-- CLIENTS TABLE
-- =============================================================================
CREATE TABLE public.clients (
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

CREATE INDEX clients_name_idx ON public.clients(name);
CREATE INDEX clients_status_idx ON public.clients(status);
CREATE INDEX clients_created_at_idx ON public.clients(created_at DESC);

-- =============================================================================
-- BOOKINGS TABLE
-- =============================================================================
CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  podcast_name TEXT NOT NULL,
  podcast_url TEXT,
  host_name TEXT,
  scheduled_date DATE,
  recording_date DATE,
  publish_date DATE,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'in_progress', 'recorded', 'published', 'cancelled')),
  episode_url TEXT,
  notes TEXT,
  prep_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX bookings_client_id_idx ON public.bookings(client_id);
CREATE INDEX bookings_status_idx ON public.bookings(status);
CREATE INDEX bookings_scheduled_date_idx ON public.bookings(scheduled_date DESC);
CREATE INDEX bookings_recording_date_idx ON public.bookings(recording_date DESC);
CREATE INDEX bookings_created_at_idx ON public.bookings(created_at DESC);
CREATE INDEX bookings_client_date_idx ON public.bookings(client_id, scheduled_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to clients"
  ON public.clients FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin full access to bookings"
  ON public.bookings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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
-- INSERT SAMPLE DATA (for testing)
-- =============================================================================
-- Insert 3 sample clients
INSERT INTO public.clients (name, email, status) VALUES
  ('Client A', 'clienta@example.com', 'active'),
  ('Client B', 'clientb@example.com', 'active'),
  ('Client C', 'clientc@example.com', 'active');

-- Insert sample bookings
INSERT INTO public.bookings (client_id, podcast_name, scheduled_date, status) VALUES
  ((SELECT id FROM public.clients WHERE name = 'Client A'), 'Tech Talks', '2025-01-15', 'booked'),
  ((SELECT id FROM public.clients WHERE name = 'Client A'), 'Marketing Pod', '2025-01-22', 'in_progress'),
  ((SELECT id FROM public.clients WHERE name = 'Client B'), 'Business Show', '2025-01-18', 'booked'),
  ((SELECT id FROM public.clients WHERE name = 'Client C'), 'Growth Talks', '2025-01-10', 'recorded'),
  ((SELECT id FROM public.clients WHERE name = 'Client B'), 'Startup Life', '2025-01-25', 'booked'),
  ((SELECT id FROM public.clients WHERE name = 'Client A'), 'Dev Weekly', '2025-01-08', 'in_progress'),
  ((SELECT id FROM public.clients WHERE name = 'Client C'), 'Sales Mastery', '2025-01-12', 'booked'),
  ((SELECT id FROM public.clients WHERE name = 'Client C'), 'Leadership Hour', '2025-01-28', 'booked'),
  ((SELECT id FROM public.clients WHERE name = 'Client A'), 'Innovation Daily', '2025-01-05', 'published'),
  ((SELECT id FROM public.clients WHERE name = 'Client B'), 'Tech Founders', '2025-01-30', 'in_progress');
