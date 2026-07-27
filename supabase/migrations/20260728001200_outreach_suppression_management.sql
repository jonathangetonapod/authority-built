-- Give the do-not-contact list a surface, and make the one way it can silently
-- fail unrepresentable.
--
-- workspace_outreach_suppressions has had exactly one writer — the inbox
-- opt-out prefilter — and no way to read it, add to it, or correct it. A host
-- who asks a person to stop, a hard bounce, or a false positive from keyword
-- matching all had nowhere to go.
--
-- The silent failure: every lookup compares the suppression against a
-- lower(btrim(...)) address, but the column itself was free-form. A row stored
-- as 'Host@Show.com' would suppress nothing at all, and nothing would say so.
-- The existing writer happens to lowercase; an operator typing into a form does
-- not. A CHECK constraint is the only version of this that cannot regress.

-- Fold any case-variant duplicates into the earliest row before the constraint
-- makes them collide. The earliest is kept because it is the one that dates the
-- opt-out, which is the fact that matters if it is ever questioned.
DELETE FROM public.workspace_outreach_suppressions doomed
USING public.workspace_outreach_suppressions kept
WHERE doomed.workspace_id = kept.workspace_id
  AND lower(btrim(doomed.contact_email)) = lower(btrim(kept.contact_email))
  AND (doomed.created_at, doomed.contact_email) > (kept.created_at, kept.contact_email);

UPDATE public.workspace_outreach_suppressions
SET contact_email = lower(btrim(contact_email))
WHERE contact_email <> lower(btrim(contact_email));

ALTER TABLE public.workspace_outreach_suppressions
  ADD CONSTRAINT workspace_outreach_suppressions_email_normalized_check
  CHECK (contact_email = lower(btrim(contact_email)) AND contact_email <> '');

-- Why an address is silenced changes what an operator may do about it. An
-- opt-out is the host's decision and is not ours to revisit lightly; a bounce
-- is a delivery fact; manual covers everything a person judged.
UPDATE public.workspace_outreach_suppressions
SET reason = 'manual'
WHERE reason NOT IN ('opted_out', 'bounced', 'manual');

UPDATE public.workspace_outreach_suppressions
SET source = 'manual'
WHERE source NOT IN ('inbox_auto', 'manual');

ALTER TABLE public.workspace_outreach_suppressions
  ADD CONSTRAINT workspace_outreach_suppressions_reason_check
  CHECK (reason IN ('opted_out', 'bounced', 'manual'));

ALTER TABLE public.workspace_outreach_suppressions
  ADD CONSTRAINT workspace_outreach_suppressions_source_check
  CHECK (source IN ('inbox_auto', 'manual'));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_outreach_suppressions TO service_role;

-- A bare address is not reviewable. Whoever the operator is deciding about,
-- the workspace almost always already knows their name and show — from the
-- relationship book, from the campaign that pitched them, or from the shared
-- catalog. Resolving it here is what makes the list something a person can act
-- on rather than a column of strings.
CREATE OR REPLACE FUNCTION public.workspace_outreach_suppression_list_v1(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  contact_email TEXT,
  reason TEXT,
  source TEXT,
  note TEXT,
  created_at TIMESTAMPTZ,
  created_by_email TEXT,
  host_name TEXT,
  podcast_name TEXT,
  podcast_id TEXT,
  -- How much outreach this address had already received when it was silenced.
  -- A suppression on a host pitched nine times reads differently from one on a
  -- host pitched once.
  touch_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  suppression.contact_email,
  suppression.reason,
  suppression.source,
  suppression.note,
  suppression.created_at,
  actor.email AS created_by_email,
  COALESCE(book.host_name, target.host_name, contact.host_name) AS host_name,
  COALESCE(book.podcast_name, target.podcast_name, catalog_show.podcast_name) AS podcast_name,
  COALESCE(book.podcast_id, target.podcast_id, catalog_show.podscan_id) AS podcast_id,
  COALESCE(target.touch_count, 0) AS touch_count
FROM public.workspace_outreach_suppressions suppression
LEFT JOIN auth.users actor ON actor.id = suppression.created_by
-- The book first: an operator-curated identity outranks every derived one.
LEFT JOIN LATERAL (
  SELECT relationship.podcast_id, relationship.podcast_name, relationship.host_name
  FROM public.workspace_host_relationships relationship
  WHERE relationship.workspace_id = p_workspace_id
    AND lower(btrim(relationship.contact_email)) = suppression.contact_email
  ORDER BY relationship.updated_at DESC
  LIMIT 1
) book ON TRUE
-- Then this workspace's own outreach, which also supplies the touch count.
LEFT JOIN LATERAL (
  SELECT
    (ARRAY_AGG(campaign_target.podcast_id ORDER BY campaign_target.updated_at DESC))[1] AS podcast_id,
    (ARRAY_AGG(campaign_target.podcast_name ORDER BY campaign_target.updated_at DESC))[1] AS podcast_name,
    (ARRAY_AGG(campaign_target.host_name ORDER BY campaign_target.updated_at DESC))[1] AS host_name,
    COUNT(*)::INTEGER AS touch_count
  FROM public.workspace_client_campaign_targets campaign_target
  WHERE campaign_target.workspace_id = p_workspace_id
    AND campaign_target.normalized_contact_email = suppression.contact_email
    AND (campaign_target.launched_at IS NOT NULL OR campaign_target.instantly_lead_id IS NOT NULL)
) target ON TRUE
-- Finally the shared catalog, read for identity only: this workspace already
-- holds the address, so no contact data crosses a tenant boundary here.
LEFT JOIN LATERAL (
  SELECT direct_contact.host_name, direct_contact.podcast_id
  FROM public.podcast_direct_contacts direct_contact
  WHERE direct_contact.normalized_email = suppression.contact_email
  LIMIT 1
) contact ON TRUE
LEFT JOIN public.podcasts catalog_show ON catalog_show.id = contact.podcast_id
WHERE suppression.workspace_id = p_workspace_id
ORDER BY suppression.created_at DESC
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

COMMENT ON FUNCTION public.workspace_outreach_suppression_list_v1(UUID, INTEGER) IS
  'The workspace do-not-contact list with the host identity behind each address, so an operator can review a suppression rather than a bare string.';

REVOKE ALL ON FUNCTION public.workspace_outreach_suppression_list_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_outreach_suppression_list_v1(UUID, INTEGER) TO service_role;
