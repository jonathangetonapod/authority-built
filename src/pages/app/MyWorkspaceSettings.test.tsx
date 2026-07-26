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

  it('gives a platform admin who owns a workspace the normal settings', () => {
    mockedUseAuth.mockReturnValue({
      isPlatformAdmin: true,
      canManageWorkspaceStaff: false,
      membership: { role: 'owner' },
    } as never)
    renderPage()
    expect(screen.getByText('Agency workspace settings')).toBeInTheDocument()
    expect(screen.queryByText('Platform workspace settings')).not.toBeInTheDocument()
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
