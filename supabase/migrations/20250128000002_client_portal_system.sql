-- Client Portal System Migration
-- Creates tables, indexes, and RLS policies for passwordless client portal access

-- ============================================================================
-- 1. CLIENT PORTAL TOKENS TABLE
-- ============================================================================
-- Stores one-time magic link tokens for passwordless authentication

CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT token_not_expired CHECK (expires_at > created_at)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS client_portal_tokens_token_idx ON public.client_portal_tokens(token);
CREATE INDEX IF NOT EXISTS client_portal_tokens_client_id_idx ON public.client_portal_tokens(client_id);
CREATE INDEX IF NOT EXISTS client_portal_tokens_expires_at_idx ON public.client_portal_tokens(expires_at);
CREATE INDEX IF NOT EXISTS client_portal_tokens_created_at_idx ON public.client_portal_tokens(created_at DESC);

-- Comments
COMMENT ON TABLE public.client_portal_tokens IS 'One-time magic link tokens for client portal authentication (15-minute expiry)';
COMMENT ON COLUMN public.client_portal_tokens.token IS 'Unique secure token (hashed) sent in magic link email';
COMMENT ON COLUMN public.client_portal_tokens.expires_at IS 'Token expiration timestamp (typically created_at + 15 minutes)';
COMMENT ON COLUMN public.client_portal_tokens.used_at IS 'Timestamp when token was consumed (null = unused)';

-- ============================================================================
-- 2. CLIENT PORTAL SESSIONS TABLE
-- ============================================================================
-- Stores active client sessions after successful magic link authentication

CREATE TABLE IF NOT EXISTS public.client_portal_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT session_not_expired CHECK (expires_at > created_at)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS client_portal_sessions_session_token_idx ON public.client_portal_sessions(session_token);
CREATE INDEX IF NOT EXISTS client_portal_sessions_client_id_idx ON public.client_portal_sessions(client_id);
CREATE INDEX IF NOT EXISTS client_portal_sessions_expires_at_idx ON public.client_portal_sessions(expires_at);
CREATE INDEX IF NOT EXISTS client_portal_sessions_last_active_idx ON public.client_portal_sessions(last_active_at DESC);

-- Comments
COMMENT ON TABLE public.client_portal_sessions IS 'Active client portal sessions (24-hour expiry, updated on activity)';
COMMENT ON COLUMN public.client_portal_sessions.session_token IS 'Unique secure session identifier stored in client localStorage';
COMMENT ON COLUMN public.client_portal_sessions.expires_at IS 'Session expiration (typically created_at + 24 hours)';
COMMENT ON COLUMN public.client_portal_sessions.last_active_at IS 'Last activity timestamp, updated on each request';

-- ============================================================================
-- 3. CLIENT PORTAL ACTIVITY LOG TABLE
-- ============================================================================
-- Audit trail of all client portal actions for security and analytics

CREATE TABLE IF NOT EXISTS public.client_portal_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.client_portal_sessions(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'request_magic_link', 'login_success', 'login_failed', 'logout', 'view_booking', 'session_expired'
  metadata JSONB, -- Additional context (e.g., booking_id, error messages, etc.)
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS client_portal_activity_log_client_id_idx ON public.client_portal_activity_log(client_id);
CREATE INDEX IF NOT EXISTS client_portal_activity_log_session_id_idx ON public.client_portal_activity_log(session_id);
CREATE INDEX IF NOT EXISTS client_portal_activity_log_action_idx ON public.client_portal_activity_log(action);
CREATE INDEX IF NOT EXISTS client_portal_activity_log_created_at_idx ON public.client_portal_activity_log(created_at DESC);

-- Comments
COMMENT ON TABLE public.client_portal_activity_log IS 'Comprehensive audit log of all client portal activity';
COMMENT ON COLUMN public.client_portal_activity_log.action IS 'Type of action performed (request_magic_link, login_success, logout, etc.)';
COMMENT ON COLUMN public.client_portal_activity_log.metadata IS 'Additional JSON data specific to the action';

-- ============================================================================
-- 4. UPDATE CLIENTS TABLE
-- ============================================================================
-- Add portal-related fields to existing clients table

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_access_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_last_login_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS portal_invitation_sent_at TIMESTAMP WITH TIME ZONE;

-- Index for filtering by portal access
CREATE INDEX IF NOT EXISTS clients_portal_access_enabled_idx ON public.clients(portal_access_enabled);

-- Comments
COMMENT ON COLUMN public.clients.portal_access_enabled IS 'Admin toggle to enable/disable client portal access';
COMMENT ON COLUMN public.clients.portal_last_login_at IS 'Timestamp of most recent successful portal login';
COMMENT ON COLUMN public.clients.portal_invitation_sent_at IS 'Timestamp when portal invitation email was sent';

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all portal tables
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_activity_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Portal Tokens Policies
-- ============================================================================

-- Admin can do everything with tokens
CREATE POLICY "Admin full access to portal tokens"
  ON public.client_portal_tokens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Portal Sessions Policies
-- ============================================================================

-- Admin can do everything with sessions
CREATE POLICY "Admin full access to portal sessions"
  ON public.client_portal_sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Portal Activity Log Policies
-- ============================================================================

-- Admin can view all activity logs
CREATE POLICY "Admin full access to activity logs"
  ON public.client_portal_activity_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Updated Clients & Bookings Policies for Client Portal
-- ============================================================================

-- Note: These policies will be enforced when clients access via portal
-- The client_id will be set in the session context by Edge Functions

-- Clients can view their own record only (when authenticated via portal session)
CREATE POLICY "Clients can view own profile"
  ON public.clients FOR SELECT
  TO anon
  USING (
    id::text = current_setting('app.current_client_id', true)
  );

-- Clients can view only their own bookings (when authenticated via portal session)
CREATE POLICY "Clients can view own bookings"
  ON public.bookings FOR SELECT
  TO anon
  USING (
    client_id::text = current_setting('app.current_client_id', true)
  );

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to clean up expired tokens and sessions
-- Run this periodically via cron job or scheduled task
CREATE OR REPLACE FUNCTION public.cleanup_expired_portal_data()
RETURNS void AS $$
BEGIN
  -- Delete tokens older than 1 day (well past 15-min expiry)
  DELETE FROM public.client_portal_tokens
  WHERE expires_at < now() - interval '1 day';

  -- Delete expired sessions
  DELETE FROM public.client_portal_sessions
  WHERE expires_at < now();

  -- Optionally: Archive old activity logs (older than 90 days)
  -- DELETE FROM public.client_portal_activity_log
  -- WHERE created_at < now() - interval '90 days';

  RAISE NOTICE 'Expired portal data cleaned up successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_portal_data IS 'Removes expired tokens and sessions. Run periodically via cron.';

-- Function to get client portal stats (useful for admin dashboard)
CREATE OR REPLACE FUNCTION public.get_client_portal_stats()
RETURNS TABLE (
  total_clients_with_access INT,
  active_sessions_count INT,
  logins_last_24h INT,
  logins_last_7d INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.clients WHERE portal_access_enabled = true)::INT,
    (SELECT COUNT(*) FROM public.client_portal_sessions WHERE expires_at > now())::INT,
    (SELECT COUNT(*) FROM public.client_portal_activity_log
     WHERE action = 'login_success' AND created_at > now() - interval '24 hours')::INT,
    (SELECT COUNT(*) FROM public.client_portal_activity_log
     WHERE action = 'login_success' AND created_at > now() - interval '7 days')::INT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_client_portal_stats IS 'Returns aggregate stats for client portal usage';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

-- Grant necessary permissions for Edge Functions to access tables
GRANT ALL ON public.client_portal_tokens TO authenticated, anon, service_role;
GRANT ALL ON public.client_portal_sessions TO authenticated, anon, service_role;
GRANT ALL ON public.client_portal_activity_log TO authenticated, anon, service_role;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_portal_data TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_portal_stats TO authenticated, service_role;
