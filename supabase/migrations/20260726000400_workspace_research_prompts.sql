-- Workspace overrides for the campaign research & pitch prompt set.
--
-- Defaults live in the application (docs/pitch-research-prompts.json); this
-- table stores only owner-customized instruction text per prompt. The future
-- research pipeline executor reads effective prompts as override ?? default.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-research-prompts:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_research_prompts (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research',
    'host_info',
    'guest_info',
    'host_name_extractor',
    'find_topics',
    'write_email',
    'clean_email'
  )),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 20000),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, prompt_id)
);

ALTER TABLE public.workspace_research_prompts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_research_prompts FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_research_prompts FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_research_prompts TO service_role;

COMMENT ON TABLE public.workspace_research_prompts IS
  'Owner-customized research/pitch prompt instructions per workspace. Absent row = application default.';

COMMIT;
