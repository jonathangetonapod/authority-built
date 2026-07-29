-- What a prompt stage produces, named by the person who wrote the prompt.
--
-- A stage's answer has always been one blob: podcast_research writes
-- {{research_report}} and the stages after it read the whole thing. One stage
-- already does better — structure_research returns JSON that becomes
-- clean_description, fit_reasons, pitch_angles and selected_angle — but that
-- shape is hardcoded for that one stage.
--
-- This lets any stage declare the fields it returns. The stage is asked for
-- exactly that JSON, and each field becomes a variable the stages after it can
-- name, the same way a catalogue column is.
--
-- Resolution matches the prompts: client row -> workspace row -> no declared
-- outputs, in which case the stage keeps writing its single blob as before.
--
-- Field ids are validated in the application, not here: they must not collide
-- with docs/prompt-variables.json, and that registry lives in the code. The
-- CHECK below constrains shape and size only.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:prompt-output-fields:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_prompt_outputs (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research', 'host_info', 'guest_info', 'host_name_extractor',
    'find_topics', 'write_email', 'clean_email', 'inbox_reply', 'inbox_nudges'
  )),
  output_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(output_fields) = 'array')
    CHECK (jsonb_array_length(output_fields) <= 20)
    CHECK (pg_column_size(output_fields) <= 20000),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS public.client_prompt_outputs (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research', 'host_info', 'guest_info', 'host_name_extractor',
    'find_topics', 'write_email', 'clean_email', 'inbox_reply', 'inbox_nudges'
  )),
  output_fields JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(output_fields) = 'array')
    CHECK (jsonb_array_length(output_fields) <= 20)
    CHECK (pg_column_size(output_fields) <= 20000),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, client_id, prompt_id),
  -- The composite reference is what makes a cross-tenant client unrepresentable.
  CONSTRAINT client_prompt_outputs_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS client_prompt_outputs_client_idx
  ON public.client_prompt_outputs (workspace_id, client_id);

ALTER TABLE public.workspace_prompt_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_prompt_outputs ENABLE ROW LEVEL SECURITY;

-- Reached only through the edge functions, exactly like the prompt tables.
REVOKE ALL PRIVILEGES ON TABLE public.workspace_prompt_outputs FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_prompt_outputs FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_prompt_outputs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_prompt_outputs TO service_role;

COMMENT ON TABLE public.workspace_prompt_outputs IS
  'Named fields a prompt stage returns, per workspace. Absent row = the stage writes its single blob variable as before.';
COMMENT ON TABLE public.client_prompt_outputs IS
  'Per-client override of workspace_prompt_outputs. Present row wins, including an empty array.';

COMMIT;
