-- When this host was last emailed, as distinct from when the record changed.
--
-- last_activity_at is written from the provider's timestamp_updated, which
-- moves whenever anything about the lead changes — an open, an interest edit,
-- a re-enrichment. It cannot answer "when did we last email this host", and so
-- it cannot be the basis for "when are they due to hear from us next".
--
-- Instantly has no forward-looking field at all: every timestamp on a lead
-- points backwards. Projecting the next send is therefore arithmetic done here,
-- and it needs the one input the provider does give us plainly.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_client_campaign_targets.last_contact_at IS
  'When an email last went out to this host, from the provider timestamp_last_contact. NULL means nothing has been sent yet. Distinct from last_activity_at, which tracks any change to the lead record.';
