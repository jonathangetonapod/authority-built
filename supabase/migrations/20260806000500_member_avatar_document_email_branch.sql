-- Say what the unlinked-by-email branch is actually for.
--
-- Behaviour is unchanged. This corrects the record, because the branch reads as
-- dead code and is one careless reading away from being deleted.
--
-- 20260806000300 added it believing it was the reason a signed-in owner was told
-- "avatar member row is absent for this actor". It was not: that refusal came
-- from a screen offering the control on a workspace where the actor genuinely
-- held no membership, fixed in the frontend. The branch cannot have been the
-- cause, because workspace_memberships carries
--
--   CHECK (status NOT IN ('active', 'suspended') OR user_id IS NOT NULL)
--
-- so an active row always has user_id, and a branch that only matches
-- user_id IS NULL can never produce one. It can never reach the UPDATE.
--
-- It still earns its place, on the refusal path. These avatar actions carry no
-- requireWorkspaceFeatureAccess gate in the edge function — setting your own
-- picture is not staff management, so this function is the whole gate — which
-- means somebody holding only an invited or provisioning row, user_id still
-- null, reaches this lookup. With the branch they are told their membership is
-- invited rather than active, which is true. Without it they would be told no
-- row exists for them, which is false, and would send anybody debugging it
-- looking for a missing row that is sitting right there.
--
-- So: do not delete this as dead code. It is dead on the success path by
-- construction, and load-bearing on the failure path.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v6', 0));

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
      -- Never an active row: the live-user CHECK guarantees an active row has a
      -- user_id, so this half only ever matches invited or provisioning rows,
      -- and only to name their real state below. See this migration's header.
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

COMMENT ON FUNCTION public.set_membership_avatar_v1(UUID, TEXT, TEXT, UUID, BIGINT) IS
  'Sets the calling actor''s own membership avatar. Takes no member id: the row is located by the authenticated actor, so no caller can nominate somebody else''s membership. This is the whole authorization gate for the avatar actions, which carry no workspace feature-access check. The unlinked-by-email branch of the lookup can never match an active row (the live-user CHECK guarantees active rows have a user_id) and exists so an invited or provisioning member is told their real state instead of being told no row exists.';

REVOKE ALL ON FUNCTION public.set_membership_avatar_v1(UUID, TEXT, TEXT, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_membership_avatar_v1(UUID, TEXT, TEXT, UUID, BIGINT)
  TO service_role;

COMMIT;
