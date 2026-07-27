-- The relationship book is a curated list, not a log of everything touched.
--
-- It has been auto-populating from campaign targets, inbox threads, and
-- bookings, and folding in the legacy outreach ledger (20260728001100) pushed
-- one workspace to 106 rows in a morning — 105 of them shows nobody had
-- deliberately filed. That buries the handful of relationships someone
-- actually curated under everything the agency has ever emailed.
--
-- Jonathan's rule (2026-07-27): a show enters the book only when a person puts
-- it there — "Add relationship", or "Save to relationships" from the Master
-- Inbox. Both write workspace_host_relationships, so that single table is the
-- membership test.
--
-- IMPORTANT: this narrows the BOOK only. workspace_podcast_relationships_v1 is
-- untouched and still reads campaign targets, inbox threads, bookings, and the
-- legacy ledger, so the pitch writer and the launch gate keep refusing to open
-- cold on a host the agency has already contacted. Losing that would be the
-- expensive mistake; losing the list clutter is the point.

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
  -- The only source. "Add relationship" inserts here directly, and the Master
  -- Inbox capture inserts here before recording the thread, so both curated
  -- routes are covered and nothing else can enrol a show behind the operator.
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
  'Hosts a person deliberately filed: added by hand, or saved from the Master Inbox. Derived outreach state still comes from campaigns, threads, bookings, and the legacy ledger, but none of those enrol a show on their own.';

REVOKE ALL ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_host_relationship_book_v1(UUID, INTEGER) TO service_role;
