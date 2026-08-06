-- Find the member the way this schema identifies members.
--
-- The lookup matched workspace_memberships on user_id alone, and came back
-- "avatar member row is absent for this actor" for a signed-in owner who
-- plainly has one. In this schema user_id is nullable — it is a link that gets
-- filled in, and ON DELETE SET NULL empties it again — while email_normalized
-- is NOT NULL and carries the invite-by-email identity the whole workspace
-- model is built on. Matching only on the nullable half asks the wrong question.
--
-- So: the actor's address is read from auth.users, which no caller controls,
-- and a membership matches when it is linked to this actor OR when it is
-- unlinked and holds exactly that address. The row is then located once and
-- updated by its own id, so the read and the write cannot disagree.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v4', 0));

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
  membership_id UUID;
  membership_status TEXT;
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

  -- Read from auth.users, so identity is the session's and never the caller's.
  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id;

  IF actor_email IS NULL OR actor_email = '' THEN
    RAISE EXCEPTION 'avatar actor has no verified address' USING ERRCODE = '42501';
  END IF;

  SELECT
    membership.id,
    membership.status,
    COALESCE(membership.workspace_access_not_before_epoch, 0),
    membership.avatar_path
  INTO membership_id, membership_status, membership_epoch, current_avatar_path
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND (
      membership.user_id = p_actor_user_id
      OR (membership.user_id IS NULL AND membership.email_normalized = actor_email)
    )
  ORDER BY (membership.user_id = p_actor_user_id) DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF membership_id IS NULL THEN
    RAISE EXCEPTION 'avatar member row is absent for this actor' USING ERRCODE = '42501';
  END IF;

  IF membership_status <> 'active' THEN
    RAISE EXCEPTION 'avatar member is % rather than active', membership_status
      USING ERRCODE = '42501';
  END IF;

  IF p_token_issued_at < membership_epoch OR p_token_issued_at < workspace_epoch THEN
    RAISE EXCEPTION 'avatar member credential is stale' USING ERRCODE = '42501';
  END IF;

  IF current_avatar_path IS DISTINCT FROM p_expected_avatar_path THEN
    RAISE EXCEPTION 'avatar changed' USING ERRCODE = '40001';
  END IF;

  -- By id, so the row written is exactly the row that was read and locked.
  UPDATE public.workspace_memberships AS membership
  SET
    avatar_path = p_avatar_path,
    avatar_updated_at = CASE WHEN p_avatar_path IS NULL THEN NULL ELSE clock_timestamp() END
  WHERE membership.id = membership_id
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
