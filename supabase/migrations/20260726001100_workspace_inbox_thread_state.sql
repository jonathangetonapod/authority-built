-- Persisted Master Inbox thread state.
--
-- Inspired by the Reply control plane: classification, the staged reply
-- package (draft + numbered nudges), and the thread lifecycle survive
-- navigation and sessions instead of living in browser state. One row per
-- Instantly thread per workspace; rows exist only for threads an operator
-- or the AI has touched. Managed exclusively by the
-- workspace-client-campaigns edge function (service role).

CREATE TABLE public.workspace_inbox_thread_state (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_key TEXT NOT NULL,
  client_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_reply'
    CHECK (status IN ('needs_reply', 'review', 'replied', 'booked', 'archived')),
  classification JSONB,
  draft JSONB,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, thread_key),
  CONSTRAINT workspace_inbox_thread_state_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workspace_inbox_thread_state_thread_key_length
    CHECK (char_length(thread_key) BETWEEN 1 AND 120)
);

CREATE INDEX workspace_inbox_thread_state_client_idx
  ON public.workspace_inbox_thread_state (workspace_id, client_id);

ALTER TABLE public.workspace_inbox_thread_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workspace_inbox_thread_state FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_inbox_thread_state TO service_role;
