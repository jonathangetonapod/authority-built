-- Two holes where the ledger and the money part company.
--
-- First: a charge that was refunded blocked its own retry from ever being
-- charged. Spend idempotency returned any existing entry under the key with no
-- awareness that the debit had since been refunded, so charge → refund → retry
-- → success delivered the work at a net cost of zero. Every consumer that
-- refunds on failure and retries under a stable key had this; the mailbox
-- order flow was the worst, where a Winnr outage plus one retry bought real
-- infrastructure for free.
--
-- Second: a refund restored credit into the exact lots the debit came from —
-- right in every case except the lot having expired in between. Restoring into
-- an expired lot gave the client nothing (every balance read filters expired
-- lots out) while the ledger's refund line claimed full restoration; and if
-- the sweep had already zeroed the lot, the next sweep re-zeroed the restored
-- remainder with its expiry insert swallowed by ON CONFLICT DO NOTHING —
-- credit leaving the lots with no journal line, forever.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:billing-rpcs:v2', 0));

-- ---------------------------------------------------------------------------
-- Spend: idempotent per *unrefunded* charge.
--
-- A refunded debit means the operation did not happen, so its retry is a new
-- charge, not a replay. The retry lands under a generation-suffixed key
-- (key, key:retry1, key:retry2, …), so retries within one generation still
-- collapse to a single charge via the unique index, and each refund opens
-- exactly one new generation.
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
  effective_key TEXT := p_idempotency_key;
  generation INTEGER := 0;
  operation_cost INTEGER;
  still_needed INTEGER;
  consumed_from_lot INTEGER;
  lot RECORD;
  breakdown JSONB := '[]'::jsonb;
  new_entry_id UUID;
  new_balance BIGINT;
BEGIN
  IF p_workspace_id IS NULL OR p_operation_type IS NULL THEN
    RAISE EXCEPTION 'workspace and operation are required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    LOOP
      SELECT * INTO existing_entry
      FROM public.workspace_credit_ledger
      WHERE workspace_id = p_workspace_id
        AND idempotency_key = effective_key;
      EXIT WHEN NOT FOUND;

      -- Refunded means the operation did not happen: walk to the next
      -- generation instead of replaying a charge the workspace got back.
      IF NOT EXISTS (
        SELECT 1 FROM public.workspace_credit_ledger
        WHERE workspace_id = p_workspace_id
          AND idempotency_key = 'refund:' || existing_entry.id::text
      ) THEN
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

      generation := generation + 1;
      effective_key := p_idempotency_key || ':retry' || generation::text;
    END LOOP;
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
    effective_key, breakdown
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
-- Refund: restore to the source lots while they still count, reissue the rest.
--
-- Restoring into an expired lot is a refund only the ledger can see. The
-- expired portion is reissued as a fresh 30-day lot instead — comparable in
-- kind to the allowance lot it came from, never lifetime credit — and the
-- refund entry's breakdown records which credits were restored and which were
-- reissued, so the journal says what actually happened. An expired lot is
-- never refilled, which also keeps the sweep's one-expiry-line-per-lot
-- accounting truthful.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_workspace_credits_v1(
  p_workspace_id UUID,
  p_debit_entry_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  debit_entry public.workspace_credit_ledger%ROWTYPE;
  refund_key TEXT;
  existing_refund public.workspace_credit_ledger%ROWTYPE;
  lot_line JSONB;
  line_spent INTEGER;
  restored INTEGER := 0;
  reissued INTEGER := 0;
  reissue_lot_id UUID;
  refund_breakdown JSONB := '[]'::jsonb;
  new_entry_id UUID;
  new_balance BIGINT;
BEGIN
  SELECT * INTO debit_entry
  FROM public.workspace_credit_ledger
  WHERE id = p_debit_entry_id
    AND workspace_id = p_workspace_id
    AND entry_type = 'debit';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit entry is invalid';
  END IF;

  refund_key := 'refund:' || p_debit_entry_id::text;
  SELECT * INTO existing_refund
  FROM public.workspace_credit_ledger
  WHERE workspace_id = p_workspace_id
    AND idempotency_key = refund_key;
  IF FOUND THEN
    SELECT COALESCE(SUM(remaining), 0) INTO new_balance
    FROM public.workspace_credit_lots
    WHERE workspace_id = p_workspace_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now());
    RETURN jsonb_build_object(
      'idempotent', true,
      'entry_id', existing_refund.id,
      'refunded', existing_refund.amount,
      'balance', new_balance
    );
  END IF;

  FOR lot_line IN
    SELECT * FROM jsonb_array_elements(COALESCE(debit_entry.lot_breakdown, '[]'::jsonb))
  LOOP
    line_spent := (lot_line->>'spent')::integer;
    -- Only while the lot still counts toward the balance. An expired lot gets
    -- nothing back: refilling it is invisible to every balance read, and the
    -- sweep would silently re-zero it with its journal line already spent.
    UPDATE public.workspace_credit_lots
    SET remaining = LEAST(granted, remaining + line_spent)
    WHERE id = (lot_line->>'lot_id')::uuid
      AND workspace_id = p_workspace_id
      AND (expires_at IS NULL OR expires_at > now());
    IF FOUND THEN
      restored := restored + line_spent;
      refund_breakdown := refund_breakdown
        || jsonb_build_object('lot_id', (lot_line->>'lot_id')::uuid, 'restored', line_spent);
    ELSE
      reissued := reissued + line_spent;
    END IF;
  END LOOP;

  IF restored + reissued = 0 THEN
    RAISE EXCEPTION 'nothing to refund';
  END IF;

  IF reissued > 0 THEN
    INSERT INTO public.workspace_credit_lots (
      workspace_id, source, granted, remaining, expires_at
    )
    VALUES (
      p_workspace_id, 'admin_grant', reissued, reissued, now() + INTERVAL '30 days'
    )
    RETURNING id INTO reissue_lot_id;
    refund_breakdown := refund_breakdown
      || jsonb_build_object('lot_id', reissue_lot_id, 'reissued', reissued);
  END IF;

  INSERT INTO public.workspace_credit_ledger (
    workspace_id, entry_type, amount, operation_type,
    reference_kind, reference_id, client_id, actor_user_id,
    idempotency_key, lot_breakdown
  )
  VALUES (
    p_workspace_id, 'refund', restored + reissued, debit_entry.operation_type,
    'refund_of', p_debit_entry_id::text, debit_entry.client_id, debit_entry.actor_user_id,
    refund_key, refund_breakdown
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
    'refunded', restored + reissued,
    'reissued', reissued,
    'balance', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.refund_workspace_credits_v1(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_workspace_credits_v1(UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.spend_workspace_credits_v1 IS
  'Charges a workspace for a metered operation, FIFO by lot expiry, idempotent per unrefunded charge: a refunded debit opens a new retry generation instead of replaying free.';
COMMENT ON FUNCTION public.refund_workspace_credits_v1 IS
  'Refunds a specific debit to its source lots while they are unexpired; the expired portion is reissued as a fresh 30-day lot so the client actually gets it back, and the breakdown records which was which.';

COMMIT;
