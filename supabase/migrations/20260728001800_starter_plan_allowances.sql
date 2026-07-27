-- Move the default plan to the one being sold: $29/month, 3 active clients,
-- 100 credits.
--
-- workspace_billing_profiles already carries the whole shape — plan_key,
-- base_price_cents, included_active_clients, monthly_credit_allowance, Stripe
-- linkage, auto-refill — but its defaults still describe an earlier offer:
-- founding_member at $39 for ONE client and 25 credits. Nothing has ever
-- written a row, so the defaults are the entire configuration, and they
-- disagree with what the product is about to charge for.
--
-- This matters more than a wrong number on a page. Credit enforcement is off
-- today (CREDIT_ENFORCEMENT_ENABLED is unset), and the moment it is switched
-- on, ensureMonthlyAllowance creates profiles from these defaults. Every
-- workspace would silently land on 25 credits and a one-client limit.

ALTER TABLE public.workspace_billing_profiles
  ALTER COLUMN plan_key SET DEFAULT 'starter',
  ALTER COLUMN base_price_cents SET DEFAULT 2900,
  ALTER COLUMN included_active_clients SET DEFAULT 3,
  ALTER COLUMN monthly_credit_allowance SET DEFAULT 100;

COMMENT ON COLUMN public.workspace_billing_profiles.included_active_clients IS
  'Active clients covered by the plan. A hard cap rather than billable overage, so a bill can never exceed the plan the customer agreed to.';
COMMENT ON COLUMN public.workspace_billing_profiles.monthly_credit_allowance IS
  'Credits granted each period. These expire with the period; credits bought as a pack do not.';

-- Existing rows are moved too. There are none today, so this is a no-op that
-- exists so a profile created between this migration and the deploy does not
-- keep the old offer.
UPDATE public.workspace_billing_profiles
SET plan_key = 'starter',
    base_price_cents = 2900,
    included_active_clients = 3,
    monthly_credit_allowance = 100,
    updated_at = now()
WHERE plan_key = 'founding_member'
  AND included_active_clients <= 1
  AND monthly_credit_allowance <= 25;

/**
 * Active clients against the plan's allowance.
 *
 * included_active_clients has existed since billing was first sketched and
 * nothing has ever read it, so the cap has only ever been a number in a column.
 * Counting here rather than in the browser is what makes it a limit.
 *
 * Archived and churned clients do not count: the plan covers what is being
 * worked, not what has ever existed, otherwise a long-running agency is
 * penalised for its own history.
 */
CREATE OR REPLACE FUNCTION public.workspace_client_allowance_v1(
  p_workspace_id UUID
)
RETURNS TABLE (
  active_clients INTEGER,
  client_limit INTEGER,
  can_add_client BOOLEAN,
  plan_key TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT
  active.count::INTEGER AS active_clients,
  COALESCE(profile.included_active_clients, 3) AS client_limit,
  active.count < COALESCE(profile.included_active_clients, 3) AS can_add_client,
  COALESCE(profile.plan_key, 'starter') AS plan_key
FROM (
  SELECT COUNT(*) AS count
  FROM public.clients
  WHERE workspace_id = p_workspace_id AND status = 'active'
) active
LEFT JOIN public.workspace_billing_profiles profile
  ON profile.workspace_id = p_workspace_id;
$$;

COMMENT ON FUNCTION public.workspace_client_allowance_v1(UUID) IS
  'Active client count against the plan allowance. The cap is enforced with this, never in the browser.';

REVOKE ALL ON FUNCTION public.workspace_client_allowance_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_client_allowance_v1(UUID) TO service_role;
