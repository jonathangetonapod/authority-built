-- Renew the monthly allowance whether or not anybody triggers it.
--
-- The allowance was granted lazily, inside the first charge of the month: a
-- workspace that ran an operation got topped up, and a workspace that did not
-- got nothing. That is invisible while enforcement is off and wrong once it is
-- on, because "you get 100 credits a month" then means "you get 100 credits a
-- month if you spend one first" — and the month a team comes back from a quiet
-- period is exactly the month they need the balance to already be there.
--
-- The lazy path stays. It is the same grant with the same idempotency key, so
-- whichever happens first wins and the second is a no-op rather than a double
-- grant.

CREATE OR REPLACE FUNCTION public.grant_monthly_allowances_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  workspace RECORD;
  period TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  -- Same window the lazy path uses: an allowance outlives the month it is for,
  -- so work at a month boundary does not fail against credit that expired at
  -- midnight.
  expires_at TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'UTC') + interval '2 months';
  allowance INTEGER;
  granted_count INTEGER := 0;
  granted_credits INTEGER := 0;
BEGIN
  FOR workspace IN
    SELECT w.id, p.monthly_credit_allowance, p.billing_status
    FROM public.workspaces w
    LEFT JOIN public.workspace_billing_profiles p ON p.workspace_id = w.id
    WHERE w.status = 'active'
  LOOP
    -- A workspace that has never been billed is on trial, and a workspace that
    -- cancelled keeps its plan's allowance on the row — the column describes
    -- the plan, not the subscription — so granting from it regardless would
    -- top up a cancelled workspace for ever. Mirrors ensureMonthlyAllowance.
    IF workspace.billing_status IS NOT NULL
      AND workspace.billing_status NOT IN ('trialing', 'active', 'comped') THEN
      CONTINUE;
    END IF;

    -- Matches the column default. A literal here that disagrees with the
    -- schema is how a workspace silently lands on the wrong plan.
    allowance := COALESCE(workspace.monthly_credit_allowance, 100);
    IF allowance < 1 THEN
      CONTINUE;
    END IF;

    PERFORM public.grant_workspace_credits_v1(
      workspace.id,
      'monthly_allowance',
      allowance,
      expires_at,
      'allowance_period',
      period,
      NULL,
      -- The key the lazy path already uses, so the two can never both land.
      'allowance:' || workspace.id::text || ':' || period
    );

    granted_count := granted_count + 1;
    granted_credits := granted_credits + allowance;
  END LOOP;

  RETURN jsonb_build_object('workspaces', granted_count, 'credits', granted_credits, 'period', period);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_monthly_allowances_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_allowances_v1()
  TO service_role;

-- ---------------------------------------------------------------------------
-- Daily rather than monthly, because the grant is idempotent per period and a
-- daily run is self-healing: a workspace created on the 9th gets its allowance
-- on the 9th, and a run missed on the 1st is made good on the 2nd. A job that
-- fires only on the 1st has one chance a month to be right.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workspace-monthly-allowance') THEN
    PERFORM cron.unschedule('workspace-monthly-allowance');
  END IF;
  PERFORM cron.schedule(
    'workspace-monthly-allowance',
    '23 2 * * *',
    $job$SELECT public.grant_monthly_allowances_v1();$job$
  );
END;
$$;
