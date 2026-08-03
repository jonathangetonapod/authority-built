import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Strip comments before asserting what a file does NOT do. A comment naming a
 * forbidden call is documentation, not a call — this has caught me out four
 * times, so it lives in one place now.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/[^\n]*/gu, '$1')

const fn = readFileSync('supabase/functions/request-workspace-access/index.ts', 'utf8')
const code = stripComments(fn)
const migration = readFileSync(
  'supabase/migrations/20260802080000_workspace_access_requests.sql',
  'utf8',
)
// Same rule for SQL: read the statements, not the comments explaining them.
const sql = migration.replace(/(^|\s)--[^\n]*/gu, '$1')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/accessRequests.ts', 'utf8')
const serviceCode = stripComments(service)

// The form is posted by strangers who have no account yet, so there is no JWT
// to verify. That is the whole reason the rest of these assertions exist.
assert.match(config, /\[functions\.request-workspace-access\]\s+verify_jwt = false/u)

// Unauthenticated and public is only safe while the endpoint grants nothing.
// If any of these ever appear here, an anonymous caller is creating access.
for (const forbidden of [
  /createUser/u,
  /inviteUserByEmail/u,
  /generateLink/u,
  /from\('workspaces'\)/u,
  /from\('workspace_members'\)/u,
  /admin_users/u,
]) {
  assert.doesNotMatch(code, forbidden, `request-workspace-access must not touch ${forbidden}`)
}

// Shape validation before anything is written, and no field the form does not
// send — otherwise an anonymous caller chooses its own columns.
assert.match(code, /requireOnlyKeys\(body, \[[^\]]*'email'[^\]]*'audience'[^\]]*\]\)/u)
assert.match(code, /requireEmail\(body\.email\)/u)
assert.match(code, /parseJsonObject\(req, 8_192\)/u)
assert.match(code, /AUDIENCES\.has\(audience\)/u)

// Anyone can post, so the endpoint has to hold a limit itself — and these
// assertions have to fail if the enforcement is removed, not merely if the
// constant is. Declaring a limit and never comparing it is the failure mode.
assert.match(code, /MAX_PER_IP_PER_DAY = \d+/u)
assert.match(code, /source_ip_hash/u)
assert.match(code, /p_source_ip_hash: ipHash/u)
assert.match(code, /p_daily_ceiling: ceiling/u)
assert.match(code, /outcome === 'rate_limited'/u)
assert.match(code, /new HttpError\(\s*429,\s*'TOO_MANY_REQUESTS'/u)

// Counting and inserting have to happen under one lock. Two round trips let
// simultaneous callers all read the same under-ceiling count and all insert,
// which is the ceiling holding only against a caller who waits politely.
assert.match(code, /admin\.rpc\('record_workspace_access_request'/u)
assert.doesNotMatch(
  code,
  /from\('workspace_access_requests'\)/u,
  'the request must go through the atomic RPC, not a direct table write',
)
const rateLimitMigration = readFileSync(
  'supabase/migrations/20260803001000_access_request_rate_limit_atomic.sql',
  'utf8',
).replace(/(^|\s)--[^\n]*/gu, '$1')
assert.match(rateLimitMigration, /pg_advisory_xact_lock/u)
assert.match(rateLimitMigration, /SELECT count\(\*\)[\s\S]*?INTO recent_count/u)
assert.match(rateLimitMigration, /recent_count >= p_daily_ceiling[\s\S]*?RETURN 'rate_limited'/u)
assert.match(rateLimitMigration, /INSERT INTO public\.workspace_access_requests/u)
assert.match(rateLimitMigration, /SET search_path = ''/u)
assert.match(rateLimitMigration, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated/u)

// A caller who strips their headers must not thereby buy a bigger allowance.
// This was briefly inverted: 5 per address, 20 for anyone unidentifiable.
const perIp = Number(/MAX_PER_IP_PER_DAY = (\d+)/u.exec(code)?.[1])
const unidentified = Number(/MAX_UNIDENTIFIED_PER_DAY = (\d+)/u.exec(code)?.[1])
assert.ok(
  Number.isFinite(perIp) && Number.isFinite(unidentified) && unidentified <= perIp,
  `the unidentified bucket (${unidentified}) must be no larger than the per-address limit (${perIp})`,
)

// The only thing between a stranger's name and HTML in the admin's inbox.
assert.match(code, /function escapeHtml/u)
assert.doesNotMatch(code, /<td>\$\{(?!escapeHtml)/u)
// The address is hashed with a secret that never leaves the function, so the
// stored value cannot be turned back into an address by anyone reading the row.
assert.match(code, /SHA-256/u)
assert.doesNotMatch(code, /source_ip:\s/u)

// The reply says nothing about who else has asked. A form that answers
// differently for a known email is an account-enumeration oracle.
assert.match(code, /jsonResponse\(req, METHODS, 200, \{ received: true \}\)/u)
assert.doesNotMatch(code, /already (requested|applied|exists)/iu)

// Notification is best effort: the request is saved first, and a mail provider
// having a bad afternoon must not turn a saved request into a visible error.
const insertIndex = fn.indexOf("admin.rpc('record_workspace_access_request'")
const notifyIndex = fn.indexOf('await notifyPlatform')
assert.ok(insertIndex > 0 && notifyIndex > insertIndex, 'the request must be saved before notifying')

// The rate limit reads an address the caller cannot choose. Reading the FIRST
// x-forwarded-for entry lets anyone reset their own bucket every request by
// sending a different fake address; the last entry is the one the proxy wrote.
assert.match(code, /cf-connecting-ip/u)
assert.match(code, /chain\[chain\.length - 1\]/u)
assert.doesNotMatch(code, /x-forwarded-for'\)\?\.split\(','\)\[0\]/u)
// No address at all means a shared bucket, not an exemption from the limit.
assert.match(code, /UNIDENTIFIED_BUCKET/u)

// Storage: statuses and audiences are constrained, so the admin queue can never
// hold a value nothing writes and nobody can clear.
assert.match(migration, /check \(status in \('new', 'contacted', 'invited', 'declined'\)\)/u)
assert.match(migration, /check \(audience in \('agency', 'pr', 'freelancer', 'starting_out', 'other'\)\)/u)
assert.match(migration, /enable row level security/u)
// No tenant owns an access request — it arrives before there is a workspace —
// so platform admins are the only readers, and there is no anon policy at all.
assert.match(migration, /create policy workspace_access_requests_admin_read/u)
assert.doesNotMatch(sql, /to anon/u)
// Gated through the SECURITY DEFINER helper every other current-generation
// policy uses. A hand-rolled `admin_users.user_id` check is both weaker and
// broken — that table is keyed by email and has no user_id column, a mistake
// 20260109000002_fix_admin_rls_policies.sql already had to undo once.
assert.match(migration, /using \(public\.is_platform_admin\(\)\)/u)
assert.doesNotMatch(sql, /admin_users/u)
// Personal data somebody volunteered needs a way out of the table.
assert.match(migration, /create policy workspace_access_requests_admin_delete/u)

// The browser calls the function, never the table: with no anon policy a direct
// table insert would fail silently from the caller's point of view.
assert.match(service, /functions\.invoke\('request-workspace-access'/u)
// The public submit must stay on the function: there is no anon insert policy,
// and every length and shape check lives server-side. The admin queue below may
// read the table, but nothing in the browser may ever write a row to it.
assert.doesNotMatch(serviceCode, /\.insert\(/u)

// The landing page stylesheet is bundled into the app's single CSS file and
// loads on every route, after Tailwind's preflight. A rule that starts with an
// element, a pseudo-element or a bare attribute is therefore an app-wide rule,
// not a landing-page one — `section { padding-block: ... }` here put 8rem of
// padding on every <section> in the product. Everything must stay under
// .gp-page.
const css = readFileSync('src/styles/agencyLanding.css', 'utf8')
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '')
const escaped = []
for (const block of withoutComments.split('}')) {
  const selector = block.split('{')[0].trim()
  if (!selector || selector.startsWith('@') || selector.startsWith('/')) continue
  for (const part of selector.split(',')) {
    const one = part.trim()
    if (!one) continue
    // `:root[data-theme="dark"] .gp-page` is the app's theme attribute reaching
    // in to retint the page. Its subject is still .gp-page, so it cannot select
    // anything outside; everything else must lead with .gp-.
    const rooted = one.replace(/^:root\[data-theme="(?:dark|light)"\]\s+/u, '')
    if (!/^\.gp-/u.test(rooted)) escaped.push(one)
  }
}
assert.deepEqual(escaped, [], `agencyLanding.css selectors must start with .gp-; these escape the page: ${escaped.join(' | ')}`)

// The page's screenshots are files dropped into public/shots. The markup must
// name each one and carry an alt, so a missing file degrades to a placeholder
// and a present one is described. The page names the files; the fallback lives
// in the Shot component it renders them through.
const landing = readFileSync('src/pages/AgencyLanding.tsx', 'utf8')
const shot = readFileSync('src/components/landing/Shot.tsx', 'utf8')
const shotSources = [...landing.matchAll(/src: '(\/shots\/[a-z]+\.png)'/gu)].map((match) => match[1])
assert.ok(shotSources.length >= 5, 'the tour should name every screenshot it shows')
assert.match(shot, /onError=\{\(\) => setMissing\(true\)\}/u)
assert.match(css, /\.gp-shot-empty \{/u)

// One vocabulary for "what you run", across the form, the function and the
// column constraint. They are three hand-written lists; if the form ever sends
// a value the other two do not know, the insert violates the check constraint,
// the caller gets a 500, and the request is lost.
const form = readFileSync('src/components/landing/AccessRequestForm.tsx', 'utf8')
const formValues = [...form.matchAll(/value: '([a-z_]+)'/gu)].map((match) => match[1])
const edgeValues = (/const AUDIENCES = new Set\(\[([^\]]+)\]\)/u.exec(code)?.[1] ?? '')
  .split(',').map((part) => part.trim().replace(/'/gu, '')).filter(Boolean)
const dbValues = (/check \(audience in \(([^)]+)\)\)/u.exec(sql)?.[1] ?? '')
  .split(',').map((part) => part.trim().replace(/'/gu, '')).filter(Boolean)
assert.ok(formValues.length >= 4, 'the form must offer the audiences it claims to')
for (const value of formValues) {
  assert.ok(edgeValues.includes(value), `the function rejects an audience the form offers: ${value}`)
  assert.ok(dbValues.includes(value), `the column rejects an audience the form offers: ${value}`)
}

// Nothing showed a request to a human until the admin queue existed. It reads
// the table directly — a deliberate departure from the edge-function pattern,
// because the project is at its deployed-function cap — so the row-level policy
// is the whole of the authorization and the query must not widen it.
assert.match(service, /from\('workspace_access_requests'\)/u)
assert.doesNotMatch(serviceCode, /source_ip_hash/u)
assert.match(service, /handled_by: session\?\.user\?\.id/u)
// The admin-only policies this leans on have to still be there.
assert.match(sql, /for select\s+to authenticated\s+using \(public\.is_platform_admin\(\)\)/u)
assert.match(sql, /for update\s+to authenticated\s+using \(public\.is_platform_admin\(\)\)/u)

console.log('access request edge contract OK')
