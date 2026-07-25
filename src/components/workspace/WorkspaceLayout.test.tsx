import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const signOut = vi.fn()
const workspaceId = '11111111-1111-4111-8111-111111111111'
const expectedNavigation = [
  'Overview',
  'Onboarding',
  'Podcast Finder',
  'Prospect Studio',
  'Podcast Database',
  'Client Podcast System',
  'Clients',
  'Client Campaigns',
  'Master Inbox',
  'Mailboxes',
  'Guest Resources',
  'Settings',
]

function renderLayout(platformWorkspace?: PlatformWorkspaceConfig) {
  render(
    <MemoryRouter initialEntries={[platformWorkspace ? `${platformWorkspace.baseHref}/clients` : '/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WorkspaceLayout platformWorkspace={platformWorkspace}><div>Module content</div></WorkspaceLayout>
    </MemoryRouter>,
  )
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    signOut.mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      user: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        email: 'owner@example.com',
        user_metadata: { full_name: 'Owner Name' },
      },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: false,
      signOut,
    } as never)
  })

  it('matches the complete navigation order and enables settings for an owner', () => {
    renderLayout()

    expect(screen.getByTestId('workspace-layout')).toHaveClass('max-w-full', 'overflow-x-clip')
    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    const labels = within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))
    expect(labels).toEqual(expectedNavigation)

    const links = within(navigation).getAllByRole('link')
    expect(links).toHaveLength(10)
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/app/settings',
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Onboarding' })).toHaveAttribute('href', '/app/onboarding')
    expect(within(navigation).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/app/overview')
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(within(navigation).getByRole('link', { name: 'Prospect Studio' })).toHaveAttribute('href', '/app/prospects')
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    expect(within(navigation).getByRole('link', { name: 'Master Inbox' })).toHaveAttribute('href', '/app/master-inbox')
    expect(within(navigation).getByRole('link', { name: 'Mailboxes' })).toHaveAttribute('href', '/app/mailboxes')
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute('href', '/app/guest-resources')

    const disabledModules = within(navigation).getAllByRole('button').filter((button) => button.hasAttribute('disabled'))
    expect(disabledModules).toHaveLength(2)
    disabledModules.forEach((module) => expect(module).toBeDisabled())
    expect(screen.getAllByText('Acme Workspace')).toHaveLength(3)
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
  })

  it('restores and resets a navigation order saved for this owner and workspace', async () => {
    const storageKey = `workspace-nav-order-v2:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    window.localStorage.setItem(storageKey, JSON.stringify(['clients', 'podcast-finder', 'overview']))
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    await waitFor(() => expect(within(navigation).getAllByRole('listitem').slice(0, 3).map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual(['Clients', 'Podcast Finder', 'Overview']))

    fireEvent.click(within(navigation).getByRole('button', { name: 'Reorder sidebar pages' }))
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(expectedNavigation.length)
    expect(within(navigation).getByText(/changes save automatically/i)).toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Reset' }))
    expect(within(navigation).getAllByRole('listitem').map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual(expectedNavigation)
    expect(window.localStorage.getItem(storageKey)).toBeNull()

    fireEvent.click(within(navigation).getByRole('button', { name: 'Done' }))
    expect(within(navigation).getByRole('button', { name: 'Reorder sidebar pages' })).toBeInTheDocument()
  })

  it('opens owner organize mode when requested from workspace settings', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    fireEvent(window, new Event(WORKSPACE_NAV_ORGANIZE_EVENT))

    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(expectedNavigation.length)
  })

  it('enables settings for an admin and keeps it unavailable to a member', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'admin@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Agency Admin', role: 'admin' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceLayout><div>Module content</div></WorkspaceLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/app/settings')
    expect(screen.queryByRole('button', { name: 'Reorder sidebar pages' })).not.toBeInTheDocument()

    unmount()
    mockedUseAuth.mockReturnValue({
      user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'member@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Agency Member', role: 'member' },
      isPlatformAdmin: false,
      signOut,
    } as never)
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
    const settings = within(navigation).getByText('Settings').closest('button')
    expect(settings).toBeDisabled()
    expect(within(settings as HTMLElement).getByText('Owner/Admin')).toBeInTheDocument()
    expect(within(navigation).queryByRole('button', { name: 'Reorder sidebar pages' })).not.toBeInTheDocument()
  })

  it('renders a selected workspace as a native platform-owner context', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    const platformWorkspace: PlatformWorkspaceConfig = {
      workspaceName: 'Selected Workspace',
      logoUrl: 'https://cdn.example/selected-workspace.png',
      baseHref: `/app/workspaces/${workspaceId}`,
    }
    renderLayout(platformWorkspace)

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/settings`,
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/clients`,
    )
    expect(within(navigation).getByRole('link', { name: 'Onboarding' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/onboarding`,
    )
    expect(within(navigation).getByRole('link', { name: 'Guest Resources' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/guest-resources`,
    )
    expect(within(navigation).getByRole('link', { name: 'Prospect Studio' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/prospects`,
    )
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/client-campaigns`,
    )
    expect(within(navigation).getByRole('link', { name: 'Master Inbox' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/master-inbox`,
    )
    expect(within(navigation).getByRole('link', { name: 'Mailboxes' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/mailboxes`,
    )
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher').closest('header')).not.toBeNull()
    expect(within(navigation).getByRole('button', { name: 'Reorder sidebar pages' })).toBeInTheDocument()
    fireEvent.click(within(navigation).getByRole('button', { name: 'Reorder sidebar pages' }))
    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /manage workspaces/i })).toHaveAttribute('href', '/app/settings')
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveClass('h-24', 'w-full', 'bg-transparent')
    expect(screen.getByTestId('workspace-logo-sidebar')).not.toHaveClass('bg-gradient-to-br')
    expect(screen.getByTestId('workspace-logo-sidebar')).toHaveAttribute('data-logo-state', 'uploaded')
  })

  it('shows Jonathan the workspace switcher in his own workspace without changing his feature role', () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'jonathan@getonapod.com' },
      workspace: { id: '00000000-0000-4000-8000-000000000000', name: 'Get On A Pod', is_default: true },
      membership: { full_name: 'Jonathan', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)

    renderLayout()

    expect(screen.getByText('Workspace switcher')).toBeInTheDocument()
    expect(screen.getByText('Workspace switcher').closest('header')).not.toBeNull()
    expect(screen.getAllByText('My Workspace').length).toBeGreaterThan(0)
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.queryByText('platform owner')).not.toBeInTheDocument()
  })

  it('signs a workspace user out without exposing an admin destination', async () => {
    renderLayout()

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })
})
