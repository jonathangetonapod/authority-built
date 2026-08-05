-- A member's own picture, shown beside their name in the workspace sidebar.
--
-- The account block at the foot of the sidebar has always drawn a generic
-- person icon. The workspace already has a logo; the person using it had no
-- face. This is deliberately per-membership rather than per-user: the same
-- person can belong to two workspaces, and the picture they present to their
-- own agency is not necessarily the one they present to another.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:member-avatar:v1', 0));

DO $member_avatar_prerequisites$
BEGIN
  IF to_regclass('public.workspace_memberships') IS NULL
    OR to_regclass('storage.buckets') IS NULL
    OR to_regprocedure(
      'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
    ) IS NULL
  THEN
    RAISE EXCEPTION 'member avatars require workspace memberships and staff auth';
  END IF;
END;
$member_avatar_prerequisites$;

ALTER TABLE public.workspace_memberships
  ADD COLUMN IF NOT EXISTS avatar_path TEXT,
  ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_memberships.avatar_path IS
  'Object path inside the member-avatars bucket. NULL means the initials fallback is used.';

-- Public-read like workspace logos: the file is only ever reachable by its
-- unguessable path, and the sidebar has to render it without a signed request
-- on every paint.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'member-avatars',
  'member-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS member_avatars_public_read ON storage.objects;
CREATE POLICY member_avatars_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'member-avatars');

/*
 * Sets the caller's own avatar, and only their own. Unlike the workspace logo
 * this is not a manager action — every active member owns their picture — so
 * the guard is "an active membership for this actor" rather than a role check,
 * and the row is located by actor rather than by any id the caller supplies.
 */
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
  IF p_workspace_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id and actor are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:member-avatar:' || p_workspace_id::TEXT || ':' || p_actor_user_id::TEXT, 0)
  );

  -- Raises when the membership is missing, inactive, or the token predates a
  -- credential change, exactly as it does for every other staff action.
  PERFORM public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  SELECT membership.avatar_path
  INTO current_avatar_path
  FROM public.workspace_memberships AS membership
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found' USING ERRCODE = 'P0002';
  END IF;

  -- Optimistic check, so two tabs cannot leave an orphaned object behind.
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
