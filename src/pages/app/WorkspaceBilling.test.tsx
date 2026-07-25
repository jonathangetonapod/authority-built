import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceBilling from '@/pages/app/WorkspaceBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const mockedUseAuth = vi.mocked(useAuth)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/settings/billing']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/app/settings/billing" element={<WorkspaceBilling />} />
        <Route path="/app/clients" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WorkspaceBilling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps Waterfall pack selection in Settings billing', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: true } as never)
    renderPage()

    expect(screen.getByRole('heading', { name: 'Billing & credits' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute('href', '/app/settings')
    expect(screen.getByText('Available on Solo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select 100 credits for $39' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select 500 credits for $149' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Select 2,000 credits for $399' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Select 2,000 credits for $399' }))
    expect(screen.getByRole('button', { name: 'Select 2,000 credits for $399' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('High volume')).toBeInTheDocument()
    expect(screen.queryByText(/per verified email/i)).not.toBeInTheDocument()
    expect(screen.getByText('One-time purchase; your plan will not change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue to secure checkout · $399' })).toBeInTheDocument()
    expect(screen.getByText(/No charge for unsuccessful searches/i)).toBeInTheDocument()
    expect(screen.getByText('Global cache first')).toBeInTheDocument()
    expect(screen.getByText(/reuse the verified contact for 0 credits/i)).toBeInTheDocument()
  })

  it('returns members without Settings access to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
