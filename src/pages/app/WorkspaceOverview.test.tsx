import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOverview from '@/pages/app/WorkspaceOverview'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref: string }
  }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref || '/app'}>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

function renderPage(platformWorkspaceId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceOverview platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      workspace: {
        id: defaultWorkspaceId,
        name: 'Get On A Pod',
        slug: 'get-on-a-pod',
        status: 'active',
        is_default: true,
        logo_path: null,
        logo_updated_at: null,
      },
    } as never)
    mockedView.mockResolvedValue({
      workspace: {
        id: selectedWorkspaceId,
        name: 'Acme Workspace',
        slug: 'acme-workspace',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer: {
        workspace_id: selectedWorkspaceId,
        email: 'owner@acme.example',
        full_name: 'Acme Owner',
        role: 'owner',
      },
      clients: [],
    })
  })

  it('presents the default GOAP workspace as My Workspace', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'My Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(screen.getByRole('link', { name: 'Open Podcast Database' })).toHaveAttribute('href', '/app/podcast-database')
    expect(screen.getByRole('link', { name: 'Open Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    expect(screen.getByRole('link', { name: 'Open Master Inbox' })).toHaveAttribute('href', '/app/master-inbox')
    expect(screen.getByRole('link', { name: 'Open Mailboxes' })).toHaveAttribute('href', '/app/mailboxes')
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/app/settings')
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('uses identical module links inside a selected workspace', async () => {
    renderPage(selectedWorkspaceId.toUpperCase())

    expect(await screen.findByRole('heading', { name: 'Acme Workspace' })).toBeInTheDocument()
    const baseHref = `/app/workspaces/${selectedWorkspaceId}`
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', baseHref)
    expect(screen.getByRole('link', { name: 'Open Podcast Finder' })).toHaveAttribute('href', `${baseHref}/podcast-finder`)
    expect(screen.getByRole('link', { name: 'Open Client Campaigns' })).toHaveAttribute('href', `${baseHref}/client-campaigns`)
    expect(screen.getByRole('link', { name: 'Open Master Inbox' })).toHaveAttribute('href', `${baseHref}/master-inbox`)
    expect(screen.getByRole('link', { name: 'Open Mailboxes' })).toHaveAttribute('href', `${baseHref}/mailboxes`)
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', `${baseHref}/settings`)
    expect(mockedView).toHaveBeenCalledWith(selectedWorkspaceId, expect.any(AbortSignal))
  })
})
