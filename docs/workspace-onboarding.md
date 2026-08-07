# Workspace onboarding

## Product boundary

Workspace onboarding is a tenant-owned intake and review workflow. An agency
owner or administrator starts it for an existing client or creates a minimal
client while sending the invitation. The invited contact opens an expiring
capability link and does not need a portal account. Onboarding never grants
portal access.

The same management experience is available at:

- `/app/onboarding` for the signed-in workspace owner or staff member; and
- `/app/workspaces/:workspaceId/onboarding` for the platform owner managing
  the explicitly selected workspace without impersonating its owner.

Members can read only onboarding records explicitly assigned to their active
workspace membership. Owners, admins, and the platform owner can manage the
selected workspace's templates, invitations, reviews, assignments, and
approved pitch profiles.

## Lifecycle

An invitation is pinned to an immutable published template version. Its public
state moves through `invited`, `in_progress`, `submitted`,
`changes_requested`, and `approved`. Revoked is terminal, and revocation also
destroys the stored capability verifier, so the revoked URL can never resolve
again. Expired is not terminal and is never stored — it is computed from the
link's expiry, and Extend or Rotate resurrects the intake with its draft
intact. Revoking is refused while answers sit `submitted`: approval and
change requests both require that status, so revoking there would strand a
completed intake permanently. Approve or request changes first.
The default expiry is 14 days and the hard maximum is 90 days; extending an
already long-lived link clamps to the 90-day ceiling instead of refusing.
The activity table records the first successful client form view separately
from the first saved edit and submission. Metadata-only link unfurls do not
count as client views.

Drafts autosave to the server with an optimistic lock version. No onboarding
answers or capability tokens are stored in browser storage. A submitted answer
set becomes an immutable numbered revision. Reviewers leave notes on specific
questions, and the client can submit another immutable revision in response.
Requesting changes can send a workspace-branded email when Resend is configured
and always returns the current secure link for manual delivery. The product
does not schedule or send reminder emails; the agency owns follow-up and can
resend the link from its own mailbox. "Needs chasing" in the list is computed
in the browser from timestamps — nothing runs server-side. The outcome of each
invitation or change-request send (`sent`, `failed`, `skipped`) is recorded
and surfaced on the list: a failed or unconfigured send shows in the activity
column and in the chase reason instead of masquerading as "Sent". A failed
send is never retried automatically. Staff previewing the client form from
the invitation dialog do not stamp the first-view timestamp; only a plain
open of the shared link counts as client activity.

The shipped review flow is answers-only: a reviewer approves the submitted
answers or requests changes. AI pitch-profile drafting is deliberately not
part of it — submission records the profile draft as `failed` without calling
a model, because no shipped screen reviews, edits, or approves a profile.
(The profile approval RPCs and service functions still exist server-side for
a future flow.) Answers approval copies only configured question mappings
into the client record. If a mapped email change would invoke the existing
portal credential/session revocation lifecycle, the email mapping is skipped
and audited; portal access and artifacts remain untouched. Note that approval
overwrites mapped client fields (including `bio`) with the submitted answers;
polish the client record after approving, not before.

## Templates and files

Each new private workspace receives a published default podcast-guest intake.
Workspaces can create multiple reusable templates, publish immutable versions,
choose an optional default, and duplicate templates. Each invitation snapshots
client-specific welcome copy, completion copy, accent color, and an optional
client logo without changing the published questions. The builder permits at
most 12 sections, 100 questions, and 50 choices per select question.

Supported fields are short text, long text, email, URL, single select, multi
select, yes/no, date, image upload, and PDF upload. Files use the private
`workspace-onboarding-assets` bucket. PNG, JPEG, and WebP images are limited to
5 MB; PDFs are limited to 10 MB. Browser clients receive only short-lived
signed URLs after capability or staff authorization.
Per-invitation client logos are also stored under the invitation's private
Storage prefix and use short-lived signed URLs. If no override is supplied, the
public form uses the workspace logo.

## Capability and retention rules

The public route is `/onboarding/:token`. A token binds the instance UUID and
generation with HMAC-SHA-256. PostgreSQL stores only the SHA-256 token verifier,
never the raw capability. Rotating a link increments its generation and
preserves the server draft; the previous link stops working immediately.

Expired drafts, revisions, comments, and files are retained for agency review.
Archiving an active intake revokes its capability and stops notifications.
Authorized workspace managers can reopen or copy the current deterministic
capability link without rotating it. Rotation is reserved for intentionally
invalidating every previously shared URL, and the UI prevents overlapping link
actions so an immediately stale link cannot replace the newest result.
Permanent PII purge requires an archived record plus the exact `PURGE`
confirmation. The Edge Function first deletes every private Storage object and
only then deletes database intake data, including metadata for previously
removed files; if Storage enumeration or deletion fails, database records
remain retryable. The underlying client record is always retained.

## Server configuration

Set these as server-only Supabase Edge Function secrets:

- `ONBOARDING_CAPABILITY_SECRET`: at least 32 characters; changing it
  invalidates every outstanding onboarding link.
- `APP_URL` or `WEB_URL`: canonical application origin used to construct
  links.
- `RESEND_API_KEY`: optional; without it, delivery is marked skipped and the
  link is still returned.
- `RESEND_FROM_EMAIL`: optional verified sender mailbox. The workspace name is
  always used as the display sender; without a valid sender, email is skipped
  and the secure link is still returned.
- `ANTHROPIC_API_KEY`: optional; required for AI pitch drafts.
- `ONBOARDING_AI_MODEL`: optional model override.

## Deployment order

1. Capture the normal database backup and current production inventory.
2. Apply `20260722000400_workspace_branding.sql` if it is not already present,
   then apply `20260722000500_workspace_onboarding.sql` and
   `20260722000600_workspace_onboarding_white_label.sql`, followed by
   `20260723000100_workspace_onboarding_activity.sql`,
   `20260723000200_workspace_onboarding_answer_approval.sql`,
   `20260723000300_default_workspace_onboarding_parity.sql`, and
   `20260807000100_onboarding_revoke_kills_credential.sql`, in order.
3. Run the database verifier and the rollback-only onboarding behavior suite
   in an authorized local or staging environment.
4. Configure the server secrets above.
5. Deploy `workspace-onboarding` with JWT verification, then
   `client-onboarding` with the reviewed non-JWT setting in
   `supabase/config.toml`.
6. Deploy the frontend routes. There is no reminder worker or scheduler.
7. Complete signed-in owner, assigned-member, platform-owner, public-link,
   upload, review, approval, and purge acceptance checks before enabling live
   invitations.

This repository implementation does not itself authorize a production
migration, function deployment, scheduler change, or email send.

## Verification

`scripts/run-workspace-onboarding-behavior.sh` verifies the target, clean
committed source, explicit confirmation string, and rollback guard before it
runs `supabase/tests/20260722_workspace_onboarding_behavior.sql` against an
authorized local/staging database. The SQL suite ends with `ROLLBACK`. It covers role and workspace
isolation, immutable versions/revisions, capability mismatch and rotation,
autosave conflicts, WebP metadata, review/resubmission, portal-safe approval,
and archive/purge behavior. `scripts/test-onboarding-edge-contract.mjs` covers
the browser and Edge security contract; the normal typecheck, lint, Deno, and
build checks cover integration.
