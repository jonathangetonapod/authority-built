-- Count what was granted, not what was attempted.
--
-- The renewal counted every workspace it considered, so a second run in the
-- same month reported the same "2 workspaces, 200 credits" as the first while
-- granting nothing — the idempotency key had already done its job. A sweep
-- nobody watches is exactly the kind that has to say the truth about itself,
-- because the number in its return value is the only evidence anyone will
-- ever look at.

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
  grant_result JSONB;
  granted_count INTEGER := 0;
  granted_credits INTEGER := 0;
  already_held INTEGER := 0;
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

    grant_result := public.grant_workspace_credits_v1(
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

    IF COALESCE((grant_result->>'idempotent')::boolean, false) THEN
      already_held := already_held + 1;
    ELSE
      granted_count := granted_count + 1;
      granted_credits := granted_credits + allowance;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'granted_workspaces', granted_count,
    'granted_credits', granted_credits,
    'already_held', already_held,
    'period', period
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_monthly_allowances_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_allowances_v1()
  TO service_role;
