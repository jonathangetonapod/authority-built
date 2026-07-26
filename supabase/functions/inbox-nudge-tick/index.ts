// Master Inbox nudge tick. Invoked by pg_cron via pg_net every 30 minutes
// with a shared secret — no user JWT (verify_jwt = false). Each tick walks
// replied conversations whose staged nudge plan has a due step, confirms
// against the live Instantly thread that the host is still quiet, and sends
// the next nudge in-thread from the same mailbox. A host reply cancels the
// plan and moves the conversation back to the needs-reply queue.
//
// Safety gates (Reply-inspired, fail closed):
// - never send when the latest thread message is inbound or missing
// - never send more nudges than the plan staged, or when paused
// - per-tick send caps bound the blast radius of any bug

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, writeAudit } from '../_shared/workspaceAuth.ts'
import {
  decryptInstantlyApiKey,
  InstantlyApiError,
  instantlyRequest,
} from '../_shared/instantly.ts'

const MAX_SENDS_PER_TICK = 15
const MAX_SENDS_PER_WORKSPACE = 5
const MAX_THREAD_LOOKUPS_PER_TICK = 15
const MAX_FAILURES_BEFORE_PAUSE = 3
const CANDIDATE_LIMIT = 100
const DAY_MS = 24 * 60 * 60 * 1000

// Nudges only dispatch inside business hours in the client's campaign
// timezone (Mon-Fri, 8:00-17:59). Eligibility is recomputed every tick, so
// an out-of-window candidate simply waits for a later tick.
function withinSendWindow(timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(new Date())
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '-1')
    return !['Sat', 'Sun'].includes(weekday) && hour >= 8 && hour < 18
  } catch (_error) {
    return true
  }
}

interface NudgeStep {
  send_after_days: number
  body: string
}

interface CandidateRow {
  workspace_id: string
  thread_key: string
  client_id: string
  nudges_sent: number
  nudge_failure_count: number | null
  draft: Record<string, unknown> | null
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function nudgeSteps(draft: Record<string, unknown> | null): NudgeStep[] {
  const raw = draft?.nudges
  if (!Array.isArray(raw)) return []
  return raw.flatMap((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return []
    const record = step as Record<string, unknown>
    if (typeof record.body !== 'string' || !record.body.trim()) return []
    return [{
      send_after_days: typeof record.send_after_days === 'number' && Number.isFinite(record.send_after_days)
        ? Math.max(1, Math.min(30, Math.round(record.send_after_days)))
        : 3,
      body: record.body,
    }]
  })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const secret = Deno.env.get('NUDGE_TICK_SECRET')?.trim()
  if (!secret || req.headers.get('x-nudge-secret') !== secret) {
    return json(401, { error: 'unauthorized' })
  }

  const admin = createAdminClient()
  const { data: candidates, error: candidatesError } = await admin
    .from('workspace_inbox_thread_state')
    .select('workspace_id, thread_key, client_id, nudges_sent, nudge_failure_count, draft')
    .eq('status', 'replied')
    .eq('nudges_paused', false)
    .order('updated_at', { ascending: true })
    .limit(CANDIDATE_LIMIT)
  if (candidatesError) {
    return json(200, { sent: 0, error: 'candidates_unavailable' })
  }

  const apiKeyByWorkspace = new Map<string, string | null>()
  // Audit rows attribute automated sends to the workspace owner, matching
  // the autopilot tick's convention for system actions.
  // deno-lint-ignore no-explicit-any
  const ownerByWorkspace = new Map<string, any>()
  const sentByWorkspace = new Map<string, number>()
  let totalSent = 0
  let hostReplies = 0
  let skipped = 0

  const timezoneByClient = new Map<string, string>()
  let lookups = 0
  for (const raw of (candidates ?? []) as CandidateRow[]) {
    if (totalSent >= MAX_SENDS_PER_TICK) break
    if (lookups >= MAX_THREAD_LOOKUPS_PER_TICK) break
    const steps = nudgeSteps(raw.draft)
    if (steps.length === 0 || raw.nudges_sent >= steps.length) {
      // Terminal: the plan is exhausted (or was never staged). Pausing the
      // row removes it from the candidate window so live plans keep flowing.
      await admin
        .from('workspace_inbox_thread_state')
        .update({ nudges_paused: true, updated_at: new Date().toISOString() })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
        .eq('nudges_sent', raw.nudges_sent)
      continue
    }
    if ((sentByWorkspace.get(raw.workspace_id) ?? 0) >= MAX_SENDS_PER_WORKSPACE) continue

    const recordFailure = async (reason: string) => {
      const failures = (raw.nudge_failure_count ?? 0) + 1
      await admin
        .from('workspace_inbox_thread_state')
        .update({
          last_nudge_error: reason.slice(0, 300),
          last_nudge_error_at: new Date().toISOString(),
          nudge_failure_count: failures,
          // Repeated failures pause the plan visibly instead of retrying an
          // unsendable thread forever; Resume clears the way to try again.
          ...(failures >= MAX_FAILURES_BEFORE_PAUSE ? { nudges_paused: true } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
      skipped += 1
    }

    try {
      if (!ownerByWorkspace.has(raw.workspace_id)) {
        const { data: owner } = await admin
          .from('workspace_memberships')
          .select('user_id')
          .eq('workspace_id', raw.workspace_id)
          .eq('role', 'owner')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        ownerByWorkspace.set(raw.workspace_id, owner)
      }
      // Resolve the workspace's Instantly key once per tick.
      if (!apiKeyByWorkspace.has(raw.workspace_id)) {
        const { data: connection } = await admin
          .from('workspace_instantly_integrations')
          .select('status, api_key_ciphertext, api_key_iv')
          .eq('workspace_id', raw.workspace_id)
          .maybeSingle()
        apiKeyByWorkspace.set(
          raw.workspace_id,
          connection && connection.status === 'connected' && connection.api_key_ciphertext && connection.api_key_iv
            ? await decryptInstantlyApiKey({
              ciphertext: connection.api_key_ciphertext,
              iv: connection.api_key_iv,
            })
            : null,
        )
      }
      const apiKey = apiKeyByWorkspace.get(raw.workspace_id)
      if (!apiKey) {
        skipped += 1
        continue
      }
      if (!timezoneByClient.has(raw.client_id)) {
        const { data: campaignRow } = await admin
          .from('workspace_client_campaigns')
          .select('timezone')
          .eq('workspace_id', raw.workspace_id)
          .eq('client_id', raw.client_id)
          .maybeSingle()
        timezoneByClient.set(raw.client_id, typeof campaignRow?.timezone === 'string' && campaignRow.timezone
          ? campaignRow.timezone
          : 'America/New_York')
      }
      if (!withinSendWindow(timezoneByClient.get(raw.client_id)!)) continue

      // The live thread is the source of truth: the newest message decides
      // whether the host is quiet, and anchors the nudge timing. Fetch a
      // window (not just one item) because list order follows record
      // creation, and pick the newest human message by email timestamp.
      lookups += 1
      const threadPayload = await instantlyRequest<{ items?: Array<Record<string, unknown>> }>(
        apiKey,
        '/emails',
        { query: new URLSearchParams({ search: `thread:${raw.thread_key}`, limit: '20' }) },
      )
      const messages = (threadPayload.items ?? [])
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .sort((left, right) =>
          String(right.timestamp_email ?? right.timestamp_created ?? '')
            .localeCompare(String(left.timestamp_email ?? left.timestamp_created ?? '')))
      if (messages.length === 0) {
        await recordFailure('thread_not_found: Instantly returned no messages for this thread key')
        continue
      }
      // Autoresponders neither cancel the plan nor count as our outbound.
      const latestHuman = messages.find((message) => message.is_auto_reply !== 1)
      if (!latestHuman || typeof latestHuman.id !== 'string') {
        skipped += 1
        continue
      }
      if (latestHuman.ue_type === 2) {
        // Host replied — cancel the plan and surface the conversation.
        await admin
          .from('workspace_inbox_thread_state')
          .update({ status: 'needs_reply', updated_at: new Date().toISOString() })
          .eq('workspace_id', raw.workspace_id)
          .eq('thread_key', raw.thread_key)
          .eq('status', 'replied')
        hostReplies += 1
        continue
      }
      // Fail closed: only a provably-outbound latest message (campaign send
      // or manual send) counts as "the host is quiet".
      if (latestHuman.ue_type !== 1 && latestHuman.ue_type !== 3) {
        skipped += 1
        continue
      }
      const replyAnchor = messages[0]
      if (typeof replyAnchor.eaccount !== 'string' || !replyAnchor.eaccount) {
        await recordFailure('sender_mailbox_unknown: the thread has no sending mailbox to reply from')
        continue
      }
      const latestAt = typeof latestHuman.timestamp_email === 'string'
        ? Date.parse(latestHuman.timestamp_email)
        : typeof latestHuman.timestamp_created === 'string'
          ? Date.parse(latestHuman.timestamp_created)
          : Number.NaN
      const step = steps[raw.nudges_sent]
      if (!Number.isFinite(latestAt) || Date.now() - latestAt < step.send_after_days * DAY_MS) {
        continue
      }

      // Claim the step BEFORE dispatch: the compare-and-set re-checks
      // status and pause under the same guard, so an overlapping tick, an
      // operator pause, or an archive during this tick can never double-send.
      const { data: claimed } = await admin
        .from('workspace_inbox_thread_state')
        .update({
          nudges_sent: raw.nudges_sent + 1,
          last_nudge_at: new Date().toISOString(),
          last_nudge_error: null,
          nudge_failure_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
        .eq('nudges_sent', raw.nudges_sent)
        .eq('status', 'replied')
        .eq('nudges_paused', false)
        .select('thread_key')
      if ((claimed ?? []).length !== 1) {
        skipped += 1
        continue
      }

      try {
        await instantlyRequest(apiKey, '/emails/reply', {
          method: 'POST',
          body: {
            reply_to_uuid: latestHuman.id,
            eaccount: replyAnchor.eaccount,
            subject: typeof latestHuman.subject === 'string' && latestHuman.subject
              ? (latestHuman.subject.startsWith('Re:') ? latestHuman.subject : `Re: ${latestHuman.subject}`).slice(0, 300)
              : 'Following up',
            body: { text: step.body },
          },
        })
      } catch (sendError) {
        if (sendError instanceof InstantlyApiError && sendError.status >= 400 && sendError.status < 500 && sendError.status !== 408 && sendError.status !== 429) {
          // Definite pre-dispatch rejection: refund the claimed step.
          await admin
            .from('workspace_inbox_thread_state')
            .update({ nudges_sent: raw.nudges_sent, updated_at: new Date().toISOString() })
            .eq('workspace_id', raw.workspace_id)
            .eq('thread_key', raw.thread_key)
            .eq('nudges_sent', raw.nudges_sent + 1)
          await recordFailure(`send_rejected: ${sendError.message}`.slice(0, 300))
          continue
        }
        // Ambiguous outcome (timeout, 5xx, rate limit): the send may have
        // gone out — keep the claim so it can never double-fire, and surface
        // the uncertainty for operator review.
        await recordFailure('delivery_unknown: the nudge send did not confirm — the step stays consumed to prevent a duplicate')
        continue
      }

      totalSent += 1
      sentByWorkspace.set(raw.workspace_id, (sentByWorkspace.get(raw.workspace_id) ?? 0) + 1)
      await writeAudit(admin, {
        workspaceId: raw.workspace_id,
        actorUserId: ownerByWorkspace.get(raw.workspace_id)?.user_id ?? null,
        action: 'workspace.inbox.nudge_sent',
        entityType: 'client',
        entityId: raw.client_id,
        metadata: {
          thread_key: raw.thread_key,
          nudge_number: raw.nudges_sent + 1,
          of: steps.length,
        },
      })
    } catch (error) {
      // One broken thread or workspace never stops the sweep.
      skipped += 1
      if (error instanceof InstantlyApiError && error.status === 401) {
        apiKeyByWorkspace.set(raw.workspace_id, null)
      }
    }
  }

  return json(200, { sent: totalSent, host_replies: hostReplies, skipped })
})
