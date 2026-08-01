import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const admin = readFileSync('supabase/functions/workspace-domains/index.ts', 'utf8')
const resolver = readFileSync('supabase/functions/resolve-workspace-domain/index.ts', 'utf8')
const cors = readFileSync('supabase/functions/_shared/cors.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260728002200_workspace_custom_domains.sql',
  'utf8',
)
const config = readFileSync('supabase/config.toml', 'utf8')

// The resolver is the first call a stranger's browser makes on a tenant
// domain, before any slug is in play, so it cannot require a JWT. The
// management surface is platform-admin only.
assert.match(config, /\[functions\.resolve-workspace-domain\]\s+verify_jwt = false/u)
assert.match(config, /\[functions\.workspace-domains\]\s+verify_jwt = true/u)
assert.match(admin, /requirePlatformAdmin\(req\)/u)
assert.doesNotMatch(admin, /requireWorkspaceFeatureAccess/u)

// A hostname belongs to exactly one workspace, globally. This index is what
// stops one agency's client opening another agency's prospect dashboard on a
// domain that looks like their own.
assert.match(
  migration,
  /CREATE UNIQUE INDEX workspace_domains_hostname_idx\s+ON public\.workspace_domains \(hostname\)/u,
)
// Stored lowercase, or the row would compare unequal to the Host header it is
// meant to match and resolve to nothing without saying so.
assert.match(migration, /CHECK \(hostname = lower\(btrim\(hostname\)\)\)/u)
// The platform's own origins are not claimable.
assert.match(migration, /hostname <> 'getonapod\.com'\s+AND hostname NOT LIKE '%\.getonapod\.com'/u)
// A status that disagrees with itself is unrepresentable: only a serving
// domain carries an activation date, and only a serving domain can be primary.
assert.match(migration, /CHECK \(\(status = 'active'\) = \(activated_at IS NOT NULL\)\)/u)
assert.match(migration, /CHECK \(NOT is_primary OR status = 'active'\)/u)
// One primary per workspace, so link generation never has to choose.
assert.match(
  migration,
  /CREATE UNIQUE INDEX workspace_domains_primary_idx[\s\S]*?WHERE is_primary/u,
)

// Resolution answers only for a serving domain: a half-provisioned hostname
// must not brand anything or authorize anything.
for (const fn of ['resolve_workspace_domain_v1', 'workspace_primary_domain_v1']) {
  const body = migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`))
  const scoped = body.slice(0, body.indexOf('\n$$;'))
  assert.ok(scoped.includes("status = 'active'"), `${fn} must only resolve a serving domain`)
  assert.ok(
    scoped.includes("workspace.status = 'active'"),
    `${fn} must not resolve through a suspended workspace`,
  )
}
// Every SECURITY DEFINER helper here is service-role only.
for (const signature of [
  'public.resolve_workspace_domain_v1(TEXT)',
  'public.workspace_primary_domain_v1(UUID)',
  'public.active_workspace_domain_origins_v1()',
]) {
  assert.ok(
    migration.includes(`REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated;`),
    `${signature} must be revoked from PUBLIC, anon and authenticated`,
  )
  assert.ok(
    migration.includes(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role;`),
    `${signature} must be granted to service_role only`,
  )
}

// Railway goes first. A row recorded here while Railway has never heard of the
// hostname would point a client at a domain answering with a certificate error.
const addBlock = admin.slice(admin.indexOf("if (action === 'add')"), admin.indexOf("if (action === 'refresh')"))
assert.ok(
  addBlock.indexOf('createRailwayDomain(hostname)') < addBlock.indexOf(".from('workspace_domains')\n        .insert("),
  'the Railway domain must be created before the row is recorded',
)
// And if recording fails, the domain is handed back rather than left as an
// orphan that blocks the hostname forever.
assert.match(addBlock, /await deleteRailwayDomain\(created\.id\)\.catch\(\(\) => undefined\)/u)
// A hostname already claimed is refused before Railway is called at all.
assert.ok(
  addBlock.indexOf("'HOSTNAME_TAKEN'") < addBlock.indexOf('createRailwayDomain(hostname)'),
  'a taken hostname must be refused before Railway is called',
)
// Provider failures carry the provider's own status and body: a dead token is
// invisible when every caller replaces it with a generic message.
assert.match(admin, /Railway returned \$\{response\.status\}/u)
assert.match(admin, /RAILWAY_NOT_CONFIGURED/u)

// A domain that stops serving cannot stay primary, or client links would keep
// pointing at a hostname that no longer answers.
// The first domain to come alive becomes the one links use — the separate
// "set primary" click exists only to protect a working primary from a second
// domain, so it is skipped exactly when there is nothing to protect. A check
// that finds the domain not serving still strips primary, keeping the pairing
// constraint honest.
assert.match(
  admin,
  /promoted = !existingPrimary \|\| existingPrimary\.id === domainId/u,
  'activation must promote only when no other primary exists',
)
assert.match(admin, /is_primary: promoted,/u)

// CORS stays an allowlist. Tenant origins are added from the database, never
// by widening to a wildcard, and the response says it varies by origin so a
// shared cache cannot hand one tenant's origin to another's browser.
assert.doesNotMatch(cors, /'Access-Control-Allow-Origin': '\*'/u)
assert.match(cors, /ALLOWED_ORIGINS\.includes\(origin\) \|\| workspaceOrigins\.has\(origin\)/u)
assert.match(cors, /'Vary': 'Origin'/u)
assert.match(cors, /active_workspace_domain_origins_v1/u)
assert.match(cors, /value\.startsWith\('https:\/\/'\)/u)

// The resolver answers with public branding and nothing else, and an unknown
// hostname is a null answer rather than an error a prober can map.
assert.match(resolver, /requireOnlyKeys\(body, \['hostname'\]\)/u)
assert.match(resolver, /success: true, workspace: null/u)
assert.doesNotMatch(resolver, /\bclients\b/u)


// A domain serves its own workspace's pages and nobody else's. Without this,
// a link built for one agency renders on every other agency's hostname,
// wearing that agency's brand.
const domainHelper = readFileSync('supabase/functions/_shared/workspaceDomain.ts', 'utf8')
const prospect = readFileSync('supabase/functions/get-prospect-dashboard/index.ts', 'utf8')
const clientDashboard = readFileSync('supabase/functions/public-client-dashboard/index.ts', 'utf8')

// The platform origin resolves to no workspace, so every link that already
// exists keeps working exactly as it did.
assert.match(domainHelper, /if \(!hostWorkspaceId\) return/u)
// A failed lookup must not widen the page to every workspace.
assert.match(domainHelper, /if \(error \|\| !data \|\| typeof data !== 'object'\) return null/u)
// 404, not 403: on somebody else's domain this page does not exist, and a
// more precise answer would confirm the slug is real.
assert.match(domainHelper, /throw new HttpError\(404, notFoundCode, notFoundMessage\)/u)

for (const [label, source] of [['get-prospect-dashboard', prospect], ['public-client-dashboard', clientDashboard]]) {
  assert.ok(
    source.includes('resolveHostWorkspaceId(admin, requestHostname(req, body.hostname))'),
    `${label} must resolve the host it was asked on`,
  )
  assert.ok(
    source.includes('requireServedByHost('),
    `${label} must refuse a slug belonging to another workspace`,
  )
  assert.ok(
    /requireOnlyKeys\(body, \[[^\]]*'hostname'/u.test(source),
    `${label} must accept the hostname it checks`,
  )
}
// Every action on the client dashboard funnels through findDashboard, so the
// check sits there rather than at four call sites that could drift apart.
assert.match(clientDashboard, /async function findDashboard\([\s\S]*?hostWorkspaceId: string \| null,\n\) \{/u)

const prospectView = readFileSync('src/pages/prospect/ProspectView.tsx', 'utf8')
const approvalView = readFileSync('src/pages/client/ClientApprovalView.tsx', 'utf8')
const portalLogin = readFileSync('src/pages/portal/Login.tsx', 'utf8')
for (const [label, source] of [['ProspectView', prospectView], ['ClientApprovalView', approvalView], ['portal Login', portalLogin]]) {
  assert.ok(source.includes('currentHostname()'), `${label} must send the hostname it was opened on`)
}

// Railway's schema, verified by introspecting the live endpoint. Every one of
// these was wrong when written from memory, and each wrong one silently kept a
// domain from ever reaching 'active'.
// The certificate enum is prefixed; there is no bare 'ISSUED'.
assert.match(admin, /const CERTIFICATE_VALID = 'CERTIFICATE_STATUS_TYPE_VALID'/u)
assert.doesNotMatch(admin, /=== 'ISSUED'/u)
// customDomain requires projectId. Without it the query fails validation and
// refresh can never succeed.
assert.match(admin, /query CustomDomain\(\$id: String!, \$projectId: String!\)/u)
assert.match(admin, /customDomain\(id: \$id, projectId: \$projectId\)/u)
// Several DNS records come back; only one routes traffic. The other is the
// ACME challenge, and handing an agency that one gives them a TXT record that
// never serves the site.
assert.match(admin, /const TRAFFIC_ROUTE = 'DNS_RECORD_PURPOSE_TRAFFIC_ROUTE'/u)
assert.match(admin, /rows\.find\(\(row\) => row\.purpose === TRAFFIC_ROUTE\)/u)
// fqdn, not hostlabel: hostlabel is the sub-label alone.
assert.match(admin, /typeof record\?\.fqdn === 'string' \? record\.fqdn : hostname/u)
assert.doesNotMatch(admin, /record\?\.hostlabel/u)
// An apex domain gets an A record, so the type cannot be hardcoded.
assert.match(admin, /dnsRecordType\(record\?\.recordType\)/u)
// Railway's own reason distinguishes "add your DNS record" from "wait".
assert.match(admin, /certificateErrorMessage/u)

// Client-facing links carry the agency's hostname; the agency's own /app does
// not, because a client is never meant to open it.
const linkOrigin = readFileSync('supabase/functions/_shared/workspaceOrigin.ts', 'utf8')
const notify = readFileSync('supabase/functions/_shared/clientNotify.ts', 'utf8')
const onboardingShared = readFileSync('supabase/functions/_shared/workspaceOnboarding.ts', 'utf8')
const portalEmail = readFileSync('supabase/functions/_shared/portalResetEmail.ts', 'utf8')
assert.match(linkOrigin, /workspace_primary_domain_v1/u)
// A lookup failure falls back rather than throwing: an unbranded link that
// works beats an invitation that never sends.
assert.match(linkOrigin, /if \(error \|\| typeof data !== 'string' \|\| data\.length === 0\) return fallback/u)
assert.match(onboardingShared, /export function onboardingUrl\(token: string, origin\?: string\)/u)
assert.match(portalEmail, /export function portalResetUrl\(token: string, origin\?: string\)/u)
assert.match(portalEmail, /export function portalLoginUrl\(brandingSlug: string \| null, origin\?: string\)/u)
assert.match(notify, /await workspaceLinkOrigin\(admin, workspaceId\)/u)
assert.match(notify, /\/app\/clients\/\$\{input\.clientId\}/u)

// The Origin header is browser-set and cannot be forged by page script, so it
// wins over anything the caller put in the body.
assert.match(domainHelper, /export function requestHostname\(req: Request \| undefined, bodyHostname: unknown\)/u)
assert.match(domainHelper, /const origin = req\?\.headers\?\.get\('origin'\)/u)
for (const [label, source] of [['get-prospect-dashboard', prospect], ['public-client-dashboard', clientDashboard]]) {
  assert.ok(
    source.includes('requestHostname(req, body.hostname)'),
    `${label} must prefer the Origin header over the body hostname`,
  )
  // Each function is its own isolate with its own cache. Warming it anywhere
  // else does not reach here, and an unwarmed cache CORS-blocks every browser
  // on a tenant domain — the exact request this feature exists to serve.
  assert.ok(
    source.includes('ensureWorkspaceOriginAllowed(admin, req)'),
    `${label} must warm the tenant CORS allowlist in its own isolate`,
  )
}
// Refresh on staleness, never on a miss: an endpoint anyone can call must not
// let a varying Origin header drive unlimited database reads.
assert.match(cors, /const stale = Date\.now\(\) - workspaceOriginsFetchedAt > WORKSPACE_ORIGIN_TTL_MS\n  if \(!stale\) return/u)

// The preflight is the only request a browser sends before it will send any
// other, and it must answer with the tenant's own origin. Warming after it
// returns deadlocks: a cold isolate rejects the preflight, so the request that
// would have warmed the cache never arrives and the domain never works.
for (const [label, source] of [
  ['get-prospect-dashboard', prospect],
  ['public-client-dashboard', clientDashboard],
  ['resolve-workspace-domain', resolver],
]) {
  assert.ok(
    /if \(req\.method === 'OPTIONS'\) \{[\s\S]{0,600}?ensureWorkspaceOriginAllowed\(createAdminClient\(\), req\)[\s\S]{0,200}?return optionsResponse/u.test(source),
    `${label} must warm the tenant CORS allowlist before answering the preflight`,
  )
}
// The application guard and the database constraint must refuse the same set,
// or a platform subdomain registers a real domain at Railway before failing.
assert.match(admin, /hostname === 'getonapod\.com' \|\| hostname\.endsWith\('\.getonapod\.com'\)/u)

process.stdout.write('Workspace domains Edge contract checks passed\n')
