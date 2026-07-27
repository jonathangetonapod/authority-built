-- "Send to Client Campaign" now creates the Instantly lead.
--
-- Until now lead creation and campaign activation were one step, so
-- instantly_lead_id meant "outreach has started" and launched_at meant the same
-- thing. Jonathan chose (2026-07-27) to push the lead at prepare time instead,
-- with the consequence stated plainly: a lead added to an ACTIVE campaign is
-- emailed on the next send window, with no further approval.
--
-- That splits one fact into two, and the schema has to say which is which:
--   lead_staged_at            the lead exists in the provider campaign
--   launched_at               an operator explicitly started outreach
--
-- lead_staged_campaign_status records what the provider campaign's status was
-- at the moment the lead was pushed, because that is what decides whether the
-- host hears from us immediately. Reading it back later from the provider tells
-- you today's status, not the one that applied when the decision was made.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN IF NOT EXISTS lead_staged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_staged_campaign_status INTEGER;

COMMENT ON COLUMN public.workspace_client_campaign_targets.lead_staged_at IS
  'When the Instantly lead was created by Send to Client Campaign. Not the same as launched_at: staging into an active campaign sends, staging into a paused one does not.';
COMMENT ON COLUMN public.workspace_client_campaign_targets.lead_staged_campaign_status IS
  'Provider campaign status at the moment the lead was staged (1 = active, so the sequence began). Recorded because the live status answers a different question later.';

-- Every target that already carries a lead got it from the launch path, where
-- creating it and activating the campaign happened together.
UPDATE public.workspace_client_campaign_targets
SET lead_staged_at = COALESCE(launched_at, updated_at),
    lead_staged_campaign_status = 1
WHERE instantly_lead_id IS NOT NULL
  AND lead_staged_at IS NULL;

CREATE INDEX IF NOT EXISTS workspace_client_campaign_targets_staged_idx
  ON public.workspace_client_campaign_targets (workspace_id, campaign_id)
  WHERE lead_staged_at IS NOT NULL AND launched_at IS NULL;
