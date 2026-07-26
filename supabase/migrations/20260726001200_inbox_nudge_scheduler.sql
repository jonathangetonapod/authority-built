-- Automatic follow-up nudges for Master Inbox conversations.
--
-- When an operator sends an AI reply, the staged nudge plan (stored on
-- workspace_inbox_thread_state.draft) starts executing server-side: the
-- inbox-nudge-tick edge function (shared-secret auth, no user JWT) runs on a
-- pg_cron schedule, confirms the host is still quiet by reading the live
-- Instantly thread, and sends the next due nudge in the same thread from the
-- same mailbox. A reply from the host cancels the plan and returns the
-- conversation to the needs-reply queue.
--
-- The cron job reads its URL and secret from Vault so nothing sensitive
-- lands in migrations. Provision once:
--   select vault.create_secret('<url>',    'nudge_tick_url');
--   select vault.create_secret('<secret>', 'nudge_tick_secret');
-- and set the same secret as the NUDGE_TICK_SECRET edge function env var.

ALTER TABLE public.workspace_inbox_thread_state
  ADD COLUMN nudges_sent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_nudge_at TIMESTAMPTZ,
  ADD COLUMN nudges_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.workspace_inbox_thread_state
  ADD CONSTRAINT workspace_inbox_thread_state_nudges_sent_range
  CHECK (nudges_sent >= 0 AND nudges_sent <= 10);

CREATE INDEX workspace_inbox_thread_state_nudge_candidates_idx
  ON public.workspace_inbox_thread_state (workspace_id, updated_at)
  WHERE status = 'replied' AND nudges_paused = false;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-nudge-tick') THEN
    PERFORM cron.unschedule('inbox-nudge-tick');
  END IF;
  PERFORM cron.schedule(
    'inbox-nudge-tick',
    '*/30 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nudge_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-nudge-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nudge_tick_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('nudge_tick_url', 'nudge_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;
