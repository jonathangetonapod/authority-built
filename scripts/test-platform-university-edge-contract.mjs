// Contract checks for the platform-university edge function and its
// migration. These pin the security shape statically: reading is any
// authenticated user but drafts are author-only, every write sits behind the
// platform-admin gate, the browser embeds a derived video id rather than a
// pasted URL, and the table is service-role-only.
//
// If one of these fails after a deliberate change, move the pin WITH the
// change and say why in a comment — the assertions document decisions, they
// do not forbid new ones.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/platform-university/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260807000300_platform_university.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const manifest = JSON.parse(readFileSync('docs/invite-only-edge-manifest.json', 'utf8'))
const service = readFileSync('src/services/universityLessons.ts', 'utf8')
const page = readFileSync('src/pages/app/WorkspaceUniversity.tsx', 'utf8')

// Registered like every current-generation function: JWT-verified and in the
// release manifest's deploy phase.
assert.match(config, /\[functions\.platform-university\]\nverify_jwt = true/u)
assert.ok(
  manifest.phases['3_after_migrations_and_verifier'].includes('platform-university'),
  'platform-university must be listed in the release manifest deploy phase',
)

// Reading is open to any authenticated user; drafts are the author's alone.
assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /if \(!context\.platformAdmin\) query = query\.eq\('published', true\)/u)

// Every write path sits behind one platform-admin gate, placed before the
// write actions are even dispatched.
const gateIndex = edge.indexOf("throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED'")
assert.ok(gateIndex > 0, 'the platform-admin gate must exist')
for (const action of ["action === 'upsert'", "action === 'delete'", "action === 'reorder'"]) {
  const actionIndex = edge.indexOf(action)
  assert.ok(actionIndex > gateIndex, `${action} must come after the platform-admin gate`)
}

// The video identity is derived server-side from an allowlist of providers;
// an unparseable link is refused, never stored.
assert.match(edge, /export function parseVideoUrl/u)
assert.match(edge, /INVALID_VIDEO_URL/u)
assert.match(edge, /Only Loom and YouTube links are supported/u)

// The browser player embeds via provider + id, never the pasted URL.
assert.match(service, /www\.loom\.com\/embed\/\$\{encodeURIComponent\(lesson\.video_id\)\}/u)
assert.match(service, /www\.youtube-nocookie\.com\/embed\/\$\{encodeURIComponent\(lesson\.video_id\)\}/u)
assert.match(page, /universityEmbedUrl\(playing\)/u)
assert.ok(
  !/iframe[\s\S]{0,200}video_url/u.test(page),
  'the player iframe must never take the pasted URL as its source',
)

// The table is service-role-only: RLS enabled AND forced, grants revoked.
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)
assert.match(migration, /FORCE ROW LEVEL SECURITY/u)
assert.match(migration, /REVOKE ALL ON public\.platform_university_lessons FROM anon, authenticated/u)
assert.match(migration, /provider TEXT NOT NULL CHECK \(provider IN \('loom', 'youtube'\)\)/u)

// Authoring visibility in the UI comes from the server's answer, not a
// client-side role guess.
assert.match(page, /const canManage = lessonsQuery\.data\?\.can_manage === true/u)

console.log('Platform University edge contract checks passed')
