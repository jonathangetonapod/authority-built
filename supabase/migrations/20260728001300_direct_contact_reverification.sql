-- Let a verified direct contact go out of date, and give the platform a way to
-- say so.
--
-- podcast_direct_contacts records the day an address was verified and then
-- treats it as true forever. Podcast hosts change jobs, hand shows over, and
-- retire domains; an address verified in March is a guess by September, and
-- pitching it burns sender reputation against a bounce rather than a person.
--
-- Staleness itself is deliberately NOT stored. It is a function of
-- last_verified_at and today, so writing it down would mean a scheduled job
-- keeping a derived fact in sync and being wrong between runs. What is stored
-- is the one thing time cannot tell us: that a re-check actually failed.

CREATE OR REPLACE FUNCTION public.expire_global_podcast_direct_contact_v1(
  p_podscan_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_podscan_id TEXT := btrim(COALESCE(p_podscan_id, ''));
  canonical_podcast public.podcasts%ROWTYPE;
  expired_contact public.podcast_direct_contacts%ROWTYPE;
BEGIN
  IF normalized_podscan_id = ''
    OR length(normalized_podscan_id) > 300
    OR normalized_podscan_id !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'podscan_id is invalid';
  END IF;

  SELECT * INTO canonical_podcast
  FROM public.podcasts podcast
  WHERE podcast.podscan_id = normalized_podscan_id;
  IF canonical_podcast.id IS NULL THEN
    RETURN jsonb_build_object('expired', false, 'reason', 'podcast_not_found');
  END IF;

  -- The row is kept rather than deleted. Its first_paid_unlock fields are the
  -- record of who paid for this contact, and the replacement search must not
  -- read as a first unlock and charge a second time for the same show.
  UPDATE public.podcast_direct_contacts contact
  SET verification_status = 'invalid',
      updated_at = NOW()
  WHERE contact.podcast_id = canonical_podcast.id
    AND contact.verification_status <> 'invalid'
  RETURNING * INTO expired_contact;

  RETURN jsonb_build_object(
    'expired', expired_contact.id IS NOT NULL,
    'podscan_id', canonical_podcast.podscan_id,
    'email', expired_contact.email,
    'last_verified_at', expired_contact.last_verified_at
  );
END;
$$;

COMMENT ON FUNCTION public.expire_global_podcast_direct_contact_v1(TEXT) IS
  'Marks a global direct contact invalid after a re-verification failed. The row survives so its paid-unlock provenance is not lost and a replacement search is not charged again.';

REVOKE ALL ON FUNCTION public.expire_global_podcast_direct_contact_v1(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_global_podcast_direct_contact_v1(TEXT)
  TO service_role;

-- Finding the contacts due a re-check has to scan by age, not by podcast.
CREATE INDEX IF NOT EXISTS podcast_direct_contacts_last_verified_idx
  ON public.podcast_direct_contacts (last_verified_at)
  WHERE verification_status = 'verified';
