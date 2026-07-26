-- Client ↔ Instantly campaign links.
--
-- Workspaces run campaigns directly in Instantly and want their replies
-- attributed to the right client in the Master Inbox. A link associates an
-- Instantly campaign id with one client; the primary key makes a campaign
-- linkable to exactly one client per workspace, so inbox attribution is
-- never ambiguous. Rows are managed only by the workspace-client-campaigns
-- edge function (service role); tenants never touch the table directly.

CREATE TABLE public.client_instantly_campaign_links (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  instantly_campaign_id UUID NOT NULL,
  campaign_name TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, instantly_campaign_id),
  CONSTRAINT client_instantly_campaign_links_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT client_instantly_campaign_links_name_length
    CHECK (campaign_name IS NULL OR char_length(campaign_name) <= 300)
);

CREATE INDEX client_instantly_campaign_links_client_idx
  ON public.client_instantly_campaign_links (workspace_id, client_id);

ALTER TABLE public.client_instantly_campaign_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_instantly_campaign_links FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.client_instantly_campaign_links TO service_role;
