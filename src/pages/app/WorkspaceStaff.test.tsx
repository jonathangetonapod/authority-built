import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'
import { useAuth } from '@/contexts/AuthContext'
import {
  createWorkspaceStaffTemporaryPassword,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  resetWorkspaceStaffTemporaryPassword,
  retryWorkspaceStaffTemporaryPassword,
  removeWorkspaceLogo,
  updateWorkspaceBookingLink,
  updateWorkspaceClientBranding,
  updateWorkspaceLogo,
  updateWorkspaceName,
  updateWorkspaceStaffRole,
  type WorkspaceStaffMember,
  type WorkspaceStaffView,
  getWorkspaceBillingOverview,
  getWorkspaceAiKeys,
  grantWorkspaceCredits,
} from '@/services/workspaceStaff'

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}))
vi.mock('@/services/workspaceStaff', () => ({
  createWorkspaceStaffTemporaryPassword: vi.fn(),
  getWorkspaceAiKeys: vi.fn(),
  setWorkspaceAiKey: vi.fn(),
  clearWorkspaceAiKey: vi.fn(),
  getWorkspaceBillingOverview: vi.fn(),
  grantWorkspaceCredits: vi.fn(),
  inviteWorkspaceStaff: vi.fn(),
  listWorkspaceStaff: vi.fn(),
  mutateWorkspaceStaff: vi.fn(),
  resetWorkspaceStaffTemporaryPassword: vi.fn(),
  retryWorkspaceStaffTemporaryPassword: vi.fn(),
  removeWorkspaceLogo: vi.fn(),
  updateWorkspaceBookingLink: vi.fn().mockResolvedValue(undefined),
  updateWorkspaceClientBranding: vi.fn(),
  updateWorkspaceLogo: vi.fn(),
  updateWorkspaceName: vi.fn(),
  updateWorkspaceStaffRole: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedCreatePassword = vi.mocked(createWorkspaceStaffTemporaryPassword)
const mockedInvite = vi.mocked(inviteWorkspaceStaff)
const mockedList = vi.mocked(listWorkspaceStaff)
const mockedMutate = vi.mocked(mutateWorkspaceStaff)
const mockedResetPassword = vi.mocked(resetWorkspaceStaffTemporaryPassword)
const mockedRetryPassword = vi.mocked(retryWorkspaceStaffTemporaryPassword)
const mockedRemoveLogo = vi.mocked(removeWorkspaceLogo)
const mockedUpdateClientBrand = vi.mocked(updateWorkspaceClientBranding)
const mockedUpdateLogo = vi.mocked(updateWorkspaceLogo)
const mockedUpdateWorkspaceName = vi.mocked(updateWorkspaceName)
const mockedUpdateRole = vi.mocked(updateWorkspaceStaffRole)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const ownerId = '44444444-4444-4444-8444-444444444444'
const adminId = '55555555-5555-4555-8555-555555555555'
const invitedAt = '2026-07-22T00:00:00.000Z'
const temporaryPassword = `Tmp-Aa2-${'b'.repeat(20)}`

const owner: WorkspaceStaffMember = {
  id: ownerId,
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  setup_method: 'admin_temporary_password',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:10:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: [],
}

const admin: WorkspaceStaffMember = {
  id: adminId,
  email: 'admin@example.com',
  full_name: 'Agency Admin',
  role: 'admin',
  status: 'active',
  setup_method: 'email_invite',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:20:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: ['reset_password', 'update_role', 'transfer_owner', 'suspend', 'revoke'],
}

const ownerView: WorkspaceStaffView = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    updated_at: '2026-07-22T00:25:00.000Z',
    status: 'active',
    is_default: false,
    logo_path: null,
    logo_updated_at: null,
    client_brand_name: 'Acme Agency',
    client_brand_primary_color: '#0D1B2A',
    client_brand_accent_color: '#C7794F',
    booking_embed_url: null,
    client_brand_updated_at: '2026-07-22T00:30:00.000Z',
  },
  capabilities: {
    read_only: false,
    invite_roles: ['admin', 'member'],
    can_generate_password: true,
    can_manage_branding: true,
    can_manage_client_branding: true,
    can_manage_workspace_name: true,
    can_update_roles: true,
    can_transfer_owner: true,
  },
  members: [owner, admin],
}

const refreshAccount = vi.fn()
const refreshSession = vi.fn()
const signOut = vi.fn()

function renderPage(platformWorkspaceId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          platformWorkspaceId
            ? `/app/workspaces/${platformWorkspaceId}/settings`
            : '/app/settings',
        ]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceStaff platformWorkspaceId={platformWorkspaceId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceAiKeys).mockResolvedValue({
      anthropic: { configured: false, last_four: null, updated_at: null },
      openai: { configured: false, last_four: null, updated_at: null },
      winnr: { configured: false, last_four: null, updated_at: null },
    })
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      plan_key: 'founding_member',
      billing_status: 'trialing',
      base_price_cents: 3900,
      per_client_price_cents: 3900,
      included_active_clients: 1,
      monthly_credit_allowance: 25,
      enforcement_enabled: false,
      balance: 10,
      expiring_credits: 0,
      next_expiry_at: null,
      usage_this_month: {},
      prices: {},
      recent_activity: [],
    })
    vi.mocked(grantWorkspaceCredits).mockResolvedValue({ granted: 100, balance: 110 })
    refreshAccount.mockResolvedValue(true)
    refreshSession.mockResolvedValue(true)
    signOut.mockResolvedValue(undefined)
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
      workspace: {
        id: workspaceId,
        name: 'Acme Workspace',
        slug: 'acme-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { id: ownerId, full_name: 'Workspace Owner', role: 'owner' },
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue(ownerView)
    mockedInvite.mockResolvedValue({
      ...admin,
      role: 'member',
      status: 'invited',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: ['revoke'],
    })
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      setup_method: 'admin_temporary_password',
      status: 'invited',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    mockedCreatePassword.mockResolvedValue({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    mockedRetryPassword.mockResolvedValue({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    mockedResetPassword.mockResolvedValue({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    mockedUpdateLogo.mockResolvedValue({
      id: workspaceId,
      logo_path: `${workspaceId}/66666666-6666-4666-8666-666666666666.png`,
      logo_updated_at: '2026-07-22T01:00:00.000Z',
    })
    mockedRemoveLogo.mockResolvedValue({ id: workspaceId, logo_path: null, logo_updated_at: null })
    mockedUpdateClientBrand.mockResolvedValue({
      id: workspaceId,
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#16324F',
      client_brand_accent_color: '#E07A5F',
      client_brand_updated_at: '2026-07-22T01:05:00.000Z',
    })
    mockedUpdateWorkspaceName.mockResolvedValue({
      id: workspaceId,
      name: 'Northstar Workspace',
      updated_at: '2026-07-22T01:04:00.000Z',
    })
    mockedMutate.mockResolvedValue({ ...admin, role: 'owner', allowed_actions: [] })
    mockedUpdateRole.mockResolvedValue({ ...admin, role: 'member' })
  })

  it('takes a pasted scheduler link and says it will load on the page', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'https://calendly.com/agency/intro' } })
    expect(screen.getByText(/Calendly loads on the page itself/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save link' }))
    await waitFor(() => expect(vi.mocked(updateWorkspaceBookingLink)).toHaveBeenCalledWith(
      workspaceId,
      'https://calendly.com/agency/intro',
    ))
  })

  it('accepts the embed block a scheduler puts on the clipboard', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, {
      target: {
        value: '<script>Cal("init", "30min", {origin:"https://app.cal.com"});'
          + ' Cal.ns["30min"]("inline", { calLink: "agency/30min" });</script>',
      },
    })

    // The link is taken out of the snippet rather than the paste refused.
    expect(screen.getByText(/Saving https:\/\/cal\.com\/agency\/30min/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }))
    await waitFor(() => expect(vi.mocked(updateWorkspaceBookingLink)).toHaveBeenCalledWith(
      workspaceId,
      'https://cal.com/agency/30min',
    ))
  })

  it('says a link it cannot frame will open in a new tab instead of refusing it', async () => {
    renderPage()

    const field = await screen.findByLabelText('Booking link or embed code')
    fireEvent.change(field, { target: { value: 'https://book.example.com/agency' } })

    expect(screen.getByText(/opens in a new tab/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save link' })).not.toBeDisabled()
  })

  it('renders the owner roster and only server-authorized controls for the signed-in workspace', async () => {
    renderPage()

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-settings-page')).toHaveClass('min-w-0', 'max-w-full')
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(settingsNavigation).getByRole('link', { name: /General/ })).toHaveAttribute('href', '#workspace-general')
    expect(within(settingsNavigation).getByRole('link', { name: /Sidebar/ })).toHaveAttribute('href', '#sidebar-navigation')
    expect(within(settingsNavigation).getByRole('link', { name: /Client branding/ })).toHaveAttribute('href', '#client-branding')
    expect(within(settingsNavigation).getByRole('link', { name: /Team & access/ })).toHaveAttribute('href', '#workspace-access')
    expect(within(settingsNavigation).getByRole('link', { name: /Billing/ })).toHaveAttribute('href', '/app/settings/billing')
    expect(within(settingsNavigation).queryByRole('link', { name: /^Credits/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'General', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sidebar navigation', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Client-facing brand', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workspace users', level: 2 })).toBeInTheDocument()
    expect(screen.getByLabelText('Primary color')).toHaveClass('min-w-0', 'flex-1')
    expect(screen.getByRole('table')).toHaveClass('min-w-[52rem]')
    expect(screen.getByText('Manage the people who can access your workspace.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /make owner/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /suspend/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /remove/i })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Change role for admin@example.com' })).toBeEnabled()
    expect(screen.getByText('Protected owner')).toBeInTheDocument()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('lets only the signed-in workspace owner launch their sidebar organizer', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Organize sidebar' }))

    const navigation = screen.getByRole('navigation', { name: 'Workspace navigation' })
    expect(within(navigation).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    expect(within(navigation).getAllByRole('button', { name: /^Drag /u })).toHaveLength(12)
  })

  it('lets the workspace owner change the private workspace name and public client brand independently', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Northstar Workspace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save workspace name' }))
    await waitFor(() => expect(mockedUpdateWorkspaceName).toHaveBeenCalledWith(workspaceId, {
      name: 'Northstar Workspace',
      expected_updated_at: '2026-07-22T00:25:00.000Z',
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Workspace name updated.'))

    fireEvent.change(screen.getByLabelText('Agency name shown to clients'), { target: { value: 'Northstar Advisory' } })
    fireEvent.change(screen.getByLabelText('Primary color'), { target: { value: '#16324F' } })
    fireEvent.change(screen.getByLabelText('Accent color'), { target: { value: '#E07A5F' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save client brand' }))

    await waitFor(() => expect(mockedUpdateClientBrand).toHaveBeenCalledWith(workspaceId, {
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#16324F',
      client_brand_accent_color: '#E07A5F',
      expected_brand_updated_at: '2026-07-22T00:30:00.000Z',
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Client-facing brand updated.'))
  })

  it('invites through the authenticated workspace and its allowed default role', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: 'New Teammate' } })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send invitation' }))

    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith(workspaceId, {
      email: 'new@example.com',
      full_name: 'New Teammate',
      role: 'admin',
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Workspace invitation sent.'))
  })

  // The hidden file field was the styled Input, whose base classes carry
  // h-10 w-full. tailwind-merge does not treat sr-only as conflicting with a
  // width, so both survived: the field kept sr-only's position:absolute at a
  // full 774px and, with no positioned ancestor, anchored to the initial
  // containing block and stretched the document 260px past the viewport.
  // jsdom has no layout, so the classes are what can be asserted here.
  it('hides the logo field without giving it a width that widens the page', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    const field = screen.getByLabelText('Workspace logo file')
    expect(field.tagName).toBe('INPUT')
    expect(field).toHaveClass('sr-only')
    // These are what sr-only's 1px box loses to.
    expect(field.className).not.toMatch(/\bw-full\b/)
    expect(field.className).not.toMatch(/\bh-10\b/)
  })

  it('uploads a workspace logo and refreshes the signed-in workspace shell', async () => {
    renderPage()
    await screen.findByText('Agency Admin')
    const file = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'agency.png',
      { type: 'image/png' },
    )

    fireEvent.change(screen.getByLabelText('Workspace logo file'), {
      target: { files: [file] },
    })

    await waitFor(() => expect(mockedUpdateLogo).toHaveBeenCalledWith(workspaceId, file, null))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Workspace logo updated.')
  })

  it('confirms and removes the current workspace logo', async () => {
    const logoPath = `${workspaceId}/66666666-6666-4666-8666-666666666666.png`
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: {
        ...ownerView.workspace,
        logo_path: logoPath,
        logo_updated_at: '2026-07-22T01:00:00.000Z',
      },
    })
    renderPage()
    await screen.findByText('Agency Admin')

    expect(screen.getByTestId('workspace-logo-settings')).toHaveClass('h-24', 'w-40', 'sm:h-28', 'sm:w-48')

    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove workspace logo?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove logo' }))

    await waitFor(() => expect(mockedRemoveLogo).toHaveBeenCalledWith(workspaceId, logoPath))
    await waitFor(() => expect(refreshAccount).toHaveBeenCalledTimes(1))
    expect(toastSuccess).toHaveBeenCalledWith('Workspace logo removed.')
  })

  it('generates a one-time password and requires confirmation before closing it', async () => {
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      email: 'new@example.com',
      full_name: 'New Teammate',
      status: 'invited',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    mockedCreatePassword.mockResolvedValueOnce({
      member: passwordMember,
      email: passwordMember.email,
      temporary_password: temporaryPassword,
    })
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const inviteDialog = screen.getByRole('dialog')
    fireEvent.change(within(inviteDialog).getByLabelText('Full name'), { target: { value: 'New Teammate' } })
    fireEvent.change(within(inviteDialog).getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(within(inviteDialog).getByLabelText('Sign-in setup'))
    fireEvent.click(await screen.findByRole('option', { name: 'Generate temporary password' }))
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Generate password' }))

    await waitFor(() => expect(mockedCreatePassword).toHaveBeenCalledWith(workspaceId, {
      email: 'new@example.com',
      full_name: 'New Teammate',
      role: 'admin',
    }))
    expect(mockedInvite).not.toHaveBeenCalled()

    const credentialDialog = await screen.findByRole('dialog', { name: 'Save the temporary password' })
    expect(within(credentialDialog).getByLabelText('Temporary password')).toHaveValue(temporaryPassword)
    expect(within(credentialDialog).getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.click(within(credentialDialog).getByRole('button', { name: 'Close' }))
    expect(await within(credentialDialog).findByRole('alert')).toHaveTextContent(
      'Confirm that you saved the one-time password before closing.',
    )
    fireEvent.click(within(credentialDialog).getByLabelText('I saved this password in a secure place.'))
    expect(within(credentialDialog).getByRole('button', { name: 'Done' })).toBeEnabled()
    fireEvent.click(within(credentialDialog).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save the temporary password' })).not.toBeInTheDocument())
  })

  it('can safely retry password generation for a pending password account', async () => {
    const pendingPassword: WorkspaceStaffMember = {
      ...admin,
      id: '66666666-6666-4666-8666-666666666666',
      email: 'password@example.com',
      full_name: 'Password User',
      role: 'member',
      status: 'provisioning',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: null,
      allowed_actions: ['retry_password', 'revoke'],
    }
    mockedList.mockResolvedValueOnce({ ...ownerView, members: [owner, admin, pendingPassword] })
    mockedRetryPassword.mockResolvedValueOnce({
      member: {
        ...pendingPassword,
        status: 'invited',
        invite_expires_at: '2026-07-29T00:00:00.000Z',
        allowed_actions: [],
      },
      email: pendingPassword.email,
      temporary_password: temporaryPassword,
    })
    renderPage()

    expect(await screen.findByText('Password User')).toBeInTheDocument()
    expect(screen.getByText('Password setup')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Generate password' }))

    await waitFor(() => expect(mockedRetryPassword).toHaveBeenCalledWith(workspaceId, pendingPassword.id))
    expect(await screen.findByRole('dialog', { name: 'Save the temporary password' })).toBeInTheDocument()
  })

  it('lets the workspace owner reset a user password and reveals the temporary password once', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Reset Agency Admin’s password?' })
    expect(within(confirmation).getByText(/current workspace sessions will stop working/i)).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetPassword).toHaveBeenCalledWith(workspaceId, adminId))
    const credentialDialog = await screen.findByRole('dialog', { name: 'Save the temporary password' })
    expect(within(credentialDialog).getByLabelText('Temporary password')).toHaveValue(temporaryPassword)
    expect(within(credentialDialog).getByText(/must replace the temporary password at first sign-in/i)).toBeInTheDocument()
  })

  it('confirms ownership transfer and refreshes the demoted owner session', async () => {
    renderPage()
    await screen.findByText('Agency Admin')

    fireEvent.click(screen.getByRole('button', { name: /make owner/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Transfer ownership to Agency Admin?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Your role changes to admin/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    await waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1))
    expect(refreshAccount).toHaveBeenCalledTimes(1)
    expect(signOut).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledWith('Workspace ownership transferred.')
  })

  it('gives the platform owner native management controls in the selected workspace', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue(ownerView)

    renderPage(workspaceId)

    expect(await screen.findByText('Agency Admin')).toBeInTheDocument()
    expect(screen.getByText('Manage the identity, client experience, credits, and team access for Acme Workspace.')).toBeInTheDocument()
    expect(screen.getByText('Manage the people who can access this workspace.')).toBeInTheDocument()
    const settingsNavigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(settingsNavigation).getByRole('link', { name: /^Credits/ })).toHaveAttribute('href', '#workspace-credits')
    const creditsSection = screen.getByRole('region', { name: 'Workspace credits' })
    expect(within(creditsSection).getByText('Live · grants apply immediately')).toBeInTheDocument()
    // Named after the workspace rather than the owner: a workspace called after
    // the person who owns it turned "granted to X, not to this person" into a
    // sentence that contradicted the card above it.
    expect(within(creditsSection).getByText(/credits belong to the workspace, not to whoever owns it today/i)).toBeInTheDocument()
    await waitFor(() => expect(within(creditsSection).getByLabelText('10 credits available')).toBeInTheDocument())
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sidebar navigation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Organize sidebar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /invite user/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /make owner/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^suspend$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByText('platform@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/settings`,
    )

    fireEvent.click(screen.getByRole('button', { name: /invite user/i }))
    const inviteDialog = screen.getByRole('dialog')
    fireEvent.change(within(inviteDialog).getByLabelText('Full name'), { target: { value: 'Platform Invite' } })
    fireEvent.change(within(inviteDialog).getByLabelText('Email'), { target: { value: 'platform-invite@example.com' } })
    fireEvent.click(within(inviteDialog).getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(mockedInvite).toHaveBeenCalledWith(workspaceId, {
      email: 'platform-invite@example.com',
      full_name: 'Platform Invite',
      role: 'admin',
    }))

    fireEvent.click(screen.getByRole('button', { name: /make owner/i }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/current workspace owner becomes an admin/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Transfer ownership' }))

    await waitFor(() => expect(mockedMutate).toHaveBeenCalledWith(workspaceId, adminId, 'transfer_owner'))
    expect(refreshSession).not.toHaveBeenCalled()
    expect(refreshAccount).not.toHaveBeenCalled()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('previews a manual credit grant with an explicit reason, note, and confirmation', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)

    renderPage(workspaceId)

    const creditsSection = await screen.findByRole('region', { name: 'Workspace credits' })
    const reviewButton = within(creditsSection).getByRole('button', { name: 'Review credit grant' })
    expect(reviewButton).toBeDisabled()

    fireEvent.click(within(creditsSection).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    // The reason alone arms the grant: a written justification on every top-up
    // was friction the audit row did not need, so the note is optional now.
    expect(reviewButton).toBeEnabled()

    fireEvent.change(within(creditsSection).getByLabelText(/Internal note/), {
      target: { value: 'Onboarding courtesy for the new workspace.' },
    })
    expect(reviewButton).toBeEnabled()
    fireEvent.click(reviewButton)

    const confirmation = screen.getByRole('alertdialog', { name: 'Add 100 credits to Acme Workspace?' })
    expect(within(confirmation).getByText('Workspace Owner')).toBeInTheDocument()
    expect(within(confirmation).getByText('Customer support')).toBeInTheDocument()
    expect(within(confirmation).getByText('Onboarding courtesy for the new workspace.')).toBeInTheDocument()
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Add credits' }))

    expect(await within(creditsSection).findByText('Granted by platform@example.com')).toBeInTheDocument()
    expect(within(creditsSection).getByText('Balance 110')).toBeInTheDocument()
    expect(within(creditsSection).getByText('+100 credits')).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith('100 credits added to Acme Workspace.')
  })

  // A workspace whose owner was invited the ordinary way and has not signed in
  // yet has no owner row to name. The credit still goes to the workspace
  // ledger, and the billing page's own top-up grants without one, so hiding the
  // card here gave the same admin two answers for the same workspace.
  it('still offers the grant for a workspace with no owner on the roster', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue({ ...ownerView, members: [{ ...admin, allowed_actions: [] }] })

    renderPage(workspaceId)

    const creditsSection = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(within(creditsSection).getByText('Nobody has accepted the invite yet')).toBeInTheDocument()
    fireEvent.click(within(creditsSection).getByRole('combobox', { name: 'Reason' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Customer support' }))
    expect(within(creditsSection).getByRole('button', { name: 'Review credit grant' })).toBeEnabled()
  })

  // The balance used to fall back to 0 when the read failed, and there are no
  // retries. An admin who topped this workspace up an hour ago would read the
  // 0 as the grant never landing, and grant a second time.
  it('does not report a balance of zero when the balance could not be read', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    vi.mocked(getWorkspaceBillingOverview).mockRejectedValue(new Error('Billing data could not be loaded.'))

    renderPage(workspaceId)

    const creditsSection = await screen.findByRole('region', { name: 'Workspace credits' })
    expect(await within(creditsSection).findByText('Unavailable')).toBeInTheDocument()
    expect(within(creditsSection).queryByLabelText('0 credits available')).not.toBeInTheDocument()
    // And no projection is offered off a balance nobody knows.
    expect(within(creditsSection).getByText(/could not be read, so this cannot be projected/i)).toBeInTheDocument()
  })

  it('lets the platform owner reset the selected workspace owner without exposing an old password', async () => {
    const resettableOwner: WorkspaceStaffMember = { ...owner, allowed_actions: ['reset_password'] }
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue({ ...ownerView, members: [resettableOwner, admin] })
    mockedResetPassword.mockResolvedValue({
      member: {
        ...owner,
        status: 'invited',
        invite_expires_at: '2026-07-30T00:00:00.000Z',
        accepted_at: owner.accepted_at,
        allowed_actions: [],
      },
      email: owner.email,
      temporary_password: temporaryPassword,
    })

    renderPage(workspaceId)
    const teamTable = await screen.findByRole('table')
    const ownerRow = within(teamTable).getByText('Workspace Owner').closest('tr')
    expect(ownerRow).not.toBeNull()
    fireEvent.click(within(ownerRow as HTMLElement).getByRole('button', { name: 'Reset password' }))
    const confirmation = screen.getByRole('alertdialog', { name: 'Reset Workspace Owner’s password?' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Reset password' }))

    await waitFor(() => expect(mockedResetPassword).toHaveBeenCalledWith(workspaceId, ownerId))
    expect(await screen.findByRole('dialog', { name: 'Save the temporary password' })).toBeInTheDocument()
  })

  it('shows how long an invite has gone unclaimed, not just that it is pending', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000).toISOString()
    mockedList.mockResolvedValue({
      ...ownerView,
      members: [
        owner,
        {
          ...admin,
          id: '44444444-4444-4444-8444-444444444444',
          email: 'stalled@example.com',
          full_name: 'Stalled Owner',
          status: 'invited',
          setup_method: 'admin_temporary_password',
          invited_at: fiveDaysAgo,
          accepted_at: null,
        },
      ],
    })
    renderPage()

    // A temporary password is handed over by a person, so it can simply never
    // arrive. "Password change required" read the same on day one and day five.
    expect(await screen.findByText(/Never signed in · 5 days ago/)).toBeInTheDocument()
  })

  it('leaves a member who has signed in unmarked', async () => {
    mockedList.mockResolvedValue({ ...ownerView, members: [owner, admin] })
    renderPage()

    await screen.findByText('Workspace Owner')
    expect(screen.queryByText(/Never signed in/)).not.toBeInTheDocument()
  })

  it('fails closed when selected-workspace data names a different workspace', async () => {
    mockedList.mockResolvedValue({
      ...ownerView,
      workspace: {
        ...ownerView.workspace,
        id: otherWorkspaceId,
        name: 'Other Workspace',
      },
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace settings unavailable')).toBeInTheDocument()
    expect(screen.getByText('The workspace staff response did not match the selected workspace.')).toBeInTheDocument()
    expect(mockedInvite).not.toHaveBeenCalled()
    expect(mockedMutate).not.toHaveBeenCalled()
  })

  it('identifies a stale read-only backend without blaming the platform-owner session', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'platform@example.com' },
      workspace: null,
      membership: null,
      isPlatformAdmin: true,
      refreshAccount,
      refreshSession,
      signOut,
    } as never)
    mockedList.mockResolvedValue({
      ...ownerView,
      capabilities: {
        read_only: true,
        invite_roles: [],
        can_generate_password: false,
        can_manage_branding: false,
        can_manage_client_branding: false,
        can_manage_workspace_name: false,
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    })

    renderPage(workspaceId)

    expect(await screen.findByText('Workspace settings unavailable')).toBeInTheDocument()
    expect(screen.getByText('Platform-owner workspace management is not active on the backend yet.')).toBeInTheDocument()
    expect(screen.queryByText(/did not match the signed-in account/i)).not.toBeInTheDocument()
  })

  it('does not call the service for an invalid selected workspace address', async () => {
    renderPage('not-a-workspace')

    expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument()
    expect(mockedList).not.toHaveBeenCalled()
  })

  describe('on the default platform workspace', () => {
    const platformView: WorkspaceStaffView = {
      ...ownerView,
      workspace: { ...ownerView.workspace, is_default: true, name: 'Get On A Pod' },
      capabilities: {
        ...ownerView.capabilities,
        invite_roles: [],
        can_update_roles: false,
        can_transfer_owner: false,
      },
      members: [
        { ...owner, allowed_actions: [] },
        { ...admin, allowed_actions: [] },
      ],
    }

    beforeEach(() => {
      mockedUseAuth.mockReturnValue({
        user: { id: userId, email: 'owner@example.com', user_metadata: { full_name: 'Workspace Owner' } },
        workspace: {
          id: workspaceId,
          name: 'Get On A Pod',
          slug: 'get-on-a-pod',
          status: 'active',
          is_default: true,
        },
        isPlatformAdmin: true,
        membership: { id: ownerId, full_name: 'Workspace Owner', role: 'owner' },
        refreshAccount,
        refreshSession,
        signOut,
      } as never)
      mockedList.mockResolvedValue(platformView)
    })

    it('lets the platform workspace set its own client-facing brand', async () => {
      renderPage()
      // The workspace runs real clients, so the identity its prospects see is
      // its own to set rather than a platform default.
      expect(await screen.findByRole('heading', { name: 'Client-facing brand' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    })

    it('sends the platform roster to the platform tools instead of offering an invite', async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Workspace users' })
      expect(screen.queryByRole('button', { name: /Invite user/ })).not.toBeInTheDocument()
      const links = screen.getAllByRole('link', { name: /Manage workspaces/ })
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) expect(link).toHaveAttribute('href', '/app/manage-workspaces')
    })

    it('offers no action on a platform operator account', async () => {
      renderPage()
      await screen.findByRole('heading', { name: 'Workspace users' })
      // Staff mutations are refused at the SQL root for this workspace, so a
      // button here would be a promise the database will not keep.
      expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument()
    })
  })
})
