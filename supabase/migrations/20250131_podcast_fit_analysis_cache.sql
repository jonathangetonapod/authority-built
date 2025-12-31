-- Create table for caching podcast fit analyses
CREATE TABLE IF NOT EXISTS podcast_fit_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  podcast_name TEXT NOT NULL,
  podcast_description TEXT,
  analysis TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one analysis per client+booking combo
  UNIQUE(client_id, booking_id),

  -- Index for fast lookups
  INDEX idx_podcast_fit_client_booking (client_id, booking_id)
);

-- Enable RLS
ALTER TABLE podcast_fit_analyses ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins have full access to podcast fit analyses"
  ON podcast_fit_analyses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email IN (
        SELECT email FROM admin_users
      )
    )
  );

-- Clients can view their own analyses via portal session
CREATE POLICY "Clients can view their own podcast fit analyses"
  ON podcast_fit_analyses
  FOR SELECT
  USING (
    client_id IN (
      SELECT client_id
      FROM client_portal_sessions
      WHERE session_token = current_setting('request.headers', true)::json->>'x-session-token'
      AND expires_at > NOW()
    )
  );

-- Add comment
COMMENT ON TABLE podcast_fit_analyses IS 'Cached AI-generated analyses of why podcasts are a good fit for clients';
