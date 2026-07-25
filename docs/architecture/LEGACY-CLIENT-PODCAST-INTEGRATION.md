# Legacy Client Podcast Integration

## Decision

The workspace product uses one canonical public podcast catalog and private per-client workflow records. The legacy client system is an import and history source, not a second podcast database and not a tenant-facing source of truth.

## Production audit (July 25, 2026)

- 5 clients are workspace-scoped; 4 still have a Google Sheet link.
- 684 client shortlist rows represent 647 unique podcasts.
- Every shortlist row has a canonical `public.podcasts` record and no audited public-metadata drift.
- 250 shortlist rows have AI analysis and 130 have demographics.
- 24 client decisions are preserved: 23 approved and 1 rejected, with no orphaned feedback.
- 213 shortlist rows have a valid free Podscan email; no paid direct contacts had been recorded at audit time.
- 105 successful legacy webhook outreach handoffs are preserved.
- The modern campaign system had 1 campaign and 8 targets; 1 unlaunched target overlapped successful legacy outreach.

These values are an audit snapshot, not product counters.

## How the systems now work together

| Concern | Canonical behavior |
| --- | --- |
| Public show metadata | `public.podcasts` is global and reflected into legacy shortlist caches. |
| Search | Podcast Database and client quick-add both call the service-only hybrid catalog read model. |
| Client approvals and notes | `client_dashboard_podcasts` and `client_podcast_feedback` remain workspace-private. |
| Free contact data | A valid Podscan inbox is stored once on the global podcast and reused everywhere. |
| Paid contact data | A verified direct contact is global; the first successful unlock pays and later workspaces reuse it for zero credits. |
| Campaign preparation | Approved shortlist rows flow into workspace campaign targets with canonical metadata and the best permitted contact snapshot. |
| Prior outreach | Successful legacy webhook handoffs are shown as “Previously contacted.” The new campaign Edge Function blocks a second launch for that client and podcast. |

The prior-outreach check is enforced on the server. The visual warning is not the security or deduplication boundary.

## Keep, adapt, retire

### Keep

- Client feedback, featured ordering, archives, operator notes, AI fit research, and historical outreach outcomes.
- Google Sheets as an optional export or one-way migration source while customers transition.
- Legacy IDs as stable references until all downstream automation has moved.

### Adapt

- Route all owner search and shortlist additions through workspace-authenticated Edge Functions.
- Merge newly selected shows into the global catalog before writing tenant-private workflow state.
- Resolve contact data from the global free/direct stores at campaign preparation time.
- Treat archived and previously contacted shows as deduplication history, not deleted data.

### Retire

- Google Sheets as the authoritative client podcast list.
- Browser-side direct writes to `client_dashboard_podcasts`.
- The legacy admin search/cache as a separate catalog.
- New sends through the legacy webhook once every active client has an Instantly campaign mapping.

## Remaining migration phases

1. Create a provider-neutral, workspace-scoped contact-history table and backfill both successful legacy webhook actions and modern campaign launches. Then make every sender check that table transactionally.
2. Convert Google Sheet sync to explicit import/export jobs with provenance, idempotency, and a visible last-sync result.
3. Backfill the catalog contribution ledger from historical client and prospect usage.
4. Add reviewed podcast identity aliases for RSS, Apple, Spotify, and normalized publisher/name duplicates before any destructive merges.
5. Persist episode-level transcript coverage from an authorized provider feed before enabling a transcript-availability filter.

## Tenant boundary

Public show metadata and reusable verified contacts may improve globally. Client identity, guest positioning, approvals, notes, pitch copy, campaign state, replies, and bookings never become cross-workspace catalog data.
