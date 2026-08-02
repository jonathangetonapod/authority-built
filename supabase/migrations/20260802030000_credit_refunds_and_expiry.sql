-- Two movements the ledger could describe but nothing ever wrote.
--
-- The ledger is documented as the audit explanation for every movement of
-- credit, and its vocabulary has always included 'refund' and 'expiry'. No
-- code produced either, so:
--
--   * A charge taken before work that then failed stayed taken. Operations
--     charge up front — the model call, the provider lookup — and when that
--     call times out the credit is gone and nothing was delivered. There was
--     no way to give it back short of a manual adjustment.
--
--   * A lot reaching expires_at silently dropped out of the balance, because
--     balance is a filtered sum over lots. The ledger said nothing, so from
--     that moment the journal no longer reconciled with the balance it is
--     supposed to explain.
--
-- Both are written here as SECURITY DEFINER functions on the same footing as
-- spend_workspace_credits_v1: service-role only, idempotent, and taking the
-- lots they touch under a row lock.

-- ---------------------------------------------------------------------------
-- Give back a specific debit.
--
-- Refunds the exact lots the debit consumed, from its recorded breakdown,
-- rather than minting fresh credit — otherwise a refund would quietly extend
-- an expiry date, turning a failed operation into free lifetime credit.
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
  restored INTEGER := 0;
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

  -- One refund per debit, enforced by the same unique index that makes
  -- charging idempotent. A retried failure handler must not pay twice.
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
    UPDATE public.workspace_credit_lots
    SET remaining = LEAST(granted, remaining + (lot_line->>'spent')::integer)
    WHERE id = (lot_line->>'lot_id')::uuid
      AND workspace_id = p_workspace_id;
    IF FOUND THEN
      restored := restored + (lot_line->>'spent')::integer;
    END IF;
  END LOOP;

  IF restored = 0 THEN
    RAISE EXCEPTION 'nothing to refund';
  END IF;

  INSERT INTO public.workspace_credit_ledger (
    workspace_id, entry_type, amount, operation_type,
    reference_kind, reference_id, client_id, actor_user_id,
    idempotency_key, lot_breakdown
  )
  VALUES (
    p_workspace_id, 'refund', restored, debit_entry.operation_type,
    'refund_of', p_debit_entry_id::text, debit_entry.client_id, debit_entry.actor_user_id,
    refund_key,
    jsonb_build_object('reason', COALESCE(p_reason, 'operation failed'), 'debit_entry_id', p_debit_entry_id)
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
    'refunded', restored,
    'balance', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_workspace_credits_v1(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_workspace_credits_v1(UUID, UUID, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Write down what expiry already did.
--
-- Zeroes lots that are past their date and records one ledger line each, so
-- the journal and the balance agree again. Safe to run repeatedly: a lot with
-- nothing remaining is not selected twice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_workspace_credit_lots_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  lot RECORD;
  expired_lots INTEGER := 0;
  expired_credits INTEGER := 0;
BEGIN
  FOR lot IN
    SELECT id, workspace_id, remaining
    FROM public.workspace_credit_lots
    WHERE remaining > 0
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    ORDER BY expires_at ASC
    LIMIT 500
    FOR UPDATE
  LOOP
    UPDATE public.workspace_credit_lots
    SET remaining = 0
    WHERE id = lot.id;

    INSERT INTO public.workspace_credit_ledger (
      workspace_id, entry_type, amount, lot_id,
      reference_kind, idempotency_key, lot_breakdown
    )
    VALUES (
      lot.workspace_id, 'expiry', -lot.remaining, lot.id,
      'lot_expiry',
      -- One expiry line per lot, for ever.
      'expiry:' || lot.id::text,
      jsonb_build_object('lot_id', lot.id, 'expired', lot.remaining)
    )
    ON CONFLICT DO NOTHING;

    expired_lots := expired_lots + 1;
    expired_credits := expired_credits + lot.remaining;
  END LOOP;

  RETURN jsonb_build_object('lots', expired_lots, 'credits', expired_credits);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_workspace_credit_lots_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_workspace_credit_lots_v1()
  TO service_role;

-- ---------------------------------------------------------------------------
-- Run the sweep. Daily is enough: expiry is a date, not an event, and nothing
-- reads a lot between the moment it lapses and the moment this records it —
-- the balance already excludes it. This exists so the ledger agrees.
--
-- No edge function in the path: the work is a database function, so the
-- schedule calls it directly rather than paying for a round trip through an
-- HTTP handler that would only forward the same call.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workspace-credit-expiry') THEN
    PERFORM cron.unschedule('workspace-credit-expiry');
  END IF;
  PERFORM cron.schedule(
    'workspace-credit-expiry',
    '17 3 * * *',
    $job$SELECT public.expire_workspace_credit_lots_v1();$job$
  );
END;
$$;
