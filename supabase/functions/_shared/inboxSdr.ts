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

/** The sending window Instantly holds for a campaign, as observed on sync. */
export interface CampaignSendWindow {
  from: string | null
  to: string | null
  timezone: string | null
  /** Seven booleans in provider key order; index 0 is treated as Sunday. */
  days: boolean[]
}

// Used only when the provider has told us nothing. Deliberately wider than a
// typical campaign schedule: guessing narrow would silently hold nudges back on
// a campaign that is in fact sending.
const DEFAULT_WINDOW = { fromHour: 8, toHour: 18 }
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Whether a nudge may go out right now.
 *
 * Prefers the campaign's real schedule so this agrees with what Instantly will
 * actually do. It used to assert weekdays 08:00-18:00 regardless, which could
 * disagree with the campaign in both directions — holding a nudge during a
 * window the campaign was sending in, or releasing one outside it.
 */
export function withinSendWindow(timezone: string, window?: CampaignSendWindow | null): boolean {
  const zone = window?.timezone || timezone
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(new Date())
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '-1')
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
    if (!Number.isFinite(hour) || hour < 0) return true
    const minutesNow = hour * 60 + minute

    const dayIndex = WEEKDAY_INDEX[weekday]
    if (window && window.days.length === 7 && dayIndex !== undefined) {
      if (!window.days[dayIndex]) return false
    } else if (['Sat', 'Sun'].includes(weekday)) {
      return false
    }

    const parseTime = (value: string | null | undefined): number | null => {
      if (typeof value !== 'string') return null
      const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value)
      return match ? Number(match[1]) * 60 + Number(match[2]) : null
    }
    const from = parseTime(window?.from) ?? DEFAULT_WINDOW.fromHour * 60
    const to = parseTime(window?.to) ?? DEFAULT_WINDOW.toHour * 60
    // A window that ends before it starts is nonsense; treat it as always open
    // rather than never, so bad provider data cannot silently stop sending.
    if (to <= from) return true
    return minutesNow >= from && minutesNow < to
  } catch (_error) {
    return true
  }
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

// Deterministic pre-filters (confidence 100, zero tokens). Patterns stay
// narrow, because a false "unsubscribe" silences a real host for every client.
//
// The set below was widened after a real reply went undetected: "Do not send
// correspondence to this email address, please" matched nothing, because the
// only "do not ..." rule demanded the word "again" and the only "address" rule
// did not exist. People decline in the second person ("do not email me"), the
// third ("this address is not monitored"), and by naming the address itself —
// all three are here now, each still requiring an explicit negative plus an
// unambiguous object, so ordinary sentences do not trip them.
const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/iu,
  /\bopt[- ]?out\b/iu,
  /\b(?:remove|take)\s+(?:me|us)\s+(?:from|off)\b/iu,
  /\bstop\s+(?:emailing|contacting|messaging)\b/iu,
  // "again" is now optional: the request stands without it.
  /\bdo\s+not\s+(?:email|contact|message|write\s+to)\s+(?:me|us)\b/iu,
  // "Do not send correspondence to this email address" and its relatives. The
  // verb, the negative, and the address are all required together.
  /\bdo\s+not\s+(?:send|reply|respond|write)\b[^.!?]{0,60}\bthis\s+(?:e-?mail\s+)?(?:address|account|inbox)\b/iu,
  /\b(?:remove|delete)\s+(?:my|this)\s+(?:e-?mail\s+)?(?:address|account)\b/iu,
  /\bno\s+longer\s+(?:wish|want)(?:es)?\s+to\s+(?:receive|be\s+(?:contacted|emailed))\b/iu,
  /\bplease\s+(?:remove|delete)\s+(?:me|us)\b/iu,
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
  /** The host's address, used to recover what we pitched this show. */
  leadEmail?: string | null
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

  // Conversation context: what we pitched this show, and what the research
  // found about it. Without this the SDR answers a host it knows nothing
  // about, with no memory of the email that started the thread.
  let pitchSent = ''
  let podcastName = ''
  let hostName = ''
  let podcastResearch = ''
  if (input.leadEmail) {
    const { data: target } = await admin
      .from('workspace_client_campaign_targets')
      .select('podcast_name, host_name, pitch_subject, pitch_body, shortlist_podcast_id')
      .eq('workspace_id', workspaceId)
      .eq('client_id', clientId)
      .ilike('contact_email', input.leadEmail)
      .limit(1)
      .maybeSingle()
    if (target) {
      podcastName = typeof target.podcast_name === 'string' ? target.podcast_name : ''
      hostName = typeof target.host_name === 'string' ? target.host_name : ''
      const subjectLine = typeof target.pitch_subject === 'string' ? target.pitch_subject : ''
      const bodyText = typeof target.pitch_body === 'string' ? target.pitch_body : ''
      pitchSent = [subjectLine && `Subject: ${subjectLine}`, bodyText]
        .filter(Boolean).join('\n').slice(0, 3_000)
      if (typeof target.shortlist_podcast_id === 'string') {
        const { data: shortlist } = await admin
          .from('client_dashboard_podcasts')
          .select('podcast_description, research_document')
          .eq('client_id', clientId)
          .eq('id', target.shortlist_podcast_id)
          .maybeSingle()
        const document = shortlist?.research_document && typeof shortlist.research_document === 'object'
          ? shortlist.research_document as Record<string, unknown>
          : null
        podcastResearch = [
          typeof shortlist?.podcast_description === 'string' ? shortlist.podcast_description : '',
          typeof document?.podcast_research === 'string' ? document.podcast_research : '',
          typeof document?.host_info === 'string' ? document.host_info : '',
        ].filter(Boolean).join('\n\n').slice(0, 4_000)
      }
    }
  }

  // Workspace-editable prompt (Client Campaigns -> prompt settings) with the
  // shipped default as the fallback, exactly like the research prompts.
  // Resolution order: this client's own prompt -> the workspace house style
  // -> the shipped default.
  const replyDefault = RESEARCH_PROMPT_DEFAULTS.inbox_reply
  const nudgeDefault = RESEARCH_PROMPT_DEFAULTS.inbox_nudges
  const [clientPromptRows, workspacePromptRows] = await Promise.all([
    admin
      .from('client_ai_sdr_prompts')
      .select('prompt_id, content')
      .eq('workspace_id', workspaceId)
      .eq('client_id', clientId)
      .in('prompt_id', ['inbox_reply', 'inbox_nudges']),
    admin
      .from('workspace_research_prompts')
      .select('prompt_id, content')
      .eq('workspace_id', workspaceId)
      .in('prompt_id', ['inbox_reply', 'inbox_nudges']),
  ])
  const promptRow = (rows: { data?: Array<Record<string, unknown>> | null }, id: string): string | null => {
    const match = (rows.data ?? []).find((row) => row.prompt_id === id)
    return typeof match?.content === 'string' && match.content.trim() ? match.content : null
  }
  const resolvePrompt = (id: 'inbox_reply' | 'inbox_nudges', fallback: string): string =>
    promptRow(clientPromptRows, id) ?? promptRow(workspacePromptRows, id) ?? fallback

  // One substitution map for both prompts; an unmapped variable renders as
  // "Not available" rather than leaking the raw placeholder into the model.
  const variables: Record<string, string> = {
    client_name: String(client.name ?? ''),
    positioning: profileText('positioning'),
    topics_and_angles: profileText('topics_and_angles'),
    listener_takeaways: profileText('listener_takeaways'),
    proof_points: profileText('proof_points') || 'n/a',
    booking_details: profileText('booking_details'),
    reply_subject: subject,
    reply_body: message,
    podcast_name: podcastName,
    host_name: hostName,
    pitch_sent: pitchSent,
    podcast_research: podcastResearch,
  }
  const fill = (template: string): string =>
    template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gu, (_match, key: string) => {
      const value = variables[key]
      return typeof value === 'string' && value.trim() ? value : 'Not available'
    })

  const filled = [
    fill(resolvePrompt('inbox_reply', replyDefault.content)),
    '',
    'FOLLOW-UP NUDGE GUIDANCE (governs the "nudges" array only):',
    fill(resolvePrompt('inbox_nudges', nudgeDefault.content)),
  ].join('\n')

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
