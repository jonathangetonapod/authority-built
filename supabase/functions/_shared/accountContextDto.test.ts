import {
  toAccountMembershipDto,
  toAccountWorkspaceDto,
} from './accountContextDto.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('account membership DTO exposes only the stable browser contract', () => {
  const membership = {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Workspace Owner',
    role: 'owner',
    status: 'active',
    user_id: '33333333-3333-4333-8333-333333333333',
    email_normalized: 'owner@example.com',
    invited_by: '44444444-4444-4444-8444-444444444444',
    accepted_at: '2026-07-21T00:00:00.000Z',
    workspace_access_not_before_epoch: 1,
    avatar_path: '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/pic.webp',
    avatar_updated_at: '2026-08-05T00:00:00.000Z',
  }
  const dto = toAccountMembershipDto(membership)

  // The picture the sidebar draws is part of the browser contract; user_id,
  // email_normalized, invited_by and the epoch remain firmly not.
  assert(
    Object.keys(dto).join(',') === 'id,workspace_id,full_name,role,status,avatar_path,avatar_updated_at',
    'membership DTO fields changed',
  )
  assert(dto.avatar_path === membership.avatar_path, 'avatar path must pass through')
})

Deno.test('account workspace DTO omits creator and lifecycle metadata', () => {
  const workspace = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Private Workspace',
    slug: 'private-workspace',
    status: 'active',
    is_default: false,
    logo_path: '22222222-2222-4222-8222-222222222222/55555555-5555-4555-8555-555555555555.png',
    logo_updated_at: '2026-07-22T01:00:00.000Z',
    access_not_before_epoch: 1,
    created_by: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T00:00:00.000Z',
  }
  const dto = toAccountWorkspaceDto(workspace)

  assert(
    Object.keys(dto).join(',') === 'id,name,slug,status,is_default,logo_path,logo_updated_at',
    'workspace DTO fields changed',
  )
})
