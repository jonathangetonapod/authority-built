-- Billing core RPCs: the only write paths into the credit and status tables.
--
-- All three are service-role-only. Edge functions call them after verifying
-- workspace membership via the shared auth helpers; the RPCs re-validate
-- inputs and enforce atomicity so a retried request can never double-charge.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-billing-rpcs:v1', 0));

-- ---------------------------------------------------------------------------
-- Grant credits: creates a lot plus its ledger entry atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_workspace_credits_v1(
  p_workspace_id UUID,
  p_source TEXT,
  p_amount INTEGER,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_reference_kind TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
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
  new_lot_id UUID;
  new_balance BIGINT;
BEGIN
  IF p_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace is invalid';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('monthly_allowance', 'purchase', 'promo', 'admin_grant') THEN
    RAISE EXCEPTION 'source is invalid';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'amount is invalid';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry is invalid';
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
        'lot_id', existing_entry.lot_id,
        'balance', new_balance
      );
    END IF;
  END IF;

  INSERT INTO public.workspace_credit_lots (workspace_id, source, granted, remaining, expires_at)
  VALUES (p_workspace_id, p_source, p_amount, p_amount, p_expires_at)
  RETURNING id INTO new_lot_id;

  INSERT INTO public.workspace_credit_ledger (
    workspace_id, entry_type, amount, lot_id,
    reference_kind, reference_id, actor_user_id, idempotency_key
  )
  VALUES (
    p_workspace_id, 'grant', p_amount, new_lot_id,
    p_reference_kind, p_reference_id, p_actor_user_id, p_idempotency_key
  );

  SELECT COALESCE(SUM(remaining), 0) INTO new_balance
  FROM public.workspace_credit_lots
  WHERE workspace_id = p_workspace_id
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now());

  RETURN jsonb_build_object(
    'idempotent', false,
    'lot_id', new_lot_id,
    'balance', new_balance
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Spend credits: consumes lots oldest-expiry-first under row locks, writes
-- one debit entry with the per-lot breakdown. Raises INSUFFICIENT_CREDITS
-- when the spendable balance cannot cover the operation's current price.
-- ---------------------------------------------------------------------------
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
    'email_unlock_verify', 'dashboard_build', 'query_generation', 'other'
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

-- ---------------------------------------------------------------------------
-- Client status change: flips clients.status, records the event, and bumps
-- the open billing period's active-client high-water mark, atomically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_client_status_change_v1(
  p_workspace_id UUID,
  p_client_id UUID,
  p_to_status TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_status TEXT;
  active_count INTEGER;
  current_period_start DATE := date_trunc('month', now())::date;
  high_water INTEGER;
BEGIN
  IF p_to_status IS NULL OR p_to_status NOT IN ('active', 'paused', 'churned') THEN
    RAISE EXCEPTION 'status is invalid';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'reason is invalid';
  END IF;

  SELECT status INTO current_status
  FROM public.clients
  WHERE id = p_client_id AND workspace_id = p_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client is invalid';
  END IF;

  IF current_status = p_to_status THEN
    RETURN jsonb_build_object('changed', false, 'status', current_status);
  END IF;

  UPDATE public.clients
  SET status = p_to_status, updated_at = now()
  WHERE id = p_client_id AND workspace_id = p_workspace_id;

  INSERT INTO public.workspace_client_status_events (
    workspace_id, client_id, from_status, to_status, actor_user_id, reason
  )
  VALUES (p_workspace_id, p_client_id, current_status, p_to_status, p_actor_user_id, p_reason);

  SELECT COUNT(*) INTO active_count
  FROM public.clients
  WHERE workspace_id = p_workspace_id AND status = 'active';

  INSERT INTO public.workspace_billing_periods (
    workspace_id, period_start, period_end, active_client_high_water
  )
  VALUES (
    p_workspace_id,
    current_period_start,
    (current_period_start + INTERVAL '1 month')::date,
    active_count
  )
  ON CONFLICT (workspace_id, period_start) DO UPDATE
  SET active_client_high_water = GREATEST(
        public.workspace_billing_periods.active_client_high_water,
        EXCLUDED.active_client_high_water
      ),
      updated_at = now()
  RETURNING active_client_high_water INTO high_water;

  RETURN jsonb_build_object(
    'changed', true,
    'from_status', current_status,
    'to_status', p_to_status,
    'active_count', active_count,
    'high_water', high_water
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_workspace_credits_v1(UUID, TEXT, INTEGER, TIMESTAMPTZ, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_client_status_change_v1(UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_workspace_credits_v1(UUID, TEXT, INTEGER, TIMESTAMPTZ, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_client_status_change_v1(UUID, UUID, TEXT, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.grant_workspace_credits_v1 IS
  'Creates a credit lot and its ledger entry atomically. Idempotent per (workspace, idempotency_key).';
COMMENT ON FUNCTION public.spend_workspace_credits_v1 IS
  'Charges the current credit price of an operation against lots oldest-expiry-first. Raises INSUFFICIENT_CREDITS when the balance cannot cover it. Idempotent per (workspace, idempotency_key).';
COMMENT ON FUNCTION public.record_client_status_change_v1 IS
  'Billing-bearing client status transition: updates the client, records the audit event, and raises the open billing period high-water mark.';

COMMIT;
