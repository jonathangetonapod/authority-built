import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  normalizeEmail,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  workspaceCredentialIsFresh,
} from '../_shared/workspaceAuth.ts'
import {
  createOnboardingCapability,
  generatePitchProfile,
  onboardingUrl,
  sendOnboardingEmail,
  validateOnboardingDefinition,
  validatePitchProfile,
} from '../_shared/workspaceOnboarding.ts'

const METHODS = ['POST'] as const
const BUCKET = 'workspace-onboarding-assets'
const BRAND_LOGO_MAX_BYTES = 2_097_152
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type AdminClient = Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin']

function capabilitySecret(): string {
  const value = Deno.env.get('ONBOARDING_CAPABILITY_SECRET')?.trim()
  if (!value || value.length < 32) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Onboarding capabilities are not configured')
  }
  return value
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a boolean`)
  }
  return value
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

function optionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireUuid(value, field)
}

function uuidArray(value: unknown, field: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an array of at most ${max} UUIDs`)
  }
  const result = value.map((entry, index) => requireUuid(entry, `${field}[${index}]`))
  if (new Set(result).size !== result.length) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must not contain duplicates`)
  }
  return result
}

function responseRecord(value: unknown, label = 'response'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${label} was invalid`)
  }
  return value as Record<string, unknown>
}

function requestRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function responseString(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${field} was invalid`)
  }
  return value
}

function ensureWorkspaceResponse(value: unknown, workspaceId: string): Record<string, unknown> {
  const result = responseRecord(value)
  if (result.workspace_id !== workspaceId || !UUID_PATTERN.test(responseString(result.id, 'id', 64))) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding response did not match the workspace')
  }
  return result
}

function templatePayload(value: unknown): Record<string, unknown> {
  const input = requestRecord(value, 'template')
  requireOnlyKeys(input, ['name', 'description', 'definition', 'reminder_days'])
  return {
    name: requireString(input.name, 'name', { max: 120 }),
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 1000) : '',
    definition: validateOnboardingDefinition(input.definition),
    reminder_days: [],
  }
}

function decodeBrandLogo(value: unknown): { bytes: Uint8Array; mimeType: string; extension: string } | null {
  if (value === null || value === undefined) return null
  const input = requestRecord(value, 'experience.brand_logo')
  requireOnlyKeys(input, ['filename', 'mime_type', 'file_base64'])
  requireString(input.filename, 'experience.brand_logo.filename', { max: 255 })
  const mimeType = requireString(input.mime_type, 'experience.brand_logo.mime_type', { max: 100 }).toLowerCase()
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : ''
  if (!extension) throw new HttpError(400, 'INVALID_FILE_TYPE', 'The client logo must be a PNG, JPEG, or WebP image')
  if (typeof input.file_base64 !== 'string' || input.file_base64.length < 1 || input.file_base64.length > 2_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(input.file_base64)) {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo could not be read')
  }
  let bytes: Uint8Array
  try {
    const binary = atob(input.file_base64)
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo could not be read')
  }
  const signatureMatches = mimeType === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mimeType === 'image/png'
      ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (bytes.length < 1 || bytes.length > BRAND_LOGO_MAX_BYTES || !signatureMatches) {
    throw new HttpError(400, 'INVALID_FILE', 'The client logo must match its file type and be 2 MB or smaller')
  }
  return { bytes, mimeType, extension }
}

function experiencePayload(value: unknown): {
  introTitle: string
  introBody: string
  completionMessage: string
  accentColor: string
  logo: ReturnType<typeof decodeBrandLogo>
} {
  const input = requestRecord(value, 'experience')
  requireOnlyKeys(input, ['intro_title', 'intro_body', 'completion_message', 'accent_color', 'brand_logo'])
  const accentColor = requireString(input.accent_color, 'experience.accent_color', { max: 7 }).toUpperCase()
  if (!/^#[0-9A-F]{6}$/u.test(accentColor)) {
    throw new HttpError(400, 'INVALID_FIELD', 'experience.accent_color must be a six-digit hex color')
  }
  return {
    introTitle: requireString(input.intro_title, 'experience.intro_title', { max: 300 }),
    introBody: requireString(input.intro_body, 'experience.intro_body', { max: 3000 }),
    completionMessage: requireString(input.completion_message, 'experience.completion_message', { max: 2000 }),
    accentColor,
    logo: decodeBrandLogo(input.brand_logo),
  }
}

function rpcError(error: { code?: string; message?: string }): never {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  if (code === '42501' || message.includes('active workspace') || message.includes('not editable')) {
    throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Active workspace access is required')
  }
  if (code === 'P0002' || message.includes('not found')) {
    throw new HttpError(404, 'ONBOARDING_NOT_FOUND', 'The requested onboarding record was not found')
  }
  if (code === '40001' || message.includes('changed')) {
    throw new HttpError(409, 'ONBOARDING_CHANGED', 'This onboarding changed. Refresh and try again')
  }
  if (code === '23505') {
    throw new HttpError(409, 'ONBOARDING_CONFLICT', 'An onboarding record with these details already exists')
  }
  if (['22023', '22P02', '23503', '23514'].includes(code) || message.includes('invalid')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The onboarding request was invalid')
  }
  throw new HttpError(500, 'ONBOARDING_OPERATION_FAILED', 'The onboarding operation failed')
}

async function addSignedAssetUrls(
  admin: AdminClient,
  value: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!Array.isArray(value.assets)) return value
  const assets = await Promise.all(value.assets.map(async (rawAsset) => {
    const asset = responseRecord(rawAsset, 'asset')
    const path = responseString(asset.storage_path, 'asset path', 500)
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600)
    return {
      ...asset,
      signed_url: error ? null : data.signedUrl,
    }
  }))
  return { ...value, assets }
}

async function listPrivateOnboardingFiles(
  admin: AdminClient,
  workspaceId: string,
  instanceId: string,
): Promise<string[]> {
  const prefix = `${workspaceId}/${instanceId}`
  const paths: string[] = []
  for (let offset = 0; offset < 10_000; offset += 100) {
    const listed = await admin.storage.from(BUCKET).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listed.error) {
      throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files could not be enumerated. No database records were deleted')
    }
    for (const entry of listed.data ?? []) {
      if (!entry.id) continue
      if (!entry.name || entry.name.length > 255 || entry.name.includes('/') || entry.name.includes('\\') || entry.name === '.' || entry.name === '..') {
        throw new HttpError(500, 'INVALID_ONBOARDING_STORAGE_PATH', 'A private onboarding file path was invalid')
      }
      paths.push(`${prefix}/${entry.name}`)
    }
    if ((listed.data?.length ?? 0) < 100) return paths
  }
  throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files exceeded the safe purge limit. No database records were deleted')
}

async function recordDelivery(
  admin: AdminClient,
  instanceId: string,
  delivery: Awaited<ReturnType<typeof sendOnboardingEmail>>,
): Promise<void> {
  await admin.rpc('record_workspace_onboarding_invitation_v1', {
    p_instance_id: instanceId,
    p_status: delivery.status,
    p_provider_message_id: delivery.providerMessageId,
    p_error: delivery.error,
  })
}

async function recordChangeRequestDelivery(
  admin: AdminClient,
  instanceId: string,
  delivery: Awaited<ReturnType<typeof sendOnboardingEmail>>,
): Promise<void> {
  await admin.rpc('record_workspace_onboarding_change_request_v1', {
    p_instance_id: instanceId,
    p_status: delivery.status,
    p_provider_message_id: delivery.providerMessageId,
    p_error: delivery.error,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 3_200_000)
    const action = typeof body.action === 'string' ? body.action : ''
    const context = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(context)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account credentials')
    }
    const { admin, user, tokenIssuedAt } = context
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id'])
      const { data, error } = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const result = responseRecord(data)
      const workspace = responseRecord(result.workspace, 'workspace')
      if (workspace.id !== workspaceId || !Array.isArray(result.instances) || !Array.isArray(result.templates)) {
        throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding response did not match the workspace')
      }
      return jsonResponse(req, METHODS, 200, result)
    }

    if (action === 'detail') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const instanceId = requireUuid(body.instance_id, 'instance_id')
      const { data, error } = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const result = ensureWorkspaceResponse(data, workspaceId)
      return jsonResponse(req, METHODS, 200, { instance: await addSignedAssetUrls(admin, result) })
    }

    if (action === 'get_link') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const instanceId = requireUuid(body.instance_id, 'instance_id')
      const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (listResult.error) rpcError(listResult.error)
      const listResponse = responseRecord(listResult.data, 'workspace list')
      const workspace = responseRecord(listResponse.workspace, 'workspace')
      if (workspace.id !== workspaceId || listResponse.can_manage !== true) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }

      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const instance = ensureWorkspaceResponse(detailResult.data, workspaceId)
      if (!['invited', 'in_progress', 'changes_requested'].includes(String(instance.status))) {
        throw new HttpError(409, 'ONBOARDING_LINK_UNAVAILABLE', 'This onboarding does not have an active client link')
      }

      const generation = integerValue(instance.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      const capabilityCheck = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'get',
        p_instance_id: instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: {},
      })
      if (capabilityCheck.error) {
        const message = (capabilityCheck.error.message ?? '').toLowerCase()
        if (capabilityCheck.error.code === 'P0002' || message.includes('not found')) {
          throw new HttpError(409, 'ONBOARDING_LINK_CHANGED', 'The saved link can no longer be reconstructed. Rotate it once to create a new link')
        }
        rpcError(capabilityCheck.error)
      }

      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, instance),
        onboarding_url: onboardingUrl(capability.token),
      })
    }

    if (action.startsWith('template_')) {
      const templateAction = action.slice('template_'.length)
      let templateId: string | null = null
      let payload: Record<string, unknown> = {}
      if (templateAction === 'create') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template'])
        payload = templatePayload(body.template)
      } else if (templateAction === 'update') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'template'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = templatePayload(body.template)
      } else if (templateAction === 'publish') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'make_default'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = { make_default: booleanValue(body.make_default, 'make_default') }
      } else if (templateAction === 'duplicate') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id', 'name'])
        templateId = requireUuid(body.template_id, 'template_id')
        payload = { name: requireString(body.name, 'name', { max: 120 }) }
      } else if (templateAction === 'set_default' || templateAction === 'archive') {
        requireOnlyKeys(body, ['action', 'workspace_id', 'template_id'])
        templateId = requireUuid(body.template_id, 'template_id')
      } else {
        throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding template action')
      }

      const { data, error } = await admin.rpc('workspace_onboarding_template_operation_v1', {
        p_action: templateAction,
        p_workspace_id: workspaceId,
        p_template_id: templateId,
        p_payload: payload,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      const template = responseRecord(data, 'template')
      if (template.workspace_id !== workspaceId) {
        throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The template response did not match the workspace')
      }
      return jsonResponse(req, METHODS, templateAction === 'create' ? 201 : 200, { template })
    }

    if (action === 'start') {
      requireOnlyKeys(body, [
        'action',
        'workspace_id',
        'template_id',
        'client_id',
        'new_client',
        'recipient_name',
        'recipient_email',
        'expires_in_days',
        'assigned_membership_ids',
        'send_email',
        'experience',
      ])
      const templateId = requireUuid(body.template_id, 'template_id')
      const clientId = optionalUuid(body.client_id, 'client_id')
      const recipientName = requireString(body.recipient_name, 'recipient_name', { max: 200 })
      const recipientEmail = requireEmail(body.recipient_email)
      const expiresInDays = integerValue(body.expires_in_days, 'expires_in_days', 1, 90)
      const assignedIds = uuidArray(body.assigned_membership_ids ?? [], 'assigned_membership_ids')
      const sendEmail = booleanValue(body.send_email, 'send_email')
      const experience = experiencePayload(body.experience)
      let newClient: Record<string, unknown> | null = null
      if (!clientId) {
        const source = requestRecord(body.new_client, 'new_client')
        requireOnlyKeys(source, ['name', 'email', 'contact_person'])
        const email = requireEmail(source.email)
        if (email !== recipientEmail) {
          throw new HttpError(400, 'INVALID_FIELD', 'new client email must match the invited email')
        }
        newClient = {
          name: requireString(source.name, 'new_client.name', { max: 200 }),
          email,
          contact_person: typeof source.contact_person === 'string' ? source.contact_person.trim().slice(0, 200) : '',
        }
      } else if (body.new_client !== null && body.new_client !== undefined) {
        throw new HttpError(400, 'INVALID_FIELD', 'new_client must be empty when an existing client is selected')
      }

      const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (listResult.error) rpcError(listResult.error)
      const listResponse = responseRecord(listResult.data, 'workspace list')
      const workspace = responseRecord(listResponse.workspace, 'workspace')
      if (workspace.id !== workspaceId || listResponse.can_manage !== true) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
      const instanceId = crypto.randomUUID()
      const generation = 1
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      const brandLogoPath = experience.logo
        ? `${workspaceId}/${instanceId}/brand-${crypto.randomUUID()}.${experience.logo.extension}`
        : null
      if (brandLogoPath && experience.logo) {
        const uploaded = await admin.storage.from(BUCKET).upload(brandLogoPath, experience.logo.bytes, {
          contentType: experience.logo.mimeType,
          upsert: false,
          cacheControl: '3600',
        })
        if (uploaded.error) throw new HttpError(503, 'ONBOARDING_LOGO_UPLOAD_FAILED', 'The client logo could not be uploaded')
      }
      const { data, error } = await admin.rpc('workspace_onboarding_start_v1', {
        p_workspace_id: workspaceId,
        p_template_id: templateId,
        p_client_id: clientId,
        p_payload: {
          instance_id: instanceId,
          capability_generation: generation,
          capability_hash: capability.verifierHash,
          capability_expires_at: expiresAt,
          recipient_name: recipientName,
          recipient_email: recipientEmail,
          new_client: newClient,
          assigned_membership_ids: assignedIds,
          experience: {
            intro_title: experience.introTitle,
            intro_body: experience.introBody,
            completion_message: experience.completionMessage,
            accent_color: experience.accentColor,
            logo_path: brandLogoPath,
          },
        },
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) {
        if (brandLogoPath) await admin.storage.from(BUCKET).remove([brandLogoPath])
        rpcError(error)
      }
      const instance = ensureWorkspaceResponse(data, workspaceId)
      const link = onboardingUrl(capability.token)
      const delivery = sendEmail
        ? await sendOnboardingEmail({
          kind: 'invitation',
          workspaceName: typeof workspace.name === 'string' ? workspace.name : 'Your agency',
          recipientName,
          recipientEmail,
          url: link,
          expiresAt,
          accentColor: experience.accentColor ?? undefined,
        })
        : { status: 'skipped' as const, providerMessageId: null, error: null }
      await recordDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 201, {
        instance,
        onboarding_url: link,
        delivery: { status: delivery.status },
      })
    }

    const instanceId = requireUuid(body.instance_id, 'instance_id')

    if (action === 'retry_ai') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      if (detail.status !== 'submitted' || typeof detail.current_revision !== 'number') {
        throw new HttpError(400, 'INVALID_STATE', 'Only a submitted onboarding can generate a pitch profile')
      }
      const definition = validateOnboardingDefinition(detail.definition)
      const answers = responseRecord(detail.answers, 'answers')
      try {
        const profile = await generatePitchProfile(definition, answers)
        const stored = await admin.rpc('set_workspace_onboarding_ai_profile_v1', {
          p_instance_id: instanceId,
          p_revision: detail.current_revision,
          p_status: 'generated',
          p_content: profile,
          p_error: null,
        })
        if (stored.error || stored.data !== true) {
          throw new HttpError(409, 'ONBOARDING_CHANGED', 'The submission changed before its AI draft was ready')
        }
      } catch (error) {
        if (error instanceof HttpError) throw error
        await admin.rpc('set_workspace_onboarding_ai_profile_v1', {
          p_instance_id: instanceId,
          p_revision: detail.current_revision,
          p_status: 'failed',
          p_content: {},
          p_error: 'AI draft unavailable. Try again or write the profile manually.',
        })
        throw new HttpError(503, 'AI_DRAFT_UNAVAILABLE', 'The AI draft is unavailable. Try again later')
      }
      const refreshed = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (refreshed.error) rpcError(refreshed.error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(refreshed.data, workspaceId)),
      })
    }

    if (action === 'approve') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'profile'])
      const profile = validatePitchProfile(body.profile)
      const { data, error } = await admin.rpc('workspace_onboarding_approve_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_profile: profile,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId)),
      })
    }

    if (action === 'approve_answers') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
      const { data, error } = await admin.rpc('workspace_onboarding_approve_answers_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) rpcError(error)
      return jsonResponse(req, METHODS, 200, {
        instance: await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId)),
      })
    }

    const operation = action
    let payload: Record<string, unknown> = {}
    let link: string | null = null
    if (action === 'request_changes') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'comments'])
      if (!Array.isArray(body.comments) || body.comments.length < 1 || body.comments.length > 100) {
        throw new HttpError(400, 'INVALID_FIELD', 'comments must contain between 1 and 100 review notes')
      }
      payload.comments = body.comments.map((rawComment, index) => {
        const comment = requestRecord(rawComment, `comments[${index}]`)
        requireOnlyKeys(comment, ['question_id', 'body'])
        return {
          question_id: requireString(comment.question_id, `comments[${index}].question_id`, { max: 64 }),
          body: requireString(comment.body, `comments[${index}].body`, { max: 2000 }),
        }
      })
    } else if (action === 'update_profile') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'profile'])
      payload.profile = validatePitchProfile(body.profile)
    } else if (action === 'update_assignments') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'assigned_membership_ids'])
      payload.assigned_membership_ids = uuidArray(body.assigned_membership_ids, 'assigned_membership_ids')
    } else if (action === 'rotate') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'expires_in_days', 'send_email'])
      const expiresInDays = integerValue(body.expires_in_days, 'expires_in_days', 1, 90)
      booleanValue(body.send_email, 'send_email')
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      const currentGeneration = integerValue(detail.capability_generation, 'capability generation', 1, 2_147_483_646)
      const nextGeneration = currentGeneration + 1
      const capability = await createOnboardingCapability(instanceId, nextGeneration, capabilitySecret())
      const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      payload = {
        capability_generation: nextGeneration,
        capability_hash: capability.verifierHash,
        capability_expires_at: expiresAt,
      }
      link = onboardingUrl(capability.token)
    } else if (action === 'extend') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'extension_days'])
      const extensionDays = integerValue(body.extension_days, 'extension_days', 1, 89)
      const detailResult = await admin.rpc('workspace_onboarding_staff_detail_v1', {
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (detailResult.error) rpcError(detailResult.error)
      const detail = ensureWorkspaceResponse(detailResult.data, workspaceId)
      const currentExpiry = new Date(responseString(detail.capability_expires_at, 'capability expiry', 64)).valueOf()
      const nextExpiry = new Date(currentExpiry + extensionDays * 86_400_000)
      if (!Number.isFinite(currentExpiry) || nextExpiry.valueOf() > Date.now() + 90 * 86_400_000) {
        throw new HttpError(400, 'INVALID_FIELD', 'The extended expiry cannot be more than 90 days from now')
      }
      payload.capability_expires_at = nextExpiry.toISOString()
      const generation = integerValue(detail.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      link = onboardingUrl(capability.token)
    } else if (action === 'revoke' || action === 'archive') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id'])
    } else if (action === 'purge') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'instance_id', 'confirmation'])
      if (body.confirmation !== 'PURGE') {
        throw new HttpError(400, 'PURGE_CONFIRMATION_REQUIRED', 'Type PURGE to permanently delete onboarding data')
      }
      payload.confirmation = 'PURGE'
    } else {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding action')
    }

    if (action === 'purge') {
      const preview = await admin.rpc('workspace_onboarding_instance_operation_v1', {
        p_action: 'purge_paths',
        p_workspace_id: workspaceId,
        p_instance_id: instanceId,
        p_payload: payload,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (preview.error) rpcError(preview.error)
      const previewResult = responseRecord(preview.data, 'purge preview')
      const paths = Array.isArray(previewResult.storage_paths)
        ? previewResult.storage_paths.filter((path): path is string => typeof path === 'string')
        : []
      const storedPaths = await listPrivateOnboardingFiles(admin, workspaceId, instanceId)
      const purgePaths = [...new Set([...paths, ...storedPaths])]
      for (let offset = 0; offset < purgePaths.length; offset += 100) {
        const removal = await admin.storage.from(BUCKET).remove(purgePaths.slice(offset, offset + 100))
        if (removal.error) {
          throw new HttpError(503, 'ONBOARDING_STORAGE_PURGE_FAILED', 'Private onboarding files could not be purged. No database records were deleted')
        }
      }
    }

    const { data, error } = await admin.rpc('workspace_onboarding_instance_operation_v1', {
      p_action: operation,
      p_workspace_id: workspaceId,
      p_instance_id: instanceId,
      p_payload: payload,
      p_actor_user_id: user.id,
      p_token_issued_at: tokenIssuedAt,
    })
    if (error) rpcError(error)

    if (action === 'purge') {
      responseRecord(data, 'purge response')
      return jsonResponse(req, METHODS, 200, {
        purged: true,
        storage_cleanup_complete: true,
        client_record_retained: true,
      })
    }

    const instance = await addSignedAssetUrls(admin, ensureWorkspaceResponse(data, workspaceId))
    if (action === 'request_changes') {
      const generation = integerValue(instance.capability_generation, 'capability generation', 1, 2_147_483_646)
      const capability = await createOnboardingCapability(instanceId, generation, capabilitySecret())
      link = onboardingUrl(capability.token)
      const listResult = await admin.rpc('workspace_onboarding_staff_list_v1', {
        p_workspace_id: workspaceId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (listResult.error) rpcError(listResult.error)
      const workspace = responseRecord(responseRecord(listResult.data).workspace, 'workspace')
      const delivery = await sendOnboardingEmail({
        kind: 'changes_requested',
        workspaceName: responseString(workspace.name, 'workspace name', 200),
        recipientName: responseString(instance.recipient_name, 'recipient name', 200),
        recipientEmail: normalizeEmail(responseString(instance.recipient_email, 'recipient email', 254)),
        url: link,
        expiresAt: responseString(instance.capability_expires_at, 'capability expiry', 64),
        accentColor: responseString(instance.accent_color, 'accent color', 7),
      })
      await recordChangeRequestDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 200, {
        instance,
        onboarding_url: link,
        delivery: { status: delivery.status },
      })
    }
    if (action === 'rotate' && link) {
      const delivery = { status: 'skipped' as const, providerMessageId: null, error: null }
      await recordDelivery(admin, instanceId, delivery)
      return jsonResponse(req, METHODS, 200, {
        instance,
        onboarding_url: link,
        delivery: { status: delivery.status },
      })
    }
    return jsonResponse(req, METHODS, 200, {
      instance,
      ...(link ? { onboarding_url: link } : {}),
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
