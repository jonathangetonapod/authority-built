-- Billing core: plans, credit lots, ledger, operation prices, billing
-- periods, and client status events.
--
-- Pricing model (docs/pricing-model.md): a small base fee, a per-active-
-- client fee, and prepaid credits for metered AI/data operations. Credits
-- live in lots so granted allowances can expire while purchased credits do
-- not. The ledger is the append-only audit truth; lot remainders are the
-- spendable balance. All mutations go through service-role-only _v1 RPCs.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-billing-core:v1', 0));

-- ---------------------------------------------------------------------------
-- Plan identity per workspace. Prices are denormalized onto the row so a
-- founding-member deal survives later changes to public pricing.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_billing_profiles (
  workspace_id UUID PRIMARY KEY
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  plan_key TEXT NOT NULL DEFAULT 'founding_member'
    CHECK (plan_key IN ('founding_member', 'standard', 'comped')),
  billing_status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (billing_status IN ('trialing', 'active', 'past_due', 'comped', 'suspended')),
  base_price_cents INTEGER NOT NULL DEFAULT 3900 CHECK (base_price_cents >= 0),
  per_client_price_cents INTEGER NOT NULL DEFAULT 3900 CHECK (per_client_price_cents >= 0),
  included_active_clients INTEGER NOT NULL DEFAULT 1 CHECK (included_active_clients >= 0),
  monthly_credit_allowance INTEGER NOT NULL DEFAULT 25 CHECK (monthly_credit_allowance >= 0),
  refill_enabled BOOLEAN NOT NULL DEFAULT false,
  refill_threshold_credits INTEGER CHECK (refill_threshold_credits IS NULL OR refill_threshold_credits >= 0),
  refill_pack_credits INTEGER CHECK (refill_pack_credits IS NULL OR refill_pack_credits > 0),
  refill_monthly_cap_cents INTEGER CHECK (refill_monthly_cap_cents IS NULL OR refill_monthly_cap_cents >= 0),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_billing_profiles_refill_config_check CHECK (
    NOT refill_enabled
    OR (refill_threshold_credits IS NOT NULL AND refill_pack_credits IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Credit lots: where spendable credits live. Consumed oldest-expiry-first so
-- expiring allowances are always used before purchased credits.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_credit_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  source TEXT NOT NULL
    CHECK (source IN ('monthly_allowance', 'purchase', 'promo', 'admin_grant')),
  granted INTEGER NOT NULL CHECK (granted > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  expires_at TIMESTAMPTZ,
  stripe_payment_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_credit_lots_remaining_bound_check CHECK (remaining <= granted)
);

CREATE INDEX IF NOT EXISTS workspace_credit_lots_spendable_idx
  ON public.workspace_credit_lots (workspace_id, expires_at ASC NULLS LAST, created_at ASC)
  WHERE remaining > 0;

-- ---------------------------------------------------------------------------
-- Append-only credit journal. Balances are derived from lots; this table is
-- the audit explanation for every movement. Never updated, never deleted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('grant', 'debit', 'expiry', 'refund', 'adjustment')),
  amount INTEGER NOT NULL,
  lot_id UUID REFERENCES public.workspace_credit_lots(id) ON DELETE RESTRICT,
  operation_type TEXT CHECK (operation_type IS NULL OR operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'other'
  )),
  reference_kind TEXT CHECK (reference_kind IS NULL OR char_length(reference_kind) <= 60),
  reference_id TEXT CHECK (reference_id IS NULL OR char_length(reference_id) <= 120),
  client_id UUID,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  lot_breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_credit_ledger_amount_sign_check CHECK (
    (entry_type = 'grant' AND amount > 0)
    OR (entry_type = 'refund' AND amount > 0)
    OR (entry_type = 'debit' AND amount < 0)
    OR (entry_type = 'expiry' AND amount < 0)
    OR (entry_type = 'adjustment' AND amount <> 0)
  ),
  CONSTRAINT workspace_credit_ledger_debit_operation_check CHECK (
    entry_type <> 'debit' OR operation_type IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_credit_ledger_idempotency_uidx
  ON public.workspace_credit_ledger (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_credit_ledger_workspace_created_idx
  ON public.workspace_credit_ledger (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Credit price per operation, as data with history. The active price for an
-- operation is the newest row with effective_from <= now().
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operation_credit_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'other'
  )),
  credit_cost INTEGER NOT NULL CHECK (credit_cost >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT operation_credit_costs_unique_effective UNIQUE (operation_type, effective_from)
);

INSERT INTO public.operation_credit_costs (operation_type, credit_cost)
VALUES
  ('research_run', 2),
  ('email_unlock_identify', 1),
  ('email_unlock_find', 2),
  ('email_unlock_verify', 3),
  ('dashboard_build', 5),
  ('query_generation', 1),
  ('other', 0)
ON CONFLICT (operation_type, effective_from) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Monthly billing periods. active_client_high_water is the anti-gaming
-- proration rule: a client active for any part of the month bills for the
-- month.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'invoiced', 'paid')),
  active_client_high_water INTEGER NOT NULL DEFAULT 0 CHECK (active_client_high_water >= 0),
  base_cents INTEGER NOT NULL DEFAULT 0 CHECK (base_cents >= 0),
  client_cents INTEGER NOT NULL DEFAULT 0 CHECK (client_cents >= 0),
  credit_purchases_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_purchases_cents >= 0),
  invoice_ref TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_billing_periods_range_check CHECK (period_end > period_start),
  CONSTRAINT workspace_billing_periods_unique_start UNIQUE (workspace_id, period_start),
  CONSTRAINT workspace_billing_periods_closed_timestamps_check CHECK (
    (status = 'open' AND closed_at IS NULL)
    OR (status <> 'open' AND closed_at IS NOT NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Structured audit of client status transitions; active status is billable,
-- so "when exactly did this client become active" must be queryable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_client_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  client_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('active', 'paused', 'churned')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_client_status_events_client_fk
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workspace_client_status_events_client_idx
  ON public.workspace_client_status_events (workspace_id, client_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Grants and RLS. Members can read their workspace's billing data; nothing
-- writes except the RPCs below (owner-executed) and service-role code.
-- Ledger and status events are append-only even for service_role.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_credit_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_credit_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_client_status_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspace_billing_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_credit_lots FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_credit_ledger FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.operation_credit_costs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_billing_periods FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_client_status_events FROM anon, authenticated;

GRANT SELECT ON TABLE public.workspace_billing_profiles TO authenticated;
GRANT SELECT ON TABLE public.workspace_credit_lots TO authenticated;
GRANT SELECT ON TABLE public.workspace_credit_ledger TO authenticated;
GRANT SELECT ON TABLE public.operation_credit_costs TO authenticated;
GRANT SELECT ON TABLE public.workspace_billing_periods TO authenticated;
GRANT SELECT ON TABLE public.workspace_client_status_events TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.workspace_billing_profiles TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_credit_lots TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.workspace_billing_periods TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_credit_ledger FROM service_role;
GRANT SELECT, INSERT ON TABLE public.workspace_credit_ledger TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_client_status_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.workspace_client_status_events TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.operation_credit_costs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.operation_credit_costs TO service_role;

DROP POLICY IF EXISTS workspace_billing_profiles_authenticated_select
  ON public.workspace_billing_profiles;
CREATE POLICY workspace_billing_profiles_authenticated_select
  ON public.workspace_billing_profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_billing_profiles_authenticated_select_isolation
  ON public.workspace_billing_profiles;
CREATE POLICY workspace_billing_profiles_authenticated_select_isolation
  ON public.workspace_billing_profiles
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_credit_lots_authenticated_select
  ON public.workspace_credit_lots;
CREATE POLICY workspace_credit_lots_authenticated_select
  ON public.workspace_credit_lots
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_credit_lots_authenticated_select_isolation
  ON public.workspace_credit_lots;
CREATE POLICY workspace_credit_lots_authenticated_select_isolation
  ON public.workspace_credit_lots
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_credit_ledger_authenticated_select
  ON public.workspace_credit_ledger;
CREATE POLICY workspace_credit_ledger_authenticated_select
  ON public.workspace_credit_ledger
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_credit_ledger_authenticated_select_isolation
  ON public.workspace_credit_ledger;
CREATE POLICY workspace_credit_ledger_authenticated_select_isolation
  ON public.workspace_credit_ledger
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

-- Operation prices are global, non-sensitive data (shown in the UI).
DROP POLICY IF EXISTS operation_credit_costs_authenticated_select
  ON public.operation_credit_costs;
CREATE POLICY operation_credit_costs_authenticated_select
  ON public.operation_credit_costs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS workspace_billing_periods_authenticated_select
  ON public.workspace_billing_periods;
CREATE POLICY workspace_billing_periods_authenticated_select
  ON public.workspace_billing_periods
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_billing_periods_authenticated_select_isolation
  ON public.workspace_billing_periods;
CREATE POLICY workspace_billing_periods_authenticated_select_isolation
  ON public.workspace_billing_periods
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_client_status_events_authenticated_select
  ON public.workspace_client_status_events;
CREATE POLICY workspace_client_status_events_authenticated_select
  ON public.workspace_client_status_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_client_status_events_authenticated_select_isolation
  ON public.workspace_client_status_events;
CREATE POLICY workspace_client_status_events_authenticated_select_isolation
  ON public.workspace_client_status_events
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

COMMIT;
