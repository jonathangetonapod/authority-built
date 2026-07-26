// Shared AI SDR reply-package generation for the Master Inbox.
//
// Used by the operator path (workspace-client-campaigns inbox-draft) and the
// auto-enrollment cron (inbox-enroll-tick). One model call classifies the
// host's reply and drafts the response plus a numbered nudge plan; the
// deterministic pre-filters run BEFORE any model call so opt-outs and
// autoresponders never spend credits (the reference system's cheapest and
// most valuable cost control).

import { HttpError } from './httpError.ts'
import { RESEARCH_PROMPT_DEFAULTS } from './researchPromptDefaults.ts'
import { chargeCredits, logOperationCost } from './billing.ts'
import { resolveAiKey } from './workspaceAiKeys.ts'

// deno-lint-ignore no-explicit-any
type AdminClient = any

export interface SdrClassification {
  label: string
  confidence: number
  reasoning: string
}

export interface SdrNudge {
  send_after_days: number
  body: string
}

export interface SdrReplyPackage {
  classification: SdrClassification | null
  nudges: SdrNudge[]
  subject: string
  body: string
}

const CLASSIFICATION_LABELS = [
  'interested',
  'not_interested',
  'not_now',
  'question',
  'referral',
  'auto_reply',
  'other',
]

// Deterministic pre-filters (confidence 100, zero tokens). Patterns are
// deliberately narrow: a false "unsubscribe" suppresses a real host.
const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/iu,
  /\bopt[- ]?out\b/iu,
  /\b(?:remove|take)\s+(?:me|us)\s+(?:from|off)\b/iu,
  /\bstop\s+(?:emailing|contacting|messaging)\b/iu,
  /\bdo\s+not\s+(?:email|contact|message)\s+(?:me|us)\s+again\b/iu,
]

const AUTO_REPLY_PATTERNS = [
  /\bout\s+of\s+(?:the\s+)?office\b/iu,
  /\bon\s+(?:vacation|holiday|leave|pto)\s+(?:until|through|till)\b/iu,
  /\bauto[- ]?(?:reply|response|responder)\b/iu,
  /\bI\s+(?:am|'m)\s+(?:currently\s+)?(?:away|traveling)\s+(?:until|through|till)\b/iu,
  /\bwill\s+(?:respond|reply)\s+(?:to\s+your\s+(?:email|message)\s+)?(?:when|upon|after)\s+(?:I|my)\s+return\b/iu,
]

export function detectDeterministicReply(message: string): 'opt_out' | 'auto_reply' | null {
  const sample = message.slice(0, 2_000)
  if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(sample))) return 'opt_out'
  if (AUTO_REPLY_PATTERNS.some((pattern) => pattern.test(sample))) return 'auto_reply'
  return null
}

export function deterministicClassification(kind: 'opt_out' | 'auto_reply'): SdrClassification {
  return kind === 'opt_out'
    ? {
      label: 'not_interested',
      confidence: 100,
      reasoning: 'Deterministic opt-out language detected — the contact asked not to be emailed. No AI call was made.',
    }
    : {
      label: 'auto_reply',
      confidence: 100,
      reasoning: 'Deterministic autoresponder language detected (out of office). No AI call was made.',
    }
}

export interface GenerateReplyPackageInput {
  admin: AdminClient
  workspaceId: string
  clientId: string
  subject: string
  message: string
  actorUserId: string | null
  referenceKind: string
}

/**
 * Charge credits, run the single classify+draft+nudges model call, and
 * return the validated package. Throws coded HttpErrors:
 * CLIENT_NOT_FOUND, SDR_PROFILE_NOT_READY, SERVER_MISCONFIGURED,
 * INSUFFICIENT_CREDITS (from chargeCredits), DRAFT_FAILED.
 */
export async function generateReplyPackage(input: GenerateReplyPackageInput): Promise<SdrReplyPackage> {
  const { admin, workspaceId, clientId, subject, message } = input

  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('id, name, bio, ai_sdr_profile')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (clientError || !client) {
    throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found in this workspace')
  }
  const profile = (client.ai_sdr_profile ?? {}) as Record<string, unknown>
  const profileText = (field: string): string =>
    typeof profile[field] === 'string' ? String(profile[field]).trim() : ''
  // Reply-safety rule: no drafts without the approved core context.
  const coreReady = ['positioning', 'topics_and_angles', 'listener_takeaways', 'booking_details']
    .every((field) => profileText(field).length > 0)
  if (!coreReady) {
    throw new HttpError(
      409,
      'SDR_PROFILE_NOT_READY',
      'Complete the core AI SDR profile fields before drafting replies for this client',
    )
  }

  // Workspace-editable prompt (Client Campaigns -> prompt settings) with the
  // shipped default as the fallback, exactly like the research prompts.
  // Resolution order: this client's own prompt -> the workspace house style
  // -> the shipped default.
  const replyDefault = RESEARCH_PROMPT_DEFAULTS.inbox_reply
  const [clientPromptResult, workspacePromptResult] = await Promise.all([
    admin
      .from('client_ai_sdr_prompts')
      .select('content')
      .eq('workspace_id', workspaceId)
      .eq('client_id', clientId)
      .eq('prompt_id', 'inbox_reply')
      .maybeSingle(),
    admin
      .from('workspace_research_prompts')
      .select('content')
      .eq('workspace_id', workspaceId)
      .eq('prompt_id', 'inbox_reply')
      .maybeSingle(),
  ])
  const clientPrompt = clientPromptResult.data?.content
  const workspacePrompt = workspacePromptResult.data?.content
  const promptTemplate = typeof clientPrompt === 'string' && clientPrompt.trim()
    ? clientPrompt
    : typeof workspacePrompt === 'string' && workspacePrompt.trim()
      ? workspacePrompt
      : replyDefault.content
  const filled = promptTemplate
    .replaceAll('{{client_name}}', String(client.name ?? ''))
    .replaceAll('{{positioning}}', profileText('positioning'))
    .replaceAll('{{topics_and_angles}}', profileText('topics_and_angles'))
    .replaceAll('{{listener_takeaways}}', profileText('listener_takeaways'))
    .replaceAll('{{proof_points}}', profileText('proof_points') || 'n/a')
    .replaceAll('{{booking_details}}', profileText('booking_details'))
    .replaceAll('{{reply_subject}}', subject)
    .replaceAll('{{reply_body}}', message)

  const anthropicKey = await resolveAiKey(admin, workspaceId, 'anthropic')
  if (!anthropicKey) {
    throw new HttpError(500, 'SERVER_MISCONFIGURED', 'AI drafting is not configured')
  }
  const usedByoKey = anthropicKey.source === 'workspace'
  await chargeCredits(admin, {
    workspaceId,
    operationType: 'query_generation',
    referenceKind: input.referenceKind,
    referenceId: clientId,
    clientId,
    actorUserId: input.actorUserId,
    byoKeyUsed: usedByoKey,
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: replyDefault.model,
      max_tokens: replyDefault.maxTokens,
      system: replyDefault.system,
      messages: [{ role: 'user', content: filled }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) {
    throw new HttpError(503, 'DRAFT_FAILED', 'The reply draft could not be generated. Try again shortly')
  }
  const payload = await response.json() as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const draftText = (payload.content ?? []).find((block) => block.type === 'text')?.text ?? ''
  let draft: Record<string, unknown> = {}
  try {
    draft = JSON.parse(draftText.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''))
  } catch (_error) {
    throw new HttpError(503, 'DRAFT_FAILED', 'The reply draft came back malformed. Try again')
  }
  await logOperationCost(admin, {
    workspaceId,
    operationType: 'query_generation',
    usage: {
      anthropicInputTokens: payload.usage?.input_tokens ?? 0,
      anthropicOutputTokens: payload.usage?.output_tokens ?? 0,
    },
    usedByoKey,
    clientId,
    referenceKind: input.referenceKind,
    referenceId: clientId,
  })

  const rawClassification = draft.classification
  let classification: SdrClassification | null = null
  if (rawClassification && typeof rawClassification === 'object' && !Array.isArray(rawClassification)) {
    const record = rawClassification as Record<string, unknown>
    if (typeof record.label === 'string' && CLASSIFICATION_LABELS.includes(record.label)) {
      classification = {
        label: record.label,
        confidence: typeof record.confidence === 'number'
          ? Math.max(0, Math.min(100, Math.round(record.confidence)))
          : 0,
        reasoning: typeof record.reasoning === 'string' ? record.reasoning.slice(0, 300) : '',
      }
    }
  }
  const rawNudges = draft.nudges
  const nudges: SdrNudge[] = Array.isArray(rawNudges)
    ? rawNudges.flatMap((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
      const record = raw as Record<string, unknown>
      if (typeof record.body !== 'string' || !record.body.trim()) return []
      return [{
        send_after_days: typeof record.send_after_days === 'number' && Number.isFinite(record.send_after_days)
          ? Math.max(1, Math.min(30, Math.round(record.send_after_days)))
          : 3,
        body: record.body.trim().slice(0, 600),
      }]
    }).slice(0, 3)
    : []
  return {
    classification,
    nudges,
    subject: typeof draft.subject === 'string' && draft.subject.trim()
      ? draft.subject.trim().slice(0, 300)
      : `Re: ${subject}`.slice(0, 300),
    body: typeof draft.body === 'string' ? draft.body.trim().slice(0, 6_000) : '',
  }
}
