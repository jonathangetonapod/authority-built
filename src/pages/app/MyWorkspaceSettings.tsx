import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'

const MyWorkspaceSettings = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, membership } = useAuth()

  // A platform admin who also owns a workspace gets the normal workspace
  // settings here; the platform tools live at /app/manage-workspaces.
  const managesOwnWorkspace = canManageWorkspaceStaff
    || membership?.role === 'owner'
    || membership?.role === 'admin'
  if (managesOwnWorkspace) return <WorkspaceStaff />
  if (isPlatformAdmin) return <WorkspaceUsers />
  return <Navigate to="/app/clients" replace />
}

export default MyWorkspaceSettings
