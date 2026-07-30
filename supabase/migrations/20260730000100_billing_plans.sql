-- The plan ladder, and which Stripe Price each plan is currently sold at.
--
-- Price ids used to live in edge function environment variables, which cannot
-- be edited from a screen. A platform admin needs to change what a plan costs
-- without a redeploy, so the mapping moves into a table the admin surface can
-- write through.
--
-- Stripe Prices are immutable: changing an amount means creating a new Price
-- and pointing the plan at it. base_price_cents is therefore a record of what
-- stripe_price_id charges, kept in step whenever the pointer moves — never the
-- thing a customer is actually billed from. Stripe is always the authority on
-- that, which is why the two are updated together and never independently.

CREATE TABLE IF NOT EXISTS public.billing_plans (
  plan_key TEXT PRIMARY KEY
    CHECK (plan_key IN ('founding_member', 'standard', 'comped')),
  display_name TEXT NOT NULL
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  -- Null until the Stripe catalogue has been set up. A purchasable plan
  -- without one is refused at the edge rather than opening a checkout Stripe
  -- would reject.
  stripe_price_id TEXT
    CHECK (stripe_price_id IS NULL OR stripe_price_id LIKE 'price\_%'),
  is_purchasable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A plan is only ever sold at one price at a time, so the same Stripe Price
-- must not be shared: repointing one plan would silently repoint the other.
CREATE UNIQUE INDEX IF NOT EXISTS billing_plans_stripe_price_id_key
  ON public.billing_plans (stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;

INSERT INTO public.billing_plans (plan_key, display_name, base_price_cents, is_purchasable)
VALUES
  ('founding_member', 'Founding member', 3900, true),
  ('standard', 'Standard', 9900, true),
  -- Complimentary is assigned, never bought.
  ('comped', 'Complimentary', 0, false)
ON CONFLICT (plan_key) DO NOTHING;

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

-- Plan names and prices are shown in the app, so any signed-in user may read
-- them. There is deliberately no insert, update, or delete policy: writes go
-- through the platform-admin edge action on the service role, which is also
-- what keeps the Stripe Price and the recorded amount changing together.
DROP POLICY IF EXISTS billing_plans_authenticated_select ON public.billing_plans;
CREATE POLICY billing_plans_authenticated_select
  ON public.billing_plans
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);
