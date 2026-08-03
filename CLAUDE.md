# CLAUDE.md — Get On A Pod

## 1. Project Overview

Podcast placement platform, mid-migration from a single-agency admin tool to an **invite-only multi-tenant SaaS** where sub-agencies ("workspaces") manage their own clients, podcast discovery, outreach campaigns, and client deliverables. Billing, HeyGen video, and Fathom sales-call features are retired for the invite-only MVP (their edge functions return HTTP 410).

**User surfaces:**
- `/app/*` — workspace tenant app (Supabase Auth; invite-only B2B users)
- `/app/workspaces/:workspaceId/*` — platform admins viewing a tenant (thin `AdminWorkspace*` wrappers pass `platformWorkspaceId` into the same `/app` pages)
- `/admin/*` — legacy single-agency admin pages (still live: podcast database, calendar, clients, guest resources)
- `/portal/*` — end-client portal (custom bearer-token auth, NOT Supabase Auth)
- `/prospect/:slug`, `/client/:slug`, `/onboarding/:token` — public capability-URL pages (the slug/token is the credential)
- Public marketing site (`/`, `/blog`, etc.)

## 2. Tech Stack

- **Framework:** React 18 + Vite 7 (SWC plugin)
- **Language:** TypeScript 5.8 (loose — `noImplicitAny: false`, `strictNullChecks: false`)
- **Styling:** Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`
- **Components:** shadcn/ui (Radix primitives in `src/components/ui/`)
- **State:** React Context (AuthContext, ClientPortalContext), TanStack React Query (singleton client in `src/lib/queryClient.ts`)
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router DOM v6 (all routes in `src/App.tsx`)
- **Rich Text:** TipTap editor
- **Charts:** Recharts
- **Backend:** Supabase (auth, Postgres with RLS, edge functions, storage) — Deno **2.5.2** pinned for edge functions
- **AI:** Anthropic Claude API + OpenAI embeddings (server-side only)
- **Outreach:** Instantly.ai (per-workspace API keys, AES-GCM encrypted in DB) + legacy Email Bison
- **Podcast data:** Podscan API (proxied through edge functions)
- **Monitoring:** Sentry (`@sentry/react`, sanitized breadcrumbs, tracing off)
- **Icons:** Lucide React

**Do not introduce:** Next.js, Redux, Styled Components, Material UI, Firebase, Prisma, tRPC, Zustand (listed in package.json but unused — do not start using it).

## 3. Architecture

```
src/
  App.tsx              — All routes (React Router); billing/checkout routes redirect home
  main.tsx             — Entry point (Sentry init, React render)
  index.css            — CSS variables (design tokens), Tailwind layers
  pages/
    app/               — Workspace tenant pages (ProtectedRoute) — the current-generation surface
    admin/             — Legacy admin pages + AdminWorkspace* wrappers (PlatformAdminRoute)
    portal/            — Client portal pages (ClientProtectedRoute)
    prospect/          — Public prospect dashboard (slug-keyed)
    client/            — Public client approval view (slug-keyed)
    onboarding/        — Public token-keyed client onboarding
    account/           — Login, accept-invite, forced password change
    *.tsx              — Public marketing pages
  components/
    ui/                — shadcn/ui primitives (do not edit manually)
    workspace/         — Workspace app components (WorkspaceLayout is the app shell)
    admin/             — Legacy admin components (DashboardLayout is the legacy shell)
    portal/, onboarding/, blog/ — surface-specific components
  services/            — One file per domain; async functions calling supabase tables or
                         supabase.functions.invoke, errors normalized via lib/functionErrors.ts
  lib/                 — supabase client, config, queryClient, workspaceRoutes, sentry, utils
  contexts/            — AuthContext (workspace/admin), ClientPortalContext (portal)
  hooks/               — Custom hooks
supabase/
  functions/           — Deno edge functions (one folder per function)
    _shared/           — workspaceAuth.ts, cors.ts, portalSecurity.ts, instantly.ts,
                         podcastCache.ts, httpError.ts, etc. (several have Deno tests)
  migrations/          — SQL migrations (schema changes MUST go here)
docs/invite-only-edge-manifest.json — release manifest governing edge function deploys
scripts/               — check/test/verify scripts wired into check:static
```

**Auth model (three independent systems):**
1. **Workspace/admin:** Supabase Auth → `account-context` edge function returns `{platform_admin, state, membership, workspace}`. The frontend never decides authorization itself. Account states: `active | pending | password_change_required | suspended | expired | ...` — `ProtectedRoute`/`PlatformAdminRoute` route each state.
2. **Portal:** custom sessions from `login-with-password` (PBKDF2, hashed session tokens, sessionStorage). Separate from Supabase Auth.
3. **Public slugs:** prospect/client/onboarding pages authenticate by unguessable slug/token only.

**Tenancy:** RLS with paired `_isolation` policies, SECURITY DEFINER helpers (`current_workspace_id()`, `can_access_workspace()`), and composite FKs (e.g. `(workspace_id, client_id, id)`) that make cross-tenant references unrepresentable.

## 4. Coding Conventions

- **Components:** Arrow function components (`const MyComponent = () => {}`), no `React.FC`
- **Naming:** PascalCase for components/types, camelCase for functions/variables
- **Imports:** Use `@/` path alias (maps to `src/`). Prefer named imports.
- **Interfaces:** Exported from service files alongside query functions. Use `interface` not `type` for object shapes.
- **Error handling:** `try/catch` in services, `toast()` (sonner) for user-facing errors; normalize edge function errors with `toFunctionError` from `src/lib/functionErrors.ts`
- **Async data:** TanStack Query hooks in pages, raw `supabase` calls in service files
- **New services** should invoke edge functions (`supabase.functions.invoke`) rather than query tables directly — that is the current-generation pattern (see `workspaceCampaigns.ts`, `clientPodcastSystem.ts`)

## 5. Edge Function Pattern (current generation)

New edge functions MUST use the `_shared/workspaceAuth.ts` toolkit, not hand-rolled CORS/auth. Follow an existing workspace function (e.g. `supabase/functions/workspace-client-podcast-system/index.ts`) as the template:

- `requireAuthenticatedUser(req)` → `requireWorkspaceFeatureAccess(...)` for tenant functions; `requirePlatformAdmin` for admin-only
- `parseJsonObject` (size-capped), `requireOnlyKeys`, `requireUuid`, `requireString` for body validation
- `jsonResponse` / `optionsResponse` / `errorResponse` from `_shared/workspaceAuth.ts`; CORS via `_shared/cors.ts` allowlist (never wildcard)
- Coded errors via `HttpError(status, code, message)` from `_shared/httpError.ts`
- Audit significant mutations with `writeAudit` → `workspace_audit_log`

**Adding a function requires updating, in the same change:** `supabase/config.toml` (`verify_jwt = true` entry), `docs/invite-only-edge-manifest.json` (function + deploy lists and counts), `scripts/verify-invite-only-release.mjs` (expected counts), `scripts/check-edge-functions.sh` (entrypoint count), and usually a `scripts/test-<name>-edge-contract.mjs` + `package.json` test script wired into `check:static`. The release verifier fails CI if any of these disagree.

The legacy inline-CORS/`[Function Name]` logging style exists in ~50 older functions; do not copy it for new work.

## 6. Content and Copy Guidance

- Tone: Professional, confident, results-oriented. Not salesy or hype-driven.
- Brand name: "Get On A Pod" — one name for the product and the company. It was
  formerly "Authority Built" as the company; that name is retired and should not
  reappear in copy, docs or comments.
- Target audience: Entrepreneurs, founders, thought leaders seeking podcast guest appearances
- Avoid: Overpromising, vague claims, exclamation marks in body copy
- Pricing may be **stated** publicly, but nothing may be **sold** publicly: the
  landing page names what a plan costs so people can self-qualify before asking
  to join, and every call to action still goes to the request-to-join form.
  Checkout copy remains out of scope — the billing edge functions are retired
  and return 410, so a public page must never imply you can buy on the spot.
  Public prices come from `billing_plans` (seeded in
  `20260730000100_billing_plans.sql`, priced in `20260731000100/000200`); if the
  page and `/app/platform/billing` disagree, that screen is right.

## 7. Testing and Quality Bar

- **Runner:** Vitest 3 + Testing Library (jsdom), config in `vitest.config.ts`, setup in `src/test/setup.ts`. ~45 test files colocated next to their subjects.
- **No blanket `test` script.** Tests run as curated suites: `test:workspace-mvp` (the big one), `test:podcast-research`, `test:workspace-client-podcast-system`, plus Node edge-contract scripts (`scripts/test-*-edge-contract.mjs`) that statically assert on edge function source, and Deno tests for `_shared/` (run via `check:edge`). New test files must be added to the relevant suite in `package.json` or they will never run.
- **Service test pattern:** `vi.mock('@/lib/supabase')`, assert both the returned mapping and the exact `functions.invoke` payload.
- **`check:static`** is the full local/CI gate (typecheck, scoped eslint, all suites, contract scripts, build, secret scan). CI runs `.github/workflows/pr-static-validation.yml`.
- **"Done" means:** `npm run typecheck:app` clean, relevant test suite passes, `npm run build` succeeds, affected pages render.

## 8. File and Component Placement Rules

- **New workspace page:** `src/pages/app/`, route in `App.tsx` (both `/app/<module>` and `/app/workspaces/:workspaceId/<module>` with a thin `AdminWorkspace*` wrapper in `src/pages/admin/`), register the module in `src/lib/workspaceRoutes.ts`, add the nav item in `src/components/workspace/WorkspaceLayout.tsx`, and update their tests.
- **New service:** `src/services/` (one file per domain), with a colocated `.test.ts` added to the right suite.
- **New edge function:** see section 5 — the manifest/config/scripts must be updated together.
- **New UI primitive:** `npx shadcn-ui@latest add`, never hand-write into `components/ui/`.
- **Prefer editing over creating.** Check if a service file or component already exists first.

## 9. Safety Rules

- **Auth:** Do not modify `AuthContext.tsx`, `ClientPortalContext.tsx`, `ProtectedRoute.tsx`, or `_shared/workspaceAuth.ts` without explicit approval
- **Database:** Never change schema without a migration file in `supabase/migrations/`. Preserve the RLS paired-policy and composite-FK tenancy patterns.
- **API keys:** All secrets live in Supabase edge function env vars. `VITE_` vars must contain only public keys (anon key, Sentry DSN).
- **Edge functions:** Maintain backward compatibility — existing callers depend on request/response shapes. Do not delete/rename functions without checking callers AND the release manifest. Retired functions are 410 tombstones with an exact AST-verified shape — do not "clean them up."
- **Admin access:** Platform admins come from the `admin_users` table via the `account-context` function; `src/lib/config.ts` fallback email is legacy compat.

## 10. Commands

```bash
npm run dev                  # Vite dev server
npm run build                # Sitemap + production build (static-validation mode)
npm run lint                 # ESLint (also lint:mvp for the scoped gate)
npm run typecheck:app        # tsc --noEmit for the app

npm run test:workspace-mvp   # Main vitest suite (~45 files)
npm run test:podcast-research
npm run test:workspace-client-podcast-system
npm run check:edge           # Deno 2.5.2 typecheck + _shared tests for all edge functions
npm run check:invite-only-release   # Release manifest/config verifier
npm run check:static         # Full gate (what CI runs)

# Supabase (CLI available via npx)
npx supabase functions deploy <function-name>
npx supabase db push
```

## Environment Variables

**Client-side (`.env`, `VITE_` prefix):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public key
- `VITE_SENTRY_DSN` — Sentry error tracking DSN
- `VITE_APP_URL` — canonical browser application origin

No provider or service credential belongs in a `VITE_` variable. Billing and
HeyGen/video generation are retired in the invite-only MVP; Podscan, AI, email,
Google, Instantly, and webhook secrets remain server-only.

**Edge function env vars (set in Supabase dashboard, not in `.env`):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — AI features / embeddings
- `PODSCAN_API_KEY` — podcast data
- `INSTANTLY_CREDENTIAL_ENCRYPTION_KEY` — encrypts per-workspace Instantly keys
- `RESEND_API_KEY` — transactional email
- `ACCESS_REQUEST_NOTIFY_EMAIL` — recipient for landing-page access requests (optional; the request is stored regardless)
- Custom domains: `CUSTOM_DOMAIN_PROVIDER` (`railway` default, or `cloudflare`) selects where
  *new* tenant domains are created. Existing rows keep the provider recorded on them, so
  switching never strands a domain that is already serving. Railway needs `RAILWAY_API_TOKEN`,
  `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_PROJECT_ID`; Cloudflare for SaaS needs
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_SAAS_FALLBACK_ORIGIN` (the hostname
  agencies point their CNAME at), and `CLOUDFLARE_SAAS_WORKER` (the worker that rewrites Host to
  the Railway service domain — without it a custom hostname issues a certificate and then 526s,
  because Railway routes by Host and Cloudflare's SNI override is Enterprise-only)
- `ALLOWED_ORIGINS` / `APP_URL` — CORS allowlist (https-only; localhost only when `ENVIRONMENT=development`)
- Webhook shared secrets: `CLAY_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `ONBOARDING_CAPABILITY_SECRET`
