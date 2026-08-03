-- Deleting a workspace, with a way back for thirty days.
--
-- Access is revoked the moment it is marked, because can_access_workspace
-- already requires status = 'active' and every tenant policy is written on top
-- of it — so a new status revokes the whole tenant without a single new gate.
-- The token epoch is bumped in the same statement, so sessions already issued
-- stop working too rather than lasting until they expire.
--
-- The data itself waits. Almost every delete request that is regretted is
-- regretted within the hour, and a purge that runs immediately has no answer
-- for that. The row carries the date it becomes unrecoverable, and the purge
-- reads that date rather than deciding for itself.
--
-- What this does NOT do is settle anything outside this database. Stripe, the
-- domain providers and Instantly all hold state keyed by ids that live on these
-- rows, so the edge function tears those down BEFORE calling this — once the
-- rows are gone there is nothing left to look the identifiers up from.

BEGIN;

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_status_check;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_status_check
  CHECK (status IN ('active', 'suspended', 'archived', 'deleted'));

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- The moment this stops being recoverable. The purge reads it; nothing else
  -- decides how long the window is.
  ADD COLUMN IF NOT EXISTS purge_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT
    CHECK (deletion_reason IS NULL OR char_length(deletion_reason) <= 500);

-- The purge tick asks one question — what is due — so it gets an index for it.
CREATE INDEX IF NOT EXISTS workspaces_purge_after_idx
  ON public.workspaces (purge_after)
  WHERE status = 'deleted';

COMMENT ON COLUMN public.workspaces.purge_after IS
  'When a deleted workspace stops being recoverable. Read by the purge; never inferred elsewhere.';

-- ---------------------------------------------------------------------------
-- Marking a workspace deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.begin_workspace_deletion_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_reason TEXT,
  p_grace_days INTEGER DEFAULT 30
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  workspace public.workspaces%ROWTYPE;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'A workspace is required';
  END IF;

  IF p_grace_days IS NULL OR p_grace_days < 0 OR p_grace_days > 365 THEN
    RAISE EXCEPTION 'The grace period must be between 0 and 365 days';
  END IF;

  SELECT *
  INTO workspace
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  -- The default workspace is the platform's own. Deleting it would take the
  -- operator's access with it, and no confirmation dialog makes that a thing
  -- someone meant to do.
  IF workspace.is_default THEN
    RAISE EXCEPTION 'The default workspace cannot be deleted';
  END IF;

  IF workspace.status = 'deleted' THEN
    -- Already marked. Returning it unchanged keeps a retry from moving the
    -- purge date further out every time it is pressed.
    RETURN workspace;
  END IF;

  UPDATE public.workspaces
  SET
    status = 'deleted',
    deleted_at = now(),
    deleted_by = p_actor_user_id,
    purge_after = now() + make_interval(days => p_grace_days),
    deletion_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
    -- Sessions already issued stop working now, not when they expire.
    access_not_before_epoch = GREATEST(
      access_not_before_epoch,
      floor(extract(epoch FROM now()))::BIGINT
    ),
    updated_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO workspace;

  RETURN workspace;
END;
$$;

-- ---------------------------------------------------------------------------
-- The way back, for as long as there is one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_workspace_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID
)
RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  workspace public.workspaces%ROWTYPE;
BEGIN
  SELECT *
  INTO workspace
  FROM public.workspaces
  WHERE id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;

  IF workspace.status <> 'deleted' THEN
    RAISE EXCEPTION 'Only a deleted workspace can be restored';
  END IF;

  -- Past the date the row itself carries, the answer is no. The subscription
  -- and the sending accounts were torn down when it was marked, so a workspace
  -- restored after that window would come back without the things that made it
  -- work, which is worse than a clean refusal.
  IF workspace.purge_after IS NOT NULL AND workspace.purge_after <= now() THEN
    RAISE EXCEPTION 'This workspace is past its recovery window';
  END IF;

  UPDATE public.workspaces
  SET
    status = 'active',
    deleted_at = NULL,
    deleted_by = NULL,
    purge_after = NULL,
    deletion_reason = NULL,
    updated_at = now()
  WHERE id = p_workspace_id
  RETURNING * INTO workspace;

  RETURN workspace;
END;
$$;

-- ---------------------------------------------------------------------------
-- The purge. Returns what it removed so the caller can clean up the accounts
-- that live outside this database.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_workspaces_v1(
  p_limit INTEGER DEFAULT 25
)
RETURNS TABLE (workspace_id UUID, workspace_name TEXT, member_user_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  due UUID[];
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'A sensible batch size is required';
  END IF;

  -- Claimed with SKIP LOCKED so two ticks running at once purge different
  -- workspaces instead of waiting on each other.
  SELECT array_agg(id)
  INTO due
  FROM (
    SELECT id
    FROM public.workspaces
    WHERE status = 'deleted'
      AND purge_after IS NOT NULL
      AND purge_after <= now()
    ORDER BY purge_after
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) AS claimed;

  IF due IS NULL THEN
    RETURN;
  END IF;

  -- Read the members out before the cascade takes the membership rows: the
  -- caller needs these ids to delete the Auth users, and after the delete
  -- there is nothing left to read them from.
  RETURN QUERY
  WITH members AS (
    SELECT
      membership.workspace_id AS ws_id,
      array_remove(array_agg(membership.user_id), NULL) AS user_ids
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = ANY(due)
    GROUP BY membership.workspace_id
  ),
  doomed AS (
    SELECT workspace.id, workspace.name
    FROM public.workspaces AS workspace
    WHERE workspace.id = ANY(due)
  ),
  removed AS (
    DELETE FROM public.workspaces
    WHERE id = ANY(due)
    RETURNING id
  )
  SELECT
    doomed.id,
    doomed.name,
    COALESCE(members.user_ids, ARRAY[]::UUID[])
  FROM doomed
  LEFT JOIN members ON members.ws_id = doomed.id
  WHERE doomed.id IN (SELECT id FROM removed);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_workspace_deletion_v1(UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_workspace_v1(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_workspaces_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_workspace_deletion_v1(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_workspace_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_workspaces_v1(INTEGER) TO service_role;

COMMENT ON FUNCTION public.begin_workspace_deletion_v1(UUID, UUID, TEXT, INTEGER) IS
  'Service-only: revoke a workspace immediately and set the date its data stops being recoverable.';
COMMENT ON FUNCTION public.restore_workspace_v1(UUID, UUID) IS
  'Service-only: undo a deletion inside its recovery window.';
COMMENT ON FUNCTION public.purge_expired_workspaces_v1(INTEGER) IS
  'Service-only: hard-delete workspaces past their recovery window, returning members so Auth users can be removed.';

COMMIT;
