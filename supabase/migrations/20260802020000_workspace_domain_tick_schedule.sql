-- Somebody has to look at a domain nobody is looking at.
--
-- Every check the platform performed was a side effect of a platform admin
-- having the domains card open: the poll ran only while that page was mounted,
-- and only for domains still setting up. A domain that reached serving was
-- never checked again by anything. Certificates renew on their own until the
-- day they do not, and the first anyone would have known is an agency's client
-- meeting a browser warning on the agency's own address.
--
-- Every ten minutes, because the function decides what is actually due — a
-- domain still being set up on a two minute floor, a serving one on six hours.
-- The schedule is the upper bound on latency, not the check rate.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workspace-domain-tick') THEN
    PERFORM cron.unschedule('workspace-domain-tick');
  END IF;
  PERFORM cron.schedule(
    'workspace-domain-tick',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'domain_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-domain-tick-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'domain_tick_secret')
      ),
      body := '{}'::jsonb
    )
    -- Both secrets or nothing: a job that fires at a null URL every ten
    -- minutes forever is worse than one that has not started yet, because it
    -- looks scheduled.
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('domain_tick_url', 'domain_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;
