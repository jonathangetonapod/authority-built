import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requireString,
  requireUuid,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'
import { requestHostname, requireServedByHost, resolveHostWorkspaceId } from '../_shared/workspaceDomain.ts'
import { logOperationCost } from '../_shared/billing.ts'
import { resolveAiKey } from '../_shared/workspaceAiKeys.ts'
import {
  generatePitchProfile,
  type OnboardingAssetReference,
  type OnboardingQuestion,
  validateOnboardingAnswers,
  validateOnboardingDefinition,
  verifyOnboardingCapability,
} from '../_shared/workspaceOnboarding.ts'

const METHODS = ['POST'] as const
const BUCKET = 'workspace-onboarding-assets'
const MAX_BODY_BYTES = 15_000_000
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function capabilitySecret(): string {
  const value = Deno.env.get('ONBOARDING_CAPABILITY_SECRET')?.trim()
  if (!value || value.length < 32) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'Onboarding capabilities are not configured')
  }
  return value
}

function responseRecord(value: unknown, label = 'response'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${label} was invalid`)
  }
  return value as Record<string, unknown>
}

function responseString(value: unknown, field: string, max = 10_000): string {
  if (typeof value !== 'string' || !value || value.length > max) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', `The onboarding ${field} was invalid`)
  }
  return value
}

function integerValue(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

function clientRpcError(error: { code?: string; message?: string }): never {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  if (code === 'P0002' || message.includes('not found')) {
    throw new HttpError(404, 'ONBOARDING_NOT_FOUND', 'This onboarding link is invalid or unavailable')
  }
  if (code === '40001' || message.includes('changed')) {
    throw new HttpError(409, 'ONBOARDING_CHANGED', 'Your onboarding changed in another tab. Refresh before continuing')
  }
  if (code === '42501' || message.includes('not editable')) {
    throw new HttpError(410, 'ONBOARDING_UNAVAILABLE', 'This onboarding is no longer editable')
  }
  if (code === '23505') {
    throw new HttpError(409, 'UPLOAD_EXISTS', 'Remove the existing file before uploading a replacement')
  }
  if (['22023', '22P02', '23503', '23514'].includes(code) || message.includes('invalid')) {
    throw new HttpError(400, 'INVALID_REQUEST', 'The onboarding request was invalid')
  }
  throw new HttpError(500, 'ONBOARDING_OPERATION_FAILED', 'The onboarding operation failed')
}

function assetReferences(value: unknown): OnboardingAssetReference[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding assets were invalid')
  }
  return value.map((rawAsset) => {
    const asset = responseRecord(rawAsset, 'asset')
    return {
      id: requireUuid(asset.id, 'asset.id'),
      question_id: requireString(asset.question_id, 'asset.question_id', { max: 64 }),
      mime_type: responseString(asset.mime_type, 'asset mime type', 100),
    }
  })
}

function logoUrl(path: unknown): string | null {
  if (path === null) return null
  if (typeof path !== 'string' || path.length > 500 || path.includes('..')) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The workspace logo was invalid')
  }
  const base = Deno.env.get('SUPABASE_URL')?.trim()
  if (!base) return null
  return `${base.replace(/\/$/u, '')}/storage/v1/object/public/workspace-logos/${path.split('/').map(encodeURIComponent).join('/')}`
}

async function presentClientBrand(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  value: unknown,
): Promise<{
  result: Record<string, unknown>
  workspace: { name: string; logo_url: string | null }
  accent_color: string
}> {
  const result = responseRecord(value)
  if (result.id !== instanceId) {
    throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The onboarding response did not match the link')
  }
  const workspace = responseRecord(result.workspace, 'workspace')
  const accentColor = typeof result.accent_color === 'string' && /^#[0-9A-F]{6}$/u.test(result.accent_color)
    ? result.accent_color
    : '#665CF2'
  let presentedLogoUrl = logoUrl(workspace.logo_path)
  if (result.experience_logo_path !== null && result.experience_logo_path !== undefined) {
    const experienceLogoPath = responseString(result.experience_logo_path, 'experience logo path', 500)
    const expectedPath = new RegExp(`^[0-9a-f-]{36}/${instanceId}/brand-[0-9a-f-]{36}\\.(?:png|jpg|webp)$`, 'u')
    if (!expectedPath.test(experienceLogoPath) || experienceLogoPath.includes('..')) {
      throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'The client logo was invalid')
    }
    const signedLogo = await admin.storage.from(BUCKET).createSignedUrl(experienceLogoPath, 3600)
    if (!signedLogo.error) presentedLogoUrl = signedLogo.data.signedUrl
  }
  return {
    result,
    workspace: {
      name: responseString(workspace.name, 'workspace name', 200),
      logo_url: presentedLogoUrl,
    },
    accent_color: accentColor,
  }
}

async function presentClientView(
  admin: ReturnType<typeof createAdminClient>,
  instanceId: string,
  value: unknown,
): Promise<Record<string, unknown>> {
  const brand = await presentClientBrand(admin, instanceId, value)
  const result = brand.result
  const status = responseString(result.status, 'status', 32)
  if (['expired', 'revoked', 'approved', 'submitted'].includes(status)) {
    let completionMessage = ''
    if (result.definition && typeof result.definition === 'object' && !Array.isArray(result.definition)) {
      const value = (result.definition as Record<string, unknown>).completion_message
      if (typeof value === 'string' && value.length <= 2000) completionMessage = value
    }
    return {
      id: instanceId,
      workspace: brand.workspace,
      accent_color: brand.accent_color,
      status,
      expires_at: result.expires_at,
      current_revision: result.current_revision,
      completion_message: completionMessage,
      answers: {},
      comments: [],
      assets: [],
    }
  }
  const safeAssets = assetReferences(result.assets)
  const { data: storageRows, error } = await admin
    .from('workspace_onboarding_assets')
    .select('id,storage_path')
    .eq('instance_id', instanceId)
    .is('deleted_at', null)
  if (error) {
    throw new HttpError(500, 'ASSET_ACCESS_FAILED', 'Onboarding files could not be loaded')
  }
  const pathById = new Map((storageRows ?? []).map((row) => [row.id as string, row.storage_path as string]))
  const assets = await Promise.all(safeAssets.map(async (asset) => {
    const path = pathById.get(asset.id)
    if (!path) {
      throw new HttpError(500, 'INVALID_ONBOARDING_RESPONSE', 'An onboarding file did not match this link')
    }
    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 900)
    return {
      ...asset,
      original_name: responseRecord((result.assets as unknown[]).find((entry) => responseRecord(entry).id === asset.id)).original_name,
      byte_size: responseRecord((result.assets as unknown[]).find((entry) => responseRecord(entry).id === asset.id)).byte_size,
      uploaded_at: responseRecord((result.assets as unknown[]).find((entry) => responseRecord(entry).id === asset.id)).uploaded_at,
      signed_url: signed.error ? null : signed.data.signedUrl,
    }
  }))
  return {
    ...result,
    experience_logo_path: undefined,
    workspace: brand.workspace,
    accent_color: brand.accent_color,
    assets,
  }
}

function assertEditableStatus(view: Record<string, unknown>): void {
  if (view.status === 'expired') {
    throw new HttpError(410, 'ONBOARDING_EXPIRED', 'This onboarding link has expired. Contact the person who sent it for a new link')
  }
  if (view.status === 'revoked') {
    throw new HttpError(410, 'ONBOARDING_REVOKED', 'This onboarding link has been revoked')
  }
  if (view.status === 'approved' || view.status === 'submitted') {
    throw new HttpError(409, 'ONBOARDING_NOT_EDITABLE', 'This onboarding has already been submitted')
  }
}

function cleanFilename(value: unknown): string {
  const source = requireString(value, 'filename', { max: 255 })
  const basename = source.split(/[\\/]/u).pop()?.replace(/\p{Cc}/gu, '').trim() ?? ''
  if (!basename || basename.length > 255) {
    throw new HttpError(400, 'INVALID_FIELD', 'filename is invalid')
  }
  return basename
}

function decodeBase64(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length < 1 || value.length > 14_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw new HttpError(400, 'INVALID_FIELD', 'file_base64 is invalid')
  }
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new HttpError(400, 'INVALID_FIELD', 'file_base64 is invalid')
  }
}

function hasExpectedSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  }
  if (mime === 'application/pdf') return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  return false
}

function extensionFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'pdf'
}

function questionById(definition: ReturnType<typeof validateOnboardingDefinition>, questionId: string): OnboardingQuestion {
  const question = definition.sections.flatMap((section) => section.questions)
    .find((candidate) => candidate.id === questionId)
  if (!question) throw new HttpError(400, 'INVALID_FIELD', 'question_id does not belong to this onboarding')
  return question
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // The preflight has to answer with the tenant's own origin, and it is the
    // only request the browser sends before it will send anything else. Warming
    // after this point would deadlock: a cold isolate rejects the preflight,
    // the POST that would have warmed it is never sent, and the domain never
    // works. So the preflight warms the cache itself.
    await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    return optionsResponse(req, METHODS)
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    /*
     * Declared length first: this endpoint is unauthenticated and accepts the
     * largest bodies in the codebase, and the token that authorizes the work
     * travels INSIDE the body — so the one check that can run before the
     * buffer fills is the declared size. A chunked request with no length is
     * refused outright rather than trusted to be small.
     */
    const declaredLength = Number(req.headers.get('content-length') ?? '')
    if (!Number.isFinite(declaredLength)) {
      throw new HttpError(411, 'LENGTH_REQUIRED', 'Requests must declare a Content-Length')
    }
    if (declaredLength > MAX_BODY_BYTES) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large')
    }
    const body = await parseJsonObject(req, MAX_BODY_BYTES)
    const action = typeof body.action === 'string' ? body.action : ''
    /*
     * Reject unknown actions before any capability or database work. The
     * unknown-action error used to live at the bottom of the ladder, after a
     * signature verification, the initial get RPC, and the host resolution
     * had all run for a request that was never going to do anything.
     */
    if (!['metadata', 'get', 'save', 'submit', 'upload', 'delete_upload'].includes(action)) {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding action')
    }
    const token = body.token
    const capability = await verifyOnboardingCapability(token, capabilitySecret())
    const admin = createAdminClient()

    const initial = await admin.rpc('workspace_onboarding_client_operation_v1', {
      p_action: 'get',
      p_instance_id: capability.instanceId,
      p_capability_hash: capability.verifierHash,
      p_payload: {},
    })
    if (initial.error) clientRpcError(initial.error)

    // Which workspace's domain this was opened on. Null on the platform
    // origin, where every onboarding link has always worked.
    await ensureWorkspaceOriginAllowed(admin, req)
    const hostWorkspaceId = await resolveHostWorkspaceId(admin, requestHostname(req, body.hostname))
    if (hostWorkspaceId) {
      const { data: instanceWorkspace } = await admin
        .from('workspace_onboarding_instances')
        .select('workspace_id')
        .eq('id', capability.instanceId)
        .maybeSingle()
      requireServedByHost(
        hostWorkspaceId,
        typeof instanceWorkspace?.workspace_id === 'string' ? instanceWorkspace.workspace_id : null,
        'ONBOARDING_NOT_FOUND',
        'This onboarding link is invalid or unavailable',
      )
    }

    if (action === 'metadata') {
      requireOnlyKeys(body, ['action', 'token', 'hostname'])
      const brand = await presentClientBrand(admin, capability.instanceId, initial.data)
      return jsonResponse(req, METHODS, 200, {
        metadata: {
          workspace: brand.workspace,
          accent_color: brand.accent_color,
        },
      })
    }

    const initialView = await presentClientView(admin, capability.instanceId, initial.data)

    if (action === 'get') {
      requireOnlyKeys(body, ['action', 'token', 'hostname', 'staff_preview'])
      if (!['expired', 'revoked', 'approved', 'submitted'].includes(String(initialView.status))) {
        validateOnboardingDefinition(initialView.definition)
      }
      /*
       * viewed_at is first-view-wins and the team reads it as CLIENT
       * activity — "opened, never finished" versus "never got it". A staff
       * member checking the form before pasting the link into their own
       * mailbox used to burn that signal permanently. The preview flag skips
       * the stamp; a client passing it could only suppress their own viewed
       * marker, which costs them nothing and us only a chase hint.
       */
      if (body.staff_preview !== true) {
        const viewed = await admin.rpc('mark_workspace_onboarding_viewed_v1', {
          p_instance_id: capability.instanceId,
          p_capability_hash: capability.verifierHash,
        })
        if (viewed.error) clientRpcError(viewed.error)
      }
      return jsonResponse(req, METHODS, 200, { onboarding: initialView })
    }

    assertEditableStatus(initialView)
    const definition = validateOnboardingDefinition(initialView.definition)
    const assets = assetReferences(initialView.assets)

    if (action === 'save') {
      requireOnlyKeys(body, ['action', 'token', 'hostname', 'answers', 'current_section', 'expected_lock_version'])
      const currentSection = integerValue(body.current_section, 'current_section', 0, definition.sections.length - 1)
      const expectedLock = integerValue(body.expected_lock_version, 'expected_lock_version', 0, Number.MAX_SAFE_INTEGER)
      const answers = validateOnboardingAnswers(definition, body.answers, {
        requireComplete: false,
        assets,
      })
      const { data, error } = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'save',
        p_instance_id: capability.instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: {
          answers,
          current_section: currentSection,
          expected_lock_version: expectedLock,
        },
      })
      if (error) clientRpcError(error)
      return jsonResponse(req, METHODS, 200, {
        onboarding: await presentClientView(admin, capability.instanceId, data),
      })
    }

    if (action === 'submit') {
      requireOnlyKeys(body, ['action', 'token', 'hostname', 'expected_lock_version'])
      const expectedLock = integerValue(body.expected_lock_version, 'expected_lock_version', 0, Number.MAX_SAFE_INTEGER)
      const answers = validateOnboardingAnswers(definition, initialView.answers, {
        requireComplete: true,
        assets,
      })
      const { data, error } = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'submit',
        p_instance_id: capability.instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: { expected_lock_version: expectedLock },
      })
      if (error) clientRpcError(error)
      const submitted = await presentClientView(admin, capability.instanceId, data)
      const revision = integerValue(submitted.current_revision, 'current_revision', 1, 10_000)
      /*
       * The AI pitch-profile draft is NOT generated here any more, and the
       * reason is written down so nobody quietly turns it back on: the
       * current-generation review flow deliberately excludes pitch profiles
       * (the review dialog's tests pin that omission as intentional), the
       * only actions that would publish a draft — approve, update_profile,
       * retry_ai — are wired to no UI, and the portal simply omits the card
       * when no profile exists. So every submission was paying for an
       * Anthropic call whose output nothing could review, approve, or show.
       * The draft record is marked skipped, honestly, instead. Reinstating
       * generation means first building the review-and-approve surface that
       * consumes it — generatePitchProfile and the RPCs are all still here.
       */
      await admin.rpc('set_workspace_onboarding_ai_profile_v1', {
        p_instance_id: capability.instanceId,
        p_revision: revision,
        p_status: 'failed',
        p_content: {},
        p_error: 'AI profile drafting is not part of the current review flow.',
      })
      return jsonResponse(req, METHODS, 200, {
        onboarding: submitted,
        // Kept in the response shape for existing callers; always 'failed'
        // while drafting is out of the review flow (see the comment above).
        ai_status: 'failed',
      })
    }

    if (action === 'upload') {
      requireOnlyKeys(body, [
        'action',
        'token',
        'hostname',
        'question_id',
        'filename',
        'mime_type',
        'file_base64',
        'expected_lock_version',
      ])
      const questionId = requireString(body.question_id, 'question_id', { max: 64 })
      const question = questionById(definition, questionId)
      if (question.type !== 'image_upload' && question.type !== 'document_upload') {
        throw new HttpError(400, 'INVALID_FIELD', 'This question does not accept a file')
      }
      const filename = cleanFilename(body.filename)
      const mime = requireString(body.mime_type, 'mime_type', { max: 100 }).toLowerCase()
      const allowedMime = question.type === 'image_upload'
        ? IMAGE_MIMES.has(mime)
        : mime === 'application/pdf'
      if (!allowedMime) {
        throw new HttpError(400, 'INVALID_FILE_TYPE', question.type === 'image_upload'
          ? 'Upload a PNG, JPEG, or WebP image'
          : 'Upload a PDF document')
      }
      const bytes = decodeBase64(body.file_base64)
      const maxBytes = question.type === 'image_upload' ? 5_242_880 : 10_485_760
      if (bytes.length < 1 || bytes.length > maxBytes || !hasExpectedSignature(bytes, mime)) {
        throw new HttpError(400, 'INVALID_FILE', `The selected file must be ${question.type === 'image_upload' ? '5 MB' : '10 MB'} or smaller and match its file type`)
      }
      const expectedLock = integerValue(body.expected_lock_version, 'expected_lock_version', 0, Number.MAX_SAFE_INTEGER)
      const { data: instanceRow, error: instanceError } = await admin
        .from('workspace_onboarding_instances')
        .select('workspace_id')
        .eq('id', capability.instanceId)
        .single()
      if (instanceError || !instanceRow?.workspace_id) {
        throw new HttpError(500, 'UPLOAD_FAILED', 'The file could not be associated with this onboarding')
      }
      const assetId = crypto.randomUUID()
      const path = `${instanceRow.workspace_id}/${capability.instanceId}/${assetId}.${extensionFor(mime)}`
      const uploaded = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime,
        upsert: false,
        cacheControl: '3600',
      })
      if (uploaded.error) throw new HttpError(500, 'UPLOAD_FAILED', 'The file could not be uploaded')

      const registered = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'register_asset',
        p_instance_id: capability.instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: {
          asset_id: assetId,
          question_id: questionId,
          storage_path: path,
          original_name: filename,
          mime_type: mime,
          byte_size: bytes.length,
          expected_lock_version: expectedLock,
        },
      })
      if (registered.error) {
        await admin.storage.from(BUCKET).remove([path])
        clientRpcError(registered.error)
      }
      return jsonResponse(req, METHODS, 201, {
        onboarding: await presentClientView(admin, capability.instanceId, registered.data),
      })
    }

    if (action === 'delete_upload') {
      requireOnlyKeys(body, ['action', 'token', 'hostname', 'asset_id', 'expected_lock_version'])
      const assetId = requireUuid(body.asset_id, 'asset_id')
      const expectedLock = integerValue(body.expected_lock_version, 'expected_lock_version', 0, Number.MAX_SAFE_INTEGER)
      const deleted = await admin.rpc('workspace_onboarding_client_operation_v1', {
        p_action: 'delete_asset',
        p_instance_id: capability.instanceId,
        p_capability_hash: capability.verifierHash,
        p_payload: { asset_id: assetId, expected_lock_version: expectedLock },
      })
      if (deleted.error) clientRpcError(deleted.error)
      const result = responseRecord(deleted.data, 'file deletion')
      const path = responseString(result.storage_path, 'asset path', 500)
      const removal = await admin.storage.from(BUCKET).remove([path])
      return jsonResponse(req, METHODS, 200, {
        onboarding: await presentClientView(admin, capability.instanceId, result.view),
        storage_cleanup_complete: !removal.error,
      })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown onboarding action')
  } catch (error) {
    /*
     * Error responses need the tenant's own origin in their CORS headers, and
     * the early failures above (405, 411, 413, malformed JSON, bad token) can
     * all fire on a cold isolate before anything has loaded the workspace
     * origin cache — the browser's cached preflight means the POST may be the
     * isolate's first request. Without the warm, the error itself becomes an
     * unreadable opaque network failure on custom domains.
     */
    try {
      await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    } catch {
      // The response below must go out even when the warm-up read fails.
    }
    return errorResponse(req, METHODS, error)
  }
})
