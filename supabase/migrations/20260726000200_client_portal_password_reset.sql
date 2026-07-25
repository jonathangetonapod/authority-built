-- Self-serve client portal password reset.
--
-- Clients request a reset by email; a single-use hashed token (60 minutes)
-- is stored per client and redeemed to replace the PBKDF2 verifier. Both
-- steps follow the portal security posture from 20260720000300: service-role
-- only tables, advisory-lock rate limiting over the activity log, audited
-- credential mutations, and full session revocation on change.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:client-portal-password-reset:v1', 0));

CREATE TABLE IF NOT EXISTS public.client_portal_reset_tokens (
  client_id UUID PRIMARY KEY
    REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^sha256\$[A-Za-z0-9+/]{43}=$'),
  expires_at TIMESTAMPTZ NOT NULL,
  requested_ip TEXT CHECK (requested_ip IS NULL OR char_length(requested_ip) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_portal_reset_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.client_portal_reset_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_portal_reset_tokens FROM service_role;
GRANT ALL PRIVILEGES ON TABLE public.client_portal_reset_tokens TO service_role;

-- ---------------------------------------------------------------------------
-- Rate limit reset requests: 3 per email per hour, 10 per IP per hour,
-- tracked as activity-log rows exactly like login attempts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_client_portal_reset_request_v1(
  p_email_normalized TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email TEXT := lower(btrim(COALESCE(p_email_normalized, '')));
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  recent_email_requests BIGINT;
  recent_ip_requests BIGINT;
BEGIN
  IF char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email IS DISTINCT FROM p_email_normalized
    OR char_length(normalized_ip) > 120
    OR char_length(COALESCE(p_user_agent, '')) > 1024
  THEN
    RAISE EXCEPTION 'invalid portal reset request parameters'
      USING ERRCODE = '22023';
  END IF;

  -- Same email-then-IP lock order as reserve_client_portal_login_attempt.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-reset-email:' || normalized_email, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-reset-ip:' || normalized_ip, 0)
  );

  SELECT count(*)
  INTO recent_email_requests
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_reset_request'
    AND activity.created_at >= now() - interval '1 hour'
    AND activity.metadata ->> 'email' = normalized_email;

  SELECT count(*)
  INTO recent_ip_requests
  FROM public.client_portal_activity_log AS activity
  WHERE activity.action = 'password_reset_request'
    AND activity.created_at >= now() - interval '1 hour'
    AND activity.ip_address = normalized_ip;

  IF recent_email_requests >= 3 OR recent_ip_requests >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_activity_log (
    client_id,
    session_id,
    action,
    metadata,
    ip_address,
    user_agent
  )
  VALUES (
    NULL,
    NULL,
    'password_reset_request',
    jsonb_build_object('email', normalized_email),
    normalized_ip,
    NULLIF(p_user_agent, '')
  );

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Redeem a reset token: replace the verifier, revoke every session, burn the
-- token, audit. Returns false (never details) for any invalid/expired token.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_client_portal_password_reset_v1(
  p_token_hash TEXT,
  p_password_hash TEXT,
  p_ip_address TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reset_client_id UUID;
  normalized_ip TEXT := COALESCE(NULLIF(btrim(p_ip_address), ''), 'unknown');
  client_workspace_id UUID;
  client_name TEXT;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^sha256\$[A-Za-z0-9+/]{43}=$' THEN
    RETURN false;
  END IF;
  IF p_password_hash IS NULL
    OR p_password_hash !~ '^pbkdf2_sha256\$[0-9]{6,7}\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$'
  THEN
    RAISE EXCEPTION 'invalid portal password verifier'
      USING ERRCODE = '22023';
  END IF;
  IF char_length(normalized_ip) > 120 THEN
    RAISE EXCEPTION 'invalid portal reset parameters'
      USING ERRCODE = '22023';
  END IF;

  SELECT reset_token.client_id
  INTO reset_client_id
  FROM public.client_portal_reset_tokens AS reset_token
  WHERE reset_token.token_hash = p_token_hash
    AND reset_token.expires_at > now()
  FOR UPDATE;

  IF reset_client_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT client.workspace_id, client.name
  INTO client_workspace_id, client_name
  FROM public.clients AS client
  WHERE client.id = reset_client_id
    AND client.portal_access_enabled
  FOR UPDATE;

  IF client_workspace_id IS NULL THEN
    DELETE FROM public.client_portal_reset_tokens WHERE client_id = reset_client_id;
    RETURN false;
  END IF;

  INSERT INTO public.client_portal_credentials (client_id, password_verifier, configured_by)
  VALUES (reset_client_id, p_password_hash, 'self_service_reset')
  ON CONFLICT (client_id) DO UPDATE
  SET password_verifier = EXCLUDED.password_verifier,
      credential_version = public.client_portal_credentials.credential_version + 1,
      configured_at = now(),
      configured_by = 'self_service_reset',
      updated_at = now();

  UPDATE public.clients
  SET password_set_at = now(), password_set_by = 'self_service_reset'
  WHERE id = reset_client_id;

  DELETE FROM public.client_portal_sessions WHERE client_id = reset_client_id;
  DELETE FROM public.client_portal_tokens WHERE client_id = reset_client_id;
  DELETE FROM public.client_portal_reset_tokens WHERE client_id = reset_client_id;

  INSERT INTO public.workspace_audit_log (workspace_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    client_workspace_id,
    NULL,
    'client.portal_password.reset',
    'client',
    reset_client_id,
    pg_catalog.jsonb_build_object('client_name', client_name)
  );

  INSERT INTO public.client_portal_activity_log (client_id, session_id, action, metadata, ip_address, user_agent)
  VALUES (reset_client_id, NULL, 'password_reset_completed', '{}'::jsonb, normalized_ip, NULL);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_client_portal_reset_request_v1(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_portal_password_reset_v1(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_client_portal_reset_request_v1(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_portal_password_reset_v1(TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.reserve_client_portal_reset_request_v1 IS
  'Rate limit for self-serve portal password reset requests: 3/hour per email, 10/hour per IP, tracked in client_portal_activity_log.';
COMMENT ON FUNCTION public.complete_client_portal_password_reset_v1 IS
  'Redeems a hashed single-use reset token: replaces the PBKDF2 verifier, revokes all portal sessions, burns the token, audits.';

COMMIT;
