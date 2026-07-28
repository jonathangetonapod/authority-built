// White-labeled client portal password reset email. Mirrors the onboarding
// email's fail-soft delivery semantics: missing provider config skips the
// send instead of failing the reset request.

import { HttpError } from './workspaceAuth.ts'
import { whiteLabelOnboardingSender } from './workspaceOnboarding.ts'
import { platformOrigin } from './workspaceOrigin.ts'

export interface PortalResetEmailResult {
  status: 'sent' | 'failed' | 'skipped'
  providerMessageId: string | null
  error: string | null
}

export function portalResetUrl(token: string, origin?: string): string {
  const url = new URL('/portal/reset', origin ?? platformOrigin())
  url.searchParams.set('token', token)
  return url.toString()
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function sendPortalInviteEmail(input: {
  workspaceName: string
  recipientName: string
  recipientEmail: string
  url: string
  loginUrl: string
}): Promise<PortalResetEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) return { status: 'skipped', providerMessageId: null, error: null }

  const from = whiteLabelOnboardingSender(Deno.env.get('RESEND_FROM_EMAIL'), input.workspaceName)
  if (!from) return { status: 'skipped', providerMessageId: null, error: null }

  const workspaceName = escapeHtml(input.workspaceName)
  const recipientName = escapeHtml(input.recipientName)
  const url = escapeHtml(input.url)
  const loginUrl = escapeHtml(input.loginUrl)
  const subject = `Your ${input.workspaceName} client portal is ready`
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#19172d"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#171827;border-radius:20px 20px 0 0;padding:32px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${workspaceName}</div><h1 style="margin:10px 0 0;font-size:28px">Your client portal is ready</h1></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 20px 20px;padding:32px"><p style="font-size:17px">Hi ${recipientName},</p><p style="line-height:1.65;color:#514d68">${workspaceName} set up a private portal where you can follow your podcast bookings, upcoming recordings, and published episodes. Choose a password to get started.</p><div style="padding:20px 0;text-align:center"><a href="${url}" style="display:inline-block;background:#171827;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px">Set your password</a></div><p style="font-size:13px;color:#77728e">This setup link expires in 7 days. Afterwards, sign in any time at <a href="${loginUrl}" style="color:#514d68">${loginUrl}</a> with this email address.</p></div></div></body></html>`
  const text = `Hi ${input.recipientName},\n\n${input.workspaceName} set up a private client portal for you to follow your podcast bookings, upcoming recordings, and published episodes.\n\nSet your password (link expires in 7 days, single use):\n${input.url}\n\nAfterwards, sign in any time at ${input.loginUrl} with this email address.`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.recipientEmail], subject, html, text }),
    })
    if (!response.ok) {
      console.error('[Portal Invite Email] Provider rejected the message')
      return { status: 'failed', providerMessageId: null, error: 'Email provider rejected the message' }
    }
    const payload = await response.json().catch(() => null) as { id?: string } | null
    return {
      status: 'sent',
      providerMessageId: typeof payload?.id === 'string' ? payload.id.slice(0, 255) : null,
      error: null,
    }
  } catch (_error) {
    console.error('[Portal Invite Email] Provider unavailable')
    return { status: 'failed', providerMessageId: null, error: 'Email provider was unavailable' }
  }
}

export function portalLoginUrl(brandingSlug: string | null, origin?: string): string {
  const url = new URL('/portal/login', origin ?? platformOrigin())
  if (brandingSlug) url.searchParams.set('b', brandingSlug)
  return url.toString()
}

export async function sendPortalResetEmail(input: {
  workspaceName: string
  recipientName: string
  recipientEmail: string
  url: string
}): Promise<PortalResetEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim()
  if (!apiKey) return { status: 'skipped', providerMessageId: null, error: null }

  const from = whiteLabelOnboardingSender(Deno.env.get('RESEND_FROM_EMAIL'), input.workspaceName)
  if (!from) return { status: 'skipped', providerMessageId: null, error: null }

  const workspaceName = escapeHtml(input.workspaceName)
  const recipientName = escapeHtml(input.recipientName)
  const url = escapeHtml(input.url)
  const subject = `Reset your ${input.workspaceName} client portal password`
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#19172d"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#171827;border-radius:20px 20px 0 0;padding:32px;color:#fff"><div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${workspaceName}</div><h1 style="margin:10px 0 0;font-size:28px">Reset your portal password</h1></div><div style="background:#fff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 20px 20px;padding:32px"><p style="font-size:17px">Hi ${recipientName},</p><p style="line-height:1.65;color:#514d68">We received a request to reset your client portal password. Use the button below to choose a new one. If you did not request this, you can safely ignore this email — your password stays unchanged.</p><div style="padding:20px 0;text-align:center"><a href="${url}" style="display:inline-block;background:#171827;color:#fff;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px">Choose a new password</a></div><p style="font-size:13px;color:#77728e">This link expires in 60 minutes and can be used once.</p></div></div></body></html>`
  const text = `Hi ${input.recipientName},\n\nWe received a request to reset your ${input.workspaceName} client portal password. Open this link to choose a new one (expires in 60 minutes, single use):\n\n${input.url}\n\nIf you did not request this, ignore this email — your password stays unchanged.`

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [input.recipientEmail], subject, html, text }),
    })
    if (!response.ok) {
      console.error('[Portal Reset Email] Provider rejected the message')
      return { status: 'failed', providerMessageId: null, error: 'Email provider rejected the message' }
    }
    const payload = await response.json().catch(() => null) as { id?: string } | null
    return {
      status: 'sent',
      providerMessageId: typeof payload?.id === 'string' ? payload.id.slice(0, 255) : null,
      error: null,
    }
  } catch (_error) {
    console.error('[Portal Reset Email] Provider unavailable')
    return { status: 'failed', providerMessageId: null, error: 'Email provider was unavailable' }
  }
}
