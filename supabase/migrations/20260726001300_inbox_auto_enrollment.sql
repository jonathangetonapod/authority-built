-- Auto-enrollment for the Master Inbox AI SDR.
--
-- Each client chooses an SDR mode: manual (operator clicks Draft with AI) or
-- auto_draft (the inbox-enroll-tick cron classifies every new attributed
-- reply and stages a full review package — never sends). Thread state gains
-- the idempotency claim that makes overlapping ticks and retries no-ops, a
-- deterministic-suppression marker, and nudge failure surfacing so a thread
-- whose plan cannot execute pauses visibly instead of retrying forever.
--
-- Provision the cron once (same Vault pattern as the nudge tick):
--   select vault.create_secret('<url>',    'enroll_tick_url');
--   select vault.create_secret('<secret>', 'enroll_tick_secret');
-- and set the same secret as the ENROLL_TICK_SECRET edge function env var.

ALTER TABLE public.clients
  ADD COLUMN ai_sdr_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (ai_sdr_mode IN ('manual', 'auto_draft'));

ALTER TABLE public.workspace_instantly_integrations
  ADD COLUMN auto_draft_cursor_ts TIMESTAMPTZ;

ALTER TABLE public.workspace_inbox_thread_state
  ADD COLUMN draft_claim_email_id TEXT,
  ADD COLUMN draft_claimed_at TIMESTAMPTZ,
  ADD COLUMN suppressed_at TIMESTAMPTZ,
  ADD COLUMN last_nudge_error TEXT,
  ADD COLUMN last_nudge_error_at TIMESTAMPTZ,
  ADD COLUMN nudge_failure_count INTEGER NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-enroll-tick') THEN
    PERFORM cron.unschedule('inbox-enroll-tick');
  END IF;
  PERFORM cron.schedule(
    'inbox-enroll-tick',
    '*/15 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'enroll_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-enroll-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'enroll_tick_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('enroll_tick_url', 'enroll_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;
