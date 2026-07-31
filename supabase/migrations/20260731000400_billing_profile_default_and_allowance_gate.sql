-- Two things that would have surfaced the first time credit enforcement was
-- switched on, and not before.
--
-- One: workspace_billing_profiles.plan_key is CHECKed against
-- ('founding_member','standard','comped') by 20260725000900, and
-- 20260728001800 later set its DEFAULT to 'starter' without widening that
-- CHECK — Postgres does not validate a default against a constraint, so the
-- migration applied cleanly and left an insert that cannot succeed.
-- _shared/billing.ts creates a profile by upserting {workspace_id} alone and
-- relying on the defaults, and it is the only writer of this table. So the
-- first metered operation for any workspace without a profile row would fail
-- the CHECK, raise BILLING_UNAVAILABLE, and keep doing so forever.
--
-- 'starter' is half-introduced: it is not in billing_plans, not in the app's
-- plan labels, and no row can ever have held it. The default goes back to a
-- plan that exists rather than inventing prices for one that does not.

ALTER TABLE public.workspace_billing_profiles
  ALTER COLUMN plan_key SET DEFAULT 'founding_member';

-- Two: the monthly allowance is granted on the first metered call of a month
-- with no reference to whether the workspace still subscribes. A workspace that
-- cancels keeps its plan's monthly_credit_allowance — the webhook deliberately
-- does not clear it, since that column describes the plan — so it would go on
-- being granted credits every month, forever, with no subscription behind it.
--
-- Enforced in the database rather than the caller: the grant happens inside
-- ensureMonthlyAllowance, and a second caller added later would otherwise have
-- to remember this rule.
CREATE OR REPLACE FUNCTION public.workspace_allowance_is_payable(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT billing_status IN ('trialing', 'active', 'comped')
      FROM public.workspace_billing_profiles
      WHERE workspace_id = p_workspace_id
    ),
    -- No profile yet is a workspace that has not been billed at all, which is
    -- the trial case and gets its allowance.
    true
  );
$$;

COMMENT ON FUNCTION public.workspace_allowance_is_payable(UUID) IS
  'Whether a workspace should still receive its monthly credit allowance. '
  'False once billing_status is past_due or suspended, so a cancelled '
  'workspace stops being topped up.';

REVOKE ALL ON FUNCTION public.workspace_allowance_is_payable(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.workspace_allowance_is_payable(UUID) TO service_role;
