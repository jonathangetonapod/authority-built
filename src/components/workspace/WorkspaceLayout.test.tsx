import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  WORKSPACE_NAV_ORGANIZE_EVENT,
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))
vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedBillingOverview = vi.mocked(getWorkspaceBillingOverview)
const signOut = vi.fn()
const workspaceId = '11111111-1111-4111-8111-111111111111'
// Somebody else's workspace, so a balance read against the viewer's own would
// be visible as the wrong id rather than passing by coincidence.
const viewedWorkspaceId = '22222222-2222-4222-8222-222222222222'
const expectedNavigation = [
  'Onboarding',
  'Podcast Finder',
  'Prospect Studio',
  'Podcast Database',
  'Client Command Center',
  'Clients',
  'Client Campaigns',
  'Relationships',
  'Master Inbox',
  'Mailboxes',
  'Billing & credits',
  'Settings',
]

function renderLayout(platformWorkspace?: PlatformWorkspaceConfig) {
  // The shell reads the credit balance now, so it needs the app's query client
  // the same way every other data-reading component does.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[platformWorkspace ? `${platformWorkspace.baseHref}/clients` : '/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceLayout platformWorkspace={platformWorkspace}><div>Module content</div></WorkspaceLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
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

  it('puts buying credits one click away, not behind a settings sub-page', () => {
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('link', { name: 'Billing & credits' }))
      .toHaveAttribute('href', '/app/settings/billing')
  })

  it('drops billing while a platform admin is viewing somebody else\'s workspace', () => {
    renderLayout({
      baseHref: `/app/workspaces/${workspaceId}`,
      workspaceName: 'Acme Workspace',
      logoUrl: null,
    } as never)

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    // That route is not workspace-scoped, so showing it would link to a page
    // that does not exist for the workspace being viewed.
    expect(within(navigation).queryByRole('link', { name: 'Billing & credits' })).toBeNull()
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
    expect(links).toHaveLength(12)
    expect(within(navigation).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/app/settings',
    )
    expect(within(navigation).getByRole('link', { name: 'Clients' })).toHaveAttribute('href', '/app/clients')
    expect(within(navigation).getByRole('link', { name: 'Onboarding' })).toHaveAttribute('href', '/app/onboarding')
    expect(within(navigation).getByRole('link', { name: 'Podcast Finder' })).toHaveAttribute('href', '/app/podcast-finder')
    expect(within(navigation).getByRole('link', { name: 'Podcast Database' })).toHaveAttribute('href', '/app/podcast-database')
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute('href', '/app/client-podcast-system')
    expect(within(navigation).getByRole('link', { name: 'Prospect Studio' })).toHaveAttribute('href', '/app/prospects')
    expect(within(navigation).getByRole('link', { name: 'Client Campaigns' })).toHaveAttribute('href', '/app/client-campaigns')
    expect(within(navigation).getByRole('link', { name: 'Master Inbox' })).toHaveAttribute('href', '/app/master-inbox')
    expect(within(navigation).getByRole('link', { name: 'Mailboxes' })).toHaveAttribute('href', '/app/mailboxes')

    const disabledModules = within(navigation).getAllByRole('button').filter((button) => button.hasAttribute('disabled'))
    expect(disabledModules).toHaveLength(0)
    expect(screen.getAllByText('Acme Workspace')).toHaveLength(4)
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
  })

  it('restores and resets a navigation order saved for this owner and workspace', () => {
    const storageKey = `workspace-nav-order-v2:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    window.localStorage.setItem(storageKey, JSON.stringify(['clients', 'podcast-finder', 'onboarding']))
    renderLayout()

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getAllByRole('listitem').slice(0, 3).map((item) => (
      item.querySelector('span')?.textContent
    ))).toEqual(['Clients', 'Podcast Finder', 'Onboarding'])

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

  it('keeps the sidebar scroll position stable when the layout remounts during navigation', () => {
    const storageKey = `workspace-nav-scroll-v1:${workspaceId}:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
    const firstRender = renderLayout()
    const firstNavigation = screen.getByRole('navigation', { name: 'Workspace navigation' })

    firstNavigation.scrollTop = 184
    fireEvent.scroll(firstNavigation)
    expect(window.sessionStorage.getItem(storageKey)).toBe('184')

    firstRender.unmount()
    renderLayout()

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' }).scrollTop).toBe(184)
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
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/app/clients']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <WorkspaceLayout><div>Module content</div></WorkspaceLayout>
        </MemoryRouter>
      </QueryClientProvider>,
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

  /*
   * Supporting an agency means knowing whether they are about to run out. The
   * balance was hidden here on the grounds that it is not the admin's to act on
   * — true of acting, not of knowing — so the number now shows and leads to the
   * platform billing screen rather than the agency's own.
   */
  it('reads the viewed workspace balance and sends it to the platform screen', async () => {
    mockedUseAuth.mockReturnValue({
      user: { email: 'platform@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: null,
      isPlatformAdmin: true,
      signOut,
    } as never)
    mockedBillingOverview.mockResolvedValue({
      enforcement_enabled: true,
      monthly_credit_allowance: 100,
      balance: 850,
    } as never)

    renderLayout({
      workspaceId: viewedWorkspaceId,
      workspaceName: 'Selected Workspace',
      logoUrl: null,
      baseHref: `/app/workspaces/${viewedWorkspaceId}`,
    })

    const chip = await screen.findByRole('link', { name: /850 credits remaining/i })
    expect(chip).toHaveAttribute('href', '/app/platform/billing')
    // Theirs, not the admin's own.
    expect(mockedBillingOverview).toHaveBeenCalledWith(viewedWorkspaceId)
    expect(mockedBillingOverview).not.toHaveBeenCalledWith(workspaceId)
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
      workspaceId,
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
    expect(within(navigation).getByRole('link', { name: 'Podcast Database' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/podcast-database`,
    )
    expect(within(navigation).getByRole('link', { name: 'Client Command Center' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/client-podcast-system`,
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
    expect(screen.getByRole('link', { name: /manage workspaces/i })).toHaveAttribute('href', '/app/manage-workspaces')
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

  // Plan pricing, credit grants and monthly allowances were reachable only
  // through a link inside the platform owner's own billing page, so the tools
  // for every other workspace sat behind one workspace's balance.
  it('puts billing administration one click from anywhere for a platform admin', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com', user_metadata: {} },
      workspace: { id: workspaceId, name: 'Acme Workspace' },
      membership: { full_name: 'Owner Name', role: 'owner' },
      isPlatformAdmin: true,
      signOut,
    } as never)
    renderLayout()

    const link = await screen.findByRole('link', { name: 'Billing administration' })
    expect(link).toHaveAttribute('href', '/app/platform/billing')
  })

  it('offers no billing administration to a workspace member', async () => {
    renderLayout()

    expect(screen.queryByRole('link', { name: 'Billing administration' })).not.toBeInTheDocument()
  })
})
