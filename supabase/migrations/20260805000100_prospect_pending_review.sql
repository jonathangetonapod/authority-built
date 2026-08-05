-- Separate "an operator should look at this" from "the prospect can read this".
--
-- Publication was doing both jobs. Editing a profile or adding a podcast to a
-- live dashboard set published_at to NULL, which is how the studio recorded
-- that the change had not been reviewed — and also how the public page decided
-- to stop serving. A link already sitting in somebody's inbox went dead because
-- their shortlist got better.
--
-- pending_review_at carries the review half on its own. Publication now only
-- ever means what the reader sees.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:prospect-pending-review:v1', 0)
);

DO $prospect_pending_review_prerequisites$
BEGIN
  IF to_regclass('public.prospect_dashboards') IS NULL
    OR to_regprocedure(
      'public.set_workspace_prospect_publication_v1(uuid,uuid,boolean,uuid,bigint)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'prospect pending review requires the workspace prospect studio foundation';
  END IF;
END;
$prospect_pending_review_prerequisites$;

ALTER TABLE public.prospect_dashboards
  ADD COLUMN IF NOT EXISTS pending_review_at TIMESTAMPTZ;

COMMENT ON COLUMN public.prospect_dashboards.pending_review_at IS
  'When an unreviewed change was made to a published dashboard. NULL means nothing is waiting on an operator. Independent of published_at, which governs only what the public page serves.';

CREATE INDEX IF NOT EXISTS prospect_dashboards_pending_review_idx
  ON public.prospect_dashboards (workspace_id, pending_review_at)
  WHERE pending_review_at IS NOT NULL;

-- Publishing is the operator saying they are happy with what is live, so it
-- clears the marker. Unpublishing deliberately does not: the changes are still
-- unreviewed, and the studio should keep saying so.
CREATE OR REPLACE FUNCTION public.set_workspace_prospect_publication_v1(
  p_workspace_id UUID,
  p_dashboard_id UUID,
  p_publish BOOLEAN,
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
  readiness JSONB;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_dashboard_id IS NULL
    OR p_publish IS NULL
  THEN
    RAISE EXCEPTION 'invalid prospect publication request'
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

  PERFORM 1
  FROM public.prospect_dashboards AS dashboard
  WHERE dashboard.id = p_dashboard_id
    AND dashboard.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prospect dashboard not found'
      USING ERRCODE = 'P0002';
  END IF;

  readiness := public.prospect_dashboard_readiness_v1(p_dashboard_id);

  IF p_publish AND COALESCE((readiness ->> 'publishable')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'prospect dashboard is not ready'
      USING ERRCODE = '23514', DETAIL = readiness::TEXT;
  END IF;

  UPDATE public.prospect_dashboards AS dashboard
  SET
    lifecycle_status = CASE
      WHEN p_publish THEN CASE
        WHEN dashboard.lifecycle_status IN (
          'sent', 'viewed', 'engaged', 'converted'
        ) THEN dashboard.lifecycle_status
        ELSE 'ready'
      END
      ELSE 'review'
    END,
    is_active = true,
    content_ready = p_publish,
    published_at = CASE
      WHEN p_publish THEN COALESCE(dashboard.published_at, clock_timestamp())
      ELSE NULL
    END,
    pending_review_at = CASE WHEN p_publish THEN NULL ELSE dashboard.pending_review_at END,
    build_error = CASE WHEN p_publish THEN NULL ELSE dashboard.build_error END
  WHERE dashboard.id = p_dashboard_id
    AND dashboard.workspace_id = p_workspace_id
  RETURNING jsonb_build_object(
    'id', dashboard.id,
    'workspace_id', dashboard.workspace_id,
    'slug', dashboard.slug,
    'lifecycle_status', dashboard.lifecycle_status,
    'content_ready', dashboard.content_ready,
    'published_at', dashboard.published_at,
    'pending_review_at', dashboard.pending_review_at,
    'updated_at', dashboard.updated_at,
    'readiness', readiness
  )
  INTO result;

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
    CASE
      WHEN p_publish THEN 'workspace.prospect.published'
      ELSE 'workspace.prospect.unpublished'
    END,
    'prospect_dashboard',
    p_dashboard_id,
    jsonb_build_object('readiness', readiness)
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_prospect_publication_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_prospect_publication_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) TO service_role;

COMMIT;
