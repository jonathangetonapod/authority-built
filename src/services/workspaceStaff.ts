import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { WORKSPACE_LOGO_MAX_BYTES, WORKSPACE_LOGO_MIME_TYPES } from '@/lib/workspaceLogo'

export type WorkspaceStaffRole = 'owner' | 'admin' | 'member'
export type WorkspaceStaffStatus = 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
export type WorkspaceStaffSetupMethod = 'platform_bootstrap' | 'email_invite' | 'admin_temporary_password'
export type WorkspaceStaffAction =
  | 'retry_invite'
  | 'retry_password'
  | 'reset_password'
  | 'update_role'
  | 'transfer_owner'
  | 'suspend'
  | 'reactivate'
  | 'revoke'

export interface WorkspaceStaffMember {
  id: string
  email: string
  full_name: string | null
  role: WorkspaceStaffRole
  status: WorkspaceStaffStatus
  setup_method: WorkspaceStaffSetupMethod
  invited_at: string
  invite_expires_at: string | null
  accepted_at: string | null
  suspended_at: string | null
  pending_review: boolean
  allowed_actions: WorkspaceStaffAction[]
}

export interface WorkspaceStaffCapabilities {
  read_only: boolean
  invite_roles: Array<Exclude<WorkspaceStaffRole, 'owner'>>
  can_generate_password: boolean
  can_manage_branding: boolean
  can_manage_client_branding: boolean
  can_manage_workspace_name: boolean
  can_update_roles: boolean
  can_transfer_owner: boolean
}

export interface WorkspaceStaffView {
  workspace: {
    id: string
    name: string
    updated_at: string | null
    status: 'active'
    /** The platform workspace: settings apply, staff is managed elsewhere. */
    is_default: boolean
    logo_path: string | null
    logo_updated_at: string | null
    client_brand_name: string
    client_brand_primary_color: string
    client_brand_accent_color: string
    client_brand_updated_at: string | null
    /** Scheduler prospects are offered when a dashboard sets no CTA. */
    booking_embed_url: string | null
  }
  capabilities: WorkspaceStaffCapabilities
  members: WorkspaceStaffMember[]
}

export interface WorkspaceStaffInviteInput {
  email: string
  full_name?: string
  role: Exclude<WorkspaceStaffRole, 'owner'>
}

export interface WorkspaceStaffTemporaryCredential {
  member: WorkspaceStaffMember
  email: string
  temporary_password: string
}

export interface WorkspaceBranding {
  id: string
  logo_path: string | null
  logo_updated_at: string | null
}

export interface WorkspaceClientBranding {
  id: string
  client_brand_name: string
  client_brand_primary_color: string
  client_brand_accent_color: string
  client_brand_updated_at: string
}

export interface WorkspaceClientBrandingInput {
  client_brand_name: string
  client_brand_primary_color: string
  client_brand_accent_color: string
  expected_brand_updated_at: string
}

export interface WorkspaceName {
  id: string
  name: string
  updated_at: string
}

export interface WorkspaceNameInput {
  name: string
  expected_updated_at: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES: WorkspaceStaffRole[] = ['owner', 'admin', 'member']
const STATUSES: WorkspaceStaffStatus[] = ['provisioning', 'invited', 'active', 'suspended', 'revoked']
const SETUP_METHODS: WorkspaceStaffSetupMethod[] = ['platform_bootstrap', 'email_invite', 'admin_temporary_password']
const ACTIONS: WorkspaceStaffAction[] = [
  'retry_invite',
  'retry_password',
  'reset_password',
  'update_role',
  'transfer_owner',
  'suspend',
  'reactivate',
  'revoke',
]
const LOGO_OBJECT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/
const MUTATION_ACTIONS: Array<Exclude<WorkspaceStaffAction, 'update_role' | 'retry_password' | 'reset_password'>> = [
  'retry_invite',
  'transfer_owner',
  'suspend',
  'reactivate',
  'revoke',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalUuid(value: string, label: string): string {
  const result = value.trim().toLowerCase()
  if (!UUID_PATTERN.test(result)) throw new Error(`${label} is invalid.`)
  return result
}

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.')
  }
  return email
}

function isoTimestamp(value: unknown, nullable: true): string | null
function isoTimestamp(value: unknown, nullable?: false): string
function isoTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) {
    throw new Error('The workspace staff response was invalid.')
  }
  return value
}

function parseMember(value: unknown): WorkspaceStaffMember {
  if (!isRecord(value)) throw new Error('The workspace staff response was invalid.')
  const id = typeof value.id === 'string' ? canonicalUuid(value.id, 'Staff membership ID') : ''
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const fullNameValue = value.full_name
  let fullName: string | null | undefined
  if (fullNameValue === null) fullName = null
  else if (typeof fullNameValue === 'string') fullName = fullNameValue
  else fullName = undefined
  const role = value.role as WorkspaceStaffRole
  const status = value.status as WorkspaceStaffStatus
  const setupMethod = (value.setup_method ?? 'email_invite') as WorkspaceStaffSetupMethod
  const allowedActions = Array.isArray(value.allowed_actions)
    ? value.allowed_actions as WorkspaceStaffAction[]
    : null

  if (
    !id
    || !EMAIL_PATTERN.test(email)
    || email.length > 254
    || fullName === undefined
    || (typeof fullName === 'string' && (fullName.trim().length === 0 || fullName.length > 120))
    || !ROLES.includes(role)
    || !STATUSES.includes(status)
    || !SETUP_METHODS.includes(setupMethod)
    || typeof value.pending_review !== 'boolean'
    || !allowedActions
    || allowedActions.some((action) => !ACTIONS.includes(action))
    || new Set(allowedActions).size !== allowedActions.length
    || (value.pending_review && allowedActions.length > 0)
  ) {
    throw new Error('The workspace staff response was invalid.')
  }

  const actionsMatchState = (
    (role !== 'owner' || allowedActions.every((action) => action === 'reset_password'))
    && (!allowedActions.includes('retry_invite') || (
      status === 'provisioning' && setupMethod === 'email_invite'
    ))
    && (!allowedActions.includes('retry_password') || (
      status === 'provisioning' && setupMethod === 'admin_temporary_password'
    ))
    && (!allowedActions.includes('reset_password') || (
      status === 'active'
      || (status === 'invited' && setupMethod === 'admin_temporary_password')
    ))
    && (!allowedActions.includes('update_role') || status === 'active' || status === 'suspended')
    && (!allowedActions.includes('transfer_owner') || status === 'active')
    && (!allowedActions.includes('suspend') || status === 'active')
    && (!allowedActions.includes('reactivate') || status === 'suspended')
    && (!allowedActions.includes('revoke') || status !== 'revoked')
  )
  if (!actionsMatchState) throw new Error('The workspace staff response was invalid.')

  return {
    id,
    email,
    full_name: fullName,
    role,
    status,
    setup_method: setupMethod,
    invited_at: isoTimestamp(value.invited_at),
    invite_expires_at: isoTimestamp(value.invite_expires_at, true),
    accepted_at: isoTimestamp(value.accepted_at, true),
    suspended_at: isoTimestamp(value.suspended_at, true),
    pending_review: value.pending_review,
    allowed_actions: allowedActions,
  }
}

function parseCapabilities(value: unknown): WorkspaceStaffCapabilities {
  if (!isRecord(value)) throw new Error('The workspace staff response was invalid.')
  const inviteRoles = Array.isArray(value.invite_roles)
    ? value.invite_roles as Array<'admin' | 'member'>
    : null
  const canGeneratePassword = value.can_generate_password ?? false
  const canManageBranding = value.can_manage_branding ?? false
  const canManageClientBranding = value.can_manage_client_branding ?? false
  const canManageWorkspaceName = value.can_manage_workspace_name ?? false
  if (
    typeof value.read_only !== 'boolean'
    || !inviteRoles
    || inviteRoles.some((role) => role !== 'admin' && role !== 'member')
    || new Set(inviteRoles).size !== inviteRoles.length
    || typeof canGeneratePassword !== 'boolean'
    || typeof canManageBranding !== 'boolean'
    || typeof canManageClientBranding !== 'boolean'
    || typeof canManageWorkspaceName !== 'boolean'
    || typeof value.can_update_roles !== 'boolean'
    || typeof value.can_transfer_owner !== 'boolean'
    || (value.read_only && (
      inviteRoles.length > 0
      || canGeneratePassword
      || canManageBranding
      || canManageClientBranding
      || canManageWorkspaceName
      || value.can_update_roles
      || value.can_transfer_owner
    ))
  ) {
    throw new Error('The workspace staff response was invalid.')
  }
  return {
    read_only: value.read_only,
    invite_roles: inviteRoles,
    can_generate_password: canGeneratePassword,
    can_manage_branding: canManageBranding,
    can_manage_client_branding: canManageClientBranding,
    can_manage_workspace_name: canManageWorkspaceName,
    can_update_roles: value.can_update_roles,
    can_transfer_owner: value.can_transfer_owner,
  }
}

function parseLogoPath(value: unknown, workspaceId: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length > 96) {
    throw new Error('The workspace branding response was invalid.')
  }
  const [pathWorkspaceId, objectName, ...extra] = value.split('/')
  if (
    extra.length > 0
    || pathWorkspaceId !== workspaceId
    || !LOGO_OBJECT_PATTERN.test(objectName || '')
  ) {
    throw new Error('The workspace branding response was invalid.')
  }
  return value
}

function parseBranding(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceBranding {
  if (!isRecord(value)) throw new Error('The workspace branding response was invalid.')
  const workspaceId = typeof value.id === 'string'
    ? canonicalUuid(value.id, 'Workspace ID')
    : ''
  const logoPath = parseLogoPath(value.logo_path, workspaceId)
  const logoUpdatedAt = isoTimestamp(value.logo_updated_at ?? null, true)
  if (
    workspaceId !== expectedWorkspaceId
    || (logoPath === null) !== (logoUpdatedAt === null)
  ) {
    throw new Error('The workspace branding response was invalid.')
  }
  return {
    id: workspaceId,
    logo_path: logoPath,
    logo_updated_at: logoUpdatedAt,
  }
}

function parseClientBrandName(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || !value
    || value.length > 120
    || /[\p{Cc}\p{Cf}]/u.test(value)
  ) {
    throw new Error('The workspace client branding response was invalid.')
  }
  return value
}

function parseClientBrandColor(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !/^#[0-9A-F]{6}$/u.test(value)) {
    throw new Error('The workspace client branding response was invalid.')
  }
  return value
}

function parseView(value: unknown, expectedWorkspaceId: string): WorkspaceStaffView {
  if (!isRecord(value) || !isRecord(value.workspace) || !Array.isArray(value.members)) {
    throw new Error('The workspace staff response was invalid.')
  }
  const workspaceId = typeof value.workspace.id === 'string'
    ? canonicalUuid(value.workspace.id, 'Workspace ID')
    : ''
  if (
    workspaceId !== expectedWorkspaceId
    || typeof value.workspace.name !== 'string'
    || !value.workspace.name.trim()
    || value.workspace.name.length > 120
    || value.workspace.status !== 'active'
  ) {
    throw new Error('The workspace staff response was invalid.')
  }

  const members = value.members.map(parseMember)
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    throw new Error('The workspace staff response was invalid.')
  }
  // Exactly one live owner is a private-workspace invariant that the database
  // deliberately does not apply to the default workspace. The edge function's
  // validator already carves it out; this one did not, so a platform workspace
  // with two owners would have failed the settings page it exists to serve.
  const isDefaultWorkspace = value.workspace?.is_default === true
  const liveOwners = members.filter((member) => member.role === 'owner' && member.status !== 'revoked')
  if (!isDefaultWorkspace && liveOwners.length !== 1) {
    throw new Error('The workspace staff response was invalid.')
  }

  const capabilities = parseCapabilities(value.capabilities)
  const branding = parseBranding({
    id: workspaceId,
    logo_path: value.workspace.logo_path ?? null,
    logo_updated_at: value.workspace.logo_updated_at ?? null,
  }, workspaceId)
  if (capabilities.read_only && members.some((member) => member.allowed_actions.length > 0)) {
    throw new Error('The workspace staff response was invalid.')
  }
  const clientBrandName = parseClientBrandName(
    value.workspace.client_brand_name,
    value.workspace.name,
  )
  const clientBrandPrimaryColor = parseClientBrandColor(
    value.workspace.client_brand_primary_color,
    '#0D1B2A',
  )
  const clientBrandAccentColor = parseClientBrandColor(
    value.workspace.client_brand_accent_color,
    '#C7794F',
  )
  const clientBrandUpdatedAt = isoTimestamp(
    value.workspace.client_brand_updated_at ?? null,
    true,
  )
  const workspaceUpdatedAt = isoTimestamp(value.workspace.updated_at ?? null, true)
  if (capabilities.can_manage_client_branding && !clientBrandUpdatedAt) {
    throw new Error('The workspace client branding response was invalid.')
  }
  if (capabilities.can_manage_workspace_name && !workspaceUpdatedAt) {
    throw new Error('The workspace name response was invalid.')
  }
  return {
    workspace: {
      id: workspaceId,
      name: value.workspace.name,
      updated_at: workspaceUpdatedAt,
      status: 'active',
      is_default: value.workspace.is_default === true,
      logo_path: branding.logo_path,
      logo_updated_at: branding.logo_updated_at,
      client_brand_name: clientBrandName,
      client_brand_primary_color: clientBrandPrimaryColor,
      client_brand_accent_color: clientBrandAccentColor,
      client_brand_updated_at: clientBrandUpdatedAt,
      booking_embed_url: typeof value.workspace.booking_embed_url === 'string'
        && value.workspace.booking_embed_url.startsWith('https://')
        ? value.workspace.booking_embed_url
        : null,
    },
    capabilities,
    members,
  }
}

async function invoke(body: Record<string, unknown>, fallback: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('manage-workspace-staff', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data
}

export async function listWorkspaceStaff(workspaceId: string): Promise<WorkspaceStaffView> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'list', workspace_id: canonicalWorkspaceId },
    'Workspace users could not be loaded.',
  )
  return parseView(data, canonicalWorkspaceId)
}

function parseBrandingMutation(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceBranding {
  if (!isRecord(value) || value.success !== true) {
    throw new Error('The workspace branding response was invalid.')
  }
  return parseBranding(value.workspace, expectedWorkspaceId)
}

function parseClientBrandingMutation(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceClientBranding {
  if (!isRecord(value) || value.success !== true || !isRecord(value.workspace)) {
    throw new Error('The workspace client branding response was invalid.')
  }
  const workspaceId = typeof value.workspace.id === 'string'
    ? canonicalUuid(value.workspace.id, 'Workspace ID')
    : ''
  if (
    workspaceId !== expectedWorkspaceId
    || typeof value.workspace.client_brand_name !== 'string'
    || typeof value.workspace.client_brand_primary_color !== 'string'
    || typeof value.workspace.client_brand_accent_color !== 'string'
  ) {
    throw new Error('The workspace client branding response was invalid.')
  }
  return {
    id: workspaceId,
    client_brand_name: parseClientBrandName(value.workspace.client_brand_name, ''),
    client_brand_primary_color: parseClientBrandColor(value.workspace.client_brand_primary_color, ''),
    client_brand_accent_color: parseClientBrandColor(value.workspace.client_brand_accent_color, ''),
    client_brand_updated_at: isoTimestamp(value.workspace.client_brand_updated_at),
  }
}

function parseWorkspaceNameMutation(
  value: unknown,
  expectedWorkspaceId: string,
): WorkspaceName {
  if (!isRecord(value) || value.success !== true || !isRecord(value.workspace)) {
    throw new Error('The workspace name response was invalid.')
  }
  const workspaceId = typeof value.workspace.id === 'string'
    ? canonicalUuid(value.workspace.id, 'Workspace ID')
    : ''
  const name = value.workspace.name
  if (
    workspaceId !== expectedWorkspaceId
    || typeof name !== 'string'
    || name !== name.trim()
    || !name
    || name.length > 120
    || /[\p{Cc}\p{Cf}]/u.test(name)
  ) {
    throw new Error('The workspace name response was invalid.')
  }
  return {
    id: workspaceId,
    name,
    updated_at: isoTimestamp(value.workspace.updated_at),
  }
}

export async function updateWorkspaceName(
  workspaceId: string,
  input: WorkspaceNameInput,
): Promise<WorkspaceName> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const name = input.name.trim()
  if (!name || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new Error('Workspace name must be between 1 and 120 characters.')
  }
  if (!Number.isFinite(Date.parse(input.expected_updated_at))) {
    throw new Error('Workspace settings changed. Refresh before saving.')
  }
  const data = await invoke({
    action: 'update_workspace_name',
    workspace_id: canonicalWorkspaceId,
    expected_updated_at: input.expected_updated_at,
    workspace_name: name,
  }, 'Workspace name could not be updated.')
  return parseWorkspaceNameMutation(data, canonicalWorkspaceId)
}

/**
 * The scheduler prospects are offered when a dashboard sets no call-to-action
 * of its own. Pass null to clear it.
 */
export async function updateWorkspaceBookingLink(
  workspaceId: string,
  bookingEmbedUrl: string | null,
): Promise<void> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const trimmed = bookingEmbedUrl?.trim() || null
  if (trimmed !== null && !/^https:\/\/\S+$/u.test(trimmed)) {
    throw new Error('The booking link must be a full https address.')
  }
  if (trimmed !== null && trimmed.length > 500) {
    throw new Error('The booking link is too long.')
  }
  await invoke({
    action: 'update_booking_link',
    workspace_id: canonicalWorkspaceId,
    booking_embed_url: trimmed,
  }, 'The booking link could not be saved.')
}

export async function updateWorkspaceClientBranding(
  workspaceId: string,
  input: WorkspaceClientBrandingInput,
): Promise<WorkspaceClientBranding> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const clientBrandName = input.client_brand_name.trim()
  if (
    !clientBrandName
    || clientBrandName.length > 120
    || /[\p{Cc}\p{Cf}]/u.test(clientBrandName)
  ) {
    throw new Error('Agency name must be between 1 and 120 characters.')
  }
  const primaryColor = input.client_brand_primary_color.trim().toUpperCase()
  const accentColor = input.client_brand_accent_color.trim().toUpperCase()
  if (!/^#[0-9A-F]{6}$/u.test(primaryColor) || !/^#[0-9A-F]{6}$/u.test(accentColor)) {
    throw new Error('Brand colors must use six-digit hexadecimal values.')
  }
  if (!Number.isFinite(Date.parse(input.expected_brand_updated_at))) {
    throw new Error('Workspace branding changed. Refresh before saving.')
  }
  const data = await invoke({
    action: 'update_brand',
    workspace_id: canonicalWorkspaceId,
    expected_brand_updated_at: input.expected_brand_updated_at,
    client_brand_name: clientBrandName,
    client_brand_primary_color: primaryColor,
    client_brand_accent_color: accentColor,
  }, 'Client-facing workspace branding could not be updated.')
  return parseClientBrandingMutation(data, canonicalWorkspaceId)
}

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768))
  }
  return btoa(binary)
}

export async function updateWorkspaceLogo(
  workspaceId: string,
  file: File,
  expectedLogoPath: string | null,
): Promise<WorkspaceBranding> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const logoPath = parseLogoPath(expectedLogoPath, canonicalWorkspaceId)
  if (
    !WORKSPACE_LOGO_MIME_TYPES.includes(file.type as typeof WORKSPACE_LOGO_MIME_TYPES[number])
  ) {
    throw new Error('Choose a PNG, JPEG, or WebP image.')
  }
  if (file.size === 0 || file.size > WORKSPACE_LOGO_MAX_BYTES) {
    throw new Error('Workspace logo must be 2 MB or smaller.')
  }
  const data = await invoke({
    action: 'update_logo',
    workspace_id: canonicalWorkspaceId,
    expected_logo_path: logoPath,
    mime_type: file.type,
    image_base64: await fileBase64(file),
  }, 'The workspace logo could not be uploaded.')
  return parseBrandingMutation(data, canonicalWorkspaceId)
}

export async function removeWorkspaceLogo(
  workspaceId: string,
  expectedLogoPath: string,
): Promise<WorkspaceBranding> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const logoPath = parseLogoPath(expectedLogoPath, canonicalWorkspaceId)
  if (!logoPath) throw new Error('The workspace logo is unavailable.')
  const data = await invoke({
    action: 'remove_logo',
    workspace_id: canonicalWorkspaceId,
    expected_logo_path: logoPath,
  }, 'The workspace logo could not be removed.')
  const result = parseBrandingMutation(data, canonicalWorkspaceId)
  if (result.logo_path !== null || result.logo_updated_at !== null) {
    throw new Error('The workspace branding response was invalid.')
  }
  return result
}

export async function inviteWorkspaceStaff(
  workspaceId: string,
  input: WorkspaceStaffInviteInput,
): Promise<WorkspaceStaffMember> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const role = input.role
  if (role !== 'admin' && role !== 'member') throw new Error('Staff role is invalid.')
  const fullName = input.full_name?.trim() || null
  if (fullName && fullName.length > 120) throw new Error('Full name must be 120 characters or fewer.')
  const data = await invoke({
    action: 'invite',
    workspace_id: canonicalWorkspaceId,
    email: normalizedEmail(input.email),
    full_name: fullName,
    role,
  }, 'The staff invitation could not be sent.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  const member = parseMember(data.member)
  if (member.role !== role || member.status !== 'invited') {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}

function parseTemporaryCredential(
  value: unknown,
  expected: {
    email?: string
    membershipId?: string
    role?: Exclude<WorkspaceStaffRole, 'owner'>
  },
): WorkspaceStaffTemporaryCredential {
  if (!isRecord(value) || value.success !== true) {
    throw new Error('The workspace staff response was invalid.')
  }
  const member = parseMember(value.member)
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const temporaryPassword = value.temporary_password
  if (
    !EMAIL_PATTERN.test(email)
    || email !== member.email
    || (expected.email !== undefined && email !== expected.email)
    || (expected.membershipId !== undefined && member.id !== expected.membershipId)
    || (expected.role !== undefined && member.role !== expected.role)
    || member.status !== 'invited'
    || member.setup_method !== 'admin_temporary_password'
    || member.invite_expires_at === null
    || typeof temporaryPassword !== 'string'
    || !/^Tmp-[A-Za-z0-9_-]{24}$/.test(temporaryPassword)
    || !/[A-Z]/.test(temporaryPassword.slice(4))
    || !/[a-z]/.test(temporaryPassword.slice(4))
    || !/[0-9]/.test(temporaryPassword.slice(4))
    || !/[-_]/.test(temporaryPassword.slice(4))
  ) {
    throw new Error('The workspace staff response was invalid.')
  }
  return { member, email, temporary_password: temporaryPassword }
}

export async function createWorkspaceStaffTemporaryPassword(
  workspaceId: string,
  input: WorkspaceStaffInviteInput,
): Promise<WorkspaceStaffTemporaryCredential> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const role = input.role
  if (role !== 'admin' && role !== 'member') throw new Error('Staff role is invalid.')
  const email = normalizedEmail(input.email)
  const fullName = input.full_name?.trim() || null
  if (fullName && fullName.length > 120) throw new Error('Full name must be 120 characters or fewer.')
  const data = await invoke({
    action: 'create_password',
    workspace_id: canonicalWorkspaceId,
    email,
    full_name: fullName,
    role,
  }, 'The temporary password could not be generated.')
  return parseTemporaryCredential(data, { email, role })
}

export async function retryWorkspaceStaffTemporaryPassword(
  workspaceId: string,
  membershipId: string,
): Promise<WorkspaceStaffTemporaryCredential> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  const data = await invoke({
    action: 'retry_password',
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
  }, 'The temporary password could not be generated.')
  return parseTemporaryCredential(data, { membershipId: canonicalMembershipId })
}

export async function resetWorkspaceStaffTemporaryPassword(
  workspaceId: string,
  membershipId: string,
): Promise<WorkspaceStaffTemporaryCredential> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  const data = await invoke({
    action: 'reset_password',
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
  }, 'The workspace user password could not be reset.')
  return parseTemporaryCredential(data, { membershipId: canonicalMembershipId })
}

export async function updateWorkspaceStaffRole(
  workspaceId: string,
  membershipId: string,
  role: Exclude<WorkspaceStaffRole, 'owner'>,
): Promise<WorkspaceStaffMember> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  if (role !== 'admin' && role !== 'member') throw new Error('Staff role is invalid.')
  const data = await invoke({
    action: 'update_role',
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
    role,
  }, 'The staff role could not be updated.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  const member = parseMember(data.member)
  if (member.id !== canonicalMembershipId || member.role !== role) {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}

export async function mutateWorkspaceStaff(
  workspaceId: string,
  membershipId: string,
  action: Exclude<WorkspaceStaffAction, 'update_role' | 'retry_password' | 'reset_password'>,
): Promise<WorkspaceStaffMember | null> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const canonicalMembershipId = canonicalUuid(membershipId, 'Staff membership ID')
  if (!MUTATION_ACTIONS.includes(action)) throw new Error('Staff action is invalid.')
  const data = await invoke({
    action,
    workspace_id: canonicalWorkspaceId,
    membership_id: canonicalMembershipId,
  }, 'The workspace user could not be updated.')
  if (!isRecord(data) || data.success !== true) throw new Error('The workspace staff response was invalid.')
  if (action === 'transfer_owner') {
    if (typeof data.reauthentication_required !== 'boolean') throw new Error('The workspace staff response was invalid.')
    const owner = parseMember(data.owner)
    const previousOwner = parseMember(data.previous_owner)
    if (
      owner.id !== canonicalMembershipId
      || owner.role !== 'owner'
      || owner.status !== 'active'
      || previousOwner.id === owner.id
      || previousOwner.role !== 'admin'
      || previousOwner.status !== 'active'
    ) {
      throw new Error('The workspace staff response was invalid.')
    }
    return owner
  }
  const member = parseMember(data.member)
  const expectedStatus: Record<Exclude<WorkspaceStaffAction, 'update_role' | 'retry_password' | 'reset_password' | 'transfer_owner'>, WorkspaceStaffStatus> = {
    retry_invite: 'invited',
    suspend: 'suspended',
    reactivate: 'active',
    revoke: 'revoked',
  }
  if (
    member.id !== canonicalMembershipId
    || member.status !== expectedStatus[action]
  ) {
    throw new Error('The workspace staff response was invalid.')
  }
  return member
}

export interface WorkspaceAiKeyStatus {
  configured: boolean
  last_four: string | null
  updated_at: string | null
}

export interface WorkspaceAiKeysView {
  anthropic: WorkspaceAiKeyStatus
  openai: WorkspaceAiKeyStatus
  winnr: WorkspaceAiKeyStatus
}

function parseAiKeyStatus(value: unknown): WorkspaceAiKeyStatus {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { configured: false, last_four: null, updated_at: null }
  }
  const record = value as Record<string, unknown>
  return {
    configured: record.configured === true,
    last_four: typeof record.last_four === 'string' ? record.last_four : null,
    updated_at: typeof record.updated_at === 'string' ? record.updated_at : null,
  }
}

export async function getWorkspaceAiKeys(workspaceId: string): Promise<WorkspaceAiKeysView> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'ai-keys-status', workspace_id: canonicalWorkspaceId },
    'AI key status could not be loaded.',
  ) as { success?: boolean; providers?: Record<string, unknown> }
  if (data?.success !== true) throw new Error('AI key status could not be loaded.')
  return {
    anthropic: parseAiKeyStatus(data.providers?.anthropic),
    openai: parseAiKeyStatus(data.providers?.openai),
    winnr: parseAiKeyStatus(data.providers?.winnr),
  }
}

export async function setWorkspaceAiKey(
  workspaceId: string,
  provider: 'anthropic' | 'openai' | 'winnr',
  apiKey: string,
): Promise<void> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'ai-keys-set', workspace_id: canonicalWorkspaceId, provider, api_key: apiKey },
    'The API key could not be saved.',
  ) as { success?: boolean }
  if (data?.success !== true) throw new Error('The API key could not be saved.')
}

export async function clearWorkspaceAiKey(
  workspaceId: string,
  provider: 'anthropic' | 'openai' | 'winnr',
): Promise<void> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'ai-keys-clear', workspace_id: canonicalWorkspaceId, provider },
    'The API key could not be removed.',
  ) as { success?: boolean }
  if (data?.success !== true) throw new Error('The API key could not be removed.')
}

export interface WorkspaceBillingOverview {
  plan_key: string
  billing_status: string
  base_price_cents: number
  per_client_price_cents: number
  included_active_clients: number
  monthly_credit_allowance: number
  enforcement_enabled: boolean
  // Whether there is a Stripe subscription to manage. Decides whether the page
  // offers to open the portal or to pick a plan for the first time.
  has_subscription?: boolean
  // Set while a subscription is live but will not renew. billing_status stays
  // active through that window, so it cannot carry this on its own.
  // What the ledger actually took this month. The usage table below prices
  // runs at today's rate, which only matches while the rate has not moved.
  credits_spent_this_month?: number
  cancel_at_period_end?: boolean
  current_period_end?: string | null
  balance: number
  expiring_credits: number
  next_expiry_at: string | null
  usage_this_month: Record<string, { total: number; byo: number }>
  prices: Record<string, number>
  recent_activity: Array<{
    id: string
    entry_type: string
    amount: number
    operation_type: string | null
    reference_kind: string | null
    created_at: string
  }>
}

export async function getWorkspaceBillingOverview(workspaceId: string): Promise<WorkspaceBillingOverview> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke(
    { action: 'billing-overview', workspace_id: canonicalWorkspaceId },
    'Billing data could not be loaded.',
  ) as { success?: boolean; billing?: WorkspaceBillingOverview }
  if (data?.success !== true || !data.billing || typeof data.billing !== 'object') {
    throw new Error('Billing data could not be loaded.')
  }
  return {
    ...data.billing,
    balance: Number(data.billing.balance) || 0,
    expiring_credits: Number(data.billing.expiring_credits) || 0,
    usage_this_month: data.billing.usage_this_month ?? {},
    prices: data.billing.prices ?? {},
    recent_activity: Array.isArray(data.billing.recent_activity) ? data.billing.recent_activity : [],
  }
}

export interface WorkspaceCreditGrantResult {
  granted: number
  balance: number | null
}

export async function grantWorkspaceCredits(
  workspaceId: string,
  input: { amount: number; reason: string; note: string },
): Promise<WorkspaceCreditGrantResult> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke({
    action: 'credits-grant',
    workspace_id: canonicalWorkspaceId,
    amount: input.amount,
    reason: input.reason,
    note: input.note,
    grant_key: crypto.randomUUID(),
  }, 'The credit grant could not be recorded.') as {
    success?: boolean
    granted?: number
    balance?: number | null
  }
  if (data?.success !== true || typeof data.granted !== 'number') {
    throw new Error('The credit grant could not be recorded.')
  }
  return { granted: data.granted, balance: typeof data.balance === 'number' ? data.balance : null }
}

/**
 * Platform-admin only: what this workspace is granted each month.
 *
 * The plan ladder carries an allowance too, but that one is only copied onto a
 * workspace when a subscription event fires — so for a workspace that has
 * never been billed, editing the plan changed nothing it would ever receive.
 * This writes the number the renewal actually reads.
 *
 * Takes effect at the next renewal: the current month has already been granted
 * under the old number.
 */
export async function setWorkspaceMonthlyAllowance(
  workspaceId: string,
  monthlyCreditAllowance: number,
): Promise<number> {
  const canonicalWorkspaceId = canonicalUuid(workspaceId, 'Workspace ID')
  const data = await invoke({
    action: 'billing-allowance-set',
    workspace_id: canonicalWorkspaceId,
    monthly_credit_allowance: monthlyCreditAllowance,
  }, 'The monthly allowance could not be saved.') as {
    success?: boolean
    monthly_credit_allowance?: number
  }
  if (data?.success !== true || typeof data.monthly_credit_allowance !== 'number') {
    throw new Error('The monthly allowance could not be saved.')
  }
  return data.monthly_credit_allowance
}

export type WorkspacePlanKey = 'founding_member' | 'standard'

export interface BillingPlan {
  plan_key: string
  display_name: string
  base_price_cents: number
  monthly_credit_allowance: number
  stripe_price_id: string | null
  is_purchasable: boolean
}

function readPlans(data: unknown): BillingPlan[] {
  const plans = (data as { plans?: unknown })?.plans
  if (!Array.isArray(plans)) throw new Error('The plan list response was invalid.')
  return plans as BillingPlan[]
}

/** Platform-admin only: the plan ladder and the Stripe Price each is sold at. */
export async function listBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await supabase.functions.invoke('workspace-billing-portal', {
    body: { action: 'plans-list' },
  })
  if (error) throw await toFunctionError(error, 'The plans could not be loaded.')
  return readPlans(data)
}

/**
 * Platform-admin only. Stripe Prices are immutable, so this creates a new one
 * and repoints the plan at it; existing subscribers stay on the price they
 * signed up at until they move themselves.
 */
export async function updateBillingPlanPrice(
  planKey: string,
  baseCents: number,
  monthlyCreditAllowance?: number,
): Promise<BillingPlan[]> {
  const { data, error } = await supabase.functions.invoke('workspace-billing-portal', {
    body: {
      action: 'plans-update',
      plan_key: planKey,
      base_price_cents: baseCents,
      ...(monthlyCreditAllowance === undefined ? {} : { monthly_credit_allowance: monthlyCreditAllowance }),
    },
  })
  if (error) throw await toFunctionError(error, 'The price could not be updated.')
  return readPlans(data)
}

/**
 * Opens Stripe's hosted Customer Portal, where the plan, payment method,
 * invoices and cancellation all live. Returns the URL to send the browser to;
 * nothing about the plan is decided here, and the subscription webhook is what
 * records whatever the customer ends up doing there.
 */
export async function createWorkspaceBillingPortal(workspaceId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('workspace-billing-portal', {
    body: { action: 'portal-create', workspace_id: canonicalUuid(workspaceId, 'Workspace ID') },
  })
  if (error) throw await toFunctionError(error, 'The billing portal could not be opened.')
  if (!data || typeof data.url !== 'string') throw new Error('The billing portal response was invalid.')
  return data.url
}

/** Subscription checkout, for a workspace that has no subscription to manage yet. */
export async function createWorkspaceSubscriptionCheckout(
  workspaceId: string,
  planKey: WorkspacePlanKey,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('workspace-billing-portal', {
    body: {
      action: 'subscription-create',
      workspace_id: canonicalUuid(workspaceId, 'Workspace ID'),
      plan_key: planKey,
    },
  })
  if (error) throw await toFunctionError(error, 'The plan checkout could not be started.')
  if (!data || typeof data.url !== 'string') throw new Error('The plan checkout response was invalid.')
  return data.url
}

export async function createWorkspaceCreditCheckout(
  workspaceId: string,
  pack: 'starter' | 'growth' | 'scale',
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('workspace-credit-checkout', {
    body: { action: 'checkout-create', workspace_id: canonicalUuid(workspaceId, 'Workspace ID'), pack },
  })
  if (error) throw await toFunctionError(error, 'The checkout could not be started.')
  if (!data || typeof data.url !== 'string') throw new Error('The checkout response was invalid.')
  return data.url
}
