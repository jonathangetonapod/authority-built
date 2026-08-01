# Client campaign repair record — 2026-08-01

Evidence record for the client-campaign defects found and fixed on 2026-08-01,
starting from a single `409` on one client and ending in nine commits, three
migrations, and repairs to one live Instantly campaign. It contains no
credentials or capability URLs.

## Decision

The defects below are fixed in code, deployed, and repaired on the affected
live campaign. Nothing here is pending. Every fix ships with contract or
executable coverage, so the same regression fails a gate rather than reaching a
host.

Six credentials were exposed during the investigation and are **not rotated**:
the Supabase `service_role` key, the database password, a Supabase personal
access token, and the Anthropic, Podscan and Instantly API keys. That is a
deliberate deferral by the repository owner, not an oversight. Rotating the
Instantly key requires reconnecting it in Client Campaigns immediately
afterwards, or every campaign action fails until that is done.

## What started it

Sending a prepared pitch for one client returned `409` with code
`INSTANTLY_RESOURCE_NOT_FOUND`. The client's campaign row referenced an
Instantly campaign deleted upstream after the last sync on 2026-07-24;
`GET /api/v2/campaigns/{id}` confirmed `404`. Diagnosis was slow because roughly
fifty distinct refusals in `workspace-client-campaigns` share HTTP 409 and the
browser console can only show the status.

## Defects that were reporting success while doing something else

- The confirmation screen said a host was "added as a lead, with the full
  three-email sequence attached" whenever the request succeeded, including when
  no contact email existed and no lead had been created. It now reads
  `lead_staged` from the response.
- Follow-up steps carried a subject line. Instantly threads a subject-less step
  as a reply, so a filled subject started a new conversation and a host who
  ignored the pitch received three unrelated emails.
- The sending schedule was written as days `0` through `4` under the name
  "Weekdays". Instantly indexes from Sunday, so every campaign this app had ever
  created sent Sunday through Thursday and never on Friday.
- The timezone was validated as "is this a real IANA name", but Instantly pins
  an enum containing neither `America/New_York` — the default in three places —
  nor `America/Los_Angeles`. Unsupported values were silently substituted by the
  provider, which is how the affected campaign came to be scheduled on a South
  American clock nobody selected.
- A settings save PATCHed the whole campaign configuration including
  `sequences`, so changing a daily limit or assigning a mailbox replaced the
  copy of any campaign written by hand in Instantly.

## Defects with no path to recovery

- A campaign deleted upstream wedged the client permanently: preparing refused,
  remapping refused as `CAMPAIGN_ALREADY_MAPPED`, and disconnecting only cleared
  the workspace key. Only a direct database edit could clear it.
- The same wedge existed one row over for linked campaigns, where the guidance
  additionally directed the operator to rebuild a different campaign.
- Creating a campaign and linking it locally cannot share a transaction, so a
  failure between them left a campaign referenced by nothing, and the retry
  built a second.
- `ensureProviderCampaign` took a claim and then wrote without checking it still
  held one, so a slow invocation returning after the five-minute reaper could
  overwrite the mapping that replaced it.

All four now self-heal or converge. Only a `404` clears a mapping; a rate limit
or rejected key says nothing about whether a campaign exists, and forgetting a
live mapping would orphan running outreach.

## New capability

An operator can create an Instantly campaign from the client page, link several
campaigns to one client for Master Inbox attribution, and choose which campaign
a pitch joins. Only campaigns whose live opening step reads the pitch variables
are offered as send targets; a campaign built by hand carries its own copy, so
sending into it would deliver that copy while reporting the written pitch as
sent. Sending days, the daily window, both follow-up delays, and the timezone
are editable per campaign.

## Migrations applied

Each was confirmed as the only pending migration by a dry run before being
applied.

- `20260801000100_sendable_client_campaign_links` — records which links were
  provisioned by this app, and which Instantly campaign a lead entered.
- `20260801000200_campaign_schedule_settings` — sending days, window, and the
  two follow-up delays, defaulting to Monday through Friday.
- `20260801000300_campaign_timezone_supported_default` — a default timezone the
  provider accepts.

Existing rows keep their schedule and timezone. A migration silently changing
when a live campaign emails people is not a schema change's decision; those are
corrected on the next deliberate settings save.

## Live campaign repaired

One campaign, for the client whose failure started this. Its dead mapping was
cleared before the self-heal existed, and setup rebuilt it. The rebuilt campaign
then needed three corrections applied over the provider API, each verified by
reading the campaign back:

| | Before | After |
| --- | --- | --- |
| Sending days | Sun–Thu | Mon–Fri |
| Follow-up subjects | filled, new thread each | empty, replies in thread |
| Timezone | `America/Bogota` | `America/Detroit` |

Status, sender account, window, and sequence bodies were carried through
unchanged. The campaign was in Draft throughout, so no host received anything
mid-repair. Seven drafted targets were removed earlier by campaign setup, which
deletes targets absent from the submitted list when they hold no lead; the owner
confirmed that copy was not needed.

## Verification at close

`typecheck:app` clean, 754 tests passing across 74 files, `check:edge` 85 Deno
tests passing, SQL grammar validation across 77 files, scoped lint clean,
production build clean, and the release manifest verifier passing. The published
browser bundle scan passes and carries only the publishable key.

## Review

Three independent reviews ran against the first commit. The security audit found
no tenant-isolation break. The other two found two defects introduced that same
morning: the campaign picker had made the self-heal unreachable, because the
dialog always sends a campaign id and the send path therefore never reached
`ensureProviderCampaign`; and the live-campaign warning read the client's
default campaign's status rather than the chosen one's, skipping the
confirmation that exists because a live campaign emails a real person. Both are
fixed and carry regression tests.

They also found that the prep dialog's service mock omitted the campaign-links
service, so the query threw, React Query swallowed it, and every test exercised
the empty path — a picker test would have passed without a picker rendering.
Two files were in no gate at all: `campaignErrorGuidance.ts` was unlinted, and
the first migration was absent from the SQL grammar check. Both are now wired
in, along with a test file that would otherwise never have run.
