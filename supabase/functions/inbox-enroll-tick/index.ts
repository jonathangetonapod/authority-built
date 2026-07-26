// Master Inbox auto-enrollment tick. Invoked by pg_cron via pg_net every 15
// minutes with a shared secret — no user JWT (verify_jwt = false). For each
// client whose SDR mode is auto_draft or auto_send, every new attributed host
// reply is classified and packaged (reply + numbered nudges) into the review
// queue. Generation NEVER grants send authority — a package is dispatched
// only for an auto_send client, and only by the second phase below after a
// hold window, a classification gate, and a business-hours check.
//
// Cost and safety gates:
// - interested-only: replies Instantly has not flagged interested are skipped
// - per-workspace high-water cursor: each reply is considered once
// - deterministic opt-out/autoresponder pre-filter spends zero tokens
// - an idempotency claim precedes every model call, so an overlapping tick
//   or a crashed run can never double-bill the same message
// - insufficient credits skips the rest of the workspace for the tick
// - hard caps bound the model spend of any single tick

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient, writeAudit } from '../_shared/workspaceAuth.ts'
import { HttpError } from '../_shared/httpError.ts'
import {
  decryptInstantlyApiKey,
  InstantlyApiError,
  instantlyRequest,
} from '../_shared/instantly.ts'
import {
  detectDeterministicReply,
  deterministicClassification,
  generateReplyPackage,
  packageIsAutoSendable,
  withinSendWindow,
} from '../_shared/inboxSdr.ts'

// The hold: a staged auto-send waits this long before dispatch, so a person
// watching the inbox has a real chance to edit, pause, or archive it first.
const AUTO_SEND_HOLD_MS = 15 * 60 * 1000
const MAX_AUTO_SENDS_PER_TICK = 6
const MAX_AUTO_SENDS_PER_WORKSPACE = 3
const MAX_DRAFTS_PER_TICK = 8
const MAX_DRAFTS_PER_WORKSPACE = 3
const MAX_WORKSPACES_PER_TICK = 3
const CLAIM_TTL_MS = 10 * 60 * 1000
const CURSOR_OVERLAP_MS = 5 * 60 * 1000

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const secret = Deno.env.get('ENROLL_TICK_SECRET')?.trim()
  if (!secret || req.headers.get('x-enroll-secret') !== secret) {
    return json(401, { error: 'unauthorized' })
  }

  const admin = createAdminClient()
  // Workspaces with at least one auto-draft client, oldest cursor first so
  // attention rotates fairly across ticks.
  const { data: autoClients, error: clientsError } = await admin
    .from('clients')
    .select('id, workspace_id, status, ai_sdr_mode')
    .in('ai_sdr_mode', ['auto_draft', 'auto_send'])
    .eq('status', 'active')
    .limit(2_000)
  if (clientsError) {
    return json(200, { drafted: 0, error: 'clients_unavailable' })
  }
  const autoClientIdsByWorkspace = new Map<string, Set<string>>()
  // Sending is a strictly narrower permission than drafting: a client is in
  // this set only if the operator explicitly chose auto_send.
  const autoSendClientIds = new Set<string>()
  for (const client of (autoClients ?? []) as Array<{ id: string; workspace_id: string | null; ai_sdr_mode?: string }>) {
    if (!client.workspace_id) continue
    const set = autoClientIdsByWorkspace.get(client.workspace_id) ?? new Set<string>()
    set.add(client.id)
    autoClientIdsByWorkspace.set(client.workspace_id, set)
    if (client.ai_sdr_mode === 'auto_send') autoSendClientIds.add(client.id)
  }
  if (autoClientIdsByWorkspace.size === 0) {
    return json(200, { drafted: 0, workspaces: 0 })
  }

  const { data: integrations } = await admin
    .from('workspace_instantly_integrations')
    .select('workspace_id, status, api_key_ciphertext, api_key_iv, auto_draft_cursor_ts')
    .in('workspace_id', [...autoClientIdsByWorkspace.keys()])
    .eq('status', 'connected')
    .order('auto_draft_cursor_ts', { ascending: true, nullsFirst: true })
    .limit(MAX_WORKSPACES_PER_TICK)

  let drafted = 0
  let prefiltered = 0
  let skipped = 0

  for (const integration of (integrations ?? []) as Array<Record<string, unknown>>) {
    const workspaceId = String(integration.workspace_id ?? '')
    const autoClientIds = autoClientIdsByWorkspace.get(workspaceId)
    if (!workspaceId || !autoClientIds || drafted >= MAX_DRAFTS_PER_TICK) continue
    if (!integration.api_key_ciphertext || !integration.api_key_iv) continue

    try {
      const apiKey = await decryptInstantlyApiKey({
        ciphertext: String(integration.api_key_ciphertext),
        iv: String(integration.api_key_iv),
      })

      // Attribution: managed campaigns and manually linked campaigns, the
      // same two sources the Master Inbox uses.
      const [{ data: campaignRows }, { data: linkRows }] = await Promise.all([
        admin
          .from('workspace_client_campaigns')
          .select('client_id, instantly_campaign_id')
          .eq('workspace_id', workspaceId)
          .not('instantly_campaign_id', 'is', null)
          .limit(1_000),
        admin
          .from('client_instantly_campaign_links')
          .select('client_id, instantly_campaign_id')
          .eq('workspace_id', workspaceId)
          .limit(1_000),
      ])
      const clientByCampaign = new Map<string, string>()
      for (const row of ([...(campaignRows ?? []), ...(linkRows ?? [])]) as Array<Record<string, unknown>>) {
        if (typeof row.instantly_campaign_id === 'string' && typeof row.client_id === 'string') {
          if (!clientByCampaign.has(row.instantly_campaign_id)) {
            clientByCampaign.set(row.instantly_campaign_id, row.client_id)
          }
        }
      }

      // New replies since the cursor (small overlap absorbs clock skew and
      // late provider ingestion); oldest first so the cursor advances safely.
      const cursorTs = typeof integration.auto_draft_cursor_ts === 'string'
        ? new Date(Date.parse(integration.auto_draft_cursor_ts) - CURSOR_OVERLAP_MS)
        : new Date(Date.now() - 24 * 60 * 60 * 1000)
      const query = new URLSearchParams({
        limit: '100',
        email_type: 'received',
        sort_order: 'asc',
        min_timestamp_created: cursorTs.toISOString(),
      })
      const payload = await instantlyRequest<{ items?: Array<Record<string, unknown>> }>(
        apiKey,
        '/emails',
        { query },
      )
      const emails = payload.items ?? []
      let workspaceDrafts = 0
      let cursorHigh = typeof integration.auto_draft_cursor_ts === 'string'
        ? integration.auto_draft_cursor_ts
        : null

      const { data: ownerRow } = await admin
        .from('workspace_memberships')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('role', 'owner')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      let creditsExhausted = false
      for (const raw of emails) {
        if (!raw || typeof raw !== 'object') continue
        const email = raw as Record<string, unknown>
        const createdAt = typeof email.timestamp_created === 'string' ? email.timestamp_created : null
        if (createdAt && (!cursorHigh || createdAt > cursorHigh)) cursorHigh = createdAt
        if (drafted >= MAX_DRAFTS_PER_TICK || workspaceDrafts >= MAX_DRAFTS_PER_WORKSPACE || creditsExhausted) continue

        // Auto-draft is for interested leads only: Instantly's own interest
        // flag on the reply decides. Everything else waits for an operator
        // to mark it interested (which moves it into scope for a later tick).
        if (email.i_status !== 1) continue
        const campaignId = typeof email.campaign_id === 'string' ? email.campaign_id : null
        const clientId = campaignId ? clientByCampaign.get(campaignId) ?? null : null
        if (!clientId || !autoClientIds.has(clientId)) continue
        const emailId = typeof email.id === 'string' ? email.id : null
        const threadKey = typeof email.thread_id === 'string' && email.thread_id ? email.thread_id : emailId
        if (!emailId || !threadKey) continue

        const { data: stateRow } = await admin
          .from('workspace_inbox_thread_state')
          .select('status, draft, suppressed_at, draft_claim_email_id, draft_claimed_at')
          .eq('workspace_id', workspaceId)
          .eq('thread_key', threadKey)
          .maybeSingle()
        if (stateRow) {
          if (['booked', 'archived'].includes(String(stateRow.status ?? ''))) continue
          if (stateRow.suppressed_at) continue
          const existingDraft = stateRow.draft && typeof stateRow.draft === 'object' && !Array.isArray(stateRow.draft)
            ? stateRow.draft as Record<string, unknown>
            : null
          if (existingDraft?.based_on_email_id === emailId) continue
          const claimFresh = stateRow.draft_claim_email_id === emailId
            && typeof stateRow.draft_claimed_at === 'string'
            && Date.now() - Date.parse(stateRow.draft_claimed_at) < CLAIM_TTL_MS
          if (claimFresh) continue
        }

        const bodyRecord = (email.body ?? {}) as Record<string, unknown>
        const messageText = (typeof bodyRecord.text === 'string' && bodyRecord.text.trim()
          ? bodyRecord.text
          : typeof bodyRecord.html === 'string'
            ? bodyRecord.html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim()
            : '').slice(0, 8_000)
        const subject = typeof email.subject === 'string' ? email.subject.slice(0, 300) : '(no subject)'
        if (!messageText) continue

        // Deterministic pre-filter: zero tokens, immediate triage.
        const deterministic = email.is_auto_reply === 1
          ? 'auto_reply' as const
          : detectDeterministicReply(messageText)
        if (deterministic) {
          await admin
            .from('workspace_inbox_thread_state')
            .upsert({
              workspace_id: workspaceId,
              thread_key: threadKey,
              client_id: clientId,
              classification: deterministicClassification(deterministic),
              ...(deterministic === 'opt_out' ? { suppressed_at: new Date().toISOString() } : {}),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,thread_key' })
          prefiltered += 1
          continue
        }

        // Idempotency claim BEFORE any billing or model work.
        await admin
          .from('workspace_inbox_thread_state')
          .upsert({
            workspace_id: workspaceId,
            thread_key: threadKey,
            client_id: clientId,
            draft_claim_email_id: emailId,
            draft_claimed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'workspace_id,thread_key' })

        try {
          const pkg = await generateReplyPackage({
            admin,
            workspaceId,
            clientId,
            subject,
            message: messageText,
            actorUserId: ownerRow?.user_id ?? null,
            referenceKind: 'inbox_auto_draft',
            leadEmail: typeof email.lead === 'string' ? email.lead : null,
          })
          // The one place send authority is granted, and only when the
          // operator chose auto_send AND the model was confident about a
          // reply worth answering. Everything else stays a review item.
          const autoSendable = autoSendClientIds.has(clientId)
            && packageIsAutoSendable(pkg.classification)
            && Boolean(pkg.body.trim())
          await admin
            .from('workspace_inbox_thread_state')
            .upsert({
              workspace_id: workspaceId,
              thread_key: threadKey,
              client_id: clientId,
              status: 'review',
              classification: pkg.classification,
              draft: {
                subject: pkg.subject,
                body: pkg.body,
                nudges: pkg.nudges,
                based_on_email_id: emailId,
                generated_at: new Date().toISOString(),
              },
              auto_send_eligible_at: autoSendable
                ? new Date(Date.now() + AUTO_SEND_HOLD_MS).toISOString()
                : null,
              auto_sent_at: null,
              auto_send_error: null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,thread_key' })
          drafted += 1
          workspaceDrafts += 1
          await writeAudit(admin, {
            workspaceId,
            actorUserId: ownerRow?.user_id ?? null,
            action: 'workspace.inbox.auto_drafted',
            entityType: 'client',
            entityId: clientId,
            metadata: { thread_key: threadKey, email_id: emailId, queued_for_send: autoSendable },
          })
        } catch (error) {
          if (error instanceof HttpError && error.code === 'INSUFFICIENT_CREDITS') {
            creditsExhausted = true
          }
          // SDR_PROFILE_NOT_READY, DRAFT_FAILED, and transient errors leave
          // the claim to expire; the message is retried next tick.
          skipped += 1
        }
      }

      if (cursorHigh && cursorHigh !== integration.auto_draft_cursor_ts) {
        await admin
          .from('workspace_instantly_integrations')
          .update({ auto_draft_cursor_ts: cursorHigh })
          .eq('workspace_id', workspaceId)
      }
    } catch (_error) {
      // One broken workspace never stops the sweep.
      skipped += 1
    }
  }

  // ---------------------------------------------------------------------
  // Phase two: dispatch the drafts that earned it.
  //
  // Separate from generation on purpose. The hold window means a package is
  // written by one tick and only sent by a later one, so the inbox always
  // shows a human the reply before it leaves — and an operator who edits,
  // archives, or suppresses the thread in between wins, because every one of
  // those actions fails the claim below.
  const autoSent = await dispatchDueAutoSends(admin)

  return json(200, {
    drafted,
    prefiltered,
    skipped,
    auto_sent: autoSent.sent,
    auto_send_skipped: autoSent.skipped,
    workspaces: (integrations ?? []).length,
  })
})

interface DueRow {
  workspace_id: string
  thread_key: string
  client_id: string
  draft: Record<string, unknown> | null
}

// deno-lint-ignore no-explicit-any
async function dispatchDueAutoSends(admin: any): Promise<{ sent: number; skipped: number }> {
  const { data: due, error: dueError } = await admin
    .from('workspace_inbox_thread_state')
    .select('workspace_id, thread_key, client_id, draft')
    .eq('status', 'review')
    .is('auto_sent_at', null)
    .is('suppressed_at', null)
    .not('auto_send_eligible_at', 'is', null)
    .lte('auto_send_eligible_at', new Date().toISOString())
    .order('auto_send_eligible_at', { ascending: true })
    .limit(40)
  if (dueError) return { sent: 0, skipped: 0 }

  const apiKeyByWorkspace = new Map<string, string | null>()
  const timezoneByClient = new Map<string, string>()
  // deno-lint-ignore no-explicit-any
  const ownerByWorkspace = new Map<string, any>()
  const sentByWorkspace = new Map<string, number>()
  let sent = 0
  let skipped = 0

  for (const raw of (due ?? []) as DueRow[]) {
    if (sent >= MAX_AUTO_SENDS_PER_TICK) break
    if ((sentByWorkspace.get(raw.workspace_id) ?? 0) >= MAX_AUTO_SENDS_PER_WORKSPACE) continue

    const recordFailure = async (reason: string) => {
      await admin
        .from('workspace_inbox_thread_state')
        .update({ auto_send_error: reason.slice(0, 300), updated_at: new Date().toISOString() })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
      skipped += 1
    }

    try {
      const draft = raw.draft && typeof raw.draft === 'object' && !Array.isArray(raw.draft)
        ? raw.draft as Record<string, unknown>
        : null
      const body = typeof draft?.body === 'string' ? draft.body.trim() : ''
      const subject = typeof draft?.subject === 'string' ? draft.subject.trim() : ''
      if (!body) {
        await recordFailure('empty_draft: there is no reply body to send')
        continue
      }

      // Re-check the mode at dispatch time. Switching a client back to manual
      // or auto_draft must stop sends that were staged while auto_send was on.
      const { data: clientRow } = await admin
        .from('clients')
        .select('ai_sdr_mode, status')
        .eq('id', raw.client_id)
        .eq('workspace_id', raw.workspace_id)
        .maybeSingle()
      if (clientRow?.ai_sdr_mode !== 'auto_send' || clientRow?.status !== 'active') {
        await admin
          .from('workspace_inbox_thread_state')
          .update({ auto_send_eligible_at: null, updated_at: new Date().toISOString() })
          .eq('workspace_id', raw.workspace_id)
          .eq('thread_key', raw.thread_key)
        skipped += 1
        continue
      }

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
      // Outside business hours the row simply waits for a later tick.
      if (!withinSendWindow(timezoneByClient.get(raw.client_id)!)) continue

      // The live thread decides. If the host wrote again after this draft was
      // written, the draft is answering a stale message — hand it back.
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
      const latestHuman = messages.find((message) => message.is_auto_reply !== 1)
      if (!latestHuman || typeof latestHuman.id !== 'string') {
        await recordFailure('thread_not_found: Instantly returned no message to reply to')
        continue
      }
      // Fail closed: only reply to the exact inbound message the draft was
      // written from. A newer host message means a human should read it.
      if (latestHuman.id !== draft?.based_on_email_id) {
        await admin
          .from('workspace_inbox_thread_state')
          .update({
            status: 'needs_reply',
            auto_send_eligible_at: null,
            auto_send_error: 'superseded: the host wrote again before this reply was sent',
            updated_at: new Date().toISOString(),
          })
          .eq('workspace_id', raw.workspace_id)
          .eq('thread_key', raw.thread_key)
        skipped += 1
        continue
      }
      const replyAnchor = messages[0]
      if (typeof replyAnchor.eaccount !== 'string' || !replyAnchor.eaccount) {
        await recordFailure('sender_mailbox_unknown: the thread has no sending mailbox to reply from')
        continue
      }

      // Claim BEFORE dispatch. The compare-and-set re-reads status, the unsent
      // stamp, and suppression under one guard, so an overlapping tick or an
      // operator acting during this loop can never produce a second send.
      const { data: claimed } = await admin
        .from('workspace_inbox_thread_state')
        .update({ auto_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)
        .eq('status', 'review')
        .is('auto_sent_at', null)
        .is('suppressed_at', null)
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
            subject: (subject || `Re: ${typeof latestHuman.subject === 'string' ? latestHuman.subject : ''}`).slice(0, 300),
            body: { text: body },
          },
        })
      } catch (sendError) {
        if (
          sendError instanceof InstantlyApiError
          && sendError.status >= 400 && sendError.status < 500
          && sendError.status !== 408 && sendError.status !== 429
        ) {
          // Definite pre-dispatch rejection: release the claim so a later tick
          // can retry, with the reason visible in the inbox.
          await admin
            .from('workspace_inbox_thread_state')
            .update({
              auto_sent_at: null,
              auto_send_error: `send_rejected: ${sendError.message}`.slice(0, 300),
              updated_at: new Date().toISOString(),
            })
            .eq('workspace_id', raw.workspace_id)
            .eq('thread_key', raw.thread_key)
          skipped += 1
          continue
        }
        // Ambiguous (timeout, 5xx, rate limit): the mail may have gone out.
        // Keep the claim so it can never double-fire, and surface it.
        await recordFailure('delivery_unknown: the automatic reply did not confirm — it stays claimed to prevent a duplicate')
        continue
      }

      // Sent. Moving to 'replied' hands the thread to the nudge scheduler,
      // which runs the staged follow-ups exactly as it does after a human
      // sends — one path, one behaviour.
      await admin
        .from('workspace_inbox_thread_state')
        .update({ status: 'replied', auto_send_error: null, updated_at: new Date().toISOString() })
        .eq('workspace_id', raw.workspace_id)
        .eq('thread_key', raw.thread_key)

      sent += 1
      sentByWorkspace.set(raw.workspace_id, (sentByWorkspace.get(raw.workspace_id) ?? 0) + 1)

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
      await writeAudit(admin, {
        workspaceId: raw.workspace_id,
        actorUserId: ownerByWorkspace.get(raw.workspace_id)?.user_id ?? null,
        action: 'workspace.inbox.auto_sent',
        entityType: 'client',
        entityId: raw.client_id,
        metadata: { thread_key: raw.thread_key, reply_to_id: latestHuman.id },
      })
    } catch (error) {
      // One broken thread never stops the sweep.
      skipped += 1
      if (error instanceof InstantlyApiError && error.status === 401) {
        apiKeyByWorkspace.set(raw.workspace_id, null)
      }
    }
  }

  return { sent, skipped }
}
