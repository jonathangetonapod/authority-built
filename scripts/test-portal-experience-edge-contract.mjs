import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/portal-experience/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const manifest = readFileSync('docs/invite-only-edge-manifest.json', 'utf8')
const app = readFileSync('src/App.tsx', 'utf8')
const portalLayout = readFileSync('src/components/portal/PortalLayout.tsx', 'utf8')
const portalService = readFileSync('src/services/clientPortal.ts', 'utf8')

// Auth: a valid client-scoped portal session, or the explicit
// platform-admin impersonation path — never workspace auth.
assert.match(edge, /if \(req\.method === 'OPTIONS'\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /requireOnlyKeys\(body, \['clientId', 'sessionToken', 'addon_request', 'calendar_event', 'delete_event_id', 'notifications_enabled'\]\)/u)
// Add-on requests are recorded before any notification is attempted, and the
// notification failure never fails the request.
assert.match(edge, /from\('client_portal_activity_log'\)[\s\S]*?action: 'addon_request'/u)
assert.match(edge, /hashPortalSessionToken\(sessionToken\)/u)
assert.match(edge, /\.from\('client_portal_sessions'\)[\s\S]*?\.eq\('session_token', sessionTokenHash\)[\s\S]*?\.eq\('client_id', clientId\)[\s\S]*?\.gt\('expires_at', new Date\(\)\.toISOString\(\)\)/u)
assert.match(edge, /client\?\.portal_access_enabled[\s\S]*?workspace\?\.status !== 'active'[\s\S]*?INVALID_PORTAL_SESSION/u)
assert.match(edge, /await requirePlatformAdmin\(req\)/u)

// Every table read is scoped to the authenticated client.
const clientScopedReads = edge.match(/\.eq\('client_id', clientId\)/gu) ?? []
assert.ok(clientScopedReads.length >= 6, 'all portal reads must be scoped to the client')

// Client-safe payload: no operator-only or outreach-sensitive fields.
for (const forbidden of [
  'operator_notes',
  'research_document',
  'contact_email',
  'pitch_body',
  'pitch_subject',
  'api_key',
  'last_error',
]) {
  assert.ok(!edge.includes(forbidden), `portal-experience must never select ${forbidden}`)
}

// The guest profile is only exposed once the workspace approved it.
assert.match(edge, /pitchProfileResult\.data\?\.approved_at/u)

// Review counts only consider shortlist podcasts visible to the client — but
// the filter moved into code, because the same rows also enrich bookings, and
// filtering the query stripped artwork and audience from any booking whose
// shortlist row was later archived.
assert.match(edge, /const visibleRows = shortlistRows\.filter\(\(row\) => row\.visibility === 'visible'\)/u)
assert.match(edge, /for \(const row of shortlistRows\) \{/u)
// Client-created events carry no scheduled_date; nulls-first keeps them inside
// the 500-row window instead of making them the first rows silently dropped.
assert.match(edge, /nullsFirst: true/u)

// Outreach activity: internal failures never reach the client, and only
// aggregate engagement counts are exposed — never message content.
assert.match(edge, /if \(status === 'failed'\) return null/u)
assert.match(edge, /select\('id,shortlist_podcast_id,podcast_name,status,launched_at,last_activity_at,email_open_count,email_reply_count'\)/u)

// Release plumbing.
assert.match(config, /\[functions\.portal-experience\]\nverify_jwt = false/u)
assert.ok(manifest.includes('"portal-experience"'), 'portal-experience must be in the release manifest')

// The milestone emails are answerable: the client can switch them off, and
// the switch is a boolean scoped to their own row.
assert.match(edge, /notifications_enabled must be true or false/u)
assert.match(
  edge,
  /\.from\('clients'\)\s*\n\s*\.update\(\{ notifications_enabled: body\.notifications_enabled \}\)\s*\n\s*\.eq\('id', clientId\)/u,
)


// Client-added calendar events: creation is flagged, removal is restricted to
// the client's own entries, and the write surface is bounded.
assert.match(edge, /created_by_client: true/u)
assert.match(edge, /delete_event_id[\s\S]*?\.eq\('client_id', clientId\)[\s\S]*?\.eq\('created_by_client', true\)/u)
assert.match(edge, /EVENT_LIMIT_REACHED/u)

// The portal is what a client sees of the agency they already pay. Selling
// them clip packages inside it put the agency's own client in a shop, under
// the agency's brand, on the agency's domain — so the surface is gone rather
// than merely unlinked, and the route redirects because links to it are
// already out in emails.
assert.doesNotMatch(portalLayout, /\/portal\/addons/u, 'the portal nav must not offer add-ons')
assert.doesNotMatch(portalLayout, /Add-ons/u)
assert.doesNotMatch(portalService, /requestPortalAddon/u, 'the portal must not be able to request an upsell')
assert.match(app, /path="\/portal\/addons"[\s\S]{0,400}Navigate to="\/portal\/dashboard"/u)

console.log('Portal Experience Edge contract checks passed')
