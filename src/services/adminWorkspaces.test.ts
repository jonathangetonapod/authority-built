import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminWorkspaceView,
  listAdminWorkspaces,
  listPodcastResearchWorkspaces,
  type AdminWorkspace,
  type AdminWorkspaceView,
} from '@/services/adminWorkspaces'
import type { WorkspaceClient } from '@/services/clients'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

const workspaceId = 'a1111111-1111-4111-8111-11111111111a'
const otherWorkspaceId = 'b2222222-2222-4222-8222-22222222222b'
const workspace: AdminWorkspaceView['workspace'] = {
  id: workspaceId,
  name: 'Acme Workspace',
  slug: 'acme',
  status: 'active',
  is_default: false,
}
interface ViewerRow {
  workspace_id: string
  email_normalized: string
  full_name: string | null
  role: 'owner'
  status: 'active' | 'invited'
  provisioning_method: 'email_invite' | 'admin_temporary_password'
  password_change_required: boolean
}

const ownerRow: ViewerRow = {
  workspace_id: workspaceId,
  email_normalized: 'owner@acme.example',
  full_name: 'Acme Owner',
  role: 'owner',
  status: 'active',
  provisioning_method: 'email_invite',
  password_change_required: false,
}
type AdminWorkspaceClientRow = WorkspaceClient & {
  ai_sdr_profile: Record<string, string>
  ai_sdr_profile_updated_at: string | null
}

const clientRows: AdminWorkspaceClientRow[] = [{
  id: 'c3333333-3333-4333-8333-33333333333c',
  workspace_id: workspaceId,
  name: 'Acme Client',
  email: null,
  contact_person: null,
  linkedin_url: null,
  website: null,
  status: 'active',
  notes: null,
  ai_sdr_profile: {},
  ai_sdr_profile_updated_at: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}]
const clients: WorkspaceClient[] = clientRows.map(({ ai_sdr_profile: _profile, ...client }) => ({
  ...client,
  ai_sdr_profile_ready: false,
  ai_sdr_profile_completed_fields: 0,
  ai_sdr_profile_total_fields: 6,
}))

describe('listAdminWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns active-owner and valid manual-password workspaces only', async () => {
    const manualWorkspaceId = 'e5555555-5555-4555-8555-55555555555e'
    const emailInviteWorkspaceId = 'f6666666-6666-4666-8666-66666666666f'
    const manualWorkspace: AdminWorkspace = {
      id: manualWorkspaceId,
      name: 'Manual Workspace',
      slug: 'manual',
      status: 'active',
      is_default: false,
    }
    const workspaces: AdminWorkspace[] = [
      workspace,
      manualWorkspace,
      {
        id: emailInviteWorkspaceId,
        name: 'Email Invite Workspace',
        slug: 'email-invite',
        status: 'active',
        is_default: false,
      },
    ]
    const workspaceResult = Promise.resolve({ data: workspaces, error: null })
    const workspaceBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    workspaceBuilder.select.mockReturnValue(workspaceBuilder)
    workspaceBuilder.eq.mockReturnValue(workspaceBuilder)
    workspaceBuilder.order
      .mockReturnValueOnce(workspaceBuilder)
      .mockReturnValueOnce(workspaceResult)

    const membershipResult = Promise.resolve({
      data: [
        {
          workspace_id: workspaceId,
          status: 'active',
          provisioning_method: 'email_invite',
          password_change_required: false,
        },
        {
          workspace_id: manualWorkspaceId,
          status: 'invited',
          provisioning_method: 'admin_temporary_password',
          password_change_required: true,
        },
        {
          workspace_id: emailInviteWorkspaceId,
          status: 'invited',
          provisioning_method: 'email_invite',
          password_change_required: false,
        },
      ],
      error: null,
    })
    const membershipBuilder = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    }
    membershipBuilder.select.mockReturnValue(membershipBuilder)
    membershipBuilder.in
      .mockReturnValueOnce(membershipBuilder)
      .mockReturnValueOnce(membershipResult)
    membershipBuilder.eq.mockReturnValue(membershipBuilder)

    from.mockImplementation((table: string) => (
      table === 'workspaces' ? workspaceBuilder : membershipBuilder
    ))

    await expect(listAdminWorkspaces()).resolves.toEqual([workspace, manualWorkspace])
    expect(membershipBuilder.in).toHaveBeenNthCalledWith(
      1,
      'workspace_id',
      [workspaceId, manualWorkspaceId, emailInviteWorkspaceId],
    )
    expect(membershipBuilder.eq).toHaveBeenCalledWith('role', 'owner')
    expect(membershipBuilder.in).toHaveBeenNthCalledWith(2, 'status', ['active', 'invited'])
  })
})

describe('listPodcastResearchWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('places the platform owner workspace before available client workspaces', async () => {
    const defaultWorkspace: AdminWorkspace = {
      id: 'd4444444-4444-4444-8444-44444444444d',
      name: 'Get On A Pod',
      slug: 'get-on-a-pod',
      status: 'active',
      is_default: true,
    }

    const clientWorkspaceResult = Promise.resolve({ data: [workspace], error: null })
    const clientWorkspaceBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    clientWorkspaceBuilder.select.mockReturnValue(clientWorkspaceBuilder)
    clientWorkspaceBuilder.eq.mockReturnValue(clientWorkspaceBuilder)
    clientWorkspaceBuilder.order
      .mockReturnValueOnce(clientWorkspaceBuilder)
      .mockReturnValueOnce(clientWorkspaceResult)

    const defaultWorkspaceBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: defaultWorkspace, error: null }),
    }
    defaultWorkspaceBuilder.select.mockReturnValue(defaultWorkspaceBuilder)
    defaultWorkspaceBuilder.eq.mockReturnValue(defaultWorkspaceBuilder)

    const membershipResult = Promise.resolve({
      data: [{
        workspace_id: workspace.id,
        status: 'active',
        provisioning_method: 'email_invite',
        password_change_required: false,
      }],
      error: null,
    })
    const membershipBuilder = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    }
    membershipBuilder.select.mockReturnValue(membershipBuilder)
    membershipBuilder.in
      .mockReturnValueOnce(membershipBuilder)
      .mockReturnValueOnce(membershipResult)
    membershipBuilder.eq.mockReturnValue(membershipBuilder)

    let workspaceQueryCount = 0
    from.mockImplementation((table: string) => {
      if (table === 'workspace_memberships') return membershipBuilder
      workspaceQueryCount += 1
      return workspaceQueryCount === 1 ? clientWorkspaceBuilder : defaultWorkspaceBuilder
    })

    await expect(listPodcastResearchWorkspaces()).resolves.toEqual([defaultWorkspace, workspace])
    expect(defaultWorkspaceBuilder.eq).toHaveBeenNthCalledWith(1, 'is_default', true)
    expect(defaultWorkspaceBuilder.eq).toHaveBeenNthCalledWith(2, 'status', 'active')
  })
})

function makeWorkspaceBuilder(data: AdminWorkspaceView['workspace'] | null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.abortSignal.mockReturnValue(builder)
  return builder
}

function makeViewerBuilder(data: ViewerRow[]) {
  const abortSignal = vi.fn()
  const terminalQuery = Object.assign(
    Promise.resolve({ data, error: null }),
    { abortSignal },
  )
  abortSignal.mockReturnValue(terminalQuery)

  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.order.mockReturnValue(terminalQuery)
  return { builder, abortSignal }
}

function makeClientsBuilder(data: AdminWorkspaceClientRow[]) {
  const abortSignal = vi.fn()
  const terminalQuery = Object.assign(
    Promise.resolve({ data, error: null }),
    { abortSignal },
  )
  abortSignal.mockReturnValue(terminalQuery)

  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order
    .mockReturnValueOnce(builder)
    .mockReturnValueOnce(terminalQuery)
  return { builder, abortSignal }
}

interface ArrangeOptions {
  workspaceData?: AdminWorkspaceView['workspace'] | null
  viewerData?: ViewerRow | ViewerRow[] | null
  clientsData?: AdminWorkspaceClientRow[]
}

function arrange(options: ArrangeOptions = {}) {
  const workspaceBuilder = makeWorkspaceBuilder(
    options.workspaceData === undefined ? workspace : options.workspaceData,
  )
  const viewerRows = options.viewerData === undefined
    ? [ownerRow]
    : options.viewerData === null
      ? []
      : Array.isArray(options.viewerData)
        ? options.viewerData
        : [options.viewerData]
  const { builder: viewerBuilder, abortSignal: viewerAbortSignal } = makeViewerBuilder(
    viewerRows,
  )
  const { builder: clientsBuilder, abortSignal: clientsAbortSignal } = makeClientsBuilder(
    options.clientsData === undefined ? clientRows : options.clientsData,
  )

  from.mockImplementation((table: string) => {
    if (table === 'workspaces') return workspaceBuilder
    if (table === 'workspace_memberships') return viewerBuilder
    return clientsBuilder
  })

  return { workspaceBuilder, viewerBuilder, viewerAbortSignal, clientsBuilder, clientsAbortSignal }
}

describe('getAdminWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the exact active owner and client projection with one canonical workspace ID', async () => {
    const { workspaceBuilder, viewerBuilder, viewerAbortSignal, clientsBuilder, clientsAbortSignal } = arrange()
    const controller = new AbortController()

    const result = await getAdminWorkspaceView(workspaceId.toUpperCase(), controller.signal)

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'workspaces',
      'workspace_memberships',
      'clients',
    ])
    expect(workspaceBuilder.select).toHaveBeenCalledWith(
      'id,name,slug,status,is_default,logo_path,logo_updated_at',
    )
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(1, 'id', workspaceId)
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(2, 'is_default', false)
    expect(viewerBuilder.select).toHaveBeenCalledWith(
      'workspace_id,email_normalized,full_name,role,status,provisioning_method,password_change_required',
    )
    expect(viewerBuilder.eq).toHaveBeenNthCalledWith(1, 'workspace_id', workspaceId)
    expect(viewerBuilder.eq).toHaveBeenNthCalledWith(2, 'role', 'owner')
    expect(viewerBuilder.in).toHaveBeenCalledWith('status', ['active', 'invited'])
    expect(viewerBuilder.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(clientsBuilder.select).toHaveBeenCalledWith(
      'id,workspace_id,name,email,contact_person,linkedin_url,website,status,notes,ai_sdr_profile,ai_sdr_profile_updated_at,created_at,updated_at',
    )
    expect(clientsBuilder.eq).toHaveBeenCalledWith('workspace_id', workspaceId)
    expect(workspaceBuilder.abortSignal).toHaveBeenCalledWith(controller.signal)
    expect(viewerAbortSignal).toHaveBeenCalledWith(controller.signal)
    expect(clientsAbortSignal).toHaveBeenCalledWith(controller.signal)
    expect(result).toEqual({
      workspace,
      viewer: {
        workspace_id: workspaceId,
        email: 'owner@acme.example',
        full_name: 'Acme Owner',
        role: 'owner',
      },
      clients,
    })
  })

  it('allows a manual-password owner before first sign-in', async () => {
    arrange({
      viewerData: {
        ...ownerRow,
        status: 'invited',
        provisioning_method: 'admin_temporary_password',
        password_change_required: true,
      },
    })

    await expect(getAdminWorkspaceView(workspaceId)).resolves.toMatchObject({
      workspace: { id: workspaceId },
      viewer: { workspace_id: workspaceId, email: ownerRow.email_normalized },
    })
  })

  it('filters unavailable historical owner rows before selecting the owner', async () => {
    arrange({
      viewerData: [
        {
          ...ownerRow,
          status: 'invited',
          provisioning_method: 'email_invite',
          password_change_required: false,
        },
        ownerRow,
      ],
    })

    await expect(getAdminWorkspaceView(workspaceId)).resolves.toMatchObject({
      viewer: { workspace_id: workspaceId, email: ownerRow.email_normalized },
    })
  })

  it('fails closed when more than one owner is available', async () => {
    const { clientsBuilder } = arrange({
      viewerData: [
        ownerRow,
        {
          ...ownerRow,
          status: 'invited',
          provisioning_method: 'admin_temporary_password',
          password_change_required: true,
        },
      ],
    })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace does not have an available owner.',
    )
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it.each<{
    label: string
    workspaceData: AdminWorkspaceView['workspace']
    expectedMessage: string
  }>([
    {
      label: 'default',
      workspaceData: { ...workspace, is_default: true },
      expectedMessage: 'The selected workspace response did not match the workspace address.',
    },
    {
      label: 'inactive',
      workspaceData: { ...workspace, status: 'suspended' },
      expectedMessage: 'This client workspace is unavailable or no longer active.',
    },
    {
      label: 'mismatched',
      workspaceData: { ...workspace, id: otherWorkspaceId },
      expectedMessage: 'The selected workspace response did not match the workspace address.',
    },
  ])('rejects a $label workspace before querying owner or client rows', async ({ workspaceData, expectedMessage }) => {
    const { viewerBuilder, clientsBuilder } = arrange({ workspaceData })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(expectedMessage)
    expect(viewerBuilder.select).not.toHaveBeenCalled()
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('does not query owner or client rows when the selected workspace is unavailable', async () => {
    const { viewerBuilder, clientsBuilder } = arrange({ workspaceData: null })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace is unavailable or no longer active.',
    )
    expect(viewerBuilder.select).not.toHaveBeenCalled()
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('requires an available owner bound to the selected workspace', async () => {
    const { clientsBuilder } = arrange({
      viewerData: { ...ownerRow, workspace_id: otherWorkspaceId },
    })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace does not have an available owner.',
    )
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('rejects an ordinary unaccepted email invitation', async () => {
    const { clientsBuilder } = arrange({
      viewerData: {
        ...ownerRow,
        status: 'invited',
        provisioning_method: 'email_invite',
        password_change_required: false,
      },
    })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace does not have an available owner.',
    )
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('rejects client rows outside the selected workspace', async () => {
    const mismatchedClients = clientRows.map((client) => ({
      ...client,
      workspace_id: otherWorkspaceId,
    }))
    arrange({ clientsData: mismatchedClients })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'The selected workspace response did not match the workspace address.',
    )
  })
})
