# Shared Podcast Catalog

## Product contract

Get On A Pod has one global catalog of public podcast metadata. Workspace client profiles, shortlist decisions, notes, and campaign activity remain tenant-private. A show discovered in one workspace can improve the public catalog used by every workspace.

Workspace users access the catalog through `workspace-podcast-catalog`; they do not receive direct access to `public.podcasts`, contribution provenance, or the direct-contact table.

## Canonical data layers

- `public.podcasts`: one canonical row per Podscan ID, including public metadata and the free Podscan inbox.
- `public.podcast_catalog_contributions`: private provenance for workspace/client/prospect contributions.
- `public.podcast_direct_contacts`: private global store for the current verified direct contact. A successful contact can be reused across workspaces.
- `public.client_dashboard_podcasts`: workspace-private client shortlist state and a reflected metadata cache.
- `public.prospect_dashboard_podcasts`: workspace-private prospect shortlist state and a reflected metadata cache.
- `public.podcast_emails`: legacy free-email cache reflected into the global catalog.

## Growth flow

1. A workspace uses Podcast Finder.
2. The owner adds a result to a client or prospect shortlist.
3. The workspace Edge Function calls `merge_global_podcast_catalog_batch_v1` with verified workspace scope and provenance.
4. The canonical catalog is inserted or enriched without replacing populated fields with blanks.
5. Reflection triggers keep legacy workflow caches aligned with the canonical public metadata.
6. Every workspace can find the show in Podcast Database immediately.

Merely viewing or searching Podscan does not create a contribution. A show becomes shared when it is intentionally added to a workspace workflow.

## Owner read path

`WorkspacePodcastDatabase` calls `workspace-podcast-catalog`, which:

1. validates the authenticated user;
2. verifies active access to the requested workspace;
3. validates a narrow list/filter/page request;
4. calls the service-only `workspace_podcast_catalog_page_v1` read model;
5. returns public metadata, safe contact availability, aggregate usage, and no tenant identities.

The read model returns a Podscan email only when it is a valid single email address. Raw malformed/multi-value contact strings remain internal until a normalization pipeline can review them safely.

## Production baseline (July 25, 2026)

- 11,807 canonical catalog rows
- 9,566 rows marked active
- 9,770 non-empty raw Podscan contact values
- 3,160 raw Podscan contact values that are not valid single email addresses
- 8,002 catalog rows with embeddings
- 684 client shortlist rows representing 647 unique podcasts
- 1,707 prospect shortlist rows representing 1,487 unique podcasts
- zero metadata drift across joined client/prospect caches at verification time

These are release-audit snapshots, not hard-coded product metrics. The workspace page reads live aggregates.

## Known follow-up work

1. **Freshness:** all current rows were older than 30 days at the release audit. Add a bounded refresh queue based on usage, shortlist demand, and last episode date.
2. **Identity resolution:** Podscan ID is canonical today, but duplicate candidates exist across RSS, Apple, Spotify, and normalized name/publisher identities. Build reviewed aliases and reversible merges before enforcing uniqueness.
3. **Contact normalization:** parse and verify recoverable multi-value Podscan contacts instead of exposing raw strings.
4. **Contribution history:** backfill provenance for legacy shortlist usage so the contribution ledger reflects pre-launch workspaces.
5. **Direct-contact enrichment:** connect a real provider waterfall, idempotent job state, verification, and a transactional credit ledger. The global contact store and first-success reuse rule exist; the provider/billing workflow does not yet.
6. **Multiple contacts:** evolve the one-current-contact model to retain host, producer, booking, and historical verification records.
7. **Search quality:** add indexed full-text/semantic ranking and saved owner filters after the catalog usage baseline is established.

Do not expose the legacy platform-admin Podcast Database page to tenants. It contains operational imports, direct table reads, Google Sheets workflows, and platform-only controls that do not form a workspace security boundary.
