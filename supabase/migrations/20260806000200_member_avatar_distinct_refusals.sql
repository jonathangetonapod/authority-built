-- Say which condition refused the avatar, in words nothing else is listening for.
--
-- Two problems, one cause. The refusal read 'active workspace membership is
-- required', and manage-workspace-staff's error mapper matches
-- "active workspace membership" as a duplicate-invite signal before it ever
-- looks at the error code — so a member failing to set their own picture was
-- told "This email already has workspace access" (STAFF_ACCOUNT_EXISTS). The
-- wording collided with a matcher meant for a different action entirely.
--
-- The second problem is that one message covered five different reasons, so
-- when it did fire there was no way to tell which. Each condition is now
-- checked and named separately, in phrases chosen not to collide with any
-- matcher in that function: no "not found", no "already exists", no
-- "active workspace membership". "Stale" is deliberate — it maps to
-- REAUTHENTICATION_REQUIRED, which is exactly right for a token that predates
-- a revocation.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v3', 0));

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
  membership_status TEXT;
  membership_email TEXT;
  membership_epoch BIGINT;
  current_avatar_path TEXT;
  workspace_status TEXT;
  workspace_epoch BIGINT;
  actor_email TEXT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL OR p_actor_user_id IS NULL OR p_token_issued_at IS NULL THEN
    RAISE EXCEPTION 'workspace_id, actor and token are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:member-avatar:' || p_workspace_id::TEXT || ':' || p_actor_user_id::TEXT, 0)
  );

  SELECT workspace.status, COALESCE(workspace.access_not_before_epoch, 0)
  INTO workspace_status, workspace_epoch
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF workspace_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'avatar workspace is unavailable' USING ERRCODE = '42501';
  END IF;

  -- Located by the authenticated actor, which is what makes it impossible to
  -- set somebody else's picture. FOR UPDATE so two tabs cannot both win.
  SELECT
    membership.status,
    membership.email_normalized,
    COALESCE(membership.workspace_access_not_before_epoch, 0),
    membership.avatar_path
  INTO membership_status, membership_email, membership_epoch, current_avatar_path
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
  FOR UPDATE;

  IF membership_status IS NULL THEN
    RAISE EXCEPTION 'avatar member row is absent for this actor' USING ERRCODE = '42501';
  END IF;

  IF membership_status <> 'active' THEN
    RAISE EXCEPTION 'avatar member is % rather than active', membership_status
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id;

  IF actor_email IS DISTINCT FROM membership_email THEN
    RAISE EXCEPTION 'avatar member identity does not match the signed-in address'
      USING ERRCODE = '42501';
  END IF;

  IF p_token_issued_at < membership_epoch OR p_token_issued_at < workspace_epoch THEN
    RAISE EXCEPTION 'avatar member credential is stale' USING ERRCODE = '42501';
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
