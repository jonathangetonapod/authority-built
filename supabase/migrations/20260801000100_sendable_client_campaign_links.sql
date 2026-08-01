-- Which linked campaigns can actually be sent into, and where a lead went.
--
-- A client may have several Instantly campaigns linked for Master Inbox
-- attribution, and an operator now chooses which one a pitch joins. Those two
-- facts are not the same: a campaign built by hand in Instantly carries its own
-- sequence and none of the goap* custom variables, so staging a lead into it
-- would send that campaign's copy instead of the pitch somebody wrote, and
-- report success while doing it.
--
-- provisioned_at records that this app created the campaign and registered the
-- three-step sequence and the variables it reads. Only a provisioned link is
-- offered as a send target; the rest stay attribution-only. It is a timestamp
-- rather than a boolean so the record says when the guarantee was established,
-- which matters if the sequence shape changes later.

ALTER TABLE public.client_instantly_campaign_links
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.client_instantly_campaign_links.provisioned_at IS
  'Set when this app created the campaign and registered the GOAP sequence and custom variables. NULL means attribution-only: replies are attributed to the client, but no pitch may be sent into it.';

-- Which Instantly campaign this target''s lead was staged into. Null on rows
-- written before the picker existed, and on targets with no lead yet; those
-- resolve to the client''s own campaign, which is where they went.
ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN IF NOT EXISTS instantly_campaign_id UUID;

COMMENT ON COLUMN public.workspace_client_campaign_targets.instantly_campaign_id IS
  'The Instantly campaign this target''s lead was staged into. NULL means the client''s own campaign on workspace_client_campaigns.';

-- Reading "which targets went into this campaign" is the question the Master
-- Inbox and the campaign detail page both ask.
CREATE INDEX IF NOT EXISTS workspace_client_campaign_targets_instantly_campaign_idx
  ON public.workspace_client_campaign_targets (workspace_id, instantly_campaign_id)
  WHERE instantly_campaign_id IS NOT NULL;
