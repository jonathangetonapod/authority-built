-- Reply-rate-by-prompt-version, made queryable from day one.
--
-- Every generated pitch is stamped with the prompt-chain revision that wrote
-- it (PITCH_CHAIN_VERSION in workspace-client-shortlist). Persisting that
-- stamp on the campaign target ties eventual replies and bookings back to
-- the exact chain revision, so prompt changes can be judged by outcomes
-- instead of taste.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN pitch_chain_version TEXT;

COMMENT ON COLUMN public.workspace_client_campaign_targets.pitch_chain_version IS
  'Prompt-chain revision that generated the saved pitch copy (e.g. p2-2026-07-27); null for hand-written or legacy pitches.';
