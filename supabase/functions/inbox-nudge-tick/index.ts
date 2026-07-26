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
const CANDIDATE_LIMIT = 100
const DAY_MS = 24 * 60 * 60 * 1000

interface NudgeStep {
  send_after_days: number
  body: string
}

interface CandidateRow {
  workspace_id: string
  thread_key: string
  client_id: string
  nudges_sent: number
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
    .select('workspace_id, thread_key, client_id, nudges_sent, draft')
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

  for (const raw of (candidates ?? []) as CandidateRow[]) {
    if (totalSent >= MAX_SENDS_PER_TICK) break
    const steps = nudgeSteps(raw.draft)
    if (steps.length === 0 || raw.nudges_sent >= steps.length) continue
    if ((sentByWorkspace.get(raw.workspace_id) ?? 0) >= MAX_SENDS_PER_WORKSPACE) continue

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

      // The live thread is the source of truth: the newest message decides
      // whether the host is quiet, and anchors the nudge timing.
      const threadPayload = await instantlyRequest<{ items?: Array<Record<string, unknown>> }>(
        apiKey,
        '/emails',
        { query: new URLSearchParams({ search: `thread:${raw.thread_key}`, limit: '1' }) },
      )
      const latest = threadPayload.items?.[0]
      if (!latest || typeof latest.id !== 'string' || typeof latest.eaccount !== 'string' || !latest.eaccount) {
        skipped += 1
        continue
      }
      const latestIsInbound = latest.ue_type === 2
      if (latestIsInbound) {
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
      const latestAt = typeof latest.timestamp_email === 'string'
        ? Date.parse(latest.timestamp_email)
        : typeof latest.timestamp_created === 'string'
          ? Date.parse(latest.timestamp_created)
          : Number.NaN
      const step = steps[raw.nudges_sent]
      if (!Number.isFinite(latestAt) || Date.now() - latestAt < step.send_after_days * DAY_MS) {
        continue
      }

      await instantlyRequest(apiKey, '/emails/reply', {
        method: 'POST',
        body: {
          reply_to_uuid: latest.id,
          eaccount: latest.eaccount,
          subject: typeof latest.subject === 'string' && latest.subject
            ? (latest.subject.startsWith('Re:') ? latest.subject : `Re: ${latest.subject}`).slice(0, 300)
            : 'Following up',
          body: { text: step.body },
        },
      })

      // Claim the step only after the send succeeded; the nudges_sent guard
      // makes a concurrent duplicate tick a no-op.
      const { error: claimError } = await admin
        .from('workspace_inbox_thread_state')
        .update({
          nudges_sent: raw.nudges_sent + 1,
          last_nudge_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
        .eq('nudges_sent', raw.nudges_sent)
      if (claimError) {
        skipped += 1
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
