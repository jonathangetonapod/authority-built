-- Take credits back off a workspace.
--
-- Every path into the ledger added: a grant, a purchase, a monthly allowance.
-- Nothing took away except spending, so a grant of the wrong size — a typo, a
-- duplicate, a top-up given to the wrong agency — could only be corrected by
-- hand in SQL. The ledger has always had a word for this, 'adjustment', and
-- like 'refund' and 'expiry' before it, nothing ever wrote one.
--
-- Deductions only. A positive adjustment would have to create a lot to be
-- spendable, because the balance is a sum over lots — and a thing that creates
-- a lot is a grant, which already exists. Two ways to do the same thing is how
-- a ledger stops being an explanation.

CREATE OR REPLACE FUNCTION public.adjust_workspace_credits_v1(
  p_workspace_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
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
  lot RECORD;
  still_needed INTEGER;
  taken_from_lot INTEGER;
  breakdown JSONB := '[]'::jsonb;
  new_entry_id UUID;
  new_balance BIGINT;
BEGIN
  IF p_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'workspace is invalid';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'amount is invalid';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
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
        'removed', abs(existing_entry.amount),
        'balance', new_balance
      );
    END IF;
  END IF;

  -- Newest and longest-lived first, the reverse of spending. A correction
  -- should take back the credit most likely to be the one just given, and
  -- leave the soonest-to-expire alone so it can still be used.
  still_needed := p_amount;
  FOR lot IN
    SELECT id, remaining
    FROM public.workspace_credit_lots
    WHERE workspace_id = p_workspace_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at DESC NULLS FIRST, created_at DESC
    FOR UPDATE
  LOOP
    EXIT WHEN still_needed = 0;
    taken_from_lot := LEAST(lot.remaining, still_needed);
    UPDATE public.workspace_credit_lots
    SET remaining = remaining - taken_from_lot
    WHERE id = lot.id;
    breakdown := breakdown || jsonb_build_object('lot_id', lot.id, 'removed', taken_from_lot);
    still_needed := still_needed - taken_from_lot;
  END LOOP;

  -- A balance cannot go negative: the lots are the balance, and a lot with
  -- less than nothing in it is not a thing. An adjustment bigger than the
  -- balance is a mistake about the number, so it is refused rather than
  -- silently clamped to whatever happened to be there.
  IF still_needed > 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.workspace_credit_ledger (
    workspace_id, entry_type, amount,
    reference_kind, reference_id, actor_user_id,
    idempotency_key, lot_breakdown
  )
  VALUES (
    p_workspace_id, 'adjustment', -p_amount,
    'admin_adjustment', btrim(p_reason), p_actor_user_id,
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
    'removed', p_amount,
    'balance', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_workspace_credits_v1(UUID, INTEGER, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_workspace_credits_v1(UUID, INTEGER, TEXT, UUID, TEXT)
  TO service_role;
