-- Make a host's reply the thing that records the relationship.
--
-- Until now a relationship was inferred from campaign-target reply counts,
-- which only move when an operator runs an Instantly analytics sync. A host
-- could reply, land in Master Inbox, and still read as "never contacted" at
-- pitch time — the exact moment the warning matters most.
--
-- Threads now carry the address that wrote to us and the show it came from,
-- so the response itself enters the register the instant it arrives.

ALTER TABLE public.workspace_inbox_thread_state
  ADD COLUMN lead_email TEXT,
  ADD COLUMN podcast_id TEXT;

COMMENT ON COLUMN public.workspace_inbox_thread_state.lead_email IS
  'Host address on this thread, lowercased. Links a reply to the contact and to the show it came from.';
COMMENT ON COLUMN public.workspace_inbox_thread_state.podcast_id IS
  'Podscan podcast id this conversation belongs to, resolved from the campaign target at ingestion.';

CREATE INDEX workspace_inbox_thread_state_podcast_idx
  ON public.workspace_inbox_thread_state (workspace_id, podcast_id)
  WHERE podcast_id IS NOT NULL;

-- Backfill from the campaign targets, which already hold the contact address
-- per show; threads created before this change get their link where the
-- address is unambiguous within the workspace.
UPDATE public.workspace_inbox_thread_state ts
SET podcast_id = t.podcast_id,
    lead_email = lower(btrim(t.contact_email))
FROM public.workspace_client_campaign_targets t
WHERE ts.podcast_id IS NULL
  AND t.workspace_id = ts.workspace_id
  AND t.client_id = ts.client_id
  AND t.contact_email IS NOT NULL
  AND t.instantly_lead_id IS NOT NULL;

-- Relationship state, now driven by conversations as well as campaign rows.
-- A thread is the strongest evidence available: it means a human replied.
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
-- Conversations. A row here means a host actually wrote back.
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
    -- Opted out, here or on any conversation with them.
    WHEN s.contact_email IS NOT NULL
      OR EXISTS (SELECT 1 FROM threads th WHERE th.podcast_id = r.podcast_id AND th.suppressed_at IS NOT NULL)
      THEN 'suppressed'
    -- A live thread is the strongest reason not to open cold.
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
    -- They engaged and passed. Worth knowing, and worth writing differently.
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
    SELECT TRUE FROM public.workspace_client_campaign_targets o
    WHERE o.workspace_id = p_workspace_id
      AND o.podcast_id <> r.podcast_id
      AND rc.contact_email IS NOT NULL
      AND lower(NULLIF(btrim(o.contact_email), '')) = rc.contact_email
      AND (o.launched_at IS NOT NULL OR o.instantly_lead_id IS NOT NULL)
    LIMIT 1
  ), FALSE) AS same_contact_other_show
FROM requested r
LEFT JOIN resolved_contact rc ON rc.podcast_id = r.podcast_id
LEFT JOIN bookings_for bk ON bk.podcast_id = r.podcast_id AND bk.rn = 1
LEFT JOIN public.workspace_outreach_suppressions s
  ON s.workspace_id = p_workspace_id AND s.contact_email = rc.contact_email;
$$;

COMMENT ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) IS
  'Per-show relationship state for one workspace: suppressed | in_conversation | booked | declined | replied | pitched | none, driven by conversations as well as campaign rows.';
