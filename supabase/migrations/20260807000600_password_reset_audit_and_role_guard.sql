-- Password-reset forensics + the one staff mutation missing the
-- platform-admin guard, from the /app/settings audit.
--
--  1. claim_workspace_staff_password_reset_v1 flipped the target account and
--     returned with no audit row; the only audit was written on completion.
--     A reset that changed the target's password in GoTrue and then died
--     before completing named nobody. It now records the actor at claim time.
--  2. update_workspace_staff_role_v1 was the only staff mutation that did not
--     refuse a platform-admin-email target — every sibling (invite, revoke,
--     suspend, reactivate, reset, transfer) does. A workspace owner could
--     demote a platform admin holding an admin membership in their tenant.

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_workspace_staff_password_reset_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_attempt_id UUID,
  p_execution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  auth_email TEXT;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_membership_id IS NULL
    OR p_attempt_id IS NULL
    OR p_execution_id IS NULL
    OR p_attempt_id = p_execution_id
  THEN
    RAISE EXCEPTION 'workspace password reset fields are invalid'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password target not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF membership.user_id IS NULL
    OR membership.user_id = p_actor_user_id
    OR actor_role = 'admin'
    OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
  THEN
    RAISE EXCEPTION 'workspace staff password target is outside the actor role hierarchy'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    membership.status = 'active'
    OR (
      membership.status = 'invited'
      AND membership.provisioning_method = 'admin_temporary_password'
      AND membership.password_change_required
    )
  ) THEN
    RAISE EXCEPTION 'workspace staff password target is unavailable'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_membership_has_provider_claim_v1(membership.id) THEN
    RAISE EXCEPTION 'workspace staff password reset is busy'
      USING ERRCODE = '55P03';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND auth_user.confirmed_at IS NOT NULL
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0
    AND (
      (
        auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id'
          = membership.id::TEXT
      )
      OR (
        auth_user.raw_app_meta_data ->> 'workspace_id' IS NULL
        AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' IS NULL
      )
    )
    AND NOT (
      (
        auth_user.raw_user_meta_data ->> 'workspace_id' IS NOT NULL
        AND auth_user.raw_user_meta_data ->> 'workspace_id'
          <> p_workspace_id::TEXT
      )
      OR (
        auth_user.raw_user_meta_data ->> 'workspace_membership_id' IS NOT NULL
        AND auth_user.raw_user_meta_data ->> 'workspace_membership_id'
          <> membership.id::TEXT
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_memberships AS other_membership
      WHERE other_membership.id <> membership.id
        AND other_membership.user_id = auth_user.id
        AND other_membership.status IN (
          'provisioning', 'invited', 'active', 'suspended'
        )
    );

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_account_credential_claims (
    membership_id,
    attempt_id,
    execution_id,
    claim_kind,
    actor_user_id,
    acquired_at,
    review_after,
    original_status,
    original_provisioning_method,
    original_password_change_required,
    original_invited_at,
    original_invite_expires_at,
    original_workspace_access_not_before_epoch
  )
  VALUES (
    membership.id,
    p_attempt_id,
    p_execution_id,
    'staff_password_reset',
    p_actor_user_id,
    now(),
    now() + interval '15 minutes',
    membership.status,
    membership.provisioning_method,
    membership.password_change_required,
    membership.invited_at,
    membership.invite_expires_at,
    membership.workspace_access_not_before_epoch
  );

  -- Forensic record at the moment the reset is claimed, not only on
  -- completion. The completion audit lives in
  -- complete_workspace_staff_password_reset_v1, so a reset that changed the
  -- target's password and then died before completing left no trace of who
  -- initiated it. This row names the actor as soon as the claim is held, and
  -- being in the audit log (not the credential-claim row) it survives a
  -- cancel.
  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.password_reset_started',
    'workspace_membership',
    membership.id,
    jsonb_build_object('email', membership.email_normalized)
  );

  UPDATE public.workspace_memberships
  SET
    status = 'invited',
    provisioning_method = 'admin_temporary_password',
    password_change_required = true,
    invited_at = now(),
    invite_expires_at = now() + interval '7 days',
    suspended_at = NULL,
    suspended_by = NULL,
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    )
  WHERE id = membership.id
  RETURNING * INTO membership;

  RETURN jsonb_build_object(
    'membership', to_jsonb(membership),
    'attempt_id', p_attempt_id,
    'execution_id', p_execution_id
  );
END;
$$;

-- 2. update_workspace_staff_role_v1 refuses a platform-admin target, like
-- its siblings. Placed after the owner/self guard, mirroring revoke.
CREATE OR REPLACE FUNCTION public.update_workspace_staff_role_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_role TEXT,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  membership public.workspace_memberships%ROWTYPE;
  normalized_role TEXT := lower(btrim(p_role));
  previous_role TEXT;
BEGIN
  IF p_membership_id IS NULL
    OR normalized_role IS NULL
    OR normalized_role NOT IN ('admin', 'member')
  THEN
    RAISE EXCEPTION 'invalid workspace staff role update'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.lock_workspace_provider_lifecycle_v1(p_workspace_id);

  actor_role := public.workspace_staff_actor_role_v1(
    p_workspace_id, p_actor_user_id, p_token_issued_at, true
  );

  IF actor_role NOT IN ('owner', 'platform_admin') THEN
    RAISE EXCEPTION 'workspace owner access is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_membership.*
  INTO membership
  FROM public.workspace_memberships AS existing_membership
  WHERE existing_membership.id = p_membership_id
    AND existing_membership.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff account not found' USING ERRCODE = 'P0002';
  END IF;

  IF membership.role = 'owner' OR membership.user_id = p_actor_user_id THEN
    RAISE EXCEPTION 'workspace owner role changes require ownership transfer'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_email(membership.email_normalized) THEN
    RAISE EXCEPTION 'platform administrators cannot be changed here'
      USING ERRCODE = '42501';
  END IF;

  IF membership.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'workspace staff account role is not editable'
      USING ERRCODE = '55000';
  END IF;

  IF public.workspace_user_has_provider_claim_v1(membership.user_id) THEN
    RAISE EXCEPTION 'workspace staff actor has a pending provider claim'
      USING ERRCODE = '55P03';
  END IF;

  IF public.workspace_membership_has_provider_claim_v1(membership.id) THEN
    RAISE EXCEPTION 'workspace staff provider operation is busy'
      USING ERRCODE = '55P03';
  END IF;

  IF membership.role = normalized_role THEN
    RETURN membership;
  END IF;

  previous_role := membership.role;

  UPDATE public.workspace_memberships
  SET
    role = normalized_role,
    workspace_access_not_before_epoch = GREATEST(
      workspace_access_not_before_epoch,
      floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 1
    )
  WHERE id = membership.id
  RETURNING * INTO membership;

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.role_updated',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'previous_role', previous_role,
      'role', membership.role
    )
  );

  RETURN membership;
END;
$$;

COMMIT;
