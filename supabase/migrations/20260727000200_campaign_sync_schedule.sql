-- Scheduled Instantly campaign sync.
--
-- Reply and open counts, target status, and campaign analytics used to
-- refresh only when an operator opened the campaign page — the Command
-- Center and the client portal both read stage from those columns, so both
-- were stale by default. The sweep runs every 30 minutes against the
-- existing workspace-client-campaigns function, which already owns the sync
-- logic; a shared secret marks the request as the scheduler's, and the
-- project anon key satisfies the function's JWT gate.
--
-- Provision once:
--   select vault.create_secret('<url>',        'campaign_sync_url');
--   select vault.create_secret('<secret>',     'campaign_sync_secret');
--   select vault.create_secret('<anon key>',   'campaign_sync_anon_key');
-- and set the same secret as the CAMPAIGN_SYNC_SECRET edge function env var.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'campaign-sync-tick') THEN
    PERFORM cron.unschedule('campaign-sync-tick');
  END IF;
  PERFORM cron.schedule(
    'campaign-sync-tick',
    '*/30 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'campaign_sync_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'campaign_sync_anon_key'),
        'x-campaign-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'campaign_sync_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name IN ('campaign_sync_url', 'campaign_sync_secret', 'campaign_sync_anon_key')
      HAVING count(*) = 3
    );
    $job$
  );
END;
$$;
