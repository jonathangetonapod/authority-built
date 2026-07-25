-- Metering rollout: extend the billable operation vocabulary to the
-- operations that actually run today, track BYO-key usage on cost rows, and
-- store per-workspace AI provider keys (AES-GCM, same posture as the
-- Instantly integration credentials).

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:metering-and-byo-keys:v1', 0));

-- ---------------------------------------------------------------------------
-- Extended operation_type vocabulary. New: compatibility_scoring,
-- podscan_lookup, semantic_search, pitch_profile.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_operation_costs
  DROP CONSTRAINT IF EXISTS workspace_operation_costs_operation_type_check;
ALTER TABLE public.workspace_operation_costs
  ADD CONSTRAINT workspace_operation_costs_operation_type_check CHECK (operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'compatibility_scoring',
    'podscan_lookup',
    'semantic_search',
    'pitch_profile',
    'other'
  ));

ALTER TABLE public.workspace_credit_ledger
  DROP CONSTRAINT IF EXISTS workspace_credit_ledger_operation_type_check;
ALTER TABLE public.workspace_credit_ledger
  ADD CONSTRAINT workspace_credit_ledger_operation_type_check CHECK (operation_type IS NULL OR operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'compatibility_scoring',
    'podscan_lookup',
    'semantic_search',
    'pitch_profile',
    'other'
  ));

ALTER TABLE public.operation_credit_costs
  DROP CONSTRAINT IF EXISTS operation_credit_costs_operation_type_check;
ALTER TABLE public.operation_credit_costs
  ADD CONSTRAINT operation_credit_costs_operation_type_check CHECK (operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'compatibility_scoring',
    'podscan_lookup',
    'semantic_search',
    'pitch_profile',
    'other'
  ));

INSERT INTO public.operation_credit_costs (operation_type, credit_cost)
VALUES
  ('compatibility_scoring', 1),
  ('podscan_lookup', 1),
  ('semantic_search', 0),
  ('pitch_profile', 3)
ON CONFLICT (operation_type, effective_from) DO NOTHING;

ALTER TABLE public.workspace_operation_costs
  ADD COLUMN IF NOT EXISTS used_byo_key BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- spend_workspace_credits_v1 re-created with the extended inline vocabulary.
-- Body otherwise identical to 20260725001000.
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
    'email_unlock_verify', 'dashboard_build', 'query_generation',
    'compatibility_scoring', 'podscan_lookup', 'semantic_search',
    'pitch_profile', 'other'
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

REVOKE ALL ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Per-workspace AI provider keys. Write-only from the owner's perspective;
-- ciphertext posture identical to workspace_instantly_integrations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_ai_credentials (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  api_key_last_four TEXT NOT NULL CHECK (char_length(api_key_last_four) = 4),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, provider)
);

ALTER TABLE public.workspace_ai_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_ai_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_ai_credentials FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_ai_credentials TO service_role;

COMMENT ON TABLE public.workspace_ai_credentials IS
  'Per-workspace bring-your-own AI provider keys, AES-GCM encrypted. Operations using a workspace key do not consume platform credits.';

COMMIT;
