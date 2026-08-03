-- The landing page's rate limit counted rows and then inserted one, as two
-- independent round trips. Nothing held between them, so N simultaneous
-- requests from one address all read the same under-ceiling count and all
-- inserted: the ceiling only ever held against a caller who waited politely
-- for each response. It is the only anti-flood control on a public,
-- unauthenticated endpoint, so it has to hold against one that does not.
--
-- Counting and inserting now happen inside one function, behind a per-bucket
-- transaction lock, so concurrent callers queue instead of racing.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_workspace_access_request(
  p_email TEXT,
  p_full_name TEXT,
  p_company TEXT,
  p_website TEXT,
  p_audience TEXT,
  p_clients_now TEXT,
  p_notes TEXT,
  p_source_ip_hash TEXT,
  p_daily_ceiling INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  IF p_source_ip_hash IS NULL OR btrim(p_source_ip_hash) = '' THEN
    RAISE EXCEPTION 'A source bucket is required';
  END IF;

  IF p_daily_ceiling IS NULL OR p_daily_ceiling < 1 THEN
    RAISE EXCEPTION 'A positive daily ceiling is required';
  END IF;

  -- Serializes every concurrent request from this bucket for the remainder of
  -- the transaction. Released on commit or rollback, so a failure cannot leave
  -- a bucket wedged.
  PERFORM pg_advisory_xact_lock(
    hashtext('workspace_access_request:' || p_source_ip_hash)
  );

  SELECT count(*)
  INTO recent_count
  FROM public.workspace_access_requests
  WHERE source_ip_hash = p_source_ip_hash
    AND created_at >= now() - INTERVAL '24 hours';

  IF recent_count >= p_daily_ceiling THEN
    RETURN 'rate_limited';
  END IF;

  INSERT INTO public.workspace_access_requests (
    email,
    full_name,
    company,
    website,
    audience,
    clients_now,
    notes,
    source_ip_hash
  )
  VALUES (
    p_email,
    p_full_name,
    p_company,
    p_website,
    p_audience,
    p_clients_now,
    p_notes,
    p_source_ip_hash
  );

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_workspace_access_request(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_workspace_access_request(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.record_workspace_access_request(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) IS
  'Service-only atomic landing-page access request: per-bucket daily ceiling and insert under one advisory lock.';

COMMIT;
