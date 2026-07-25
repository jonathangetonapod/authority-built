-- Add a compact, structured AI SDR profile to each workspace client. The
-- profile is separate from the long-form guest bio: the bio powers podcast
-- discovery, while this context gives interested hosts approved positioning,
-- topic, listener-value, proof, fit, and booking information.

BEGIN;

DO $client_ai_sdr_profile_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'client AI SDR profiles require workspace staff authorization';
  END IF;
END;
$client_ai_sdr_profile_prerequisites$;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ai_sdr_profile JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS ai_sdr_profile_updated_at TIMESTAMPTZ;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ai_sdr_profile_object;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_ai_sdr_profile_object
  CHECK (jsonb_typeof(ai_sdr_profile) = 'object');

COMMENT ON COLUMN public.clients.ai_sdr_profile IS
  'Structured, approved per-client podcast guest and booking context used by the Master Inbox AI SDR. Empty and partial drafts are allowed; reply actions must still enforce readiness and review policy.';

COMMENT ON COLUMN public.clients.ai_sdr_profile_updated_at IS
  'Optimistic-concurrency timestamp for AI SDR profile edits, independent of ordinary client metadata changes.';

CREATE OR REPLACE FUNCTION public.update_workspace_client_ai_sdr_profile_v1(
  p_workspace_id UUID,
  p_client_id UUID,
  p_profile JSONB,
  p_expected_profile_updated_at TIMESTAMPTZ,
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
  normalized_profile JSONB;
  current_profile JSONB;
  current_profile_updated_at TIMESTAMPTZ;
  next_profile_updated_at TIMESTAMPTZ := clock_timestamp();
  previous_completed_fields INTEGER;
  completed_fields INTEGER;
  ready BOOLEAN;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_client_id IS NULL
    OR p_profile IS NULL
    OR jsonb_typeof(p_profile) <> 'object'
    OR p_profile - ARRAY[
      'positioning',
      'topics_and_angles',
      'listener_takeaways',
      'proof_points',
      'ideal_opportunities',
      'booking_details'
    ]::TEXT[] <> '{}'::JSONB
    OR ((p_profile ? 'positioning') AND jsonb_typeof(p_profile -> 'positioning') <> 'string')
    OR ((p_profile ? 'topics_and_angles') AND jsonb_typeof(p_profile -> 'topics_and_angles') <> 'string')
    OR ((p_profile ? 'listener_takeaways') AND jsonb_typeof(p_profile -> 'listener_takeaways') <> 'string')
    OR ((p_profile ? 'proof_points') AND jsonb_typeof(p_profile -> 'proof_points') <> 'string')
    OR ((p_profile ? 'ideal_opportunities') AND jsonb_typeof(p_profile -> 'ideal_opportunities') <> 'string')
    OR ((p_profile ? 'booking_details') AND jsonb_typeof(p_profile -> 'booking_details') <> 'string')
    OR char_length(COALESCE(p_profile ->> 'positioning', '')) > 4000
    OR char_length(COALESCE(p_profile ->> 'topics_and_angles', '')) > 4000
    OR char_length(COALESCE(p_profile ->> 'listener_takeaways', '')) > 4000
    OR char_length(COALESCE(p_profile ->> 'proof_points', '')) > 4000
    OR char_length(COALESCE(p_profile ->> 'ideal_opportunities', '')) > 4000
    OR char_length(COALESCE(p_profile ->> 'booking_details', '')) > 4000
  THEN
    RAISE EXCEPTION 'workspace client AI SDR profile is invalid'
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
    hashtextextended('goap:workspace-client-ai-sdr-profile:' || p_client_id::TEXT, 0)
  );

  SELECT client.ai_sdr_profile, client.ai_sdr_profile_updated_at
  INTO current_profile, current_profile_updated_at
  FROM public.clients AS client
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_profile_updated_at IS DISTINCT FROM p_expected_profile_updated_at THEN
    RAISE EXCEPTION 'workspace client AI SDR profile changed'
      USING ERRCODE = '40001';
  END IF;

  normalized_profile := jsonb_strip_nulls(jsonb_build_object(
    'positioning', NULLIF(btrim(COALESCE(p_profile ->> 'positioning', '')), ''),
    'topics_and_angles', NULLIF(btrim(COALESCE(p_profile ->> 'topics_and_angles', '')), ''),
    'listener_takeaways', NULLIF(btrim(COALESCE(p_profile ->> 'listener_takeaways', '')), ''),
    'proof_points', NULLIF(btrim(COALESCE(p_profile ->> 'proof_points', '')), ''),
    'ideal_opportunities', NULLIF(btrim(COALESCE(p_profile ->> 'ideal_opportunities', '')), ''),
    'booking_details', NULLIF(btrim(COALESCE(p_profile ->> 'booking_details', '')), '')
  ));

  previous_completed_fields := num_nonnulls(
    NULLIF(btrim(COALESCE(current_profile ->> 'positioning', '')), ''),
    NULLIF(btrim(COALESCE(current_profile ->> 'topics_and_angles', '')), ''),
    NULLIF(btrim(COALESCE(current_profile ->> 'listener_takeaways', '')), ''),
    NULLIF(btrim(COALESCE(current_profile ->> 'proof_points', '')), ''),
    NULLIF(btrim(COALESCE(current_profile ->> 'ideal_opportunities', '')), ''),
    NULLIF(btrim(COALESCE(current_profile ->> 'booking_details', '')), '')
  );
  completed_fields := num_nonnulls(
    normalized_profile ->> 'positioning',
    normalized_profile ->> 'topics_and_angles',
    normalized_profile ->> 'listener_takeaways',
    normalized_profile ->> 'proof_points',
    normalized_profile ->> 'ideal_opportunities',
    normalized_profile ->> 'booking_details'
  );
  ready := normalized_profile ? 'positioning'
    AND normalized_profile ? 'topics_and_angles'
    AND normalized_profile ? 'listener_takeaways'
    AND normalized_profile ? 'booking_details';

  UPDATE public.clients AS client
  SET ai_sdr_profile = normalized_profile,
      ai_sdr_profile_updated_at = next_profile_updated_at
  WHERE client.id = p_client_id
    AND client.workspace_id = p_workspace_id
    AND client.ai_sdr_profile_updated_at IS NOT DISTINCT FROM p_expected_profile_updated_at
  RETURNING jsonb_build_object(
    'id', client.id,
    'workspace_id', client.workspace_id,
    'ai_sdr_profile', client.ai_sdr_profile,
    'ai_sdr_profile_updated_at', client.ai_sdr_profile_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace client AI SDR profile changed'
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
    'workspace.client.ai_sdr_profile_updated',
    'client',
    p_client_id,
    jsonb_build_object(
      'previous_completed_fields', previous_completed_fields,
      'completed_fields', completed_fields,
      'total_fields', 6,
      'ready', ready,
      'cleared', completed_fields = 0
    )
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_workspace_client_ai_sdr_profile_v1(
  UUID, UUID, JSONB, TIMESTAMPTZ, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_client_ai_sdr_profile_v1(
  UUID, UUID, JSONB, TIMESTAMPTZ, UUID, BIGINT
) TO service_role;

COMMENT ON FUNCTION public.update_workspace_client_ai_sdr_profile_v1(
  UUID, UUID, JSONB, TIMESTAMPTZ, UUID, BIGINT
) IS 'Updates the structured, workspace-scoped client AI SDR context with manager authorization, optimistic concurrency, and content-free audit metadata.';

NOTIFY pgrst, 'reload schema';

COMMIT;
