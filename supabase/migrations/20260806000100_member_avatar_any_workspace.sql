-- A member's avatar works on the default workspace too.
--
-- set_membership_avatar_v1 borrowed workspace_staff_actor_role_v1 as its guard,
-- and that helper exists to authorize staff management of a PRIVATE workspace:
-- it raises "private workspace not found" the moment the target is the default
-- one. The platform's own workspace is the default one, so every attempt there
-- came back as STAFF_NOT_FOUND — a member could not set their own picture on
-- the only workspace most of this platform's own people belong to.
--
-- The guard was also more than this needs. Setting your own picture is not a
-- staff-management action; the question is only whether the caller is an active
-- member of this workspace holding a credential newer than both revocation
-- epochs. That is answered by the membership row itself, on any workspace.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v2', 0));

DO $member_avatar_v2_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.set_membership_avatar_v1(uuid,text,text,uuid,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION 'member avatar function is missing';
  END IF;
END;
$member_avatar_v2_prerequisites$;

CREATE OR REPLACE FUNCTION public.set_membership_avatar_v1(
  p_workspace_id UUID,
  p_expected_avatar_path TEXT,
  p_avatar_path TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_avatar_path TEXT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_actor_user_id IS NULL OR p_token_issued_at IS NULL THEN
    RAISE EXCEPTION 'workspace_id, actor and token are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:member-avatar:' || p_workspace_id::TEXT || ':' || p_actor_user_id::TEXT, 0)
  );

  /*
   * One lookup does the whole job: the row exists, it belongs to this actor in
   * this workspace, the membership is active, the workspace is active, and the
   * token predates neither revocation epoch. Locating by actor rather than by
   * any caller-supplied id is what makes it impossible to set somebody else's
   * picture, and the email match is carried over from the staff guard so a
   * membership whose address has moved on cannot be driven by a stale account.
   */
  SELECT membership.avatar_path
  INTO current_avatar_path
  FROM public.workspace_memberships AS membership
  JOIN public.workspaces AS workspace
    ON workspace.id = membership.workspace_id
    AND workspace.status = 'active'
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.status = 'active'
    AND p_token_issued_at >= COALESCE(membership.workspace_access_not_before_epoch, 0)
    AND p_token_issued_at >= COALESCE(workspace.access_not_before_epoch, 0)
  FOR UPDATE OF membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active workspace membership is required' USING ERRCODE = '42501';
  END IF;

  IF current_avatar_path IS DISTINCT FROM p_expected_avatar_path THEN
    RAISE EXCEPTION 'avatar changed' USING ERRCODE = '40001';
  END IF;

  UPDATE public.workspace_memberships AS membership
  SET
    avatar_path = p_avatar_path,
    avatar_updated_at = CASE WHEN p_avatar_path IS NULL THEN NULL ELSE clock_timestamp() END
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
  RETURNING jsonb_build_object(
    'workspace_id', membership.workspace_id,
    'avatar_path', membership.avatar_path,
    'avatar_updated_at', membership.avatar_updated_at
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_membership_avatar_v1(UUID, TEXT, TEXT, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_membership_avatar_v1(UUID, TEXT, TEXT, UUID, BIGINT)
  TO service_role;

COMMIT;
