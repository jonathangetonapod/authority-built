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

// Watch marks are per-user and probe-proof: a member marking a lesson
// watched must never confirm the existence of a draft id, and the caller's
// identity comes from the token, never the body.
assert.match(edge, /action === 'set-watched'/u)
assert.match(edge, /if \(!context\.platformAdmin\) lessonQuery = lessonQuery\.eq\('published', true\)/u)
assert.match(edge, /\.eq\('user_id', context\.user\.id\)\s+\.eq\('lesson_id', lessonId\)/u)
const watchesMigration = readFileSync('supabase/migrations/20260807000400_university_watches.sql', 'utf8')
assert.match(watchesMigration, /FORCE ROW LEVEL SECURITY/u)
assert.match(watchesMigration, /REVOKE ALL ON public\.platform_university_watches FROM anon, authenticated/u)

// The table is service-role-only: RLS enabled AND forced, grants revoked.
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)
assert.match(migration, /FORCE ROW LEVEL SECURITY/u)
assert.match(migration, /REVOKE ALL ON public\.platform_university_lessons FROM anon, authenticated/u)
assert.match(migration, /provider TEXT NOT NULL CHECK \(provider IN \('loom', 'youtube'\)\)/u)

// The category vocabulary must be ONE set in all four places. The page only
// renders categories listed in its own CATEGORY_META, so a category the
// server accepts but the page does not know renders the lesson invisible —
// saved, billed for nothing, and unfindable.
function extractSet(source, pattern) {
  const match = pattern.exec(source)
  if (!match) return null
  return [...match[1].matchAll(/'([a-z_]+)'/gu)].map((entry) => entry[1]).sort()
}
const migrationCategories = extractSet(migration, /category IN \(([\s\S]*?)\)\)/u)
const edgeCategories = extractSet(edge, /const CATEGORIES = \[([\s\S]*?)\] as const/u)
const pageCategories = extractSet(page, /CATEGORY_META: Array[\s\S]*?= \[([\s\S]*?)\n\]/u)
  ?.filter((value) => !['label', 'segment', 'id'].includes(value))
const serviceCategories = extractSet(service, /export type UniversityCategory =([\s\S]*?)\n\n/u)
assert.ok(migrationCategories && edgeCategories && serviceCategories, 'category sets must be extractable')
assert.deepEqual(edgeCategories, migrationCategories, 'edge CATEGORIES must equal the migration CHECK set')
assert.deepEqual(serviceCategories, migrationCategories, 'service UniversityCategory must equal the migration CHECK set')
const pageIds = [...page.matchAll(/\{ id: '([a-z_]+)', label:/gu)].map((entry) => entry[1]).sort()
assert.deepEqual(pageIds, migrationCategories, 'page CATEGORY_META ids must equal the migration CHECK set')

// Deleting a lesson must take its watch rows with it.
const watchesCascade = readFileSync('supabase/migrations/20260807000400_university_watches.sql', 'utf8')
assert.match(watchesCascade, /lesson_id UUID NOT NULL REFERENCES public\.platform_university_lessons\(id\) ON DELETE CASCADE/u)

// Exact provider id shapes: Loom is the trailing 32-hex of a possibly
// slugged share link; YouTube ids are exactly 11 characters. A looser net
// stored slug words and playlist ids as "video ids" — dead players
// published to every workspace.
assert.match(edge, /\(\?:\[\\w-\]\+-\)\?\(\[0-9a-f\]\{32\}\)/u)
assert.match(edge, /const YOUTUBE_ID = \/\^\[A-Za-z0-9_-\]\{11\}\$\/u/u)

// Authoring visibility in the UI comes from the server's answer, not a
// client-side role guess.
assert.match(page, /const canManage = lessonsQuery\.data\?\.can_manage === true/u)

console.log('Platform University edge contract checks passed')
