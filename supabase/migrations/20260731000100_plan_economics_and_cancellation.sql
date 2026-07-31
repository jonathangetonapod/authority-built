-- Two things a plan change could not express.
--
-- First: what a plan gives you. billing_plans carried a price and nothing else,
-- so switching plans rewrote plan_key while monthly_credit_allowance stayed
-- where it was. A workspace dropping to the cheaper plan kept the dearer
-- allowance and went on spending it — _shared/billing.ts grants from that
-- column, so this was real credits, not a label.
--
-- Second: a cancellation that has not happened yet. Stripe's portal cancels at
-- period end, which arrives as an update with the subscription still active and
-- cancel_at_period_end set. Recording only the status made a subscription on its
-- way out indistinguishable from a healthy one, right up until it lapsed.

ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS monthly_credit_allowance INTEGER NOT NULL DEFAULT 100
    CHECK (monthly_credit_allowance >= 0),
  ADD COLUMN IF NOT EXISTS per_client_price_cents INTEGER NOT NULL DEFAULT 3900
    CHECK (per_client_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS included_active_clients INTEGER NOT NULL DEFAULT 1
    CHECK (included_active_clients >= 0);

COMMENT ON COLUMN public.billing_plans.monthly_credit_allowance IS
  'Credits a workspace on this plan is granted each month. Applied to '
  'workspace_billing_profiles when a subscription moves onto the plan.';

-- Seeded to the column defaults every workspace already sits on, so applying a
-- plan changes nothing until somebody sets these deliberately. Complimentary is
-- assigned rather than sold and keeps whatever it was given.
UPDATE public.billing_plans
SET monthly_credit_allowance = 100,
    per_client_price_cents = 3900,
    included_active_clients = 1
WHERE plan_key IN ('founding_member', 'standard');

ALTER TABLE public.workspace_billing_profiles
  -- Set while a subscription is still live but will not renew. The status stays
  -- active in that window, so without this the app cannot tell the difference.
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_billing_profiles.cancel_at_period_end IS
  'True when the subscription is scheduled to end at current_period_end. The '
  'billing status stays active until it does.';
