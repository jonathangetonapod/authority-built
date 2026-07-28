import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import MyWorkspaceSettings from '@/pages/app/MyWorkspaceSettings'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/pages/admin/WorkspaceUsers', () => ({ default: () => <div>Platform workspace settings</div> }))
vi.mock('@/pages/app/WorkspaceStaff', () => ({ default: () => <div>Agency workspace settings</div> }))

const mockedUseAuth = vi.mocked(useAuth)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/settings']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/app/settings" element={<MyWorkspaceSettings />} />
        <Route path="/app/clients" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MyWorkspaceSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps platform workspace management inside My Workspace settings', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: true, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByText('Platform workspace settings')).toBeInTheDocument()
  })

  it('gives a platform admin who owns a private workspace the normal settings', () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: false,
      membership: { role: 'owner' },
      workspace: { id: '11111111-1111-4111-8111-111111111111', is_default: false },
    } as never)
    renderPage()
    expect(screen.getByText('Agency workspace settings')).toBeInTheDocument()
    expect(screen.queryByText('Platform workspace settings')).not.toBeInTheDocument()
  })

  it('gives the default workspace the same settings, because it runs real clients too', () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: false,
      membership: { role: 'owner' },
      workspace: { id: '11111111-1111-4111-8111-111111111111', is_default: true },
    } as never)
    renderPage()
    expect(screen.getByText('Agency workspace settings')).toBeInTheDocument()
    expect(screen.queryByText('Platform workspace settings')).not.toBeInTheDocument()
  })

  it('reaches the settings on the default workspace without an owner membership', () => {
    // Platform admin is decided by admin_users, not by the role on the
    // membership that anchors it.
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: false,
      membership: { role: 'member' },
      workspace: { id: '11111111-1111-4111-8111-111111111111', is_default: true },
    } as never)
    renderPage()
    expect(screen.getByText('Agency workspace settings')).toBeInTheDocument()
  })

  it('uses the same settings route for an agency workspace manager', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: true } as never)
    renderPage()
    expect(screen.getByText('Agency workspace settings')).toBeInTheDocument()
  })

  it('returns a member without settings permission to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
