-- One podcast, one journey.
--
-- A booking is the last stage of a show's journey, but until now it carried
-- no durable link back to the shortlist row it came from or the campaign
-- target that earned the reply — the lifecycle view had to fall back to
-- fuzzy name matching, so a renamed show orphaned its own history.
--
-- These columns are nullable: existing bookings and any placement logged
-- for a show that was never on the shortlist stay valid, and readers keep
-- their name-matching fallback. Composite foreign keys make a cross-tenant
-- or cross-client reference unrepresentable.

ALTER TABLE public.bookings
  ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN shortlist_podcast_id UUID,
  ADD COLUMN campaign_target_id UUID;

-- Backfill the workspace from the owning client so existing rows join cleanly.
UPDATE public.bookings AS b
SET workspace_id = c.workspace_id
FROM public.clients AS c
WHERE c.id = b.client_id
  AND b.workspace_id IS NULL
  AND c.workspace_id IS NOT NULL;

-- The shortlist row must belong to the same client as the booking.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_shortlist_podcast_fk
  FOREIGN KEY (client_id, shortlist_podcast_id)
  REFERENCES public.client_dashboard_podcasts(client_id, id) ON DELETE SET NULL;

-- The campaign target must belong to the same workspace and client.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspace_client_campaign_targets'::regclass
      AND conname = 'workspace_client_campaign_targets_workspace_client_id_key'
  ) THEN
    ALTER TABLE public.workspace_client_campaign_targets
      ADD CONSTRAINT workspace_client_campaign_targets_workspace_client_id_key
      UNIQUE (workspace_id, client_id, id);
  END IF;
END;
$$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_campaign_target_fk
  FOREIGN KEY (workspace_id, client_id, campaign_target_id)
  REFERENCES public.workspace_client_campaign_targets(workspace_id, client_id, id)
  ON DELETE SET NULL;

-- One booking per campaign target: the inbox can create a booking on
-- "Mark booked" without ever producing a duplicate for the same outreach.
CREATE UNIQUE INDEX bookings_one_per_campaign_target_idx
  ON public.bookings (campaign_target_id)
  WHERE campaign_target_id IS NOT NULL;

CREATE INDEX bookings_shortlist_podcast_idx
  ON public.bookings (client_id, shortlist_podcast_id)
  WHERE shortlist_podcast_id IS NOT NULL;
