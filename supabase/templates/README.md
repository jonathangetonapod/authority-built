# Supabase Auth email templates

These are the emails sent by **Supabase Auth (GoTrue)**, not by Resend. Resend
sends onboarding, portal reset and client notifications from
`supabase/functions/_shared/`; anything triggered by `admin.auth.admin.*` comes
from GoTrue and is rendered from the templates configured on the project.

| File | Supabase template | Sent by |
| --- | --- | --- |
| `invite.html` | Invite user | `manage-workspace-users` (new workspace owner), `manage-workspace-staff` (joining an existing workspace) |

## How to apply a change

The dashboard is the live copy; this folder is the source of truth. After
editing a file here:

1. Supabase dashboard → **Authentication → Emails → Invite user**
2. Set the subject to: `Your invitation to Get On A Pod`
3. Paste the contents of `invite.html` into the message body, and save.

**Do not run `supabase config push` to do this.** `config.toml` here only
carries a few auth flags and the per-function `verify_jwt` settings; pushing it
would overwrite the project's remaining auth configuration (site URL, redirect
allow-list, SMTP) with local defaults.

## Template variables

GoTrue renders these as Go templates. Only these variables exist:

- `{{ .ConfirmationURL }}` — the accept link, pointing at
  `<APP_URL>/accept-invite` via the project's `/auth/v1/verify` endpoint
- `{{ .Email }}`, `{{ .SiteURL }}`, `{{ .Token }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}`
- `{{ .Data }}` — the `data` object passed to `inviteUserByEmail`

`.Data` currently carries `full_name`, `workspace_id`,
`workspace_membership_id`, and — from `manage-workspace-users` only —
`workspace_name`. **Guard every `.Data` lookup** (`{{ if .Data }}{{ if .Data.x }}`).
One template serves both invite paths, so it must render for a payload that is
missing any given key. A template that fails to render fails the send, and a
failed send is a person who never arrives.

## Two things the template cannot fix

- **Sender and deliverability.** Without custom SMTP configured, GoTrue sends
  from Supabase's shared address with a low hourly rate limit intended for
  testing. Pointing Authentication → SMTP Settings at Resend would fix that —
  **but do not do it yet**, see the Resend status below. Sending through
  Supabase's own mailer is currently the only invitation path that works.
- **Link lifetime.** The membership row allows 7 days
  (`invite_expires_at = now() + interval '7 days'`), but the emailed link dies
  after the project's email OTP expiry — `config.toml` declares 86400s (24h),
  and the dashboard value is what actually applies. Until those agree, the
  template deliberately does not promise a number; it says to ask for a fresh
  invitation instead.

## Resend status — read before touching email

As of 2026-08-02, **everything this application sends through Resend is
failing.** Invitations are unaffected because they go through Supabase Auth,
not Resend; that is the only reason the invite flow still works, and it is why
the SMTP change above is on hold.

What happened: this application and the AI SDR app (`aisdr.getonapod.com`)
shared one Resend account. The plan was to separate them, and a second account
was opened for this application with `email.getonapod.com` verified on it.
Before the cutover ran, `mail.getonapod.com` was deleted from the shared
account — the free plan allows one domain and the sibling application claimed
the slot for `mail.aisdr.getonapod.com`. The second account was then suspended,
so there is currently no account this application can send from.

    from mail.getonapod.com  ->  403  domain is not verified
    new account keys         ->  403  suspended_api_key

Affected: onboarding invitations and changes-requested emails
(`_shared/workspaceOnboarding.ts`), portal password reset and set-password
(`_shared/portalResetEmail.ts`), client notifications (`_shared/clientNotify.ts`),
and the access-request notification (`request-workspace-access`). All of them
fail closed — `status: 'failed'`, no exception, no mail.

### What is already staged

- `email.getonapod.com` is verified in the second Resend account, and its DNS
  lives in the `getonapod.com` Cloudflare zone: `resend._domainkey.email` (TXT),
  `send.email` (MX + SPF TXT). Those records are correct and should be left in
  place.
- Migration `20260803000100_resend_sender_domain_moved.sql` has been applied.
  The webhook sender gate now allowlists **`email.getonapod.com` only**.
  `mail.getonapod.com` is deliberately excluded: it is what the sibling
  application sends from, so readmitting it would undo the isolation added in
  `20260802223000`.

### To restore

Get one account able to send from `email.getonapod.com` — either by clearing
the suspension on the second account, or by adding the domain to a plan with
room for it. Then set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a local part at
`@email.getonapod.com`) and, if the webhook is being re-enabled,
`RESEND_WEBHOOK_SECRET` from whichever account ends up holding the domain.

No code change is needed for either route — the sender gate already expects
`email.getonapod.com`.

### Do not

- Point Supabase Auth SMTP at Resend until sending works again. It would turn a
  partial outage into a total one by breaking invitations too.
- Delete `mail.aisdr.getonapod.com` from the shared account. It is the sibling
  application's production sender.
- Re-add `mail.getonapod.com` to the allowlist to "fix" the gate. That address
  is no longer ours.
