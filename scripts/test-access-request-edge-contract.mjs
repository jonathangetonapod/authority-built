import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fn = readFileSync('supabase/functions/request-workspace-access/index.ts', 'utf8')
// Assertions about what the function does read the code, not the comments that
// explain it — a comment naming a forbidden phrase is documentation, not a call.
const code = fn.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/[^\n]*/gu, '$1')
const migration = readFileSync(
  'supabase/migrations/20260802080000_workspace_access_requests.sql',
  'utf8',
)
// Same rule as `code` above: assertions read SQL, not the comments explaining it.
const sql = migration.replace(/(^|\s)--[^\n]*/gu, '$1')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/accessRequests.ts', 'utf8')

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
assert.match(fn, /requireOnlyKeys\(body, \[[^\]]*'email'[^\]]*'audience'[^\]]*\]\)/u)
assert.match(fn, /requireEmail\(body\.email\)/u)
assert.match(fn, /parseJsonObject\(req, 8_192\)/u)
assert.match(fn, /AUDIENCES\.has\(audience\)/u)

// Anyone can post, so the endpoint has to hold a limit itself.
assert.match(fn, /MAX_PER_IP_PER_DAY = \d+/u)
assert.match(fn, /source_ip_hash/u)
// The address is hashed with a secret that never leaves the function, so the
// stored value cannot be turned back into an address by anyone reading the row.
assert.match(fn, /SHA-256/u)
assert.doesNotMatch(code, /source_ip:\s/u)

// The reply says nothing about who else has asked. A form that answers
// differently for a known email is an account-enumeration oracle.
assert.match(fn, /jsonResponse\(req, METHODS, 200, \{ received: true \}\)/u)
assert.doesNotMatch(code, /already (requested|applied|exists)/iu)

// Notification is best effort: the request is saved first, and a mail provider
// having a bad afternoon must not turn a saved request into a visible error.
const insertIndex = fn.indexOf('.insert({')
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
assert.doesNotMatch(service, /from\('workspace_access_requests'\)/u)

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

// display:grid on the panel outranks preflight's [hidden] rule, which loads
// first — without an explicit reset all four audience panels render at once.
assert.match(css, /\.gp-panel-out\[hidden\] \{ display: none; \}/u)
// The class the strip effect writes and the class the stylesheet paints have to
// be the same one, or the interval runs forever against nothing.
const landing = readFileSync('src/pages/AgencyLanding.tsx', 'utf8')
const stripClass = /'(gp-on)'/u.exec(landing)?.[1]
assert.ok(stripClass && css.includes(`.gp-stage.${stripClass}`), 'the signal strip class must exist in the stylesheet')

console.log('access request edge contract OK')
