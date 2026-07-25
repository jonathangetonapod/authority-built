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
4. creates a query embedding when semantic search is available;
5. calls the service-only `workspace_podcast_catalog_page_v2` read model;
6. combines exact keyword ranking with vector similarity and applies email, publishing-recency, audience, category, activity, and sort filters;
7. returns public metadata, safe contact availability, aggregate usage, and no tenant identities.

The read model returns a Podscan email only when it is a valid single email address. Raw malformed/multi-value contact strings remain internal until a normalization pipeline can review them safely.

The client approval editor uses the same catalog read model for quick-add search and links into the full database with its client ID in the URL. The URL is only a selection hint: the server still verifies that the client belongs to the active workspace before any shortlist write.

The vector leg is bounded to the nearest 300 indexed candidates before hybrid reranking, so semantic search does not become a full-catalog vector scan as the shared database grows. Exact title, host, publisher, description, category, language, and region matches receive deterministic boosts above semantic similarity. Missing embeddings or an unavailable embedding provider fall back to keyword search.

Semantic query generation is operationally gated by `PODCAST_SEMANTIC_SEARCH_ENABLED=true`. Keep the gate off when the embedding account has no available quota so search fails over immediately instead of making every owner wait for a rejected provider request.

Legacy client workflow decisions and outreach are integrated according to [Legacy client podcast integration](./LEGACY-CLIENT-PODCAST-INTEGRATION.md).

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
6. **Transcript coverage:** Podscan exposes episode transcripts, but the catalog does not yet store a verified podcast-level coverage signal and the current provider credential does not authorize the required read. Persist episode-level coverage before exposing a transcript filter; never infer availability from descriptions or demographics.
7. **Multiple contacts:** evolve the one-current-contact model to retain host, producer, booking, and historical verification records.
8. **Search evaluation:** restore embedding-provider quota, enable the semantic-search gate, backfill the remaining embeddings, record anonymized zero-result/search-selection metrics, and tune hybrid weights from real booking-research behavior.

Do not expose the legacy platform-admin Podcast Database page to tenants. It contains operational imports, direct table reads, Google Sheets workflows, and platform-only controls that do not form a workspace security boundary.
