-- Which Claude model a workspace runs a stage on.
--
-- Every stage has shipped on one hardcoded model per stage. This lets a
-- workspace choose per stage: the heavy reasoning stages on a more capable
-- model, the reformatting ones on a cheaper one.
--
-- NULL means "whatever the shipped default for this stage is", and is not the
-- same as storing that default's id. A stage nobody has touched, and a stage
-- explicitly set back to default, should both follow the shipped default if we
-- ever change it.
--
-- Deliberately not a CHECK against a list of model ids. The set of usable
-- models is whatever the Anthropic Models API reports for the key in play, and
-- it changes as models ship and retire — a list frozen in a migration would
-- start rejecting valid models and would need a migration to fix. The edge
-- function validates against the live list on write instead. The constraint
-- here is only the shape: non-empty, and short enough that this column can
-- never be used as free storage.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-prompt-model:v1', 0));

ALTER TABLE public.workspace_research_prompts
  ADD COLUMN IF NOT EXISTS model TEXT;

-- A row can now carry a model choice, an instruction override, or both, so the
-- instructions become optional.
--
-- The alternative was to write a copy of the shipped prompt into `content`
-- whenever someone picked a model. That would silently freeze the stage at
-- today's wording: every later improvement to the shipped prompt would stop
-- reaching that workspace, and nothing on screen would say so. An override has
-- to mean someone chose those words.
--
-- The existing length CHECK is left alone — it passes for NULL, and still
-- bounds an override that is present.
ALTER TABLE public.workspace_research_prompts
  ALTER COLUMN content DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_research_prompts_model_shape'
  ) THEN
    ALTER TABLE public.workspace_research_prompts
      ADD CONSTRAINT workspace_research_prompts_model_shape
      CHECK (model IS NULL OR (length(model) BETWEEN 1 AND 128 AND model ~ '^[a-zA-Z0-9._-]+$'));
  END IF;
END $$;

COMMENT ON COLUMN public.workspace_research_prompts.model IS
  'Claude model id this workspace runs the stage on. NULL = the stage''s shipped default. Validated against the live Models API on write, not by a CHECK, because the usable set changes as models ship and retire.';

COMMIT;
