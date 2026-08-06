-- Prefer the membership that is live when a person has more than one row here.
--
-- The lookup ordered only by whether the row is linked to this actor, which is
-- a tie whenever two rows are. Two rows legitimately can be: revocation leaves
-- user_id in place, and the live-only unique indexes exclude 'revoked' on
-- purpose, so a revoked row and an active row for the same person in the same
-- workspace coexist as soon as somebody is revoked and re-invited.
--
-- Postgres does not promise which side of a tie LIMIT 1 returns, so setting a
-- picture would intermittently refuse with "avatar member is revoked rather
-- than active" — about a row the member no longer uses, while their active one
-- sat beside it. Ordering by liveness first settles it.
--
-- The status check stays. It is still the right answer when the only row this
-- actor has really is not active, and it now speaks about the best row rather
-- than an arbitrary one.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v5', 0));

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
  -- Liveness first: a revoked row and an active row for the same person in the
  -- same workspace are both "linked to this actor", and without this the tie
  -- between them is resolved arbitrarily.
  ORDER BY
    (membership.status = 'active') DESC,
    (membership.user_id = p_actor_user_id) DESC NULLS LAST,
    membership.id
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
