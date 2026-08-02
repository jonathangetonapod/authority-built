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
  testing. Point Authentication → SMTP Settings at Resend (same API key already
  in `RESEND_API_KEY`, host `smtp.resend.com`, port 465, user `resend`) so
  invitations come from the same verified domain as everything else.
- **Link lifetime.** The membership row allows 7 days
  (`invite_expires_at = now() + interval '7 days'`), but the emailed link dies
  after the project's email OTP expiry — `config.toml` declares 86400s (24h),
  and the dashboard value is what actually applies. Until those agree, the
  template deliberately does not promise a number; it says to ask for a fresh
  invitation instead.
