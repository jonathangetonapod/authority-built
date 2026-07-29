-- Which fields a prompt stage refuses to run without.
--
-- A field the run cannot fill reaches the model as the literal "Not available",
-- and the shipped prompts each carry prose telling the model what to do about
-- that. This table is the other answer: name a field required and the stage
-- does not run at all for a podcast that lacks it, so a show with no transcript
-- is never pitched on the strength of the words "Not available" — and costs no
-- credit and no API call finding that out.
--
-- Resolution matches the prompts exactly: client row -> workspace row -> none
-- required. The set lives in one array column rather than a row per variable so
-- that an empty client array is distinguishable from a client with no opinion;
-- the first overrides the workspace set, the second inherits it.
--
-- Membership of required_variables in the field registry is NOT checked here.
-- docs/prompt-variables.json is the authority and it lives in the application,
-- so workspace-client-campaigns validates every id against it on write. The
-- CHECK below only constrains the shape.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:prompt-variable-requirements:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_prompt_requirements (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research',
    'host_info',
    'guest_info',
    'host_name_extractor',
    'find_topics',
    'write_email',
    'clean_email',
    'inbox_reply',
    'inbox_nudges'
  )),
  required_variables TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(required_variables) <= 200)
    CHECK (array_to_string(required_variables, ',') ~ '^$|^[a-z0-9_]+(,[a-z0-9_]+)*$'),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS public.client_prompt_requirements (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  prompt_id TEXT NOT NULL CHECK (prompt_id IN (
    'podcast_research',
    'host_info',
    'guest_info',
    'host_name_extractor',
    'find_topics',
    'write_email',
    'clean_email',
    'inbox_reply',
    'inbox_nudges'
  )),
  required_variables TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(required_variables) <= 200)
    CHECK (array_to_string(required_variables, ',') ~ '^$|^[a-z0-9_]+(,[a-z0-9_]+)*$'),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, client_id, prompt_id),
  -- The composite reference is what makes a cross-tenant client unrepresentable.
  CONSTRAINT client_prompt_requirements_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS client_prompt_requirements_client_idx
  ON public.client_prompt_requirements (workspace_id, client_id);

ALTER TABLE public.workspace_prompt_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_prompt_requirements ENABLE ROW LEVEL SECURITY;

-- Reached only through the edge functions, exactly like the prompt tables they
-- accompany: no policy is granted to anon or authenticated, so there is no
-- direct client path to a row.
REVOKE ALL PRIVILEGES ON TABLE public.workspace_prompt_requirements FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.client_prompt_requirements FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_prompt_requirements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_prompt_requirements TO service_role;

COMMENT ON TABLE public.workspace_prompt_requirements IS
  'Fields a prompt stage refuses to run without, per workspace. Absent row = nothing required.';
COMMENT ON TABLE public.client_prompt_requirements IS
  'Per-client override of workspace_prompt_requirements. Present row wins, including an empty array.';

COMMIT;
