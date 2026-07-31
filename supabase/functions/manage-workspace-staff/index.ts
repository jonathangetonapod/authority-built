import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import {
  errorResponse,
  HttpError,
  inviteRedirectUrl,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from "../_shared/workspaceAuth.ts";
import { generateTemporaryPassword } from "../_shared/workspaceCredentials.ts";
import {
  clearWorkspaceAiKey,
  probeAiKey,
  requireProvider,
  storeWorkspaceAiKey,
  workspaceAiKeyStatus,
} from "../_shared/workspaceAiKeys.ts";

const METHODS = ["POST"] as const;
const STAFF_ROLES = ["owner", "admin", "member"] as const;
const INVITE_ROLES = ["admin", "member"] as const;
const STAFF_STATUSES = [
  "provisioning",
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;
const PUBLIC_ACTIONS = [
  "retry_invite",
  "retry_password",
  "reset_password",
  "update_role",
  "transfer_owner",
  "suspend",
  "reactivate",
  "revoke",
] as const;
// The database allows three, not two. 'platform_bootstrap' is what the default
// workspace's own memberships were backfilled with, and every mutation below
// refuses anything that is not an invite or a temporary password, so admitting
// it here only lets the roster be read.
const PROVISIONING_METHODS = [
  "platform_bootstrap",
  "email_invite",
  "admin_temporary_password",
] as const;
const LIFECYCLE_ACTIONS = [
  "suspend",
  "reactivate",
] as const;
// The database caps live staff at 100. Extra rows are possible only while
// revoked Auth cleanup claims remain visible for reconciliation, so retain a
// separate defensive response bound instead of hiding the roster at 101.
const MAX_ROSTER_RESPONSE_MEMBERS = 1_000;
const WORKSPACE_LOGO_BUCKET = "workspace-logos";
const MAX_WORKSPACE_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACE_LOGO_REQUEST_BYTES = 2_900_000;
const WORKSPACE_LOGO_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AdminClient = Awaited<
  ReturnType<typeof requireAuthenticatedUser>
>["admin"];
type StaffRole = typeof STAFF_ROLES[number];
type InviteRole = typeof INVITE_ROLES[number];
type StaffStatus = typeof STAFF_STATUSES[number];
type PublicAction = typeof PUBLIC_ACTIONS[number];
type LifecycleAction = typeof LIFECYCLE_ACTIONS[number];
type ProvisioningMethod = typeof PROVISIONING_METHODS[number];
type WorkspaceLogoMimeType = keyof typeof WORKSPACE_LOGO_MIME_TYPES;

interface RpcError {
  code?: string;
  message?: string;
}

function schemaObjectUnavailable(error: RpcError, objectName: string): boolean {
  const message = (error.message ?? "").toLowerCase();
  const normalizedObjectName = objectName.toLowerCase();
  return error.code === "PGRST202" ||
    error.code === "PGRST204" ||
    ((message.includes("schema cache") || message.includes("does not exist")) &&
      message.includes(normalizedObjectName));
}

interface InternalMembership {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email_normalized: string;
  full_name: string | null;
  role: StaffRole;
  status: StaffStatus;
  provisioning_method: ProvisioningMethod;
  password_change_required: boolean;
  invited_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  created_at: string;
}

interface StaffMemberDto {
  id: string;
  email: string;
  full_name: string | null;
  role: StaffRole;
  status: StaffStatus;
  setup_method: ProvisioningMethod;
  invited_at: string;
  invite_expires_at: string | null;
  accepted_at: string | null;
  suspended_at: string | null;
  pending_review: boolean;
  allowed_actions: PublicAction[];
}

interface StaffPasswordResetClaim {
  membership: InternalMembership;
  attemptId: string;
  executionId: string;
}

interface StaffViewDto {
  workspace: {
    id: string;
    name: string;
    updated_at: string | null;
    status: "active";
    is_default: boolean;
    logo_path: string | null;
    logo_updated_at: string | null;
    client_brand_name: string;
    client_brand_primary_color: string;
    client_brand_accent_color: string;
    client_brand_updated_at: string | null;
  };
  members: StaffMemberDto[];
  capabilities: {
    read_only: boolean;
    invite_roles: InviteRole[];
    can_generate_password: boolean;
    can_manage_branding: boolean;
    can_manage_client_branding: boolean;
    can_manage_workspace_name: boolean;
    can_update_roles: boolean;
    can_transfer_owner: boolean;
  };
}

interface WorkspaceBrandingDto {
  id: string;
  logo_path: string | null;
  logo_updated_at: string | null;
}

interface WorkspacePresentationBrandingDto extends WorkspaceBrandingDto {
  client_brand_name: string;
  client_brand_primary_color: string;
  client_brand_accent_color: string;
  client_brand_updated_at: string;
  /** Scheduler link offered to prospects. Null until an agency sets one. */
  booking_embed_url: string | null;
}

interface WorkspaceSettingsBrandingDto extends WorkspacePresentationBrandingDto {
  name: string;
  updated_at: string;
}

interface WorkspaceNameDto {
  id: string;
  name: string;
  updated_at: string;
}

// Every validator in this file raised the same opaque message, so a rejected
// roster row could not be told from a rejected brand without querying the
// database by hand. The label names the failing check in the logs; the caller
// still sees one message, and only enum names and shapes are ever logged.
function invalidRpcResponse(where?: string): never {
  if (where) {
    console.error(`[manage-workspace-staff] invalid RPC response: ${where}`);
  }
  throw new HttpError(
    500,
    "INVALID_STAFF_RESPONSE",
    "The workspace user operation returned an invalid response",
  );
}

function responseRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalidRpcResponse();
  }
  return value as Record<string, unknown>;
}

function responseUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    invalidRpcResponse();
  }
  return value.toLowerCase();
}

function responseNullableUuid(value: unknown): string | null {
  if (value === null) return null;
  return responseUuid(value);
}

function responseText(
  value: unknown,
  max: number,
  nullable = false,
): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    invalidRpcResponse();
  }
  return value;
}

function responseTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalidRpcResponse();
  }
  return value;
}

function workspaceLogoPath(
  value: unknown,
  workspaceId: string,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 96) invalidRpcResponse();
  const pathPattern = new RegExp(
    `^${workspaceId}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(png|jpg|webp)$`,
    "u",
  );
  if (!pathPattern.test(value)) invalidRpcResponse();
  return value;
}

function workspaceBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const id = responseUuid(row.id);
  if (id !== expectedWorkspaceId) invalidRpcResponse();
  const logoPath = workspaceLogoPath(row.logo_path, id);
  const logoUpdatedAt = responseTimestamp(row.logo_updated_at, true);
  if ((logoPath === null) !== (logoUpdatedAt === null)) invalidRpcResponse();
  return {
    id,
    logo_path: logoPath,
    logo_updated_at: logoUpdatedAt,
  };
}

function responseBrandColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9A-F]{6}$/u.test(value)) {
    invalidRpcResponse();
  }
  return value;
}

function workspacePresentationBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
  fallbackName?: string,
): WorkspacePresentationBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const logo = workspaceBrandingDto(row, expectedWorkspaceId);
  return {
    ...logo,
    client_brand_name: responseText(
      row.client_brand_name ?? fallbackName,
      120,
    ) as string,
    client_brand_primary_color: responseBrandColor(
      row.client_brand_primary_color,
    ),
    client_brand_accent_color: responseBrandColor(
      row.client_brand_accent_color,
    ),
    booking_embed_url: responseText(row.booking_embed_url ?? null, 500, true),
    client_brand_updated_at: responseTimestamp(
      row.client_brand_updated_at,
    ) as string,
  };
}

function workspaceSettingsBrandingDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceSettingsBrandingDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  return {
    ...workspacePresentationBrandingDto(
      row,
      expectedWorkspaceId,
      responseText(row.name, 120) as string,
    ),
    name: responseText(row.name, 120) as string,
    updated_at: responseTimestamp(row.updated_at) as string,
  };
}

function workspaceNameDto(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceNameDto {
  const row = responseRecord(Array.isArray(value) ? value[0] : value);
  const id = responseUuid(row.id);
  if (id !== expectedWorkspaceId) invalidRpcResponse();
  return {
    id,
    name: responseText(row.name, 120) as string,
    updated_at: responseTimestamp(row.updated_at) as string,
  };
}

function responseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field?: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalidRpcResponse(
      field
        ? `${field} was ${
          typeof value === "string" ? JSON.stringify(value) : typeof value
        }, expected one of ${allowed.join("|")}`
        : undefined,
    );
  }
  return value as T;
}

function responseEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value !== value.trim().toLowerCase() ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    invalidRpcResponse();
  }
  return value;
}

function responseActions(value: unknown): PublicAction[] {
  if (!Array.isArray(value) || value.length > PUBLIC_ACTIONS.length) {
    invalidRpcResponse();
  }
  const actions = value.map((action) =>
    responseEnum(action, PUBLIC_ACTIONS, "member.allowed_actions[]")
  );
  if (new Set(actions).size !== actions.length) invalidRpcResponse();
  return actions;
}

function responseSetupMethod(
  row: Record<string, unknown>,
): ProvisioningMethod {
  return responseEnum(
    row.setup_method ?? row.provisioning_method ?? "email_invite",
    PROVISIONING_METHODS,
    "member.setup_method",
  );
}

function memberDto(value: unknown, useRpcCapabilities = true): StaffMemberDto {
  const row = responseRecord(value);
  const emailValue = row.email ?? row.email_normalized;
  const pendingReview = useRpcCapabilities ? row.pending_review : false;
  const allowedActions = useRpcCapabilities
    ? responseActions(row.allowed_actions)
    : [];
  const setupMethod = responseSetupMethod(row);

  if (typeof pendingReview !== "boolean") invalidRpcResponse();
  if (pendingReview && allowedActions.length > 0) invalidRpcResponse();
  if (
    (allowedActions.includes("retry_invite") &&
      setupMethod !== "email_invite") ||
    (allowedActions.includes("retry_password") &&
      setupMethod !== "admin_temporary_password") ||
    (allowedActions.includes("reset_password") &&
      !(
        row.status === "active" ||
        (row.status === "invited" &&
          setupMethod === "admin_temporary_password")
      ))
  ) {
    invalidRpcResponse();
  }

  return {
    id: responseUuid(row.id),
    email: responseEmail(emailValue),
    full_name: responseText(row.full_name, 120, true),
    role: responseEnum(row.role, STAFF_ROLES, "member.role"),
    status: responseEnum(row.status, STAFF_STATUSES, "member.status"),
    setup_method: setupMethod,
    invited_at: responseTimestamp(row.invited_at) as string,
    invite_expires_at: responseTimestamp(row.invite_expires_at, true),
    accepted_at: responseTimestamp(row.accepted_at, true),
    suspended_at: responseTimestamp(row.suspended_at, true),
    pending_review: pendingReview,
    allowed_actions: allowedActions,
  };
}

function internalMembership(value: unknown): InternalMembership {
  const candidate = Array.isArray(value) ? value[0] : value;
  const row = responseRecord(candidate);
  const dto = memberDto(row, false);
  return {
    id: dto.id,
    workspace_id: responseUuid(row.workspace_id),
    user_id: responseNullableUuid(row.user_id),
    email_normalized: dto.email,
    full_name: dto.full_name,
    role: dto.role,
    status: dto.status,
    provisioning_method: responseEnum(
      row.provisioning_method,
      PROVISIONING_METHODS,
      "membership.provisioning_method",
    ),
    password_change_required: (() => {
      if (typeof row.password_change_required !== "boolean") {
        invalidRpcResponse();
      }
      return row.password_change_required;
    })(),
    invited_at: dto.invited_at,
    invite_expires_at: dto.invite_expires_at,
    accepted_at: dto.accepted_at,
    suspended_at: dto.suspended_at,
    created_at: responseTimestamp(row.created_at) as string,
  };
}

function provisioningMembership(value: unknown): InternalMembership {
  const row = responseRecord(value);
  return internalMembership(row.membership ?? row);
}

function staffViewDto(value: unknown): StaffViewDto {
  const row = responseRecord(value);
  const workspace = responseRecord(row.workspace);
  const capabilities = responseRecord(row.capabilities);
  if (
    !Array.isArray(row.members) ||
    row.members.length > MAX_ROSTER_RESPONSE_MEMBERS
  ) {
    invalidRpcResponse();
  }

  const members = row.members.map((member) => memberDto(member));
  if (typeof workspace.is_default !== "boolean") invalidRpcResponse();
  const isDefaultWorkspace = workspace.is_default === true;
  // Exactly one live owner is a private-workspace invariant, enforced by
  // enforce_private_workspace_staff_invariants — which skips the default
  // workspace on purpose. Asserting it there would reject a roster the database
  // considers perfectly valid, so the assertion follows the invariant.
  if (
    new Set(members.map((member) => member.id)).size !== members.length ||
    new Set(members.map((member) => member.email)).size !== members.length ||
    (!isDefaultWorkspace && members.filter((member) =>
        member.role === "owner" && member.status !== "revoked"
      ).length !== 1)
  ) {
    invalidRpcResponse();
  }

  if (typeof capabilities.read_only !== "boolean") invalidRpcResponse();
  if (!Array.isArray(capabilities.invite_roles)) invalidRpcResponse();
  const inviteRoles = capabilities.invite_roles.map((role) =>
    responseEnum(role, INVITE_ROLES)
  );
  const canGeneratePassword = capabilities.can_generate_password ?? false;
  const canManageBranding = capabilities.can_manage_branding ?? false;
  const canManageClientBranding =
    capabilities.can_manage_client_branding ?? false;
  const canManageWorkspaceName =
    capabilities.can_manage_workspace_name ?? false;
  if (new Set(inviteRoles).size !== inviteRoles.length) invalidRpcResponse();
  if (
    typeof canGeneratePassword !== "boolean" ||
    typeof canManageBranding !== "boolean" ||
    typeof canManageClientBranding !== "boolean" ||
    typeof canManageWorkspaceName !== "boolean" ||
    typeof capabilities.can_update_roles !== "boolean" ||
    typeof capabilities.can_transfer_owner !== "boolean" ||
    (capabilities.read_only &&
      (inviteRoles.length > 0 ||
        canGeneratePassword ||
        canManageBranding ||
        canManageClientBranding ||
        canManageWorkspaceName ||
        capabilities.can_update_roles ||
        capabilities.can_transfer_owner))
  ) {
    invalidRpcResponse();
  }

  // The default workspace gets the settings sections and a read-only roster.
  // Its staff mutations are still refused at the SQL root, so a capability that
  // said otherwise would render a button that cannot work. Refuse the response
  // instead of showing it.
  if (
    isDefaultWorkspace &&
    (inviteRoles.length > 0 ||
      capabilities.can_update_roles ||
      capabilities.can_transfer_owner ||
      members.some((member) => member.allowed_actions.length > 0))
  ) {
    invalidRpcResponse();
  }

  const workspaceStatus = responseEnum(
    workspace.status,
    ["active"] as const,
    "workspace.status",
  );
  return {
    workspace: {
      id: responseUuid(workspace.id),
      name: responseText(workspace.name, 120) as string,
      updated_at: null,
      status: workspaceStatus,
      is_default: isDefaultWorkspace,
      logo_path: null,
      logo_updated_at: null,
      client_brand_name: responseText(workspace.name, 120) as string,
      client_brand_primary_color: "#0D1B2A",
      client_brand_accent_color: "#C7794F",
      client_brand_updated_at: null,
    },
    members,
    capabilities: {
      read_only: capabilities.read_only,
      invite_roles: inviteRoles,
      can_generate_password: canGeneratePassword,
      can_manage_branding: canManageBranding,
      can_manage_client_branding: canManageClientBranding,
      can_manage_workspace_name: canManageWorkspaceName,
      can_update_roles: capabilities.can_update_roles,
      can_transfer_owner: capabilities.can_transfer_owner,
    },
  };
}

function rpcFailure(
  error: RpcError,
  fallbackCode: string,
  fallbackMessage: string,
): never {
  const message = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";

  if (
    message.includes("stale") ||
    message.includes("issued before") ||
    message.includes("newest account credentials")
  ) {
    throw new HttpError(
      401,
      "REAUTHENTICATION_REQUIRED",
      "Sign in again with the newest account credentials",
    );
  }
  if (
    message.includes("platform administrator") &&
    (message.includes("email") ||
      message.includes("cannot be invited") ||
      message.includes("cannot be changed") ||
      message.includes("identities cannot be managed"))
  ) {
    throw new HttpError(
      409,
      "PLATFORM_ADMIN_PROTECTED",
      "Platform administrator identities cannot be managed as workspace users",
    );
  }
  if (
    message.includes("owner or administrator access") ||
    message.includes("active workspace manager") ||
    message.includes("workspace manager access") ||
    message.includes("workspace staff access") ||
    message.includes("active selected workspace") ||
    message.includes("active workspace access") ||
    message.includes("workspace access is required")
  ) {
    throw new HttpError(
      403,
      "WORKSPACE_ACCESS_REQUIRED",
      "Active access to this workspace is required",
    );
  }
  if (
    message.includes("active workspace owner") ||
    message.includes("workspace owner access")
  ) {
    throw new HttpError(
      403,
      "WORKSPACE_OWNER_REQUIRED",
      "Workspace owner access is required",
    );
  }
  if (
    message.includes("final owner") ||
    message.includes("only owner") ||
    message.includes("owner cannot be") ||
    message.includes("owner must be transferred") ||
    message.includes("role changes require ownership transfer")
  ) {
    throw new HttpError(
      409,
      "FINAL_OWNER_PROTECTED",
      "Transfer workspace ownership before changing the current owner",
    );
  }
  if (
    message.includes("role hierarchy") ||
    message.includes("administrators may invite members only") ||
    message.includes("cannot manage an owner") ||
    message.includes("cannot manage another admin") ||
    message.includes("target role")
  ) {
    throw new HttpError(
      403,
      "ROLE_HIERARCHY_VIOLATION",
      "This workspace user cannot be managed by your role",
    );
  }
  if (
    message.includes("staff limit") ||
    message.includes("membership limit") ||
    message.includes("maximum number of workspace")
  ) {
    throw new HttpError(
      409,
      "WORKSPACE_STAFF_LIMIT",
      "This workspace has reached its user limit",
    );
  }
  if (
    message.includes("already has workspace access") ||
    message.includes("already exists") ||
    message.includes("active workspace membership") ||
    code === "23505"
  ) {
    throw new HttpError(
      409,
      "STAFF_ACCOUNT_EXISTS",
      "This email already has workspace access",
    );
  }
  if (
    message.includes("private workspace not found")
  ) {
    throw new HttpError(
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace not found",
    );
  }
  if (
    message.includes("not found") ||
    code === "P0002"
  ) {
    throw new HttpError(
      404,
      "STAFF_NOT_FOUND",
      "Workspace user not found",
    );
  }
  if (
    message.includes("delivery is busy") ||
    message.includes("lifecycle is busy") ||
    message.includes("provider operation is busy") ||
    message.includes("claim is required") ||
    message.includes("claim was lost") ||
    message.includes("claim is inconsistent") ||
    message.includes("pending review") ||
    message.includes("requires reconciliation") ||
    code === "55P03"
  ) {
    throw new HttpError(
      409,
      "STAFF_RECONCILIATION_PENDING",
      "This workspace user has a pending provider reconciliation",
    );
  }
  if (
    message.includes("unsafe") ||
    message.includes("ambiguous") ||
    message.includes("identity is missing") ||
    message.includes("identity mismatch") ||
    message.includes("contradictory ownership") ||
    message.includes("superseded")
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  if (
    message.includes("not provisioning") ||
    message.includes("not pending") ||
    message.includes("not revocable") ||
    message.includes("not editable") ||
    message.includes("not active") ||
    message.includes("not suspended") ||
    message.includes("no longer matches") ||
    message.includes("ownership changed") ||
    message.includes("requires another active accepted") ||
    message.includes("transfer target is unavailable") ||
    message.includes("status changed") ||
    message.includes("state changed") ||
    message.includes("workspace is not active")
  ) {
    throw new HttpError(
      409,
      "STAFF_STATE_CHANGED",
      "The workspace user state changed; refresh before trying again",
    );
  }
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("reused inconsistently") ||
    code === "22023"
  ) {
    throw new HttpError(
      400,
      "INVALID_STAFF_REQUEST",
      "The workspace user request is invalid",
    );
  }
  if (code === "42501") {
    throw new HttpError(
      403,
      "WORKSPACE_ACCESS_REQUIRED",
      "Active access to this workspace is required",
    );
  }

  throw new HttpError(500, fallbackCode, fallbackMessage);
}

function requireInviteRole(value: unknown): InviteRole {
  const role = requireString(value, "role", { max: 16 });
  if (!INVITE_ROLES.includes(role as InviteRole)) {
    throw new HttpError(400, "INVALID_FIELD", "role must be admin or member");
  }
  return role as InviteRole;
}

async function listWorkspaceStaff(
  admin: AdminClient,
  workspaceId: string,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<StaffViewDto> {
  const { data, error } = await admin.rpc("workspace_staff_list_v1", {
    p_workspace_id: workspaceId,
    p_actor_user_id: actorUserId,
    p_token_issued_at: tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_LIST_FAILED",
      "Workspace users could not be loaded",
    );
  }
  const result = staffViewDto(data);
  if (result.workspace.id !== workspaceId) invalidRpcResponse();
  return result;
}

async function loadWorkspaceBranding(
  admin: AdminClient,
  workspaceId: string,
): Promise<WorkspaceSettingsBrandingDto> {
  const { data: workspaceData, error: workspaceError } = await admin
    .from("workspaces")
    .select("id,name,updated_at,logo_path,logo_updated_at")
    .eq("id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (workspaceError || !workspaceData) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }

  const workspace = responseRecord(workspaceData);
  const base = {
    ...workspaceBrandingDto(workspace, workspaceId),
    name: responseText(workspace.name, 120) as string,
    updated_at: responseTimestamp(workspace.updated_at) as string,
  };
  const { data: canonicalBrand, error: canonicalBrandError } = await admin
    .from("workspaces")
    .select("id,client_brand_name,client_brand_primary_color,client_brand_accent_color,client_brand_updated_at,booking_embed_url")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!canonicalBrandError && canonicalBrand?.client_brand_name) {
    return {
      ...base,
      client_brand_name: responseText(
        canonicalBrand.client_brand_name,
        120,
      ) as string,
      client_brand_primary_color: responseBrandColor(
        canonicalBrand.client_brand_primary_color,
      ),
      client_brand_accent_color: responseBrandColor(
        canonicalBrand.client_brand_accent_color,
      ),
      client_brand_updated_at: responseTimestamp(
        canonicalBrand.client_brand_updated_at,
      ) as string,
      booking_embed_url: responseText(canonicalBrand.booking_embed_url ?? null, 500, true),
    };
  }
  if (
    canonicalBrandError &&
    !schemaObjectUnavailable(canonicalBrandError, "client_brand_name")
  ) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }

  const { data: brandEvent, error: brandEventError } = await admin
    .from("workspace_audit_log")
    .select("created_at,metadata")
    .eq("workspace_id", workspaceId)
    .eq("action", "workspace.branding.client_identity_updated")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (brandEventError) {
    throw new HttpError(
      500,
      "BRANDING_UNAVAILABLE",
      "Workspace branding could not be loaded",
    );
  }
  if (!brandEvent) {
    return {
      ...base,
      client_brand_name: base.name,
      client_brand_primary_color: "#0D1B2A",
      client_brand_accent_color: "#C7794F",
      client_brand_updated_at: base.updated_at,
      booking_embed_url: responseText(canonicalBrand?.booking_embed_url ?? null, 500, true),
    };
  }

  const event = responseRecord(brandEvent);
  const metadata = responseRecord(event.metadata);
  return {
    ...base,
    client_brand_name: responseText(metadata.client_brand_name, 120) as string,
    client_brand_primary_color: responseBrandColor(metadata.primary_color),
    client_brand_accent_color: responseBrandColor(metadata.accent_color),
    client_brand_updated_at: responseTimestamp(event.created_at) as string,
    booking_embed_url: responseText(canonicalBrand?.booking_embed_url ?? null, 500, true),
  };
}

async function listWorkspaceSettings(
  admin: AdminClient,
  workspaceId: string,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<StaffViewDto> {
  const [staff, branding] = await Promise.all([
    listWorkspaceStaff(admin, workspaceId, actorUserId, tokenIssuedAt),
    loadWorkspaceBranding(admin, workspaceId),
  ]);
  const canManageWorkspaceBranding = staff.capabilities.can_generate_password;
  return {
    ...staff,
    workspace: {
      ...staff.workspace,
      name: branding.name,
      updated_at: branding.updated_at,
      logo_path: branding.logo_path,
      logo_updated_at: branding.logo_updated_at,
      client_brand_name: branding.client_brand_name,
      client_brand_primary_color: branding.client_brand_primary_color,
      client_brand_accent_color: branding.client_brand_accent_color,
      client_brand_updated_at: branding.client_brand_updated_at,
    },
    capabilities: {
      ...staff.capabilities,
      can_manage_branding: canManageWorkspaceBranding,
      can_manage_client_branding: canManageWorkspaceBranding,
      can_manage_workspace_name: canManageWorkspaceBranding,
    },
  };
}

function requireWorkspaceManager(staff: StaffViewDto): void {
  if (!staff.capabilities.can_generate_password) {
    throw new HttpError(
      403,
      "WORKSPACE_MANAGER_REQUIRED",
      "Workspace owner or administrator access is required",
    );
  }
}

function requireExpectedLogoPath(
  value: unknown,
  workspaceId: string,
): string | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is required",
    );
  }
  if (typeof value !== "string") {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is invalid",
    );
  }
  try {
    return workspaceLogoPath(value, workspaceId);
  } catch {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_logo_path is invalid",
    );
  }
}

function requireWorkspaceLogoImage(
  mimeValue: unknown,
  base64Value: unknown,
): {
  bytes: Uint8Array;
  extension: typeof WORKSPACE_LOGO_MIME_TYPES[WorkspaceLogoMimeType];
  mimeType: WorkspaceLogoMimeType;
} {
  if (
    typeof mimeValue !== "string" ||
    !Object.hasOwn(WORKSPACE_LOGO_MIME_TYPES, mimeValue)
  ) {
    throw new HttpError(
      400,
      "INVALID_LOGO_TYPE",
      "Logo must be a PNG, JPEG, or WebP image",
    );
  }
  if (
    typeof base64Value !== "string" ||
    base64Value.length === 0 ||
    base64Value.length > Math.ceil(MAX_WORKSPACE_LOGO_BYTES / 3) * 4 ||
    base64Value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64Value)
  ) {
    throw new HttpError(
      400,
      "INVALID_LOGO_DATA",
      "Logo image data is invalid",
    );
  }

  let bytes: Uint8Array;
  try {
    const decoded = atob(base64Value);
    bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(
      400,
      "INVALID_LOGO_DATA",
      "Logo image data is invalid",
    );
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_WORKSPACE_LOGO_BYTES) {
    throw new HttpError(
      413,
      "LOGO_TOO_LARGE",
      "Logo must be 2 MB or smaller",
    );
  }

  const mimeType = mimeValue as WorkspaceLogoMimeType;
  const signatureMatches = mimeType === "image/png"
    ? bytes.byteLength >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) =>
        bytes[index] === byte
      )
    : mimeType === "image/jpeg"
    ? bytes.byteLength >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    : bytes.byteLength >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!signatureMatches) {
    throw new HttpError(
      400,
      "LOGO_TYPE_MISMATCH",
      "Logo contents do not match the selected image type",
    );
  }

  return {
    bytes,
    extension: WORKSPACE_LOGO_MIME_TYPES[mimeType],
    mimeType,
  };
}

async function setWorkspaceLogo(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedLogoPath: string | null;
    logoPath: string | null;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspaceBrandingDto> {
  const { data, error } = await admin.rpc("set_workspace_logo_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_logo_path: input.expectedLogoPath,
    p_logo_path: input.logoPath,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "BRANDING_UPDATE_FAILED",
      "Workspace branding could not be updated",
    );
  }
  return workspaceBrandingDto(data, input.workspaceId);
}

function requireClientBrandName(value: unknown): string {
  const name = requireString(value, "client_brand_name", { max: 120 }).trim();
  if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new HttpError(
      400,
      "INVALID_BRAND_NAME",
      "Client-facing agency name is invalid",
    );
  }
  return name;
}

function requireWorkspaceName(value: unknown): string {
  const name = requireString(value, "workspace_name", { max: 120 }).trim();
  if (!name || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new HttpError(
      400,
      "INVALID_WORKSPACE_NAME",
      "Workspace name is invalid",
    );
  }
  return name;
}

function requireClientBrandColor(value: unknown, field: string): string {
  const color = requireString(value, field, { max: 7 }).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/u.test(color)) {
    throw new HttpError(
      400,
      "INVALID_BRAND_COLOR",
      `${field} must be a six-digit hexadecimal color`,
    );
  }
  return color;
}

function requireBrandUpdatedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_brand_updated_at is invalid",
    );
  }
  return value;
}

function requireWorkspaceUpdatedAt(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 64 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      "expected_updated_at is invalid",
    );
  }
  return value;
}

async function setWorkspaceName(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedUpdatedAt: string;
    previousWorkspaceName: string;
    workspaceName: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspaceNameDto> {
  const { data, error } = await admin.rpc("set_workspace_name_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_workspace_name: input.workspaceName,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (!error) {
    return workspaceNameDto(data, input.workspaceId);
  }
  if (!schemaObjectUnavailable(error, "set_workspace_name_v1")) {
    rpcFailure(
      error,
      "WORKSPACE_NAME_UPDATE_FAILED",
      "Workspace name could not be updated",
    );
  }

  const { data: updatedWorkspace, error: updateError } = await admin
    .from("workspaces")
    .update({ name: input.workspaceName })
    .eq("id", input.workspaceId)
    .eq("status", "active")
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id,name,updated_at")
    .maybeSingle();
  if (updateError) {
    throw new HttpError(
      500,
      "WORKSPACE_NAME_UPDATE_FAILED",
      "Workspace name could not be updated",
    );
  }
  if (!updatedWorkspace) {
    throw new HttpError(
      409,
      "WORKSPACE_STATE_CHANGED",
      "Workspace settings changed; refresh before trying again",
    );
  }

  const { error: auditError } = await admin.from("workspace_audit_log").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: "workspace.identity.name_updated",
    entity_type: "workspace",
    entity_id: input.workspaceId,
    metadata: {
      previous_name: input.previousWorkspaceName,
      workspace_name: input.workspaceName,
    },
  });
  if (auditError) console.error("Workspace name audit event failed");
  return workspaceNameDto(updatedWorkspace, input.workspaceId);
}

async function setWorkspaceClientBrand(
  admin: AdminClient,
  input: {
    workspaceId: string;
    expectedBrandUpdatedAt: string;
    clientBrandName: string;
    primaryColor: string;
    accentColor: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<WorkspacePresentationBrandingDto> {
  const { data, error } = await admin.rpc("set_workspace_client_brand_v1", {
    p_workspace_id: input.workspaceId,
    p_expected_brand_updated_at: input.expectedBrandUpdatedAt,
    p_client_brand_name: input.clientBrandName,
    p_client_brand_primary_color: input.primaryColor,
    p_client_brand_accent_color: input.accentColor,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (!error) {
    return workspacePresentationBrandingDto(data, input.workspaceId);
  }
  if (!schemaObjectUnavailable(error, "set_workspace_client_brand_v1")) {
    rpcFailure(
      error,
      "BRANDING_UPDATE_FAILED",
      "Client-facing workspace branding could not be updated",
    );
  }

  const { error: auditError } = await admin.from("workspace_audit_log").insert({
    workspace_id: input.workspaceId,
    actor_user_id: input.actorUserId,
    action: "workspace.branding.client_identity_updated",
    entity_type: "workspace",
    entity_id: input.workspaceId,
    metadata: {
      client_brand_name: input.clientBrandName,
      primary_color: input.primaryColor,
      accent_color: input.accentColor,
    },
  });
  if (auditError) {
    throw new HttpError(
      500,
      "BRANDING_UPDATE_FAILED",
      "Client-facing workspace branding could not be updated",
    );
  }
  return loadWorkspaceBranding(admin, input.workspaceId);
}

async function removeWorkspaceLogoObject(
  admin: AdminClient,
  logoPath: string | null,
): Promise<void> {
  if (!logoPath) return;
  try {
    await admin.storage.from(WORKSPACE_LOGO_BUCKET).remove([logoPath]);
  } catch {
    // The database pointer is authoritative. A failed best-effort cleanup may
    // leave an unreferenced public presentation asset, never a tenant write.
  }
}

async function beginStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    email: string;
    fullName: string | null;
    role: InviteRole;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const { data, error } = await admin.rpc("begin_workspace_staff_invite_v1", {
    p_workspace_id: input.workspaceId,
    p_email: input.email,
    p_full_name: input.fullName,
    p_role: input.role,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_INVITE_FAILED",
      "The workspace invitation could not be created",
    );
  }
  const membership = provisioningMembership(data);
  if (
    membership.workspace_id !== input.workspaceId ||
    membership.email_normalized !== input.email ||
    membership.full_name !== input.fullName ||
    membership.role !== input.role ||
    membership.status !== "provisioning" ||
    membership.user_id !== null ||
    membership.provisioning_method !== "email_invite" ||
    membership.password_change_required
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function beginStaffPasswordAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    email: string;
    fullName: string | null;
    role: InviteRole;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const { data, error } = await admin.rpc(
    "begin_workspace_staff_password_account_v1",
    {
      p_workspace_id: input.workspaceId,
      p_email: input.email,
      p_full_name: input.fullName,
      p_role: input.role,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
    },
  );
  if (error) {
    rpcFailure(
      error,
      "STAFF_PASSWORD_ACCOUNT_FAILED",
      "The workspace password account could not be created",
    );
  }
  const membership = provisioningMembership(data);
  if (
    membership.workspace_id !== input.workspaceId ||
    membership.email_normalized !== input.email ||
    membership.full_name !== input.fullName ||
    membership.role !== input.role ||
    membership.status !== "provisioning" ||
    membership.user_id !== null ||
    membership.provisioning_method !== "admin_temporary_password" ||
    membership.password_change_required
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function claimStaffInviteDelivery(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "claim_workspace_staff_invite_delivery_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.status !== "provisioning" ||
        membership.provisioning_method !== "email_invite" ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return membership;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "INVITE_DELIVERY_CLAIM_UNCERTAIN",
        "The invitation delivery claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "INVITE_DELIVERY_CLAIM_UNCERTAIN",
    "The invitation delivery claim requires operator review",
  );
}

async function claimStaffPasswordDelivery(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "claim_workspace_staff_password_delivery_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.status !== "provisioning" ||
        membership.user_id !== null ||
        membership.provisioning_method !== "admin_temporary_password" ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return membership;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "PASSWORD_DELIVERY_CLAIM_UNCERTAIN",
        "The temporary-password claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "PASSWORD_DELIVERY_CLAIM_UNCERTAIN",
    "The temporary-password claim requires operator review",
  );
}

async function findStaffInviteAuthUser(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "find_workspace_staff_invite_auth_user_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return data === null ? null : responseUuid(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_IDENTITY_RECONCILIATION_FAILED",
        "The workspace user identity could not be reconciled",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_IDENTITY_RECONCILIATION_FAILED",
    "The workspace user identity could not be reconciled",
  );
}

async function finalizeStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
    authUserId: string;
  },
): Promise<InternalMembership | null> {
  let notReadyResponses = 0;
  let sawTransportUncertainty = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "finalize_workspace_staff_invite_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
        p_auth_user_id: input.authUserId,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.user_id !== input.authUserId ||
        membership.status !== "invited" ||
        membership.provisioning_method !== "email_invite" ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return membership;
    }

    const message = error.message.toLowerCase();
    if (message.includes("auth identity is not ready")) {
      notReadyResponses += 1;
      continue;
    }
    // SQLSTATE-backed domain failures prove the transaction rolled back and
    // can be handled deterministically. A transport/PostgREST failure cannot
    // prove whether finalization committed, so retry once with the same token
    // and then preserve both the Auth identity and durable claim for review.
    if (
      ["22023", "23505", "42501", "55000", "55P03", "P0002"].includes(
        error.code ?? "",
      )
    ) {
      // A prior transport failure may have hidden a committed finalization.
      // Even a deterministic error on the replay (for example, the actor was
      // demoted between calls) cannot make cleanup of that Auth user safe.
      if (sawTransportUncertainty) break;
      rpcFailure(
        error,
        "INVITE_FINALIZE_FAILED",
        "The workspace invitation could not be finalized",
      );
    }
    sawTransportUncertainty = true;
  }
  if (!sawTransportUncertainty && notReadyResponses === 2) return null;
  throw new HttpError(
    503,
    "INVITE_FINALIZE_UNCERTAIN",
    "The invitation result is uncertain and requires operator review",
  );
}

async function finalizeStaffPasswordAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
    authUserId: string;
  },
): Promise<InternalMembership | null> {
  let notReadyResponses = 0;
  let sawTransportUncertainty = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "finalize_workspace_staff_password_account_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
        p_auth_user_id: input.authUserId,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.user_id !== input.authUserId ||
        membership.status !== "invited" ||
        membership.provisioning_method !== "admin_temporary_password" ||
        !membership.password_change_required ||
        membership.invite_expires_at === null
      ) {
        invalidRpcResponse();
      }
      return membership;
    }

    const message = error.message.toLowerCase();
    if (message.includes("auth identity is not ready")) {
      notReadyResponses += 1;
      continue;
    }
    if (
      ["22023", "23505", "42501", "55000", "55P03", "P0002"].includes(
        error.code ?? "",
      )
    ) {
      if (sawTransportUncertainty) break;
      rpcFailure(
        error,
        "PASSWORD_FINALIZE_FAILED",
        "The temporary-password account could not be finalized",
      );
    }
    sawTransportUncertainty = true;
  }
  if (!sawTransportUncertainty && notReadyResponses === 2) return null;
  throw new HttpError(
    503,
    "PASSWORD_FINALIZE_UNCERTAIN",
    "The temporary-password result is uncertain and requires operator review",
  );
}

async function cancelStaffPasswordAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "cancel_workspace_staff_password_account_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) {
      const membership = internalMembership(data);
      if (
        membership.id !== input.membershipId ||
        membership.workspace_id !== input.workspaceId ||
        membership.status !== "revoked" ||
        membership.user_id !== null ||
        membership.password_change_required
      ) {
        invalidRpcResponse();
      }
      return;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "PASSWORD_ACCOUNT_CANCEL_UNCERTAIN",
        "The failed temporary-password account requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "PASSWORD_ACCOUNT_CANCEL_UNCERTAIN",
    "The failed temporary-password account requires operator review",
  );
}

async function releaseInviteClaim(
  admin: AdminClient,
  membershipId: string,
  lockToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "release_workspace_invite_delivery_claim",
      {
        p_membership_id: membershipId,
        p_lock_token: lockToken,
      },
    );
    if (!error && data === true) return;
    if (!error && data === false) {
      throw new HttpError(
        409,
        "STAFF_RECONCILIATION_PENDING",
        "The workspace user provider claim requires operator review",
      );
    }
    if (attempt === 1 && error) {
      rpcFailure(
        error,
        "INVITE_CLAIM_RELEASE_FAILED",
        "Provider cleanup completed, but its claim requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "INVITE_CLAIM_RELEASE_FAILED",
    "Provider cleanup completed, but its claim requires operator review",
  );
}

async function requireUnprotectedEmail(
  admin: AdminClient,
  email: string,
): Promise<void> {
  const { data, error } = await admin.rpc("is_platform_admin_email", {
    p_email: email,
  });
  if (error) {
    throw new HttpError(
      503,
      "ACCOUNT_PROTECTION_UNAVAILABLE",
      "The account protection check is unavailable",
    );
  }
  if (data === true) {
    throw new HttpError(
      409,
      "PLATFORM_ADMIN_PROTECTED",
      "Platform administrator identities cannot be managed as workspace users",
    );
  }
}

function markerMatches(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
): boolean {
  return metadata?.workspace_id === membership.workspace_id &&
    metadata?.workspace_membership_id === membership.id;
}

function markerContradicts(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
): boolean {
  if (!metadata) return false;
  const workspaceId = metadata.workspace_id;
  const membershipId = metadata.workspace_membership_id;
  return (workspaceId !== undefined &&
    workspaceId !== membership.workspace_id) ||
    (membershipId !== undefined && membershipId !== membership.id);
}

function resetIdentityMarkersAreSafe(
  user: {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
): boolean {
  const appMetadata = user.app_metadata ?? {};
  const appMarkersMatch = markerMatches(appMetadata, membership);
  const appMarkersAreAbsent = appMetadata.workspace_id == null &&
    appMetadata.workspace_membership_id == null;
  return (appMarkersMatch || appMarkersAreAbsent) &&
    !markerContradicts(user.user_metadata, membership);
}

async function requireSafeProviderInviteIdentity(
  admin: AdminClient,
  user: {
    email?: string;
    created_at?: string;
    invited_at?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  const createdAt = Date.parse(user.created_at ?? "");
  const invitedAt = Date.parse(user.invited_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  if (
    email !== membership.email_normalized ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(invitedAt) ||
    !Number.isFinite(membershipCreatedAt) ||
    createdAt < membershipCreatedAt - 60_000 ||
    invitedAt < membershipCreatedAt - 60_000 ||
    Boolean(user.confirmed_at) ||
    Boolean(user.last_sign_in_at) ||
    !markerMatches(user.user_metadata, membership) ||
    markerContradicts(user.app_metadata, membership)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, membership.email_normalized);
}

async function deleteExactAuthUser(
  admin: AdminClient,
  authUserId: string,
  membership: InternalMembership,
  allowInviteMarker: boolean,
): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error) {
    if (
      error.status === 404 ||
      error.message.toLowerCase().includes("not found")
    ) return;
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
  if (!data.user) return;

  const email = data.user.email?.trim().toLowerCase();
  const appMarkerMatches = markerMatches(data.user.app_metadata, membership);
  const inviteMarkerMatches = markerMatches(
    data.user.user_metadata,
    membership,
  );
  const createdAt = Date.parse(data.user.created_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  const safeUntrustedInviteMarker = allowInviteMarker &&
    inviteMarkerMatches &&
    Boolean(data.user.invited_at) &&
    Number.isFinite(createdAt) &&
    Number.isFinite(membershipCreatedAt) &&
    createdAt >= membershipCreatedAt - 60_000 &&
    !data.user.confirmed_at &&
    !data.user.last_sign_in_at;
  if (
    email !== membership.email_normalized ||
    markerContradicts(data.user.app_metadata, membership) ||
    markerContradicts(data.user.user_metadata, membership) ||
    (!appMarkerMatches && !safeUntrustedInviteMarker)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, email);

  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  if (
    deleteError &&
    deleteError.status !== 404 &&
    !deleteError.message.toLowerCase().includes("not found")
  ) {
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
}

function exactTemporaryPasswordMetadata(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
  lockToken: string,
): boolean {
  return markerMatches(metadata, membership) &&
    metadata?.workspace_provisioning_method === "admin_temporary_password" &&
    metadata?.workspace_password_change_required === true &&
    metadata?.workspace_credential_version === 1 &&
    metadata?.workspace_credential_attempt_id === lockToken &&
    metadata?.workspace_credential_execution_id === lockToken;
}

function passwordIdentityMatches(
  user: {
    email?: string;
    created_at?: string;
    confirmed_at?: string;
    last_sign_in_at?: string;
    app_metadata?: Record<string, unknown>;
  },
  membership: InternalMembership,
  lockToken: string,
): boolean {
  const createdAt = Date.parse(user.created_at ?? "");
  const membershipCreatedAt = Date.parse(membership.created_at);
  return user.email?.trim().toLowerCase() === membership.email_normalized &&
    Number.isFinite(createdAt) &&
    Number.isFinite(membershipCreatedAt) &&
    createdAt >= membershipCreatedAt - 60_000 &&
    !user.last_sign_in_at &&
    exactTemporaryPasswordMetadata(
      user.app_metadata,
      membership,
      lockToken,
    );
}

async function deleteExactTemporaryPasswordAuthUser(
  admin: AdminClient,
  authUserId: string,
  membership: InternalMembership,
  lockToken: string,
): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(authUserId);
  if (error) {
    if (
      error.status === 404 ||
      error.message.toLowerCase().includes("not found")
    ) return;
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
  if (!data.user) return;
  if (!passwordIdentityMatches(data.user, membership, lockToken)) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, membership.email_normalized);
  const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId);
  if (
    deleteError &&
    deleteError.status !== 404 &&
    !deleteError.message.toLowerCase().includes("not found")
  ) {
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user provider state requires operator review",
    );
  }
}

async function deliverStaffInvite(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  // Resolve configuration before acquiring a non-stealable provider claim.
  const redirectTo = inviteRedirectUrl();
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffInviteDelivery(admin, claimInput);

  const { data: invited, error: inviteError } = await admin.auth.admin
    .inviteUserByEmail(membership.email_normalized, {
      redirectTo,
      data: {
        full_name: membership.full_name,
        workspace_id: membership.workspace_id,
        workspace_membership_id: membership.id,
      },
    });

  if (inviteError || !invited.user) {
    const authUserId = await findStaffInviteAuthUser(admin, claimInput);
    if (authUserId) {
      await deleteExactAuthUser(admin, authUserId, membership, true);
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        503,
        "INVITE_DELIVERY_RETRY_REQUIRED",
        "An uncertain invitation was invalidated; retry to send a fresh link",
      );
    }
    if (inviteError?.message.toLowerCase().includes("registered")) {
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        409,
        "AUTH_ACCOUNT_EXISTS",
        "This email already has an unrelated account",
      );
    }
    throw new HttpError(
      503,
      "INVITE_DELIVERY_UNCERTAIN",
      "Invitation delivery is uncertain and requires operator review",
    );
  }

  await requireSafeProviderInviteIdentity(admin, invited.user, membership);
  const { error: markerError } = await admin.auth.admin.updateUserById(
    invited.user.id,
    {
      app_metadata: {
        ...invited.user.app_metadata,
        workspace_id: membership.workspace_id,
        workspace_membership_id: membership.id,
      },
    },
  );

  let finalized: InternalMembership | null = null;
  let finalizationError: HttpError | null = null;
  try {
    finalized = await finalizeStaffInvite(admin, {
      ...claimInput,
      authUserId: invited.user.id,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (
      error.code === "INVITE_FINALIZE_UNCERTAIN" ||
      error.code === "STAFF_RECONCILIATION_PENDING" ||
      error.code === "STAFF_IDENTITY_UNSAFE"
    ) {
      throw error;
    }
    finalizationError = error;
  }
  if (finalized) return finalized;

  await deleteExactAuthUser(admin, invited.user.id, membership, true);
  await releaseInviteClaim(admin, membership.id, lockToken);
  if (finalizationError) throw finalizationError;
  throw new HttpError(
    503,
    markerError ? "INVITE_MARKER_FAILED" : "INVITE_FINALIZE_FAILED",
    "The invitation was invalidated before activation; retry to send a fresh link",
  );
}

async function issueStaffTemporaryPassword(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<{ membership: InternalMembership; temporaryPassword: string }> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffPasswordDelivery(admin, claimInput);

  try {
    await requireUnprotectedEmail(admin, membership.email_normalized);
  } catch (error) {
    await releaseInviteClaim(admin, membership.id, lockToken);
    throw error;
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data, error: createError } = await admin.auth.admin.createUser({
    email: membership.email_normalized,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: membership.full_name,
    },
    app_metadata: {
      workspace_id: membership.workspace_id,
      workspace_membership_id: membership.id,
      workspace_provisioning_method: "admin_temporary_password",
      workspace_password_change_required: true,
      workspace_credential_version: 1,
      workspace_credential_attempt_id: lockToken,
      workspace_credential_execution_id: lockToken,
    },
  });

  if (createError || !data.user) {
    const accountExists =
      (createError as { code?: string } | null)?.code === "email_exists" ||
      createError?.message.toLowerCase().includes("registered") === true;
    const markedUserId = await findStaffInviteAuthUser(admin, claimInput);
    if (markedUserId) {
      await deleteExactTemporaryPasswordAuthUser(
        admin,
        markedUserId,
        membership,
        lockToken,
      );
      await releaseInviteClaim(admin, membership.id, lockToken);
      throw new HttpError(
        503,
        "PASSWORD_CREATE_RETRY_REQUIRED",
        "Password creation was safely rolled back; generate a new password",
      );
    }
    if (accountExists) {
      await cancelStaffPasswordAccount(admin, claimInput);
      throw new HttpError(
        409,
        "AUTH_ACCOUNT_EXISTS",
        "This email already has an unrelated account",
      );
    }
    await releaseInviteClaim(admin, membership.id, lockToken);
    throw new HttpError(
      503,
      "PASSWORD_CREATE_RETRY_REQUIRED",
      "Password creation did not complete; generate a new password",
    );
  }

  if (!passwordIdentityMatches(data.user, membership, lockToken)) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }

  let finalized: InternalMembership | null = null;
  let finalizationError: HttpError | null = null;
  try {
    finalized = await finalizeStaffPasswordAccount(admin, {
      ...claimInput,
      authUserId: data.user.id,
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (
      error.code === "PASSWORD_FINALIZE_UNCERTAIN" ||
      error.code === "STAFF_RECONCILIATION_PENDING" ||
      error.code === "STAFF_IDENTITY_UNSAFE"
    ) {
      throw error;
    }
    finalizationError = error;
  }
  if (finalized) return { membership: finalized, temporaryPassword };

  await deleteExactTemporaryPasswordAuthUser(
    admin,
    data.user.id,
    membership,
    lockToken,
  );
  await releaseInviteClaim(admin, membership.id, lockToken);
  if (finalizationError) throw finalizationError;
  throw new HttpError(
    503,
    "PASSWORD_CREATE_RETRY_REQUIRED",
    "Password creation was safely rolled back; generate a new password",
  );
}

function staffPasswordResetClaim(value: unknown): StaffPasswordResetClaim {
  const row = responseRecord(value);
  return {
    membership: internalMembership(row.membership),
    attemptId: responseUuid(row.attempt_id),
    executionId: responseUuid(row.execution_id),
  };
}

async function claimStaffPasswordReset(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
): Promise<StaffPasswordResetClaim> {
  const { data, error } = await admin.rpc(
    "claim_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: input.attemptId,
      p_execution_id: input.executionId,
    },
  );
  if (error) {
    rpcFailure(
      error,
      "STAFF_PASSWORD_RESET_FAILED",
      "The workspace user password could not be reset",
    );
  }
  const claim = staffPasswordResetClaim(data);
  if (
    claim.membership.id !== input.membershipId ||
    claim.membership.workspace_id !== input.workspaceId ||
    claim.membership.status !== "invited" ||
    claim.membership.provisioning_method !== "admin_temporary_password" ||
    !claim.membership.password_change_required ||
    claim.attemptId !== input.attemptId ||
    claim.executionId !== input.executionId
  ) {
    invalidRpcResponse();
  }
  return claim;
}

async function cancelStaffPasswordReset(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
): Promise<void> {
  const { data, error } = await admin.rpc(
    "cancel_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: input.attemptId,
      p_execution_id: input.executionId,
    },
  );
  if (error) {
    throw new HttpError(
      503,
      "STAFF_PASSWORD_RECONCILIATION_REQUIRED",
      "The workspace user password reset requires operator review",
    );
  }
  const restored = internalMembership(data);
  if (
    restored.id !== input.membershipId ||
    restored.workspace_id !== input.workspaceId
  ) {
    invalidRpcResponse();
  }
}

async function failStaffPasswordResetBeforeProvider(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
    attemptId: string;
    executionId: string;
  },
  error: HttpError,
): Promise<never> {
  await cancelStaffPasswordReset(admin, input);
  throw error;
}

function resetCredentialVersion(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new HttpError(
      409,
      "CREDENTIAL_STATE_INVALID",
      "The workspace user credential state requires operator review",
    );
  }
  return value;
}

function exactStaffPasswordResetMetadata(
  metadata: Record<string, unknown> | undefined,
  membership: InternalMembership,
  attemptId: string,
  executionId: string,
  credentialVersion: number,
): boolean {
  return markerMatches(metadata, membership) &&
    metadata?.workspace_provisioning_method === "admin_temporary_password" &&
    metadata?.workspace_password_change_required === true &&
    metadata?.workspace_credential_version === credentialVersion &&
    metadata?.workspace_credential_attempt_id === attemptId &&
    metadata?.workspace_credential_execution_id === executionId;
}

async function resetStaffTemporaryPassword(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<{ membership: InternalMembership; temporaryPassword: string }> {
  const resetInput = {
    ...input,
    attemptId: crypto.randomUUID(),
    executionId: crypto.randomUUID(),
  };
  const claim = await claimStaffPasswordReset(admin, resetInput);
  const membership = claim.membership;

  try {
    await requireUnprotectedEmail(admin, membership.email_normalized);
  } catch (error) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      error instanceof HttpError
        ? error
        : new HttpError(
          503,
          "ACCOUNT_PROTECTION_UNAVAILABLE",
          "The account protection check is unavailable",
        ),
    );
  }

  if (!membership.user_id) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "STAFF_IDENTITY_UNSAFE",
        "The workspace user identity requires operator review",
      ),
    );
  }

  const currentResult = await admin.auth.admin.getUserById(membership.user_id);
  const currentUser = currentResult.data.user;
  if (currentResult.error || !currentUser) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        503,
        "STAFF_PASSWORD_RESET_RETRY_REQUIRED",
        "The workspace user password could not be verified. Try again",
      ),
    );
  }
  if (
    currentUser.email?.trim().toLowerCase() !== membership.email_normalized ||
    !resetIdentityMarkersAreSafe(currentUser, membership)
  ) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "STAFF_IDENTITY_UNSAFE",
        "The workspace user identity requires operator review",
      ),
    );
  }

  let nextVersion: number;
  try {
    nextVersion = resetCredentialVersion(
      currentUser.app_metadata?.workspace_credential_version,
    ) + 1;
    if (!Number.isSafeInteger(nextVersion)) throw new Error("version overflow");
  } catch {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        409,
        "CREDENTIAL_STATE_INVALID",
        "The workspace user credential state requires operator review",
      ),
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const nextMetadata = {
    ...currentUser.app_metadata,
    workspace_id: membership.workspace_id,
    workspace_membership_id: membership.id,
    workspace_provisioning_method: "admin_temporary_password",
    workspace_password_change_required: true,
    workspace_credential_version: nextVersion,
    workspace_credential_attempt_id: claim.attemptId,
    workspace_credential_execution_id: claim.executionId,
  };
  const updatedResult = await admin.auth.admin.updateUserById(
    membership.user_id,
    { password: temporaryPassword, app_metadata: nextMetadata },
  );
  let updatedUser = updatedResult.data.user;
  if (updatedResult.error || !updatedUser) {
    const reconciled = await admin.auth.admin.getUserById(membership.user_id);
    updatedUser = reconciled.data.user;
  }

  if (
    !updatedUser ||
    updatedUser.email?.trim().toLowerCase() !== membership.email_normalized ||
    !exactStaffPasswordResetMetadata(
      updatedUser.app_metadata,
      membership,
      claim.attemptId,
      claim.executionId,
      nextVersion,
    )
  ) {
    return await failStaffPasswordResetBeforeProvider(
      admin,
      resetInput,
      new HttpError(
        503,
        "STAFF_PASSWORD_RESET_RETRY_REQUIRED",
        "The workspace user password was not changed. Try again",
      ),
    );
  }

  const { data, error } = await admin.rpc(
    "complete_workspace_staff_password_reset_v1",
    {
      p_workspace_id: input.workspaceId,
      p_membership_id: input.membershipId,
      p_actor_user_id: input.actorUserId,
      p_token_issued_at: input.tokenIssuedAt,
      p_attempt_id: claim.attemptId,
      p_execution_id: claim.executionId,
      p_credential_version: nextVersion,
    },
  );
  if (error) {
    throw new HttpError(
      503,
      "STAFF_PASSWORD_RECONCILIATION_REQUIRED",
      "The password changed, but workspace access requires operator review",
    );
  }
  const completed = internalMembership(data);
  if (
    completed.id !== input.membershipId ||
    completed.workspace_id !== input.workspaceId ||
    completed.status !== "invited" ||
    completed.provisioning_method !== "admin_temporary_password" ||
    !completed.password_change_required
  ) {
    invalidRpcResponse();
  }

  return { membership: completed, temporaryPassword };
}

async function claimStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "claim_workspace_staff_auth_lifecycle_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_action: input.action,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return internalMembership(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_LIFECYCLE_UNCERTAIN",
        "The workspace user change requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_LIFECYCLE_UNCERTAIN",
    "The workspace user change requires operator review",
  );
}

async function completeStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
    lockToken: string;
  },
): Promise<InternalMembership> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "complete_workspace_staff_auth_lifecycle_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_action: input.action,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: input.lockToken,
      },
    );
    if (!error) return internalMembership(data);
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_LIFECYCLE_COMPLETION_UNCERTAIN",
        "The provider changed, but database completion requires operator review",
      );
    }
  }
  throw new HttpError(
    503,
    "STAFF_LIFECYCLE_COMPLETION_UNCERTAIN",
    "The provider changed, but database completion requires operator review",
  );
}

async function requireSafeBoundAuthIdentity(
  admin: AdminClient,
  membership: InternalMembership,
): Promise<string> {
  if (!membership.user_id) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  const { data, error } = await admin.auth.admin.getUserById(
    membership.user_id,
  );
  if (error || !data.user) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  const email = data.user.email?.trim().toLowerCase();
  if (
    email !== membership.email_normalized ||
    !markerMatches(data.user.app_metadata, membership) ||
    markerContradicts(data.user.user_metadata, membership)
  ) {
    throw new HttpError(
      409,
      "STAFF_IDENTITY_UNSAFE",
      "The workspace user identity requires operator review",
    );
  }
  await requireUnprotectedEmail(admin, email);
  return membership.user_id;
}

async function transitionStaffLifecycle(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    action: LifecycleAction;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  const membership = await claimStaffLifecycle(admin, claimInput);
  const desiredStatus = input.action === "suspend" ? "suspended" : "active";
  if (
    membership.id !== input.membershipId ||
    membership.workspace_id !== input.workspaceId ||
    membership.status !== desiredStatus
  ) {
    invalidRpcResponse();
  }
  const authUserId = await requireSafeBoundAuthIdentity(admin, membership);
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    ban_duration: desiredStatus === "suspended" ? "876000h" : "none",
  });
  if (error) {
    throw new HttpError(
      503,
      "AUTH_RECONCILIATION_UNCERTAIN",
      "The workspace user state is saved, but provider reconciliation requires review",
    );
  }

  const completed = await completeStaffLifecycle(admin, claimInput);
  if (
    completed.id !== input.membershipId ||
    completed.workspace_id !== input.workspaceId ||
    completed.status !== desiredStatus
  ) {
    invalidRpcResponse();
  }
  return completed;
}

async function revokeStaffAccount(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const lockToken = crypto.randomUUID();
  const claimInput = { ...input, lockToken };
  let revoked: InternalMembership | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc(
      "revoke_workspace_staff_account_v1",
      {
        p_workspace_id: input.workspaceId,
        p_membership_id: input.membershipId,
        p_actor_user_id: input.actorUserId,
        p_token_issued_at: input.tokenIssuedAt,
        p_lock_token: lockToken,
      },
    );
    if (!error) {
      revoked = internalMembership(data);
      break;
    }
    if (attempt === 1) {
      rpcFailure(
        error,
        "STAFF_REVOCATION_UNCERTAIN",
        "The workspace user removal requires operator review",
      );
    }
  }
  if (
    !revoked ||
    revoked.id !== input.membershipId ||
    revoked.workspace_id !== input.workspaceId ||
    revoked.status !== "revoked"
  ) {
    invalidRpcResponse();
  }

  const authUserId = await findStaffInviteAuthUser(admin, claimInput);
  if (authUserId) {
    await deleteExactAuthUser(admin, authUserId, revoked, false);
  }
  await releaseInviteClaim(admin, revoked.id, lockToken);
  return revoked;
}

async function updateStaffRole(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    role: InviteRole;
    actorUserId: string;
    tokenIssuedAt: number;
  },
): Promise<InternalMembership> {
  const { data, error } = await admin.rpc("update_workspace_staff_role_v1", {
    p_workspace_id: input.workspaceId,
    p_membership_id: input.membershipId,
    p_role: input.role,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "STAFF_ROLE_UPDATE_FAILED",
      "The workspace user role could not be updated",
    );
  }
  const membership = internalMembership(data);
  if (
    membership.id !== input.membershipId ||
    membership.workspace_id !== input.workspaceId ||
    membership.role !== input.role
  ) {
    invalidRpcResponse();
  }
  return membership;
}

async function transferWorkspaceOwner(
  admin: AdminClient,
  input: {
    workspaceId: string;
    membershipId: string;
    actorUserId: string;
    actorIsPlatformAdmin: boolean;
    tokenIssuedAt: number;
  },
): Promise<{ owner: StaffMemberDto; previousOwner: StaffMemberDto }> {
  const { data, error } = await admin.rpc("transfer_workspace_owner_v1", {
    p_workspace_id: input.workspaceId,
    p_membership_id: input.membershipId,
    p_actor_user_id: input.actorUserId,
    p_token_issued_at: input.tokenIssuedAt,
  });
  if (error) {
    rpcFailure(
      error,
      "OWNER_TRANSFER_FAILED",
      "Workspace ownership could not be transferred",
    );
  }
  const result = responseRecord(data);
  const ownerRow = responseRecord(result.owner);
  const previousOwnerRow = responseRecord(result.previous_owner);
  const owner = memberDto(ownerRow, false);
  const previousOwner = memberDto(previousOwnerRow, false);
  if (
    responseUuid(ownerRow.workspace_id) !== input.workspaceId ||
    responseUuid(previousOwnerRow.workspace_id) !== input.workspaceId ||
    (!input.actorIsPlatformAdmin &&
      responseUuid(previousOwnerRow.user_id) !== input.actorUserId) ||
    owner.id !== input.membershipId ||
    owner.role !== "owner" ||
    owner.status !== "active" ||
    previousOwner.role !== "admin" ||
    previousOwner.status !== "active" ||
    owner.id === previousOwner.id
  ) {
    invalidRpcResponse();
  }
  return { owner, previousOwner };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req, METHODS);

  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "METHOD_NOT_ALLOWED", "Only POST is allowed");
    }

    const body = await parseJsonObject(req, MAX_WORKSPACE_LOGO_REQUEST_BYTES);
    const action = typeof body.action === "string" ? body.action : "";
    const authContext = await requireAuthenticatedUser(req);
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(
        401,
        "REAUTHENTICATION_REQUIRED",
        "Sign in again with the newest account credentials",
      );
    }
    const { admin, platformAdmin, tokenIssuedAt, user } = authContext;
    const workspaceId = requireUuid(body.workspace_id, "workspace_id");

    if (action === "list") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const result = await listWorkspaceSettings(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (result.capabilities.read_only) {
        invalidRpcResponse();
      }
      return jsonResponse(req, METHODS, 200, result);
    }

    if (action === "billing-overview") {
      requireOnlyKeys(body, ["action", "workspace_id"]);
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId);
      if (!["owner", "admin", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_ACCESS_REQUIRED", "Workspace manager access is required");
      }

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [profileResult, lotsResult, ledgerResult, spentResult, usageResult, pricesResult] = await Promise.all([
        admin.from("workspace_billing_profiles")
          .select("plan_key, billing_status, base_price_cents, per_client_price_cents, included_active_clients, monthly_credit_allowance, stripe_subscription_id, cancel_at_period_end, current_period_end")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        admin.from("workspace_credit_lots")
          .select("remaining, expires_at, source")
          .eq("workspace_id", workspaceId)
          .gt("remaining", 0),
        admin.from("workspace_credit_ledger")
          .select("id, entry_type, amount, operation_type, reference_kind, created_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(25),
        // What was actually taken this month. Multiplying run counts by today's
        // price is only right while the price has never moved: the ledger holds
        // the amount charged at the time, and a mid-month price change made the
        // total on the page disagree with the balance underneath it.
        admin.from("workspace_credit_ledger")
          .select("amount")
          .eq("workspace_id", workspaceId)
          .lt("amount", 0)
          .gte("created_at", monthStart.toISOString())
          .limit(10000),
        admin.from("workspace_operation_costs")
          .select("operation_type, used_byo_key")
          .eq("workspace_id", workspaceId)
          .gte("created_at", monthStart.toISOString())
          .limit(5000),
        admin.from("operation_credit_costs")
          .select("operation_type, credit_cost, effective_from")
          .lte("effective_from", new Date().toISOString())
          .order("effective_from", { ascending: false }),
      ]);
      if (lotsResult.error || ledgerResult.error || usageResult.error || pricesResult.error) {
        throw new HttpError(503, "BILLING_UNAVAILABLE", "Billing data is temporarily unavailable");
      }

      const now = Date.now();
      const activeLots = (lotsResult.data ?? []).filter((lot) =>
        !lot.expires_at || Date.parse(String(lot.expires_at)) > now
      );
      const balance = activeLots.reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0);
      const expiringLots = activeLots
        .filter((lot) => lot.expires_at)
        .sort((left, right) => String(left.expires_at).localeCompare(String(right.expires_at)));
      const usageByType: Record<string, { total: number; byo: number }> = {};
      for (const row of usageResult.data ?? []) {
        const key = String(row.operation_type);
        usageByType[key] = usageByType[key] ?? { total: 0, byo: 0 };
        usageByType[key].total += 1;
        if (row.used_byo_key === true) usageByType[key].byo += 1;
      }
      const currentPrices: Record<string, number> = {};
      for (const row of pricesResult.data ?? []) {
        const key = String(row.operation_type);
        if (!(key in currentPrices)) currentPrices[key] = Number(row.credit_cost) || 0;
      }

      return jsonResponse(req, METHODS, 200, {
        success: true,
        billing: {
          plan_key: profileResult.data?.plan_key ?? "founding_member",
          billing_status: profileResult.data?.billing_status ?? "trialing",
          base_price_cents: profileResult.data?.base_price_cents ?? 3900,
          per_client_price_cents: profileResult.data?.per_client_price_cents ?? 3900,
          included_active_clients: profileResult.data?.included_active_clients ?? 1,
          monthly_credit_allowance: profileResult.data?.monthly_credit_allowance ?? 25,
          enforcement_enabled: Deno.env.get("CREDIT_ENFORCEMENT_ENABLED")?.trim() === "true",
          credits_spent_this_month: (spentResult.data ?? [])
            .reduce((sum, row) => sum + Math.abs(Number(row.amount) || 0), 0),
          // Whether there is a subscription to manage, not which one. The id
          // itself is a Stripe identifier and the browser has no use for it.
          has_subscription: typeof profileResult.data?.stripe_subscription_id === "string"
            && profileResult.data.stripe_subscription_id.length > 0,
          // A subscription cancelled from the portal stays active until the
          // period ends, so the status alone cannot show that it is ending.
          cancel_at_period_end: profileResult.data?.cancel_at_period_end === true,
          current_period_end: profileResult.data?.current_period_end ?? null,
          balance,
          expiring_credits: expiringLots.reduce((sum, lot) => sum + (Number(lot.remaining) || 0), 0),
          next_expiry_at: expiringLots[0]?.expires_at ?? null,
          usage_this_month: usageByType,
          prices: currentPrices,
          recent_activity: (ledgerResult.data ?? []).map((entry) => ({
            id: entry.id,
            entry_type: entry.entry_type,
            amount: entry.amount,
            operation_type: entry.operation_type,
            reference_kind: entry.reference_kind,
            created_at: entry.created_at,
          })),
        },
      });
    }

    if (action === "credits-grant") {
      requireOnlyKeys(body, ["action", "workspace_id", "amount", "reason", "note", "grant_key"]);
      await requireWorkspaceFeatureAccess(authContext, workspaceId);
      if (!platformAdmin) {
        throw new HttpError(403, "PLATFORM_ADMIN_REQUIRED", "Platform administrator access is required");
      }
      const amount = typeof body.amount === "number" && Number.isSafeInteger(body.amount)
        ? body.amount
        : NaN;
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000) {
        throw new HttpError(400, "INVALID_AMOUNT", "Grant between 1 and 10,000 credits");
      }
      const reason = requireString(body.reason, "reason", { max: 60 });
      // The note is optional: the reason is what the ledger entry is filed
      // under, and requiring a written justification for every top-up bought
      // nothing the audit row does not already carry.
      const note = requireString(body.note, "note", { min: 0, max: 500 });
      const grantKey = requireUuid(body.grant_key, "grant_key");

      const { data, error } = await admin.rpc("grant_workspace_credits_v1", {
        p_workspace_id: workspaceId,
        p_source: "admin_grant",
        p_amount: amount,
        p_reference_kind: reason,
        p_reference_id: grantKey,
        p_actor_user_id: user.id,
        p_idempotency_key: `admin-grant:${grantKey}`,
      });
      if (error) {
        throw new HttpError(503, "CREDIT_GRANT_FAILED", "The credit grant could not be recorded");
      }
      const result = data as { balance?: number; idempotent?: boolean } | null;
      // The credits are already in the ledger. Failing the request because the
      // log row would not insert tells an operator the grant did not happen,
      // and the obvious response to that is to grant again.
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.credits.granted",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { amount, reason, note, grant_key: grantKey },
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        granted: amount,
        balance: typeof result?.balance === "number" ? result.balance : null,
        idempotent: result?.idempotent === true,
      });
    }

    if (action === "ai-keys-status" || action === "ai-keys-set" || action === "ai-keys-clear") {
      const access = await requireWorkspaceFeatureAccess(authContext, workspaceId);
      if (!["owner", "platform_admin"].includes(access.role)) {
        throw new HttpError(403, "WORKSPACE_OWNER_REQUIRED", "Workspace owner access is required");
      }

      if (action === "ai-keys-status") {
        requireOnlyKeys(body, ["action", "workspace_id"]);
        const status = await workspaceAiKeyStatus(admin, workspaceId);
        return jsonResponse(req, METHODS, 200, { success: true, providers: status });
      }

      if (action === "ai-keys-set") {
        requireOnlyKeys(body, ["action", "workspace_id", "provider", "api_key"]);
        const provider = requireProvider(body.provider);
        const apiKey = requireString(body.api_key, "api_key", { max: 512 });
        if (apiKey.trim().length < 20) {
          throw new HttpError(400, "INVALID_API_KEY", "The API key looks incomplete");
        }
        const valid = await probeAiKey(provider, apiKey.trim());
        if (!valid) {
          throw new HttpError(422, "API_KEY_REJECTED", "The provider rejected this API key");
        }
        await storeWorkspaceAiKey(admin, workspaceId, provider, apiKey.trim(), user.id);
        await writeAudit(admin, {
          workspaceId,
          actorUserId: user.id,
          action: "workspace.ai_key.set",
          entityType: "workspace",
          entityId: workspaceId,
          metadata: { provider },
        });
        return jsonResponse(req, METHODS, 200, { success: true });
      }

      requireOnlyKeys(body, ["action", "workspace_id", "provider"]);
      const provider = requireProvider(body.provider);
      await clearWorkspaceAiKey(admin, workspaceId, provider);
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: "workspace.ai_key.cleared",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: { provider },
      });
      return jsonResponse(req, METHODS, 200, { success: true });
    }

    if (action === "update_workspace_name") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_updated_at",
        "workspace_name",
      ]);
      const expectedUpdatedAt = requireWorkspaceUpdatedAt(
        body.expected_updated_at,
      );
      const workspaceName = requireWorkspaceName(body.workspace_name);
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.updated_at !== expectedUpdatedAt) {
        throw new HttpError(
          409,
          "WORKSPACE_STATE_CHANGED",
          "Workspace settings changed; refresh before trying again",
        );
      }
      const updatedWorkspace = await setWorkspaceName(admin, {
        workspaceId,
        expectedUpdatedAt,
        previousWorkspaceName: currentBranding.name,
        workspaceName,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: updatedWorkspace,
      });
    }

    if (action === "update_booking_link") {
      requireOnlyKeys(body, ["action", "workspace_id", "booking_embed_url"]);
      // Null clears it. Anything else has to be an https URL this build would
      // also be willing to render, so a link cannot be saved here and then
      // silently refused on the page that shows it.
      const rawBookingUrl = body.booking_embed_url === null
        ? null
        : requireString(body.booking_embed_url, "booking_embed_url", { max: 500 }).trim();
      if (rawBookingUrl !== null && !/^https:\/\/[^\s]+$/u.test(rawBookingUrl)) {
        throw new HttpError(
          400,
          "INVALID_FIELD",
          "The booking link must be a full https address",
        );
      }
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const { error: bookingError } = await admin.rpc(
        "set_workspace_booking_link_v1",
        {
          p_workspace_id: workspaceId,
          p_booking_embed_url: rawBookingUrl,
          p_actor_user_id: user.id,
          p_token_issued_at: tokenIssuedAt,
        },
      );
      if (bookingError) {
        rpcFailure(
          bookingError,
          "BOOKING_LINK_UPDATE_FAILED",
          "The booking link could not be saved",
        );
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: user.id,
        action: rawBookingUrl
          ? "workspace.booking_link.set"
          : "workspace.booking_link.cleared",
        entityType: "workspace",
        entityId: workspaceId,
        metadata: {},
      });
      return jsonResponse(req, METHODS, 200, {
        branding: await loadWorkspaceBranding(admin, workspaceId),
      });
    }

    if (action === "update_brand") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_brand_updated_at",
        "client_brand_name",
        "client_brand_primary_color",
        "client_brand_accent_color",
      ]);
      const expectedBrandUpdatedAt = requireBrandUpdatedAt(
        body.expected_brand_updated_at,
      );
      const clientBrandName = requireClientBrandName(body.client_brand_name);
      const primaryColor = requireClientBrandColor(
        body.client_brand_primary_color,
        "client_brand_primary_color",
      );
      const accentColor = requireClientBrandColor(
        body.client_brand_accent_color,
        "client_brand_accent_color",
      );
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.client_brand_updated_at !== expectedBrandUpdatedAt) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const branding = await setWorkspaceClientBrand(admin, {
        workspaceId,
        expectedBrandUpdatedAt,
        clientBrandName,
        primaryColor,
        accentColor,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
    }

    if (action === "update_logo") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_logo_path",
        "mime_type",
        "image_base64",
      ]);
      const expectedLogoPath = requireExpectedLogoPath(
        body.expected_logo_path,
        workspaceId,
      );
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (currentBranding.logo_path !== expectedLogoPath) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const image = requireWorkspaceLogoImage(
        body.mime_type,
        body.image_base64,
      );
      const logoPath = `${workspaceId}/${crypto.randomUUID()}.${image.extension}`;
      const { error: uploadError } = await admin.storage
        .from(WORKSPACE_LOGO_BUCKET)
        .upload(logoPath, image.bytes, {
          cacheControl: "31536000",
          contentType: image.mimeType,
          upsert: false,
        });
      if (uploadError) {
        throw new HttpError(
          502,
          "LOGO_UPLOAD_FAILED",
          "The workspace logo could not be uploaded",
        );
      }

      let branding: WorkspaceBrandingDto;
      try {
        branding = await setWorkspaceLogo(admin, {
          workspaceId,
          expectedLogoPath,
          logoPath,
          actorUserId: user.id,
          tokenIssuedAt,
        });
      } catch (error) {
        await removeWorkspaceLogoObject(admin, logoPath);
        throw error;
      }
      await removeWorkspaceLogoObject(admin, expectedLogoPath);
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
    }

    if (action === "remove_logo") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "expected_logo_path",
      ]);
      const expectedLogoPath = requireExpectedLogoPath(
        body.expected_logo_path,
        workspaceId,
      );
      const staff = await listWorkspaceStaff(
        admin,
        workspaceId,
        user.id,
        tokenIssuedAt,
      );
      if (staff.capabilities.read_only) invalidRpcResponse();
      requireWorkspaceManager(staff);
      const currentBranding = await loadWorkspaceBranding(admin, workspaceId);
      if (
        expectedLogoPath === null ||
        currentBranding.logo_path !== expectedLogoPath
      ) {
        throw new HttpError(
          409,
          "BRANDING_STATE_CHANGED",
          "Workspace branding changed; refresh before trying again",
        );
      }
      const branding = await setWorkspaceLogo(admin, {
        workspaceId,
        expectedLogoPath,
        logoPath: null,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      await removeWorkspaceLogoObject(admin, expectedLogoPath);
      return jsonResponse(req, METHODS, 200, {
        success: true,
        workspace: branding,
      });
    }

    if (action === "invite") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "email",
        "full_name",
        "role",
      ]);
      const email = requireEmail(body.email);
      const fullName = optionalString(body.full_name, "full_name", 120);
      const role = requireInviteRole(body.role);
      const provisioning = await beginStaffInvite(admin, {
        workspaceId,
        email,
        fullName,
        role,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      const invited = await deliverStaffInvite(admin, {
        workspaceId,
        membershipId: provisioning.id,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 201, {
        success: true,
        member: memberDto(invited, false),
      });
    }

    if (action === "create_password") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "email",
        "full_name",
        "role",
      ]);
      const email = requireEmail(body.email);
      const fullName = optionalString(body.full_name, "full_name", 120);
      const role = requireInviteRole(body.role);
      const provisioning = await beginStaffPasswordAccount(admin, {
        workspaceId,
        email,
        fullName,
        role,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      const issued = await issueStaffTemporaryPassword(admin, {
        workspaceId,
        membershipId: provisioning.id,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 201, {
        success: true,
        member: memberDto(issued.membership, false),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      });
    }

    if (action === "retry_invite") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const invited = await deliverStaffInvite(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(invited, false),
      });
    }

    if (action === "retry_password") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const issued = await issueStaffTemporaryPassword(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(issued.membership, false),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      });
    }

    if (action === "reset_password") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const issued = await resetStaffTemporaryPassword(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(issued.membership, false),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      });
    }

    if (action === "update_role") {
      requireOnlyKeys(body, [
        "action",
        "workspace_id",
        "membership_id",
        "role",
      ]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const role = requireInviteRole(body.role);
      const membership = await updateStaffRole(admin, {
        workspaceId,
        membershipId,
        role,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    if (action === "transfer_owner") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const result = await transferWorkspaceOwner(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        actorIsPlatformAdmin: platformAdmin,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        owner: result.owner,
        previous_owner: result.previousOwner,
        reauthentication_required: !platformAdmin,
      });
    }

    if (action === "revoke") {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const membership = await revokeStaffAccount(admin, {
        workspaceId,
        membershipId,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    if (LIFECYCLE_ACTIONS.includes(action as LifecycleAction)) {
      requireOnlyKeys(body, ["action", "workspace_id", "membership_id"]);
      const membershipId = requireUuid(body.membership_id, "membership_id");
      const membership = await transitionStaffLifecycle(admin, {
        workspaceId,
        membershipId,
        action: action as LifecycleAction,
        actorUserId: user.id,
        tokenIssuedAt,
      });
      return jsonResponse(req, METHODS, 200, {
        success: true,
        member: memberDto(membership, false),
      });
    }

    throw new HttpError(
      400,
      "INVALID_ACTION",
      "Unknown workspace user action",
    );
  } catch (error) {
    return errorResponse(req, METHODS, error);
  }
});
