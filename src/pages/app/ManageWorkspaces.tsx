import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceUsers from '@/pages/admin/WorkspaceUsers'

// Platform tools: create workspaces and manage each owner's access. Kept
// separate from /app/settings so platform admins who also own a workspace
// still get the normal workspace settings there.
const ManageWorkspaces = () => {
  const { isPlatformAdmin } = useAuth()

  if (!isPlatformAdmin) return <Navigate to="/app/settings" replace />
  return <WorkspaceUsers />
}

export default ManageWorkspaces
