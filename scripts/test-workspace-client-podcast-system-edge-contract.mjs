import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-client-podcast-system/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/clientPodcastSystem.ts', 'utf8')
const page = readFileSync('src/pages/app/WorkspaceClientPodcastSystem.tsx', 'utf8')
const layout = readFileSync('src/components/workspace/WorkspaceLayout.tsx', 'utf8')
const routes = readFileSync('src/App.tsx', 'utf8')

assert.match(edge, /requireAuthenticatedUser\(req\)/u)
assert.match(edge, /requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /requireOnlyKeys\(body, \['action', 'workspace_id'\]\)/u)
assert.match(edge, /from\('clients'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /from\('workspace_client_campaign_targets'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /from\('client_dashboard_podcasts'\)[\s\S]+?\.in\('client_id', clientIds\)/u)
assert.match(edge, /from\('bookings'\)[\s\S]+?\.in\('client_id', clientIds\)/u)
assert.match(edge, /from\('workspace_onboarding_instances'\)[\s\S]+?\.eq\('workspace_id', workspaceId\)[\s\S]+?\.in\('client_id', clientIds\)/u)
assert.match(edge, /const matchedBookingIds = new Set<string>\(\)/u)
assert.match(edge, /id: `booking:\$\{booking\.id\}`/u)
assert.match(edge, /from\('client_podcast_analyses'\)[\s\S]+?\.in\('client_id', clientIds\)/u)
assert.match(edge, /from\('podcast_direct_contacts'\)/u)
assert.match(edge, /\.eq\('verification_status', 'verified'\)/u)
assert.match(edge, /source: analysisSource/u)
assert.match(edge, /email: canManage \? contactEmail : null/u)
assert.match(edge, /has_conflict: hasConflict/u)
assert.match(edge, /const readiness = aiSdrReadiness\(client\.ai_sdr_profile\)/u)
assert.match(edge, /onboarding: access\.role === 'member' \|\| !clientOnboarding \? null/u)
assert.doesNotMatch(edge, /from\('campaign_replies'\)/u)

assert.match(config, /\[functions\.workspace-client-podcast-system\]\s+verify_jwt = true/u)
assert.match(service, /functions\.invoke\('workspace-client-podcast-system'/u)
assert.match(service, /response\.workspace\.id\.toLowerCase\(\) !== canonicalWorkspaceId/u)
assert.match(page, /Private workspace overview/u)
assert.match(page, /Client Command Center/u)
assert.match(page, /Switch client overview/u)
assert.match(page, /Guest and account readiness/u)
assert.match(page, /Outreach and conversations/u)
assert.match(page, /Search this client's podcasts/u)
assert.match(page, /Confirmed delivery milestones/u)
assert.match(layout, /id: 'client-podcast-system', name: 'Client Command Center'[\s\S]+enabled: true/u)
assert.match(routes, /path="\/app\/client-podcast-system"/u)
assert.match(routes, /path="\/app\/workspaces\/:workspaceId\/client-podcast-system"/u)

console.log('workspace Client Command Center Edge contract passed')

// The command center and Master Inbox now reach each other by host, not just
// by client. A thread records the show it came from at ingestion, so this is a
// join rather than a provider call.
const masterInbox = readFileSync('src/components/workspace/MasterInboxPreview.tsx', 'utf8')

assert.match(edge, /from\('workspace_inbox_thread_state'\)[\s\S]{0,220}\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /\.not\('podcast_id', 'is', null\)/u)
assert.match(edge, /function conversationFor\(/u)
// A reply can be known from a campaign sync before the inbox has read the
// thread, and only one of those can be opened.
assert.match(edge, /thread_key: thread\?\.thread_key \?\? null/u)
assert.match(edge, /replied: replyCount > 0 \|\| Boolean\(thread\)/u)

assert.match(page, /function inboxHref\(baseHref: string, item: ClientPodcastSystemItem\)/u)
assert.match(page, /params\.set\('thread', item\.conversation\.thread_key\)/u)
assert.match(page, /Reply not read in yet/u)
// A deep-linked placement must be closeable, or it reopens on every render.
assert.match(page, /next\.delete\('podcast'\)/u)

assert.match(masterInbox, /searchParams\.get\('thread'\)/u)
assert.match(masterInbox, /thread\.thread_key === requestedThreadKey/u)
assert.match(masterInbox, /Open this placement/u)
assert.match(masterInbox, /client-podcast-system\?client=/u)
