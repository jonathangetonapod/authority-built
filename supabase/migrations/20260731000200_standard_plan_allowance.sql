-- Standard was seeded at the same 100 credits as the founding member plan,
-- because the allowance column arrived with a default and nobody had chosen a
-- number yet. Two plans giving the same thing makes a downgrade change the
-- price and nothing else, which is not a ladder.
--
-- 300 at $99 against 100 at $39: proportionally it would be about 254, and the
-- larger plan carrying the better rate is the shape that makes moving up worth
-- doing. It matches the 300-credit pack, so the plan and the top-up ladder
-- agree with each other.
--
-- This is a starting number, not a fact. It is one field on
-- /app/platform/billing and can be changed there without a migration.

UPDATE public.billing_plans
SET monthly_credit_allowance = 300,
    updated_at = now()
WHERE plan_key = 'standard';

-- Deliberately not touching workspace_billing_profiles. A workspace takes on
-- its plan's allowance when its subscription next moves onto the plan, the same
-- way Stripe leaves a subscriber on the price they signed up at. Rewriting live
-- workspaces here would hand credits to people who did not change anything.
