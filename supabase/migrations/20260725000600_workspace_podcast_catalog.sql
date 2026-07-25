-- Workspace-facing read model for the shared podcast catalog.
--
-- Workspace users never receive direct table access. The Edge Function calls
-- this service-role-only RPC after verifying active workspace membership.

CREATE OR REPLACE FUNCTION public.workspace_podcast_catalog_page_v1(
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_contact TEXT DEFAULT 'all',
  p_activity TEXT DEFAULT 'active',
  p_sort TEXT DEFAULT 'audience',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_search TEXT := lower(NULLIF(btrim(COALESCE(p_search, '')), ''));
  normalized_category TEXT := lower(NULLIF(btrim(COALESCE(p_category, '')), ''));
  normalized_contact TEXT := lower(btrim(COALESCE(p_contact, 'all')));
  normalized_activity TEXT := lower(btrim(COALESCE(p_activity, 'active')));
  normalized_sort TEXT := lower(btrim(COALESCE(p_sort, 'audience')));
  normalized_page INTEGER := COALESCE(p_page, 1);
  normalized_page_size INTEGER := COALESCE(p_page_size, 24);
  result JSONB;
BEGIN
  IF normalized_search IS NOT NULL AND length(normalized_search) > 120 THEN
    RAISE EXCEPTION 'search is invalid';
  END IF;
  IF normalized_category IS NOT NULL AND length(normalized_category) > 200 THEN
    RAISE EXCEPTION 'category is invalid';
  END IF;
  IF normalized_contact NOT IN ('all', 'any', 'free', 'direct') THEN
    RAISE EXCEPTION 'contact filter is invalid';
  END IF;
  IF normalized_activity NOT IN ('active', 'all') THEN
    RAISE EXCEPTION 'activity filter is invalid';
  END IF;
  IF normalized_sort NOT IN ('audience', 'name', 'recent', 'community') THEN
    RAISE EXCEPTION 'sort is invalid';
  END IF;
  IF normalized_page < 1 OR normalized_page > 10000 THEN
    RAISE EXCEPTION 'page is invalid';
  END IF;
  IF normalized_page_size < 12 OR normalized_page_size > 48 THEN
    RAISE EXCEPTION 'page size is invalid';
  END IF;

  WITH
  usage_rows AS (
    SELECT
      shortlist.podcast_id,
      client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    UNION ALL
    SELECT
      shortlist.podcast_id,
      dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
  ),
  combined_usage AS (
    SELECT
      usage_rows.podcast_id,
      count(*)::INTEGER AS use_count,
      count(DISTINCT usage_rows.workspace_id)::INTEGER AS workspace_count
    FROM usage_rows
    GROUP BY usage_rows.podcast_id
  ),
  catalog AS (
    SELECT
      podcast.id,
      podcast.podscan_id,
      podcast.podcast_name,
      podcast.podcast_description,
      podcast.podcast_image_url,
      podcast.podcast_url,
      podcast.publisher_name,
      COALESCE(direct_contact.host_name, podcast.host_name) AS host_name,
      podcast.podcast_categories,
      podcast.episode_count,
      podcast.itunes_rating,
      podcast.spotify_rating,
      podcast.audience_size,
      podcast.podcast_reach_score,
      podcast.language,
      podcast.region,
      podcast.website,
      podcast.rss_url,
      podcast.last_posted_at,
      podcast.is_active,
      podcast.podscan_last_fetched_at,
      podcast.updated_at,
      CASE
        WHEN lower(btrim(COALESCE(podcast.podscan_email, '')))
          ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        THEN lower(btrim(podcast.podscan_email))
        ELSE NULL
      END AS free_podscan_email,
      direct_contact.email AS direct_email,
      direct_contact.last_verified_at AS direct_verified_at,
      COALESCE(combined_usage.use_count, 0) AS shortlist_uses,
      COALESCE(combined_usage.workspace_count, 0) AS workspace_uses
    FROM public.podcasts podcast
    LEFT JOIN combined_usage ON combined_usage.podcast_id = podcast.podscan_id
    LEFT JOIN public.podcast_direct_contacts direct_contact
      ON direct_contact.podcast_id = podcast.id
      AND direct_contact.verification_status = 'verified'
  ),
  filtered AS (
    SELECT *
    FROM catalog
    WHERE
      (normalized_activity = 'all' OR is_active IS TRUE)
      AND (
        normalized_search IS NULL
        OR position(normalized_search IN lower(concat_ws(
          ' ',
          podcast_name,
          publisher_name,
          host_name,
          podcast_description
        ))) > 0
      )
      AND (
        normalized_category IS NULL
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(podcast_categories) = 'array' THEN podcast_categories
              ELSE '[]'::JSONB
            END
          ) category
          WHERE lower(btrim(COALESCE(
            category ->> 'category_name',
            category #>> '{}'
          ))) = normalized_category
        )
      )
      AND (
        normalized_contact = 'all'
        OR (normalized_contact = 'any' AND (free_podscan_email IS NOT NULL OR direct_email IS NOT NULL))
        OR (normalized_contact = 'free' AND free_podscan_email IS NOT NULL)
        OR (normalized_contact = 'direct' AND direct_email IS NOT NULL)
      )
  ),
  ordered AS (
    SELECT
      filtered.*,
      row_number() OVER (
        ORDER BY
          CASE WHEN normalized_sort = 'audience' THEN audience_size END DESC NULLS LAST,
          CASE WHEN normalized_sort = 'community' THEN shortlist_uses END DESC NULLS LAST,
          CASE WHEN normalized_sort = 'recent' THEN last_posted_at END DESC NULLS LAST,
          CASE WHEN normalized_sort = 'name' THEN lower(podcast_name) END ASC NULLS LAST,
          CASE WHEN normalized_sort <> 'name' THEN lower(podcast_name) END ASC NULLS LAST,
          podscan_id ASC
      ) AS result_order
    FROM filtered
  ),
  page_items AS (
    SELECT *
    FROM ordered
    WHERE result_order > (normalized_page - 1) * normalized_page_size
      AND result_order <= normalized_page * normalized_page_size
  ),
  category_options AS (
    SELECT DISTINCT btrim(COALESCE(
      category ->> 'category_name',
      category #>> '{}'
    )) AS category_name
    FROM public.podcasts podcast
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(podcast.podcast_categories) = 'array'
        THEN podcast.podcast_categories
        ELSE '[]'::JSONB
      END
    ) category
    WHERE podcast.is_active IS TRUE
      AND NULLIF(btrim(COALESCE(
        category ->> 'category_name',
        category #>> '{}'
      )), '') IS NOT NULL
  ),
  contributing_workspaces AS (
    SELECT client.workspace_id
    FROM public.client_dashboard_podcasts shortlist
    JOIN public.clients client ON client.id = shortlist.client_id
    WHERE client.workspace_id IS NOT NULL
    UNION
    SELECT dashboard.workspace_id
    FROM public.prospect_dashboard_podcasts shortlist
    JOIN public.prospect_dashboards dashboard
      ON dashboard.id = shortlist.prospect_dashboard_id
    WHERE dashboard.workspace_id IS NOT NULL
    UNION
    SELECT contribution.workspace_id
    FROM public.podcast_catalog_contributions contribution
    WHERE contribution.workspace_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'podcast_id', page_item.podscan_id,
          'podcast_name', page_item.podcast_name,
          'podcast_description', page_item.podcast_description,
          'podcast_image_url', page_item.podcast_image_url,
          'podcast_url', page_item.podcast_url,
          'publisher_name', page_item.publisher_name,
          'host_name', page_item.host_name,
          'podcast_categories', page_item.podcast_categories,
          'episode_count', page_item.episode_count,
          'itunes_rating', page_item.itunes_rating,
          'spotify_rating', page_item.spotify_rating,
          'audience_size', page_item.audience_size,
          'podcast_reach_score', page_item.podcast_reach_score,
          'language', page_item.language,
          'region', page_item.region,
          'website', page_item.website,
          'rss_feed', page_item.rss_url,
          'last_posted_at', page_item.last_posted_at,
          'is_active', page_item.is_active,
          'catalog_updated_at', COALESCE(page_item.podscan_last_fetched_at, page_item.updated_at),
          'free_podscan_email', page_item.free_podscan_email,
          'direct_email', page_item.direct_email,
          'direct_verified_at', page_item.direct_verified_at,
          'shortlist_uses', page_item.shortlist_uses,
          'workspace_uses', page_item.workspace_uses
        )
        ORDER BY page_item.result_order
      )
      FROM page_items page_item
    ), '[]'::JSONB),
    'pagination', jsonb_build_object(
      'page', normalized_page,
      'page_size', normalized_page_size,
      'total', (SELECT count(*) FROM filtered),
      'total_pages', CEIL((SELECT count(*) FROM filtered)::NUMERIC / normalized_page_size)::INTEGER
    ),
    'summary', jsonb_build_object(
      'total_podcasts', (SELECT count(*) FROM catalog),
      'active_podcasts', (SELECT count(*) FROM catalog WHERE is_active IS TRUE),
      'podcasts_with_free_email', (SELECT count(*) FROM catalog WHERE free_podscan_email IS NOT NULL),
      'podcasts_with_direct_email', (SELECT count(*) FROM catalog WHERE direct_email IS NOT NULL),
      'podcasts_used_in_shortlists', (SELECT count(*) FROM catalog WHERE shortlist_uses > 0),
      'shortlist_uses', (SELECT COALESCE(sum(shortlist_uses), 0) FROM catalog),
      'contributing_workspaces', (SELECT count(*) FROM contributing_workspaces)
    ),
    'categories', COALESCE((
      SELECT jsonb_agg(category_name ORDER BY category_name)
      FROM category_options
    ), '[]'::JSONB)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_podcast_catalog_page_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_podcast_catalog_page_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.workspace_podcast_catalog_page_v1(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) IS
  'Service-only, paginated workspace read model for the shared podcast catalog and globally reusable contacts.';
