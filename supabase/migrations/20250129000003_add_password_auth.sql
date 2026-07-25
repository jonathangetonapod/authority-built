-- Add Password Authentication to Client Portal
-- Allows clients to login with either magic link or traditional password

-- ============================================================================
-- 1. ADD PASSWORD FIELDS TO CLIENTS TABLE
-- ============================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS portal_password TEXT,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS password_set_by TEXT;

-- Index for password lookups (checking if password exists)
CREATE INDEX IF NOT EXISTS clients_portal_password_exists_idx ON public.clients((portal_password IS NOT NULL));

-- Comments
COMMENT ON COLUMN public.clients.portal_password IS 'Plain text password for client portal login (stored as-is for admin viewing)';
COMMENT ON COLUMN public.clients.password_set_at IS 'Timestamp when password was last set or changed';
COMMENT ON COLUMN public.clients.password_set_by IS 'Admin user who set/changed the password (email or name)';

-- ============================================================================
-- 2. UPDATE ACTIVITY LOG TO SUPPORT PASSWORD LOGIN
-- ============================================================================

-- The client_portal_activity_log table already exists and supports any action
-- We'll log 'password_login_success' and 'password_login_failed' actions
COMMENT ON TABLE public.client_portal_activity_log IS 'Audit log for client portal activity including magic link and password authentication';
