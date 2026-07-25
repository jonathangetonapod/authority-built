-- Shared podcast catalog hardening.
--
-- The global `podcasts` row is the source of truth for public podcast metadata
-- and the free Podscan inbox. Verified direct-host contacts live in a separate,
-- private global table so one successful paid lookup can be reused by every
-- workspace without exposing contact data through public catalog reads.

-- ---------------------------------------------------------------------------
-- Private provenance and direct-contact layers
-- ---------------------------------------------------------------------------

CREATE TABLE public.podcast_catalog_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  prospect_dashboard_id UUID REFERENCES public.prospect_dashboards(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN (
    'workspace_shortlist',
    'workspace_prospect',
    'platform_import',
    'podscan_refresh',
    'legacy_cache'
  )),
  contributed_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT podcast_catalog_contribution_scope_check CHECK (
    client_id IS NULL OR prospect_dashboard_id IS NULL
  )
);

CREATE INDEX podcast_catalog_contributions_podcast_created_idx
  ON public.podcast_catalog_contributions (podcast_id, created_at DESC);
CREATE INDEX podcast_catalog_contributions_workspace_created_idx
  ON public.podcast_catalog_contributions (workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE TABLE public.podcast_direct_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL UNIQUE REFERENCES public.podcasts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  normalized_email TEXT GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  host_name TEXT,
  source_provider TEXT NOT NULL,
  provider_reference TEXT,
  verification_status TEXT NOT NULL DEFAULT 'verified'
    CHECK (verification_status IN ('verified', 'stale', 'invalid')),
  verified_at TIMESTAMPTZ NOT NULL,
  first_paid_unlock_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  first_paid_unlock_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_paid_unlock_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT podcast_direct_contacts_email_check CHECK (
    normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT podcast_direct_contacts_provider_check CHECK (
    length(btrim(source_provider)) BETWEEN 2 AND 120
  )
);

CREATE UNIQUE INDEX podcast_direct_contacts_provider_reference_idx
  ON public.podcast_direct_contacts (source_provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX podcast_direct_contacts_normalized_email_idx
  ON public.podcast_direct_contacts (normalized_email);

COMMENT ON TABLE public.podcast_catalog_contributions IS
  'Private provenance ledger showing how workspaces contribute to the shared podcast catalog.';
COMMENT ON TABLE public.podcast_direct_contacts IS
  'Private, globally reusable verified direct-host contacts. A podcast can have one current direct contact across the platform.';
COMMENT ON COLUMN public.podcasts.podscan_email IS
  'Free podcast inbox supplied by Podscan. This is distinct from a paid verified direct-host contact.';

ALTER TABLE public.podcast_catalog_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_catalog_contributions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_direct_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_direct_contacts FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.podcast_catalog_contributions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.podcast_direct_contacts FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.podcast_catalog_contributions TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.podcast_direct_contacts TO service_role;

-- ---------------------------------------------------------------------------
-- Server-only canonical merge API
-- ---------------------------------------------------------------------------

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
  IF normalized_podscan_id = '' OR normalized_podscan_id !~ '^[A-Za-z0-9_-]{1,300}$' THEN
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

CREATE OR REPLACE FUNCTION public.merge_global_podcast_catalog_batch_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_source TEXT,
  p_podcasts JSONB,
  p_client_id UUID DEFAULT NULL,
  p_prospect_dashboard_id UUID DEFAULT NULL
)
RETURNS TABLE (podscan_id TEXT, podcast_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  podcast_payload JSONB;
BEGIN
  IF p_podcasts IS NULL OR jsonb_typeof(p_podcasts) <> 'array'
    OR jsonb_array_length(p_podcasts) < 1 OR jsonb_array_length(p_podcasts) > 50 THEN
    RAISE EXCEPTION 'podcasts must contain between 1 and 50 entries';
  END IF;

  FOR podcast_payload IN SELECT value FROM jsonb_array_elements(p_podcasts)
  LOOP
    podscan_id := btrim(COALESCE(podcast_payload ->> 'podscan_id', ''));
    podcast_id := public.merge_global_podcast_catalog_v1(
      p_workspace_id,
      p_actor_user_id,
      p_source,
      podcast_payload,
      p_client_id,
      p_prospect_dashboard_id
    );
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_global_podcast_catalog_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.merge_global_podcast_catalog_batch_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_global_podcast_catalog_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_global_podcast_catalog_batch_v1(UUID, UUID, TEXT, JSONB, UUID, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Exactly-once global direct-contact promotion
-- ---------------------------------------------------------------------------

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
  IF normalized_podscan_id = '' OR normalized_podscan_id !~ '^[A-Za-z0-9_-]{1,300}$' THEN
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

REVOKE ALL ON FUNCTION public.record_global_podcast_direct_contact_v1(TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_global_podcast_direct_contact_v1(TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.record_global_podcast_direct_contact_v1(TEXT, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ) IS
  'Atomically promotes a verified paid direct contact into the global catalog layer. Only the first successful global unlock is eligible for a credit charge.';

-- ---------------------------------------------------------------------------
-- Backfill and relational protection for all workflow cache rows
-- ---------------------------------------------------------------------------

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
  podscan_last_fetched_at,
  updated_at
)
SELECT DISTINCT ON (shortlist.podcast_id)
  shortlist.podcast_id,
  shortlist.podcast_name,
  shortlist.podcast_description,
  shortlist.podcast_image_url,
  shortlist.podcast_url,
  shortlist.publisher_name,
  shortlist.itunes_rating,
  shortlist.episode_count,
  shortlist.audience_size,
  shortlist.last_posted_at,
  shortlist.podcast_categories,
  COALESCE(shortlist.updated_at, shortlist.created_at, NOW()),
  NOW()
FROM public.client_dashboard_podcasts shortlist
WHERE NULLIF(btrim(shortlist.podcast_id), '') IS NOT NULL
  AND NULLIF(btrim(shortlist.podcast_name), '') IS NOT NULL
ORDER BY shortlist.podcast_id, shortlist.updated_at DESC NULLS LAST, shortlist.id
ON CONFLICT (podscan_id) DO UPDATE SET
  podcast_name = COALESCE(NULLIF(btrim(catalog.podcast_name), ''), EXCLUDED.podcast_name),
  podcast_description = COALESCE(catalog.podcast_description, EXCLUDED.podcast_description),
  podcast_image_url = COALESCE(catalog.podcast_image_url, EXCLUDED.podcast_image_url),
  podcast_url = COALESCE(catalog.podcast_url, EXCLUDED.podcast_url),
  publisher_name = COALESCE(catalog.publisher_name, EXCLUDED.publisher_name),
  itunes_rating = COALESCE(catalog.itunes_rating, EXCLUDED.itunes_rating),
  episode_count = COALESCE(catalog.episode_count, EXCLUDED.episode_count),
  audience_size = COALESCE(catalog.audience_size, EXCLUDED.audience_size),
  last_posted_at = COALESCE(catalog.last_posted_at, EXCLUDED.last_posted_at),
  podcast_categories = COALESCE(catalog.podcast_categories, EXCLUDED.podcast_categories);

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
  podscan_last_fetched_at,
  updated_at
)
SELECT DISTINCT ON (shortlist.podcast_id)
  shortlist.podcast_id,
  shortlist.podcast_name,
  shortlist.podcast_description,
  shortlist.podcast_image_url,
  shortlist.podcast_url,
  shortlist.publisher_name,
  shortlist.itunes_rating,
  shortlist.episode_count,
  shortlist.audience_size,
  shortlist.last_posted_at,
  shortlist.podcast_categories,
  COALESCE(shortlist.updated_at, shortlist.created_at, NOW()),
  NOW()
FROM public.prospect_dashboard_podcasts shortlist
WHERE NULLIF(btrim(shortlist.podcast_id), '') IS NOT NULL
  AND NULLIF(btrim(shortlist.podcast_name), '') IS NOT NULL
ORDER BY shortlist.podcast_id, shortlist.updated_at DESC NULLS LAST, shortlist.id
ON CONFLICT (podscan_id) DO UPDATE SET
  podcast_name = COALESCE(NULLIF(btrim(catalog.podcast_name), ''), EXCLUDED.podcast_name),
  podcast_description = COALESCE(catalog.podcast_description, EXCLUDED.podcast_description),
  podcast_image_url = COALESCE(catalog.podcast_image_url, EXCLUDED.podcast_image_url),
  podcast_url = COALESCE(catalog.podcast_url, EXCLUDED.podcast_url),
  publisher_name = COALESCE(catalog.publisher_name, EXCLUDED.publisher_name),
  itunes_rating = COALESCE(catalog.itunes_rating, EXCLUDED.itunes_rating),
  episode_count = COALESCE(catalog.episode_count, EXCLUDED.episode_count),
  audience_size = COALESCE(catalog.audience_size, EXCLUDED.audience_size),
  last_posted_at = COALESCE(catalog.last_posted_at, EXCLUDED.last_posted_at),
  podcast_categories = COALESCE(catalog.podcast_categories, EXCLUDED.podcast_categories);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_dashboard_podcasts_global_podcast_fk'
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_global_podcast_fk
      FOREIGN KEY (podcast_id) REFERENCES public.podcasts(podscan_id)
      ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prospect_dashboard_podcasts_global_podcast_fk'
  ) THEN
    ALTER TABLE public.prospect_dashboard_podcasts
      ADD CONSTRAINT prospect_dashboard_podcasts_global_podcast_fk
      FOREIGN KEY (podcast_id) REFERENCES public.podcasts(podscan_id)
      ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'podcast_emails_global_podcast_fk'
  ) THEN
    ALTER TABLE public.podcast_emails
      ADD CONSTRAINT podcast_emails_global_podcast_fk
      FOREIGN KEY (podcast_id) REFERENCES public.podcasts(podscan_id)
      ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.client_dashboard_podcasts
  VALIDATE CONSTRAINT client_dashboard_podcasts_global_podcast_fk;
ALTER TABLE public.prospect_dashboard_podcasts
  VALIDATE CONSTRAINT prospect_dashboard_podcasts_global_podcast_fk;
ALTER TABLE public.podcast_emails
  VALIDATE CONSTRAINT podcast_emails_global_podcast_fk;

-- ---------------------------------------------------------------------------
-- Canonical reflection triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_workflow_podcast_is_global_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('app.podcast_catalog_reflection', true) = 'disabled' THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NULLIF(btrim(NEW.podcast_id), '') IS NULL OR NULLIF(btrim(NEW.podcast_name), '') IS NULL THEN
    RETURN NEW;
  END IF;

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
    podscan_last_fetched_at,
    updated_at
  ) VALUES (
    NEW.podcast_id,
    NEW.podcast_name,
    NEW.podcast_description,
    NEW.podcast_image_url,
    NEW.podcast_url,
    NEW.publisher_name,
    NEW.itunes_rating,
    NEW.episode_count,
    NEW.audience_size,
    NEW.last_posted_at,
    NEW.podcast_categories,
    COALESCE(NEW.updated_at, NEW.created_at, NOW()),
    NOW()
  )
  ON CONFLICT (podscan_id) DO UPDATE SET
    podcast_name = COALESCE(NULLIF(btrim(catalog.podcast_name), ''), EXCLUDED.podcast_name),
    podcast_description = COALESCE(catalog.podcast_description, EXCLUDED.podcast_description),
    podcast_image_url = COALESCE(catalog.podcast_image_url, EXCLUDED.podcast_image_url),
    podcast_url = COALESCE(catalog.podcast_url, EXCLUDED.podcast_url),
    publisher_name = COALESCE(catalog.publisher_name, EXCLUDED.publisher_name),
    itunes_rating = COALESCE(catalog.itunes_rating, EXCLUDED.itunes_rating),
    episode_count = COALESCE(catalog.episode_count, EXCLUDED.episode_count),
    audience_size = COALESCE(catalog.audience_size, EXCLUDED.audience_size),
    last_posted_at = COALESCE(catalog.last_posted_at, EXCLUDED.last_posted_at),
    podcast_categories = CASE
      WHEN catalog.podcast_categories IS NULL OR catalog.podcast_categories = '[]'::JSONB
      THEN EXCLUDED.podcast_categories ELSE catalog.podcast_categories
    END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reflect_global_podcast_to_workflows_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('app.podcast_catalog_reflection', true) = 'disabled' THEN
    RETURN NEW;
  END IF;
  UPDATE public.client_dashboard_podcasts shortlist
  SET
    podcast_name = NEW.podcast_name,
    podcast_description = NEW.podcast_description,
    podcast_image_url = NEW.podcast_image_url,
    podcast_url = NEW.podcast_url,
    publisher_name = NEW.publisher_name,
    itunes_rating = NEW.itunes_rating,
    episode_count = NEW.episode_count,
    audience_size = NEW.audience_size,
    last_posted_at = NEW.last_posted_at,
    podcast_categories = NEW.podcast_categories,
    updated_at = NOW()
  WHERE shortlist.podcast_id = NEW.podscan_id
    AND (
      shortlist.podcast_name IS DISTINCT FROM NEW.podcast_name
      OR shortlist.podcast_description IS DISTINCT FROM NEW.podcast_description
      OR shortlist.podcast_image_url IS DISTINCT FROM NEW.podcast_image_url
      OR shortlist.podcast_url IS DISTINCT FROM NEW.podcast_url
      OR shortlist.publisher_name IS DISTINCT FROM NEW.publisher_name
      OR shortlist.itunes_rating IS DISTINCT FROM NEW.itunes_rating
      OR shortlist.episode_count IS DISTINCT FROM NEW.episode_count
      OR shortlist.audience_size IS DISTINCT FROM NEW.audience_size
      OR shortlist.last_posted_at IS DISTINCT FROM NEW.last_posted_at
      OR shortlist.podcast_categories IS DISTINCT FROM NEW.podcast_categories
    );

  UPDATE public.prospect_dashboard_podcasts shortlist
  SET
    podcast_name = NEW.podcast_name,
    podcast_description = NEW.podcast_description,
    podcast_image_url = NEW.podcast_image_url,
    podcast_url = NEW.podcast_url,
    publisher_name = NEW.publisher_name,
    itunes_rating = NEW.itunes_rating,
    episode_count = NEW.episode_count,
    audience_size = NEW.audience_size,
    last_posted_at = NEW.last_posted_at,
    podcast_categories = NEW.podcast_categories,
    updated_at = NOW()
  WHERE shortlist.podcast_id = NEW.podscan_id
    AND (
      shortlist.podcast_name IS DISTINCT FROM NEW.podcast_name
      OR shortlist.podcast_description IS DISTINCT FROM NEW.podcast_description
      OR shortlist.podcast_image_url IS DISTINCT FROM NEW.podcast_image_url
      OR shortlist.podcast_url IS DISTINCT FROM NEW.podcast_url
      OR shortlist.publisher_name IS DISTINCT FROM NEW.publisher_name
      OR shortlist.itunes_rating IS DISTINCT FROM NEW.itunes_rating
      OR shortlist.episode_count IS DISTINCT FROM NEW.episode_count
      OR shortlist.audience_size IS DISTINCT FROM NEW.audience_size
      OR shortlist.last_posted_at IS DISTINCT FROM NEW.last_posted_at
      OR shortlist.podcast_categories IS DISTINCT FROM NEW.podcast_categories
    );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reflect_free_podcast_email_to_catalog_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF lower(btrim(COALESCE(NEW.source, 'podscan'))) = 'podscan'
    AND NULLIF(lower(btrim(COALESCE(NEW.email, ''))), '') IS NOT NULL THEN
    UPDATE public.podcasts
    SET podscan_email = lower(btrim(NEW.email)), updated_at = NOW()
    WHERE podscan_id = NEW.podcast_id
      AND podscan_email IS DISTINCT FROM lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_shortlist_ensure_global_podcast_v1 ON public.client_dashboard_podcasts;
CREATE TRIGGER client_shortlist_ensure_global_podcast_v1
  BEFORE INSERT OR UPDATE OF
    podcast_id,
    podcast_name,
    podcast_description,
    podcast_image_url,
    podcast_url,
    publisher_name,
    itunes_rating,
    episode_count,
    audience_size,
    last_posted_at,
    podcast_categories
  ON public.client_dashboard_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_workflow_podcast_is_global_v1();

DROP TRIGGER IF EXISTS prospect_shortlist_ensure_global_podcast_v1 ON public.prospect_dashboard_podcasts;
CREATE TRIGGER prospect_shortlist_ensure_global_podcast_v1
  BEFORE INSERT OR UPDATE OF
    podcast_id,
    podcast_name,
    podcast_description,
    podcast_image_url,
    podcast_url,
    publisher_name,
    itunes_rating,
    episode_count,
    audience_size,
    last_posted_at,
    podcast_categories
  ON public.prospect_dashboard_podcasts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_workflow_podcast_is_global_v1();

DROP TRIGGER IF EXISTS podcasts_reflect_to_workflows_v1 ON public.podcasts;
CREATE TRIGGER podcasts_reflect_to_workflows_v1
  AFTER INSERT OR UPDATE OF
    podcast_name,
    podcast_description,
    podcast_image_url,
    podcast_url,
    publisher_name,
    itunes_rating,
    episode_count,
    audience_size,
    last_posted_at,
    podcast_categories
  ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.reflect_global_podcast_to_workflows_v1();

DROP TRIGGER IF EXISTS podcast_emails_reflect_free_email_v1 ON public.podcast_emails;
CREATE TRIGGER podcast_emails_reflect_free_email_v1
  AFTER INSERT OR UPDATE OF email, source ON public.podcast_emails
  FOR EACH ROW EXECUTE FUNCTION public.reflect_free_podcast_email_to_catalog_v1();

-- Align every existing workflow cache with the canonical record once. Future
-- updates are maintained by the reflection trigger above.
SELECT set_config('app.podcast_catalog_reflection', 'disabled', true);

UPDATE public.client_dashboard_podcasts shortlist
SET
  podcast_name = catalog.podcast_name,
  podcast_description = catalog.podcast_description,
  podcast_image_url = catalog.podcast_image_url,
  podcast_url = catalog.podcast_url,
  publisher_name = catalog.publisher_name,
  itunes_rating = catalog.itunes_rating,
  episode_count = catalog.episode_count,
  audience_size = catalog.audience_size,
  last_posted_at = catalog.last_posted_at,
  podcast_categories = catalog.podcast_categories,
  updated_at = NOW()
FROM public.podcasts catalog
WHERE catalog.podscan_id = shortlist.podcast_id
  AND (
    shortlist.podcast_name IS DISTINCT FROM catalog.podcast_name
    OR shortlist.podcast_description IS DISTINCT FROM catalog.podcast_description
    OR shortlist.podcast_image_url IS DISTINCT FROM catalog.podcast_image_url
    OR shortlist.podcast_url IS DISTINCT FROM catalog.podcast_url
    OR shortlist.publisher_name IS DISTINCT FROM catalog.publisher_name
    OR shortlist.itunes_rating IS DISTINCT FROM catalog.itunes_rating
    OR shortlist.episode_count IS DISTINCT FROM catalog.episode_count
    OR shortlist.audience_size IS DISTINCT FROM catalog.audience_size
    OR shortlist.last_posted_at IS DISTINCT FROM catalog.last_posted_at
    OR shortlist.podcast_categories IS DISTINCT FROM catalog.podcast_categories
  );

UPDATE public.prospect_dashboard_podcasts shortlist
SET
  podcast_name = catalog.podcast_name,
  podcast_description = catalog.podcast_description,
  podcast_image_url = catalog.podcast_image_url,
  podcast_url = catalog.podcast_url,
  publisher_name = catalog.publisher_name,
  itunes_rating = catalog.itunes_rating,
  episode_count = catalog.episode_count,
  audience_size = catalog.audience_size,
  last_posted_at = catalog.last_posted_at,
  podcast_categories = catalog.podcast_categories,
  updated_at = NOW()
FROM public.podcasts catalog
WHERE catalog.podscan_id = shortlist.podcast_id
  AND (
    shortlist.podcast_name IS DISTINCT FROM catalog.podcast_name
    OR shortlist.podcast_description IS DISTINCT FROM catalog.podcast_description
    OR shortlist.podcast_image_url IS DISTINCT FROM catalog.podcast_image_url
    OR shortlist.podcast_url IS DISTINCT FROM catalog.podcast_url
    OR shortlist.publisher_name IS DISTINCT FROM catalog.publisher_name
    OR shortlist.itunes_rating IS DISTINCT FROM catalog.itunes_rating
    OR shortlist.episode_count IS DISTINCT FROM catalog.episode_count
    OR shortlist.audience_size IS DISTINCT FROM catalog.audience_size
    OR shortlist.last_posted_at IS DISTINCT FROM catalog.last_posted_at
    OR shortlist.podcast_categories IS DISTINCT FROM catalog.podcast_categories
  );

SELECT set_config('app.podcast_catalog_reflection', 'enabled', true);

-- ---------------------------------------------------------------------------
-- Catalog access and identity lookup hardening
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public read access to podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Authenticated users can read podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Authenticated users can insert podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Authenticated users can update podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "Admin full access to podcasts" ON public.podcasts;
DROP POLICY IF EXISTS podcasts_platform_admin_all ON public.podcasts;

REVOKE ALL PRIVILEGES ON TABLE public.podcasts FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.podcasts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.podcasts TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.podcasts TO service_role;

CREATE POLICY podcasts_platform_admin_all
  ON public.podcasts
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Workspace users read the shared catalog through scoped Edge APIs. Direct
-- authenticated table access remains limited to platform administrators.

DROP INDEX IF EXISTS public.idx_podcasts_podscan_id;
CREATE INDEX IF NOT EXISTS podcasts_rss_identity_idx
  ON public.podcasts (lower(btrim(rss_url)))
  WHERE NULLIF(btrim(rss_url), '') IS NOT NULL;
CREATE INDEX IF NOT EXISTS podcasts_itunes_identity_idx
  ON public.podcasts (lower(btrim(podcast_itunes_id)))
  WHERE NULLIF(btrim(podcast_itunes_id), '') IS NOT NULL;
CREATE INDEX IF NOT EXISTS podcasts_spotify_identity_idx
  ON public.podcasts (lower(btrim(podcast_spotify_id)))
  WHERE NULLIF(btrim(podcast_spotify_id), '') IS NOT NULL;

-- Trigger functions are server internals, not public RPCs.
REVOKE ALL ON FUNCTION public.ensure_workflow_podcast_is_global_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reflect_global_podcast_to_workflows_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reflect_free_podcast_email_to_catalog_v1() FROM PUBLIC, anon, authenticated;
