-- Wake the automatic top-up.
--
-- The tick has existed and never run: no schedule called it, so a workspace
-- that had asked to be topped up still stopped at zero. Hourly, because the
-- point is to catch a balance before it blocks work — a daily job means an
-- agency that runs out at 9am waits until tomorrow, which is the failure this
-- was built to prevent.
--
-- The function decides what is due: it charges only a workspace under its own
-- threshold, at most once a day, and only one that opted in. The schedule is
-- how often it may look, not how often anyone is charged.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workspace-credit-refill') THEN
    PERFORM cron.unschedule('workspace-credit-refill');
  END IF;
  PERFORM cron.schedule(
    'workspace-credit-refill',
    '41 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'refill_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-refill-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'refill_tick_secret')
      ),
      body := '{}'::jsonb
    )
    -- Both secrets or nothing. A job that fires at a null URL every hour for
    -- ever is worse than one that has not started, because it looks scheduled.
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('refill_tick_url', 'refill_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;
