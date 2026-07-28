// White-labelled milestone emails for end clients.
//
// The platform knew about every meaningful moment in a client's journey and
// told them about none of it. This module is the one place that speaks: it
// resolves the recipient, claims the event so it can only be announced once,
// sends under the workspace's own name, and records the outcome.
//
// Every entry point is best-effort by contract. A notification must never fail
// the mutation that triggered it — callers await the promise but the promise
// resolves rather than throws, and the send log carries the failure.

import { whiteLabelOnboardingSender } from './workspaceOnboarding.ts'
import { workspaceLinkOrigin } from './workspaceOrigin.ts'

type AdminClient = any

export type ClientNotificationKind =
  | 'shortlist_ready'
  | 'booking_confirmed'
  | 'episode_published'
  | 'client_approved'

export interface ClientNotificationResult {
  status: 'sent' | 'failed' | 'skipped' | 'duplicate'
  reason?: string
}

interface Recipient {
  email: string
  name: string
  workspaceName: string
  reviewUrl: string | null
  portalUrl: string | null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function appOrigin(): string | null {
  for (const candidate of [Deno.env.get('APP_URL'), Deno.env.get('WEB_URL')]) {
    if (!candidate?.trim()) continue
    try {
      const parsed = new URL(candidate)
      const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol === 'https:' || (local && parsed.protocol === 'http:')) return parsed.origin
    } catch {
      // Try the next configured application URL.
    }
  }
  return null
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

async function resolveRecipient(
  admin: AdminClient,
  workspaceId: string,
  clientId: string,
): Promise<Recipient | null> {
  const { data: client } = await admin
    .from('clients')
    .select('id,workspace_id,name,email,contact_person,dashboard_slug,dashboard_enabled,portal_access_enabled,password_set_at,notifications_enabled')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!client || client.workspace_id !== workspaceId) return null
  if (client.notifications_enabled === false) return null

  const email = typeof client.email === 'string' ? client.email.trim() : ''
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) return null

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id,name')
    .eq('id', workspaceId)
    .maybeSingle()

  // Client-facing, so it carries the agency's own hostname when they have one.
  const origin = await workspaceLinkOrigin(admin, workspaceId).catch(() => appOrigin())
  const slug = typeof client.dashboard_slug === 'string' ? client.dashboard_slug : null
  // Two front doors: the portal for clients who have a password, the public
  // capability URL for everyone else. Never link to a page they cannot open.
  const portalUrl = origin && client.portal_access_enabled && client.password_set_at
    ? `${origin}/portal/login${slug ? `?b=${encodeURIComponent(slug)}` : ''}`
    : null
  const reviewUrl = origin && slug && client.dashboard_enabled
    ? `${origin}/client/${encodeURIComponent(slug)}`
    : null

  const contact = typeof client.contact_person === 'string' ? client.contact_person.trim() : ''
  return {
    email,
    name: (contact || String(client.name || '').trim() || 'there').split(' ')[0],
    workspaceName: String(workspace?.name || 'Your podcast team').trim() || 'Your podcast team',
    reviewUrl,
    portalUrl,
  }
}

function renderEmail(input: {
  workspaceName: string
  heading: string
  greetingName: string
  body: string[]
  ctaLabel: string | null
  ctaUrl: string | null
  footer: string | null
}): { html: string; text: string } {
  const workspaceName = escapeHtml(input.workspaceName)
  const heading = escapeHtml(input.heading)
  const paragraphs = input.body
    .map((line) => `<p style="line-height:1.65;color:#514d68;margin:0 0 14px">${escapeHtml(line)}</p>`)
    .join('')
  const cta = input.ctaUrl && input.ctaLabel
    ? `<div style="padding:14px 0 4px;text-align:center"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#171827;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px">${escapeHtml(input.ctaLabel)}</a></div>`
    : ''
  const footer = input.footer
    ? `<p style="font-size:13px;color:#77728e;margin:18px 0 0">${escapeHtml(input.footer)}</p>`
    : ''
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#19172d"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#171827;border-radius:20px 20px 0 0;padding:32px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${workspaceName}</div><h1 style="margin:10px 0 0;font-size:26px">${heading}</h1></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 20px 20px;padding:32px"><p style="font-size:17px;margin:0 0 14px">Hi ${escapeHtml(input.greetingName)},</p>${paragraphs}${cta}${footer}</div></div></body></html>`

  const textCta = input.ctaUrl ? `\n\n${input.ctaLabel}: ${input.ctaUrl}` : ''
  const textFooter = input.footer ? `\n\n${input.footer}` : ''
  const text = `Hi ${input.greetingName},\n\n${input.body.join('\n\n')}${textCta}${textFooter}`
  return { html, text }
}

async function deliver(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    kind: ClientNotificationKind
    eventKey: string
    recipients: string[]
    workspaceName: string
    subject: string
    html: string
    text: string
    metadata?: Record<string, unknown>
  },
): Promise<ClientNotificationResult> {
  // Claim before send: the unique index on (workspace, client, event_key)
  // turns a concurrent or retried caller into a duplicate, not a second email.
  const { error: claimError } = await admin
    .from('client_notifications')
    .insert({
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      kind: input.kind,
      event_key: input.eventKey.slice(0, 200),
      recipient_email: input.recipients[0],
      status: 'sending',
      metadata: input.metadata || {},
    })
  if (claimError) {
    // 23505 is the unique violation: this milestone was already announced.
    if (String((claimError as { code?: string }).code) === '23505') return { status: 'duplicate' }
    console.error('[Client Notify] Could not claim the notification')
    return { status: 'failed', reason: 'claim_failed' }
  }

  const finish = async (
    status: 'sent' | 'failed' | 'skipped',
    extra: { providerMessageId?: string | null; error?: string | null },
  ) => {
    await admin
      .from('client_notifications')
      .update({
        status,
        provider_message_id: extra.providerMessageId ?? null,
        error: extra.error ?? null,
      })
      .eq('workspace_id', input.workspaceId)
      .eq('client_id', input.clientId)
      .eq('event_key', input.eventKey.slice(0, 200))
  }

  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  const from = whiteLabelOnboardingSender(Deno.env.get('RESEND_FROM_EMAIL'), input.workspaceName)
  if (!apiKey || !from) {
    await finish('skipped', { error: 'Email delivery is not configured' })
    return { status: 'skipped', reason: 'not_configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: input.recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    if (!response.ok) {
      console.error('[Client Notify] Provider rejected the message')
      await finish('failed', { error: 'Email provider rejected the message' })
      return { status: 'failed', reason: 'provider_rejected' }
    }
    const data = await response.json().catch(() => ({}))
    await finish('sent', {
      providerMessageId: typeof data?.id === 'string' ? data.id.slice(0, 255) : null,
    })
    return { status: 'sent' }
  } catch {
    console.error('[Client Notify] Provider unavailable')
    await finish('failed', { error: 'Email provider was unavailable' })
    return { status: 'failed', reason: 'provider_unavailable' }
  }
}

/**
 * New shows are waiting on the client's yes or no.
 *
 * Deliberately debounced to one email per client per day: an operator adding
 * shows in three sittings is one piece of news, not three. The count is the
 * client's whole pending queue at send time rather than the size of the batch
 * that triggered it, so the number stays true no matter when it fires.
 */
export async function notifyShortlistReady(
  admin: AdminClient,
  input: { workspaceId: string; clientId: string; day: string },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }
  const url = recipient.reviewUrl || recipient.portalUrl
  if (!url) return { status: 'skipped', reason: 'no_review_surface' }

  const [{ data: visible }, { data: decided }] = await Promise.all([
    admin
      .from('client_dashboard_podcasts')
      .select('podcast_id')
      .eq('client_id', input.clientId)
      .eq('visibility', 'visible')
      .limit(2_000),
    admin
      .from('client_podcast_feedback')
      .select('podcast_id,status')
      .eq('client_id', input.clientId)
      .limit(2_000),
  ])
  const answered = new Set(
    (decided || [])
      .filter((row: { status?: string | null }) => row.status === 'approved' || row.status === 'rejected')
      .map((row: { podcast_id: string }) => row.podcast_id),
  )
  const count = (visible || []).filter((row: { podcast_id: string }) => !answered.has(row.podcast_id)).length
  if (count < 1) return { status: 'skipped', reason: 'nothing_pending' }

  const shows = count === 1 ? '1 podcast' : `${count} podcasts`
  const { html, text } = renderEmail({
    workspaceName: recipient.workspaceName,
    heading: `${shows} ready for your review`,
    greetingName: recipient.name,
    body: [
      `We researched ${shows} that look like a strong fit for you and added them to your review list.`,
      'Take a look and mark the ones you would like us to pitch. We only reach out to shows you approve.',
    ],
    ctaLabel: 'Review the shows',
    ctaUrl: url,
    footer: `Sent by ${recipient.workspaceName}.`,
  })
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'shortlist_ready',
    eventKey: `shortlist:${input.day}`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    subject: `${shows} ready for your review`,
    html,
    text,
    metadata: { pending_count: count },
  })
}

/** A recording is on the calendar. */
export async function notifyBookingConfirmed(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    bookingId: string
    podcastName: string
    hostName?: string | null
    recordingDate?: string | null
  },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

  const show = input.podcastName?.trim() || 'a podcast'
  const when = formatDate(input.recordingDate)
  const host = input.hostName?.trim()
  const body = [
    when
      ? `You are booked on ${show}${host ? ` with ${host}` : ''}. The recording is set for ${when}.`
      : `You are booked on ${show}${host ? ` with ${host}` : ''}. We are confirming the recording date and will add it to your calendar as soon as it is set.`,
    'It is on your calendar in the portal, along with everything else in flight.',
  ]
  const { html, text } = renderEmail({
    workspaceName: recipient.workspaceName,
    heading: `You're booked on ${show}`,
    greetingName: recipient.name,
    body,
    ctaLabel: recipient.portalUrl ? 'Open your calendar' : null,
    ctaUrl: recipient.portalUrl,
    footer: `Sent by ${recipient.workspaceName}.`,
  })
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'booking_confirmed',
    eventKey: `booking:${input.bookingId}:booked`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    subject: `You're booked on ${show}`,
    html,
    text,
    metadata: { booking_id: input.bookingId, recording_date: input.recordingDate || null },
  })
}

/** The episode is live and shareable. */
export async function notifyEpisodePublished(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    bookingId: string
    podcastName: string
    episodeUrl?: string | null
  },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

  const show = input.podcastName?.trim() || 'your podcast'
  const listenUrl = input.episodeUrl?.trim() || recipient.portalUrl
  const { html, text } = renderEmail({
    workspaceName: recipient.workspaceName,
    heading: `Your episode of ${show} is live`,
    greetingName: recipient.name,
    body: [
      `Your interview on ${show} has been published.`,
      'Sharing it with your own audience in the first week is what turns one appearance into real reach.',
    ],
    ctaLabel: listenUrl ? (input.episodeUrl?.trim() ? 'Listen to the episode' : 'Open your portal') : null,
    ctaUrl: listenUrl,
    footer: `Sent by ${recipient.workspaceName}.`,
  })
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'episode_published',
    eventKey: `booking:${input.bookingId}:published`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    subject: `Your episode of ${show} is live`,
    html,
    text,
    metadata: { booking_id: input.bookingId, episode_url: input.episodeUrl || null },
  })
}

/**
 * The other direction: the client acted, and the team needs to know so the
 * approved shows do not sit unpitched. Goes to workspace managers, not the
 * client, so it is deliberately plain rather than white-labelled marketing.
 */
export async function notifyWorkspaceOfApprovals(
  admin: AdminClient,
  input: { workspaceId: string; clientId: string; day: string },
): Promise<ClientNotificationResult> {
  const { data: client } = await admin
    .from('clients')
    .select('id,workspace_id,name')
    .eq('id', input.clientId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()
  if (!client || client.workspace_id !== input.workspaceId) return { status: 'skipped', reason: 'no_client' }

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id,name')
    .eq('id', input.workspaceId)
    .maybeSingle()

  const { data: managers } = await admin
    .from('workspace_memberships')
    .select('workspace_id,email_normalized,role,status')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .limit(10)

  const emails: string[] = [...new Set<string>((managers || [])
    .filter((member: { workspace_id?: string }) => member.workspace_id === input.workspaceId)
    .map((member: { email_normalized?: string }) => String(member.email_normalized || '').trim())
    .filter((email: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)))]
  if (emails.length === 0) return { status: 'skipped', reason: 'no_manager_email' }

  const clientName = String(client.name || 'A client').trim()
  const { count } = await admin
    .from('client_podcast_feedback')
    .select('podcast_id', { count: 'exact', head: true })
    .eq('client_id', input.clientId)
    .eq('status', 'approved')
  const approved = typeof count === 'number' ? count : 0
  if (approved < 1) return { status: 'skipped', reason: 'nothing_approved' }
  const shows = approved === 1 ? '1 show' : `${approved} shows`
  // Deliberately the platform origin: /app is the agency's own workspace, not
  // a page their client is ever meant to open.
  const origin = appOrigin()
  const url = origin ? `${origin}/app/clients/${input.clientId}` : null
  const { html, text } = renderEmail({
    workspaceName: String(workspace?.name || 'Get On A Pod'),
    heading: `${clientName} is approving shows`,
    greetingName: 'team',
    body: [
      `${clientName} just approved a show for outreach. That is ${shows} approved in total.`,
      'They are ready to be researched and pitched.',
    ],
    ctaLabel: url ? 'Open the client' : null,
    ctaUrl: url,
    footer: null,
  })
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'client_approved',
    eventKey: `approvals:${input.day}`,
    recipients: emails,
    workspaceName: String(workspace?.name || 'Get On A Pod'),
    subject: `${clientName} approved a podcast`,
    html,
    text,
    metadata: { approved_total: approved, recipients: emails.length },
  })
}
