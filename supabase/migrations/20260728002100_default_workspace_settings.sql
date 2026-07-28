-- Give the default platform workspace the same settings surface every tenant
-- workspace has.
--
-- The default workspace runs real clients — its own prospect dashboards,
-- onboarding, and campaigns — but it was excluded from the entire settings
-- surface at the root: workspace_staff_actor_role_v1 raises 'private workspace
-- not found' for it, and each settings RPC repeats AND NOT workspace.is_default
-- on top. So the agency operating the platform could not set its own workspace
-- name, client-facing brand, logo, or booking link, and its prospects fell back
-- to platform defaults on pages meant to carry the agency's identity.
--
-- The opening is deliberately narrow. Only the five SETTINGS entry points move
-- to a gate that admits the default workspace. Every staff MUTATION — invite,
-- role change, ownership transfer, password reset, revoke — keeps calling
-- workspace_staff_actor_role_v1 and stays closed to it, because
-- enforce_private_workspace_staff_invariants skips the default workspace by
-- design: there is no last-owner protection there, and platform admin identity
-- is anchored on an active default-workspace membership. Removing the wrong row
-- would take away the access that authorizes removing it. Those accounts are
-- managed by the platform allowlist, and the roster is served read-only here.

BEGIN;

DO $default_workspace_settings_prerequisites$
BEGIN
  IF to_regprocedure(
    'public.workspace_staff_actor_role_v1(uuid,uuid,bigint,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'default workspace settings require workspace staff authorization';
  END IF;
  IF to_regprocedure(
    'public.is_platform_admin_identity(uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'default workspace settings require platform admin identity';
  END IF;
  IF to_regprocedure(
    'public.set_workspace_booking_link_v1(uuid,text,uuid,bigint)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'default workspace settings require the workspace booking link';
  END IF;
END;
$default_workspace_settings_prerequisites$;

-- The settings gate. For a private workspace it is exactly the existing staff
-- gate, so tenant behaviour is untouched. For the default workspace it applies
-- the same freshness rules — active workspace, token at or after both the
-- workspace and membership epochs, temporary-password markers reconciled — and
-- resolves the caller through the platform allowlist first, because a platform
-- administrator is defined by admin_users and an active default-workspace
-- membership, not by the role on that membership.
CREATE OR REPLACE FUNCTION public.workspace_settings_actor_role_v1(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_email TEXT;
  actor_role TEXT;
  workspace_epoch BIGINT;
  workspace_is_default BOOLEAN;
  workspace_status TEXT;
BEGIN
  IF p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace settings actor context'
      USING ERRCODE = '22023';
  END IF;

  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT workspace_is_default THEN
    RETURN public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      true
    );
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace settings actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.status, workspace.access_not_before_epoch
  INTO workspace_status, workspace_epoch
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR SHARE;

  IF workspace_status <> 'active' OR p_token_issued_at < workspace_epoch THEN
    RAISE EXCEPTION 'active workspace settings access is required'
      USING ERRCODE = '42501';
  END IF;

  -- The membership carrying the caller's access to this workspace, whatever
  -- role it holds. The role decides the answer only for a non-platform member.
  SELECT membership.role
  INTO actor_role
  FROM public.workspace_memberships AS membership
  JOIN auth.users AS auth_user
    ON auth_user.id = membership.user_id
    AND lower(btrim(auth_user.email)) = membership.email_normalized
  WHERE membership.workspace_id = p_workspace_id
    AND membership.user_id = p_actor_user_id
    AND membership.email_normalized = actor_email
    AND membership.status = 'active'
    AND p_token_issued_at >= membership.workspace_access_not_before_epoch
    AND (
      membership.provisioning_method <> 'admin_temporary_password'
      OR (
        NOT membership.password_change_required
        AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
          = 'admin_temporary_password'
        AND auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required' = 'false'
      )
    )
  FOR SHARE OF membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active platform workspace access is required'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    RETURN 'platform_admin';
  END IF;

  IF actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'active workspace owner or administrator access is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN actor_role;
END;
$$;

COMMENT ON FUNCTION public.workspace_settings_actor_role_v1(UUID, UUID, BIGINT) IS
  'Authorizes the workspace settings surface. Delegates to workspace_staff_actor_role_v1 for private workspaces and admits the default platform workspace for its own operators. Settings only: staff mutations keep using the staff gate.';

REVOKE ALL ON FUNCTION public.workspace_settings_actor_role_v1(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_settings_actor_role_v1(UUID, UUID, BIGINT)
  TO service_role;

-- The roster read. On the default workspace it is deliberately inert: no invite
-- roles, no role changes, no ownership transfer, and no per-member action, so
-- the page never offers a button whose mutation would be refused underneath it.
-- can_generate_password stays true because it is what marks the caller a
-- manager, and that is what unlocks the branding and name sections; the empty
-- allowed_actions decide which rows may actually be acted on, which is none.
CREATE OR REPLACE FUNCTION public.workspace_staff_list_v1(
  p_workspace_id UUID,
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
  workspace_is_default BOOLEAN;
  result JSONB;
BEGIN
  actor_role := public.workspace_settings_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', workspace.id,
      'name', workspace.name,
      'status', workspace.status,
      'is_default', workspace.is_default
    ),
    'capabilities', jsonb_build_object(
      'read_only', false,
      'invite_roles', CASE
        WHEN workspace_is_default THEN '[]'::JSONB
        ELSE CASE actor_role
          WHEN 'owner' THEN jsonb_build_array('admin', 'member')
          WHEN 'platform_admin' THEN jsonb_build_array('admin', 'member')
          WHEN 'admin' THEN jsonb_build_array('member')
          ELSE '[]'::JSONB
        END
      END,
      'can_generate_password', actor_role IN (
        'owner', 'admin', 'platform_admin'
      ),
      'can_update_roles', NOT workspace_is_default
        AND actor_role IN ('owner', 'platform_admin'),
      'can_transfer_owner', NOT workspace_is_default
        AND actor_role IN ('owner', 'platform_admin')
    ),
    'members', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', membership.id,
          'email', membership.email_normalized,
          'full_name', membership.full_name,
          'role', membership.role,
          'status', membership.status,
          'setup_method', membership.provisioning_method,
          'invited_at', membership.invited_at,
          'invite_expires_at', membership.invite_expires_at,
          'accepted_at', membership.accepted_at,
          'suspended_at', membership.suspended_at,
          'pending_review', claim_state.pending_review,
          'allowed_actions', CASE
            WHEN workspace_is_default THEN '[]'::JSONB
            WHEN claim_state.pending_review
              OR membership.user_id = p_actor_user_id
              OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
              OR (actor_role = 'admin' AND membership.role <> 'member')
            THEN '[]'::JSONB
            WHEN membership.role = 'owner'
              AND membership.status = 'active'
              AND actor_role = 'platform_admin'
            THEN jsonb_build_array('reset_password')
            WHEN membership.role = 'owner'
              AND membership.status = 'invited'
              AND membership.provisioning_method = 'admin_temporary_password'
              AND membership.password_change_required
              AND actor_role = 'platform_admin'
            THEN jsonb_build_array('reset_password')
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'email_invite'
            THEN jsonb_build_array('retry_invite', 'revoke')
            WHEN membership.status = 'provisioning'
              AND membership.provisioning_method = 'admin_temporary_password'
            THEN jsonb_build_array('retry_password', 'revoke')
            WHEN membership.status = 'invited'
              AND membership.provisioning_method = 'admin_temporary_password'
              AND membership.password_change_required
              AND actor_role IN ('owner', 'platform_admin')
            THEN jsonb_build_array('reset_password', 'revoke')
            WHEN membership.status = 'invited' THEN
              jsonb_build_array('revoke')
            WHEN membership.status = 'active'
              AND actor_role IN ('owner', 'platform_admin') THEN
              jsonb_build_array(
                'reset_password', 'suspend', 'update_role', 'transfer_owner'
              )
            WHEN membership.status = 'active' THEN
              jsonb_build_array('suspend')
            WHEN membership.status = 'suspended'
              AND actor_role IN ('owner', 'platform_admin') THEN
              jsonb_build_array('reactivate', 'revoke', 'update_role')
            WHEN membership.status = 'suspended' THEN
              jsonb_build_array('reactivate', 'revoke')
            ELSE '[]'::JSONB
          END
        )
        ORDER BY
          CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          membership.full_name NULLS LAST,
          membership.email_normalized,
          membership.id
      )
      FROM public.workspace_memberships AS membership
      CROSS JOIN LATERAL (
        SELECT (
          EXISTS (
            SELECT 1
            FROM public.workspace_invite_delivery_claims AS invite_claim
            WHERE invite_claim.membership_id = membership.id
          ) OR EXISTS (
            SELECT 1
            FROM public.workspace_auth_lifecycle_claims AS lifecycle_claim
            WHERE lifecycle_claim.membership_id = membership.id
          ) OR EXISTS (
            SELECT 1
            FROM public.workspace_account_credential_claims AS credential_claim
            WHERE credential_claim.membership_id = membership.id
          )
        ) AS pending_review
      ) AS claim_state
      WHERE membership.workspace_id = p_workspace_id
        AND (
          membership.status <> 'revoked'
          OR claim_state.pending_review
        )
    ), '[]'::JSONB)
  )
  INTO result
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_name_v1(
  p_workspace_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_workspace_name TEXT,
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
  current_updated_at TIMESTAMPTZ;
  current_workspace_name TEXT;
  normalized_workspace_name TEXT := NULLIF(btrim(p_workspace_name), '');
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_expected_updated_at IS NULL
    OR normalized_workspace_name IS NULL
    OR char_length(normalized_workspace_name) > 120
    OR normalized_workspace_name ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'workspace name is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-name:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_settings_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.updated_at, workspace.name
  INTO current_updated_at, current_workspace_name
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'workspace state changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.workspaces AS workspace
  SET name = normalized_workspace_name
  WHERE workspace.id = p_workspace_id
    AND workspace.updated_at = p_expected_updated_at
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'name', workspace.name,
    'updated_at', workspace.updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace state changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.identity.name_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'previous_name', current_workspace_name,
      'workspace_name', normalized_workspace_name
    )
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_logo_v1(
  p_workspace_id UUID,
  p_expected_logo_path TEXT,
  p_logo_path TEXT,
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
  current_logo_path TEXT;
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-branding:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_settings_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.logo_path
  INTO current_logo_path
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_logo_path IS DISTINCT FROM p_expected_logo_path THEN
    RAISE EXCEPTION 'workspace logo state changed'
      USING ERRCODE = '40001';
  END IF;

  IF p_logo_path IS NOT NULL
    AND p_logo_path !~ (
      '^' || p_workspace_id::TEXT ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
    )
  THEN
    RAISE EXCEPTION 'workspace logo path is invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspaces AS workspace
  SET
    logo_path = p_logo_path,
    logo_updated_at = CASE
      WHEN p_logo_path IS NULL THEN NULL
      ELSE clock_timestamp()
    END
  WHERE workspace.id = p_workspace_id
    AND workspace.logo_path IS NOT DISTINCT FROM p_expected_logo_path
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'logo_path', workspace.logo_path,
    'logo_updated_at', workspace.logo_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace logo state changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    CASE
      WHEN p_logo_path IS NULL THEN 'workspace.branding.logo_removed'
      ELSE 'workspace.branding.logo_updated'
    END,
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'had_previous_logo', current_logo_path IS NOT NULL,
      'has_logo', p_logo_path IS NOT NULL
    )
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_client_brand_v1(
  p_workspace_id UUID,
  p_expected_brand_updated_at TIMESTAMPTZ,
  p_client_brand_name TEXT,
  p_client_brand_primary_color TEXT,
  p_client_brand_accent_color TEXT,
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
  current_brand_updated_at TIMESTAMPTZ;
  normalized_brand_name TEXT := NULLIF(btrim(p_client_brand_name), '');
  normalized_primary_color TEXT := upper(NULLIF(btrim(p_client_brand_primary_color), ''));
  normalized_accent_color TEXT := upper(NULLIF(btrim(p_client_brand_accent_color), ''));
  result JSONB;
BEGIN
  IF p_workspace_id IS NULL
    OR p_expected_brand_updated_at IS NULL
    OR normalized_brand_name IS NULL
    OR char_length(normalized_brand_name) > 120
    OR normalized_brand_name ~ '[[:cntrl:]]'
    OR normalized_primary_color IS NULL
    OR normalized_accent_color IS NULL
    OR normalized_primary_color !~ '^#[0-9A-F]{6}$'
    OR normalized_accent_color !~ '^#[0-9A-F]{6}$'
  THEN
    RAISE EXCEPTION 'workspace client branding is invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-client-brand:' || p_workspace_id::TEXT, 0)
  );

  actor_role := public.workspace_settings_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT workspace.client_brand_updated_at
  INTO current_brand_updated_at
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF current_brand_updated_at IS DISTINCT FROM p_expected_brand_updated_at THEN
    RAISE EXCEPTION 'workspace branding state changed'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.workspaces AS workspace
  SET
    client_brand_name = normalized_brand_name,
    client_brand_primary_color = normalized_primary_color,
    client_brand_accent_color = normalized_accent_color,
    client_brand_updated_at = clock_timestamp()
  WHERE workspace.id = p_workspace_id
    AND workspace.client_brand_updated_at = p_expected_brand_updated_at
  RETURNING jsonb_build_object(
    'id', workspace.id,
    'logo_path', workspace.logo_path,
    'logo_updated_at', workspace.logo_updated_at,
    'client_brand_name', workspace.client_brand_name,
    'client_brand_primary_color', workspace.client_brand_primary_color,
    'client_brand_accent_color', workspace.client_brand_accent_color,
    'client_brand_updated_at', workspace.client_brand_updated_at
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace branding state changed'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.branding.client_identity_updated',
    'workspace',
    p_workspace_id,
    jsonb_build_object(
      'client_brand_name', normalized_brand_name,
      'primary_color', normalized_primary_color,
      'accent_color', normalized_accent_color
    )
  );

  RETURN result;
END;
$$;

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

  actor_role := public.workspace_settings_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );

  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspaces AS workspace
  SET booking_embed_url = normalized_url
  WHERE workspace.id = p_workspace_id
    AND workspace.status = 'active'
  RETURNING jsonb_build_object(
    'workspace_id', workspace.id,
    'booking_embed_url', workspace.booking_embed_url
  )
  INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.set_workspace_booking_link_v1(UUID, TEXT, UUID, BIGINT) IS
  'Sets the workspace booking link shown to prospects. Manager-only, every active workspace including the default platform one.';

COMMIT;
