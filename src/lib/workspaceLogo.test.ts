import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memberAvatarUrl, workspaceLogoUrl } from '@/lib/workspaceLogo'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const objectId = '22222222-2222-4222-8222-222222222222'

describe('workspaceLogoUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example')
  })

  it('builds a cache-busted URL only for the exact workspace object path', () => {
    const url = workspaceLogoUrl(
      workspaceId.toUpperCase(),
      `${workspaceId}/${objectId}.png`,
      '2026-07-22T01:00:00.000Z',
    )

    expect(url).toBe(
      `https://project.example/storage/v1/object/public/workspace-logos/${workspaceId}/${objectId}.png?v=1784682000000`,
    )
  })

  it('rejects a different workspace, unsupported extension, or incomplete state', () => {
    expect(workspaceLogoUrl(
      workspaceId,
      `33333333-3333-4333-8333-333333333333/${objectId}.png`,
      '2026-07-22T01:00:00.000Z',
    )).toBeNull()
    expect(workspaceLogoUrl(
      workspaceId,
      `${workspaceId}/${objectId}.svg`,
      '2026-07-22T01:00:00.000Z',
    )).toBeNull()
    expect(workspaceLogoUrl(workspaceId, `${workspaceId}/${objectId}.png`, null)).toBeNull()
  })
})

describe('memberAvatarUrl', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111'
  const userId = '22222222-2222-4222-8222-222222222222'
  const objectName = '33333333-3333-4333-8333-333333333333.webp'
  const updatedAt = '2026-08-05T00:00:00.000Z'

  it('builds a cache-busted public url for the member who owns it', () => {
    const url = memberAvatarUrl(workspaceId, userId, `${workspaceId}/${userId}/${objectName}`, updatedAt)
    expect(url).toContain(`/storage/v1/object/public/member-avatars/${workspaceId}/${userId}/${objectName}`)
    expect(url).toContain(`v=${Date.parse(updatedAt)}`)
  })

  it('refuses a path belonging to another member or another workspace', () => {
    const otherUser = '44444444-4444-4444-8444-444444444444'
    // The path is the only thing saying who an object belongs to, so a row
    // pointing at somebody else's file must not become a URL.
    expect(memberAvatarUrl(workspaceId, userId, `${workspaceId}/${otherUser}/${objectName}`, updatedAt)).toBeNull()
    expect(memberAvatarUrl(workspaceId, userId, `${otherUser}/${userId}/${objectName}`, updatedAt)).toBeNull()
    expect(memberAvatarUrl(workspaceId, userId, `${workspaceId}/${userId}/../${objectName}`, updatedAt)).toBeNull()
  })

  it('has no url until there is a picture and a time it changed', () => {
    expect(memberAvatarUrl(workspaceId, userId, null, updatedAt)).toBeNull()
    expect(memberAvatarUrl(workspaceId, userId, `${workspaceId}/${userId}/${objectName}`, null)).toBeNull()
  })
})
