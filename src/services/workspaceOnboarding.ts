import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { currentHostname } from '@/lib/workspaceHost'

export const onboardingQuestionTypes = [
  'short_text',
  'long_text',
  'email',
  'url',
  'single_select',
  'multi_select',
  'yes_no',
  'date',
  'image_upload',
  'document_upload',
] as const

export const onboardingMappings = [
  'client.name',
  'client.email',
  'client.contact_person',
  'client.website',
  'client.linkedin_url',
  'client.calendar_link',
  'client.bio',
] as const

export type OnboardingQuestionType = typeof onboardingQuestionTypes[number]
export type OnboardingMapping = typeof onboardingMappings[number]
export type OnboardingStatus =
  | 'invited'
  | 'in_progress'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'expired'
  | 'revoked'

export interface OnboardingOption {
  id: string
  label: string
}

export interface OnboardingQuestion {
  id: string
  type: OnboardingQuestionType
  label: string
  description: string
  required: boolean
  placeholder: string
  mapping: OnboardingMapping | null
  options?: OnboardingOption[]
}

export interface OnboardingSection {
  id: string
  title: string
  description: string
  questions: OnboardingQuestion[]
}

export interface OnboardingDefinition {
  schema_version: 1
  intro_title: string
  intro_body: string
  completion_message: string
  sections: OnboardingSection[]
}

export interface OnboardingTemplate {
  id: string
  workspace_id: string
  name: string
  description: string
  status: 'draft' | 'published' | 'archived'
  definition: OnboardingDefinition
  /**
   * The frozen definition of published_version — what a new instance will
   * actually snapshot. `definition` above is the mutable draft; rendering it
   * as "what the client receives" showed unpublished edits nobody would get.
   */
  published_definition: OnboardingDefinition | null
  has_unpublished_changes: boolean
  reminder_days: number[]
  published_version: number
  is_default: boolean
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface OnboardingClientOption {
  id: string
  workspace_id: string
  name: string
  email: string | null
  contact_person: string | null
  status: string
}

export interface OnboardingAssignableMember {
  id: string
  full_name: string | null
  email: string
}

export interface OnboardingInstanceSummary {
  id: string
  workspace_id: string
  client_id: string
  template_version_id: string
  template_id: string
  template_name: string
  template_version: number
  client_name: string
  recipient_name: string
  recipient_email: string
  status: OnboardingStatus
  capability_generation: number
  capability_expires_at: string
  current_revision: number
  created_at: string
  updated_at: string
  invited_at: string
  viewed_at: string | null
  started_at: string | null
  submitted_at: string | null
  changes_requested_at: string | null
  approved_at: string | null
  revoked_at: string | null
  archived_at: string | null
  progress_section: number
  draft_lock_version: number
  open_comment_count: number
  profile_status: 'pending' | 'generated' | 'failed' | 'edited' | 'approved' | null
  /**
   * Outcome of the most recent invitation or change-request email, read from
   * the delivery record the send actually wrote. Null when no send has been
   * attempted or the record is unavailable. invited_at alone cannot answer
   * "did the email leave" — it is stamped either way.
   */
  delivery?: {
    kind: string
    status: 'sent' | 'failed' | 'skipped' | 'pending' | string
    last_error: string | null
    attempted_at: string | null
    sent_at: string | null
  } | null
  experience_title?: string
  experience_body?: string
  experience_completion_message?: string
  accent_color?: string
  experience_logo_path?: string | null
}

export interface OnboardingComment {
  id: string
  revision: number
  question_id: string
  body: string
  status: 'open' | 'resolved'
  created_at: string
  resolved_at: string | null
}

export interface OnboardingAsset {
  id: string
  question_id: string
  original_name: string
  mime_type: string
  byte_size: number
  uploaded_at: string
  signed_url: string | null
}

export interface PitchProfile {
  professional_bio: string
  positioning_summary: string
  expertise: string[]
  key_messages: string[]
  story_angles: string[]
  talking_points: string[]
  ideal_audience: string
  suggested_show_fit: string[]
}

export const emptyPitchProfile: PitchProfile = {
  professional_bio: '',
  positioning_summary: '',
  expertise: [],
  key_messages: [],
  story_angles: [],
  talking_points: [],
  ideal_audience: '',
  suggested_show_fit: [],
}

export interface OnboardingProfileDraft {
  revision: number
  status: 'pending' | 'generated' | 'failed' | 'edited' | 'approved'
  content: PitchProfile | Record<string, never>
  generation_error: string | null
  generated_at: string | null
  updated_at: string
}

export interface OnboardingRevision {
  id: string
  revision: number
  answers: Record<string, unknown>
  submitted_at: string
}

export interface OnboardingInstanceDetail extends OnboardingInstanceSummary {
  definition: OnboardingDefinition
  answers: Record<string, unknown>
  revisions: OnboardingRevision[]
  comments: OnboardingComment[]
  profile: OnboardingProfileDraft | null
  assets: OnboardingAsset[]
  assigned_membership_ids: string[]
}

export interface WorkspaceOnboardingData {
  workspace: {
    id: string
    name: string
    logo_path: string | null
    logo_updated_at: string | null
  }
  viewer_role: 'owner' | 'admin' | 'member' | 'platform_admin'
  can_manage: boolean
  templates: OnboardingTemplate[]
  clients: OnboardingClientOption[]
  assignable_members: OnboardingAssignableMember[]
  instances: OnboardingInstanceSummary[]
}

export interface OnboardingInvitationResult {
  instance: OnboardingInstanceDetail
  onboarding_url: string
  delivery: { status: 'sent' | 'failed' | 'skipped' }
}

export interface ClientOnboardingView {
  id: string
  workspace: { name: string; logo_url: string | null }
  accent_color: string
  recipient_name?: string
  status: OnboardingStatus
  expires_at: string
  current_revision: number
  definition?: OnboardingDefinition
  completion_message?: string
  answers: Record<string, unknown>
  current_section?: number
  lock_version?: number
  comments: Array<Omit<OnboardingComment, 'status' | 'resolved_at'>>
  assets: OnboardingAsset[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function record(value: unknown, message = 'The onboarding response was invalid.'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('The onboarding response was invalid.')
  return value.toLowerCase()
}

function stringValue(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string') throw new Error('The onboarding response was invalid.')
  return value
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('The onboarding response was invalid.')
  return value
}

function definitionValue(value: unknown): OnboardingDefinition {
  const source = record(value)
  if (source.schema_version !== 1 || !Array.isArray(source.sections) || source.sections.length < 1 || source.sections.length > 12) {
    throw new Error('The onboarding form definition was invalid.')
  }
  return source as unknown as OnboardingDefinition
}

function templateValue(value: unknown, workspaceId: string): OnboardingTemplate {
  const source = record(value)
  if (uuid(source.workspace_id) !== workspaceId || !['draft', 'published', 'archived'].includes(String(source.status))) {
    throw new Error('The onboarding template response did not match the workspace.')
  }
  return {
    ...(source as unknown as OnboardingTemplate),
    id: uuid(source.id),
    workspace_id: workspaceId,
    definition: definitionValue(source.definition),
    published_definition: source.published_definition ? definitionValue(source.published_definition) : null,
    has_unpublished_changes: source.has_unpublished_changes === true,
    reminder_days: Array.isArray(source.reminder_days) ? source.reminder_days.map(numberValue) : [],
  }
}

function summaryValue(value: unknown, workspaceId: string): OnboardingInstanceSummary {
  const source = record(value)
  if (uuid(source.workspace_id) !== workspaceId || ![
    'invited',
    'in_progress',
    'submitted',
    'changes_requested',
    'approved',
    'expired',
    'revoked',
  ].includes(String(source.status))) {
    throw new Error('The onboarding response did not match the workspace.')
  }
  return {
    ...(source as unknown as OnboardingInstanceSummary),
    id: uuid(source.id),
    workspace_id: workspaceId,
    client_id: uuid(source.client_id),
    template_id: uuid(source.template_id),
    template_version_id: uuid(source.template_version_id),
    delivery: source.delivery && typeof source.delivery === 'object'
      ? {
        kind: String((source.delivery as Record<string, unknown>).kind ?? ''),
        status: String((source.delivery as Record<string, unknown>).status ?? ''),
        last_error: typeof (source.delivery as Record<string, unknown>).last_error === 'string'
          ? String((source.delivery as Record<string, unknown>).last_error)
          : null,
        attempted_at: typeof (source.delivery as Record<string, unknown>).attempted_at === 'string'
          ? String((source.delivery as Record<string, unknown>).attempted_at)
          : null,
        sent_at: typeof (source.delivery as Record<string, unknown>).sent_at === 'string'
          ? String((source.delivery as Record<string, unknown>).sent_at)
          : null,
      }
      : null,
  }
}

function detailValue(value: unknown, workspaceId: string): OnboardingInstanceDetail {
  const source = record(value)
  const summary = summaryValue(source, workspaceId)
  if (!Array.isArray(source.revisions) || !Array.isArray(source.comments) || !Array.isArray(source.assets)) {
    throw new Error('The onboarding detail response was invalid.')
  }
  return {
    ...summary,
    definition: definitionValue(source.definition),
    answers: record(source.answers),
    revisions: source.revisions as OnboardingRevision[],
    comments: source.comments as OnboardingComment[],
    profile: source.profile === null ? null : source.profile as OnboardingProfileDraft,
    assets: source.assets as OnboardingAsset[],
    assigned_membership_ids: Array.isArray(source.assigned_membership_ids)
      ? source.assigned_membership_ids.map(uuid)
      : [],
  }
}

async function staffInvoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('workspace-onboarding', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

export async function listWorkspaceOnboarding(workspaceId: string): Promise<WorkspaceOnboardingData> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({ action: 'list', workspace_id: canonicalWorkspaceId }, 'Onboarding could not be loaded.'))
  const workspace = record(data.workspace)
  if (uuid(workspace.id) !== canonicalWorkspaceId || !Array.isArray(data.instances) || !Array.isArray(data.templates)) {
    throw new Error('The onboarding response did not match the selected workspace.')
  }
  return {
    workspace: {
      id: canonicalWorkspaceId,
      name: stringValue(workspace.name) as string,
      logo_path: stringValue(workspace.logo_path, true),
      logo_updated_at: stringValue(workspace.logo_updated_at, true),
    },
    viewer_role: data.viewer_role as WorkspaceOnboardingData['viewer_role'],
    can_manage: data.can_manage === true,
    templates: data.templates.map((template) => templateValue(template, canonicalWorkspaceId)),
    clients: Array.isArray(data.clients) ? data.clients as OnboardingClientOption[] : [],
    assignable_members: Array.isArray(data.assignable_members)
      ? data.assignable_members as OnboardingAssignableMember[]
      : [],
    instances: data.instances.map((instance) => summaryValue(instance, canonicalWorkspaceId)),
  }
}

export async function getWorkspaceOnboardingDetail(
  workspaceId: string,
  instanceId: string,
): Promise<OnboardingInstanceDetail> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({
    action: 'detail',
    workspace_id: canonicalWorkspaceId,
    instance_id: uuid(instanceId),
  }, 'Onboarding details could not be loaded.'))
  return detailValue(data.instance, canonicalWorkspaceId)
}

export async function saveOnboardingTemplate(
  workspaceId: string,
  input: Pick<OnboardingTemplate, 'name' | 'description' | 'definition' | 'reminder_days'>,
  templateId?: string,
): Promise<OnboardingTemplate> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({
    action: templateId ? 'template_update' : 'template_create',
    workspace_id: canonicalWorkspaceId,
    ...(templateId ? { template_id: uuid(templateId) } : {}),
    template: input,
  }, 'The onboarding template could not be saved.'))
  return templateValue(data.template, canonicalWorkspaceId)
}

export async function publishOnboardingTemplate(
  workspaceId: string,
  templateId: string,
  makeDefault: boolean,
): Promise<OnboardingTemplate> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({
    action: 'template_publish',
    workspace_id: canonicalWorkspaceId,
    template_id: uuid(templateId),
    make_default: makeDefault,
  }, 'The onboarding template could not be published.'))
  return templateValue(data.template, canonicalWorkspaceId)
}

export async function duplicateOnboardingTemplate(
  workspaceId: string,
  templateId: string,
  name: string,
): Promise<OnboardingTemplate> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({
    action: 'template_duplicate',
    workspace_id: canonicalWorkspaceId,
    template_id: uuid(templateId),
    name,
  }, 'The onboarding template could not be duplicated.'))
  return templateValue(data.template, canonicalWorkspaceId)
}

export async function setDefaultOnboardingTemplate(workspaceId: string, templateId: string): Promise<void> {
  await staffInvoke({
    action: 'template_set_default',
    workspace_id: uuid(workspaceId),
    template_id: uuid(templateId),
  }, 'The default onboarding template could not be changed.')
}

export async function archiveOnboardingTemplate(workspaceId: string, templateId: string): Promise<void> {
  await staffInvoke({
    action: 'template_archive',
    workspace_id: uuid(workspaceId),
    template_id: uuid(templateId),
  }, 'The onboarding template could not be archived.')
}

export interface StartOnboardingInput {
  template_id: string
  client_id?: string | null
  new_client?: { name: string; email: string; contact_person?: string } | null
  recipient_name: string
  recipient_email: string
  expires_in_days: number
  assigned_membership_ids: string[]
  send_email?: boolean
  experience: {
    intro_title: string
    intro_body: string
    completion_message: string
    accent_color: string
    logo_file?: File | null
  }
}

export async function startWorkspaceOnboarding(
  workspaceId: string,
  input: StartOnboardingInput,
): Promise<OnboardingInvitationResult> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const { experience, send_email, ...invitation } = input
  const logoFile = experience.logo_file
  if (logoFile && (
    !['image/jpeg', 'image/png', 'image/webp'].includes(logoFile.type)
    || logoFile.size < 1
    || logoFile.size > 2_097_152
  )) {
    throw new Error('The client logo must be a PNG, JPEG, or WebP image up to 2 MB.')
  }
  const data = record(await staffInvoke<unknown>({
    action: 'start',
    workspace_id: canonicalWorkspaceId,
    ...invitation,
    send_email: send_email === true,
    experience: {
      intro_title: experience.intro_title,
      intro_body: experience.intro_body,
      completion_message: experience.completion_message,
      accent_color: experience.accent_color,
      brand_logo: logoFile ? {
        filename: logoFile.name,
        mime_type: logoFile.type,
        file_base64: await fileBase64(logoFile),
      } : null,
    },
  }, 'The onboarding invitation could not be created.'))
  return {
    instance: detailValue(data.instance, canonicalWorkspaceId),
    onboarding_url: stringValue(data.onboarding_url) as string,
    delivery: record(data.delivery) as OnboardingInvitationResult['delivery'],
  }
}

async function instanceAction(
  workspaceId: string,
  instanceId: string,
  action: string,
  extra: Record<string, unknown> = {},
): Promise<{
  instance?: OnboardingInstanceDetail
  onboarding_url?: string
  delivery?: OnboardingInvitationResult['delivery']
  purged?: boolean
}> {
  const canonicalWorkspaceId = uuid(workspaceId)
  const data = record(await staffInvoke<unknown>({
    action,
    workspace_id: canonicalWorkspaceId,
    instance_id: uuid(instanceId),
    ...extra,
  }, 'The onboarding action could not be completed.'))
  return {
    ...(data.instance ? { instance: detailValue(data.instance, canonicalWorkspaceId) } : {}),
    ...(typeof data.onboarding_url === 'string' ? { onboarding_url: data.onboarding_url } : {}),
    ...(data.delivery ? { delivery: record(data.delivery) as OnboardingInvitationResult['delivery'] } : {}),
    ...(data.purged === true ? { purged: true } : {}),
  }
}

export const requestOnboardingChanges = (
  workspaceId: string,
  instanceId: string,
  comments: Array<{ question_id: string; body: string }>,
) => instanceAction(workspaceId, instanceId, 'request_changes', { comments })

export const updateOnboardingProfile = (
  workspaceId: string,
  instanceId: string,
  profile: PitchProfile,
) => instanceAction(workspaceId, instanceId, 'update_profile', { profile })

export const approveOnboarding = (
  workspaceId: string,
  instanceId: string,
  profile: PitchProfile,
) => instanceAction(workspaceId, instanceId, 'approve', { profile })

export const approveOnboardingAnswers = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'approve_answers')

export const retryOnboardingAi = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'retry_ai')

export const rotateOnboardingLink = (
  workspaceId: string,
  instanceId: string,
  expiresInDays: number,
) => instanceAction(workspaceId, instanceId, 'rotate', {
  expires_in_days: expiresInDays,
  send_email: false,
})

export const getOnboardingLink = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'get_link')

export const extendOnboardingLink = (
  workspaceId: string,
  instanceId: string,
  extensionDays: number,
) => instanceAction(workspaceId, instanceId, 'extend', { extension_days: extensionDays })

export const revokeOnboardingLink = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'revoke')

export const archiveOnboardingInstance = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'archive')

export const updateOnboardingAssignments = (
  workspaceId: string,
  instanceId: string,
  assignedMembershipIds: string[],
) => instanceAction(workspaceId, instanceId, 'update_assignments', {
  assigned_membership_ids: assignedMembershipIds,
})

export const purgeOnboardingInstance = (workspaceId: string, instanceId: string) =>
  instanceAction(workspaceId, instanceId, 'purge', { confirmation: 'PURGE' })

async function clientInvoke<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  // The hostname the client opened their link on, so the server can refuse an
  // onboarding belonging to a different workspace than the domain serving it.
  const { data, error } = await supabase.functions.invoke('client-onboarding', {
    body: { ...body, hostname: currentHostname() },
  })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

function clientViewValue(value: unknown): ClientOnboardingView {
  const source = record(value)
  const workspace = record(source.workspace)
  if (!['invited', 'in_progress', 'submitted', 'changes_requested', 'approved', 'expired', 'revoked'].includes(String(source.status))) {
    throw new Error('The onboarding response was invalid.')
  }
  return {
    ...(source as unknown as ClientOnboardingView),
    id: uuid(source.id),
    workspace: {
      name: stringValue(workspace.name) as string,
      logo_url: stringValue(workspace.logo_url, true),
    },
    accent_color: typeof source.accent_color === 'string' && /^#[0-9a-f]{6}$/iu.test(source.accent_color)
      ? source.accent_color.toUpperCase()
      : '#665CF2',
    status: source.status as OnboardingStatus,
    answers: record(source.answers),
    comments: Array.isArray(source.comments) ? source.comments as ClientOnboardingView['comments'] : [],
    assets: Array.isArray(source.assets) ? source.assets as OnboardingAsset[] : [],
    ...(source.definition ? { definition: definitionValue(source.definition) } : {}),
  }
}

export async function getClientOnboarding(token: string, staffPreview = false): Promise<ClientOnboardingView> {
  // staffPreview keeps the load from stamping viewed_at — the team reads that
  // timestamp as client activity, and an operator checking the form before
  // sharing the link should not spend it.
  const data = record(await clientInvoke<unknown>({
    action: 'get',
    token,
    ...(staffPreview ? { staff_preview: true } : {}),
  }, 'This onboarding could not be loaded.'))
  return clientViewValue(data.onboarding)
}

export async function saveClientOnboarding(
  token: string,
  answers: Record<string, unknown>,
  currentSection: number,
  expectedLockVersion: number,
): Promise<ClientOnboardingView> {
  const data = record(await clientInvoke<unknown>({
    action: 'save',
    token,
    answers,
    current_section: currentSection,
    expected_lock_version: expectedLockVersion,
  }, 'Your progress could not be saved.'))
  return clientViewValue(data.onboarding)
}

export async function submitClientOnboarding(token: string, expectedLockVersion: number): Promise<ClientOnboardingView> {
  const data = record(await clientInvoke<unknown>({
    action: 'submit',
    token,
    expected_lock_version: expectedLockVersion,
  }, 'Your onboarding could not be submitted.'))
  return clientViewValue(data.onboarding)
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const marker = value.indexOf(',')
      if (marker < 0) reject(new Error('The file could not be read.'))
      else resolve(value.slice(marker + 1))
    }
    reader.readAsDataURL(file)
  })
}

export async function uploadClientOnboardingAsset(
  token: string,
  questionId: string,
  file: File,
  expectedLockVersion: number,
): Promise<ClientOnboardingView> {
  const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
  const maxBytes = imageTypes.has(file.type)
    ? 5_242_880
    : file.type === 'application/pdf'
      ? 10_485_760
      : 0
  if (file.size < 1 || maxBytes === 0 || file.size > maxBytes) {
    throw new Error(imageTypes.has(file.type)
      ? 'Images must be 5 MB or smaller.'
      : file.type === 'application/pdf'
        ? 'PDFs must be 10 MB or smaller.'
        : 'Upload a PNG, JPEG, WebP, or PDF file.')
  }
  const data = record(await clientInvoke<unknown>({
    action: 'upload',
    token,
    question_id: questionId,
    filename: file.name,
    mime_type: file.type,
    file_base64: await fileBase64(file),
    expected_lock_version: expectedLockVersion,
  }, 'The file could not be uploaded.'))
  return clientViewValue(data.onboarding)
}

export async function deleteClientOnboardingAsset(
  token: string,
  assetId: string,
  expectedLockVersion: number,
): Promise<ClientOnboardingView> {
  const data = record(await clientInvoke<unknown>({
    action: 'delete_upload',
    token,
    asset_id: uuid(assetId),
    expected_lock_version: expectedLockVersion,
  }, 'The file could not be removed.'))
  return clientViewValue(data.onboarding)
}
