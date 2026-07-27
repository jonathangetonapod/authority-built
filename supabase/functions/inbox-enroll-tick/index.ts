// Master Inbox auto-enrollment tick. Invoked by pg_cron via pg_net every 15
// minutes with a shared secret — no user JWT (verify_jwt = false). For each
// client whose SDR mode is auto_draft (or a legacy auto_send row), every new
// attributed host reply is classified and packaged (reply + numbered nudges)
// into the review queue. This tick NEVER sends: automated dispatch was
// removed on 2026-07-26 (operator decision — no email leaves the platform
// without a person sending it). Every package stops in review.
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
  instantlyRequest,
} from '../_shared/instantly.ts'
import {
  detectDeterministicReply,
  deterministicClassification,
  generateReplyPackage,
} from '../_shared/inboxSdr.ts'

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
  for (const client of (autoClients ?? []) as Array<{ id: string; workspace_id: string | null; ai_sdr_mode?: string }>) {
    if (!client.workspace_id) continue
    const set = autoClientIdsByWorkspace.get(client.workspace_id) ?? new Set<string>()
    set.add(client.id)
    autoClientIdsByWorkspace.set(client.workspace_id, set)
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

      // Which show each host address belongs to. A reply is the moment a
      // relationship becomes real, so the thread records the show it came
      // from rather than waiting for an analytics sync to infer it.
      const { data: contactRows } = await admin
        .from('workspace_client_campaign_targets')
        .select('contact_email, podcast_id')
        .eq('workspace_id', workspaceId)
        .not('contact_email', 'is', null)
        .limit(5_000)
      const podcastByContact = new Map<string, string>()
      for (const row of (contactRows ?? []) as Array<Record<string, unknown>>) {
        if (typeof row.contact_email === 'string' && typeof row.podcast_id === 'string') {
          const key = row.contact_email.trim().toLowerCase()
          if (key && !podcastByContact.has(key)) podcastByContact.set(key, row.podcast_id)
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
        // Identity of the human who wrote, and the show they host. Stamped on
        // every thread write so a reply lands in the relationship register
        // immediately instead of waiting on an analytics sync.
        const leadEmail = typeof email.lead === 'string' ? email.lead.trim().toLowerCase() : ''
        const leadIdentity = {
          ...(leadEmail ? { lead_email: leadEmail } : {}),
          ...(leadEmail && podcastByContact.has(leadEmail) ? { podcast_id: podcastByContact.get(leadEmail) } : {}),
        }

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
              ...leadIdentity,
              ...(deterministic === 'opt_out' ? { suppressed_at: new Date().toISOString() } : {}),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'workspace_id,thread_key' })
          // An opt-out is directed at the sender, not at one client's
          // campaign. Record it workspace-wide so no other client's outreach
          // can reach this person again.
          if (deterministic === 'opt_out' && leadEmail) {
            await admin
              .from('workspace_outreach_suppressions')
              .upsert({
                workspace_id: workspaceId,
                contact_email: leadEmail,
                reason: 'opted_out',
                source: 'inbox_auto',
                note: `Detected in a reply for client ${clientId}`,
              }, { onConflict: 'workspace_id,contact_email' })
          }
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
            ...leadIdentity,
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
          await admin
            .from('workspace_inbox_thread_state')
            .upsert({
              workspace_id: workspaceId,
              thread_key: threadKey,
              client_id: clientId,
              ...leadIdentity,
              status: 'review',
              classification: pkg.classification,
              draft: {
                subject: pkg.subject,
                body: pkg.body,
                nudges: pkg.nudges,
                based_on_email_id: emailId,
                generated_at: new Date().toISOString(),
              },
              // Automated sending is removed: no package is ever eligible.
              // Writing null also clears any stamp left from when it existed.
              auto_send_eligible_at: null,
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
            metadata: { thread_key: threadKey, email_id: emailId },
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

  return json(200, {
    drafted,
    prefiltered,
    skipped,
    workspaces: (integrations ?? []).length,
  })
})
