-- Agency relationship memory: what this workspace already means to a host.
--
-- An agency pitches the same show for many clients over time. Today every
-- pitch is written as if the agency had never met the host, which is at best
-- odd and at worst insulting: sending a cold open to someone we are mid
-- conversation with, or who has already hosted one of our guests, throws away
-- the single asset an agency has that a freelancer with a podcast database
-- does not.
--
-- Two objects here. A workspace-wide suppression list (an opt-out is against
-- the SENDER, so it must silence every client, not just the one that provoked
-- it), and a function that reduces prior contact to one relationship state per
-- show so callers can gate on it and prompts can speak to it.

CREATE TABLE public.workspace_outreach_suppressions (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Keyed by contact, not by show: a host who opts out is opting out as a
  -- person, including for the other shows they run.
  contact_email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'opted_out',
  source TEXT NOT NULL DEFAULT 'inbox_auto',
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, contact_email)
);

COMMENT ON TABLE public.workspace_outreach_suppressions IS
  'Workspace-wide do-not-contact list. An opt-out from any client''s outreach silences the address for every client in that workspace.';

ALTER TABLE public.workspace_outreach_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_outreach_suppressions FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_outreach_suppressions FROM PUBLIC, anon, authenticated;

-- Paired isolation policy, matching the tenancy pattern used elsewhere: the
-- table is reachable only through SECURITY DEFINER helpers and the service
-- role, never by a browser session directly.
CREATE POLICY workspace_outreach_suppressions_isolation
  ON public.workspace_outreach_suppressions
  FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

-- Relationship state for a batch of shows, from this workspace's point of
-- view. Severity order matters: the first state that applies wins, because
-- callers act on the most restrictive truth.
--
--   suppressed      the host asked us to stop. Never contact again.
--   in_conversation a thread is live right now, or outreach is mid-flight.
--                   A cold pitch here is the worst possible look.
--   booked          we have placed a guest. The warmest asset we own.
--   replied         the host engaged but did not book.
--   pitched         we contacted them and heard nothing back.
--   none            genuinely cold.
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
-- Every target this workspace has ever created for the requested shows.
touches AS (
  SELECT
    t.podcast_id,
    t.client_id,
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
-- The address we would write to, so suppression and cross-show checks can
-- reason about the human rather than the feed.
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
    WHEN s.contact_email IS NOT NULL THEN 'suppressed'
    WHEN EXISTS (
      SELECT 1 FROM touches t
      WHERE t.podcast_id = r.podcast_id
        AND (t.status IN ('launching', 'in_outreach', 'replied') OR t.email_reply_count > 0)
    ) AND bk.client_name IS NULL THEN 'in_conversation'
    WHEN bk.client_name IS NOT NULL THEN 'booked'
    WHEN EXISTS (
      SELECT 1 FROM touches t WHERE t.podcast_id = r.podcast_id AND t.email_reply_count > 0
    ) THEN 'replied'
    WHEN EXISTS (
      SELECT 1 FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted
    ) THEN 'pitched'
    ELSE 'none'
  END AS state,
  (SELECT COUNT(*)::INTEGER FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted) AS touch_count,
  (SELECT MAX(t.touched_at) FROM touches t WHERE t.podcast_id = r.podcast_id AND t.contacted) AS last_contacted_at,
  (SELECT t.client_name FROM touches t
    WHERE t.podcast_id = r.podcast_id AND t.contacted
    ORDER BY t.touched_at DESC NULLS LAST LIMIT 1) AS last_client_name,
  bk.client_name AS booked_client_name,
  bk.booked_at,
  bk.episode_url AS booked_episode_url,
  (SELECT t.client_name FROM touches t
    WHERE t.podcast_id = r.podcast_id AND t.email_reply_count > 0
    ORDER BY t.touched_at DESC NULLS LAST LIMIT 1) AS replied_client_name,
  rc.contact_email,
  -- The same person often hosts more than one show. Contacting them twice
  -- because we think of them as two feeds is the mistake this flags.
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
  'Per-show relationship state for one workspace: suppressed | in_conversation | booked | replied | pitched | none, with the evidence a pitch can reference.';

REVOKE ALL ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_podcast_relationships_v1(UUID, TEXT[]) TO service_role;

CREATE INDEX workspace_client_campaign_targets_contact_email_idx
  ON public.workspace_client_campaign_targets (workspace_id, lower(contact_email))
  WHERE contact_email IS NOT NULL;
