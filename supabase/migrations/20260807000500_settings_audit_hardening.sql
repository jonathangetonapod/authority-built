-- Settings surface hardening, from the /app/settings audit.
--
-- Three fixes:
--  1. The member-avatar write is the one action in manage-workspace-staff a
--     non-manager can perform, and it was the ONLY membership write that did
--     not enforce the forced-password-change wall. A staff member created
--     with a temporary password, who signed in but never completed the
--     required change, was refused by every other action yet could still
--     push a 2 MB object into a public bucket. The avatar RPC now rejects an
--     un-cleared provisioning credential like its siblings.
--  2. workspace_memberships.avatar_path had no shape constraint and no
--     avatar_path/avatar_updated_at pairing constraint (the logo column has
--     both). The path is scoped only by an edge template string today; a
--     CHECK makes "<workspace>/<user>/<uuid>.<ext>" the database invariant.
--  3. Both storage buckets carried a bare `FOR SELECT TO public` policy with
--     no path predicate. Public FETCH goes through the /object/public route,
--     which bypasses RLS on a public bucket, so that policy bought nothing
--     for reads — but it let the anon/authenticated LIST api walk the bucket
--     and enumerate every workspace id and every (workspace, member) pair.
--     Removing it blocks enumeration; image loading is unaffected.

BEGIN;

-- 1. Forced-password-change wall on the avatar RPC.
CREATE OR REPLACE FUNCTION public.set_membership_avatar_v1(
  p_workspace_id UUID,
  p_avatar_path TEXT,
  p_expected_avatar_path TEXT,
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
  membership_provisioning TEXT;
  membership_password_change BOOLEAN;
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
    membership.provisioning_method,
    membership.password_change_required,
    membership.avatar_path
  INTO
    membership_id,
    membership_status,
    membership_epoch,
    membership_provisioning,
    membership_password_change,
    current_avatar_path
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND (
      membership.user_id = p_actor_user_id
      OR (membership.user_id IS NULL AND membership.email_normalized = actor_email)
    )
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

  -- The forced-password wall, mirrored from workspace_staff_actor_role_v1: an
  -- account provisioned with a temporary password that has not cleared its
  -- change requirement cannot write, benign as a face change may be.
  IF membership_provisioning = 'admin_temporary_password'
    AND COALESCE(membership_password_change, FALSE) THEN
    RAISE EXCEPTION 'avatar member must finish setting a permanent password first'
      USING ERRCODE = '42501';
  END IF;

  IF current_avatar_path IS DISTINCT FROM p_expected_avatar_path THEN
    RAISE EXCEPTION 'avatar changed' USING ERRCODE = '40001';
  END IF;

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

-- 2. Shape + pairing constraint on the avatar path, matching the logo column.
UPDATE public.workspace_memberships
SET avatar_path = NULL, avatar_updated_at = NULL
WHERE avatar_path IS NOT NULL
  AND avatar_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$';

ALTER TABLE public.workspace_memberships
  DROP CONSTRAINT IF EXISTS workspace_memberships_avatar_state_check;
ALTER TABLE public.workspace_memberships
  ADD CONSTRAINT workspace_memberships_avatar_state_check CHECK (
    (avatar_path IS NULL AND avatar_updated_at IS NULL)
    OR (
      avatar_updated_at IS NOT NULL
      AND avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$'
    )
  );

-- 3. Stop the buckets being enumerable. Public reads use /object/public,
-- which does not consult these policies; only the list/authenticated api did.
DROP POLICY IF EXISTS workspace_logos_public_read ON storage.objects;
DROP POLICY IF EXISTS member_avatars_public_read ON storage.objects;

COMMIT;
