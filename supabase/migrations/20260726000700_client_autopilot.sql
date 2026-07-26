-- Weekly client autopilot: server-side podcast discovery on a schedule.
--
-- client_autopilot_settings holds the per-client opt-in. The
-- client-autopilot-tick edge function (shared-secret auth, no user JWT)
-- claims one due client per cron tick, runs discovery + AI scoring, and
-- appends the top matches to the client's list as awaiting review.
--
-- The cron job reads the tick secret and project URL from Vault so nothing
-- sensitive is committed here. Seed them once (see the release notes):
--   select vault.create_secret('<url>',    'autopilot_tick_url');
--   select vault.create_secret('<secret>', 'autopilot_tick_secret');

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:client-autopilot:v1', 0));

CREATE TABLE IF NOT EXISTS public.client_autopilot_settings (
  workspace_id UUID NOT NULL,
  client_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_weekly_adds INTEGER NOT NULL DEFAULT 5
    CHECK (max_weekly_adds BETWEEN 1 AND 15),
  min_score INTEGER NOT NULL DEFAULT 70
    CHECK (min_score BETWEEN 0 AND 100),
  last_run_at TIMESTAMPTZ,
  last_run_added INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, client_id),
  CONSTRAINT client_autopilot_settings_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS client_autopilot_settings_due_idx
  ON public.client_autopilot_settings (next_run_at)
  WHERE enabled;

ALTER TABLE public.client_autopilot_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_autopilot_settings_isolation ON public.client_autopilot_settings;
CREATE POLICY client_autopilot_settings_isolation ON public.client_autopilot_settings
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace_id())
  WITH CHECK (workspace_id = public.current_workspace_id());

DROP POLICY IF EXISTS client_autopilot_settings_access ON public.client_autopilot_settings;
CREATE POLICY client_autopilot_settings_access ON public.client_autopilot_settings
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

-- Every 10 minutes, poke the tick function; it processes at most one due
-- client per invocation to stay inside edge time and Podscan rate limits.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'client-autopilot-tick') THEN
    PERFORM cron.unschedule('client-autopilot-tick');
  END IF;
  PERFORM cron.schedule(
    'client-autopilot-tick',
    '*/10 * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'autopilot_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-autopilot-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'autopilot_tick_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('autopilot_tick_url', 'autopilot_tick_secret') HAVING count(*) = 2);
    $job$
  );
END;
$$;

COMMIT;
