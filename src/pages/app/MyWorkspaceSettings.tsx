import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'
import WorkspaceStaff from '@/pages/app/WorkspaceStaff'

const MyWorkspaceSettings = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, membership, workspace } = useAuth()

  // Everyone who manages a workspace gets the normal workspace settings here,
  // including a platform admin on the default workspace: it runs real clients,
  // so its name, client-facing brand, logo, and booking link are its own to
  // set. The platform tools — creating workspaces and managing each tenant
  // owner's access — live at /app/manage-workspaces, which is a different job.
  const managesOwnWorkspace = canManageWorkspaceStaff
    || membership?.role === 'owner'
    || membership?.role === 'admin'
  if (managesOwnWorkspace || (isPlatformAdmin && workspace?.is_default)) return <WorkspaceStaff />
  if (isPlatformAdmin) return <WorkspaceUsers />
  return <Navigate to="/app/clients" replace />
}

export default MyWorkspaceSettings
