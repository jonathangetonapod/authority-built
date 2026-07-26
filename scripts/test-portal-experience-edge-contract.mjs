import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/portal-experience/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const manifest = readFileSync('docs/invite-only-edge-manifest.json', 'utf8')

// Auth: a valid client-scoped portal session, or the explicit
// platform-admin impersonation path — never workspace auth.
assert.match(edge, /if \(req\.method === 'OPTIONS'\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /requireOnlyKeys\(body, \['clientId', 'sessionToken'\]\)/u)
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

// Review counts only consider shortlist podcasts visible to the client.
assert.match(edge, /\.eq\('visibility', 'visible'\)/u)

// Outreach activity: internal failures never reach the client, and only
// aggregate engagement counts are exposed — never message content.
assert.match(edge, /if \(status === 'failed'\) return null/u)
assert.match(edge, /select\('id,shortlist_podcast_id,podcast_name,status,launched_at,last_activity_at,email_open_count,email_reply_count'\)/u)

// Release plumbing.
assert.match(config, /\[functions\.portal-experience\]\nverify_jwt = false/u)
assert.ok(manifest.includes('"portal-experience"'), 'portal-experience must be in the release manifest')

console.log('Portal Experience Edge contract checks passed')
