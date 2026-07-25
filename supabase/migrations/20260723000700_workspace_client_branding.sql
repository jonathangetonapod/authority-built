-- Owner-managed, client-facing identity for white-label campaign dashboards.
-- The operational workspace name remains stable; agencies can independently
-- choose the name and colors presented to their clients.

BEGIN;

DO $workspace_client_branding_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workspace client branding requires workspace staff authorization';
  END IF;
END;
$workspace_client_branding_prerequisites$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS client_brand_name TEXT,
  ADD COLUMN IF NOT EXISTS client_brand_primary_color TEXT NOT NULL DEFAULT '#0D1B2A',
  ADD COLUMN IF NOT EXISTS client_brand_accent_color TEXT NOT NULL DEFAULT '#C7794F',
  ADD COLUMN IF NOT EXISTS client_brand_updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();

DO $workspace_client_branding_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_client_brand_name_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_client_brand_name_check CHECK (
        client_brand_name IS NULL
        OR (
          client_brand_name = btrim(client_brand_name)
          AND char_length(client_brand_name) BETWEEN 1 AND 120
          AND client_brand_name !~ '[[:cntrl:]]'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_client_brand_primary_color_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_client_brand_primary_color_check CHECK (
        client_brand_primary_color ~ '^#[0-9A-F]{6}$'
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_client_brand_accent_color_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_client_brand_accent_color_check CHECK (
        client_brand_accent_color ~ '^#[0-9A-F]{6}$'
      ) NOT VALID;
  END IF;
END;
$workspace_client_branding_constraints$;

ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_client_brand_name_check;
ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_client_brand_primary_color_check;
ALTER TABLE public.workspaces
  VALIDATE CONSTRAINT workspaces_client_brand_accent_color_check;

-- Edge Functions can preserve white-label settings in the existing audit log
-- while a project operator is waiting for database-write access. Promote the
-- newest valid compatibility event after the table shape is finalized so
-- deferred workspace trigger events cannot block later ALTER TABLE statements.
WITH latest_compatibility_brand AS (
  SELECT DISTINCT ON (audit.workspace_id)
    audit.workspace_id,
    audit.created_at,
    btrim(audit.metadata ->> 'client_brand_name') AS client_brand_name,
    upper(btrim(audit.metadata ->> 'primary_color')) AS primary_color,
    upper(btrim(audit.metadata ->> 'accent_color')) AS accent_color
  FROM public.workspace_audit_log AS audit
  WHERE audit.action = 'workspace.branding.client_identity_updated'
    AND jsonb_typeof(audit.metadata) = 'object'
    AND char_length(btrim(audit.metadata ->> 'client_brand_name')) BETWEEN 1 AND 120
    AND btrim(audit.metadata ->> 'client_brand_name') !~ '[[:cntrl:]]'
    AND upper(btrim(audit.metadata ->> 'primary_color')) ~ '^#[0-9A-F]{6}$'
    AND upper(btrim(audit.metadata ->> 'accent_color')) ~ '^#[0-9A-F]{6}$'
  ORDER BY audit.workspace_id, audit.created_at DESC, audit.id DESC
)
UPDATE public.workspaces AS workspace
SET
  client_brand_name = compatibility.client_brand_name,
  client_brand_primary_color = compatibility.primary_color,
  client_brand_accent_color = compatibility.accent_color,
  client_brand_updated_at = compatibility.created_at
FROM latest_compatibility_brand AS compatibility
WHERE workspace.id = compatibility.workspace_id
  AND workspace.client_brand_name IS NULL
  AND workspace.status = 'active'
  AND NOT workspace.is_default;

CREATE OR REPLACE FUNCTION public.set_workspace_client_brand_v1(
  p_workspace_id UUID,
  p_expected_brand_updated_at TIMESTAMPTZ,
  p_client_brand_name TEXT,
  p_client_brand_primary_color TEXT,
  p_client_brand_accent_color TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  current_brand_updated_at TIMESTAMPTZ;
  normalized_brand_name TEXT := NULLIF(btrim(p_client_brand_name), '');
  normalized_primary_color TEXT := upper(NULLIF(btrim(p_client_brand_primary_color), ''));
  normalized_accent_color TEXT := upper(NULLIF(btrim(p_client_brand_accent_color), ''));
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_expected_brand_updated_at IS NULL
    OR normalized_brand_name IS NULL
    OR char_length(normalized_brand_name) > 120
    OR normalized_brand_name ~ '[[:cntrl:]]'
    OR normalized_primary_color IS NULL
    OR normalized_accent_color IS NULL
    OR normalized_primary_color !~ '^#[0-9A-F]{6}$'
    OR normalized_accent_color !~ '^#[0-9A-F]{6}$'
  THEN
    RAISE EXCEPTION 'workspace client branding is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-client-brand:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.client_brand_updated_at
  INTO current_brand_updated_at
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_brand_updated_at IS DISTINCT FROM p_expected_brand_updated_at THEN
    RAISE EXCEPTION 'workspace branding state changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.workspaces AS workspace
  SET
    client_brand_name = normalized_brand_name,
    client_brand_primary_color = normalized_primary_color,
    client_brand_accent_color = normalized_accent_color,
    client_brand_updated_at = clock_timestamp()
  WHERE workspace.id = p_workspace_id
    AND workspace.client_brand_updated_at = p_expected_brand_updated_at
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'logo_path', workspace.logo_path,
    'logo_updated_at', workspace.logo_updated_at,
    'client_brand_name', workspace.client_brand_name,
    'client_brand_primary_color', workspace.client_brand_primary_color,
    'client_brand_accent_color', workspace.client_brand_accent_color,
    'client_brand_updated_at', workspace.client_brand_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace branding state changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.branding.client_identity_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'client_brand_name', normalized_brand_name,
      'primary_color', normalized_primary_color,
      'accent_color', normalized_accent_color
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_client_brand_v1(
  UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_client_brand_v1(
  UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, BIGINT
) TO service_role;

COMMENT ON COLUMN public.workspaces.client_brand_name IS
  'Owner-managed agency name presented on white-label client experiences; null falls back to the workspace name.';
COMMENT ON COLUMN public.workspaces.client_brand_primary_color IS
  'Primary hexadecimal color for white-label client experiences.';
COMMENT ON COLUMN public.workspaces.client_brand_accent_color IS
  'Accent hexadecimal color for white-label client actions and highlights.';
COMMENT ON FUNCTION public.set_workspace_client_brand_v1(
  UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, UUID, BIGINT
) IS
  'Updates the client-facing agency identity with manager authorization, optimistic concurrency, and audit logging.';

NOTIFY pgrst, 'reload schema';

COMMIT;
