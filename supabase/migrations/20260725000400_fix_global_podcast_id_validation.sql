-- PostgreSQL advanced regular expressions cap repetition bounds at 255. The
-- catalog accepts provider IDs up to 300 characters, so validate the length
-- separately and keep the character-class expression unbounded.

CREATE OR REPLACE FUNCTION public.merge_global_podcast_catalog_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_source TEXT,
  p_podcast JSONB,
  p_client_id UUID DEFAULT NULL,
  p_prospect_dashboard_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_podscan_id TEXT;
  normalized_name TEXT;
  normalized_source TEXT := lower(btrim(COALESCE(p_source, '')));
  canonical_id UUID;
  contributed_fields TEXT[];
BEGIN
  IF p_podcast IS NULL OR jsonb_typeof(p_podcast) <> 'object' THEN
    RAISE EXCEPTION 'podcast payload must be an object';
  END IF;

  normalized_podscan_id := btrim(COALESCE(p_podcast ->> 'podscan_id', ''));
  normalized_name := NULLIF(btrim(COALESCE(p_podcast ->> 'podcast_name', '')), '');
  IF normalized_podscan_id = ''
    OR length(normalized_podscan_id) > 300
    OR normalized_podscan_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'podscan_id is invalid';
  END IF;
  IF normalized_name IS NULL OR length(normalized_name) > 500 THEN
    RAISE EXCEPTION 'podcast_name is invalid';
  END IF;
  IF normalized_source NOT IN (
    'workspace_shortlist',
    'workspace_prospect',
    'platform_import',
    'podscan_refresh',
    'legacy_cache'
  ) THEN
    RAISE EXCEPTION 'podcast contribution source is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces workspace
    WHERE workspace.id = p_workspace_id AND workspace.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active workspace not found';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients client
    WHERE client.id = p_client_id AND client.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace client not found';
  END IF;
  IF p_prospect_dashboard_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.prospect_dashboards dashboard
    WHERE dashboard.id = p_prospect_dashboard_id AND dashboard.workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace prospect dashboard not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('global-podcast:' || normalized_podscan_id, 0));

  INSERT INTO public.podcasts AS catalog (
    podscan_id,
    podcast_name,
    podcast_description,
    podcast_image_url,
    podcast_url,
    publisher_name,
    itunes_rating,
    episode_count,
    audience_size,
    last_posted_at,
    podcast_categories,
    language,
    region,
    podscan_email,
    rss_url,
    podscan_last_fetched_at,
    updated_at
  )
  VALUES (
    normalized_podscan_id,
    normalized_name,
    NULLIF(btrim(COALESCE(p_podcast ->> 'podcast_description', '')), ''),
    NULLIF(btrim(COALESCE(p_podcast ->> 'podcast_image_url', '')), ''),
    NULLIF(btrim(COALESCE(p_podcast ->> 'podcast_url', '')), ''),
    NULLIF(btrim(COALESCE(p_podcast ->> 'publisher_name', '')), ''),
    CASE WHEN jsonb_typeof(p_podcast -> 'itunes_rating') = 'number'
      THEN (p_podcast ->> 'itunes_rating')::NUMERIC ELSE NULL END,
    CASE WHEN jsonb_typeof(p_podcast -> 'episode_count') = 'number'
      THEN (p_podcast ->> 'episode_count')::INTEGER ELSE NULL END,
    CASE WHEN jsonb_typeof(p_podcast -> 'audience_size') = 'number'
      THEN (p_podcast ->> 'audience_size')::INTEGER ELSE NULL END,
    CASE WHEN jsonb_typeof(p_podcast -> 'last_posted_at') = 'string'
      AND NULLIF(btrim(p_podcast ->> 'last_posted_at'), '') IS NOT NULL
      THEN (p_podcast ->> 'last_posted_at')::TIMESTAMPTZ ELSE NULL END,
    CASE WHEN jsonb_typeof(p_podcast -> 'podcast_categories') = 'array'
      AND jsonb_array_length(p_podcast -> 'podcast_categories') > 0
      THEN p_podcast -> 'podcast_categories' ELSE NULL END,
    NULLIF(btrim(COALESCE(p_podcast ->> 'language', '')), ''),
    NULLIF(btrim(COALESCE(p_podcast ->> 'region', '')), ''),
    NULLIF(lower(btrim(COALESCE(p_podcast ->> 'podscan_email', ''))), ''),
    NULLIF(btrim(COALESCE(p_podcast ->> 'rss_url', '')), ''),
    NOW(),
    NOW()
  )
  ON CONFLICT (podscan_id) DO UPDATE SET
    podcast_name = COALESCE(NULLIF(btrim(EXCLUDED.podcast_name), ''), catalog.podcast_name),
    podcast_description = COALESCE(NULLIF(btrim(EXCLUDED.podcast_description), ''), catalog.podcast_description),
    podcast_image_url = COALESCE(NULLIF(btrim(EXCLUDED.podcast_image_url), ''), catalog.podcast_image_url),
    podcast_url = COALESCE(NULLIF(btrim(EXCLUDED.podcast_url), ''), catalog.podcast_url),
    publisher_name = COALESCE(NULLIF(btrim(EXCLUDED.publisher_name), ''), catalog.publisher_name),
    itunes_rating = COALESCE(EXCLUDED.itunes_rating, catalog.itunes_rating),
    episode_count = COALESCE(EXCLUDED.episode_count, catalog.episode_count),
    audience_size = COALESCE(EXCLUDED.audience_size, catalog.audience_size),
    last_posted_at = COALESCE(EXCLUDED.last_posted_at, catalog.last_posted_at),
    podcast_categories = CASE
      WHEN EXCLUDED.podcast_categories IS NOT NULL
        AND EXCLUDED.podcast_categories <> '[]'::JSONB
      THEN EXCLUDED.podcast_categories
      ELSE catalog.podcast_categories
    END,
    language = COALESCE(NULLIF(btrim(EXCLUDED.language), ''), catalog.language),
    region = COALESCE(NULLIF(btrim(EXCLUDED.region), ''), catalog.region),
    podscan_email = COALESCE(NULLIF(lower(btrim(EXCLUDED.podscan_email)), ''), catalog.podscan_email),
    rss_url = COALESCE(NULLIF(btrim(EXCLUDED.rss_url), ''), catalog.rss_url),
    podscan_last_fetched_at = GREATEST(
      COALESCE(catalog.podscan_last_fetched_at, '-infinity'::TIMESTAMPTZ),
      EXCLUDED.podscan_last_fetched_at
    ),
    updated_at = NOW()
  RETURNING id INTO canonical_id;

  SELECT COALESCE(array_agg(entry.key ORDER BY entry.key), '{}'::TEXT[])
  INTO contributed_fields
  FROM jsonb_each(p_podcast) AS entry(key, value)
  WHERE entry.value IS DISTINCT FROM 'null'::JSONB
    AND entry.value IS DISTINCT FROM '""'::JSONB;

  INSERT INTO public.podcast_catalog_contributions (
    podcast_id,
    workspace_id,
    client_id,
    prospect_dashboard_id,
    actor_user_id,
    source,
    contributed_fields
  )
  VALUES (
    canonical_id,
    p_workspace_id,
    p_client_id,
    p_prospect_dashboard_id,
    p_actor_user_id,
    normalized_source,
    contributed_fields
  );

  RETURN canonical_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_global_podcast_direct_contact_v1(
  p_podscan_id TEXT,
  p_email TEXT,
  p_host_name TEXT,
  p_provider TEXT,
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_provider_reference TEXT DEFAULT NULL,
  p_verified_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_podscan_id TEXT := btrim(COALESCE(p_podscan_id, ''));
  normalized_email TEXT := lower(btrim(COALESCE(p_email, '')));
  normalized_host_name TEXT := NULLIF(btrim(COALESCE(p_host_name, '')), '');
  normalized_provider TEXT := lower(btrim(COALESCE(p_provider, '')));
  canonical_podcast public.podcasts%ROWTYPE;
  existing_contact public.podcast_direct_contacts%ROWTYPE;
  saved_contact public.podcast_direct_contacts%ROWTYPE;
  first_global_unlock BOOLEAN := false;
BEGIN
  IF normalized_podscan_id = ''
    OR length(normalized_podscan_id) > 300
    OR normalized_podscan_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'podscan_id is invalid';
  END IF;
  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'verified direct email is invalid';
  END IF;
  IF length(normalized_provider) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'provider is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces workspace
    WHERE workspace.id = p_workspace_id AND workspace.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active workspace not found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('global-podcast-direct-contact:' || normalized_podscan_id, 0));

  SELECT * INTO canonical_podcast
  FROM public.podcasts podcast
  WHERE podcast.podscan_id = normalized_podscan_id
  FOR UPDATE;
  IF canonical_podcast.id IS NULL THEN
    RAISE EXCEPTION 'global podcast not found';
  END IF;

  SELECT * INTO existing_contact
  FROM public.podcast_direct_contacts contact
  WHERE contact.podcast_id = canonical_podcast.id
  FOR UPDATE;

  IF existing_contact.id IS NULL THEN
    first_global_unlock := true;
    INSERT INTO public.podcast_direct_contacts (
      podcast_id,
      email,
      host_name,
      source_provider,
      provider_reference,
      verification_status,
      verified_at,
      first_paid_unlock_workspace_id,
      first_paid_unlock_by,
      first_paid_unlock_at,
      last_verified_at,
      created_at,
      updated_at
    ) VALUES (
      canonical_podcast.id,
      normalized_email,
      normalized_host_name,
      normalized_provider,
      NULLIF(btrim(COALESCE(p_provider_reference, '')), ''),
      'verified',
      COALESCE(p_verified_at, NOW()),
      p_workspace_id,
      p_actor_user_id,
      NOW(),
      COALESCE(p_verified_at, NOW()),
      NOW(),
      NOW()
    )
    RETURNING * INTO saved_contact;
  ELSE
    UPDATE public.podcast_direct_contacts contact
    SET
      email = CASE
        WHEN COALESCE(p_verified_at, NOW()) >= contact.last_verified_at THEN normalized_email
        ELSE contact.email
      END,
      host_name = COALESCE(normalized_host_name, contact.host_name),
      source_provider = CASE
        WHEN COALESCE(p_verified_at, NOW()) >= contact.last_verified_at THEN normalized_provider
        ELSE contact.source_provider
      END,
      provider_reference = CASE
        WHEN COALESCE(p_verified_at, NOW()) >= contact.last_verified_at
        THEN COALESCE(NULLIF(btrim(COALESCE(p_provider_reference, '')), ''), contact.provider_reference)
        ELSE contact.provider_reference
      END,
      verification_status = 'verified',
      verified_at = GREATEST(contact.verified_at, COALESCE(p_verified_at, NOW())),
      last_verified_at = GREATEST(contact.last_verified_at, COALESCE(p_verified_at, NOW())),
      updated_at = NOW()
    WHERE contact.id = existing_contact.id
    RETURNING * INTO saved_contact;
  END IF;

  RETURN jsonb_build_object(
    'podscan_id', canonical_podcast.podscan_id,
    'contact_id', saved_contact.id,
    'globally_unlocked', true,
    'first_global_unlock', first_global_unlock,
    'credit_charge_allowed', first_global_unlock,
    'email', saved_contact.email,
    'host_name', saved_contact.host_name,
    'verified_at', saved_contact.last_verified_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_global_podcast_catalog_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_global_podcast_catalog_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.record_global_podcast_direct_contact_v1(TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_global_podcast_direct_contact_v1(TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ)
  TO service_role;
