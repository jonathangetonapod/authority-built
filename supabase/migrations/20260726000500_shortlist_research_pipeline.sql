-- Real research pipeline state on shortlist rows.
--
-- research_progress mirrors the frontend ClientShortlistResearchProgress
-- shape (status, current_stage, completed_stages, timestamps) and drives the
-- prep dialog's stage display via the existing 2s poll. research_document
-- stores the raw per-prompt outputs so operators can audit what the AI
-- concluded and future pitch generation can reuse it.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:shortlist-research-pipeline:v1', 0));

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS research_progress JSONB;

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS research_document JSONB;

COMMENT ON COLUMN public.client_dashboard_podcasts.research_progress IS
  'Live pipeline state for the research executor; null = never run.';
COMMENT ON COLUMN public.client_dashboard_podcasts.research_document IS
  'Raw per-prompt research outputs from the most recent completed run.';

COMMIT;
