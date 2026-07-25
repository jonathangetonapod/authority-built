-- Workspace-scoped prospect dashboard lifecycle and canonical shortlist.
--
-- The legacy system had three independent creation paths and two competing
-- podcast membership tables. Public reads required AI-analysis rows even when
-- an operator had already curated podcasts into prospect_dashboard_podcasts.
-- This migration makes the curated table authoritative, gives every prospect
-- an owning workspace, and introduces an explicit publish quality gate.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:workspace-prospect-studio-foundation:v1', 0)
);

DO $prospect_studio_prerequisites$
BEGIN
  IF to_regclass('public.workspaces') IS NULL
    OR to_regclass('public.workspace_audit_log') IS NULL
    OR to_regclass('public.prospect_dashboards') IS NULL
    OR to_regclass('public.prospect_dashboard_podcasts') IS NULL
    OR to_regclass('public.prospect_podcast_analyses') IS NULL
    OR to_regclass('public.podcasts') IS NULL
    OR to_regprocedure(
      'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
    ) IS NULL
  THEN
    RAISE EXCEPTION
      'workspace prospect studio requires workspace auth and prospect podcast tables';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.workspaces
    WHERE is_default
  ) <> 1 THEN
    RAISE EXCEPTION 'workspace prospect studio requires exactly one default workspace';
  END IF;
END;
$prospect_studio_prerequisites$;

ALTER TABLE public.prospect_dashboards
  ADD COLUMN IF NOT EXISTS workspace_id UUID,
  ADD COLUMN IF NOT EXISTS prospect_email TEXT,
  ADD COLUMN IF NOT EXISTS prospect_linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS prospect_website TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS build_error TEXT,
  ADD COLUMN IF NOT EXISTS build_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS build_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_engaged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cta_type TEXT NOT NULL DEFAULT 'reply',
  ADD COLUMN IF NOT EXISTS cta_label TEXT NOT NULL DEFAULT 'Reply to this email',
  ADD COLUMN IF NOT EXISTS cta_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.prospect_dashboards AS dashboard
SET workspace_id = workspace.id
FROM public.workspaces AS workspace
WHERE dashboard.workspace_id IS NULL
  AND workspace.is_default;

DO $prospect_dashboard_workspace_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prospect_dashboards'::regclass
      AND conname = 'prospect_dashboards_workspace_id_fkey'
  ) THEN
    ALTER TABLE public.prospect_dashboards
      ADD CONSTRAINT prospect_dashboards_workspace_id_fkey
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$prospect_dashboard_workspace_constraint$;

ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_workspace_id_fkey;

ALTER TABLE public.prospect_dashboards
  ALTER COLUMN workspace_id SET NOT NULL,
  ALTER COLUMN show_pricing_section SET DEFAULT false;

-- The legacy generator enabled a hard-coded platform pricing block on every
-- dashboard. Workspace-owned lead magnets use an explicit CTA by default;
-- an operator can still opt a specific prospect back into pricing.
UPDATE public.prospect_dashboards
SET show_pricing_section = false
WHERE show_pricing_section;

ALTER TABLE public.prospect_dashboards
  DROP CONSTRAINT IF EXISTS prospect_dashboards_lifecycle_status_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_email_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_linkedin_url_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_website_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_cta_type_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_cta_url_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_cta_label_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboards_publication_state_check;

ALTER TABLE public.prospect_dashboards
  ADD CONSTRAINT prospect_dashboards_lifecycle_status_check CHECK (
    lifecycle_status IN (
      'draft',
      'researching',
      'matching',
      'analyzing',
      'review',
      'ready',
      'sent',
      'viewed',
      'engaged',
      'converted',
      'failed',
      'archived'
    )
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_email_check CHECK (
    prospect_email IS NULL
    OR (
      prospect_email = lower(btrim(prospect_email))
      AND prospect_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_linkedin_url_check CHECK (
    prospect_linkedin_url IS NULL
    OR prospect_linkedin_url ~ '^https?://[^[:space:]]+$'
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_website_check CHECK (
    prospect_website IS NULL
    OR prospect_website ~ '^https?://[^[:space:]]+$'
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_cta_type_check CHECK (
    cta_type IN ('reply', 'book_call', 'learn_more', 'none')
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_cta_url_check CHECK (
    cta_url IS NULL OR cta_url ~ '^https?://[^[:space:]]+$'
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_cta_label_check CHECK (
    cta_label = btrim(cta_label)
    AND char_length(cta_label) BETWEEN 1 AND 80
    AND cta_label !~ '[[:cntrl:]]'
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboards_publication_state_check CHECK (
    published_at IS NULL
    OR (
      is_active
      AND content_ready
      AND lifecycle_status IN (
        'ready', 'sent', 'viewed', 'engaged', 'converted'
      )
    )
  ) NOT VALID;

ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_lifecycle_status_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_email_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_linkedin_url_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_website_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_cta_type_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_cta_url_check;
ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_cta_label_check;

CREATE INDEX IF NOT EXISTS prospect_dashboards_workspace_created_idx
  ON public.prospect_dashboards(workspace_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS prospect_dashboards_workspace_lifecycle_idx
  ON public.prospect_dashboards(workspace_id, lifecycle_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS prospect_dashboards_publication_idx
  ON public.prospect_dashboards(slug)
  WHERE is_active AND content_ready AND published_at IS NOT NULL;

ALTER TABLE public.prospect_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order INTEGER,
  ADD COLUMN IF NOT EXISTS operator_notes TEXT,
  ADD COLUMN IF NOT EXISTS relevance_score NUMERIC,
  ADD COLUMN IF NOT EXISTS relevance_reason TEXT,
  ADD COLUMN IF NOT EXISTS match_source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;

ALTER TABLE public.prospect_dashboard_podcasts
  DROP CONSTRAINT IF EXISTS prospect_dashboard_podcasts_visibility_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboard_podcasts_featured_order_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboard_podcasts_relevance_score_check,
  DROP CONSTRAINT IF EXISTS prospect_dashboard_podcasts_match_source_check;

ALTER TABLE public.prospect_dashboard_podcasts
  ADD CONSTRAINT prospect_dashboard_podcasts_visibility_check CHECK (
    visibility IN ('visible', 'archived')
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboard_podcasts_featured_order_check CHECK (
    featured_order IS NULL OR featured_order >= 0
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboard_podcasts_relevance_score_check CHECK (
    relevance_score IS NULL OR relevance_score BETWEEN 0 AND 10
  ) NOT VALID,
  ADD CONSTRAINT prospect_dashboard_podcasts_match_source_check CHECK (
    match_source IN ('legacy', 'sheet', 'manual', 'semantic', 'ai_ranked')
  ) NOT VALID;

ALTER TABLE public.prospect_dashboard_podcasts
  VALIDATE CONSTRAINT prospect_dashboard_podcasts_visibility_check;
ALTER TABLE public.prospect_dashboard_podcasts
  VALIDATE CONSTRAINT prospect_dashboard_podcasts_featured_order_check;
ALTER TABLE public.prospect_dashboard_podcasts
  VALIDATE CONSTRAINT prospect_dashboard_podcasts_relevance_score_check;
ALTER TABLE public.prospect_dashboard_podcasts
  VALIDATE CONSTRAINT prospect_dashboard_podcasts_match_source_check;

-- Materialize normalized analyses into the authoritative curated list. This
-- preserves every existing analyzed podcast while allowing AI fields to be
-- optional for an otherwise useful shortlist card.
INSERT INTO public.prospect_dashboard_podcasts (
  prospect_dashboard_id,
  podcast_id,
  podcast_name,
  podcast_description,
  podcast_image_url,
  podcast_url,
  publisher_name,
  itunes_rating,
  episode_count,
  audience_size,
  podcast_categories,
  last_posted_at,
  ai_clean_description,
  ai_fit_reasons,
  ai_pitch_angles,
  ai_analyzed_at,
  visibility,
  match_source
)
SELECT
  analysis.prospect_dashboard_id,
  podcast.podscan_id,
  podcast.podcast_name,
  podcast.podcast_description,
  podcast.podcast_image_url,
  podcast.podcast_url,
  podcast.publisher_name,
  podcast.itunes_rating,
  podcast.episode_count,
  podcast.audience_size,
  podcast.podcast_categories,
  podcast.last_posted_at,
  analysis.ai_clean_description,
  analysis.ai_fit_reasons,
  analysis.ai_pitch_angles,
  analysis.ai_analyzed_at,
  'visible',
  'legacy'
FROM public.prospect_podcast_analyses AS analysis
JOIN public.podcasts AS podcast
  ON podcast.id = analysis.podcast_id
ON CONFLICT (prospect_dashboard_id, podcast_id) DO UPDATE
SET
  ai_clean_description = COALESCE(
    EXCLUDED.ai_clean_description,
    prospect_dashboard_podcasts.ai_clean_description
  ),
  ai_fit_reasons = COALESCE(
    EXCLUDED.ai_fit_reasons,
    prospect_dashboard_podcasts.ai_fit_reasons
  ),
  ai_pitch_angles = COALESCE(
    EXCLUDED.ai_pitch_angles,
    prospect_dashboard_podcasts.ai_pitch_angles
  ),
  ai_analyzed_at = COALESCE(
    EXCLUDED.ai_analyzed_at,
    prospect_dashboard_podcasts.ai_analyzed_at
  ),
  updated_at = now();

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY prospect_dashboard_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) - 1 AS next_display_order
  FROM public.prospect_dashboard_podcasts
)
UPDATE public.prospect_dashboard_podcasts AS shortlist
SET display_order = ranked.next_display_order
FROM ranked
WHERE shortlist.id = ranked.id;

CREATE INDEX IF NOT EXISTS prospect_dashboard_podcasts_public_order_idx
  ON public.prospect_dashboard_podcasts(
    prospect_dashboard_id,
    visibility,
    is_featured DESC,
    featured_order,
    display_order,
    id
  );
CREATE INDEX IF NOT EXISTS prospect_dashboard_podcasts_readiness_idx
  ON public.prospect_dashboard_podcasts(prospect_dashboard_id, visibility)
  WHERE visibility = 'visible';

-- The public app reads through Edge functions with the service role. Direct
-- anonymous table reads would bypass publication and shortlist visibility.
DROP POLICY IF EXISTS "Public can view active prospect dashboards"
  ON public.prospect_dashboards;
DROP POLICY IF EXISTS "Public read access for prospect_dashboard_podcasts"
  ON public.prospect_dashboard_podcasts;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_dashboards FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_dashboard_podcasts FROM anon;
DROP POLICY IF EXISTS "Authenticated users can read prospect podcast analyses"
  ON public.prospect_podcast_analyses;
CREATE POLICY prospect_podcast_analyses_platform_admin_select
  ON public.prospect_podcast_analyses
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
REVOKE ALL PRIVILEGES ON TABLE public.prospect_podcast_analyses FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.prospect_podcasts_with_analyses FROM anon;

-- Preserve only legacy dashboards that already satisfy the same quality bar
-- as a new publication. Everything else moves to review for safe backfill.
WITH shortlist_counts AS (
  SELECT
    dashboard.id,
    COUNT(shortlist.id) FILTER (
      WHERE shortlist.visibility = 'visible'
    ) AS visible_count,
    COUNT(shortlist.id) FILTER (
      WHERE shortlist.visibility = 'visible'
        AND (
          NULLIF(btrim(shortlist.relevance_reason), '') IS NOT NULL
          OR (
            jsonb_typeof(shortlist.ai_fit_reasons) = 'array'
            AND jsonb_array_length(shortlist.ai_fit_reasons) > 0
          )
        )
    ) AS analyzed_count
  FROM public.prospect_dashboards AS dashboard
  LEFT JOIN public.prospect_dashboard_podcasts AS shortlist
    ON shortlist.prospect_dashboard_id = dashboard.id
  GROUP BY dashboard.id
)
INSERT INTO public.workspace_audit_log (
  workspace_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  metadata
)
SELECT
  dashboard.workspace_id,
  NULL,
  'workspace.prospect.legacy_publication_quarantined',
  'prospect_dashboard',
  dashboard.id,
  jsonb_build_object(
    'slug', dashboard.slug,
    'visible_count', shortlist_counts.visible_count,
    'analyzed_count', shortlist_counts.analyzed_count,
    'profile_characters', char_length(COALESCE(btrim(dashboard.prospect_bio), '')),
    'view_count', COALESCE(dashboard.view_count, 0)
  )
FROM public.prospect_dashboards AS dashboard
JOIN shortlist_counts ON shortlist_counts.id = dashboard.id
WHERE dashboard.is_active
  AND dashboard.content_ready
  AND NOT (
    char_length(COALESCE(btrim(dashboard.prospect_bio), '')) >= 80
    AND shortlist_counts.visible_count >= 5
    AND shortlist_counts.analyzed_count >= 5
  );

WITH shortlist_counts AS (
  SELECT
    dashboard.id,
    COUNT(shortlist.id) FILTER (
      WHERE shortlist.visibility = 'visible'
    ) AS visible_count,
    COUNT(shortlist.id) FILTER (
      WHERE shortlist.visibility = 'visible'
        AND (
          NULLIF(btrim(shortlist.relevance_reason), '') IS NOT NULL
          OR (
            jsonb_typeof(shortlist.ai_fit_reasons) = 'array'
            AND jsonb_array_length(shortlist.ai_fit_reasons) > 0
          )
        )
    ) AS analyzed_count
  FROM public.prospect_dashboards AS dashboard
  LEFT JOIN public.prospect_dashboard_podcasts AS shortlist
    ON shortlist.prospect_dashboard_id = dashboard.id
  GROUP BY dashboard.id
)
UPDATE public.prospect_dashboards AS dashboard
SET
  lifecycle_status = CASE
    WHEN NOT dashboard.is_active THEN 'archived'
    WHEN dashboard.content_ready
      AND char_length(COALESCE(btrim(dashboard.prospect_bio), '')) >= 80
      AND shortlist_counts.visible_count >= 5
      AND shortlist_counts.analyzed_count >= 5
    THEN 'ready'
    WHEN dashboard.content_ready THEN 'review'
    ELSE 'draft'
  END,
  published_at = CASE
    WHEN dashboard.is_active
      AND dashboard.content_ready
      AND char_length(COALESCE(btrim(dashboard.prospect_bio), '')) >= 80
      AND shortlist_counts.visible_count >= 5
      AND shortlist_counts.analyzed_count >= 5
    THEN COALESCE(dashboard.last_viewed_at, dashboard.created_at, now())
    ELSE NULL
  END,
  content_ready = dashboard.is_active
    AND dashboard.content_ready
    AND char_length(COALESCE(btrim(dashboard.prospect_bio), '')) >= 80
    AND shortlist_counts.visible_count >= 5
    AND shortlist_counts.analyzed_count >= 5,
  updated_at = now()
FROM shortlist_counts
WHERE dashboard.id = shortlist_counts.id;

ALTER TABLE public.prospect_dashboards
  VALIDATE CONSTRAINT prospect_dashboards_publication_state_check;

CREATE OR REPLACE FUNCTION public.assign_prospect_dashboard_workspace_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := public.current_workspace_id();
  END IF;

  IF NEW.workspace_id IS NULL THEN
    SELECT workspace.id
    INTO NEW.workspace_id
    FROM public.workspaces AS workspace
    WHERE workspace.is_default;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required for prospect dashboards'
      USING ERRCODE = '23502';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_prospect_dashboard_workspace_v1()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS prospect_dashboards_assign_workspace
  ON public.prospect_dashboards;
CREATE TRIGGER prospect_dashboards_assign_workspace
  BEFORE INSERT ON public.prospect_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_prospect_dashboard_workspace_v1();

DROP TRIGGER IF EXISTS prospect_dashboards_touch_updated_at
  ON public.prospect_dashboards;
CREATE TRIGGER prospect_dashboards_touch_updated_at
  BEFORE UPDATE ON public.prospect_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_touch_updated_at();

CREATE OR REPLACE FUNCTION public.prospect_dashboard_readiness_v1(
  p_dashboard_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH dashboard AS (
    SELECT
      id,
      NULLIF(btrim(prospect_name), '') IS NOT NULL
        AND char_length(COALESCE(btrim(prospect_bio), '')) >= 80
        AS profile_ready,
      cta_type,
      cta_url
    FROM public.prospect_dashboards
    WHERE id = p_dashboard_id
  ),
  shortlist AS (
    SELECT
      COUNT(*) FILTER (WHERE visibility = 'visible') AS visible_count,
      COUNT(*) FILTER (
        WHERE visibility = 'visible'
          AND (
            NULLIF(btrim(relevance_reason), '') IS NOT NULL
            OR (
              jsonb_typeof(ai_fit_reasons) = 'array'
              AND jsonb_array_length(ai_fit_reasons) > 0
            )
          )
      ) AS analyzed_count,
      COUNT(*) FILTER (
        WHERE visibility = 'visible' AND is_featured
      ) AS featured_count
    FROM public.prospect_dashboard_podcasts
    WHERE prospect_dashboard_id = p_dashboard_id
  )
  SELECT jsonb_build_object(
    'profile_ready', dashboard.profile_ready,
    'visible_count', shortlist.visible_count,
    'analyzed_count', shortlist.analyzed_count,
    'featured_count', shortlist.featured_count,
    'cta_ready', CASE
      WHEN dashboard.cta_type IN ('book_call', 'learn_more')
        THEN dashboard.cta_url IS NOT NULL
      ELSE true
    END,
    'publishable',
      dashboard.profile_ready
      AND shortlist.visible_count >= 5
      AND shortlist.analyzed_count >= 5
      AND CASE
        WHEN dashboard.cta_type IN ('book_call', 'learn_more')
          THEN dashboard.cta_url IS NOT NULL
        ELSE true
      END
  )
  FROM dashboard
  CROSS JOIN shortlist;
$$;

REVOKE ALL ON FUNCTION public.prospect_dashboard_readiness_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prospect_dashboard_readiness_v1(UUID)
  TO service_role;

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

CREATE OR REPLACE FUNCTION public.reorder_prospect_shortlist_featured_v1(
  p_dashboard_id UUID,
  p_podcast_ids TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_count INTEGER := COALESCE(cardinality(p_podcast_ids), 0);
  distinct_count INTEGER := 0;
BEGIN
  IF p_dashboard_id IS NULL OR requested_count > 6 THEN
    RAISE EXCEPTION 'invalid featured prospect shortlist request';
  END IF;

  SELECT COUNT(DISTINCT podcast_id)
  INTO distinct_count
  FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) AS requested(podcast_id);

  IF distinct_count <> requested_count THEN
    RAISE EXCEPTION 'featured prospect shortlist contains duplicate podcasts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) AS requested(podcast_id)
    LEFT JOIN public.prospect_dashboard_podcasts AS shortlist
      ON shortlist.prospect_dashboard_id = p_dashboard_id
      AND shortlist.podcast_id = requested.podcast_id
      AND shortlist.visibility = 'visible'
    WHERE shortlist.id IS NULL
  ) THEN
    RAISE EXCEPTION 'featured prospect shortlist contains an unavailable podcast';
  END IF;

  UPDATE public.prospect_dashboard_podcasts
  SET
    is_featured = false,
    featured_order = NULL,
    updated_at = now()
  WHERE prospect_dashboard_id = p_dashboard_id
    AND is_featured;

  UPDATE public.prospect_dashboard_podcasts AS shortlist
  SET
    is_featured = true,
    featured_order = requested.ordinality - 1,
    updated_at = now()
  FROM unnest(COALESCE(p_podcast_ids, ARRAY[]::TEXT[])) WITH ORDINALITY
    AS requested(podcast_id, ordinality)
  WHERE shortlist.prospect_dashboard_id = p_dashboard_id
    AND shortlist.podcast_id = requested.podcast_id
    AND shortlist.visibility = 'visible';

  RETURN requested_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_prospect_shortlist_featured_v1(
  UUID, TEXT[]
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_prospect_shortlist_featured_v1(
  UUID, TEXT[]
) TO service_role;

CREATE OR REPLACE FUNCTION public.record_public_prospect_dashboard_view(
  p_dashboard_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.prospect_dashboards
  SET
    view_count = COALESCE(view_count, 0) + 1,
    last_viewed_at = now(),
    lifecycle_status = CASE
      WHEN lifecycle_status IN ('ready', 'sent') THEN 'viewed'
      ELSE lifecycle_status
    END
  WHERE id = p_dashboard_id
    AND is_active
    AND content_ready
    AND published_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_public_prospect_dashboard_view(UUID)
  TO service_role;

COMMENT ON COLUMN public.prospect_dashboards.workspace_id IS
  'Owning tenant workspace for prospect creation, curation, and conversion.';
COMMENT ON COLUMN public.prospect_dashboards.lifecycle_status IS
  'Server-owned prospect build and engagement lifecycle.';
COMMENT ON TABLE public.prospect_dashboard_podcasts IS
  'Canonical curated podcast shortlist for a prospect dashboard; AI enrichment is optional.';
COMMENT ON FUNCTION public.prospect_dashboard_readiness_v1(UUID) IS
  'Returns the server-owned profile, shortlist, enrichment, CTA, and publication quality gate.';
COMMENT ON FUNCTION public.set_workspace_prospect_publication_v1(
  UUID, UUID, BOOLEAN, UUID, BIGINT
) IS
  'Publishes or unpublishes a workspace prospect only after manager authorization and readiness validation.';

NOTIFY pgrst, 'reload schema';

COMMIT;
