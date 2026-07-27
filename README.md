# Get On A Pod

Get On A Pod is a multi-workspace podcast placement platform for agencies, consultants, and their clients. It combines client onboarding, recurring podcast discovery, shortlist approvals, outreach operations, client portals, and white-label presentation in one application.

This README is the engineering and product entry point. Detailed security contracts and runbooks live in [`docs/`](docs/).

## Product at a glance

The product has three distinct audiences:

| Audience | Experience | Primary routes |
| --- | --- | --- |
| Platform owner | Operates My Workspace and can open any active agency workspace without impersonating its owner | `/app/*`, `/app/workspaces/:workspaceId/*` |
| Workspace team | Runs one agency or consultancy and manages its clients | `/app/*` |
| Agency client | Reviews podcast opportunities and uses a client-specific portal | `/client/:slug`, `/portal/*` |

The current product is invite-only:

- Public workspace registration is disabled.
- A private workspace has one owner plus optional admins and members.
- Workspace users and client portal users are separate identities.
- Billing and self-serve checkout are not part of the workspace release.
- The platform owner stays signed in as the platform owner while managing a selected workspace; there is no owner impersonation.

## Core workflows

### 1. Onboard a client

An owner or admin creates a workspace client, starts an onboarding invitation, and shares an expiring capability link. The client can save progress and submit without creating a portal account. The agency reviews the answers, requests revisions, and explicitly approves the generated pitch profile.

### 2. Run weekly podcast discovery

Podcast Finder is a workspace-level tool with a selectable active client. It combines the client's research profile with Podscan discovery, excludes podcasts already associated with that client, and keeps weekly discovery focused on new opportunities. Results can be sorted and reviewed before they enter the client's shortlist.

### 3. Manage the client shortlist

Each client command center includes an approval-dashboard editor. The agency can curate, feature, reorder, archive, and decide on opportunities without returning to Podcast Finder. Once a dashboard address is configured, its shareable client URL is live without a separate visibility switch.

### 4. Research a show and write its pitch

From the client's Approval Dashboard, an operator opens an approved podcast and clicks once. The platform then runs the full prompt chain server-side — reading the show, confirming its hosts, verifying the most recent episode's guest from the transcript, aligning topics, and writing a complete three-touch sequence — and ends with finished copy the operator can edit. See [AI research and pitch pipeline](#ai-research-and-pitch-pipeline) for the stages, grounding data, and trust checks.

### 5. Run outreach

Client Campaigns gives each active client one ongoing podcast-outreach campaign. Once a sequence is finalized, the operator explicitly pushes that unsent package into the client's mapped campaign, and Client Campaigns remains the final launch gate. The workspace owner connects one Instantly V2 API key; authorized workspace managers can run campaigns without seeing the credential. Follow-ups send in-thread on days 6 and 13, and the sequence stops at three messages.

Each client also has a compact AI SDR Profile plus an SDR mode. `manual` drafts only on request; `auto_draft` stages a reply-and-nudge package for every new interested reply. **No mode sends email on its own** — automated dispatch was deliberately removed, so every message a host receives was sent by a person.

### 6. Deliver a white-label client experience

Workspace branding controls the agency name, logo, primary color, and accent color shown on shared client experiences. Client-specific display names and presentation settings can further tailor an approval dashboard without exposing internal workspace details or infrastructure.

## Workspace modules

“Available” means a module has a workspace route and a workspace-aware product surface. It does not imply that every planned provider integration is connected.

| Module | Repository status | Purpose |
| --- | --- | --- |
| Overview | Available | Workspace launchpad and module map |
| Onboarding | Available | Forms, invitations, autosave, review, revisions, files, and pitch approval |
| Podcast Finder | Available | Client-selectable recurring discovery with history deduplication |
| Clients | Available | Client records, command centers, and compact per-client AI SDR Profiles |
| Client Campaigns | Available with Instantly V2 | Encrypted workspace connection, campaign index, AI research and three-touch sequence generation, explicit launch, activity, analytics sync, and settings |
| Master Inbox | Available for review and drafting; sending is human-only | Classifies interested replies, stages AI reply-and-nudge packages per the client's SDR mode, and routes them to a person; nothing dispatches automatically |
| Relationships | Available | Workspace host CRM built from real outreach, replies, bookings, and deliberately curated host context |
| Mailboxes | Layout preview | Future sending-account health, capacity, and assignment surface |
| Guest Resources | Available | Workspace-authored resources for all clients or selected clients |
| Settings | Available to owners/admins | Team access, credentials, branding, agency name, and sidebar order |
| Prospect Studio | Available | Workspace-scoped prospect dashboards, shortlist building, publication review, and prospect photos |
| Podcast Database | Planned workspace migration | Read-only shared-catalog browsing before any tenant write support |
| Client Podcast System | Planned workspace migration | Recording, scheduled, and going-live operations |

Planned modules remain disabled in the workspace navigation until their complete tenant boundary is implemented. A visible legacy admin page is not automatically safe for workspace users.

## Instantly outreach suite

The outreach experience is intentionally split by job-to-be-done:

### Client Campaigns

The campaign experience is organized around one ongoing podcast-booking campaign per client:

- an operational index surfaces campaign status, sender accounts, progress, sent volume, replies, positive replies, and the next action;
- a two-step creation flow chooses the client, one or more sending accounts, and the starting podcasts while saving the draft in GOAP;
- client-positive podcasts are selected automatically, while an owner can deliberately include another shortlisted show;
- the campaign workspace keeps every eligible show in one Podcasts view with focused status filters;
- an approved podcast's Approval Dashboard action opens a preparation modal with the show brief, latest-episode context, fit evidence, three AI-written sequence options, workspace-only research notes, host contact, and the editable opening pitch and two follow-ups;
- **Send to Client Campaign** saves that complete package and creates the Instantly lead in the client's campaign, carrying the host name, show, site, opening pitch, and the whole sequence across as custom variables; selecting the podcast later in Client Campaigns reopens the same contact, research, and three-email sequence;
- **whether that contacts the host depends on the campaign.** A paused campaign holds the lead and nothing goes out. A live one starts the sequence on its next send window with no further approval, so the dialog says which case applies before you click, the button reads *Send to Client Campaign (goes live)*, and the confirmation warns rather than reporting a save. The same relationship gate the launch path uses runs here too, so an opt-out or a live conversation stops it;
- the explicit **Approve & start outreach** action creates or recovers the mapped provider campaign, adds that podcast contact if it is not already staged, and activates sending;
- activity and performance use sanitized workspace-scoped campaign and lead data returned by Instantly; and
- settings update the campaign name, IANA timezone, daily limit, and active sending accounts.

A verified direct-host contact is shared across the platform and reused for free, but it is not trusted indefinitely: after ninety days the stored address is re-checked with the verification provider before it is handed over. A re-check that passes costs nothing and refreshes the date. One that fails retires the contact — the row survives so the record of who paid for the original unlock is not lost — and a replacement search runs, also free, because that show's paid unlock already happened. When there is no provider connected to re-check with, the address is still returned, flagged as out of date rather than presented as ready.

GOAP-created campaigns use a standard three-email Instantly sequence populated by per-podcast custom variables and stop on reply. Workspace groups and subsequences are intentionally not used. A podcast host may be contacted for different GOAP clients, so provider duplicate-skipping is disabled while local client/campaign ownership remains exact.

The same campaign surfaces are available in My Workspace and in a platform-owner-selected workspace. Client command centers link directly to their campaign.

### Master Inbox

Each client now owns a lightweight AI SDR Profile in its Clients command center. It is deliberately separate from the long-form approved guest profile used by Podcast Finder. The structured profile gives interested hosts the approved guest positioning, signature topics, listener takeaways, proof and media assets, ideal show context, and booking boundaries they need to evaluate and schedule the client. Four host-facing fields determine readiness; incomplete profiles can still be saved as drafts.

Master Inbox can select a real workspace client and load that exact structured profile through the authenticated workspace boundary. The response is independently checked against the selected workspace/client, reports whether the client is active and ready for review drafts, and always returns `delivery_authorized: false`. Loading or viewing client context has no external side effect.

Conversations carry their full context rather than a flattened list. Each thread retains workspace, client, campaign, and lead identity; the pitch that started it and the research behind that show; a workflow state (`needs_reply`, `review`, `replied`, `booked`, `archived`); the model's classification of the host's reply; any staged draft and nudge plan; and an audit record of every draft and send.

Drafting is governed by the client's SDR mode. Under `auto_draft`, a scheduled tick classifies each new reply that Instantly flagged interested and stages a reply-plus-nudge package for review. Deterministic pre-filters catch opt-outs and autoresponders before any model call, so the cheapest cases cost nothing and an unsubscribe request suppresses the thread rather than drafting at it.

**Sending is human-only.** Automated dispatch was built and then deliberately removed: no mode, tick, or scheduler sends a message on its own, and the nudge scheduler is gated off behind a single named constant. A staged package waits for a person, which means the failure mode of the whole subsystem is "a human does it".

That is a claim about automation, not about how few clicks it takes. Sending a pitch to a live client campaign puts the host into the sequence immediately, by design — see [Client Campaigns](#implemented-client-campaigns-boundary). Every path to a host's inbox still begins with someone choosing it.

### Relationships

Relationships is the workspace's durable host CRM. A show appears automatically only when outreach has actually launched (or a provider lead exists), a Master Inbox thread has been linked, a non-cancelled booking exists, or the pre-campaign admin outreach tool delivered a send for one of the workspace's clients. Merely preparing or saving a podcast inside a draft client campaign does **not** create a relationship, and neither does a legacy outreach row whose webhook never returned a success. Owners and admins can also add a host deliberately before outreach, record a stage and summary, link clients, log notes, calls, or meetings, and save a useful inbox thread to the same history.

Relationships also holds the workspace do-not-contact list. An opt-out is directed at the sender rather than at one client's campaign, so a single entry silences the address for every client — replies asking to stop are added automatically by the inbox prefilter, and managers can add a bounce or a host who asked a person directly. Reinstating an address is possible but deliberate: it requires a written reason, which is recorded in the audit log alongside the original suppression so the decision survives the row that carried it. Members can read the list; only owners and admins change it.

The CRM derives conversation and placement state from recorded activity while preserving manual context such as nurturing, warm, and do-not-contact decisions. Search covers show names, hosts, and contact emails; filters narrow the operational state; and the result list is paginated at ten relationships per page so the workspace remains usable as the book grows. Workspace members can read the context, while relationship curation remains restricted to owners and admins.

### Mailboxes

The infrastructure view should expose:

- sending address and provider status;
- warmup status and health signals;
- daily limit, current use, and remaining capacity;
- campaign and client assignments; and
- last successful provider synchronization.

### Implemented Client Campaigns boundary

Instantly credentials are never returned to the browser after the owner submits the connection form. The authenticated `workspace-client-campaigns` Edge Function verifies the key, encrypts it with AES-GCM, and stores only ciphertext, IV, and a four-character hint in a service-role-only table. The browser receives sanitized integration metadata, account summaries, campaign analytics, and target state—never the stored credential.

The campaign boundary also enforces:

1. one Instantly workspace connection per GOAP workspace, with an Instantly workspace prevented from being attached to multiple tenants;
2. one local campaign per exact same-workspace client and one provider campaign mapping per local campaign;
3. owner-only credential connection and removal, with campaign actions restricted to owner, admin, or platform-owner workspace access;
4. deterministic provider campaign naming and recoverable launch states to prevent duplicate campaigns after retries or timeouts;
5. per-target launch states, podcast uniqueness, provider lead IDs, and same-campaign contact checks so retries recover safely without silently duplicating or overwriting outreach;
6. fixed-origin server-side Instantly requests with timeouts, response-size limits, permission-safe provider errors, and sanitized analytics; and
7. actor-aware audit records for connection, draft, launch, pause, resume, and other material campaign actions.

Client Campaigns currently synchronizes on an explicit operator action; webhook-driven reply ingestion is not part of this release. Master Inbox reads conversations from the provider on demand and owns thread state, classification, and drafting, but delivery stays a human action: no scheduler or SDR mode dispatches a message, and every send is initiated by an operator through the authenticated reply path and audited. Mailboxes remains a non-operational preview.

Legacy Bison/Clay outreach code remains in the repository for operator history. It is global-provider code and must not be wired into workspace routes without the same ownership, event-ledger, and isolation guarantees.

## Identity and authorization

| Actor | Workspace scope | Staff controls | Client operations | Workspace selector |
| --- | --- | --- | --- | --- |
| Platform owner | My Workspace plus one explicitly selected agency workspace | Owner-equivalent in selected workspace | Full supported-module access | Yes, top-right |
| Workspace owner | One workspace | Admins, members, credentials, ownership transfer | Full | No |
| Workspace admin | One workspace | Members | Manage supported operations | No |
| Workspace member | One workspace | None | Module-specific restricted/read-only access | No |
| Client portal user | One client | None | Published client experience only | No |

Important boundaries:

- Browser-provided workspace, membership, client, and record IDs are untrusted selectors.
- Tenant mutations are authorized again inside versioned `SECURITY DEFINER` database functions.
- Tenant records carry or derive an exact `workspace_id`.
- Cross-workspace child relationships use same-workspace constraints.
- Direct browser writes to protected operational tables remain closed.
- The platform owner's selected-workspace actions preserve the platform actor ID for auditing.
- Client portal sessions cannot authorize workspace routes.
- Suspended or stale identities fail closed.

See [`docs/subagency-saas-architecture.md`](docs/subagency-saas-architecture.md) for the full tenancy model.

## Route map

### Workspace users

| Route | Surface |
| --- | --- |
| `/login` | Workspace sign-in |
| `/accept-invite` | Workspace invitation completion |
| `/change-password` | Required initial-password replacement |
| `/app/overview` | My Workspace overview |
| `/app/onboarding` | Onboarding management |
| `/app/podcast-finder` | Client-selectable podcast discovery |
| `/app/clients` | Clients |
| `/app/clients/:clientId` | Client command center |
| `/app/client-campaigns` | Client campaign operations index |
| `/app/client-campaigns/:clientId` | Client podcast outreach and campaign workspace |
| `/app/master-inbox` | Future Instantly inbox preview |
| `/app/relationships` | Workspace host relationship CRM |
| `/app/mailboxes` | Future Instantly mailbox preview |
| `/app/guest-resources` | Workspace guest resources |
| `/app/settings` | Workspace settings, team, branding, and navigation order |

### Platform owner selected-workspace routes

The same modules are reused under:

```text
/app/workspaces/:workspaceId/overview
/app/workspaces/:workspaceId/onboarding
/app/workspaces/:workspaceId/podcast-finder
/app/workspaces/:workspaceId/clients
/app/workspaces/:workspaceId/clients/:clientId
/app/workspaces/:workspaceId/client-campaigns
/app/workspaces/:workspaceId/client-campaigns/:clientId
/app/workspaces/:workspaceId/master-inbox
/app/workspaces/:workspaceId/relationships
/app/workspaces/:workspaceId/mailboxes
/app/workspaces/:workspaceId/guest-resources
/app/workspaces/:workspaceId/settings
```

The workspace switcher preserves the current module when possible. Client-bound detail routes return to the target workspace's module-level chooser rather than carrying a client ID across workspaces.

Legacy `/app/outreach-platform`, `/app/unibox`, `/admin/outreach-platform`, and `/admin/leads` entry points redirect to the canonical outreach-suite routes.

### Public and client routes

| Route | Surface |
| --- | --- |
| `/onboarding/:token` | Capability-protected client intake |
| `/client/:slug` | Shareable podcast approval dashboard |
| `/prospect/:slug` | Prospect lead-magnet dashboard |
| `/portal/login` | Client portal sign-in |
| `/portal/dashboard` | Protected client portal overview |
| `/portal/resources` | Protected client resources |

## AI research and pitch pipeline

One operator click runs an ordered prompt chain against Claude. Each stage may only build on the verified output of the stage before it, so a later stage cannot invent a fact an earlier one did not establish.

| Stage | Prompt | Produces |
| --- | --- | --- |
| 1 | `podcast_research` | Show positioning, audience, format, guest fit, and a bank of verbatim transcript quotes |
| 2 | `host_info` | Every host and the primary booking contact |
| 3 | `guest_info` | The latest episode's guest, verified against the transcript with quoted evidence (skipped when no transcript exists) |
| 4 | `find_topics` | Three titled episode angles framed on listener value |
| 5 | *(summarize)* | Structured JSON written to the shortlist row: clean description, fit reasons, angles, host, recent guest |
| 6 | `write_email` | The complete three-touch sequence: opener, day-6 value-add follow-up, day-13 close |
| 7 | `clean_email` | A revision pass, run only when the trust checks flag something |

Every prompt is editable per workspace and per client from the pitch dialog's owner controls; the shipped defaults live in [`docs/pitch-research-prompts.json`](docs/pitch-research-prompts.json) and are mirrored into `src/lib/researchPromptDefaults.ts` and `supabase/functions/_shared/researchPromptDefaults.ts`, which contract scripts hold in sync.

### Grounding data

Podcast metadata and episode data are captured once from Podscan onto the **global** `podcasts` catalog row — the latest three episodes with titles, descriptions, release dates, hosts, guests, topics, and the newest transcript. Capture happens at every moment of intent (adding a show to a shortlist, opening the pitch dialog, running research) and is reused for 30 days, so one fetch serves every workspace, client, and rerun.

That storage is what makes personalization real: the pitch can name the host, cite the episode, and reference the guest by name because those facts came from the transcript rather than the model. Missing data degrades honestly — with no transcript, prompts are instructed to open with a checkable detail from the research instead of inventing an episode reference.

### Trust checks

Generated copy passes two gates before an operator ever sees it:

- **Deterministic checks** (in code, free) — word caps, link count, em dashes, leaked placeholders, and the phrasing podcast hosts report as instant "this is AI" tells.
- **A claim audit** (Haiku) — decomposes the sequence and flags any factual claim that cannot be traced to the research evidence.

Anything flagged triggers one revision pass. Whatever remains is shown to the operator as visible flags in the pitch dialog, never silently suppressed. While an operator edits, the deterministic checks rerun on every keystroke ([`src/lib/pitchQuality.ts`](src/lib/pitchQuality.ts)) so hand-written copy meets the same standard.

### Regression harness

Prompt edits used to be judged by reading a few pitches and forming an impression. [`docs/pitch-golden-set.json`](docs/pitch-golden-set.json) holds labelled sequences — clean ones and one per failure that has shipped or nearly shipped — each paired with the evidence it was supposed to be built from and the exact findings the scorer must produce. [`src/lib/pitchEval.ts`](src/lib/pitchEval.ts) scores them offline: the style rules above, plus the groundedness ones a person actually cares about — an opener that references no episode, guest, or quoted moment from the research; a name that appears nowhere in the evidence; internal note text reproduced in a host-facing email; and a prior client named on an episode that never aired.

`npm run test:pitch-eval` runs in CI and fails when a case stops matching its label. `npm run eval:pitch` prints the same run as a report, with per-case findings and scores, which is the useful form while tuning a prompt. Point it at a file of the same shape to score your own captured generations before promoting any of them into the set. It is deliberately deterministic and offline, so it complements the model-driven claim audit rather than replacing it.

### Cost and measurement

Every stage of a run shares one byte-identical cached context block, so stage one pays the cache write and later stages read the same transcript and profile at a fraction of the input price. Each research document and generated pitch is stamped with a prompt-chain version that is persisted onto the campaign target, which makes reply rate per prompt revision queryable once send volume exists.

## System architecture

```mermaid
flowchart LR
    Browser[React workspace and client apps]
    Edge[Supabase Edge Functions]
    Auth[Supabase Auth]
    DB[(Postgres + RLS + transactional RPCs)]
    Storage[Private/public Storage]
    Providers[Podscan · Resend · AI providers]
    Instantly[Instantly.ai V2\nClient Campaigns only]

    Browser --> Auth
    Browser --> Edge
    Edge --> Auth
    Edge --> DB
    Edge --> Storage
    Edge --> Providers
    Edge -. server-side only .-> Instantly
```

The React application is a Vite SPA. Supabase provides authentication, PostgreSQL, Storage, and Edge Functions. The production container builds static assets and serves them through [`scripts/serve-production.mjs`](scripts/serve-production.mjs), including SPA fallback and security checks.

## Repository layout

```text
src/
  components/             Shared UI and workspace shell
  contexts/               Workspace and client auth contexts
  lib/                    Routing, validation, sanitization, and utilities
  pages/app/              Native workspace pages
  pages/admin/            Platform wrappers and legacy operator pages
  pages/client/           Shareable client approval experience
  pages/onboarding/       Public capability-based intake
  pages/portal/           Protected downstream client portal
  services/               Narrow browser-to-Supabase service layer
supabase/
  migrations/             Ordered schema and authorization changes
  functions/              Edge Functions and shared server code
  tests/                  PostgreSQL behavior/isolation suites
scripts/                  Release, security, staging, and diagnostic tooling
docs/                     Architecture, API references, and operator runbooks
mcp-prospect-dashboard/   MCP server for prospect-dashboard workflows
```

## Local development

### Requirements

- Node.js `22.22.2`
- npm `10.9.7`
- Deno `2.5.2` for Edge Function validation
- A Supabase project or local Supabase stack
- Supabase CLI and PostgreSQL tooling for migration/behavior work

The Node and npm versions are intentionally pinned in [`package.json`](package.json) and the production [`Dockerfile`](Dockerfile).

### Install and run

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server binds to `127.0.0.1:8080` by default. Set `DEV_SERVER_HOST` only when an explicitly trusted container or LAN environment requires another bind address.

### Browser-safe environment variables

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-browser-key
VITE_APP_URL=http://localhost:8080
VITE_SENTRY_DSN=
VITE_APP_VERSION=
```

Every `VITE_*` value is embedded into the public browser bundle. Only browser-safe configuration belongs there. The current client reads the Supabase public key through `VITE_SUPABASE_ANON_KEY`, including when the project uses a newer publishable-key value.

### Server-only secrets

Provider credentials belong in Supabase secret storage or the authorized operator environment. Examples include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `PODSCAN_API_KEY` — podcast and episode data for the whole discovery and research path
- `ANTHROPIC_API_KEY` — every AI feature depends on it (research, pitch writing, inbox drafting, autopilot scoring). A workspace may supply its own key instead; this is the platform fallback. Validate a replacement against `GET /v1/models` before relying on it — a rejected key surfaces as features that quietly do nothing.
- `OPENAI_API_KEY` — embeddings for semantic podcast search
- `RESEND_API_KEY`
- `ONBOARDING_CAPABILITY_SECRET`
- Google service-account credentials
- `INSTANTLY_CREDENTIAL_ENCRYPTION_KEY` (at least 32 random characters; server-side encryption key)

Each workspace owner's Instantly V2 API key is entered in Client Campaigns and encrypted before database storage. It is tenant data, not a shared deployment secret, and must never be copied into a `VITE_*` variable.

Never prefix a private credential with `VITE_`, commit it to a dotenv file, paste it into a migration, or expose it in a client error message. Run `npm run check:secrets` before release.

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite locally |
| `npm run build` | Generate the static sitemap and production SPA |
| `npm run typecheck:app` | Type-check the application |
| `npm run lint:mvp` | Lint the supported workspace release surface |
| `npm run test:workspace-mvp` | Run workspace, portal, service, and route tests |
| `npm run test:podcast-research` | Run Podcast Finder and research tests |
| `npm run check:edge` | Cache, type-check, and test all Edge Functions with pinned Deno |
| `npm run check:secrets` | Scan tracked source and release output for credential hazards |
| `npm run check:static` | Run the complete static release gate |
| `npm run test:staging` | Run authorized staging acceptance checks |
| `npm run verify:production-browser` | Verify the deployed public browser bundle |

For a normal workspace UI change, the minimum useful local gate is:

```bash
npm run typecheck:app
npm run lint:mvp
npm run test:workspace-mvp
npm run build
npm run check:secrets
```

`npm run check:static` is the authoritative full gate and has additional toolchain and network requirements.

## Database and Edge Function changes

Frontend deployment does not apply database migrations or deploy Edge Functions.

For any backend increment:

1. Add a forward-only migration under [`supabase/migrations/`](supabase/migrations/).
2. Make the migration idempotent where retry safety requires it, without hiding a partial failure.
3. Keep privileged operations in narrow, versioned SQL functions with explicit grants and a safe `search_path`.
4. Add two-workspace, cross-client, role, stale-token, malformed-ID, and direct-RLS denial coverage.
5. Update or add the matching Edge Function contract test.
6. Run SQL grammar, application typecheck, focused tests, Edge checks, and secret scanning.
7. Apply migrations to an authorized staging environment in filename order.
8. Deploy only the Edge Functions in the release and confirm their `verify_jwt` settings against [`supabase/config.toml`](supabase/config.toml).
9. Run signed-in staging acceptance before production.

Behavior scripts intentionally require explicit targets and confirmation. Do not point them at production casually. Some suites run inside a transaction and end with `ROLLBACK`; read the relevant runbook before execution.

## Deployment

The repository includes a multi-stage production [`Dockerfile`](Dockerfile) and [`railway.toml`](railway.toml).

The container build:

1. installs the pinned Node/npm dependency graph with `npm ci`;
2. validates required browser-safe Supabase configuration;
3. builds the static application;
4. scans the browser bundle for prohibited credentials; and
5. creates a non-root runtime image containing only production dependencies, built assets, and the production server.

The recommended release order is:

1. Confirm the intended Git diff and migration/function manifest.
2. Back up and inventory the target Supabase environment.
3. Apply and verify migrations.
4. Set or rotate server-only secrets.
5. Deploy changed Edge Functions with the reviewed JWT/CORS configuration.
6. Deploy the frontend container.
7. Run authenticated workspace, selected-workspace, client-dashboard, and portal acceptance.
8. Run browser-bundle and retired-asset verification.
9. Record evidence in the appropriate runbook without committing secret values, session tokens, or bearer links.

Historical deployment IDs and commit hashes do not belong in this README because they become stale. Release-specific evidence belongs in a dated document such as [`docs/production-cutover-2026-07-21.md`](docs/production-cutover-2026-07-21.md).

## Troubleshooting

### A Supabase Function returns `400`

Inspect the response body in the browser Network panel. A `400` usually means the deployed function and frontend disagree about request fields, an identifier failed validation, or a prerequisite migration is missing. Confirm the deployed function version before changing the UI around the error.

### A Supabase Function returns `500`

Check the function logs using a sanitized request. Common causes are a missing server secret, unapplied SQL function/migration, provider failure, or an authorization invariant failing inside the transaction. Do not replace a specific server failure with a success-looking client state.

### The browser reports a CORS preflight failure

The `OPTIONS` request must return a successful status with the shared allowed-origin headers before authentication or request-body validation. Confirm the function is deployed, its route name is correct, and the production origin is allowed. A missing function can look like CORS because the platform rejects the preflight before the handler runs.

### A workspace page says “unavailable”

Check that the route contains a canonical UUID, the workspace is active, and it has exactly one available owner. Selected-workspace pages intentionally fail closed if the returned workspace, owner, clients, or route ID do not agree.

### A client dashboard will not load

A configured approval dashboard is always live. If its public link does not load, confirm the client has a dashboard slug, the client belongs to an active workspace, and the public dashboard functions are deployed. There is no separate share/unshare switch.

### An AI feature produces nothing, or says only “try again”

Check the provider credential before reading any application code. An invalid `ANTHROPIC_API_KEY` fails in well under a second and, because every caller catches provider errors to degrade gracefully, it can present as research that never finishes, an autopilot that adds no podcasts, and an inbox that stages no drafts — all at once, with no error surfaced anywhere.

Two queries settle it quickly: `SELECT max(created_at) FROM workspace_operation_costs WHERE anthropic_input_tokens > 0` proves whether any AI call has *ever* succeeded, and a failed run's `research_progress.message` on `client_dashboard_podcasts` carries the provider's real status and error body. Validate a candidate key against `GET /v1/models` before setting it. Also confirm the failure is not a timeout: research stages legitimately run 30–60 seconds each, and a full run takes two to three minutes.

### The production page still shows an older bundle

Confirm the deployment commit, inspect the HTML asset references, purge only the intended CDN cache, and run `npm run verify:production-browser`. Do not assume a successful Git push proves that migrations, functions, the container, and the CDN all changed together.

## Documentation map

- [`docs/subagency-saas-architecture.md`](docs/subagency-saas-architecture.md) — tenancy and authorization model
- [`docs/tenant-feature-parity-mvp.md`](docs/tenant-feature-parity-mvp.md) — tenant module contract and rollout rationale
- [`docs/workspace-onboarding.md`](docs/workspace-onboarding.md) — onboarding lifecycle, capabilities, files, and deployment
- [`docs/manual-workspace-accounts.md`](docs/manual-workspace-accounts.md) — workspace account operations
- [`docs/architecture/CLIENT-DASHBOARD.md`](docs/architecture/CLIENT-DASHBOARD.md) — client dashboard concepts
- [`docs/architecture/PODCAST-FINDER.md`](docs/architecture/PODCAST-FINDER.md) — podcast discovery architecture
- [`docs/api/README.md`](docs/api/README.md) — API documentation index
- [`docs/pitch-research-prompts.json`](docs/pitch-research-prompts.json) — canonical research and pitch prompt set (generated mirrors are held in sync by contract scripts)
- [`docs/production-cutover-2026-07-21.md`](docs/production-cutover-2026-07-21.md) — historical sanitized release evidence

Some historical documents describe legacy global admin tools. The current source, migrations, tests, and tenant contracts take precedence when those documents conflict.

## Definition of done

A workspace feature is not complete merely because a page renders. It is complete when:

- the same component works in My Workspace and an explicitly selected workspace;
- tenant data is bound to the exact workspace and client where applicable;
- owner, admin, member, platform-owner, suspended, and stale-session behavior is defined;
- mutations are transactional, idempotent where needed, and audited;
- direct table access and cross-workspace IDs fail closed;
- responsive layout and horizontal overflow are checked on desktop and mobile;
- focused tests, typecheck, lint, production build, and secret scanning pass;
- backend deployment order and acceptance evidence are documented; and
- the UI distinguishes real data from disconnected, loading, empty, and error states.

That standard is especially important for Instantly: provider connectivity is useful only when workspace ownership, reply ingestion, sending safety, and auditability ship with it.
