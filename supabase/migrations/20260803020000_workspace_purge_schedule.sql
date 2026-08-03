-- Wake the purge.
--
-- workspace-deletion marks a workspace and settles Stripe, Instantly and the
-- domain providers; the actual removal waits thirty days so a deletion someone
-- regrets can be undone. Nothing called the half that does the removing, so
-- without this the wait never ends: a workspace would sit marked for ever and
-- the data would never go, which is the opposite of what a recovery window
-- promises.
--
-- Daily, and deliberately not more often. Nothing here is time-critical — a
-- workspace that becomes due at noon being purged the following morning is
-- fine, and the cost of the job running rarely is measured in hours against a
-- window measured in weeks. 03:17 because it is quiet, and off the hour so it
-- does not queue behind every other job that picked midnight.
--
-- The function decides what is due; it reads a date written on the row when the
-- deletion was asked for. This decides only how often it may look.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workspace-purge') THEN
    PERFORM cron.unschedule('workspace-purge');
  END IF;
  PERFORM cron.schedule(
    'workspace-purge',
    '17 3 * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'purge_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-purge-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'purge_tick_secret')
      ),
      body := '{}'::jsonb
    )
    -- Both secrets or nothing. This is the most destructive job on the
    -- schedule, and a job that fires at a null URL every night for ever is
    -- worse than one that has not started, because it looks scheduled.
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('purge_tick_url', 'purge_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;
