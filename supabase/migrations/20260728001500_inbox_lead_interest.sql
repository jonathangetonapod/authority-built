-- Make "mark as Interested" actually move the conversation.
--
-- The Master Inbox writes interest to the LEAD, via Instantly's
-- /leads/update-interest-status, but decides which bucket a conversation
-- belongs in by reading i_status off each EMAIL row returned by the provider's
-- email list. Those are different records. Setting a lead to Interested leaves
-- the already-fetched email rows saying otherwise, so the thread stays under
-- "Other replies" and the operator's decision looks like it did nothing — the
-- UI even promises it "moves this conversation between Interested only and
-- Other replies".
--
-- The decision is recorded here so it survives regardless of whether, or when,
-- the provider propagates it onto email records. Interest in Instantly belongs
-- to the lead rather than the thread, so this is keyed the same way: every
-- conversation with that person moves together, which is what an operator
-- means when they mark someone interested.

CREATE TABLE public.workspace_inbox_lead_interest (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_email TEXT NOT NULL,
  -- Instantly's own vocabulary, so nothing has to be translated back.
  -- NULL is a real value here: it is the "Reset" action, meaning the operator
  -- deliberately cleared the status rather than never having set one.
  interest_value INTEGER,
  set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, contact_email),
  -- Every lookup compares a lower(btrim(...)) address. A free-form column would
  -- let a stored override silently match nothing, the same way the suppression
  -- list could before 20260728001200.
  CONSTRAINT workspace_inbox_lead_interest_email_normalized_check
    CHECK (contact_email = lower(btrim(contact_email)) AND contact_email <> ''),
  CONSTRAINT workspace_inbox_lead_interest_value_check
    CHECK (interest_value IS NULL OR interest_value IN (1, 2, 3, 4, 0, -1, -2, -3, -4))
);

COMMENT ON TABLE public.workspace_inbox_lead_interest IS
  'Operator-set Instantly interest status per lead address. Read in preference to the i_status on provider email rows, which does not reflect a lead update.';

ALTER TABLE public.workspace_inbox_lead_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_inbox_lead_interest FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_inbox_lead_interest FROM PUBLIC, anon, authenticated;

CREATE POLICY workspace_inbox_lead_interest_isolation
  ON public.workspace_inbox_lead_interest
  FOR ALL
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_inbox_lead_interest TO service_role;
