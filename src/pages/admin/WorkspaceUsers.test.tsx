import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import { resetWorkspaceStaffTemporaryPassword } from '@/services/workspaceStaff'
import {
  createManualWorkspaceAccount,
  listWorkspaceUsers,
  revokeManualWorkspaceAccount,
} from '@/services/workspaceUsers'

vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/services/workspaceUsers', () => ({
  createManualWorkspaceAccount: vi.fn(),
  inviteWorkspaceUser: vi.fn(),
  listWorkspaceUsers: vi.fn(),
  revokeManualWorkspaceAccount: vi.fn(),
  retryManualWorkspaceAccount: vi.fn(),
  rotateManualWorkspacePassword: vi.fn(),
  updateWorkspaceUserStatus: vi.fn(),
}))
vi.mock('@/services/adminWorkspaces', () => ({
  listAdminWorkspaces: vi.fn().mockResolvedValue([
    { id: '11111111-1111-4111-8111-111111111111', name: 'Acme Agency' },
  ]),
  // The recovery card lives on this page now. Nothing closed by default: that
  // is the normal state, and these tests are about the owner list.
  listDeletedWorkspaces: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/services/workspaceDeletion', () => ({ restoreWorkspace: vi.fn() }))
vi.mock('@/services/workspaceDomains', () => ({
  listWorkspaceDomains: vi.fn().mockResolvedValue([]),
  addWorkspaceDomain: vi.fn(),
  refreshWorkspaceDomain: vi.fn(),
  setPrimaryWorkspaceDomain: vi.fn(),
  removeWorkspaceDomain: vi.fn(),
}))
vi.mock('@/services/workspaceStaff', () => ({
  resetWorkspaceStaffTemporaryPassword: vi.fn(),
}))

const mockedCreate = vi.mocked(createManualWorkspaceAccount)
const mockedList = vi.mocked(listWorkspaceUsers)
const mockedRevoke = vi.mocked(revokeManualWorkspaceAccount)
const mockedResetOwnerPassword = vi.mocked(resetWorkspaceStaffTemporaryPassword)

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

const manualUser = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  user_id: '33333333-3333-4333-8333-333333333333',
  email: 'owner@example.com',
  full_name: 'Owner Name',
  role: 'owner' as const,
  status: 'invited' as const,
  invited_at: '2026-07-21T00:00:00Z',
  invite_expires_at: '2026-07-28T00:00:00Z',
  accepted_at: null,
  provisioning_method: 'admin_temporary_password' as const,
  password_change_required: true,
  workspace_access_not_before_epoch: 0,
  auth_reconciliation_pending: false,
  auth_reconciliation_review_after: null,
  has_newer_membership: false,
  invite_cleanup_blocked: false,
  invite_reconciliation_pending: false,
  invite_reconciliation_claim_kind: null,
  invite_reconciliation_review_after: null,
  credential_reconciliation_pending: false,
  credential_reconciliation_claim_kind: null,
  credential_reconciliation_review_after: null,
  workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Acme Workspace' },
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceUsers />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('WorkspaceUsers manual account flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue([])
    mockedRevoke.mockResolvedValue()
    mockedCreate.mockResolvedValue({
      membership: {
        id: '11111111-1111-4111-8111-111111111111',
        workspace_id: '22222222-2222-4222-8222-222222222222',
        status: 'invited',
        provisioning_method: 'admin_temporary_password',
        password_change_required: true,
        invite_expires_at: '2026-07-28T00:00:00Z',
      },
      workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Acme Workspace' },
      email: 'owner@example.com',
      temporary_password: 'Tmp-Abcd2345_Abcd2345_Abcd',
    })
  })

  it('keeps the one-time password in memory and requires save confirmation', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const queryClient = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: /create workspace/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Owner Name' } })
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Acme Workspace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace & generate password' }))

    const password = await screen.findByLabelText('Temporary password') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.value).toBe('Tmp-Abcd2345_Abcd2345_Abcd')
    expect(storageSpy).not.toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform'] })
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('I saved this password in a secure place.'))
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }))
    await waitFor(() => expect(screen.queryByText('Save the temporary password')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/app/workspaces/22222222-2222-4222-8222-222222222222/clients',
    )
  })

  it('surfaces credential reconciliation and blocks conflicting actions', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      credential_reconciliation_pending: true,
      credential_reconciliation_claim_kind: 'temporary_password_rotation',
      credential_reconciliation_review_after: '2099-07-21T00:15:00Z',
    }])

    renderPage()

    expect(await screen.findByText(/credential reconciliation is pending until/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /issue new temporary password/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeDisabled()
  })

  it('resets an active workspace owner password directly from the owner account list', async () => {
    const activeOwner = {
      ...manualUser,
      status: 'active' as const,
      provisioning_method: 'email_invite' as const,
      password_change_required: false,
      invite_expires_at: null,
      accepted_at: '2026-07-22T00:00:00Z',
    }
    mockedList.mockResolvedValue([activeOwner])
    mockedResetOwnerPassword.mockResolvedValue({
      member: {
        id: activeOwner.id,
        email: activeOwner.email,
        full_name: activeOwner.full_name,
        role: 'owner',
        status: 'invited',
        setup_method: 'admin_temporary_password',
        invited_at: '2026-07-23T00:00:00Z',
        invite_expires_at: '2026-07-24T00:00:00Z',
        accepted_at: null,
        suspended_at: null,
        pending_review: false,
        allowed_actions: ['reset_password'],
      },
      email: activeOwner.email,
      temporary_password: 'Tmp-Reset2345_Reset2345_Reset',
    })

    renderPage()

    expect(await screen.findByRole('link', { name: 'Manage users' })).toHaveAttribute(
      'href',
      '/app/workspaces/22222222-2222-4222-8222-222222222222/settings',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    const confirmation = screen.getByRole('dialog')
    expect(within(confirmation).getByText('Reset owner password?')).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetOwnerPassword).toHaveBeenCalledWith(
      activeOwner.workspace_id,
      activeOwner.id,
    ))
    const password = await screen.findByLabelText('Temporary password') as HTMLInputElement
    expect(password.type).toBe('password')
    expect(password.value).toBe('Tmp-Reset2345_Reset2345_Reset')
    expect(screen.getByText(/cannot access workspace data until this password is replaced at first sign-in/i)).toBeInTheDocument()
  })

  it('refreshes platform workspace state after a partial manual-create failure', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('Credential reconciliation is pending.'))
    const queryClient = renderPage()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    fireEvent.click(screen.getByRole('button', { name: /create workspace/i }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace & generate password' }))

    expect(await screen.findByText('Credential reconciliation is pending.')).toBeInTheDocument()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform'] })
  })

  it('requires confirmation before deleting a manual account', async () => {
    mockedList
      .mockResolvedValueOnce([manualUser])
      .mockResolvedValue([])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    expect(screen.getByText('Delete account?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith(
      manualUser.id,
      expect.any(String),
    ))
    expect(await screen.findByText('No workspace accounts')).toBeInTheDocument()
    expect(screen.queryByText(manualUser.email)).not.toBeInTheDocument()
  })

  it('offers only delete after an interrupted manual setup reaches review', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      user_id: null,
      status: 'provisioning',
      invite_reconciliation_pending: true,
      invite_reconciliation_claim_kind: 'deliver',
      invite_reconciliation_review_after: '2020-01-01T00:00:00Z',
    }])

    renderPage()

    expect(await screen.findByText(/manual setup cannot resume/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry manual setup/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeEnabled()
  })

  it('hides a settled deleted invitation from the workspace account list', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      status: 'revoked',
      provisioning_method: 'email_invite',
      password_change_required: false,
    }])

    renderPage()

    expect(await screen.findByText('No workspace accounts')).toBeInTheDocument()
    expect(screen.queryByText(manualUser.email)).not.toBeInTheDocument()
  })

  it('hides settled and unsafe revoked history while retaining live accounts', async () => {
    mockedList.mockResolvedValue([
      {
        ...manualUser,
        id: '41111111-1111-4111-8111-111111111111',
        email: 'settled-manual@example.com',
        status: 'revoked',
        password_change_required: false,
      },
      {
        ...manualUser,
        id: '51111111-1111-4111-8111-111111111111',
        email: 'credential-incident@example.com',
        status: 'revoked',
        password_change_required: false,
        credential_reconciliation_pending: true,
        credential_reconciliation_claim_kind: 'temporary_password_rotation',
      },
      {
        ...manualUser,
        id: '61111111-1111-4111-8111-111111111111',
        email: 'delivery-incident@example.com',
        status: 'revoked',
        password_change_required: false,
        invite_reconciliation_pending: true,
        invite_reconciliation_claim_kind: 'deliver',
      },
      {
        ...manualUser,
        id: '71111111-1111-4111-8111-111111111111',
        email: 'superseded-cleanup@example.com',
        status: 'revoked',
        password_change_required: false,
        invite_reconciliation_pending: true,
        invite_reconciliation_claim_kind: 'revoke_cleanup',
        invite_cleanup_blocked: true,
        has_newer_membership: true,
      },
      {
        ...manualUser,
        id: '81111111-1111-4111-8111-111111111111',
        email: 'live-owner@example.com',
      },
    ])

    renderPage()

    expect(await screen.findByText('live-owner@example.com')).toBeInTheDocument()
    expect(screen.queryByText('settled-manual@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('credential-incident@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('delivery-incident@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('superseded-cleanup@example.com')).not.toBeInTheDocument()
  })

  it('keeps provider reconciliation controls out of the admin UX', async () => {
    mockedList.mockResolvedValue([
      {
        ...manualUser,
        status: 'active',
        password_change_required: false,
      },
      {
        ...manualUser,
        id: '91111111-1111-4111-8111-111111111111',
        user_id: '93333333-3333-4333-8333-333333333333',
        email: 'suspended-owner@example.com',
        status: 'suspended',
        password_change_required: false,
      },
    ])

    renderPage()

    expect(await screen.findByText('suspended-owner@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verify auth/i })).not.toBeInTheDocument()
  })

  it('hides interrupted invitation deletion from the account UX', async () => {
    mockedList.mockResolvedValue([{
      ...manualUser,
      status: 'revoked',
      provisioning_method: 'email_invite',
      password_change_required: false,
      invite_reconciliation_pending: true,
      invite_reconciliation_claim_kind: 'revoke_cleanup',
      invite_reconciliation_review_after: '2099-07-21T00:15:00Z',
    }])

    renderPage()

    expect(await screen.findByText('No workspace accounts')).toBeInTheDocument()
    expect(screen.queryByText(manualUser.email)).not.toBeInTheDocument()
    expect(screen.queryByText(/operator review/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })
})
