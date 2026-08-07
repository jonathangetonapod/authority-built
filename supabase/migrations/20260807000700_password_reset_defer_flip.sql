-- Defer the password-reset account flip until the provider change is
-- confirmed, so an isolate that dies mid-reset can no longer lock a tenant
-- out of its own workspace.
--
-- Before: claim_workspace_staff_password_reset_v1 flipped the target to
-- invited / password_change_required and bumped its access epoch immediately,
-- then the edge changed the GoTrue password, then complete_..._v1 finalized.
-- A process death anywhere in the provider round trip left the target flipped
-- with a held claim and no completion — for an OWNER reset (only a platform
-- admin may reset an owner) that meant the tenant had no signed-in owner and
-- no tenant-side recovery.
--
-- After: the claim records the lock and the pre-reset originals but does NOT
-- flip the membership. The flip moves into complete_..._v1, which already runs
-- only after the provider password change is verified against the stored
-- attempt/execution markers. A death before completion now leaves the target
-- on their working credential; the claim row still serializes concurrent staff
-- operations, and cancel_..._v1 is unchanged — its restore is now a no-op but
-- its guard that REFUSES to roll back once the provider password has changed
-- still stands. No edge change: the orchestration never read the flipped
-- status, only the membership identity and the GoTrue markers.

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

  -- The account is NOT flipped here. Deferring the status change to
  -- complete_workspace_staff_password_reset_v1 — which runs only after the
  -- provider password change is confirmed — means an isolate that dies mid
  -- reset leaves the target on their working credential rather than locked
  -- into a password-change state that only a platform admin could clear. The
  -- claim row (inserted above) still holds the concurrency lock and the
  -- pre-reset originals for cancel.
  RETURN jsonb_build_object(
    'membership', to_jsonb(membership),
    'attempt_id', p_attempt_id,
    'execution_id', p_execution_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_staff_password_reset_v1(
  p_workspace_id UUID,
  p_membership_id UUID,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT,
  p_attempt_id UUID,
  p_execution_id UUID,
  p_credential_version BIGINT
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role TEXT;
  auth_email TEXT;
  auth_attempt_id TEXT;
  auth_execution_id TEXT;
  auth_membership_id TEXT;
  auth_password_change_required TEXT;
  auth_provisioning_method TEXT;
  auth_version TEXT;
  auth_workspace_id TEXT;
  claim public.workspace_account_credential_claims%ROWTYPE;
  membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF p_credential_version IS NULL OR p_credential_version < 1 THEN
    RAISE EXCEPTION 'workspace staff credential version is invalid'
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

  IF NOT FOUND
    OR membership.user_id IS NULL
    OR membership.user_id = p_actor_user_id
    OR actor_role = 'admin'
    OR (membership.role = 'owner' AND actor_role <> 'platform_admin')
  THEN
    RAISE EXCEPTION 'workspace staff password target is unavailable'
      USING ERRCODE = '42501';
  END IF;

  SELECT existing_claim.*
  INTO claim
  FROM public.workspace_account_credential_claims AS existing_claim
  WHERE existing_claim.membership_id = membership.id
  FOR UPDATE;

  IF NOT FOUND
    OR claim.claim_kind <> 'staff_password_reset'
    OR claim.actor_user_id <> p_actor_user_id
    OR claim.attempt_id <> p_attempt_id
    OR claim.execution_id <> p_execution_id
  THEN
    RAISE EXCEPTION 'workspace staff password reset claim is unavailable'
      USING ERRCODE = '55000';
  END IF;

  -- The flip moved here from the claim, so the membership must still be in the
  -- exact pre-reset state the claim recorded — otherwise something edited it
  -- during the provider round trip and completing would clobber that.
  IF membership.status IS DISTINCT FROM claim.original_status
    OR membership.provisioning_method IS DISTINCT FROM claim.original_provisioning_method
    OR membership.password_change_required IS DISTINCT FROM claim.original_password_change_required
  THEN
    RAISE EXCEPTION 'workspace staff password target changed during reset'
      USING ERRCODE = '55000';
  END IF;

  SELECT
    lower(btrim(auth_user.email)),
    auth_user.raw_app_meta_data ->> 'workspace_id',
    auth_user.raw_app_meta_data ->> 'workspace_membership_id',
    auth_user.raw_app_meta_data ->> 'workspace_provisioning_method',
    auth_user.raw_app_meta_data ->> 'workspace_password_change_required',
    auth_user.raw_app_meta_data ->> 'workspace_credential_version',
    auth_user.raw_app_meta_data ->> 'workspace_credential_attempt_id',
    auth_user.raw_app_meta_data ->> 'workspace_credential_execution_id'
  INTO
    auth_email,
    auth_workspace_id,
    auth_membership_id,
    auth_provisioning_method,
    auth_password_change_required,
    auth_version,
    auth_attempt_id,
    auth_execution_id
  FROM auth.users AS auth_user
  WHERE auth_user.id = membership.user_id
    AND auth_user.confirmed_at IS NOT NULL
    AND COALESCE(char_length(auth_user.encrypted_password), 0) > 0;

  IF auth_email IS DISTINCT FROM membership.email_normalized
    OR auth_workspace_id IS DISTINCT FROM p_workspace_id::TEXT
    OR auth_membership_id IS DISTINCT FROM membership.id::TEXT
    OR auth_provisioning_method IS DISTINCT FROM 'admin_temporary_password'
    OR auth_password_change_required IS DISTINCT FROM 'true'
    OR auth_version IS DISTINCT FROM p_credential_version::TEXT
    OR auth_attempt_id IS DISTINCT FROM p_attempt_id::TEXT
    OR auth_execution_id IS DISTINCT FROM p_execution_id::TEXT
    OR public.is_platform_admin_email(auth_email)
  THEN
    RAISE EXCEPTION 'workspace staff password Auth identity is unsafe'
      USING ERRCODE = '42501';
  END IF;

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

  INSERT INTO public.workspace_audit_log (
    workspace_id, actor_user_id, action, entity_type, entity_id, metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.staff.password_reset',
    'workspace_membership',
    membership.id,
    jsonb_build_object(
      'email', membership.email_normalized,
      'role', membership.role,
      'credential_version', p_credential_version
    )
  );

  DELETE FROM public.workspace_account_credential_claims
  WHERE membership_id = membership.id
    AND attempt_id = p_attempt_id
    AND execution_id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace staff password reset claim was lost'
      USING ERRCODE = '55000';
  END IF;

  RETURN membership;
END;
$$;

COMMIT;
