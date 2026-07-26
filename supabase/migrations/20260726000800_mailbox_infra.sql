-- Workspace mailbox infrastructure orders (Winnr-backed).
--
-- Workspaces without sending infrastructure buy domains + warmed mailboxes
-- in-app. Orders track the async Winnr purchase job and the warming
-- enablement step. Credit pricing lands in operation_credit_costs as data:
-- mailbox_domain_purchase is charged per domain at order time,
-- mailbox_monthly is the provisional per-mailbox monthly rate (manual
-- invoicing era — reprice by inserting newer effective rows).

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:mailbox-infra:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_mailbox_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  winnr_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'provisioned', 'warming', 'failed')),
  domains JSONB NOT NULL DEFAULT '[]'::JSONB,
  mailbox_count INTEGER NOT NULL DEFAULT 0 CHECK (mailbox_count >= 0),
  amount_usd NUMERIC(10, 2),
  credits_charged INTEGER NOT NULL DEFAULT 0,
  warming_enabled_at TIMESTAMPTZ,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_mailbox_orders_workspace_idx
  ON public.workspace_mailbox_orders (workspace_id, created_at DESC);

ALTER TABLE public.workspace_mailbox_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_mailbox_orders_isolation ON public.workspace_mailbox_orders;
CREATE POLICY workspace_mailbox_orders_isolation ON public.workspace_mailbox_orders
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (workspace_id = public.current_workspace_id())
  WITH CHECK (workspace_id = public.current_workspace_id());

DROP POLICY IF EXISTS workspace_mailbox_orders_access ON public.workspace_mailbox_orders;
CREATE POLICY workspace_mailbox_orders_access ON public.workspace_mailbox_orders
  FOR ALL TO authenticated
  USING (public.can_access_workspace(workspace_id))
  WITH CHECK (public.can_access_workspace(workspace_id));

-- Extend the metered-operation vocabulary with the two infra operations.
ALTER TABLE public.operation_credit_costs
  DROP CONSTRAINT IF EXISTS operation_credit_costs_operation_type_check;
ALTER TABLE public.operation_credit_costs
  ADD CONSTRAINT operation_credit_costs_operation_type_check CHECK (operation_type IN (
    'research_run', 'email_unlock_identify', 'email_unlock_find', 'email_unlock_verify',
    'dashboard_build', 'query_generation', 'compatibility_scoring', 'podscan_lookup',
    'semantic_search', 'pitch_profile', 'mailbox_domain_purchase', 'mailbox_monthly', 'other'
  ));

ALTER TABLE public.workspace_operation_costs
  DROP CONSTRAINT IF EXISTS workspace_operation_costs_operation_type_check;
ALTER TABLE public.workspace_operation_costs
  ADD CONSTRAINT workspace_operation_costs_operation_type_check CHECK (operation_type IN (
    'research_run', 'email_unlock_identify', 'email_unlock_find', 'email_unlock_verify',
    'dashboard_build', 'query_generation', 'compatibility_scoring', 'podscan_lookup',
    'semantic_search', 'pitch_profile', 'mailbox_domain_purchase', 'mailbox_monthly', 'other'
  ));

ALTER TABLE public.workspace_credit_ledger
  DROP CONSTRAINT IF EXISTS workspace_credit_ledger_operation_type_check;
ALTER TABLE public.workspace_credit_ledger
  ADD CONSTRAINT workspace_credit_ledger_operation_type_check CHECK (operation_type IS NULL OR operation_type IN (
    'research_run', 'email_unlock_identify', 'email_unlock_find', 'email_unlock_verify',
    'dashboard_build', 'query_generation', 'compatibility_scoring', 'podscan_lookup',
    'semantic_search', 'pitch_profile', 'mailbox_domain_purchase', 'mailbox_monthly', 'other'
  ));

INSERT INTO public.operation_credit_costs (operation_type, credit_cost)
VALUES
  ('mailbox_domain_purchase', 20),
  ('mailbox_monthly', 5)
ON CONFLICT (operation_type, effective_from) DO NOTHING;

-- spend_workspace_credits_v1 re-created with the extended inline vocabulary.
-- Body otherwise identical to 20260726000300.
CREATE OR REPLACE FUNCTION public.spend_workspace_credits_v1(
  p_workspace_id UUID,
  p_operation_type TEXT,
  p_reference_kind TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_actor_user_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing_entry public.workspace_credit_ledger%ROWTYPE;
  operation_cost INTEGER;
  lot RECORD;
  still_needed INTEGER;
  consumed_from_lot INTEGER;
  breakdown JSONB := '[]'::jsonb;
  new_entry_id UUID;
  new_balance BIGINT;
BEGIN
  IF p_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace is invalid';
  END IF;
  IF p_operation_type IS NULL OR p_operation_type NOT IN (
    'research_run', 'email_unlock_identify', 'email_unlock_find',
    'email_unlock_verify', 'dashboard_build', 'query_generation',
    'compatibility_scoring', 'podscan_lookup', 'semantic_search',
    'pitch_profile', 'mailbox_domain_purchase', 'mailbox_monthly', 'other'
  ) THEN
    RAISE EXCEPTION 'operation is invalid';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing_entry
    FROM public.workspace_credit_ledger
    WHERE workspace_id = p_workspace_id
      AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT COALESCE(SUM(remaining), 0) INTO new_balance
      FROM public.workspace_credit_lots
      WHERE workspace_id = p_workspace_id
        AND remaining > 0
        AND (expires_at IS NULL OR expires_at > now());
      RETURN jsonb_build_object(
        'idempotent', true,
        'entry_id', existing_entry.id,
        'charged', abs(existing_entry.amount),
        'balance', new_balance
      );
    END IF;
  END IF;

  SELECT credit_cost INTO operation_cost
  FROM public.operation_credit_costs
  WHERE operation_type = p_operation_type
    AND effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;
  IF operation_cost IS NULL THEN
    RAISE EXCEPTION 'operation price is not configured';
  END IF;

  IF operation_cost = 0 THEN
    SELECT COALESCE(SUM(remaining), 0) INTO new_balance
    FROM public.workspace_credit_lots
    WHERE workspace_id = p_workspace_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now());
    RETURN jsonb_build_object('idempotent', false, 'charged', 0, 'balance', new_balance);
  END IF;

  still_needed := operation_cost;
  FOR lot IN
    SELECT id, remaining
    FROM public.workspace_credit_lots
    WHERE workspace_id = p_workspace_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN still_needed = 0;
    consumed_from_lot := LEAST(lot.remaining, still_needed);
    UPDATE public.workspace_credit_lots
    SET remaining = remaining - consumed_from_lot
    WHERE id = lot.id;
    breakdown := breakdown || jsonb_build_object('lot_id', lot.id, 'spent', consumed_from_lot);
    still_needed := still_needed - consumed_from_lot;
  END LOOP;

  IF still_needed > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.workspace_credit_ledger (
    workspace_id, entry_type, amount, operation_type,
    reference_kind, reference_id, client_id, actor_user_id,
    idempotency_key, lot_breakdown
  )
  VALUES (
    p_workspace_id, 'debit', -operation_cost, p_operation_type,
    p_reference_kind, p_reference_id, p_client_id, p_actor_user_id,
    p_idempotency_key, breakdown
  )
  RETURNING id INTO new_entry_id;

  SELECT COALESCE(SUM(remaining), 0) INTO new_balance
  FROM public.workspace_credit_lots
  WHERE workspace_id = p_workspace_id
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now());

  RETURN jsonb_build_object(
    'idempotent', false,
    'entry_id', new_entry_id,
    'charged', operation_cost,
    'balance', new_balance
  );
END;
$$;

COMMIT;
