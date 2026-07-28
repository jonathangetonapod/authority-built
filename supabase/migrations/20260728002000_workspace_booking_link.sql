-- One booking link per workspace, set once and used wherever a prospect is
-- asked to take the next step.
--
-- The prospect dashboard already supports a per-dashboard call-to-action, but
-- it has to be retyped for every prospect, so in practice it is left empty and
-- the page falls back to "reply to the email that brought you here". A link the
-- agency pastes once in settings gives every unconfigured dashboard a real way
-- to book.
--
-- Kept separate from the client-brand RPC deliberately: that one carries an
-- optimistic-concurrency token because three fields are edited together, and a
-- single URL does not need one.

BEGIN;

DO $workspace_booking_link_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'workspace booking link requires workspace staff authorization';
  END IF;
END;
$workspace_booking_link_prerequisites$;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS booking_embed_url TEXT;

COMMENT ON COLUMN public.workspaces.booking_embed_url IS
  'Scheduler link shown to prospects when a dashboard has no call-to-action of its own. https only; rendered inline for recognised scheduler hosts and as a button otherwise.';

DO $workspace_booking_link_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_booking_embed_url_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_booking_embed_url_check CHECK (
        booking_embed_url IS NULL
        OR (
          booking_embed_url = btrim(booking_embed_url)
          AND char_length(booking_embed_url) BETWEEN 12 AND 500
          -- https only: this is rendered on a public page, and an http frame
          -- is blocked by the browser after the operator has already saved it.
          AND booking_embed_url ~ '^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
          AND booking_embed_url !~ '[[:cntrl:]]'
        )
      ) NOT VALID;
  END IF;
END;
$workspace_booking_link_constraint$;

/**
 * Set or clear the workspace booking link.
 *
 * Same manager authorization as the other workspace settings writes, and the
 * same refusal to touch the default platform workspace.
 */
CREATE OR REPLACE FUNCTION public.set_workspace_booking_link_v1(
  p_workspace_id UUID,
  p_booking_embed_url TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  normalized_url TEXT := NULLIF(btrim(p_booking_embed_url), '');
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace is required' USING ERRCODE = '22023';
  END IF;
  IF normalized_url IS NOT NULL AND (
    char_length(normalized_url) > 500
    OR normalized_url !~ '^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
    OR normalized_url ~ '[[:cntrl:]]'
  ) THEN
    RAISE EXCEPTION 'booking link is invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-booking-link:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at,
    true
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspaces AS workspace
  SET booking_embed_url = normalized_url
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
    AND NOT workspace.is_default
  RETURNING jsonb_build_object(
    'workspace_id', workspace.id,
    'booking_embed_url', workspace.booking_embed_url
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.set_workspace_booking_link_v1(UUID, TEXT, UUID, BIGINT) IS
  'Sets the workspace booking link shown to prospects. Manager-only, private workspaces only.';

REVOKE ALL ON FUNCTION public.set_workspace_booking_link_v1(UUID, TEXT, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_booking_link_v1(UUID, TEXT, UUID, BIGINT)
  TO service_role;

COMMIT;
