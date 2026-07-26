import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSwitcher } from '@/components/admin/WorkspaceSwitcher'
import { useAuth } from '@/contexts/AuthContext'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ listPodcastResearchWorkspaces: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedList = vi.mocked(listPodcastResearchWorkspaces)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderSwitcher({
  initialPath = '/app/clients',
}: {
  initialPath?: string
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceSwitcher />
        <Routes>
          <Route path="*" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      workspace: { id: defaultWorkspaceId },
    } as never)
    mockedList.mockResolvedValue([
      { id: defaultWorkspaceId, name: 'Get On A Pod', slug: 'get-on-a-pod', status: 'active', is_default: true },
      { id: '11111111-1111-4111-8111-111111111111', name: 'Acme', slug: 'acme-one', status: 'active', is_default: false },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Bravo', slug: 'bravo-two', status: 'active', is_default: false },
    ])
  })

  it('navigates from My Workspace to the same module in a selected workspace', async () => {
    renderSwitcher()
    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/clients',
    ))
  })

  it('does not query or render for non-admin users', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false } as never)
    renderSwitcher()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })

  it('shows the selected workspace in the compact toolbar', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/clients',
    })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    expect(trigger).toHaveTextContent('Bravo')
    expect(trigger).toHaveClass('w-full', 'min-w-0', 'overflow-hidden')
    expect(screen.getByTestId('workspace-switcher')).toHaveClass('w-full', 'min-w-0', 'max-w-full')
    expect(screen.getByTestId('workspace-switcher')).not.toHaveClass('sm:w-72')
    expect(screen.queryByText('Switch workspace')).not.toBeInTheDocument()
  })

  it('shows the platform owner workspace while using the regular app routes', async () => {
    renderSwitcher({ initialPath: '/app/clients' })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    expect(trigger).toHaveTextContent('My Workspace')
    fireEvent.click(trigger)
    expect(await screen.findByText('Get On A Pod')).toBeInTheDocument()
  })

  it('moves the retired admin prospect address into the selected workspace Studio', async () => {
    renderSwitcher({ initialPath: '/admin/prospect-dashboards' })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    expect(trigger).toHaveTextContent('My Workspace')
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/prospects',
    ))
  })

  it('preserves the guest resources module when switching workspaces', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/guest-resources',
    })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/guest-resources',
    ))
  })

  it('preserves the settings module when switching workspaces', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/settings',
    })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/settings',
    ))
  })

  it('returns to the owner workspace and preserves onboarding', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/onboarding',
    })

    const trigger = await screen.findByRole('combobox', { name: 'Select a workspace' })
    fireEvent.click(trigger)
    fireEvent.click((await screen.findAllByText('My Workspace')).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/onboarding'))
  })

  it('preserves the outreach suite module when changing workspaces', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/master-inbox',
    })

    fireEvent.click(await screen.findByRole('combobox', { name: 'Select a workspace' }))
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/master-inbox',
    ))
  })

  it('moves client-bound podcast research to the target workspace client chooser', async () => {
    renderSwitcher({
      initialPath: '/app/workspaces/22222222-2222-4222-8222-222222222222/clients/33333333-3333-4333-8333-333333333333/podcast-finder',
    })

    fireEvent.click(await screen.findByRole('combobox', { name: 'Select a workspace' }))
    fireEvent.click(await screen.findByText('Acme'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/podcast-finder',
    ))
  })
})
