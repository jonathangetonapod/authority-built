-- Workspaces bring their own Winnr API key for sending infrastructure.
-- Same encrypted-credential storage as the BYO AI keys; the platform token
-- stays as the fallback. Orders on a workspace key skip platform credits —
-- the workspace pays Winnr directly.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:byo-winnr-keys:v1', 0));

ALTER TABLE public.workspace_ai_credentials
  DROP CONSTRAINT IF EXISTS workspace_ai_credentials_provider_check;
ALTER TABLE public.workspace_ai_credentials
  ADD CONSTRAINT workspace_ai_credentials_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'winnr'));

COMMIT;
