-- Let workspace managers maintain the canonical client profile used by
-- discovery and outreach without falling back to the legacy admin surface.

BEGIN;

DO $workspace_client_profile_editing_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workspace client profile editing requires workspace staff authorization';
  END IF;
END;
$workspace_client_profile_editing_prerequisites$;

CREATE OR REPLACE FUNCTION public.update_workspace_client_profile_v1(
  p_workspace_id UUID,
  p_client_id UUID,
  p_bio TEXT,
  p_expected_updated_at TIMESTAMPTZ,
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
  normalized_bio TEXT := NULLIF(btrim(COALESCE(p_bio, '')), '');
  current_bio TEXT;
  current_updated_at TIMESTAMPTZ;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_client_id IS NULL
    OR p_expected_updated_at IS NULL
    OR char_length(COALESCE(p_bio, '')) > 20000
  THEN
    RAISE EXCEPTION 'workspace client profile is invalid'
      USING ERRCODE = '22023';
  END IF;

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

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-client-profile:' || p_client_id::TEXT, 0)
  );

  SELECT client.bio, client.updated_at
  INTO current_bio, current_updated_at
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workspace client profile changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.clients AS client
  SET bio = normalized_bio
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
    AND client.updated_at = p_expected_updated_at
  RETURNING jsonb_build_object(
    'id', client.id,
    'workspace_id', client.workspace_id,
    'bio', client.bio,
    'updated_at', client.updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace client profile changed'
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
    'workspace.client.profile_updated',
    'client',
    p_client_id,
    jsonb_build_object(
      'previous_character_count', char_length(COALESCE(current_bio, '')),
      'character_count', char_length(COALESCE(normalized_bio, '')),
      'cleared', normalized_bio IS NULL
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_workspace_client_profile_v1(
  UUID, UUID, TEXT, TIMESTAMPTZ, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_client_profile_v1(
  UUID, UUID, TEXT, TIMESTAMPTZ, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.update_workspace_client_profile_v1(
  UUID, UUID, TEXT, TIMESTAMPTZ, UUID, BIGINT
) IS 'Updates the canonical discovery and outreach profile for a workspace-scoped client with manager authorization, optimistic concurrency, and audit metadata.';

NOTIFY pgrst, 'reload schema';

COMMIT;
