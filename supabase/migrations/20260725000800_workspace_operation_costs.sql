-- Billing phase 0: per-operation COGS instrumentation.
--
-- Records what each metered workspace operation actually costs the platform
-- (model tokens, Podscan calls) so credit prices can be set against measured
-- unit economics instead of estimates. Append-only, service-role written.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-operation-costs:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_operation_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  client_id UUID,
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'research_run',
    'email_unlock_identify',
    'email_unlock_find',
    'email_unlock_verify',
    'dashboard_build',
    'query_generation',
    'other'
  )),
  anthropic_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (anthropic_input_tokens >= 0),
  anthropic_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (anthropic_output_tokens >= 0),
  openai_tokens INTEGER NOT NULL DEFAULT 0 CHECK (openai_tokens >= 0),
  podscan_calls INTEGER NOT NULL DEFAULT 0 CHECK (podscan_calls >= 0),
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  reference_kind TEXT CHECK (reference_kind IS NULL OR char_length(reference_kind) <= 60),
  reference_id TEXT CHECK (reference_id IS NULL OR char_length(reference_id) <= 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- client_id is intentionally a soft reference: cost history must survive
-- client deletion, and rows are only written by service-role code that has
-- already resolved the client inside the workspace.

CREATE INDEX IF NOT EXISTS workspace_operation_costs_workspace_created_idx
  ON public.workspace_operation_costs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_operation_costs_type_created_idx
  ON public.workspace_operation_costs (operation_type, created_at DESC);

ALTER TABLE public.workspace_operation_costs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspace_operation_costs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_operation_costs FROM service_role;
-- Append-only: nothing rewrites cost history, matching workspace_audit_log.
GRANT SELECT, INSERT ON TABLE public.workspace_operation_costs TO service_role;
GRANT SELECT ON TABLE public.workspace_operation_costs TO authenticated;

DROP POLICY IF EXISTS workspace_operation_costs_authenticated_select
  ON public.workspace_operation_costs;
CREATE POLICY workspace_operation_costs_authenticated_select
  ON public.workspace_operation_costs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

DROP POLICY IF EXISTS workspace_operation_costs_authenticated_select_isolation
  ON public.workspace_operation_costs;
CREATE POLICY workspace_operation_costs_authenticated_select_isolation
  ON public.workspace_operation_costs
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.can_access_workspace(workspace_id)
  );

COMMIT;
