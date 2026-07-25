-- Avoid a PL/pgSQL name collision between the local normalized email value and
-- the generated podcast_direct_contacts.normalized_email column on reuse.

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
  normalized_direct_email TEXT := lower(btrim(COALESCE(p_email, '')));
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
  IF normalized_direct_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
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
      normalized_direct_email,
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
        WHEN COALESCE(p_verified_at, NOW()) >= contact.last_verified_at THEN normalized_direct_email
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
