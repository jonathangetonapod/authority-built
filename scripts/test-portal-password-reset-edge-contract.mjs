// Static contract checks for the self-serve client portal password reset.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/portal-password-reset/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260726000200_client_portal_password_reset.sql', 'utf8')
const configToml = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/clientPortal.ts', 'utf8')
const appRoutes = readFileSync('src/App.tsx', 'utf8')

// Rate limiting happens before any account lookup.
assert.match(edge, /reserve_client_portal_reset_request_v1[\s\S]*?RESET_RATE_LIMITED[\s\S]*?\.from\('clients'\)/u)
// Anti-enumeration: the request action returns success whether or not a client matched.
assert.match(edge, /Identical response whether or not the email matched a portal account/u)
assert.match(edge, /return jsonResponse\(req, METHODS, 200, \{ success: true \}\)/u)
// Tokens are hashed before storage and redeemed by hash only.
assert.match(edge, /const tokenHash = await hashPortalSessionToken\(token\)/u)
assert.match(edge, /crypto\.randomUUID\(\)/u)
assert.doesNotMatch(edge, /token_hash:\s*token\b/u)
// The completion RPC never receives the raw password, only the PBKDF2 verifier.
assert.match(edge, /const passwordHash = await hashPortalPassword\(password\)/u)
assert.match(edge, /complete_client_portal_password_reset_v1[\s\S]*?p_password_hash: passwordHash/u)
// Generic failure copy for invalid/expired tokens.
assert.match(edge, /RESET_INVALID/u)

// Migration: sessions and tokens are revoked on reset, token burns after use.
assert.match(migration, /DELETE FROM public\.client_portal_sessions WHERE client_id = reset_client_id/u)
assert.match(migration, /DELETE FROM public\.client_portal_reset_tokens WHERE client_id = reset_client_id/u)
assert.match(migration, /credential_version = public\.client_portal_credentials\.credential_version \+ 1/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_client_portal_password_reset_v1\(TEXT, TEXT, TEXT\) FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /'client\.portal_password\.reset'/u)

// Public function is explicitly configured and routed.
assert.match(configToml, /\[functions\.portal-password-reset\]\nverify_jwt = false/u)
assert.match(service, /'portal-password-reset'/u)
assert.match(appRoutes, /path="\/portal\/forgot"/u)
assert.match(appRoutes, /path="\/portal\/reset"/u)
assert.match(appRoutes, /path="\/reset-password"/u)

// Portal invitation action (manage-client-portal-password): tenant-only,
// owner-gated, hashed 7-day token, delivery status returned, never the token.
const manageEdge = readFileSync('supabase/functions/manage-client-portal-password/index.ts', 'utf8')
assert.match(manageEdge, /const INVITE_TOKEN_TTL_DAYS = 7/u)
assert.match(manageEdge, /if \(action === 'invite'\)[\s\S]*?requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id'\]\)/u)
assert.match(manageEdge, /PASSWORD_MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(manageEdge, /const tokenHash = await hashPortalSessionToken\(token\)/u)
assert.match(manageEdge, /client_portal_reset_tokens[\s\S]*?token_hash: tokenHash/u)
assert.match(manageEdge, /delivery: \{ status: delivery\.status \}/u)
assert.doesNotMatch(manageEdge, /jsonResponse\([^)]*token[^_]/u)
// The invite action is unreachable from the legacy platform-admin branch.
const legacyBranchStart = manageEdge.indexOf('Compatibility path for the legacy platform-only client screen')
assert.ok(legacyBranchStart > 0, 'legacy branch marker missing')
assert.doesNotMatch(manageEdge.slice(legacyBranchStart), /action === 'invite'/u)

console.log('Portal password reset edge contract passed')
