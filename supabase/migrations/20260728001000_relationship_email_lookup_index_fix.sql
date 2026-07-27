-- Create the index the email-to-show lookup actually needs.
--
-- 20260728000900 asked for (workspace_id, normalized_contact_email) but reused
-- the index name 20260728000300 had already taken for
-- (workspace_id, lower(contact_email)). CREATE INDEX IF NOT EXISTS matches on
-- name alone, so it reported success and created nothing: the intended index
-- never existed on any environment where the earlier migration had run.
--
-- The two are not interchangeable. normalized_contact_email is a stored
-- generated column (lower(btrim(contact_email))); the planner does not rewrite
-- a predicate on a stored column into the expression an expression index was
-- built on, and the expressions differ by btrim regardless. The lookup in
-- workspace-host-relationships filters on the generated column, so until now
-- it was a sequential scan over the workspace's campaign targets.

CREATE INDEX IF NOT EXISTS workspace_client_campaign_targets_normalized_email_idx
  ON public.workspace_client_campaign_targets (workspace_id, normalized_contact_email)
  WHERE normalized_contact_email IS NOT NULL AND normalized_contact_email <> '';

COMMENT ON INDEX public.workspace_client_campaign_targets_normalized_email_idx IS
  'Resolves an inbound host reply to the show that address was pitched for. Matches the stored normalized_contact_email column, not the older lower(contact_email) expression index.';
