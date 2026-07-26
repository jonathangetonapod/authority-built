-- Per-client AI SDR prompts.
--
-- The workspace prompt set is the house style; a client row overrides any of
-- those prompts for one client only — research, pitch writing, and inbox
-- replies alike. Resolution at generation time is
-- client override -> workspace override -> shipped default, so a workspace
-- that never touches this table behaves exactly as before.
--
-- Managed only by the workspace-client-campaigns edge function (service
-- role) and gated to the workspace owner, matching the workspace prompts.

CREATE TABLE public.client_ai_sdr_prompts (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research', 'host_info', 'guest_info', 'host_name_extractor',
    'find_topics', 'write_email', 'clean_email', 'inbox_reply', 'inbox_nudges'
  )),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, client_id, prompt_id),
  CONSTRAINT client_ai_sdr_prompts_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX client_ai_sdr_prompts_client_idx
  ON public.client_ai_sdr_prompts (workspace_id, client_id);

ALTER TABLE public.client_ai_sdr_prompts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.client_ai_sdr_prompts FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.client_ai_sdr_prompts TO service_role;
