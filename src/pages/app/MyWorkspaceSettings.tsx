import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'

const MyWorkspaceSettings = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, membership, workspace } = useAuth()

  // A platform admin who also owns a private workspace gets the normal
  // workspace settings here; the platform tools live at
  // /app/manage-workspaces. The default platform workspace has no staff
  // settings surface — its RPCs reject the default workspace by design —
  // so its owner falls through to the platform tools.
  const managesOwnWorkspace = canManageWorkspaceStaff
    || membership?.role === 'owner'
    || membership?.role === 'admin'
  const onDefaultWorkspace = Boolean(workspace?.is_default)
  if (managesOwnWorkspace && !onDefaultWorkspace) return <WorkspaceStaff />
  if (isPlatformAdmin) return <WorkspaceUsers />
  return <Navigate to="/app/clients" replace />
}

export default MyWorkspaceSettings
