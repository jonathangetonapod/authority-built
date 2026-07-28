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
assert.match(migration, /hostname NOT IN \('getonapod\.com', 'www\.getonapod\.com'\)/u)
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
assert.match(admin, /\.\.\.\(serving \? \{\} : \{ is_primary: false \}\)/u)

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
    source.includes('resolveHostWorkspaceId(admin, body.hostname)'),
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

process.stdout.write('Workspace domains Edge contract checks passed\n')
