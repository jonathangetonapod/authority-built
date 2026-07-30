-- Some audited actions belong to the platform rather than to any one workspace.
-- Changing what a plan costs is the first: it applies to every tenant at once,
-- so there is no workspace_id to record, and NOT NULL turned the audit write
-- into a constraint violation that failed the whole request — after the Stripe
-- Price had been created and the plan repointed.
--
-- Safe to widen: both select policies on this table are is_platform_admin()
-- and neither reads workspace_id, so a null cannot leak a row to a tenant. The
-- foreign key still holds for every row that names a workspace.

ALTER TABLE public.workspace_audit_log
  ALTER COLUMN workspace_id DROP NOT NULL;

COMMENT ON COLUMN public.workspace_audit_log.workspace_id IS
  'The workspace an action belongs to. Null for platform-wide actions, such as '
  'changing the price of a plan, which apply to every workspace at once.';
