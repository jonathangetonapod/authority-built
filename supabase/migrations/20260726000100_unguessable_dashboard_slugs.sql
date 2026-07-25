-- Approval dashboard slugs become unguessable.
--
-- The original trigger derived dashboard_slug from the client name
-- ("john-smith"), which made every always-on public dashboard enumerable
-- from a client list. New slugs keep a short name prefix for operator
-- readability plus 10 hex characters of randomness. Existing slugs are NOT
-- rewritten (already-shared links keep working); owners rotate them
-- explicitly via rotate_client_dashboard_slug_v1.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:unguessable-dashboard-slugs:v1', 0));

CREATE OR REPLACE FUNCTION public.random_client_dashboard_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  name_part TEXT;
  random_part TEXT;
BEGIN
  name_part := TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(COALESCE(p_name, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  name_part := LEFT(name_part, 60);
  random_part := LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 10);
  IF name_part = '' THEN
    RETURN random_part;
  END IF;
  RETURN name_part || '-' || random_part;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_client_dashboard_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.dashboard_slug IS NULL AND NEW.name IS NOT NULL THEN
    NEW.dashboard_slug := public.random_client_dashboard_slug(NEW.name);
    -- gen_random_uuid collisions are effectively impossible, but the column
    -- is UNIQUE, so retry once rather than fail the insert.
    IF EXISTS (SELECT 1 FROM public.clients WHERE dashboard_slug = NEW.dashboard_slug AND id != NEW.id) THEN
      NEW.dashboard_slug := public.random_client_dashboard_slug(NEW.name);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Owner-triggered rotation: invalidates the old public link immediately.
CREATE OR REPLACE FUNCTION public.rotate_client_dashboard_slug_v1(
  p_workspace_id UUID,
  p_client_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  client_name TEXT;
  new_slug TEXT;
BEGIN
  SELECT name INTO client_name
  FROM public.clients
  WHERE id = p_client_id AND workspace_id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client is invalid';
  END IF;

  new_slug := public.random_client_dashboard_slug(client_name);
  IF EXISTS (SELECT 1 FROM public.clients WHERE dashboard_slug = new_slug AND id != p_client_id) THEN
    new_slug := public.random_client_dashboard_slug(client_name);
  END IF;

  UPDATE public.clients
  SET dashboard_slug = new_slug, updated_at = now()
  WHERE id = p_client_id AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object('dashboard_slug', new_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_client_dashboard_slug_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_client_dashboard_slug_v1(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.rotate_client_dashboard_slug_v1 IS
  'Regenerates a client approval-dashboard slug with an unguessable value. The previous public link stops resolving immediately.';

COMMIT;
