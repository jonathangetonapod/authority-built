import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminWorkspaceClients from '@/pages/admin/AdminWorkspaceClients'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView, type AdminWorkspaceView } from '@/services/adminWorkspaces'
import { createWorkspaceClient, deleteWorkspaceClient, updateWorkspaceClient } from '@/services/clients'

vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clients', () => ({
  createWorkspaceClient: vi.fn(),
  deleteWorkspaceClient: vi.fn(),
  getWorkspaceClients: vi.fn(),
  updateWorkspaceClient: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const mockedCreate = vi.mocked(createWorkspaceClient)
const mockedUpdate = vi.mocked(updateWorkspaceClient)
const mockedDelete = vi.mocked(deleteWorkspaceClient)

const adminUserId = '99999999-9999-4999-8999-999999999999'
const workspaceId = 'a1111111-1111-4111-8111-11111111111a'
const secondWorkspaceId = 'b2222222-2222-4222-8222-22222222222b'

function workspaceView(
  selectedWorkspaceId = workspaceId,
  workspaceName = 'Acme Workspace',
  clientName = 'Acme Client',
): AdminWorkspaceView {
  return {
    workspace: {
      id: selectedWorkspaceId,
      name: workspaceName,
      slug: workspaceName.toLowerCase().replace(/ /g, '-'),
      status: 'active',
      is_default: false,
    },
    viewer: {
      workspace_id: selectedWorkspaceId,
      email: workspaceName === 'Acme Workspace' ? 'owner@acme.example' : 'owner@bravo.example',
      full_name: workspaceName === 'Acme Workspace' ? 'Acme Owner' : 'Bravo Owner',
      role: 'owner',
    },
    clients: [{
      id: selectedWorkspaceId === workspaceId
        ? 'c3333333-3333-4333-8333-33333333333c'
        : 'd4444444-4444-4444-8444-44444444444d',
      workspace_id: selectedWorkspaceId,
      name: clientName,
      email: 'client@example.com',
      contact_person: 'Casey',
      linkedin_url: null,
      website: null,
      status: 'active',
      notes: null,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
    }],
  }
}

function renderPage(path: string, switchTo?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {switchTo && <Link to={switchTo}>Switch workspace</Link>}
        <Routes>
          <Route path="/app/workspaces/:workspaceId/clients" element={<AdminWorkspaceClients />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

const platformQueryKey = ['platform', adminUserId, 'workspace', workspaceId, 'clients'] as const

describe('AdminWorkspaceClients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: adminUserId, email: 'admin@example.com' },
      workspace: { id: 'default-workspace', name: 'Default Workspace' },
      canWriteClients: true,
      isPlatformAdmin: true,
    } as never)
    mockedView.mockResolvedValue(workspaceView())
    mockedCreate.mockResolvedValue(workspaceView().clients[0])
  })

  it('shows a native, manageable workspace for the platform owner', async () => {
    renderPage(`/app/workspaces/${workspaceId}/clients`)

    expect(await screen.findByText('Clients in Acme Workspace')).toBeInTheDocument()
    expect(screen.getByText('Acme Client')).toBeInTheDocument()
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByText('Your clients')).toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add client/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Acme Client' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Acme Client' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Open Acme Client' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/clients/${workspaceView().clients[0].id}`,
    )
    expect(screen.queryByText('Research')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /add client/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Client name'), { target: { value: 'New Platform Client' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add client' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ name: 'New Platform Client' }),
    ))
    expect(screen.getByRole('link', { name: /manage workspaces/i })).toHaveAttribute('href', '/app/manage-workspaces')
    expect(screen.queryByText('Default Workspace')).not.toBeInTheDocument()
    expect(mockedView).toHaveBeenCalledWith(workspaceId, expect.any(AbortSignal))
  })

  it('normalizes an uppercase workspace UUID before querying and linking', async () => {
    renderPage(`/app/workspaces/${workspaceId.toUpperCase()}/clients`)

    expect(await screen.findByText('Acme Client')).toBeInTheDocument()
    expect(mockedView).toHaveBeenCalledWith(workspaceId, expect.any(AbortSignal))
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/clients`,
    )
  })

  it('fails closed on a malformed workspace ID without querying clients', async () => {
    renderPage('/app/workspaces/not-a-uuid/clients')
    await waitFor(() => expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument())
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('uses an isolated query when the selected workspace changes', async () => {
    mockedView.mockImplementation(async (selectedWorkspaceId) => (
      selectedWorkspaceId === workspaceId
        ? workspaceView()
        : workspaceView(secondWorkspaceId, 'Bravo Workspace', 'Bravo Client')
    ))
    renderPage(
      `/app/workspaces/${workspaceId}/clients`,
      `/app/workspaces/${secondWorkspaceId}/clients`,
    )

    expect(await screen.findByText('Acme Client')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Switch workspace' }))
    expect(await screen.findByText('Bravo Client')).toBeInTheDocument()
    expect(screen.queryByText('Acme Client')).not.toBeInTheDocument()
    expect(mockedView).toHaveBeenCalledWith(workspaceId, expect.any(AbortSignal))
    expect(mockedView).toHaveBeenCalledWith(secondWorkspaceId, expect.any(AbortSignal))
  })

  it('never displays a late response from the previously selected workspace', async () => {
    let resolveFirst!: (value: AdminWorkspaceView) => void
    const firstRequest = new Promise<AdminWorkspaceView>((resolve) => {
      resolveFirst = resolve
    })
    mockedView.mockImplementation((selectedWorkspaceId) => (
      selectedWorkspaceId === workspaceId
        ? firstRequest
        : Promise.resolve(workspaceView(secondWorkspaceId, 'Bravo Workspace', 'Bravo Client'))
    ))
    renderPage(
      `/app/workspaces/${workspaceId}/clients`,
      `/app/workspaces/${secondWorkspaceId}/clients`,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Switch workspace' }))
    expect(await screen.findByText('Bravo Client')).toBeInTheDocument()

    await act(async () => {
      resolveFirst(workspaceView(workspaceId, 'Acme Workspace', 'Late Acme Client'))
      await firstRequest
    })

    expect(screen.getByText('Bravo Client')).toBeInTheDocument()
    expect(screen.queryByText('Late Acme Client')).not.toBeInTheDocument()
  })

  it('rejects mismatched client data before it can enter the selected-workspace cache', async () => {
    const wrongView = workspaceView()
    wrongView.clients[0].workspace_id = secondWorkspaceId
    wrongView.clients[0].name = 'Wrong Workspace Client'
    mockedView.mockResolvedValue(wrongView)

    const queryClient = renderPage(`/app/workspaces/${workspaceId}/clients`)

    expect(await screen.findByText('The selected workspace response did not match the workspace address.')).toBeInTheDocument()
    expect(screen.queryByText('Wrong Workspace Client')).not.toBeInTheDocument()
    expect(queryClient.getQueryData(platformQueryKey)).toBeUndefined()
  })

  it.each<{
    label: string
    workspacePatch: Partial<AdminWorkspaceView['workspace']>
  }>([
    { label: 'default', workspacePatch: { is_default: true } },
    { label: 'inactive', workspacePatch: { status: 'suspended' } },
    { label: 'mismatched', workspacePatch: { id: secondWorkspaceId } },
  ])('rejects a $label workspace response before it can enter the selected-workspace cache', async ({ workspacePatch }) => {
    const invalidView = workspaceView()
    invalidView.workspace = { ...invalidView.workspace, ...workspacePatch }
    mockedView.mockResolvedValue(invalidView)

    const queryClient = renderPage(`/app/workspaces/${workspaceId}/clients`)

    expect(await screen.findByText('The selected workspace response did not match the workspace address.')).toBeInTheDocument()
    expect(queryClient.getQueryData(platformQueryKey)).toBeUndefined()
  })
})
