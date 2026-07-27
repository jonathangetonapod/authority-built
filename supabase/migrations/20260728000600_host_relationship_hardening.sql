-- Harden host relationship attribution after the first relationship-book
-- release. A thread may only name a show when its client + host address maps
-- to one show, manual do-not-contact must participate in the send gate, and
-- client references must be tenant-consistent at the database boundary.

-- The original backfill joined historical threads to every target for their
-- client and PostgreSQL could choose an arbitrary target. Preserve the only
-- provably safe case (a client with one contacted show); ambiguous histories
-- will be repopulated from the provider by the corrected inbox ingestion.
WITH multi_target_clients AS (
  SELECT workspace_id, client_id
  FROM public.workspace_client_campaign_targets
  WHERE launched_at IS NOT NULL OR instantly_lead_id IS NOT NULL
  GROUP BY workspace_id, client_id
  HAVING COUNT(DISTINCT podcast_id) > 1
)
UPDATE public.workspace_inbox_thread_state state
SET lead_email = NULL,
    podcast_id = NULL
FROM multi_target_clients ambiguous
WHERE state.workspace_id = ambiguous.workspace_id
  AND state.client_id = ambiguous.client_id;

-- A planned client association cannot point across workspace boundaries even
-- if a future service-role caller forgets the application-level check.
ALTER TABLE public.workspace_host_relationship_clients
  ADD CONSTRAINT workspace_host_relationship_clients_workspace_client_fk
  FOREIGN KEY (workspace_id, client_id)
  REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.workspace_host_relationship_events
  ADD CONSTRAINT workspace_host_relationship_events_workspace_client_fk
  FOREIGN KEY (workspace_id, client_id)
  REFERENCES public.clients(workspace_id, id);

-- Keep access explicit even on projects whose default privileges do not
-- automatically grant new tables to the Edge Functions' service role.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_host_relationships TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_host_relationship_clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_host_relationship_events TO service_role;

-- Relationship state, including an operator's explicit do-not-contact stage.
CREATE OR REPLACE FUNCTION public.workspace_podcast_relationships_v1(
  p_workspace_id UUID,
  p_podcast_ids TEXT[]
)
RETURNS TABLE (
  podcast_id TEXT,
  state TEXT,
  touch_count INTEGER,
  last_contacted_at TIMESTAMPTZ,
  last_client_name TEXT,
  booked_client_name TEXT,
  booked_at DATE,
  booked_episode_url TEXT,
  replied_client_name TEXT,
  contact_email TEXT,
  same_contact_other_show BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH requested AS (
  SELECT DISTINCT unnest(p_podcast_ids) AS podcast_id
),
touches AS (
  SELECT
    t.podcast_id,
    t.status,
    t.email_reply_count,
    lower(NULLIF(btrim(t.contact_email), '')) AS contact_email,
    COALESCE(t.launched_at, t.last_activity_at, t.updated_at) AS touched_at,
    (t.launched_at IS NOT NULL OR t.instantly_lead_id IS NOT NULL) AS contacted,
    c.name AS client_name
  FROM public.workspace_client_campaign_targets t
  JOIN public.clients c ON c.id = t.client_id
  WHERE t.workspace_id = p_workspace_id
    AND t.podcast_id = ANY (p_podcast_ids)
),
threads AS (
  SELECT
    ts.podcast_id,
    ts.status,
    ts.suppressed_at,
    ts.updated_at,
    ts.classification ->> 'label' AS label,
    c.name AS client_name
  FROM public.workspace_inbox_thread_state ts
  JOIN public.clients c ON c.id = ts.client_id
  WHERE ts.workspace_id = p_workspace_id
    AND ts.podcast_id = ANY (p_podcast_ids)
),
resolved_contact AS (
  SELECT
    r.podcast_id,
    COALESCE(
      (SELECT lower(NULLIF(btrim(hr.contact_email), ''))
        FROM public.workspace_host_relationships hr
        WHERE hr.workspace_id = p_workspace_id AND hr.podcast_id = r.podcast_id),
      (SELECT tt.contact_email FROM touches tt
        WHERE tt.podcast_id = r.podcast_id AND tt.contact_email IS NOT NULL
        ORDER BY tt.touched_at DESC NULLS LAST LIMIT 1),
      (SELECT lower(dc.email) FROM public.podcast_direct_contacts dc
        JOIN public.podcasts p ON p.id = dc.podcast_id
        WHERE p.podscan_id = r.podcast_id
          AND dc.verification_status = 'verified'
        LIMIT 1)
    ) AS contact_email
  FROM requested r
),
bookings_for AS (
  SELECT
    b.podcast_id,
    c.name AS client_name,
    COALESCE(b.publish_date, b.recording_date, b.scheduled_date) AS booked_at,
    b.episode_url,
    ROW_NUMBER() OVER (
      PARTITION BY b.podcast_id
      ORDER BY COALESCE(b.publish_date, b.recording_date, b.scheduled_date) DESC NULLS LAST
    ) AS rn
  FROM public.bookings b
  JOIN public.clients c ON c.id = b.client_id
  WHERE c.workspace_id = p_workspace_id
    AND b.podcast_id = ANY (p_podcast_ids)
    AND b.status <> 'cancelled'
)
SELECT
  r.podcast_id,
  CASE
    WHEN curated.manual_stage = 'do_not_contact' THEN 'suppressed'
    WHEN s.contact_email IS NOT NULL
      OR EXISTS (SELECT 1 FROM threads th WHERE th.podcast_id = r.podcast_id AND th.suppressed_at IS NOT NULL)
      THEN 'suppressed'
    WHEN EXISTS (
      SELECT 1 FROM threads th
      WHERE th.podcast_id = r.podcast_id
        AND th.status IN ('needs_reply', 'review', 'replied')
    ) THEN 'in_conversation'
    WHEN EXISTS (
      SELECT 1 FROM touches t
      WHERE t.podcast_id = r.podcast_id
        AND (t.status IN ('launching', 'in_outreach', 'replied') OR t.email_reply_count > 0)
    ) AND bk.client_name IS NULL
      AND NOT EXISTS (SELECT 1 FROM threads th WHERE th.podcast_id = r.podcast_id AND th.status = 'booked')
      THEN 'in_conversation'
    WHEN bk.client_name IS NOT NULL
      OR EXISTS (SELECT 1 FROM threads th WHERE th.podcast_id = r.podcast_id AND th.status = 'booked')
      THEN 'booked'
    WHEN EXISTS (
      SELECT 1 FROM threads th
      WHERE th.podcast_id = r.podcast_id AND th.label IN ('not_interested', 'not_now')
    ) THEN 'declined'
    WHEN EXISTS (SELECT 1 FROM threads th WHERE th.podcast_id = r.podcast_id)
      OR EXISTS (SELECT 1 FROM touches t WHERE t.podcast_id = r.podcast_id AND t.email_reply_count > 0)
      THEN 'replied'
    WHEN EXISTS (SELECT 1 FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted)
      THEN 'pitched'
    ELSE 'none'
  END AS state,
  (SELECT COUNT(*)::INTEGER FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted) AS touch_count,
  GREATEST(
    (SELECT MAX(t.touched_at) FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted),
    (SELECT MAX(th.updated_at) FROM threads th WHERE th.podcast_id = r.podcast_id)
  ) AS last_contacted_at,
  COALESCE(
    (SELECT t.client_name FROM touches t
      WHERE t.podcast_id = r.podcast_id AND t.contacted
      ORDER BY t.touched_at DESC NULLS LAST LIMIT 1),
    (SELECT th.client_name FROM threads th
      WHERE th.podcast_id = r.podcast_id
      ORDER BY th.updated_at DESC NULLS LAST LIMIT 1)
  ) AS last_client_name,
  COALESCE(
    bk.client_name,
    (SELECT th.client_name FROM threads th WHERE th.podcast_id = r.podcast_id AND th.status = 'booked' LIMIT 1)
  ) AS booked_client_name,
  bk.booked_at,
  bk.episode_url AS booked_episode_url,
  COALESCE(
    (SELECT th.client_name FROM threads th
      WHERE th.podcast_id = r.podcast_id
      ORDER BY th.updated_at DESC NULLS LAST LIMIT 1),
    (SELECT t.client_name FROM touches t
      WHERE t.podcast_id = r.podcast_id AND t.email_reply_count > 0
      ORDER BY t.touched_at DESC NULLS LAST LIMIT 1)
  ) AS replied_client_name,
  rc.contact_email,
  COALESCE((
    SELECT TRUE FROM public.workspace_client_campaign_targets other
    WHERE other.workspace_id = p_workspace_id
      AND other.podcast_id <> r.podcast_id
      AND rc.contact_email IS NOT NULL
      AND lower(NULLIF(btrim(other.contact_email), '')) = rc.contact_email
      AND (other.launched_at IS NOT NULL OR other.instantly_lead_id IS NOT NULL)
    LIMIT 1
  ), FALSE) AS same_contact_other_show
FROM requested r
LEFT JOIN resolved_contact rc ON rc.podcast_id = r.podcast_id
LEFT JOIN bookings_for bk ON bk.podcast_id = r.podcast_id AND bk.rn = 1
LEFT JOIN public.workspace_outreach_suppressions s
  ON s.workspace_id = p_workspace_id AND s.contact_email = rc.contact_email
-- Prefer an exact show record. A free-form relationship can still protect a
-- future canonical show when its normalized host address is unambiguous.
LEFT JOIN LATERAL (
  SELECT relationship.manual_stage
  FROM public.workspace_host_relationships relationship
  WHERE relationship.workspace_id = p_workspace_id
    AND relationship.manual_stage = 'do_not_contact'
    AND (
      relationship.podcast_id = r.podcast_id
      OR (
        rc.contact_email IS NOT NULL
        AND lower(NULLIF(btrim(relationship.contact_email), '')) = rc.contact_email
      )
    )
  ORDER BY (relationship.podcast_id = r.podcast_id) DESC, relationship.updated_at DESC
  LIMIT 1
) curated ON TRUE;
$$;

COMMENT ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) IS
  'Per-show relationship state for one workspace, including reply threads and operator do-not-contact decisions.';

REVOKE ALL ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) TO service_role;

-- The book contains real contact, booking, and curated history. Draft shortlist
-- targets no longer crowd out actual relationships, while direct bookings are
-- included even if they did not originate from a campaign.
CREATE OR REPLACE FUNCTION public.workspace_host_relationship_book_v1(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  podcast_id TEXT,
  podcast_name TEXT,
  host_name TEXT,
  contact_email TEXT,
  derived_state TEXT,
  manual_stage TEXT,
  summary TEXT,
  last_contacted_at TIMESTAMPTZ,
  touch_count INTEGER,
  booked_client_name TEXT,
  client_count INTEGER,
  note_count INTEGER,
  last_note_at TIMESTAMPTZ,
  curated BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH known AS (
  SELECT DISTINCT podcast_id
  FROM public.workspace_client_campaign_targets
  WHERE workspace_id = p_workspace_id
    AND (launched_at IS NOT NULL OR instantly_lead_id IS NOT NULL)
  UNION
  SELECT DISTINCT podcast_id
  FROM public.workspace_inbox_thread_state
  WHERE workspace_id = p_workspace_id AND podcast_id IS NOT NULL
  UNION
  SELECT DISTINCT b.podcast_id
  FROM public.bookings b
  JOIN public.clients c ON c.id = b.client_id
  WHERE c.workspace_id = p_workspace_id
    AND b.podcast_id IS NOT NULL
    AND b.status <> 'cancelled'
  UNION
  SELECT DISTINCT podcast_id
  FROM public.workspace_host_relationships
  WHERE workspace_id = p_workspace_id
),
rel AS (
  SELECT * FROM public.workspace_podcast_relationships_v1(
    p_workspace_id,
    ARRAY(SELECT entry.podcast_id FROM known entry WHERE entry.podcast_id IS NOT NULL)
  )
)
SELECT
  rel.podcast_id,
  COALESCE(book.podcast_name, catalog.podcast_name, target.podcast_name, booking_record.podcast_name) AS podcast_name,
  COALESCE(book.host_name, catalog.host_name, target.host_name, booking_record.host_name) AS host_name,
  COALESCE(book.contact_email, rel.contact_email) AS contact_email,
  rel.state AS derived_state,
  book.manual_stage,
  book.summary,
  rel.last_contacted_at,
  rel.touch_count,
  rel.booked_client_name,
  COALESCE((
    SELECT COUNT(DISTINCT linked.client_id)::INTEGER
    FROM (
      SELECT association.client_id
      FROM public.workspace_host_relationship_clients association
      WHERE association.workspace_id = p_workspace_id AND association.podcast_id = rel.podcast_id
      UNION
      SELECT campaign_target.client_id
      FROM public.workspace_client_campaign_targets campaign_target
      WHERE campaign_target.workspace_id = p_workspace_id
        AND campaign_target.podcast_id = rel.podcast_id
        AND (campaign_target.launched_at IS NOT NULL OR campaign_target.instantly_lead_id IS NOT NULL)
      UNION
      SELECT thread.client_id
      FROM public.workspace_inbox_thread_state thread
      WHERE thread.workspace_id = p_workspace_id AND thread.podcast_id = rel.podcast_id
      UNION
      SELECT booking.client_id
      FROM public.bookings booking
      JOIN public.clients booking_client ON booking_client.id = booking.client_id
      WHERE booking_client.workspace_id = p_workspace_id
        AND booking.podcast_id = rel.podcast_id
        AND booking.status <> 'cancelled'
    ) linked
  ), 0) AS client_count,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = rel.podcast_id AND event.kind <> 'system'
  ), 0) AS note_count,
  (
    SELECT MAX(event.occurred_at) FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = rel.podcast_id
  ) AS last_note_at,
  (book.podcast_id IS NOT NULL) AS curated
FROM rel
LEFT JOIN public.workspace_host_relationships book
  ON book.workspace_id = p_workspace_id AND book.podcast_id = rel.podcast_id
LEFT JOIN public.podcasts catalog ON catalog.podscan_id = rel.podcast_id
LEFT JOIN LATERAL (
  SELECT campaign_target.podcast_name, campaign_target.host_name
  FROM public.workspace_client_campaign_targets campaign_target
  WHERE campaign_target.workspace_id = p_workspace_id AND campaign_target.podcast_id = rel.podcast_id
  ORDER BY campaign_target.updated_at DESC
  LIMIT 1
) target ON TRUE
LEFT JOIN LATERAL (
  SELECT booking.podcast_name, booking.host_name
  FROM public.bookings booking
  JOIN public.clients booking_client ON booking_client.id = booking.client_id
  WHERE booking_client.workspace_id = p_workspace_id
    AND booking.podcast_id = rel.podcast_id
    AND booking.status <> 'cancelled'
  ORDER BY COALESCE(booking.publish_date, booking.recording_date, booking.scheduled_date) DESC NULLS LAST,
    booking.updated_at DESC
  LIMIT 1
) booking_record ON TRUE
ORDER BY
  CASE rel.state
    WHEN 'in_conversation' THEN 0
    WHEN 'booked' THEN 1
    WHEN 'replied' THEN 2
    WHEN 'declined' THEN 3
    WHEN 'suppressed' THEN 4
    ELSE 5
  END,
  rel.last_contacted_at DESC NULLS LAST
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000));
$$;

COMMENT ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) IS
  'Every host this workspace has contacted, booked, or curated, with derived outreach state and operator notes.';

REVOKE ALL ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) TO service_role;
