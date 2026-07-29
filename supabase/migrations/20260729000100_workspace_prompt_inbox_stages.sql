-- The workspace prompt set offers nine stages. Its CHECK constraint allowed
-- seven.
--
-- inbox_reply and inbox_nudges are listed in the prompt editor, accepted by
-- workspace-client-campaigns (RESEARCH_PROMPT_IDS), and read back by
-- _shared/inboxSdr.ts — so saving either at workspace level passed every
-- validation the application performs and then failed on the database. The
-- per-client table has carried all nine since it was created, so the client
-- layer worked while the workspace layer did not.
--
-- Widening a CHECK cannot invalidate an existing row: every stored prompt_id
-- is already in the narrower set.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-research-prompts:v1', 0));

ALTER TABLE public.workspace_research_prompts
  DROP CONSTRAINT IF EXISTS workspace_research_prompts_prompt_id_check;

ALTER TABLE public.workspace_research_prompts
  ADD CONSTRAINT workspace_research_prompts_prompt_id_check CHECK (
    prompt_id IN (
      'podcast_research',
      'host_info',
      'guest_info',
      'host_name_extractor',
      'find_topics',
      'write_email',
      'clean_email',
      'inbox_reply',
      'inbox_nudges'
    )
  );

COMMENT ON TABLE public.workspace_research_prompts IS
  'Owner-customized research/pitch/inbox prompt instructions per workspace. Absent row = application default. Stage list matches client_ai_sdr_prompts.';

COMMIT;
